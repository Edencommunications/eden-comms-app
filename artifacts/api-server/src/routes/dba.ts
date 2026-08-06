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

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ID = "b0000000-0000-0000-0000-000000000001";

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
export type DbaMember = { id: string | null; email: string; name: string; added_at: string };
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

/** Used by auth.ts reset-request: the first active DBA an email belongs to. */
export async function findDbaBrandForEmail(
  email: string,
): Promise<{ name: string; slug: string } | null> {
  const norm = email.toLowerCase();
  const all = await loadAllDbas();
  const hit = all.find(
    (x) => x.dba.is_active && x.dba.members.some((m) => m.email.toLowerCase() === norm),
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

// ── Admin: list org DBAs ──────────────────────────────────────────
router.get("/dba/list", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;
  const [allowed, dbas] = await Promise.all([dbaAllowedForOrg(companyId), loadOrgDbas(companyId)]);
  return res.json({ ok: true, allowed, dbas: dbas.sort((a, b) => a.created_at.localeCompare(b.created_at)) });
});

// ── Admin: create / update a DBA ─────────────────────────────────
router.post("/dba/save", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;
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
    name,
    slug,
    coach_id: coachId,
    coach_name: coachName,
    logo_url: typeof b.logoUrl === "string" ? b.logoUrl.trim() || null : existing?.logo_url || null,
    brand_color: b.brandColor !== undefined ? hex(b.brandColor) : existing?.brand_color || null,
    brand_colors: Array.isArray(b.brandColors)
      ? (b.brandColors.map(hex).filter(Boolean) as string[]).slice(0, 4)
      : existing?.brand_colors || [],
    is_active: existing ? existing.is_active : true,
    created_at: existing?.created_at || new Date().toISOString(),
    members: existing?.members || [],
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
  const companyId = admin.company_id || EDEN_ID;
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
  const companyId = admin.company_id || EDEN_ID;
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
      body: JSON.stringify({ email, name, role: "dba_member", company_id: companyId }),
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

  dba.members.push({ id: profile?.id || null, email, name: profile?.name || name, added_at: new Date().toISOString() });
  if (!(await saveDbaRow(companyId, dba))) return res.status(502).json({ ok: false, error: "Couldn't save the membership — try again" });
  try {
    const { recordInviteEmail } = await import("./invites");
    await recordInviteEmail(companyId, email, emailed);
  } catch {}
  void audit(admin, "dba_member_added", dba.id, { dba: dba.name, member: email });
  return res.json({ ok: true, dba, emailed, existed: existedLogin });
  });
});

// ── Admin: remove a member (keeps their login/profile) ──────────
router.post("/dba/member-remove", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;
  const { dbaId } = (req.body || {}) as Record<string, any>;
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  return withLock("dba-write", async () => {
  const dba = (await loadOrgDbas(companyId)).find((d) => d.id === dbaId);
  if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
  const before = dba.members.length;
  dba.members = dba.members.filter((m) => m.email.toLowerCase() !== email);
  if (dba.members.length === before) return res.status(404).json({ ok: false, error: "Not a member" });
  if (!(await saveDbaRow(companyId, dba))) return res.status(502).json({ ok: false, error: "Couldn't save — try again" });
  void audit(admin, "dba_member_removed", dba.id, { dba: dba.name, member: email });
  return res.json({ ok: true, dba });
  });
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
        (me.role === "super_admin" && me.company_id === companyId)),
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
