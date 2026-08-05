// invites.ts — admin view of everyone invited into the app.
//
// GET  /invites          → list every user in the admin's org with their
//                          invite status: whether they've ever signed in,
//                          and when the last invite email was sent.
// POST /invites/resend   → { email } — generate a fresh temp password,
//                          reset the person's login to it (must change on
//                          first sign-in) and re-send the welcome email.
// POST /invites/revoke   → { email } — "uninvite": deletes the login and
//                          profile. Refused if the person has already
//                          signed in (deactivate them instead).
//
// All endpoints require a verified super_admin JWT (requireAdminJwt).
// Invite-email history is kept per org in admin_settings key `invite_log`
// as { [email]: { at, ok } } — updated here and by /auth/provision.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { mailerConfigured, sendEmail, welcomeEmail } from "../lib/mailer";
import { requireAdminJwt } from "./auth";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ID = "b0000000-0000-0000-0000-000000000001";

const SVC_H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function rest<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SVC_H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}

// ── Auth admin helpers ────────────────────────────────────────────
type AuthInfo = { id: string; lastSignIn: string | null; createdAt: string | null };

/** Map email → auth user info for the whole project (paginated, bounded). */
async function listAuthUsers(): Promise<Map<string, AuthInfo>> {
  const map = new Map<string, AuthInfo>();
  const PER = 200;
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER}`,
      { headers: SVC_H },
    );
    if (!r.ok) break;
    const b: any = await r.json().catch(() => ({}));
    const users: any[] = Array.isArray(b?.users) ? b.users : [];
    for (const u of users) {
      const em = String(u?.email || "").toLowerCase();
      if (em) map.set(em, {
        id: String(u.id),
        lastSignIn: u.last_sign_in_at || null,
        createdAt: u.created_at || null,
      });
    }
    if (users.length < PER) break;
  }
  return map;
}

// ── Invite-email log (admin_settings, per org) ────────────────────
export async function readInviteLog(companyId: string): Promise<Record<string, any>> {
  const rows = await rest(
    `admin_settings?company_id=eq.${companyId}&key=eq.invite_log&select=value`,
  );
  try {
    const v = rows[0]?.value;
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function recordInviteEmail(
  companyId: string,
  email: string,
  ok: boolean,
): Promise<void> {
  try {
    const log = await readInviteLog(companyId);
    log[email.toLowerCase()] = { at: new Date().toISOString(), ok };
    await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ company_id: companyId, key: "invite_log", value: JSON.stringify(log) }),
    });
  } catch (e) {
    logger.warn({ err: e }, "[Invites] failed to record invite email");
  }
}

async function writeAudit(action: string, actor: { id: string; name: string | null }, details: Record<string, any>) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "return=minimal" },
      body: JSON.stringify({
        action,
        actor_id: actor.id,
        actor_name: actor.name || "Admin",
        actor_role: "super_admin",
        target_type: "user",
        details,
      }),
    });
  } catch {}
}

function genTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const router: IRouter = Router();

// ── GET /invites ──────────────────────────────────────────────────
router.get("/invites", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;

  const [profiles, authMap, log] = await Promise.all([
    rest(
      `user_profiles?company_id=eq.${companyId}&select=id,name,full_name,email,role,is_active,created_at&order=created_at.desc`,
    ),
    listAuthUsers(),
    readInviteLog(companyId),
  ]);

  const invites = profiles.map((p: any) => {
    const em = String(p.email || "").toLowerCase();
    const au = em ? authMap.get(em) : undefined;
    const sent = log[em] || null;
    return {
      id: p.id,
      name: p.name || p.full_name || em,
      email: em,
      role: p.role || "client",
      active: p.is_active !== false,
      hasLogin: !!au,
      joined: !!au?.lastSignIn, // has actually signed in at least once
      lastSignIn: au?.lastSignIn || null,
      invitedAt: au?.createdAt || p.created_at || null,
      lastEmailAt: sent?.at || null,
      lastEmailOk: sent ? !!sent.ok : null,
    };
  });

  return res.json({ ok: true, invites });
});

// ── POST /invites/resend ──────────────────────────────────────────
router.post("/invites/resend", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
  if (!mailerConfigured()) return res.status(503).json({ ok: false, error: "Email is not configured" });

  const rows = await rest(
    `user_profiles?company_id=eq.${companyId}&email=eq.${encodeURIComponent(email)}&select=id,name,full_name,coach_id`,
  );
  const profile = rows[0];
  if (!profile) return res.status(404).json({ ok: false, error: "No user with that email in your organization" });

  // Fresh temp password + reset the login to it (must change on first sign-in).
  const tempPassword = genTempPassword();
  const authMap = await listAuthUsers();
  const au = authMap.get(email);
  if (au) {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${au.id}`, {
      method: "PUT",
      headers: SVC_H,
      body: JSON.stringify({ password: tempPassword, user_metadata: { must_change_password: true } }),
    });
    if (!ur.ok) {
      const body = await ur.text().catch(() => "");
      logger.error({ status: ur.status, body, email }, "[Invites] password reset failed");
      return res.status(502).json({ ok: false, error: "Could not reset their login" });
    }
  } else {
    // No login yet — create one (pre-confirmed, must change password).
    const cr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: SVC_H,
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true, company_id: companyId },
      }),
    });
    if (!cr.ok) {
      const body = await cr.text().catch(() => "");
      logger.error({ status: cr.status, body, email }, "[Invites] login creation failed");
      return res.status(502).json({ ok: false, error: "Could not create their login" });
    }
  }

  let orgName = "Eden Communications";
  let orgSlug: string | null = null;
  const org = await rest(`organizations?id=eq.${companyId}&select=name,slug`);
  if (org[0]?.name) orgName = org[0].name;
  if (org[0]?.slug) orgSlug = org[0].slug;
  if (!org[0]?.name) {
    // Legacy fallback: companies row without a mirrored organization
    const co = await rest(`companies?id=eq.${companyId}&select=name`);
    if (co[0]?.name) orgName = co[0].name;
  }

  const m = welcomeEmail({
    clientName: profile.name || profile.full_name || email,
    email,
    tempPassword,
    orgName,
    orgSlug,
  });
  const sent = await sendEmail({ to: email, subject: m.subject, html: m.html, text: m.text, fromName: orgName });
  await recordInviteEmail(companyId, email, !!sent.ok);
  if (!sent.ok) {
    logger.warn({ email, error: sent.error }, "[Invites] resend failed");
    return res.status(502).json({ ok: false, error: "Email could not be sent — try again in a minute" });
  }
  await writeAudit("invite_resent", { id: admin.id, name: admin.name }, { email, name: profile.name || profile.full_name || email });
  logger.info({ adminId: admin.id, email }, "[Invites] invite re-sent");
  return res.json({ ok: true });
});

// ── POST /invites/revoke ──────────────────────────────────────────
router.post("/invites/revoke", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const companyId = admin.company_id || EDEN_ID;
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
  if (email === String(admin.name || "").toLowerCase()) {
    return res.status(400).json({ ok: false, error: "You can't uninvite yourself" });
  }

  const rows = await rest(
    `user_profiles?company_id=eq.${companyId}&email=eq.${encodeURIComponent(email)}&select=id,name,full_name`,
  );
  const profile = rows[0];
  if (!profile) return res.status(404).json({ ok: false, error: "No user with that email in your organization" });
  if (profile.id === admin.id) return res.status(400).json({ ok: false, error: "You can't uninvite yourself" });

  // Safety: never delete someone who has already signed in — that's a real
  // account with data. Deactivate them from the normal admin screens instead.
  const authMap = await listAuthUsers();
  const au = authMap.get(email);
  if (au?.lastSignIn) {
    return res.status(409).json({ ok: false, error: "They've already signed in — deactivate them instead of uninviting" });
  }

  // Delete: profile row, staff settings, then the login itself.
  await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${profile.id}&company_id=eq.${companyId}`, {
    method: "DELETE",
    headers: SVC_H,
  });
  await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`staff_meta:${profile.id}`)}`,
    { method: "DELETE", headers: SVC_H },
  );
  if (au) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${au.id}`, { method: "DELETE", headers: SVC_H });
  }
  // Clear their entry from the invite-email log.
  try {
    const log = await readInviteLog(companyId);
    if (log[email]) {
      delete log[email];
      await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
        method: "POST",
        headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ company_id: companyId, key: "invite_log", value: JSON.stringify(log) }),
      });
    }
  } catch {}

  await writeAudit("invite_revoked", { id: admin.id, name: admin.name }, { email, name: profile.name || profile.full_name || email });
  logger.info({ adminId: admin.id, email }, "[Invites] invite revoked");
  return res.json({ ok: true });
});

export default router;
