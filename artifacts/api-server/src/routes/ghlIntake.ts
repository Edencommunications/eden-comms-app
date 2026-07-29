// ghlIntake.ts — GHL "contract signed" → auto-create client under the right coach.
//
// POST /api/webhooks/ghl-intake/:companyId   (secret required)
//   Body (GHL / Zapier friendly — several field spellings accepted):
//     { name | full_name | first_name+last_name, email, phone,
//       coach_email | assigned_user_email | user_email }
//   Creates the client profile (company + coach scoped), a client_access
//   record, and an in-app notification to the coach containing the client's
//   temp password (current demo-auth invite model).
//
// GET /api/webhooks/ghl-intake/:companyId/config
//   Returns the org's webhook URL + shared secret (shown in the Admin Panel).
//
// GET /api/webhooks/ghl-intake/:companyId/recent
//   Last received webhooks for this org (in-memory, for troubleshooting).
//
// Config + recent require a verified super_admin (x-admin-id header, checked
// server-side against user_profiles role + org membership).

import { Router, type IRouter, type Request } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { sendEmail, welcomeEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import { provisionAuthUser } from "./auth";

const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";

const H = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function dbGet<T = any>(table: string, params: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}
async function dbInsert(table: string, body: unknown): Promise<{ ok: boolean; rows: any[] | null; error?: string }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, rows: null, error: text };
  return { ok: true, rows: text ? JSON.parse(text) : null };
}

// ── Per-org shared secret ─────────────────────────────────────────
// Deterministic HMAC of the company id keyed by the server secret, so no
// schema changes are needed and the secret is stable across restarts.
const SECRET_KEY = process.env.SESSION_SECRET || "eden-ghl-intake-dev-key";
export function webhookSecretFor(companyId: string): string {
  return createHmac("sha256", SECRET_KEY).update(`ghl-intake:${companyId}`).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Webhook auth: either the shared secret in the x-webhook-secret header, or a
// signed payload — x-webhook-signature: t=<unix seconds>,v1=<hex hmac> where
// v1 = HMAC-SHA256(secret, `${t}.${rawBody}`), with a 5-minute tolerance.
function webhookAuthorized(req: Request, companyId: string): boolean {
  const secret = webhookSecretFor(companyId);
  const headerSecret = String(req.get("x-webhook-secret") || "").trim();
  if (headerSecret) return safeEqual(headerSecret, secret);

  const sig = String(req.get("x-webhook-signature") || "").trim();
  if (sig) {
    const m = /^t=(\d+),v1=([0-9a-f]+)$/i.exec(sig);
    if (!m) return false;
    const t = Number(m[1]);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!raw) return false;
    const expected = createHmac("sha256", secret).update(`${m[1]}.`).update(raw).digest("hex");
    return safeEqual(m[2].toLowerCase(), expected);
  }
  return false;
}

// Admin auth for the config/troubleshooting endpoints: the caller must present
// the profile id of a super_admin (x-admin-id header). The role and org
// membership are verified server-side against user_profiles — the admin must
// belong to this org, or to Eden (the platform owner manages all orgs).
async function requireAdmin(req: Request, companyId: string): Promise<boolean> {
  const adminId = String(req.get("x-admin-id") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(adminId)) return false;
  const rows = await dbGet(
    "user_profiles",
    `id=eq.${encodeURIComponent(adminId)}&role=eq.super_admin&is_active=not.is.false&select=id,company_id`,
  );
  const admin = rows[0];
  if (!admin) return false;
  return admin.company_id === companyId || admin.company_id === EDEN_ORG_ID;
}

// ── Recent webhook log (in-memory ring buffer for troubleshooting) ─
type WebhookLogEntry = {
  at: string;
  companyId: string;
  status: string;
  detail: string;
  payload?: unknown;
};
const recentWebhooks: WebhookLogEntry[] = [];
function logWebhook(entry: WebhookLogEntry) {
  recentWebhooks.unshift(entry);
  if (recentWebhooks.length > 100) recentWebhooks.length = 100;
  logger.info({ ghlIntake: entry }, "[GHL Intake] webhook received");
}

// ── Payload parsing (accept GHL & Zapier field spellings) ─────────
function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
function parsePayload(body: any) {
  const b = body || {};
  const contact = b.contact || b;
  const first = pick(contact, ["first_name", "firstName"]);
  const last = pick(contact, ["last_name", "lastName"]);
  const name =
    pick(contact, ["name", "full_name", "fullName", "contact_name"]) ||
    [first, last].filter(Boolean).join(" ");
  const email = pick(contact, ["email", "contact_email"]).toLowerCase();
  const phone = pick(contact, ["phone", "phone_number", "contact_phone"]);
  const coachEmail = pick(b, [
    "coach_email",
    "coachEmail",
    "assigned_user_email",
    "assignedUserEmail",
    "user_email",
    "assigned_to_email",
  ]).toLowerCase();
  return { name, email, phone, coachEmail };
}

const router: IRouter = Router();

// Config endpoint for the Admin Panel (per-org webhook URL + secret).
// Requires a verified super_admin of this org (or of Eden, the platform owner).
router.get("/webhooks/ghl-intake/:companyId/config", async (req, res) => {
  const { companyId } = req.params;
  if (!(await requireAdmin(req, companyId))) {
    return res.status(403).json({ error: "Admin access required" });
  }
  const orgs = await dbGet("organizations", `id=eq.${encodeURIComponent(companyId)}&select=id,name`);
  if (!orgs.length) return res.status(404).json({ error: "Unknown organization" });
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || "https";
  return res.json({
    url: `${proto}://${host}/api/webhooks/ghl-intake/${companyId}`,
    secret: webhookSecretFor(companyId),
    header: "x-webhook-secret",
  });
});

// Recent webhook activity for one org (admin-only, for troubleshooting)
router.get("/webhooks/ghl-intake/:companyId/recent", async (req, res) => {
  const { companyId } = req.params;
  if (!(await requireAdmin(req, companyId))) {
    return res.status(403).json({ error: "Admin access required" });
  }
  return res.json(recentWebhooks.filter((e) => e.companyId === companyId).slice(0, 25));
});

// The webhook itself
router.post("/webhooks/ghl-intake/:companyId", async (req, res) => {
  const { companyId } = req.params;
  const fail = (code: number, status: string, detail: string) => {
    logWebhook({ at: new Date().toISOString(), companyId, status, detail, payload: req.body });
    return res.status(code).json({ ok: false, error: detail });
  };

  if (!webhookAuthorized(req, companyId)) {
    return fail(401, "rejected", "Invalid or missing webhook secret/signature");
  }

  const orgs = await dbGet("organizations", `id=eq.${encodeURIComponent(companyId)}&select=id,name,is_active`);
  if (!orgs.length) return fail(404, "rejected", "Unknown organization");

  const { name, email, phone, coachEmail } = parsePayload(req.body);
  if (!name || !email) return fail(400, "rejected", "Missing client name or email");

  // Duplicate check — same email already has a profile
  const existing = await dbGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&select=id,company_id,role`,
  );
  if (existing.length) {
    logWebhook({
      at: new Date().toISOString(),
      companyId,
      status: "duplicate",
      detail: `${email} already exists — no changes made`,
    });
    return res.status(200).json({ ok: true, duplicate: true, message: `${email} already has a profile` });
  }

  // Resolve the coach by email within this company
  let coach: any = null;
  if (coachEmail) {
    const coaches = await dbGet(
      "user_profiles",
      `email=eq.${encodeURIComponent(coachEmail)}&company_id=eq.${encodeURIComponent(companyId)}&role=in.(coach,head_coach)&select=id,name,email`,
    );
    coach = coaches[0] || null;
  }
  if (coachEmail && !coach) {
    return fail(422, "rejected", `No coach with email ${coachEmail} found in this organization`);
  }

  // Create the real (Supabase Auth) login first — hashed password, forced
  // "set your own password" on first sign-in. No plain-text storage.
  const tempPass = `Eden${Math.random().toString(36).slice(2, 6).toUpperCase()}${Math.floor(10 + Math.random() * 90)}!`;
  const auth = await provisionAuthUser(email, tempPass, name);
  if (!auth.ok) return fail(500, "error", `Could not create login for client: ${auth.error}`);

  const initials = name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const profile: Record<string, unknown> = {
    id: randomUUID(),
    name,
    email,
    role: "client",
    initials,
    company_id: companyId,
    coach_id: coach?.id || null,
    update_day: "Wednesday",
  };
  if (phone) profile.phone = phone;

  let ins = await dbInsert("user_profiles", profile);
  if (!ins.ok && phone) {
    // phone column may not exist — retry without it
    delete profile.phone;
    ins = await dbInsert("user_profiles", profile);
  }
  if (!ins.ok) return fail(500, "error", `Could not create client profile: ${ins.error}`);
  const profileId = ins.rows?.[0]?.id || profile.id;

  // Email the client their login details (task #46). Falls back to the
  // coach/admin notification path below if sending fails.
  let emailSent = false;
  let emailError = "";
  {
    const orgName = orgs[0].name || "Eden Comms";
    const msg = welcomeEmail({
      clientName: name,
      email,
      tempPassword: tempPass,
      orgName,
      coachName: coach?.name || null,
    });
    const sent = await sendEmail({ to: email, fromName: orgName, ...msg });
    emailSent = sent.ok;
    if (!sent.ok) {
      emailError = sent.error;
      logger.warn({ error: sent.error, email }, "[GHL Intake] welcome email failed");
    }
  }

  // Link client to coach
  if (coach) {
    const access = await dbInsert("client_access", {
      company_id: companyId,
      staff_id: coach.id,
      client_id: profileId,
      permissions: { messages: true, diet: true, labs: true, workout: true, checkins: true, habits: true },
      assigned_by: null,
    });
    if (!access.ok) logger.warn({ error: access.error }, "[GHL Intake] client_access insert failed");

    // In-app "invite" notification to the coach with the temp password
    const notif = await dbInsert("notifications", {
      recipient_id: coach.id,
      type: "ghl_intake",
      body: emailSent
        ? `🤝 New client auto-imported from GHL: ${name} (${email}). They've been emailed their login details and will set their own password on first sign-in.`
        : `🤝 New client auto-imported from GHL: ${name} (${email}). ⚠️ The login email could NOT be sent — temp password: ${tempPass}. Please send them their login details manually.`,
      is_read: false,
    });
    if (!notif.ok) logger.warn({ error: notif.error }, "[GHL Intake] notification insert failed");
  }

  // Also notify every admin of this organization
  try {
    const admins = await dbGet(
      "user_profiles",
      `company_id=eq.${encodeURIComponent(companyId)}&role=eq.super_admin&select=id`,
    );
    for (const admin of admins) {
      const adminNotif = await dbInsert("notifications", {
        recipient_id: admin.id,
        type: "ghl_intake",
        body: `🤝 New client auto-imported from GHL: ${name} (${email})${coach ? ` under coach ${coach.name}` : " — no coach assigned yet"}. ${emailSent ? "They've been emailed their login details." : `⚠️ Login email failed — temp password: ${tempPass}. Send it to them manually.`} They now appear in your Clients tab.`,
        is_read: false,
      });
      if (!adminNotif.ok) logger.warn({ error: adminNotif.error }, "[GHL Intake] admin notification insert failed");
    }
  } catch (e) {
    logger.warn({ error: String(e) }, "[GHL Intake] admin notification lookup failed");
  }

  logWebhook({
    at: new Date().toISOString(),
    companyId,
    status: "created",
    detail: `Created client ${name} <${email}>${coach ? ` under coach ${coach.name}` : " (no coach assigned)"}${emailSent ? " — login email sent" : ` — login email FAILED (${emailError})`}`,
  });
  return res.status(201).json({
    ok: true,
    client_id: profileId,
    coach: coach ? { id: coach.id, name: coach.name } : null,
    login_email_sent: emailSent,
  });
});

export default router;
