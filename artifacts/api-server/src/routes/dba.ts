// dba.ts — DBA (Doing Business As) sub-brands under white-label orgs.
//
// Storage: NO new Supabase tables are possible from this workspace (schema
// is frozen — see memory), so each DBA lives as an org-scoped admin_settings
// row: company_id = the org, key = `dba:<id>`, value = JSON record:
//   { id, name, slug, coach_id, coach_name, logo_url, brand_color,
//     brand_colors, is_active, created_at, members:[{id,email,name,added_at}] }
// All reads/writes go through this server (service key) so coach/admin
// scoping is enforced here, and the public brand endpoint works pre-auth.
//
// Endpoints (registered WITHOUT /api — the platform proxy strips it):
//   GET  /dba/brand?slug=   public — branding for the DBA login page
//   GET  /dba/list          admin  — all DBAs in the caller's org (+allowed flag)
//   POST /dba/save          admin  — create/update a DBA (branding, coach, slug)
//   POST /dba/archive       admin  — archive / restore a DBA
//   POST /dba/member-add    admin  — invite a member (provisions login + email)
//   POST /dba/member-remove admin  — remove a member from the DBA
//   GET  /dba/mine          any authenticated user — DBAs they belong to

import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { mailerConfigured, sendEmail, welcomeEmail, dbaAddedEmail } from "../lib/mailer";
import { requireAdminJwt, provisionAuthUser } from "./auth";
import { storeChatUpload, transcribeChatAudio, voiceMemosEnabled } from "./teamUpload";
import { dailyKeyForOrg } from "./huddle";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ID = "b0000000-0000-0000-0000-000000000001";

// ── HQ cross-org scope ────────────────────────────────────────────
// Eden (owner HQ) admins may act on any organization's DBAs by passing
// orgId (query for GETs, body for POSTs). Every other admin is locked to
// their own org — an orgId that isn't theirs is rejected outright.
const isHqAdmin = (a: { company_id: string | null }) => !a.company_id || a.company_id === EDEN_ID;
async function adminOrgScope(admin: { company_id: string | null }, req: Request): Promise<string | null> {
  const own = admin.company_id || EDEN_ID;
  const want = String((req.method === "GET" ? req.query.orgId : (req.body || {}).orgId) || "").trim();
  if (!want || want === own) return own;
  if (!isHqAdmin(admin)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(want)) return null;
  const rows = await rest<any>(`organizations?id=eq.${encodeURIComponent(want)}&is_active=eq.true&select=id`);
  return rows[0] ? want : null;
}

const SVC_H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Reserved URL segments that can never be a DBA slug (same set as org slugs)
const RESERVED_SLUGS = new Set(["video", "api", "__mockup", "eden"]);

async function rest<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SVC_H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}

// ── DBA record shape ─────────────────────────────────────────────
// pure=true → the profile was created BY the DBA invite (a member-only login,
// role 'client' in user_profiles since the role check constraint has no
// dba_member value; their "DBA member" identity lives in auth metadata +
// these member entries). pure=false/absent → an existing app user who was
// additionally given access to this DBA.
export type DbaMember = { id: string | null; email: string; name: string; added_at: string; pure?: boolean };
// Org staff/VAs the admin delegated into this DBA — they get full manage
// rights inside it (Phase 7 "admin oversight & staff delegation").
export type DbaDelegate = { id: string; name: string; email: string; granted_at: string; granted_by: string | null };
export type DbaLink = { id: string; title: string; url: string; desc: string | null };
export type DbaRecord = {
  id: string;
  name: string;
  slug: string;
  coach_id: string | null;
  coach_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  brand_colors: string[];
  is_active: boolean;
  created_at: string;
  members: DbaMember[];
  delegates: DbaDelegate[]; // org staff/VAs granted manage access into this DBA
  connect: DbaLink[]; // per-DBA Connect tab links
  learn_course_ids: string[]; // org/Eden course ids assigned to this DBA's Learn tab
};

function parseDba(value: any): DbaRecord | null {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    if (!v || !v.id || !v.slug) return null;
    return {
      id: String(v.id),
      name: String(v.name || ""),
      slug: String(v.slug),
      coach_id: v.coach_id || null,
      coach_name: v.coach_name || null,
      logo_url: v.logo_url || null,
      brand_color: v.brand_color || null,
      brand_colors: Array.isArray(v.brand_colors) ? v.brand_colors : [],
      is_active: v.is_active !== false,
      created_at: v.created_at || new Date().toISOString(),
      members: Array.isArray(v.members) ? v.members : [],
      delegates: Array.isArray(v.delegates) ? v.delegates.filter((d: any) => d && d.id) : [],
      connect: Array.isArray(v.connect) ? v.connect : [],
      learn_course_ids: Array.isArray(v.learn_course_ids) ? v.learn_course_ids.map(String) : [],
    };
  } catch {
    return null;
  }
}

/** All DBAs across every org: [{ companyId, dba }] */
async function loadAllDbas(): Promise<Array<{ companyId: string; dba: DbaRecord }>> {
  const rows = await rest("admin_settings?key=like.dba%3A*&select=company_id,key,value");
  const out: Array<{ companyId: string; dba: DbaRecord }> = [];
  for (const row of rows) {
    const dba = parseDba(row.value);
    if (dba) out.push({ companyId: String(row.company_id), dba });
  }
  return out;
}

async function loadOrgDbas(companyId: string): Promise<DbaRecord[]> {
  const rows = await rest(
    `admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=like.dba%3A*&select=value`,
  );
  return rows.map((r) => parseDba(r.value)).filter(Boolean) as DbaRecord[];
}

async function saveDbaRow(companyId: string, dba: DbaRecord): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba:${dba.id}`, value: JSON.stringify(dba) }),
  });
  return r.ok;
}

// ── In-process write serialization ───────────────────────────────
// admin_settings JSON rows have no DB-level locking, so concurrent
// read-modify-writes (member add/remove, save) could silently drop each
// other's changes. The api-server is a single process, so a per-key promise
// chain is enough to serialize them. Slug validation+create shares one
// global key so two simultaneous creates can't both claim the same slug.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  const settled = run.catch(() => {});
  locks.set(key, settled);
  void settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
  return run;
}

function sanitizeSlug(input: string): string {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Global slug check: reserved segments, every org slug, every DBA slug. */
async function slugTaken(slug: string, exceptDbaId?: string): Promise<string | null> {
  if (RESERVED_SLUGS.has(slug)) return "That link name is reserved — pick another.";
  const orgs = await rest(`organizations?slug=eq.${encodeURIComponent(slug)}&select=id`);
  if (orgs.length) return "That link name is already used by an organization.";
  const all = await loadAllDbas();
  const hit = all.find((x) => x.dba.slug === slug && x.dba.id !== exceptDbaId);
  if (hit) return "That link name is already used by another DBA.";
  return null;
}

// ── Tier gating ──────────────────────────────────────────────────
// Eden-level admin_settings key `dba_tiers` = array of package ids whose orgs
// may create DBAs. Never configured → default: package names containing "3"
// or "enterprise" (i.e. the top tier).
async function dbaAllowedForOrg(companyId: string): Promise<boolean> {
  if (companyId === EDEN_ID) return true;
  const orgs = await rest(`organizations?id=eq.${encodeURIComponent(companyId)}&select=plan,is_active`);
  const org = orgs[0];
  if (!org || org.is_active === false) return false;
  const plan = String(org.plan || "").toLowerCase();
  const pkgs = await rest(`packages?active=eq.true&select=id,name,price`);
  const pkg = pkgs.find((p) => String(p.name || "").toLowerCase() === plan);
  const cfgRows = await rest(`admin_settings?company_id=eq.${EDEN_ID}&key=eq.dba_tiers&select=value`);
  let allowedIds: string[] | null = null;
  try {
    const v = cfgRows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(arr)) allowedIds = arr.map(String);
  } catch {}
  if (allowedIds !== null) return !!pkg && allowedIds.includes(String(pkg.id));
  // Default (never configured): only the TOP tier — the highest-priced active
  // package — includes DBAs. Must match the Week6 packages-editor default.
  if (!pkg) return false;
  const top = pkgs.reduce((a, b) => (Number(b.price || 0) > Number(a.price || 0) ? b : a), pkgs[0]);
  return String(pkg.id) === String(top?.id);
}

// ── Authenticated (non-admin) caller → profile ───────────────────
async function requireUserJwt(req: Request): Promise<{ id: string; email: string; name: string | null; role: string; company_id: string | null } | null> {
  const auth = String(req.get("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const user: any = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await rest(
    `user_profiles?email=eq.${encodeURIComponent(email)}&select=id,email,name,role,company_id,is_active`,
  );
  const p = rows[0];
  if (!p || p.is_active === false) return null;
  return { id: p.id, email, name: p.name || null, role: p.role || "client", company_id: p.company_id || null };
}

/** Used by auth.ts reset-request: the first active DBA an email belongs to
 *  as a PURE member (their login exists only for the DBA). Existing app
 *  users who were merely added to a DBA keep their org's reset branding. */
export async function findDbaBrandForEmail(
  email: string,
): Promise<{ name: string; slug: string } | null> {
  const norm = email.toLowerCase();
  const all = await loadAllDbas();
  const hit = all.find(
    (x) => x.dba.is_active && x.dba.members.some((m) => m.pure === true && m.email.toLowerCase() === norm),
  );
  return hit ? { name: hit.dba.name, slug: hit.dba.slug } : null;
}

/** Public shape for login-page branding (no member data ever leaves here). */
function publicBrand(dba: DbaRecord, org: any) {
  return {
    id: dba.id,
    name: dba.name,
    slug: dba.slug,
    logo_url: dba.logo_url,
    brand_color: dba.brand_color,
    brand_colors: dba.brand_colors,
    org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    __dba: true,
  };
}

const router: IRouter = Router();

// ── Public: DBA login branding ────────────────────────────────────
router.get("/dba/brand", async (req: Request, res: Response) => {
  const slug = sanitizeSlug(String(req.query.slug || ""));
  if (!slug) return res.status(400).json({ ok: false, error: "slug required" });
  const all = await loadAllDbas();
  const hit = all.find((x) => x.dba.slug === slug && x.dba.is_active);
  if (!hit) return res.status(404).json({ ok: false, error: "Not found" });
  const orgs = await rest(`organizations?id=eq.${encodeURIComponent(hit.companyId)}&select=id,name,slug,is_active`);
  if (orgs[0]?.is_active === false) return res.status(404).json({ ok: false, error: "Not found" });
  return res.json({ ok: true, dba: publicBrand(hit.dba, orgs[0] || null) });
});

// ── Public: per-DBA PWA manifest ──────────────────────────────────
// GET /dba/manifest?slug=<slug> — a real same-origin manifest so a phone
// install from a DBA link saves an icon that reopens /<slug> with the DBA's
// branding (blob/data manifests can't establish Chrome's install scope).
// Never 404s: unknown slugs fall back to the Eden default so installability
// is never broken. Icon/start_url paths are absolute (manifest lives under
// /api/, the app at /).
router.get("/dba/manifest", async (req: Request, res: Response) => {
  const slug = sanitizeSlug(String(req.query.slug || ""));
  // Optional frontend base path (Vite BASE_URL) so start_url/scope/icons stay
  // inside the deployed app when it isn't served at the site root.
  const rawBase = String(req.query.base || "/");
  const p = /^\/[a-zA-Z0-9\-_/]*$/.test(rawBase) ? rawBase.replace(/\/+$/, "") : "";
  const edenDefault = {
    name: "Eden Communications",
    short_name: "Eden Comms",
    description: "The private platform for Lifestyle of Eden coaches and clients",
    start_url: `${p}/`,
    scope: `${p}/`,
    display: "standalone",
    background_color: "#000000",
    theme_color: "#ffa600",
    orientation: "portrait",
    icons: [
      { src: `${p}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `${p}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
  res.setHeader("Content-Type", "application/manifest+json");
  res.setHeader("Cache-Control", "public, max-age=300");
  if (!slug) return res.json(edenDefault);
  const all = await loadAllDbas();
  const hit = all.find((x) => x.dba.slug === slug && x.dba.is_active);
  if (!hit) return res.json(edenDefault);
  const d = hit.dba;
  const logoOk = typeof d.logo_url === "string" && /^https?:\/\//i.test(d.logo_url);
  return res.json({
    name: d.name,
    short_name: d.name.length > 12 ? d.name.slice(0, 12) : d.name,
    description: `The private space for ${d.name} members`,
    start_url: `${p}/${d.slug}`,
    scope: `${p}/`,
    display: "standalone",
    background_color: "#000000",
    theme_color: d.brand_color || "#ffa600",
    orientation: "portrait",
    icons: [
      ...(logoOk ? [{ src: d.logo_url, sizes: "512x512", type: "image/png", purpose: "any" }] : []),
      ...edenDefault.icons,
    ],
  });
});

// ── Admin: list org DBAs ──────────────────────────────────────────
router.get("/dba/list", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (admin) {
    const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
    const [allowed, dbas] = await Promise.all([dbaAllowedForOrg(companyId), loadOrgDbas(companyId)]);
    return res.json({ ok: true, allowed, scope: "org", dbas: dbas.sort((a, b) => a.created_at.localeCompare(b.created_at)) });
  }
  // Non-admin staff (coach, head coach, VA…): only the DBAs they run or were
  // delegated into. Clients / DBA-member logins get nothing here.
  const me = await requireUserJwt(req);
  if (!me || me.role === "client" || me.role === "dba_member") {
    return res.status(403).json({ ok: false, error: "Not authorized" });
  }
  const companyId = me.company_id || EDEN_ID;
  const dbas = (await loadOrgDbas(companyId)).filter(
    (d) => d.coach_id === me.id || (d.delegates || []).some((g) => g.id === me.id),
  );
  return res.json({ ok: true, allowed: dbas.length > 0, scope: "mine", dbas: dbas.sort((a, b) => a.created_at.localeCompare(b.created_at)) });
});

// ── Admin: org staff/coach roster for the DBA manager UI ─────────
// GET /dba/org-staff?orgId= — served here (service key) because frontend RLS
// blocks Eden HQ from reading another org's user_profiles directly.
router.get("/dba/org-staff", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const rows = await rest<any>(
    `user_profiles?company_id=eq.${encodeURIComponent(companyId)}&role=neq.client&is_active=not.is.false&select=id,name,role,email&order=name.asc`,
  );
  return res.json({
    ok: true,
    coaches: rows.filter((r: any) => ["coach", "head_coach", "super_admin"].includes(r.role)).map((r: any) => ({ id: r.id, name: r.name, role: r.role })),
    staff: rows.filter((r: any) => r.role !== "super_admin").map((r: any) => ({ id: r.id, name: r.name, role: r.role, email: r.email })),
  });
});

// ── Admin: delegate a staff member / VA into a DBA (or revoke) ────
// POST /dba/delegate-set {dbaId, userId, allowed} — org admin only. The
// person must be active org staff (any non-client role). While granted they
// can manage that DBA exactly like its coach.
router.post("/dba/delegate-set", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const { dbaId, userId, allowed } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const dba = (await loadOrgDbas(companyId)).find((d) => d.id === String(dbaId || ""));
    if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
    const rows = await rest<any>(
      `user_profiles?id=eq.${encodeURIComponent(String(userId || ""))}&company_id=eq.${encodeURIComponent(companyId)}&role=neq.client&is_active=not.is.false&select=id,name,full_name,email,role`,
    );
    const person = rows[0];
    if (!person) return res.status(404).json({ ok: false, error: "That person isn't on your team" });
    const name = person.name || person.full_name || "Staff member";
    const had = (dba.delegates || []).some((g) => g.id === person.id);
    if (allowed && !had) {
      dba.delegates = [
        ...(dba.delegates || []),
        { id: person.id, name, email: String(person.email || "").toLowerCase(), granted_at: new Date().toISOString(), granted_by: admin.id },
      ];
    } else if (!allowed && had) {
      dba.delegates = (dba.delegates || []).filter((g) => g.id !== person.id);
    } else {
      return res.json({ ok: true, delegates: dba.delegates || [] }); // nothing to change
    }
    if (!(await saveDbaRow(companyId, dba))) {
      return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    }
    await audit(admin, "dba_staff_access_changed", dba.id, {
      dba: dba.name,
      staff: name,
      access: allowed ? "granted" : "revoked",
      summary: allowed ? `Gave ${name} management access to ${dba.name}` : `Removed ${name}'s management access to ${dba.name}`,
    });
    return res.json({ ok: true, delegates: dba.delegates });
  });
});

// ── Admin: create / update a DBA ─────────────────────────────────
router.post("/dba/save", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  if (!(await dbaAllowedForOrg(companyId))) {
    return res.status(403).json({ ok: false, error: "DBAs aren't included in your current plan." });
  }
  return withLock("dba-write", async () => {
  const b = (req.body || {}) as Record<string, any>;
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "Name required" });

  const existing = b.id ? (await loadOrgDbas(companyId)).find((d) => d.id === b.id) : null;
  if (b.id && !existing) return res.status(404).json({ ok: false, error: "DBA not found" });

  const slug = sanitizeSlug(b.slug || name);
  if (!slug) return res.status(400).json({ ok: false, error: "A link name (slug) is required" });
  if (!existing || existing.slug !== slug) {
    const taken = await slugTaken(slug, existing?.id);
    if (taken) return res.status(409).json({ ok: false, error: taken });
  }

  // Coach must belong to this org (coach/head_coach/super_admin)
  let coachId: string | null = existing?.coach_id || null;
  let coachName: string | null = existing?.coach_name || null;
  if (b.coachId !== undefined) {
    if (b.coachId) {
      const rows = await rest(
        `user_profiles?id=eq.${encodeURIComponent(String(b.coachId))}&company_id=eq.${encodeURIComponent(companyId)}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,name`,
      );
      if (!rows[0]) return res.status(400).json({ ok: false, error: "That coach isn't part of your organization" });
      coachId = rows[0].id;
      coachName = rows[0].name || null;
    } else {
      coachId = null;
      coachName = null;
    }
  }

  const hex = (v: any) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null);
  const dba: DbaRecord = {
    id: existing?.id || randomUUID(),
    delegates: existing?.delegates || [],
    name,
    slug,
    coach_id: coachId,
    coach_name: coachName,
    logo_url: typeof b.logoUrl === "string" ? b.logoUrl.trim() || null : existing?.logo_url || null,
    brand_color: b.brandColor !== undefined ? hex(b.brandColor) : existing?.brand_color || null,
    brand_colors: Array.isArray(b.brandColors)
      ? (b.brandColors.map(hex).filter(Boolean) as string[]).slice(0, 5)
      : existing?.brand_colors || [],
    is_active: existing ? existing.is_active : true,
    created_at: existing?.created_at || new Date().toISOString(),
    members: existing?.members || [],
    connect: existing?.connect || [],
    learn_course_ids: existing?.learn_course_ids || [],
  };
  if (!(await saveDbaRow(companyId, dba))) {
    return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
  }
  void audit(admin, existing ? "dba_updated" : "dba_created", dba.id, { name: dba.name, slug: dba.slug, coach: dba.coach_name });
  logger.info({ adminId: admin.id, dbaId: dba.id, slug: dba.slug }, "[DBA] saved");
  return res.json({ ok: true, dba });
  });
});

// ── Admin: archive / restore ─────────────────────────────────────
router.post("/dba/archive", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const { id, active } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
  const dba = (await loadOrgDbas(companyId)).find((d) => d.id === id);
  if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
  dba.is_active = active !== false;
  if (!(await saveDbaRow(companyId, dba))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
  void audit(admin, dba.is_active ? "dba_restored" : "dba_archived", dba.id, { name: dba.name });
  return res.json({ ok: true, dba });
  });
});

// ── Admin: add a member (provisions a real login + branded email) ─
router.post("/dba/member-add", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const { dbaId } = (req.body || {}) as Record<string, any>;
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const name = String((req.body || {}).name || "").trim();
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
  if (!name) return res.status(400).json({ ok: false, error: "Name required" });

  return withLock("dba-write", async () => {
  const dba = (await loadOrgDbas(companyId)).find((d) => d.id === dbaId);
  if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
  if (!dba.is_active) return res.status(400).json({ ok: false, error: "This DBA is archived — restore it first" });
  if (dba.members.some((m) => m.email.toLowerCase() === email)) {
    return res.status(409).json({ ok: false, error: "That person is already a member of this DBA" });
  }

  // Existing profile anywhere (multi-DBA membership across orgs is allowed)
  const profRows = await rest(
    `user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,role,is_active`,
  );
  let profile = profRows[0] || null;
  if (profile && profile.is_active === false) {
    return res.status(400).json({ ok: false, error: "That account is deactivated — reactivate it first" });
  }

  let emailed = false;
  let existedLogin = !!profile;
  if (!profile) {
    // Brand-new person: profile + pre-confirmed login with a temp password
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "return=representation" },
      // user_profiles.id has no DB default — must supply one. Role must be
      // 'client' (the table's check constraint has no dba_member value);
      // their DBA-member identity lives in auth metadata + the member entry.
      body: JSON.stringify({ id: randomUUID(), email, name, role: "client", company_id: companyId }),
    });
    const created: any[] = ins.ok ? ((await ins.json().catch(() => [])) as any[]) : [];
    if (!created[0]) return res.status(502).json({ ok: false, error: "Couldn't create the member profile — try again" });
    profile = created[0];

    const tempPassword = genTempPassword();
    const prov = await provisionAuthUser(email, tempPassword, name, true, {
      company_id: companyId,
      intended_role: "dba_member",
    });
    if (!prov.ok) {
      // Roll the profile back so a retry starts clean
      await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${profile.id}`, { method: "DELETE", headers: SVC_H }).catch(() => {});
      return res.status(502).json({ ok: false, error: prov.error });
    }
    existedLogin = prov.existed;
    if (mailerConfigured() && !prov.existed) {
      const m = welcomeEmail({ clientName: name, email, tempPassword, orgName: dba.name, orgSlug: dba.slug });
      const sent = await sendEmail({ to: email, fromName: dba.name, ...m });
      emailed = !!sent.ok;
      if (!sent.ok) logger.warn({ email, error: sent.error }, "[DBA] welcome email failed");
    }
  }
  if (existedLogin && mailerConfigured()) {
    // Already has a login — tell them they've been added (no password in mail)
    const m = dbaAddedEmail({ name: profile?.name || name, dbaName: dba.name, dbaSlug: dba.slug });
    const sent = await sendEmail({ to: email, fromName: dba.name, ...m });
    emailed = !!sent.ok;
    if (!sent.ok) logger.warn({ email, error: sent.error }, "[DBA] added email failed");
  }

  dba.members.push({ id: profile?.id || null, email, name: profile?.name || name, added_at: new Date().toISOString(), pure: !existedLogin });
  if (!(await saveDbaRow(companyId, dba))) return res.status(502).json({ ok: false, error: "Couldn't save the membership — try again" });
  try {
    const { recordInviteEmail } = await import("./invites");
    await recordInviteEmail(companyId, email, emailed);
  } catch {}
  void audit(admin, "dba_member_added", dba.id, { dba: dba.name, member: email });
  // Auto-join any "everyone in this DBA" chat channels (best-effort)
  if (profile?.id) {
    void (async () => {
      try {
        const cfg = await loadChatCfg(companyId, dba.id);
        for (const cid of Object.keys(cfg.all).filter((k) => cfg.all[k])) {
          await ensureCommunityMembers(cid, [{ id: profile.id, name: profile.name || name }], { id: admin.id, name: admin.name || null });
        }
      } catch (e) { logger.warn({ err: e }, "[DBA] auto-join failed"); }
    })();
  }
  return res.json({ ok: true, dba, emailed, existed: existedLogin });
  });
});

// ── Admin: remove a member (keeps their login/profile) ──────────
router.post("/dba/member-remove", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = await adminOrgScope(admin, req);
  if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const { dbaId } = (req.body || {}) as Record<string, any>;
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  return withLock("dba-write", async () => {
  const dba = (await loadOrgDbas(companyId)).find((d) => d.id === dbaId);
  if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
  const before = dba.members.length;
  dba.members = dba.members.filter((m) => m.email.toLowerCase() !== email);
  if (dba.members.length === before) return res.status(404).json({ ok: false, error: "Not a member" });
  const removed = (await rest<any>(`user_profiles?email=eq.${encodeURIComponent(email)}&select=id`))[0];
  if (!(await saveDbaRow(companyId, dba))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
  // Hard-revoke chat access (channel memberships, pins, their 1v1s)
  if (removed?.id) await revokeChatAccess(companyId, dba.id, removed.id).catch(() => {});
  void audit(admin, "dba_member_removed", dba.id, { dba: dba.name, member: email });
  return res.json({ ok: true, dba });
  });
});

// ── DBA member content: Connect links + Learn courses ────────────
// Access: DBA member, the DBA's coach, or a super_admin of the DBA's org.
// Managers (coach / org admin) also get the org's course catalog so they can
// assign/unassign courses, plus edit rights on Connect links.
async function findDbaAnywhere(dbaId: string): Promise<{ companyId: string; dba: DbaRecord } | null> {
  const all = await loadAllDbas();
  return all.find((x) => x.dba.id === dbaId) || null;
}
type Me = NonNullable<Awaited<ReturnType<typeof requireUserJwt>>>;
function dbaAccess(me: Me, companyId: string, dba: DbaRecord): { member: boolean; manage: boolean } {
  const member = dba.members.some((m) => m.email.toLowerCase() === me.email);
  // Delegated staff/VAs manage too — but only same-org, non-client logins,
  // and the grant is re-checked live from the DBA record on every request.
  const delegated =
    me.company_id === companyId &&
    me.role !== "client" &&
    me.role !== "dba_member" &&
    (dba.delegates || []).some((d) => d.id === me.id);
  // Eden HQ super_admins (owner) manage every org's DBAs.
  const manage =
    dba.coach_id === me.id ||
    (me.role === "super_admin" && (me.company_id === companyId || isHqAdmin(me))) ||
    delegated;
  return { member, manage };
}
const isEdenCourse = (c: any) => !c.company_id || c.company_id === EDEN_ID;

router.get("/dba/content", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const hit = await findDbaAnywhere(String(req.query.id || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const { companyId, dba } = hit;
  const acc = dbaAccess(me, companyId, dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });

  // Assigned courses (strictly limited to this DBA's assignment list)
  const ids = dba.learn_course_ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  let courses: any[] = [];
  let modules: any[] = [];
  if (ids.length) {
    courses = await rest(
      `courses?id=in.(${ids.join(",")})&is_active=eq.true&select=id,title,description,company_id,sort_order&order=sort_order.asc`,
    );
    // Only courses of the DBA's own org or Eden can ever be served
    courses = courses.filter((c) => c.company_id === companyId || isEdenCourse(c));
    if (courses.length) {
      modules = await rest(
        `course_modules?course_id=in.(${courses.map((c) => c.id).join(",")})&select=id,course_id,module_id,title,duration,video_url,admin_notes,section_id,section_title,section_color,sort_order&order=sort_order.asc`,
      );
    }
  }
  // My completion state (server-side so dba_members never touch REST directly)
  let completed: string[] = [];
  if (courses.length) {
    const prog = await rest(
      `course_progress?user_id=eq.${encodeURIComponent(me.id)}&course_id=in.(${courses.map((c) => c.id).join(",")})&completed=eq.true&select=module_id`,
    );
    completed = prog.map((p: any) => String(p.module_id));
  }
  // Managers also get the assignable catalog (own org + Eden courses)
  let available: any[] | undefined;
  if (acc.manage) {
    const all = await rest(`courses?is_active=eq.true&select=id,title,company_id,sort_order&order=sort_order.asc`);
    available = all
      .filter((c) => c.company_id === companyId || isEdenCourse(c))
      .map((c) => ({ id: c.id, title: c.title }));
  }
  return res.json({
    ok: true,
    connect: dba.connect,
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description || "",
      modules: modules.filter((m) => m.course_id === c.id),
    })),
    completed,
    can_manage: acc.manage,
    available_courses: available,
  });
});

// ── Manager (DBA coach or org admin): save Connect links ─────────
router.post("/dba/connect-save", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, connect } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const clean: DbaLink[] = (Array.isArray(connect) ? connect : [])
      .map((l: any) => ({
        id: typeof l?.id === "string" && l.id ? l.id : randomUUID(),
        title: String(l?.title || "").trim().slice(0, 120),
        url: String(l?.url || "").trim().slice(0, 500),
        desc: l?.desc ? String(l.desc).trim().slice(0, 300) : null,
      }))
      .filter((l) => l.title && /^https?:\/\//i.test(l.url))
      .slice(0, 50);
    hit.dba.connect = clean;
    if (!(await saveDbaRow(hit.companyId, hit.dba))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit({ id: me.id, name: me.name }, "dba_connect_updated", hit.dba.id, { dba: hit.dba.name, links: clean.length });
    return res.json({ ok: true, connect: clean });
  });
});

// ── Manager: assign/unassign Learn courses ───────────────────────
router.post("/dba/learn-save", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, courseIds } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const want = (Array.isArray(courseIds) ? courseIds : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    let valid: string[] = [];
    if (want.length) {
      const rows = await rest(`courses?id=in.(${want.join(",")})&is_active=eq.true&select=id,company_id`);
      valid = rows.filter((c) => c.company_id === hit.companyId || isEdenCourse(c)).map((c) => String(c.id));
    }
    hit.dba.learn_course_ids = valid;
    if (!(await saveDbaRow(hit.companyId, hit.dba))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit({ id: me.id, name: me.name }, "dba_learn_updated", hit.dba.id, { dba: hit.dba.name, courses: valid.length });
    return res.json({ ok: true, learn_course_ids: valid });
  });
});

// ── Member: mark a lesson complete/incomplete ────────────────────
router.post("/dba/progress", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, courseId, moduleId, completed } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  if (!hit.dba.learn_course_ids.includes(String(courseId))) {
    return res.status(403).json({ ok: false, error: "That course isn't part of this DBA" });
  }
  // The module must actually belong to that course — never trust a raw id
  const modCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/course_modules?id=eq.${encodeURIComponent(String(moduleId || ""))}&course_id=eq.${encodeURIComponent(String(courseId))}&select=id&limit=1`,
    { headers: SVC_H },
  );
  const modRows: any[] = modCheck.ok ? ((await modCheck.json().catch(() => [])) as any[]) : [];
  if (!modRows[0]) return res.status(403).json({ ok: false, error: "That lesson isn't part of this course" });
  // Same upsert shape Week5 uses — relies on the table's existing unique key
  const r = await fetch(`${SUPABASE_URL}/rest/v1/course_progress`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: me.id,
      course_id: courseId,
      module_id: moduleId,
      completed: completed !== false,
      completed_at: new Date().toISOString(),
    }),
  });
  if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't save your progress — try again" });
  return res.json({ ok: true });
});

// ── Any signed-in user: my DBAs (member, coach, or org admin) ────
router.get("/dba/mine", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const all = await loadAllDbas();
  const mine = all.filter(
    ({ companyId, dba }) =>
      dba.is_active &&
      (dba.members.some((m) => m.email.toLowerCase() === me.email) ||
        dba.coach_id === me.id ||
        // org admins see their org's DBAs; Eden HQ admins see every org's
        (me.role === "super_admin" && (me.company_id === companyId || isHqAdmin(me))) ||
        // delegated staff enter the DBA space just like its coach
        (me.company_id === companyId &&
          me.role !== "client" &&
          me.role !== "dba_member" &&
          (dba.delegates || []).some((g) => g.id === me.id))),
  );
  // Org names for context (small set)
  const orgIds = [...new Set(mine.map((m) => m.companyId))];
  const orgs = orgIds.length
    ? await rest(`organizations?id=in.(${orgIds.map(encodeURIComponent).join(",")})&select=id,name,slug`)
    : [];
  const orgMap = new Map(orgs.map((o: any) => [o.id, o]));
  return res.json({
    ok: true,
    dbas: mine.map(({ companyId, dba }) => publicBrand(dba, orgMap.get(companyId) || null)),
  });
});

// ── helpers ──────────────────────────────────────────────────────
// ═══════════════ DBA chat: communities & 1v1s ═══════════════════
// Channels are `communities` rows with context 'dba:<dbaId>' (group chats)
// or 'dbadm:<dbaId>' (1v1 pairs — name is the sorted '<idA>_<idB>' pair key).
// Messages/pins ride the existing community_messages / message_pins tables:
// DBA members hold role 'client' in the owning org, so their JWT passes the
// org-scoped RLS just like org clients do. No crossover with org communities
// or Team Hub because every query filters on these DBA-only context values.
// Per-DBA chat config lives in admin_settings key `dba_chat:<dbaId>`:
//   { all: {communityId:true},        — "everyone in this DBA" channels
//     dm_enabled: {profileId:true} }  — Phase-4 member 1v1 gating hook
// Phase-4 additions ("Exodus 18" delegated authority + configurable tiers):
//   leaders: { [communityId]: { [userId]: {del,pin,canvas} } } — per-CHANNEL
//     authority grants. Authority in one channel never implies another.
//   tiers:   { [userId]: tierId } — which org-defined tier each member holds.
type LeaderCaps = { del?: boolean; pin?: boolean; canvas?: boolean };
type DbaChatCfg = {
  all: Record<string, boolean>;
  dm_enabled: Record<string, boolean>;
  leaders: Record<string, Record<string, LeaderCaps>>;
  tiers: Record<string, string>;
  // Phase 6 (calendar & booking):
  //   cal:     { [userId]: true } — members the coach allows to manage the
  //            DBA events calendar AND show a booking embed of their own.
  //   booking: { [userId]: url } — each authorized person's own Calendly/GHL
  //            booking link (the coach sets one too).
  cal: Record<string, boolean>;
  booking: Record<string, string>;
};

// ── Org-configurable tier ladder ────────────────────────────────
// Per-org admin_settings key `dba_tier_defs` = [{id,name,dm,app}].
// Every tier includes all "everyone" channels (the ladder is additive):
//   dm  → may open 1v1s (with coach/admins/leaders or other dm-capable people)
//   app → eligible for promotion to full client app access
export type TierDef = { id: string; name: string; dm: boolean; app: boolean };
const DEFAULT_TIER_DEFS: TierDef[] = [
  { id: "t1", name: "Tier 1 — Community", dm: false, app: false },
  { id: "t2", name: "Tier 2 — 1v1 Access", dm: true, app: false },
  { id: "t3", name: "Tier 3 — Full App", dm: true, app: true },
];
async function loadTierDefs(companyId: string): Promise<TierDef[]> {
  const rows = await rest<any>(
    `admin_settings?company_id=eq.${companyId}&key=eq.dba_tier_defs&select=value`,
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(arr) && arr.length) {
      return arr
        .filter((t: any) => t && t.id && String(t.name || "").trim())
        .map((t: any) => ({ id: String(t.id), name: String(t.name).trim().slice(0, 60), dm: !!t.dm, app: !!t.app }));
    }
  } catch {}
  return DEFAULT_TIER_DEFS;
}
async function saveTierDefs(companyId: string, defs: TierDef[]): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: "dba_tier_defs", value: JSON.stringify(defs) }),
  });
  return r.ok;
}

// Does this user's side of a 1v1 qualify? Privileged (coach/org admin),
// dm-capable tier, explicit dm_enabled grant, or delegated leader of any
// channel in this DBA (members should be able to reach their leaders).
function dmSideAllowed(cfg: DbaChatCfg, defs: TierDef[], userId: string, isPrivileged: boolean): boolean {
  if (isPrivileged) return true;
  if (cfg.dm_enabled[userId] === true) return true;
  const tier = defs.find((t) => t.id === cfg.tiers[userId]);
  if (tier?.dm) return true;
  return Object.values(cfg.leaders).some((byUser) => {
    const caps = byUser[userId];
    return !!(caps && (caps.del || caps.pin || caps.canvas));
  });
}

async function loadChatCfg(companyId: string, dbaId: string): Promise<DbaChatCfg> {
  const rows = await rest<any>(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_chat:${dbaId}`)}&select=value`,
  );
  const base: DbaChatCfg = { all: {}, dm_enabled: {}, leaders: {}, tiers: {}, cal: {}, booking: {} };
  if (!rows[0]?.value) return base;
  try {
    const v = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    const obj = (x: any) => (x && typeof x === "object" ? x : {});
    return { all: obj(v?.all), dm_enabled: obj(v?.dm_enabled), leaders: obj(v?.leaders), tiers: obj(v?.tiers), cal: obj(v?.cal), booking: obj(v?.booking) };
  } catch { return base; }
}
async function saveChatCfg(companyId: string, dbaId: string, cfg: DbaChatCfg): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_chat:${dbaId}`, value: JSON.stringify(cfg) }),
  });
  return r.ok;
}

// The people who can appear in this DBA's chat: members (with profiles),
// the coach, and the org's super admins.
async function chatRoster(companyId: string, dba: DbaRecord) {
  const memberIds = dba.members.map((m) => m.id).filter(Boolean) as string[];
  const [memberProfiles, admins] = await Promise.all([
    memberIds.length
      ? rest<any>(`user_profiles?id=in.(${memberIds.join(",")})&select=id,name,full_name,email,is_active`)
      : Promise.resolve([]),
    rest<any>(`user_profiles?company_id=eq.${companyId}&role=eq.super_admin&is_active=not.is.false&select=id,name,full_name,email`),
  ]);
  const members = memberProfiles
    .filter((p: any) => p.is_active !== false)
    .map((p: any) => ({ id: p.id, name: p.name || p.full_name || p.email, email: p.email, kind: "member" as const }));
  const adminList = admins.map((p: any) => ({ id: p.id, name: p.name || p.full_name || p.email, email: p.email, kind: "admin" as const }));
  return { members, admins: adminList };
}

async function ensureCommunityMembers(communityId: string, people: Array<{ id: string; name: string; role?: string }>, addedBy: { id: string; name: string | null }) {
  if (!people.length) return;
  const existing = await rest<any>(`community_members?community_id=eq.${communityId}&select=user_id`);
  const have = new Set(existing.map((r: any) => r.user_id));
  const rows = people
    .filter((p) => p.id && !have.has(p.id))
    .map((p) => ({
      community_id: communityId, user_id: p.id, user_name: p.name, user_role: p.role || "client",
      added_by: addedBy.id, added_by_name: addedBy.name || "Manager",
    }));
  if (!rows.length) return;
  await fetch(`${SUPABASE_URL}/rest/v1/community_members`, {
    method: "POST", headers: { ...SVC_H, Prefer: "return=minimal" }, body: JSON.stringify(rows),
  }).catch(() => {});
}

// Load a channel and verify it really belongs to this DBA (right org AND a
// DBA-scoped context) — every moderation route must go through this.
async function findDbaChannel(companyId: string, dbaId: string, communityId: string) {
  const comm = (await rest<any>(
    `communities?id=eq.${encodeURIComponent(String(communityId || ""))}&select=id,name,company_id,context,is_active`,
  ))[0];
  if (!comm) return null;
  if (comm.company_id !== companyId) return null;
  if (comm.context !== `dba:${dbaId}` && comm.context !== `dbadm:${dbaId}`) return null;
  return comm;
}

// Hard-revoke a user's chat access across every channel of a DBA (called on
// member removal — membership drives table access, so JSON-only removal
// would leave them reading old channels/DMs).
async function revokeChatAccess(companyId: string, dbaId: string, userId: string) {
  const chans = await rest<any>(
    `communities?company_id=eq.${companyId}&context=in.(${encodeURIComponent(`"dba:${dbaId}","dbadm:${dbaId}"`)})&select=id,context,name`,
  );
  const ids = chans.map((c: any) => c.id);
  if (ids.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/community_members?community_id=in.(${ids.join(",")})&user_id=eq.${userId}`, {
      method: "DELETE", headers: SVC_H,
    }).catch(() => {});
    await fetch(`${SUPABASE_URL}/rest/v1/message_pins?conversation_id=in.(${ids.join(",")})&user_id=eq.${userId}&context=eq.community`, {
      method: "DELETE", headers: SVC_H,
    }).catch(() => {});
  }
  // Close their 1v1s entirely — the other side shouldn't keep an open DM
  // with someone who's no longer part of the DBA.
  const dmIds = chans.filter((c: any) => c.context === `dbadm:${dbaId}` && String(c.name || "").split("_").includes(userId)).map((c: any) => c.id);
  if (dmIds.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/communities?id=in.(${dmIds.join(",")})`, {
      method: "PATCH", headers: { ...SVC_H, "Content-Type": "application/json" }, body: JSON.stringify({ is_active: false }),
    }).catch(() => {});
  }
  // Scrub any delegated authority + tier assignment so nothing stale lingers
  // (channelPower also re-checks membership, but orphaned grants shouldn't
  // survive in the config at all).
  try {
    const cfg = await loadChatCfg(companyId, dbaId);
    let changed = false;
    for (const chanId of Object.keys(cfg.leaders)) {
      if (cfg.leaders[chanId]?.[userId]) {
        delete cfg.leaders[chanId][userId];
        if (!Object.keys(cfg.leaders[chanId]).length) delete cfg.leaders[chanId];
        changed = true;
      }
    }
    if (cfg.tiers[userId]) { delete cfg.tiers[userId]; changed = true; }
    if (cfg.dm_enabled[userId]) { delete cfg.dm_enabled[userId]; changed = true; }
    if (cfg.cal[userId]) { delete cfg.cal[userId]; changed = true; }
    if (cfg.booking[userId]) { delete cfg.booking[userId]; changed = true; }
    if (changed) await saveChatCfg(companyId, dbaId, cfg);
  } catch (e) {
    logger.warn({ err: e }, "[DBA] revokeChatAccess: config scrub failed");
  }
}

// GET /dba/chat-config?id= — everything the chat UI needs up front
router.get("/dba/chat-config", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const hit = await findDbaAnywhere(String(req.query.id || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const [cfg, roster, voice, tierDefs, chanRows] = await Promise.all([
    loadChatCfg(hit.companyId, hit.dba.id),
    chatRoster(hit.companyId, hit.dba),
    voiceMemosEnabled(hit.companyId),
    loadTierDefs(hit.companyId),
    // Channel list served here (service key) so managers get it even when
    // their own login's RLS wouldn't let them read another org's communities
    // (Eden HQ managing a white-label org's DBA).
    acc.manage
      ? rest<any>(`communities?context=eq.${encodeURIComponent(`dba:${String(req.query.id || "")}`)}&is_active=not.is.false&select=id,name&order=created_at.asc`)
      : Promise.resolve(null),
  ]);
  const priv = (id: string) => id === hit.dba.coach_id || roster.admins.some((a) => a.id === id);
  const myDm = dmSideAllowed(cfg, tierDefs, me.id, acc.manage || priv(me.id));
  // Which people the caller could open a 1v1 with (both sides must qualify)
  const everyone = [...roster.members, ...roster.admins,
    ...(hit.dba.coach_id && !roster.admins.some((a) => a.id === hit.dba.coach_id)
      ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", email: "", kind: "coach" as const }] : [])];
  const dmTargets = myDm
    ? everyone.filter((p) => p.id !== me.id && dmSideAllowed(cfg, tierDefs, p.id, priv(p.id))).map((p) => p.id)
    : [];
  return res.json({
    ok: true,
    can_manage: acc.manage,
    me: { id: me.id, name: me.name, role: me.role },
    coach: hit.dba.coach_id ? { id: hit.dba.coach_id, name: hit.dba.coach_name } : null,
    members: roster.members,
    admins: roster.admins,
    all_flags: cfg.all,
    dm_enabled: cfg.dm_enabled,
    leaders: cfg.leaders,
    tiers: cfg.tiers,
    tier_defs: tierDefs,
    my_dm: myDm,
    dm_targets: dmTargets,
    voice_memos: voice,
    channels: Array.isArray(chanRows) ? chanRows.map((c: any) => ({ id: c.id, name: c.name })) : undefined,
  });
});

// POST /dba/channel-create {dbaId, name, allDba, memberIds[]} — manager only.
// Created server-side (service key) so membership is materialized reliably;
// "everyone" channels also auto-join future members via /dba/member-add.
router.post("/dba/channel-create", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, allDba, memberIds } = (req.body || {}) as Record<string, any>;
  const name = String((req.body || {}).name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ ok: false, error: "Channel name required" });
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/communities`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "return=representation" },
      body: JSON.stringify({
        company_id: hit.companyId, name, context: `dba:${hit.dba.id}`,
        created_by: me.id, created_by_name: me.name || "Manager", is_active: true,
      }),
    });
    const created: any[] = ins.ok ? ((await ins.json().catch(() => [])) as any[]) : [];
    if (!created[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't create the channel — try again" });
    const communityId = created[0].id;

    const roster = await chatRoster(hit.companyId, hit.dba);
    let people: Array<{ id: string; name: string; role?: string }> = [{ id: me.id, name: me.name || "Manager", role: me.role }];
    if (allDba) {
      people = people.concat(roster.members.map((m) => ({ id: m.id, name: m.name })));
      if (hit.dba.coach_id) people.push({ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", role: "coach" });
      const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
      cfg.all[communityId] = true;
      await saveChatCfg(hit.companyId, hit.dba.id, cfg);
    } else {
      const wanted = new Set((Array.isArray(memberIds) ? memberIds : []).map(String));
      const eligible = [...roster.members, ...roster.admins,
        ...(hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach" }] : [])];
      people = people.concat(eligible.filter((p) => wanted.has(p.id)).map((p) => ({ id: p.id, name: p.name })));
    }
    await ensureCommunityMembers(communityId, people, { id: me.id, name: me.name });
    void audit({ id: me.id, name: me.name }, "dba_channel_created", hit.dba.id, { dba: hit.dba.name, channel: name, all: !!allDba });
    return res.json({ ok: true, id: communityId });
  });
});

// POST /dba/channel-rename {dbaId, communityId, name} — manager only
router.post("/dba/channel-rename", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId } = (req.body || {}) as Record<string, any>;
  const name = String((req.body || {}).name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ ok: false, error: "Name required" });
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
  if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/communities?id=eq.${comm.id}`, {
    method: "PATCH", headers: { ...SVC_H, "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't rename — try again" });
  void audit({ id: me.id, name: me.name }, "dba_channel_renamed", hit.dba.id, { dba: hit.dba.name, from: comm.name, to: name });
  return res.json({ ok: true });
});

// POST /dba/channel-archive {dbaId, communityId} — manager only
router.post("/dba/channel-archive", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
    if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/communities?id=eq.${comm.id}`, {
      method: "PATCH", headers: { ...SVC_H, "Content-Type": "application/json" }, body: JSON.stringify({ is_active: false }),
    });
    if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't archive — try again" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (cfg.all[comm.id]) { delete cfg.all[comm.id]; await saveChatCfg(hit.companyId, hit.dba.id, cfg); }
    void audit({ id: me.id, name: me.name }, "dba_channel_archived", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
    return res.json({ ok: true });
  });
});

// POST /dba/channel-member-add {dbaId, communityId, userId} — manager only.
// The person must belong to this DBA (member, coach, or org admin).
router.post("/dba/channel-member-add", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, userId } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
  if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
  const roster = await chatRoster(hit.companyId, hit.dba);
  const eligible = [...roster.members, ...roster.admins,
    ...(hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", kind: "coach" as const }] : [])];
  const person = eligible.find((p) => p.id === String(userId));
  if (!person) return res.status(403).json({ ok: false, error: "That person isn't part of this DBA" });
  await ensureCommunityMembers(comm.id, [{ id: person.id, name: person.name, role: (person as any).kind === "member" ? "client" : (person as any).kind }], { id: me.id, name: me.name });
  await audit(me, "dba_channel_member_added", hit.dba.id, { dba: hit.dba.name, channel: comm.name, person: person.name });
  return res.json({ ok: true });
});

// POST /dba/channel-member-remove {dbaId, communityId, userId} — manager only
router.post("/dba/channel-member-remove", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, userId } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
  if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
  await fetch(`${SUPABASE_URL}/rest/v1/community_members?community_id=eq.${comm.id}&user_id=eq.${encodeURIComponent(String(userId || ""))}`, {
    method: "DELETE", headers: SVC_H,
  }).catch(() => {});
  // Leaving a channel also drops any leader authority granted on it
  try {
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (cfg.leaders[comm.id]?.[String(userId)]) {
      delete cfg.leaders[comm.id][String(userId)];
      if (!Object.keys(cfg.leaders[comm.id]).length) delete cfg.leaders[comm.id];
      await saveChatCfg(hit.companyId, hit.dba.id, cfg);
    }
  } catch (e) {
    logger.warn({ err: e }, "[DBA] channel-member-remove: leader scrub failed");
  }
  await audit(me, "dba_channel_member_removed", hit.dba.id, { dba: hit.dba.name, channel: comm.name, userId: String(userId || "") });
  return res.json({ ok: true });
});

// POST /dba/chat-flags {dbaId, communityId, allDba} — manager toggles
// "everyone in this DBA" on an existing channel.
router.post("/dba/chat-flags", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, allDba } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
    if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (allDba) {
      cfg.all[comm.id] = true;
      const roster = await chatRoster(hit.companyId, hit.dba);
      const people = roster.members.map((m) => ({ id: m.id, name: m.name }))
        .concat(hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach" }] : []);
      await ensureCommunityMembers(comm.id, people, { id: me.id, name: me.name });
    } else {
      // Turning "everyone" off keeps current members (kicking everybody would
      // be destructive) — it stops future auto-joins; managers prune the
      // remaining list from the Members modal (server-enforced route).
      delete cfg.all[comm.id];
    }
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    await audit(me, "dba_channel_audience_changed", hit.dba.id, { dba: hit.dba.name, channel: comm.name, everyone: !!allDba });
    return res.json({ ok: true });
  });
});

// POST /dba/dm-open {dbaId, otherId} — find-or-create a 1v1 inside the DBA.
// Allowed pairs: coach ↔ org admin (always — their dedicated DBA 1v1), and
// any pair where BOTH people have dm_enabled (Phase-4 gating hook; nobody is
// enabled yet, so member 1v1s stay locked until then).
router.post("/dba/dm-open", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, otherId } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
    const acc = dbaAccess(me, hit.companyId, hit.dba);
    if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });

    const other = (await rest<any>(`user_profiles?id=eq.${encodeURIComponent(String(otherId || ""))}&select=id,name,full_name,email,role,company_id,is_active`))[0];
    if (!other || other.is_active === false) return res.status(404).json({ ok: false, error: "Person not found" });
    const otherName = other.name || other.full_name || other.email;

    // Which side is which? privileged = the DBA's coach or an org super_admin
    const privileged = (id: string, role: string, companyId: string | null) =>
      id === hit.dba.coach_id || (role === "super_admin" && companyId === hit.companyId);
    const otherInDba = hit.dba.members.some((m) => m.id === other.id) || privileged(other.id, other.role, other.company_id);
    if (!otherInDba) return res.status(403).json({ ok: false, error: "That person isn't part of this DBA" });

    const meIsPriv = privileged(me.id, me.role, me.company_id);
    const otherIsPriv = privileged(other.id, other.role, other.company_id);
    const [cfg, tierDefs] = await Promise.all([
      loadChatCfg(hit.companyId, hit.dba.id),
      loadTierDefs(hit.companyId),
    ]);
    // BOTH sides must qualify: privileged (coach/org admin), a dm-capable
    // tier, an explicit grant, or delegated leadership in this DBA.
    if (!dmSideAllowed(cfg, tierDefs, me.id, meIsPriv) || !dmSideAllowed(cfg, tierDefs, other.id, otherIsPriv)) {
      return res.status(403).json({ ok: false, error: "Direct messages aren't enabled for this pair yet" });
    }

    const pairKey = [me.id, other.id].sort().join("_");
    const existing = (await rest<any>(
      `communities?company_id=eq.${hit.companyId}&context=eq.${encodeURIComponent(`dbadm:${hit.dba.id}`)}&name=eq.${encodeURIComponent(pairKey)}&is_active=eq.true&order=created_at.asc&limit=1`,
    ))[0];
    let communityId = existing?.id;
    if (!communityId) {
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/communities`, {
        method: "POST",
        headers: { ...SVC_H, Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: hit.companyId, name: pairKey, context: `dbadm:${hit.dba.id}`,
          created_by: me.id, created_by_name: me.name || "User", is_active: true,
        }),
      });
      const created: any[] = ins.ok ? ((await ins.json().catch(() => [])) as any[]) : [];
      if (!created[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't open the conversation — try again" });
      communityId = created[0].id;
      await ensureCommunityMembers(communityId, [
        { id: me.id, name: me.name || "User", role: me.role },
        { id: other.id, name: otherName, role: other.role },
      ], { id: me.id, name: me.name });
    }
    return res.json({ ok: true, id: communityId, other: { id: other.id, name: otherName } });
  });
});

// POST /dba/dm-enable {dbaId, userId, enabled} — Phase-4 gating hook (manager only)
router.post("/dba/dm-enable", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, userId, enabled } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (enabled) cfg.dm_enabled[String(userId)] = true;
    else delete cfg.dm_enabled[String(userId)];
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit({ id: me.id, name: me.name }, "dba_dm_gate_changed", hit.dba.id, { dba: hit.dba.name, user: String(userId), enabled: !!enabled });
    return res.json({ ok: true });
  });
});

// ═══════════ Delegated authority & configurable tiers (Phase 4) ═══════════

// GET /dba/tier-defs?dbaId= (or none: org admin's own org) — the org's tier
// ladder. can_edit = org super_admin only (coaches assign tiers, admins
// define them).
router.get("/dba/tier-defs", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const dbaId = String(req.query.dbaId || "");
  let companyId: string | null = null;
  if (dbaId) {
    const hit = await findDbaAnywhere(dbaId);
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    companyId = hit.companyId;
  } else {
    if (me.role !== "super_admin") return res.status(403).json({ ok: false, error: "Not authorized" });
    companyId = await adminOrgScope({ company_id: me.company_id }, req);
    if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized" });
  }
  const defs = await loadTierDefs(companyId);
  return res.json({ ok: true, defs, can_edit: me.role === "super_admin" && (me.company_id === companyId || isHqAdmin(me)) });
});

// POST /dba/tier-defs {defs:[{id,name,dm,app}]} — org super_admin only
router.post("/dba/tier-defs", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  if (me.role !== "super_admin") return res.status(403).json({ ok: false, error: "Only an org admin can edit the tier ladder" });
  const tierCompanyId = await adminOrgScope({ company_id: me.company_id }, req);
  if (!tierCompanyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
  const raw = (req.body || {}).defs;
  if (!Array.isArray(raw) || !raw.length || raw.length > 6) return res.status(400).json({ ok: false, error: "Provide 1–6 tiers" });
  const defs: TierDef[] = [];
  for (const t of raw) {
    const name = String(t?.name || "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, error: "Every tier needs a name" });
    defs.push({ id: String(t.id || randomUUID().slice(0, 8)), name, dm: !!t.dm, app: !!t.app });
  }
  if (new Set(defs.map((d) => d.id)).size !== defs.length) return res.status(400).json({ ok: false, error: "Duplicate tier ids" });
  if (!(await saveTierDefs(tierCompanyId, defs))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
  void audit({ id: me.id, name: me.name }, "dba_tier_defs_changed", tierCompanyId, { defs });
  return res.json({ ok: true, defs });
});

// POST /dba/tier-set {dbaId, userId, tierId} — manager assigns a member's tier
// (empty tierId clears back to the base tier).
router.post("/dba/tier-set", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, userId, tierId } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
    const defs = await loadTierDefs(hit.companyId);
    const tid = String(tierId || "");
    if (tid && !defs.some((d) => d.id === tid)) return res.status(400).json({ ok: false, error: "Unknown tier" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (tid) cfg.tiers[String(userId)] = tid;
    else delete cfg.tiers[String(userId)];
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit({ id: me.id, name: me.name }, "dba_tier_assigned", hit.dba.id, { dba: hit.dba.name, user: String(userId), tier: tid || "(base)" });
    return res.json({ ok: true });
  });
});

// POST /dba/authority-set {dbaId, communityId, userId, caps:{del,pin,canvas}}
// Manager grants/revokes per-CHANNEL leader authority. Scoped strictly to
// that one channel — never implies authority anywhere else.
router.post("/dba/authority-set", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, userId, caps } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
    if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
    if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
    const clean: LeaderCaps = { del: !!caps?.del, pin: !!caps?.pin, canvas: !!caps?.canvas };
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (!clean.del && !clean.pin && !clean.canvas) {
      if (cfg.leaders[comm.id]) { delete cfg.leaders[comm.id][String(userId)]; if (!Object.keys(cfg.leaders[comm.id]).length) delete cfg.leaders[comm.id]; }
    } else {
      cfg.leaders[comm.id] = { ...(cfg.leaders[comm.id] || {}), [String(userId)]: clean };
    }
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit({ id: me.id, name: me.name }, "dba_authority_changed", hit.dba.id, { dba: hit.dba.name, channel: comm.name, user: String(userId), caps: clean });
    return res.json({ ok: true });
  });
});

// Caller's moderation power on one channel: manager, or leader caps there.
// Leader caps only count while the caller is a CURRENT member of that
// channel — stale grants (e.g. after removal) confer nothing.
async function channelPower(me: { id: string; email: string; name: string | null; role: string; company_id: string | null }, hit: { companyId: string; dba: DbaRecord }, comm: any) {
  const manage = dbaAccess(me as any, hit.companyId, hit.dba).manage;
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  let caps: LeaderCaps = {};
  const granted = (cfg.leaders[comm.id] || {})[me.id];
  if (granted && (granted.del || granted.pin || granted.canvas)) {
    const inChan = await rest<any>(`community_members?community_id=eq.${comm.id}&user_id=eq.${me.id}&select=id&limit=1`);
    if (inChan.length) caps = granted;
  }
  return { manage, caps, cfg };
}

// POST /dba/msg-delete {dbaId, communityId, messageId} — soft delete.
// Allowed: manager, the sender themselves, or a leader with `del` on THIS channel.
router.post("/dba/msg-delete", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, messageId } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
  if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
  const msg = (await rest<any>(`community_messages?id=eq.${encodeURIComponent(String(messageId || ""))}&community_id=eq.${comm.id}&select=id,sender_id,deleted_at`))[0];
  if (!msg) return res.status(404).json({ ok: false, error: "Message not found" });
  const { manage, caps } = await channelPower(me, hit, comm);
  if (!manage && msg.sender_id !== me.id && !caps.del) return res.status(403).json({ ok: false, error: "You can't delete this message" });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/community_messages?id=eq.${msg.id}`, {
    method: "PATCH", headers: { ...SVC_H, Prefer: "return=minimal" },
    body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: me.id, deleted_by_name: me.name || "User" }),
  });
  if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't delete — try again" });
  void audit({ id: me.id, name: me.name }, "dba_message_deleted", hit.dba.id, { dba: hit.dba.name, channel: comm.name, message_id: String(msg.id), sender_id: msg.sender_id });
  return res.json({ ok: true });
});

// POST /dba/pin-all {dbaId, communityId, messageId, unpin} — pin for every
// channel member. Allowed: manager or a leader with `pin` on THIS channel.
router.post("/dba/pin-all", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, communityId, messageId, unpin } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
  if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
  const { manage, caps } = await channelPower(me, hit, comm);
  if (!manage && !caps.pin) return res.status(403).json({ ok: false, error: "You can't pin for everyone here" });
  const msgId = String(messageId || "");
  const msg = (await rest<any>(`community_messages?id=eq.${encodeURIComponent(msgId)}&community_id=eq.${comm.id}&select=id`))[0];
  if (!msg) return res.status(404).json({ ok: false, error: "Message not found" });
  if (unpin) {
    await fetch(`${SUPABASE_URL}/rest/v1/message_pins?message_id=eq.${msg.id}&conversation_id=eq.${comm.id}&context=eq.community`, {
      method: "DELETE", headers: SVC_H,
    }).catch(() => {});
    await audit(me, "dba_message_unpinned", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
    return res.json({ ok: true });
  }
  const [rows, existing] = await Promise.all([
    rest<any>(`community_members?community_id=eq.${comm.id}&select=user_id`),
    rest<any>(`message_pins?message_id=eq.${msg.id}&conversation_id=eq.${comm.id}&context=eq.community&select=user_id`),
  ]);
  const have = new Set(existing.map((r: any) => r.user_id));
  const inserts = rows.filter((r: any) => !have.has(r.user_id)).map((r: any) => ({
    message_id: msg.id, conversation_id: String(comm.id), context: "community",
    user_id: r.user_id, pinned_by: me.id, pinned_by_name: me.name || "User",
  }));
  if (inserts.length) {
    const r2 = await fetch(`${SUPABASE_URL}/rest/v1/message_pins`, {
      method: "POST", headers: { ...SVC_H, Prefer: "return=minimal" }, body: JSON.stringify(inserts),
    });
    if (!r2.ok) return res.status(502).json({ ok: false, error: "Couldn't pin — try again" });
  }
  await audit(me, "dba_message_pinned", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
  return res.json({ ok: true });
});

// POST /dba/promote {dbaId, userId, coachId} — turn a DBA member into a full
// client under the chosen coach WITHOUT losing DBA membership. Flips the
// member entry's pure flag and the auth metadata so the app routes them to
// the full client experience on next login.
router.post("/dba/promote", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, userId, coachId } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const member = hit.dba.members.find((m) => m.id === String(userId));
    if (!member) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
    // Tier policy: only members on a tier that includes full app access can
    // be promoted (org admins configure which tiers carry `app`).
    const [cfg, tierDefs] = await Promise.all([
      loadChatCfg(hit.companyId, hit.dba.id),
      loadTierDefs(hit.companyId),
    ]);
    const memberTier = tierDefs.find((t) => t.id === cfg.tiers[String(member.id)]) || tierDefs[0];
    if (!memberTier?.app) {
      return res.status(403).json({ ok: false, error: `Their tier (${memberTier?.name || "base"}) doesn't include full app access — move them to an app-access tier first` });
    }
    const coach = (await rest<any>(
      `user_profiles?id=eq.${encodeURIComponent(String(coachId || ""))}&company_id=eq.${hit.companyId}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,name,full_name,email`,
    ))[0];
    if (!coach) return res.status(400).json({ ok: false, error: "Pick a coach from this organization" });
    // 1) Profile: assign the coach (role stays 'client' — that IS full app
    //    access). The company_id filter is a hard tenant boundary: a DBA can
    //    contain emails from other orgs, and we must never mutate those.
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${member.id}&company_id=eq.${hit.companyId}`,
      {
        method: "PATCH", headers: { ...SVC_H, Prefer: "return=representation" },
        body: JSON.stringify({ coach_id: coach.id }),
      },
    );
    const updated = pr.ok ? await pr.json().catch(() => []) : [];
    if (!Array.isArray(updated) || !updated.length) {
      return res.status(403).json({ ok: false, error: "They don't have a profile in your organization, so they can't be promoted here" });
    }
    // 2) Auth metadata: clear intended_role=dba_member so App.tsx routes them
    //    to the full client app (they keep DBA access via /dba/mine).
    try {
      const lookup = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(member.email)}`, { headers: SVC_H });
      const found: any = lookup.ok ? await lookup.json().catch(() => null) : null;
      const authUser = found?.users?.find((u: any) => String(u.email || "").toLowerCase() === member.email.toLowerCase());
      if (authUser?.id) {
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
          method: "PUT", headers: SVC_H,
          body: JSON.stringify({ user_metadata: { ...(authUser.user_metadata || {}), intended_role: "client" } }),
        });
      }
    } catch (e) {
      logger.warn({ err: e }, "[DBA] promote: auth metadata update failed (profile already updated)");
    }
    // 3) DBA record: no longer a pure member — they're a real app client now
    if (member.pure) {
      member.pure = false;
      await saveDbaRow(hit.companyId, hit.dba);
    }
    void audit({ id: me.id, name: me.name }, "dba_member_promoted", hit.dba.id, {
      dba: hit.dba.name, member: member.email, coach: coach.name || coach.full_name || coach.email,
    });
    return res.json({ ok: true, coach: { id: coach.id, name: coach.name || coach.full_name || coach.email } });
  });
});

// Exported for canvas.ts: in DBA GROUP channels, canvas create/edit is
// restricted to the coach/org admin and members with the `canvas` grant on
// that channel. (DBA 1v1 canvases stay open to both participants; non-DBA
// scopes are untouched.)
export async function dbaCanvasWriteAllowed(
  communityId: string,
  user: { id: string; role: string; companyId: string | null },
): Promise<boolean> {
  const comm = (await rest<any>(
    `communities?id=eq.${encodeURIComponent(communityId)}&select=id,company_id,context`,
  ))[0];
  const ctx = String(comm?.context || "");
  if (!ctx.startsWith("dba:")) return true; // non-DBA scopes untouched
  const hit = await findDbaAnywhere(ctx.slice(4));
  if (!hit || hit.companyId !== comm.company_id) return false;
  if (user.id === hit.dba.coach_id) return true;
  if (user.role === "super_admin" && (user.companyId === hit.companyId || isHqAdmin({ company_id: user.companyId }))) return true;
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  return !!(cfg.leaders[comm.id] || {})[user.id]?.canvas;
}

// POST /dba/upload — chat file/voice-memo upload for DBA members (they hold
// role 'client', so the staff-only /team/upload rejects them).
router.post("/dba/upload", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, filename, contentType, dataBase64 } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  try {
    const out = await storeChatUpload(`dba-${hit.dba.id}`, filename, contentType, dataBase64);
    return res.status(out.status).json(out.body);
  } catch (e) {
    logger.error({ err: e }, "[DBA] upload error");
    return res.status(500).json({ error: "Upload failed" });
  }
});

// POST /dba/transcribe — voice memo speech-to-text for DBA chat
router.post("/dba/transcribe", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, dataBase64, contentType } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  if (!(await voiceMemosEnabled(hit.companyId))) {
    return res.status(403).json({ ok: false, error: "Voice memos are not included in this organization's tier" });
  }
  try {
    const out = await transcribeChatAudio(dataBase64, contentType);
    return res.status(out.status).json(out.body);
  } catch (e) {
    logger.error({ err: e }, "[DBA] transcribe error");
    return res.status(500).json({ error: "Transcription failed" });
  }
});

// ═══════════════════════════════════════════════════════════════
// DBA huddles (Phase 5) — live Daily.co video rooms scoped to ONE
// DBA, fully separate from org/Team Hub huddles.
//
// Zero-DDL storage: per-DBA admin_settings key `dba_huddles:<dbaId>`
// holds an array of room records. Rooms self-destruct on Daily's side
// after 4h (same as org huddles); listing lazily marks anything older
// than 4h inactive so abandoned rooms disappear on their own.
//
// Who can START a huddle: the DBA's manager (coach / org admin) or any
// Phase-4 delegated leader. Each huddle picks its audience:
//   leaders — manager + all delegated leaders
//   all     — everyone in the DBA
//   pick    — an explicit list of member ids (creator always included)
// Members only ever SEE huddles they're allowed into.
type DbaHuddle = {
  id: string;
  title: string;
  room_url: string;
  room_name: string;
  created_by: string;
  created_by_name: string;
  audience: "leaders" | "all" | "pick";
  member_ids: string[];
  created_at: string;
  is_active: boolean;
  ended_at?: string;
  ended_by_name?: string;
};
const HUDDLE_TTL_MS = 4 * 3600 * 1000; // matches Daily room `exp`

async function loadHuddles(companyId: string, dbaId: string): Promise<DbaHuddle[]> {
  const rows = await rest<any>(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_huddles:${dbaId}`)}&select=value`,
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
async function saveHuddles(companyId: string, dbaId: string, list: DbaHuddle[]): Promise<boolean> {
  // Keep the JSON small: drop ended rooms older than a day
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const trimmed = list.filter((h) => h.is_active || Date.parse(h.created_at) > cutoff);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_huddles:${dbaId}`, value: JSON.stringify(trimmed) }),
  });
  return r.ok;
}
// Anyone with any Phase-4 authority grant in any channel counts as a leader
function dbaLeaderIds(cfg: DbaChatCfg): Set<string> {
  const ids = new Set<string>();
  for (const byUser of Object.values(cfg.leaders)) {
    for (const [uid, caps] of Object.entries(byUser)) {
      if (caps && (caps.del || caps.pin || caps.canvas)) ids.add(uid);
    }
  }
  return ids;
}
function huddleVisible(h: DbaHuddle, meId: string, manage: boolean, leaders: Set<string>): boolean {
  if (manage || h.created_by === meId) return true;
  if (h.audience === "all") return true;
  if (h.audience === "leaders") return leaders.has(meId);
  return h.member_ids.includes(meId);
}
function pruneStale(list: DbaHuddle[]): { list: DbaHuddle[]; changed: boolean } {
  let changed = false;
  const out = list.map((h) => {
    if (h.is_active && Date.now() - Date.parse(h.created_at) > HUDDLE_TTL_MS) {
      changed = true;
      return { ...h, is_active: false, ended_at: new Date().toISOString(), ended_by_name: "auto (room expired)" };
    }
    return h;
  });
  return { list: out, changed };
}

// GET /dba/huddles?id= — active huddles the caller may join, + start rights
router.get("/dba/huddles", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const hit = await findDbaAnywhere(String(req.query.id || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const [cfg, rawList] = await Promise.all([
    loadChatCfg(hit.companyId, hit.dba.id),
    loadHuddles(hit.companyId, hit.dba.id),
  ]);
  const { list, changed } = pruneStale(rawList);
  if (changed) {
    // Persist the prune under the same per-DBA lock start/end use, and
    // re-read inside it — a bare save here could overwrite a concurrent
    // huddle-start/end (lost update on the JSON array).
    void withLock(`dba-huddles:${hit.dba.id}`, async () => {
      const fresh = pruneStale(await loadHuddles(hit.companyId, hit.dba.id));
      if (fresh.changed) await saveHuddles(hit.companyId, hit.dba.id, fresh.list);
    }).catch(() => {});
  }
  const leaders = dbaLeaderIds(cfg);
  const canStart = acc.manage || leaders.has(me.id);
  const visible = list.filter((h) => h.is_active && huddleVisible(h, me.id, acc.manage, leaders));
  let roster: Array<{ id: string; name: string; leader: boolean }> = [];
  if (canStart) {
    const r = await chatRoster(hit.companyId, hit.dba);
    roster = r.members.filter((m: any) => m.id !== me.id).map((m: any) => ({ id: m.id, name: m.name, leader: leaders.has(m.id) }));
  }
  return res.json({
    ok: true,
    can_start: canStart,
    huddles: visible.map((h) => ({ ...h, can_end: acc.manage || h.created_by === me.id })),
    roster,
  });
});

// POST /dba/huddle-start {dbaId, title?, audience, memberIds?}
router.post("/dba/huddle-start", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, title, audience, memberIds } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  const leaders = dbaLeaderIds(cfg);
  if (!acc.manage && !leaders.has(me.id)) {
    return res.status(403).json({ ok: false, error: "Only the coach or a delegated leader can start a huddle here" });
  }
  const aud = String(audience || "all");
  if (!["leaders", "all", "pick"].includes(aud)) return res.status(400).json({ ok: false, error: "Pick who this huddle is for" });
  let ids: string[] = [];
  if (aud === "pick") {
    const memberSet = new Set(hit.dba.members.map((m) => String(m.id)).filter(Boolean));
    ids = Array.isArray(memberIds) ? memberIds.map(String).filter((id) => memberSet.has(id)) : [];
    if (!ids.length) return res.status(400).json({ ok: false, error: "Pick at least one member to invite" });
  }
  const DAILY_KEY = await dailyKeyForOrg(hit.companyId);
  if (!DAILY_KEY) {
    return res.status(400).json({ ok: false, error: "Video huddles aren't connected for this organization yet — the org admin needs to add a Daily.co key in the admin panel." });
  }
  const roomName = `dba-${String(hit.dba.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${Date.now()}`;
  const r = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${DAILY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: roomName,
      privacy: "public",
      properties: { exp: Math.floor(Date.now() / 1000) + 4 * 3600, enable_chat: true, enable_screenshare: true },
    }),
  });
  const data: any = await r.json().catch(() => null);
  if (!r.ok || !data?.url) return res.status(502).json({ ok: false, error: "Could not create the call room" });
  const huddle: DbaHuddle = {
    id: randomUUID(),
    title: String(title || "").trim().slice(0, 80) || "Huddle",
    room_url: String(data.url),
    room_name: String(data.name || roomName),
    created_by: me.id,
    created_by_name: me.name || me.email,
    audience: aud as DbaHuddle["audience"],
    member_ids: ids,
    created_at: new Date().toISOString(),
    is_active: true,
  };
  const ok = await withLock(`dba-huddles:${hit.dba.id}`, async () => {
    const list = pruneStale(await loadHuddles(hit.companyId, hit.dba.id)).list;
    list.push(huddle);
    return saveHuddles(hit.companyId, hit.dba.id, list);
  });
  if (!ok) {
    // Don't orphan a live room we can't track — best-effort delete it
    void fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(huddle.room_name)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${DAILY_KEY}` },
    }).catch(() => {});
    return res.status(502).json({ ok: false, error: "Couldn't save the huddle — try again" });
  }
  void audit(me, "dba_huddle_started", hit.dba.id, { dba: hit.dba.name, title: huddle.title, audience: aud, invited: ids.length });
  return res.json({ ok: true, huddle: { ...huddle, can_end: true } });
});

// POST /dba/huddle-end {dbaId, huddleId} — creator or manager
router.post("/dba/huddle-end", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, huddleId } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  return withLock(`dba-huddles:${hit.dba.id}`, async () => {
    const list = await loadHuddles(hit.companyId, hit.dba.id);
    const h = list.find((x) => x.id === String(huddleId));
    if (!h || !h.is_active) return res.status(404).json({ ok: false, error: "That huddle is already over" });
    if (!acc.manage && h.created_by !== me.id) return res.status(403).json({ ok: false, error: "Only the person who started it (or the coach) can end this huddle" });
    h.is_active = false;
    h.ended_at = new Date().toISOString();
    h.ended_by_name = me.name || me.email;
    if (!(await saveHuddles(hit.companyId, hit.dba.id, list))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit(me, "dba_huddle_ended", hit.dba.id, { dba: hit.dba.name, title: h.title });
    return res.json({ ok: true });
  });
});

// ═══════════ DBA calendar & booking (Phase 6) ═══════════
// A shared events calendar every member of the DBA can see, plus embedded
// Calendly/GHL booking calendars for the coach and any leaders the coach
// authorizes. Zero-DDL: events live in a per-DBA admin_settings JSON key
// (`dba_events:<dbaId>`); calendar authority + booking URLs live in the
// existing per-DBA chat config (cal / booking maps). No external calendar
// sync — events are created in-app only.

type DbaEvent = {
  id: string;
  title: string;
  start: string;            // ISO date-time
  end: string | null;       // optional ISO date-time
  description: string;
  link: string;             // optional http(s) URL members can click to join
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at?: string;
};

const MAX_EVENTS = 500;

async function loadEvents(companyId: string, dbaId: string): Promise<DbaEvent[]> {
  const rows = await rest<any>(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_events:${dbaId}`)}&select=value`,
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.filter((e: any) => e && e.id && e.title && e.start) : [];
  } catch { return []; }
}
async function saveEvents(companyId: string, dbaId: string, list: DbaEvent[]): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_events:${dbaId}`, value: JSON.stringify(list) }),
  });
  return r.ok;
}

const httpUrl = (v: any): string | null => {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length > 500) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch { return null; }
};
const isoOrNull = (v: any): string | null => {
  const s = String(v || "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// Coach/org-admin, or a member the coach granted calendar authority.
function canManageCalendar(meId: string, manage: boolean, cfg: DbaChatCfg, dba: DbaRecord): boolean {
  if (manage) return true;
  return cfg.cal[meId] === true && dba.members.some((m) => m.id === meId);
}

// GET /dba/calendar?id= — events + booking embeds + (for the manager) the
// grant roster, all in one call.
router.get("/dba/calendar", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const hit = await findDbaAnywhere(String(req.query.id || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const [events, cfg] = await Promise.all([
    loadEvents(hit.companyId, hit.dba.id),
    loadChatCfg(hit.companyId, hit.dba.id),
  ]);
  const canManage = canManageCalendar(me.id, acc.manage, cfg, hit.dba);

  // Booking embeds: the coach plus every currently-authorized leader who has
  // set a booking URL. Stale URLs of people no longer authorized/members
  // simply don't show (config scrubbing on removal handles the rest).
  const allowedBookers = new Set<string>();
  if (hit.dba.coach_id) allowedBookers.add(hit.dba.coach_id);
  for (const [uid, on] of Object.entries(cfg.cal)) {
    if (on === true && hit.dba.members.some((m) => m.id === uid)) allowedBookers.add(uid);
  }
  const bookerIds = [...allowedBookers].filter((uid) => cfg.booking[uid]);
  const profiles = bookerIds.length
    ? await rest<any>(`user_profiles?id=in.(${bookerIds.join(",")})&select=id,name,full_name,email`)
    : [];
  const nameOf = (uid: string) => {
    const p = profiles.find((x: any) => x.id === uid);
    if (p) return p.name || p.full_name || p.email;
    return uid === hit.dba.coach_id ? (hit.dba.coach_name || "Coach") : "Team member";
  };
  const bookings = bookerIds.map((uid) => ({
    id: uid,
    name: nameOf(uid),
    url: cfg.booking[uid],
    is_coach: uid === hit.dba.coach_id,
  }));

  // Can the caller publish their own booking embed? Coach/manager always;
  // otherwise only with a calendar grant.
  const canSetBooking = acc.manage || me.id === hit.dba.coach_id || canManage;

  const body: any = {
    ok: true,
    can_manage: canManage,
    can_set_booking: canSetBooking,
    my_booking: cfg.booking[me.id] || "",
    events: events
      .slice()
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({ ...e, can_edit: canManage })),
  };
  body.bookings = bookings;
  if (acc.manage) {
    // Roster for the grant UI — members with profiles, excluding the coach.
    const roster = await chatRoster(hit.companyId, hit.dba);
    body.roster = roster.members
      .filter((m: any) => m.id !== hit.dba.coach_id)
      .map((m: any) => ({ id: m.id, name: m.name, allowed: cfg.cal[m.id] === true }));
  }
  return res.json(body);
});

// POST /dba/event-save {dbaId, event:{id?,title,start,end?,description?,link?}}
router.post("/dba/event-save", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, event } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  if (!canManageCalendar(me.id, acc.manage, cfg, hit.dba))
    return res.status(403).json({ ok: false, error: "Only the coach or an authorized leader can manage the calendar" });

  const title = String(event?.title || "").trim().slice(0, 120);
  if (!title) return res.status(400).json({ ok: false, error: "Give the event a title" });
  const start = isoOrNull(event?.start);
  if (!start) return res.status(400).json({ ok: false, error: "Pick a valid date and time" });
  const end = isoOrNull(event?.end);
  if (end && end < start) return res.status(400).json({ ok: false, error: "The end time is before the start time" });
  const link = httpUrl(event?.link);
  if (link === null) return res.status(400).json({ ok: false, error: "The event link must be a normal https:// link" });
  const description = String(event?.description || "").trim().slice(0, 2000);

  return withLock(`dba-events:${hit.dba.id}`, async () => {
    const list = await loadEvents(hit.companyId, hit.dba.id);
    const existing = event?.id ? list.find((e) => e.id === String(event.id)) : null;
    if (event?.id && !existing) return res.status(404).json({ ok: false, error: "That event no longer exists" });
    if (existing) {
      existing.title = title; existing.start = start; existing.end = end;
      existing.description = description; existing.link = link;
      existing.updated_at = new Date().toISOString();
    } else {
      if (list.length >= MAX_EVENTS) return res.status(400).json({ ok: false, error: "This calendar is full — delete some old events first" });
      list.push({
        id: randomUUID(), title, start, end, description, link,
        created_by: me.id, created_by_name: me.name || me.email,
        created_at: new Date().toISOString(),
      });
    }
    if (!(await saveEvents(hit.companyId, hit.dba.id, list))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit(me, existing ? "dba_event_updated" : "dba_event_created", hit.dba.id, { dba: hit.dba.name, title, start });
    return res.json({ ok: true });
  });
});

// POST /dba/event-delete {dbaId, eventId}
router.post("/dba/event-delete", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, eventId } = (req.body || {}) as Record<string, any>;
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
  const acc = dbaAccess(me, hit.companyId, hit.dba);
  if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  if (!canManageCalendar(me.id, acc.manage, cfg, hit.dba))
    return res.status(403).json({ ok: false, error: "Only the coach or an authorized leader can manage the calendar" });
  return withLock(`dba-events:${hit.dba.id}`, async () => {
    const list = await loadEvents(hit.companyId, hit.dba.id);
    const idx = list.findIndex((e) => e.id === String(eventId));
    if (idx < 0) return res.status(404).json({ ok: false, error: "That event no longer exists" });
    const [gone] = list.splice(idx, 1);
    if (!(await saveEvents(hit.companyId, hit.dba.id, list))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit(me, "dba_event_deleted", hit.dba.id, { dba: hit.dba.name, title: gone.title });
    return res.json({ ok: true });
  });
});

// POST /dba/cal-authority-set {dbaId, userId, allowed} — manager grants or
// revokes calendar authority (manage events + show own booking embed).
router.post("/dba/cal-authority-set", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, userId, allowed } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    if (allowed) cfg.cal[String(userId)] = true;
    else { delete cfg.cal[String(userId)]; delete cfg.booking[String(userId)]; }
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit(me, "dba_calendar_authority_changed", hit.dba.id, { dba: hit.dba.name, user: String(userId), allowed: !!allowed });
    return res.json({ ok: true });
  });
});

// POST /dba/booking-set {dbaId, url} — caller sets/clears their OWN booking
// link. Allowed for the coach/manager and calendar-authorized leaders.
router.post("/dba/booking-set", async (req: Request, res: Response) => {
  const me = await requireUserJwt(req);
  if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { dbaId, url } = (req.body || {}) as Record<string, any>;
  return withLock("dba-write", async () => {
    const hit = await findDbaAnywhere(String(dbaId || ""));
    if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
    const acc = dbaAccess(me, hit.companyId, hit.dba);
    if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
    const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
    const allowed = acc.manage || me.id === hit.dba.coach_id || canManageCalendar(me.id, acc.manage, cfg, hit.dba);
    if (!allowed) return res.status(403).json({ ok: false, error: "Only the coach or an authorized leader can add a booking calendar" });
    const clean = httpUrl(url);
    if (clean === null) return res.status(400).json({ ok: false, error: "That doesn't look like a valid https:// booking link" });
    if (clean) cfg.booking[me.id] = clean;
    else delete cfg.booking[me.id];
    if (!(await saveChatCfg(hit.companyId, hit.dba.id, cfg))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
    void audit(me, "dba_booking_link_set", hit.dba.id, { dba: hit.dba.name, cleared: !clean });
    return res.json({ ok: true });
  });
});

function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}

async function audit(admin: { id: string; name: string | null }, action: string, targetId: string, details: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "return=minimal" },
      body: JSON.stringify({
        action,
        actor_id: admin.id,
        actor_name: admin.name || "Admin",
        actor_role: "super_admin",
        target_type: "dba",
        target_id: targetId,
        details,
      }),
    });
  } catch {}
}

export default router;
