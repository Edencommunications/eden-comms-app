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
import { mailerConfigured, resetEmail, sendEmail, welcomeEmail } from "../lib/mailer";

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
  // Stamped onto the login itself so an orphaned login (auth user without a
  // user_profiles row) can still be attributed to its company + intended role
  // by the Login Health audit.
  extraMeta: Record<string, string> = {},
): Promise<ProvisionResult> {
  if (!SERVICE_KEY) return { ok: false, error: "Auth service is not configured (missing service role key)" };
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: restHeaders(SERVICE_KEY),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { must_change_password: mustChangePassword, ...(name ? { name } : {}), ...extraMeta },
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

/** Locate a Supabase Auth user's id by email — strictly read-only.
 *  Tries the admin list with the `filter` param first (fast path on GoTrue
 *  versions that support it), then falls back to plain pagination through
 *  GET /admin/users, matching the exact email. Never creates or mutates
 *  auth state. */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const matchIn = (users: any[]): string | null => {
    const hit = (Array.isArray(users) ? users : []).find(
      (u: any) => String(u?.email || "").toLowerCase() === email,
    );
    return hit?.id ? String(hit.id) : null;
  };
  try {
    const lr = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`,
      { headers: restHeaders(SERVICE_KEY) },
    );
    if (lr.ok) {
      const lb: any = await lr.json().catch(() => ({}));
      const id = matchIn(lb?.users);
      if (id) return id;
    }
  } catch {}
  // Fallback: full pagination (read-only). Bounded to keep the request sane.
  const PER_PAGE = 200;
  const MAX_PAGES = 50; // up to 10k users
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
        { headers: restHeaders(SERVICE_KEY) },
      );
      if (!r.ok) break;
      const b: any = await r.json().catch(() => ({}));
      const users = Array.isArray(b?.users) ? b.users : [];
      const id = matchIn(users);
      if (id) return id;
      if (users.length < PER_PAGE) break; // last page
    }
  } catch {}
  return null;
}

// ── Caller verification: real Supabase JWT, then role check ──────
// The caller must send their Supabase Auth access token. We verify it against
// Supabase (server-side, cannot be forged), then map the token's email to a
// user_profiles row and require role=super_admin + active.
export async function requireAdminJwt(req: Request): Promise<{ id: string; company_id: string | null; name: string | null } | null> {
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
    `email=eq.${encodeURIComponent(email)}&role=eq.super_admin&is_active=not.is.false&select=id,company_id,name`,
  );
  return rows[0] ? { id: rows[0].id, company_id: rows[0].company_id || null, name: rows[0].name || null } : null;
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
  const { email, password, name, role } = (req.body || {}) as Record<string, string>;
  if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
  if (!password || password.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
  // Attribution stamp: the creating admin's company (admins only create logins
  // inside their own org) plus the intended role, if the caller sent one.
  const meta: Record<string, string> = {};
  if (admin.company_id) meta.company_id = admin.company_id;
  if (role && ["client", "coach", "head_coach", "super_admin"].includes(role)) meta.intended_role = role;
  const result = await provisionAuthUser(email, password, name, true, meta);
  if (!result.ok) return res.status(502).json(result);
  logger.info({ adminId: admin.id, email: email.toLowerCase() }, "[Auth] admin provisioned auth user");
  // Email the new user their login details automatically so the admin
  // never has to send credentials by hand. Best-effort: a mail failure
  // must not fail the provisioning itself.
  let emailed = false;
  if (mailerConfigured()) {
    try {
      let orgName = "Eden Communications";
      if (admin.company_id) {
        const org = await dbGet("companies", `id=eq.${encodeURIComponent(admin.company_id)}&select=name`);
        if (org?.[0]?.name) orgName = org[0].name;
      }
      const m = welcomeEmail({
        clientName: name || email,
        email: email.toLowerCase(),
        tempPassword: password,
        orgName,
      });
      const sent = await sendEmail({ to: email.toLowerCase(), subject: m.subject, html: m.html, text: m.text, fromName: orgName });
      emailed = !!sent.ok;
      if (!sent.ok) logger.warn({ email: email.toLowerCase(), error: sent.error }, "[Auth] welcome email failed");
    } catch (e) {
      logger.warn({ err: e }, "[Auth] welcome email errored");
    }
    // Record the send in the org's invite log so the Invites screen can show
    // whether/when each person got their login email.
    try {
      const { recordInviteEmail } = await import("./invites");
      await recordInviteEmail(admin.company_id || "b0000000-0000-0000-0000-000000000001", email.toLowerCase(), emailed);
    } catch {}
  }
  return res.json({ ...result, emailed });
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
  return;
});

// POST /api/auth/update-identity — fix a typo in an existing user's name or
// email (requires a verified super_admin JWT). Updates user_profiles AND the
// matching Supabase Auth login email (service key), then writes a
// 'profile_updated' audit_logs row with old → new values.
router.post("/auth/update-identity", async (req: Request, res: Response) => {
  const admin = await requireAdminJwt(req);
  if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
  if (!SERVICE_KEY) return res.status(503).json({ ok: false, error: "Auth service is not configured" });

  const id = String((req.body || {}).id || "").trim();
  const nameRaw = (req.body || {}).name;
  const emailRaw = (req.body || {}).email;
  if (!id) return res.status(400).json({ ok: false, error: "User id required" });

  const newName = nameRaw === undefined || nameRaw === null ? undefined : String(nameRaw).trim();
  const newEmail = emailRaw === undefined || emailRaw === null ? undefined : String(emailRaw).trim().toLowerCase();
  if (newName !== undefined && !newName) return res.status(400).json({ ok: false, error: "Name cannot be empty" });
  if (newEmail !== undefined && !EMAIL_RE.test(newEmail)) return res.status(400).json({ ok: false, error: "Valid email required" });

  const rows = await dbGet(
    "user_profiles",
    `id=eq.${encodeURIComponent(id)}&select=id,name,email,role,company_id`,
  );
  const profile = rows[0];
  if (!profile) return res.status(404).json({ ok: false, error: "User not found" });
  // Tenant scoping: an org admin can only edit users inside their own org.
  // (Eden's org admins manage the Eden org; other orgs are isolated.)
  const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
  if (admin.company_id && admin.company_id !== EDEN_ORG_ID && profile.company_id && profile.company_id !== admin.company_id) {
    return res.status(403).json({ ok: false, error: "You can only edit users in your own organization" });
  }

  const oldName = String(profile.name || "");
  const oldEmail = String(profile.email || "").toLowerCase();
  const nameChanged = newName !== undefined && newName !== oldName;
  const emailChanged = newEmail !== undefined && newEmail !== oldEmail;
  if (!nameChanged && !emailChanged) return res.json({ ok: true, changed: false });

  // Pre-checks + read-only auth lookup happen BEFORE any write.
  let authUserId: string | null = null;
  if (emailChanged) {
    // No other profile may already use the new email.
    const dupes = await dbGet("user_profiles", `email=eq.${encodeURIComponent(newEmail!)}&select=id`);
    if (dupes.length > 0) return res.status(409).json({ ok: false, error: "That email already belongs to another account" });
    // Read-only lookup of the Supabase Auth user by the OLD email. A legacy
    // account (temp-password, no auth user yet) simply has nothing to update.
    authUserId = await findAuthUserIdByEmail(oldEmail);
    if (!authUserId) logger.info({ oldEmail }, "[Auth] update-identity: no auth user for old email (legacy account)");
  }

  // Write 1: user_profiles (the app's source of truth) first, so a failure
  // here leaves everything untouched.
  const patchBody: Record<string, string> = {};
  if (nameChanged) patchBody.name = newName!;
  if (emailChanged) patchBody.email = newEmail!;
  const patch = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: restHeaders(SERVICE_KEY),
    body: JSON.stringify(patchBody),
  });
  if (!patch.ok) {
    const pb = await patch.text().catch(() => "");
    logger.error({ status: patch.status, body: pb }, "[Auth] update-identity profile patch failed");
    return res.status(502).json({ ok: false, error: "Could not save the profile changes" });
  }

  // Write 2: the Supabase Auth login email (admin update — no confirmation
  // email round-trip). If this fails, roll the profile back so the login
  // email and the profile email can never disagree.
  let authUpdated = false;
  if (emailChanged && authUserId) {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
      method: "PUT",
      headers: restHeaders(SERVICE_KEY),
      body: JSON.stringify({ email: newEmail, email_confirm: true }),
    });
    if (!ur.ok) {
      const ub: any = await ur.json().catch(() => ({}));
      logger.warn({ status: ur.status, body: ub }, "[Auth] update-identity auth email change failed — rolling back profile");
      const rollback = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: restHeaders(SERVICE_KEY),
        body: JSON.stringify({ name: oldName, email: oldEmail }),
      });
      if (!rollback.ok) logger.error({ status: rollback.status }, "[Auth] update-identity profile rollback ALSO failed — manual fix needed");
      return res.status(502).json({ ok: false, error: String(ub?.msg || ub?.message || "Could not update the login email — nothing was changed") });
    }
    authUpdated = true;
  }

  // Best-effort: refresh the display name stored on the auth user's metadata.
  if (nameChanged && !emailChanged) {
    void (async () => {
      try {
        const uid = await findAuthUserIdByEmail(oldEmail);
        if (uid) {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, {
            method: "PUT",
            headers: restHeaders(SERVICE_KEY),
            body: JSON.stringify({ user_metadata: { name: newName } }),
          });
        }
      } catch {}
    })();
  }

  // Audit trail: who changed it, old → new, timestamped (created_at default).
  const audit = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
    method: "POST",
    headers: { ...restHeaders(SERVICE_KEY), Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "profile_updated",
      actor_id: admin.id,
      actor_name: admin.name || "Admin",
      actor_role: "super_admin",
      target_type: "user_profile",
      target_id: id,
      details: {
        name: nameChanged ? newName : oldName,
        old: { name: oldName, email: oldEmail },
        new: { name: nameChanged ? newName : oldName, email: emailChanged ? newEmail : oldEmail },
        auth_email_updated: authUpdated,
      },
    }),
  });
  if (!audit.ok) logger.warn({ status: audit.status }, "[Auth] update-identity audit insert failed");

  logger.info({ adminId: admin.id, target: id, nameChanged, emailChanged, authUpdated }, "[Auth] identity updated");
  return res.json({ ok: true, changed: true, authUpdated, name: nameChanged ? newName : oldName, email: emailChanged ? newEmail : oldEmail });
});

// /auth/demo-session removed — demo accounts retired (task #71). Everyone
// signs in with a real Supabase Auth login.

export default router;
