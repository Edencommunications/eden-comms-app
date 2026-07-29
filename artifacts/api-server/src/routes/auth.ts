// auth.ts — Supabase Auth account management (server-side, service role key).
//
// The React app signs users in directly against Supabase Auth (anon key).
// These endpoints cover the pieces that REQUIRE the service role key:
//
// POST /api/auth/provision   (requires a verified Supabase JWT of a super_admin)
//   Body: { email, password, name? }
//   Creates a pre-confirmed Supabase Auth user with must_change_password=true
//   so the person can sign in immediately with the temp password and is then
//   forced to set their own. Used by the admin Add User / bulk Add Clients
//   flows. Idempotent: an already-existing auth user returns ok+existed.
//
// POST /api/auth/migrate     (public, rate-limited)
//   Body: { email, password }
//   Legacy-login upgrade path: verifies the email+password against the old
//   plain-text user_profiles.temp_password, and when it matches creates the
//   matching pre-confirmed auth user (same password, must_change_password)
//   and clears the plain-text temp_password from user_profiles. The client
//   then signs in through real Supabase Auth.
//
// POST /api/auth/demo-session (public, rate-limited)
//   Body: { email, password }
//   The hardcoded demo accounts predate real auth and have no Supabase Auth
//   user. This endpoint verifies the credentials against the server's own
//   demo-account list (the same credentials already shown publicly on the
//   login page) and provisions/repairs the matching auth user so the demo
//   login also gets a real JWT session (needed for admin provisioning and
//   change-password). It can never touch non-demo emails.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { mailerConfigured, resetEmail, sendEmail } from "../lib/mailer";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const restHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

async function dbGet<T = any>(table: string, params: string): Promise<T[]> {
  // RLS blocks the anon key — server-side lookups use the service role key.
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: restHeaders(SERVICE_KEY || SUPABASE_ANON),
  });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}

// ── Supabase Auth admin API ───────────────────────────────────────
export type ProvisionResult =
  | { ok: true; existed: boolean; authUserId: string | null }
  | { ok: false; error: string };

/** Create a pre-confirmed Supabase Auth user. Safe to call when the user
 *  already exists. */
export async function provisionAuthUser(
  email: string,
  password: string,
  name?: string,
  mustChangePassword: boolean = true,
): Promise<ProvisionResult> {
  if (!SERVICE_KEY) return { ok: false, error: "Auth service is not configured (missing service role key)" };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: restHeaders(SERVICE_KEY),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { must_change_password: mustChangePassword, ...(name ? { name } : {}) },
    }),
  });
  const body: any = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, existed: false, authUserId: body?.id || null };
  if (body?.error_code === "email_exists" || /already.*registered|exists/i.test(String(body?.msg || ""))) {
    return { ok: true, existed: true, authUserId: null };
  }
  logger.warn({ status: r.status, body }, "[Auth] provision failed");
  return { ok: false, error: String(body?.msg || body?.message || `Auth API error (${r.status})`) };
}

// ── Caller verification: real Supabase JWT, then role check ──────
// The caller must send their Supabase Auth access token. We verify it against
// Supabase (server-side, cannot be forged), then map the token's email to a
// user_profiles row and require role=super_admin + active.
async function requireAdminJwt(req: Request): Promise<{ id: string } | null> {
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
  const rows = await dbGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&role=eq.super_admin&is_active=not.is.false&select=id`,
  );
  return rows[0] ? { id: rows[0].id } : null;
}

// ── Simple in-memory rate limiter (per key) ──────────────────────
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
// Periodic cleanup so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
}, 60_000).unref?.();

function clientIp(req: Request): string {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const router: IRouter = Router();

router.post("/auth/provision", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  const { email, password, name } = (req.body || {}) as Record<string, string>;
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
  if (!password || password.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
  const result = await provisionAuthUser(email, password, name);
  if (!result.ok) return res.status(502).json(result);
  logger.info({ adminId: admin.id, email: email.toLowerCase() }, "[Auth] admin provisioned auth user");
  return res.json(result);
});

router.post("/auth/migrate", async (req: Request, res: Response) => {
  const emailRaw = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");
  if (!emailRaw || !EMAIL_RE.test(emailRaw) || !password) {
    return res.status(400).json({ ok: false, error: "Email and password required" });
  }
  // Abuse controls: this endpoint checks legacy passwords, so throttle hard.
  if (rateLimited(`mig:${emailRaw}`, 5, 15 * 60_000) || rateLimited(`mig-ip:${clientIp(req)}`, 20, 15 * 60_000)) {
    return res.status(429).json({ ok: false, error: "Too many attempts — try again later" });
  }
  if (!SERVICE_KEY) return res.status(503).json({ ok: false, error: "Auth service is not configured" });

  const rows = await dbGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(emailRaw)}&select=id,name,temp_password,is_active`,
  );
  const profile = rows[0];
  // Same response for "no such user" and "wrong password" — no account probing.
  if (!profile || !profile.temp_password || profile.temp_password !== password) {
    return res.status(401).json({ ok: false, error: "Invalid email or password" });
  }
  if (profile.is_active === false) {
    return res.status(403).json({ ok: false, error: "Account deactivated" });
  }

  const result = await provisionAuthUser(emailRaw, password, profile.name);
  if (!result.ok) return res.status(502).json({ ok: false, error: result.error });

  // Retire the plain-text temp password now that the hashed auth account exists.
  const patch = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(profile.id)}`,
    {
      method: "PATCH",
      headers: restHeaders(SERVICE_KEY),
      body: JSON.stringify({ temp_password: null }),
    },
  );
  if (!patch.ok) logger.warn({ status: patch.status }, "[Auth] failed to clear temp_password after migration");

  logger.info({ email: emailRaw }, "[Auth] migrated legacy temp-password login to Supabase Auth");
  return res.json({ ok: true });
});

// POST /api/auth/reset-request — branded password-reset email.
// Generates a Supabase recovery link server-side and sends it through the
// org-branded mailer. Always responds generically (no account probing).
router.post("/auth/reset-request", async (req: Request, res: Response) => {
  const emailRaw = String((req.body || {}).email || "").trim().toLowerCase();
  if (!emailRaw || !EMAIL_RE.test(emailRaw)) {
    return res.status(400).json({ ok: false, error: "Valid email required" });
  }
  if (rateLimited(`reset:${emailRaw}`, 4, 15 * 60_000) || rateLimited(`reset-ip:${clientIp(req)}`, 15, 15 * 60_000)) {
    return res.status(429).json({ ok: false, error: "Too many attempts — try again later" });
  }

  // Respond immediately and identically for every well-formed request —
  // the actual lookup/link/send happens in the background, so neither the
  // body nor the response time reveals whether the account exists.
  res.json({ ok: true, message: "If an account exists, a reset link is on its way." });

  void (async () => {
    try {
      if (!SERVICE_KEY || !mailerConfigured()) {
        logger.warn("[Auth] reset-request but auth/mailer not configured");
        return;
      }
      const rows = await dbGet(
        "user_profiles",
        `email=eq.${encodeURIComponent(emailRaw)}&select=id,name,company_id,is_active`,
      );
      const profile = rows[0];
      if (!profile || profile.is_active === false) return;

      // Org branding for the email
      let orgName = "Eden Comms";
      if (profile.company_id) {
        const orgs = await dbGet("organizations", `id=eq.${encodeURIComponent(profile.company_id)}&select=name`);
        if (orgs[0]?.name) orgName = orgs[0].name;
      }

      // Server-owned destination only — caller input is never trusted here.
      // With no APP_URL set, Supabase falls back to its configured Site URL.
      const redirectTo = /^https?:\/\//i.test(process.env.APP_URL || "") ? process.env.APP_URL : undefined;
      const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: restHeaders(SERVICE_KEY),
        body: JSON.stringify({ type: "recovery", email: emailRaw, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
      });
      const linkBody: any = await linkRes.json().catch(() => ({}));
      const actionLink = String(linkBody?.action_link || "");
      if (!linkRes.ok || !actionLink) {
        logger.warn({ status: linkRes.status, body: linkBody?.msg }, "[Auth] generate_link failed");
        return;
      }

      const msg = resetEmail({ name: profile.name || "", orgName, actionLink });
      const sent = await sendEmail({ to: emailRaw, fromName: orgName, ...msg });
      if (!sent.ok) logger.warn({ error: sent.error }, "[Auth] reset email send failed");
    } catch (e) {
      logger.warn({ error: String(e) }, "[Auth] reset-request background task failed");
    }
  })();
});

// /auth/demo-session removed — demo accounts retired (task #71). Everyone
// signs in with a real Supabase Auth login.

export default router;
