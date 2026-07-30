// bulkImport.ts — one-shot roster import for orgs moving from another system.
//
// POST /api/admin/bulk-import   (requires a verified super_admin Supabase JWT)
//   Body: { rows: [{ name, email, role?, coach_email?, phone?, start_date? }],
//           send_emails?: boolean }
//
//   Creates coaches FIRST, then clients — so a client whose coach is in the
//   same file lands under the right coach automatically. Each new person gets
//   a real Supabase Auth login (temp password, forced change on first sign-in)
//   and, when send_emails is on, a branded welcome email with their login.
//   Existing emails are skipped (never modified). Returns a per-row report.

import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { sendEmail, welcomeEmail, mailerConfigured } from "../lib/mailer";
import { logger } from "../lib/logger";
import { provisionAuthUser, requireAdminJwt } from "./auth";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function dbGet<T = any>(table: string, params: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}
async function dbInsert(table: string, body: unknown): Promise<{ ok: boolean; rows: any[] | null; error?: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) return { ok: false, rows: null, error: text };
  return { ok: true, rows: text ? JSON.parse(text) : null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 500;
const ROLES = new Set(["coach", "head_coach", "client"]);

type InRow = { name?: string; email?: string; role?: string; coach_email?: string; phone?: string; start_date?: string };
type Report = { email: string; name: string; role: string; status: "created" | "skipped" | "error"; detail?: string; temp_password?: string };

const tempPass = () =>
  `Eden${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.floor(10 + Math.random() * 90)}!`;

// A row can reach us with an auth user already in Supabase Auth but NO
// user_profiles row (orphan from a past partial failure — we only get here
// after the profile-existence check). The freshly generated temp password was
// NOT set on that account, so set it explicitly before handing out
// credentials. Never called for anyone with a live profile.
async function setOrphanAuthPassword(email: string, password: string): Promise<boolean> {
  try {
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=100&page=${page}`, { headers: H });
      if (!r.ok) return false;
      const body: any = await r.json().catch(() => ({}));
      const users: any[] = body?.users || [];
      if (!users.length) return false;
      const hit = users.find((u) => String(u.email || "").toLowerCase() === email);
      if (hit) {
        const put = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${hit.id}`, {
          method: "PUT",
          headers: H,
          body: JSON.stringify({ password, user_metadata: { ...(hit.user_metadata || {}), must_change_password: true } }),
        });
        return put.ok;
      }
    }
    return false;
  } catch {
    return false;
  }
}
const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const router: IRouter = Router();

router.post("/admin/bulk-import", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  if (!SB_KEY) return res.status(503).json({ ok: false, error: "Server is not configured (missing service key)" });

  const companyId = admin.company_id;
  if (!companyId) return res.status(400).json({ ok: false, error: "Your admin profile has no organization set" });

  const body = (req.body || {}) as { rows?: InRow[]; send_emails?: boolean };
  const sendEmails = body.send_emails !== false && mailerConfigured();
  const raw = Array.isArray(body.rows) ? body.rows : [];
  if (!raw.length) return res.status(400).json({ ok: false, error: "No rows to import" });
  if (raw.length > MAX_ROWS) return res.status(400).json({ ok: false, error: `Too many rows — max ${MAX_ROWS} per import` });

  // ── Normalize + validate + in-file dedupe ─────────────────────
  const seen = new Set<string>();
  const report: Report[] = [];
  const cleaned: { name: string; email: string; role: string; coach_email: string; phone: string; start_date: string }[] = [];
  for (const r of raw) {
    const name = String(r.name || "").trim();
    const email = String(r.email || "").trim().toLowerCase();
    let role = String(r.role || "client").trim().toLowerCase().replace(/\s+/g, "_");
    if (role === "headcoach" || role === "head") role = "head_coach";
    if (!ROLES.has(role)) role = "client";
    const coach_email = String(r.coach_email || "").trim().toLowerCase();
    if (!name || !email || !EMAIL_RE.test(email)) {
      report.push({ email: email || "(missing)", name: name || "(missing)", role, status: "error", detail: "Missing or invalid name/email" });
      continue;
    }
    if (seen.has(email)) {
      report.push({ email, name, role, status: "skipped", detail: "Duplicate row in file" });
      continue;
    }
    seen.add(email);
    cleaned.push({ name, email, role, coach_email, phone: String(r.phone || "").trim(), start_date: String(r.start_date || "").trim() });
  }
  if (!cleaned.length) return res.json({ ok: true, created: 0, skipped: 0, errors: report.length, report });

  // ── Who already exists? (skip, never modify) ──────────────────
  const emailList = cleaned.map((r) => `"${r.email}"`).join(",");
  const existing = await dbGet("user_profiles", `email=in.(${emailList})&select=email`);
  const existingSet = new Set(existing.map((e: any) => String(e.email || "").toLowerCase()));

  // ── Coach directory: existing org coaches + coaches created below ─
  const orgCoaches = await dbGet(
    "user_profiles",
    `company_id=eq.${encodeURIComponent(companyId)}&role=in.(coach,head_coach)&is_active=not.is.false&select=id,name,email`,
  );
  const coachByEmail = new Map<string, { id: string; name: string }>();
  for (const c of orgCoaches) coachByEmail.set(String(c.email || "").toLowerCase(), { id: c.id, name: c.name });

  const orgs = await dbGet("organizations", `id=eq.${encodeURIComponent(companyId)}&select=name`);
  const orgName = orgs[0]?.name || "Eden Comms";

  // Coaches first, then clients — so same-file coach links resolve.
  const ordered = [...cleaned.filter((r) => r.role !== "client"), ...cleaned.filter((r) => r.role === "client")];

  let created = 0;
  for (const r of ordered) {
    if (existingSet.has(r.email)) {
      report.push({ email: r.email, name: r.name, role: r.role, status: "skipped", detail: "Already has an account — left untouched" });
      continue;
    }
    // Resolve coach for clients (coach may have just been created above)
    let coach: { id: string; name: string } | null = null;
    if (r.role === "client" && r.coach_email) {
      coach = coachByEmail.get(r.coach_email) || null;
      if (!coach) {
        report.push({ email: r.email, name: r.name, role: r.role, status: "error", detail: `Coach ${r.coach_email} not found (not in this file or your team)` });
        continue;
      }
    }

    const pass = tempPass();
    const auth = await provisionAuthUser(r.email, pass, r.name);
    if (!auth.ok) {
      report.push({ email: r.email, name: r.name, role: r.role, status: "error", detail: `Could not create login: ${auth.error}` });
      continue;
    }
    if (auth.existed) {
      // Orphaned auth account (no profile) — the generated password isn't on
      // it yet. Set it, or fail the row rather than hand out bad credentials.
      const reset = await setOrphanAuthPassword(r.email, pass);
      if (!reset) {
        report.push({ email: r.email, name: r.name, role: r.role, status: "error", detail: "A login for this email already exists but couldn't be reset — remove it in Supabase Auth or use the password-reset flow" });
        continue;
      }
    }

    const profile: Record<string, unknown> = {
      id: randomUUID(),
      name: r.name,
      email: r.email,
      role: r.role,
      initials: initialsOf(r.name),
      company_id: companyId,
      coach_id: coach?.id || null,
      ...(r.role === "client" ? { update_day: "Wednesday" } : {}),
    };
    if (r.phone) profile.phone = r.phone;
    if (r.start_date && /^\d{4}-\d{2}-\d{2}$/.test(r.start_date)) profile.start_date = r.start_date;

    let ins = await dbInsert("user_profiles", profile);
    if (!ins.ok && (profile.phone || profile.start_date)) {
      delete profile.phone;
      delete profile.start_date;
      ins = await dbInsert("user_profiles", profile);
    }
    if (!ins.ok) {
      // Concurrent import / unique-email conflict → deterministic skip, not error
      if (/23505|duplicate key/i.test(ins.error || "")) {
        report.push({ email: r.email, name: r.name, role: r.role, status: "skipped", detail: "Already has an account — left untouched" });
      } else {
        report.push({ email: r.email, name: r.name, role: r.role, status: "error", detail: "Login created but profile save failed — try re-importing this row" });
      }
      continue;
    }
    const profileId = ins.rows?.[0]?.id || (profile.id as string);
    existingSet.add(r.email);
    if (r.role !== "client") coachByEmail.set(r.email, { id: profileId, name: r.name });

    // Client ↔ coach access link
    if (r.role === "client" && coach) {
      const access = await dbInsert("client_access", {
        company_id: companyId,
        staff_id: coach.id,
        client_id: profileId,
        permissions: { messages: true, diet: true, labs: true, workout: true, checkins: true, habits: true },
        assigned_by: admin.id,
      });
      if (!access.ok) logger.warn({ error: access.error }, "[Bulk Import] client_access insert failed");
    }

    // Welcome email with login details
    let entry: Report = { email: r.email, name: r.name, role: r.role, status: "created" };
    if (sendEmails) {
      const msg = welcomeEmail({ clientName: r.name, email: r.email, tempPassword: pass, orgName, coachName: coach?.name || null });
      const sent = await sendEmail({ to: r.email, fromName: orgName, ...msg });
      if (sent.ok) entry.detail = "Login emailed";
      else { entry.detail = "Created, but the login email failed — share their temp password manually"; entry.temp_password = pass; }
    } else {
      entry.detail = "Created (no email sent)";
      entry.temp_password = pass;
    }
    report.push(entry);
    created++;
  }

  const skipped = report.filter((x) => x.status === "skipped").length;
  const errors = report.filter((x) => x.status === "error").length;
  logger.info({ adminId: admin.id, companyId, created, skipped, errors }, "[Bulk Import] finished");
  return res.json({ ok: true, created, skipped, errors, report });
});

export default router;
