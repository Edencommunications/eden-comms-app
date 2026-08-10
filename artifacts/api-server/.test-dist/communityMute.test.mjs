var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/logger.ts
import pino from "pino";
var isProduction, logger;
var init_logger = __esm({
  "src/lib/logger.ts"() {
    "use strict";
    isProduction = process.env.NODE_ENV === "production";
    logger = pino({
      level: process.env.LOG_LEVEL ?? "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers['set-cookie']"
      ],
      ...isProduction ? {} : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true }
        }
      }
    });
  }
});

// src/routes/checkinForm.ts
import { Router } from "express";
async function svcGet(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SH });
  if (!r.ok) return [];
  return await r.json().catch(() => []);
}
async function requireStaff(req) {
  const auth2 = String(req.get("authorization") || "");
  const token = auth2.startsWith("Bearer ") ? auth2.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await svcGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,role,company_id`
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID };
}
async function authorizeScope(caller, coachId) {
  if (!coachId) {
    if (caller.role !== "super_admin") return null;
    return { companyId: caller.company_id, key: "checkin_form" };
  }
  if (caller.role === "super_admin") {
    const rows = await svcGet("user_profiles", `id=eq.${encodeURIComponent(coachId)}&select=id,company_id`);
    if (!rows[0]) return null;
    if ((rows[0].company_id || EDEN_ORG_ID) !== caller.company_id) return null;
    return { companyId: caller.company_id, key: `checkin_form:${coachId}` };
  }
  if (coachId !== caller.id) return null;
  return { companyId: caller.company_id, key: `checkin_form:${caller.id}` };
}
function sanitizeForm(raw) {
  if (!raw || typeof raw !== "object") return null;
  const off = Array.isArray(raw.off) ? raw.off.filter((k) => typeof k === "string").slice(0, 50) : [];
  const custom = Array.isArray(raw.custom) ? raw.custom.filter((c) => c && typeof c.label === "string" && c.label.trim()).slice(0, 30).map((c) => ({
    id: String(c.id || Date.now()),
    label: String(c.label).trim().slice(0, 120),
    type: ALLOWED_TYPES.has(c.type) ? c.type : "text"
  })) : [];
  return { off, custom };
}
var SUPABASE_URL, SUPABASE_ANON, SERVICE_KEY, EDEN_ORG_ID, SH, ALLOWED_TYPES, router;
var init_checkinForm = __esm({
  "src/routes/checkinForm.ts"() {
    "use strict";
    SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
    SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
    SH = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    };
    ALLOWED_TYPES = /* @__PURE__ */ new Set(["number", "scale", "text"]);
    router = Router();
    router.post("/checkin-form/save", async (req, res) => {
      try {
        if (!SERVICE_KEY) {
          res.status(500).json({ error: "Service not configured" });
          return;
        }
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const coachId = req.body?.coachId ? String(req.body.coachId) : null;
        const scope = await authorizeScope(caller, coachId);
        if (!scope) {
          res.status(403).json({ error: "You can only edit your own check-in form" });
          return;
        }
        const form = sanitizeForm(req.body?.form);
        if (!form) {
          res.status(400).json({ error: "Invalid form" });
          return;
        }
        const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
          method: "POST",
          headers: { ...SH, Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            company_id: scope.companyId,
            key: scope.key,
            value: JSON.stringify(form),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (!r.ok) {
          res.status(502).json({ error: "Save failed" });
          return;
        }
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: "Save failed" });
      }
    });
    router.post("/checkin-form/reset", async (req, res) => {
      try {
        if (!SERVICE_KEY) {
          res.status(500).json({ error: "Service not configured" });
          return;
        }
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const coachId = req.body?.coachId ? String(req.body.coachId) : null;
        const scope = await authorizeScope(caller, coachId);
        if (!scope) {
          res.status(403).json({ error: "You can only reset your own check-in form" });
          return;
        }
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${scope.companyId}&key=eq.${encodeURIComponent(scope.key)}`,
          { method: "DELETE", headers: SH }
        );
        if (!r.ok) {
          res.status(502).json({ error: "Reset failed" });
          return;
        }
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: "Reset failed" });
      }
    });
  }
});

// src/lib/mailer.ts
import nodemailer from "nodemailer";
function mailerConfigured() {
  return Boolean(SENDER && PASSWORD);
}
function appUrl(orgSlug) {
  const base2 = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/` : "");
  if (!base2) return "";
  const slug = String(orgSlug || "").trim().toLowerCase();
  if (slug && /^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return `${base2.replace(/\/+$/, "")}/${slug}`;
  }
  return base2;
}
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USERNAME, pass: PASSWORD }
    });
  }
  return transporter;
}
async function sendEmail(opts) {
  if (!mailerConfigured()) {
    return { ok: false, error: "SMTP not configured (SMTP_SENDER_EMAIL / SMTP_APP_PASSWORD missing)" };
  }
  try {
    await getTransporter().sendMail({
      from: `"${(opts.fromName || "Eden Comms").replace(/"/g, "'")}" <${SENDER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error({ error, to: opts.to, subject: opts.subject }, "[mailer] send failed");
    return { ok: false, error };
  }
}
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function dbaAddedEmail(params) {
  const { name, dbaName, dbaSlug } = params;
  const firstName = (name || "").split(" ")[0] || "there";
  const url = appUrl(dbaSlug);
  const subject = `You've been added to ${dbaName}`;
  const text = [
    `Hi ${firstName},`,
    ``,
    `You've been added to ${dbaName}.`,
    url ? `Sign in with your existing email and password here: ${url}` : `Sign in with your existing email and password.`,
    ``,
    `See you inside,`,
    `The ${dbaName} Team`
  ].join("\n");
  const safeUrl = /^https?:\/\//i.test(url) ? url : "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid #ffa600">
      <h1 style="margin:0;color:#ffa600;font-size:20px;letter-spacing:1px">${esc(dbaName)}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 20px">You've been added to <strong>${esc(dbaName)}</strong>. Sign in with the email and password you already use.</p>
      ${safeUrl ? `<p style="margin:0 0 24px;text-align:center"><a href="${esc(safeUrl)}" style="background:#ffa600;color:#111;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;display:inline-block">Sign In</a></p>` : ""}
      <p style="margin:0">See you inside,<br/>The ${esc(dbaName)} Team</p>
    </div>
  </div>`;
  return { subject, html, text };
}
function resetEmail(params) {
  const { name, orgName, actionLink } = params;
  const firstName = (name || "").split(" ")[0] || "there";
  const subject = `Reset your ${orgName} password`;
  const text = [
    `Hi ${firstName},`,
    ``,
    `We received a request to reset your ${orgName} password.`,
    `Use this secure link to choose a new one (it expires soon):`,
    actionLink,
    ``,
    `If you didn't request this, you can safely ignore this email \u2014 your password won't change.`,
    ``,
    `The ${orgName} Team`
  ].join("\n");
  const safeLink = /^https?:\/\//i.test(actionLink) ? actionLink : "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid #ffa600">
      <h1 style="margin:0;color:#ffa600;font-size:20px;letter-spacing:1px">${esc(orgName)}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 20px">We received a request to reset your <strong>${esc(orgName)}</strong> password. Click below to choose a new one \u2014 the link expires soon.</p>
      ${safeLink ? `<p style="margin:0 0 24px;text-align:center"><a href="${esc(safeLink)}" style="background:#ffa600;color:#111;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;display:inline-block">Reset My Password</a></p>` : ""}
      <p style="margin:0 0 16px;color:#999;font-size:12px">If you didn't request this, you can safely ignore this email \u2014 your password won't change.</p>
      <p style="margin:0">The ${esc(orgName)} Team</p>
    </div>
  </div>`;
  return { subject, html, text };
}
function welcomeEmail(params) {
  const { clientName, email, tempPassword, orgName, coachName, orgSlug } = params;
  const url = appUrl(orgSlug);
  const firstName = clientName.split(" ")[0] || clientName;
  const subject = `Welcome to ${orgName} \u2014 your login details`;
  const text = [
    `Hi ${firstName},`,
    ``,
    `Welcome to ${orgName}!${coachName ? ` Your coach ${coachName} is ready for you.` : ""}`,
    ``,
    `Here's how to sign in to your client portal:`,
    url ? `Portal: ${url}` : "",
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    ``,
    `You'll be asked to choose your own password the first time you sign in.`,
    ``,
    `See you inside,`,
    `The ${orgName} Team`
  ].filter((l) => l !== "").join("\n");
  const safeUrl = /^https?:\/\//i.test(url) ? url : "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid #ffa600">
      <h1 style="margin:0;color:#ffa600;font-size:20px;letter-spacing:1px">${esc(orgName)}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 16px">Welcome to <strong>${esc(orgName)}</strong>!${coachName ? ` Your coach <strong>${esc(coachName)}</strong> is ready for you.` : ""}</p>
      <p style="margin:0 0 8px">Here's how to sign in to your client portal:</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px 20px;margin:0 0 20px">
        <p style="margin:0 0 6px"><span style="color:#999">Email:</span> <strong>${esc(email)}</strong></p>
        <p style="margin:0"><span style="color:#999">Temporary password:</span> <strong style="color:#ffa600">${esc(tempPassword)}</strong></p>
      </div>
      ${safeUrl ? `<p style="margin:0 0 24px;text-align:center"><a href="${esc(safeUrl)}" style="background:#ffa600;color:#111;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;display:inline-block">Sign In Now</a></p>` : ""}
      <p style="margin:0 0 16px;color:#999;font-size:12px">You'll be asked to choose your own password the first time you sign in.</p>
      <p style="margin:0">See you inside,<br/>The ${esc(orgName)} Team</p>
    </div>
  </div>`;
  return { subject, html, text };
}
var RESEND_KEY, FROM, SENDER, PASSWORD, USERNAME, HOST, PORT, transporter;
var init_mailer = __esm({
  "src/lib/mailer.ts"() {
    "use strict";
    init_logger();
    RESEND_KEY = process.env.RESEND_API_KEY || "";
    FROM = process.env.SMTP_FROM_EMAIL || process.env.SMTP_SENDER_EMAIL || "";
    SENDER = FROM;
    PASSWORD = RESEND_KEY || process.env.SMTP_APP_PASSWORD || "";
    USERNAME = RESEND_KEY ? "resend" : process.env.SMTP_SENDER_EMAIL || "";
    HOST = process.env.SMTP_HOST || (RESEND_KEY ? "smtp.resend.com" : "smtp.gmail.com");
    PORT = Number(process.env.SMTP_PORT || 465);
    transporter = null;
  }
});

// src/routes/invites.ts
var invites_exports = {};
__export(invites_exports, {
  default: () => invites_default,
  readInviteLog: () => readInviteLog,
  recordInviteEmail: () => recordInviteEmail
});
import { Router as Router2 } from "express";
async function rest(path) {
  const r = await fetch(`${SUPABASE_URL2}/rest/v1/${path}`, { headers: SVC_H });
  if (!r.ok) return [];
  return r.json();
}
async function listAuthUsers() {
  const map = /* @__PURE__ */ new Map();
  const PER = 200;
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(
      `${SUPABASE_URL2}/auth/v1/admin/users?page=${page}&per_page=${PER}`,
      { headers: SVC_H }
    );
    if (!r.ok) break;
    const b = await r.json().catch(() => ({}));
    const users = Array.isArray(b?.users) ? b.users : [];
    for (const u of users) {
      const em = String(u?.email || "").toLowerCase();
      if (em) map.set(em, {
        id: String(u.id),
        lastSignIn: u.last_sign_in_at || null,
        createdAt: u.created_at || null
      });
    }
    if (users.length < PER) break;
  }
  return map;
}
async function readInviteLog(companyId) {
  const rows = await rest(
    `admin_settings?company_id=eq.${companyId}&key=eq.invite_log&select=value`
  );
  try {
    const v = rows[0]?.value;
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function recordInviteEmail(companyId, email, ok) {
  try {
    const log = await readInviteLog(companyId);
    log[email.toLowerCase()] = { at: (/* @__PURE__ */ new Date()).toISOString(), ok };
    await fetch(`${SUPABASE_URL2}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ company_id: companyId, key: "invite_log", value: JSON.stringify(log) })
    });
  } catch (e) {
    logger.warn({ err: e }, "[Invites] failed to record invite email");
  }
}
async function writeAudit(action, actor, details) {
  try {
    await fetch(`${SUPABASE_URL2}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, Prefer: "return=minimal" },
      body: JSON.stringify({
        action,
        actor_id: actor.id,
        actor_name: actor.name || "Admin",
        actor_role: "super_admin",
        target_type: "user",
        details
      })
    });
  } catch {
  }
}
function genTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
var SUPABASE_URL2, SERVICE_KEY2, EDEN_ID, SVC_H, EMAIL_RE, router2, invites_default;
var init_invites = __esm({
  "src/routes/invites.ts"() {
    "use strict";
    init_logger();
    init_mailer();
    init_auth();
    SUPABASE_URL2 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SERVICE_KEY2 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    EDEN_ID = "b0000000-0000-0000-0000-000000000001";
    SVC_H = {
      apikey: SERVICE_KEY2,
      Authorization: `Bearer ${SERVICE_KEY2}`,
      "Content-Type": "application/json"
    };
    EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    router2 = Router2();
    router2.get("/invites", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = admin.company_id || EDEN_ID;
      const [profiles2, authMap, log] = await Promise.all([
        rest(
          `user_profiles?company_id=eq.${companyId}&select=id,name,full_name,email,role,is_active,created_at&order=created_at.desc`
        ),
        listAuthUsers(),
        readInviteLog(companyId)
      ]);
      const invites = profiles2.map((p) => {
        const em = String(p.email || "").toLowerCase();
        const au = em ? authMap.get(em) : void 0;
        const sent = log[em] || null;
        return {
          id: p.id,
          name: p.name || p.full_name || em,
          email: em,
          role: p.role || "client",
          active: p.is_active !== false,
          hasLogin: !!au,
          joined: !!au?.lastSignIn,
          // has actually signed in at least once
          lastSignIn: au?.lastSignIn || null,
          invitedAt: au?.createdAt || p.created_at || null,
          lastEmailAt: sent?.at || null,
          lastEmailOk: sent ? !!sent.ok : null
        };
      });
      return res.json({ ok: true, invites });
    });
    router2.post("/invites/resend", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = admin.company_id || EDEN_ID;
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
      if (!mailerConfigured()) return res.status(503).json({ ok: false, error: "Email is not configured" });
      const rows = await rest(
        `user_profiles?company_id=eq.${companyId}&email=eq.${encodeURIComponent(email)}&select=id,name,full_name,coach_id`
      );
      const profile = rows[0];
      if (!profile) return res.status(404).json({ ok: false, error: "No user with that email in your organization" });
      const tempPassword = genTempPassword();
      const authMap = await listAuthUsers();
      const au = authMap.get(email);
      if (au) {
        const ur = await fetch(`${SUPABASE_URL2}/auth/v1/admin/users/${au.id}`, {
          method: "PUT",
          headers: SVC_H,
          body: JSON.stringify({ password: tempPassword, user_metadata: { must_change_password: true } })
        });
        if (!ur.ok) {
          const body = await ur.text().catch(() => "");
          logger.error({ status: ur.status, body, email }, "[Invites] password reset failed");
          return res.status(502).json({ ok: false, error: "Could not reset their login" });
        }
      } else {
        const cr = await fetch(`${SUPABASE_URL2}/auth/v1/admin/users`, {
          method: "POST",
          headers: SVC_H,
          body: JSON.stringify({
            email,
            password: tempPassword,
            email_confirm: true,
            user_metadata: { must_change_password: true, company_id: companyId }
          })
        });
        if (!cr.ok) {
          const body = await cr.text().catch(() => "");
          logger.error({ status: cr.status, body, email }, "[Invites] login creation failed");
          return res.status(502).json({ ok: false, error: "Could not create their login" });
        }
      }
      let orgName = "Eden Communications";
      let orgSlug = null;
      const org = await rest(`organizations?id=eq.${companyId}&select=name,slug`);
      if (org[0]?.name) orgName = org[0].name;
      if (org[0]?.slug) orgSlug = org[0].slug;
      if (!org[0]?.name) {
        const co = await rest(`companies?id=eq.${companyId}&select=name`);
        if (co[0]?.name) orgName = co[0].name;
      }
      const m = welcomeEmail({
        clientName: profile.name || profile.full_name || email,
        email,
        tempPassword,
        orgName,
        orgSlug
      });
      const sent = await sendEmail({ to: email, subject: m.subject, html: m.html, text: m.text, fromName: orgName });
      await recordInviteEmail(companyId, email, !!sent.ok);
      if (!sent.ok) {
        logger.warn({ email, error: sent.error }, "[Invites] resend failed");
        return res.status(502).json({ ok: false, error: "Email could not be sent \u2014 try again in a minute" });
      }
      await writeAudit("invite_resent", { id: admin.id, name: admin.name }, { email, name: profile.name || profile.full_name || email });
      logger.info({ adminId: admin.id, email }, "[Invites] invite re-sent");
      return res.json({ ok: true });
    });
    router2.post("/invites/revoke", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = admin.company_id || EDEN_ID;
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
      if (email === String(admin.name || "").toLowerCase()) {
        return res.status(400).json({ ok: false, error: "You can't uninvite yourself" });
      }
      const rows = await rest(
        `user_profiles?company_id=eq.${companyId}&email=eq.${encodeURIComponent(email)}&select=id,name,full_name`
      );
      const profile = rows[0];
      if (!profile) return res.status(404).json({ ok: false, error: "No user with that email in your organization" });
      if (profile.id === admin.id) return res.status(400).json({ ok: false, error: "You can't uninvite yourself" });
      const authMap = await listAuthUsers();
      const au = authMap.get(email);
      if (au?.lastSignIn) {
        return res.status(409).json({ ok: false, error: "They've already signed in \u2014 deactivate them instead of uninviting" });
      }
      await fetch(`${SUPABASE_URL2}/rest/v1/user_profiles?id=eq.${profile.id}&company_id=eq.${companyId}`, {
        method: "DELETE",
        headers: SVC_H
      });
      await fetch(
        `${SUPABASE_URL2}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`staff_meta:${profile.id}`)}`,
        { method: "DELETE", headers: SVC_H }
      );
      if (au) {
        await fetch(`${SUPABASE_URL2}/auth/v1/admin/users/${au.id}`, { method: "DELETE", headers: SVC_H });
      }
      try {
        const log = await readInviteLog(companyId);
        if (log[email]) {
          delete log[email];
          await fetch(`${SUPABASE_URL2}/rest/v1/admin_settings?on_conflict=company_id,key`, {
            method: "POST",
            headers: { ...SVC_H, Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ company_id: companyId, key: "invite_log", value: JSON.stringify(log) })
          });
        }
      } catch {
      }
      await writeAudit("invite_revoked", { id: admin.id, name: admin.name }, { email, name: profile.name || profile.full_name || email });
      logger.info({ adminId: admin.id, email }, "[Invites] invite revoked");
      return res.json({ ok: true });
    });
    invites_default = router2;
  }
});

// src/routes/auth.ts
import { Router as Router3 } from "express";
async function dbGet(table, params) {
  const r = await fetch(`${SUPABASE_URL3}/rest/v1/${table}?${params}`, {
    headers: restHeaders(SERVICE_KEY3 || SUPABASE_ANON2)
  });
  if (!r.ok) return [];
  return r.json();
}
async function provisionAuthUser(email, password, name, mustChangePassword = true, extraMeta = {}) {
  if (!SERVICE_KEY3) return { ok: false, error: "Auth service is not configured (missing service role key)" };
  const r = await fetch(`${SUPABASE_URL3}/auth/v1/admin/users`, {
    method: "POST",
    headers: restHeaders(SERVICE_KEY3),
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { must_change_password: mustChangePassword, ...name ? { name } : {}, ...extraMeta }
    })
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, existed: false, authUserId: body?.id || null };
  if (body?.error_code === "email_exists" || /already.*registered|exists/i.test(String(body?.msg || ""))) {
    return { ok: true, existed: true, authUserId: null };
  }
  logger.warn({ status: r.status, body }, "[Auth] provision failed");
  return { ok: false, error: String(body?.msg || body?.message || `Auth API error (${r.status})`) };
}
async function findAuthUserIdByEmail(email) {
  const matchIn = (users) => {
    const hit = (Array.isArray(users) ? users : []).find(
      (u) => String(u?.email || "").toLowerCase() === email
    );
    return hit?.id ? String(hit.id) : null;
  };
  try {
    const lr = await fetch(
      `${SUPABASE_URL3}/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(email)}`,
      { headers: restHeaders(SERVICE_KEY3) }
    );
    if (lr.ok) {
      const lb = await lr.json().catch(() => ({}));
      const id = matchIn(lb?.users);
      if (id) return id;
    }
  } catch {
  }
  const PER_PAGE = 200;
  const MAX_PAGES = 50;
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const r = await fetch(
        `${SUPABASE_URL3}/auth/v1/admin/users?page=${page}&per_page=${PER_PAGE}`,
        { headers: restHeaders(SERVICE_KEY3) }
      );
      if (!r.ok) break;
      const b = await r.json().catch(() => ({}));
      const users = Array.isArray(b?.users) ? b.users : [];
      const id = matchIn(users);
      if (id) return id;
      if (users.length < PER_PAGE) break;
    }
  } catch {
  }
  return null;
}
async function requireAdminJwt(req) {
  const auth2 = String(req.get("authorization") || "");
  const token = auth2.startsWith("Bearer ") ? auth2.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON2) return null;
  const r = await fetch(`${SUPABASE_URL3}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON2, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await dbGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&role=eq.super_admin&is_active=not.is.false&select=id,company_id,name`
  );
  return rows[0] ? { id: rows[0].id, company_id: rows[0].company_id || null, name: rows[0].name || null } : null;
}
function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}
function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}
var SUPABASE_URL3, SUPABASE_ANON2, SERVICE_KEY3, restHeaders, attempts, EMAIL_RE2, router3;
var init_auth = __esm({
  "src/routes/auth.ts"() {
    "use strict";
    init_logger();
    init_mailer();
    SUPABASE_URL3 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SUPABASE_ANON2 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
    SERVICE_KEY3 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    restHeaders = (key) => ({
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    });
    attempts = /* @__PURE__ */ new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
    }, 6e4).unref?.();
    EMAIL_RE2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    router3 = Router3();
    router3.post("/auth/provision", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { email, password, name, role } = req.body || {};
      if (!email || !EMAIL_RE2.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
      if (!password || password.length < 8) return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
      const meta = {};
      if (admin.company_id) meta.company_id = admin.company_id;
      if (role && ["client", "coach", "head_coach", "super_admin"].includes(role)) meta.intended_role = role;
      const result = await provisionAuthUser(email, password, name, true, meta);
      if (!result.ok) return res.status(502).json(result);
      logger.info({ adminId: admin.id, email: email.toLowerCase() }, "[Auth] admin provisioned auth user");
      let emailed = false;
      if (mailerConfigured()) {
        try {
          let orgName = "Eden Communications";
          let orgSlug = null;
          if (admin.company_id) {
            const org = await dbGet("organizations", `id=eq.${encodeURIComponent(admin.company_id)}&select=name,slug`);
            if (org?.[0]?.name) orgName = org[0].name;
            if (org?.[0]?.slug) orgSlug = org[0].slug;
            if (!org?.[0]?.name) {
              const co = await dbGet("companies", `id=eq.${encodeURIComponent(admin.company_id)}&select=name`);
              if (co?.[0]?.name) orgName = co[0].name;
            }
          }
          const m = welcomeEmail({
            clientName: name || email,
            email: email.toLowerCase(),
            tempPassword: password,
            orgName,
            orgSlug
          });
          const sent = await sendEmail({ to: email.toLowerCase(), subject: m.subject, html: m.html, text: m.text, fromName: orgName });
          emailed = !!sent.ok;
          if (!sent.ok) logger.warn({ email: email.toLowerCase(), error: sent.error }, "[Auth] welcome email failed");
        } catch (e) {
          logger.warn({ err: e }, "[Auth] welcome email errored");
        }
        try {
          const { recordInviteEmail: recordInviteEmail2 } = await Promise.resolve().then(() => (init_invites(), invites_exports));
          await recordInviteEmail2(admin.company_id || "b0000000-0000-0000-0000-000000000001", email.toLowerCase(), emailed);
        } catch {
        }
      }
      return res.json({ ...result, emailed });
    });
    router3.post("/auth/migrate", async (req, res) => {
      const emailRaw = String((req.body || {}).email || "").trim().toLowerCase();
      const password = String((req.body || {}).password || "");
      if (!emailRaw || !EMAIL_RE2.test(emailRaw) || !password) {
        return res.status(400).json({ ok: false, error: "Email and password required" });
      }
      if (rateLimited(`mig:${emailRaw}`, 5, 15 * 6e4) || rateLimited(`mig-ip:${clientIp(req)}`, 20, 15 * 6e4)) {
        return res.status(429).json({ ok: false, error: "Too many attempts \u2014 try again later" });
      }
      if (!SERVICE_KEY3) return res.status(503).json({ ok: false, error: "Auth service is not configured" });
      const rows = await dbGet(
        "user_profiles",
        `email=eq.${encodeURIComponent(emailRaw)}&select=id,name,temp_password,is_active`
      );
      const profile = rows[0];
      if (!profile || !profile.temp_password || profile.temp_password !== password) {
        return res.status(401).json({ ok: false, error: "Invalid email or password" });
      }
      if (profile.is_active === false) {
        return res.status(403).json({ ok: false, error: "Account deactivated" });
      }
      const result = await provisionAuthUser(emailRaw, password, profile.name);
      if (!result.ok) return res.status(502).json({ ok: false, error: result.error });
      const patch = await fetch(
        `${SUPABASE_URL3}/rest/v1/user_profiles?id=eq.${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: restHeaders(SERVICE_KEY3),
          body: JSON.stringify({ temp_password: null })
        }
      );
      if (!patch.ok) logger.warn({ status: patch.status }, "[Auth] failed to clear temp_password after migration");
      logger.info({ email: emailRaw }, "[Auth] migrated legacy temp-password login to Supabase Auth");
      return res.json({ ok: true });
    });
    router3.post("/auth/reset-request", async (req, res) => {
      const emailRaw = String((req.body || {}).email || "").trim().toLowerCase();
      if (!emailRaw || !EMAIL_RE2.test(emailRaw)) {
        return res.status(400).json({ ok: false, error: "Valid email required" });
      }
      if (rateLimited(`reset:${emailRaw}`, 4, 15 * 6e4) || rateLimited(`reset-ip:${clientIp(req)}`, 15, 15 * 6e4)) {
        return res.status(429).json({ ok: false, error: "Too many attempts \u2014 try again later" });
      }
      res.json({ ok: true, message: "If an account exists, a reset link is on its way." });
      void (async () => {
        try {
          if (!SERVICE_KEY3 || !mailerConfigured()) {
            logger.warn("[Auth] reset-request but auth/mailer not configured");
            return;
          }
          const rows = await dbGet(
            "user_profiles",
            `email=eq.${encodeURIComponent(emailRaw)}&select=id,name,role,company_id,is_active`
          );
          const profile = rows[0];
          if (!profile || profile.is_active === false) return;
          let orgName = "Eden Comms";
          let orgSlug = null;
          let dbaQueryForm = false;
          try {
            const { findDbaBrandForEmail: findDbaBrandForEmail2 } = await Promise.resolve().then(() => (init_dba(), dba_exports));
            const dba = await findDbaBrandForEmail2(emailRaw);
            if (dba) {
              orgName = dba.name;
              orgSlug = dba.slug;
              dbaQueryForm = true;
            }
          } catch {
          }
          if (!dbaQueryForm && profile.company_id) {
            const orgs = await dbGet("organizations", `id=eq.${encodeURIComponent(profile.company_id)}&select=name,slug`);
            if (orgs[0]?.name) orgName = orgs[0].name;
            if (orgs[0]?.slug) orgSlug = orgs[0].slug;
          }
          const baseUrl = /^https?:\/\//i.test(process.env.APP_URL || "") ? String(process.env.APP_URL) : "";
          const redirectTo = baseUrl ? orgSlug ? `${baseUrl.replace(/\/+$/, "")}/?${dbaQueryForm ? "dba" : "org"}=${encodeURIComponent(orgSlug)}` : baseUrl : void 0;
          const linkRes = await fetch(`${SUPABASE_URL3}/auth/v1/admin/generate_link`, {
            method: "POST",
            headers: restHeaders(SERVICE_KEY3),
            body: JSON.stringify({ type: "recovery", email: emailRaw, ...redirectTo ? { redirect_to: redirectTo } : {} })
          });
          const linkBody = await linkRes.json().catch(() => ({}));
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
    router3.post("/auth/update-identity", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      if (!SERVICE_KEY3) return res.status(503).json({ ok: false, error: "Auth service is not configured" });
      const id = String((req.body || {}).id || "").trim();
      const nameRaw = (req.body || {}).name;
      const emailRaw = (req.body || {}).email;
      if (!id) return res.status(400).json({ ok: false, error: "User id required" });
      const newName = nameRaw === void 0 || nameRaw === null ? void 0 : String(nameRaw).trim();
      const newEmail = emailRaw === void 0 || emailRaw === null ? void 0 : String(emailRaw).trim().toLowerCase();
      if (newName !== void 0 && !newName) return res.status(400).json({ ok: false, error: "Name cannot be empty" });
      if (newEmail !== void 0 && !EMAIL_RE2.test(newEmail)) return res.status(400).json({ ok: false, error: "Valid email required" });
      const rows = await dbGet(
        "user_profiles",
        `id=eq.${encodeURIComponent(id)}&select=id,name,email,role,company_id`
      );
      const profile = rows[0];
      if (!profile) return res.status(404).json({ ok: false, error: "User not found" });
      const EDEN_ORG_ID6 = "b0000000-0000-0000-0000-000000000001";
      if (admin.company_id && admin.company_id !== EDEN_ORG_ID6 && profile.company_id && profile.company_id !== admin.company_id) {
        return res.status(403).json({ ok: false, error: "You can only edit users in your own organization" });
      }
      const oldName = String(profile.name || "");
      const oldEmail = String(profile.email || "").toLowerCase();
      const nameChanged = newName !== void 0 && newName !== oldName;
      const emailChanged = newEmail !== void 0 && newEmail !== oldEmail;
      if (!nameChanged && !emailChanged) return res.json({ ok: true, changed: false });
      let authUserId = null;
      if (emailChanged) {
        const dupes = await dbGet("user_profiles", `email=eq.${encodeURIComponent(newEmail)}&select=id`);
        if (dupes.length > 0) return res.status(409).json({ ok: false, error: "That email already belongs to another account" });
        authUserId = await findAuthUserIdByEmail(oldEmail);
        if (!authUserId) logger.info({ oldEmail }, "[Auth] update-identity: no auth user for old email (legacy account)");
      }
      const patchBody = {};
      if (nameChanged) patchBody.name = newName;
      if (emailChanged) patchBody.email = newEmail;
      const patch = await fetch(`${SUPABASE_URL3}/rest/v1/user_profiles?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: restHeaders(SERVICE_KEY3),
        body: JSON.stringify(patchBody)
      });
      if (!patch.ok) {
        const pb = await patch.text().catch(() => "");
        logger.error({ status: patch.status, body: pb }, "[Auth] update-identity profile patch failed");
        return res.status(502).json({ ok: false, error: "Could not save the profile changes" });
      }
      let authUpdated = false;
      if (emailChanged && authUserId) {
        const ur = await fetch(`${SUPABASE_URL3}/auth/v1/admin/users/${authUserId}`, {
          method: "PUT",
          headers: restHeaders(SERVICE_KEY3),
          body: JSON.stringify({ email: newEmail, email_confirm: true })
        });
        if (!ur.ok) {
          const ub = await ur.json().catch(() => ({}));
          logger.warn({ status: ur.status, body: ub }, "[Auth] update-identity auth email change failed \u2014 rolling back profile");
          const rollback = await fetch(`${SUPABASE_URL3}/rest/v1/user_profiles?id=eq.${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: restHeaders(SERVICE_KEY3),
            body: JSON.stringify({ name: oldName, email: oldEmail })
          });
          if (!rollback.ok) logger.error({ status: rollback.status }, "[Auth] update-identity profile rollback ALSO failed \u2014 manual fix needed");
          return res.status(502).json({ ok: false, error: String(ub?.msg || ub?.message || "Could not update the login email \u2014 nothing was changed") });
        }
        authUpdated = true;
      }
      if (nameChanged && !emailChanged) {
        void (async () => {
          try {
            const uid = await findAuthUserIdByEmail(oldEmail);
            if (uid) {
              await fetch(`${SUPABASE_URL3}/auth/v1/admin/users/${uid}`, {
                method: "PUT",
                headers: restHeaders(SERVICE_KEY3),
                body: JSON.stringify({ user_metadata: { name: newName } })
              });
            }
          } catch {
          }
        })();
      }
      const audit2 = await fetch(`${SUPABASE_URL3}/rest/v1/audit_logs`, {
        method: "POST",
        headers: { ...restHeaders(SERVICE_KEY3), Prefer: "return=minimal" },
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
            auth_email_updated: authUpdated
          }
        })
      });
      if (!audit2.ok) logger.warn({ status: audit2.status }, "[Auth] update-identity audit insert failed");
      logger.info({ adminId: admin.id, target: id, nameChanged, emailChanged, authUpdated }, "[Auth] identity updated");
      return res.json({ ok: true, changed: true, authUpdated, name: nameChanged ? newName : oldName, email: emailChanged ? newEmail : oldEmail });
    });
  }
});

// src/routes/teamUpload.ts
import { Router as Router4 } from "express";
async function requireStaffJwt(req) {
  const auth2 = String(req.get("authorization") || "");
  const token = auth2.startsWith("Bearer ") ? auth2.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON3) return null;
  const r = await fetch(`${SUPABASE_URL4}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON3, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const pr = await fetch(
    `${SUPABASE_URL4}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&role=neq.client&is_active=not.is.false&select=id,company_id,role`,
    { headers: SVC_H2 }
  );
  if (!pr.ok) return null;
  const rows = await pr.json().catch(() => []);
  return rows[0] ? { id: rows[0].id, company_id: rows[0].company_id || null, role: rows[0].role } : null;
}
async function ensureBucket() {
  if (bucketReady) return;
  const r = await fetch(`${SUPABASE_URL4}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...SVC_H2, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
  });
  if (r.ok || r.status === 400 || r.status === 409) {
    bucketReady = true;
    return;
  }
  const body = await r.text().catch(() => "");
  logger.error({ status: r.status, body }, "[TeamUpload] bucket create failed");
  throw new Error("bucket unavailable");
}
async function storeChatUpload(companyKey, filename, contentType, dataBase64) {
  if (!filename || !dataBase64) return { status: 400, body: { error: "filename and dataBase64 required" } };
  let buf;
  try {
    buf = Buffer.from(String(dataBase64), "base64");
  } catch {
    return { status: 400, body: { error: "Bad file data" } };
  }
  if (!buf.length) return { status: 400, body: { error: "Empty file" } };
  if (buf.length > MAX_BYTES) return { status: 413, body: { error: "File too large (15 MB max)" } };
  await ensureBucket();
  const safe = String(filename).slice(-120).replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  const path = `${companyKey || "eden"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const up = await fetch(`${SUPABASE_URL4}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...SVC_H2, "Content-Type": String(contentType || "application/octet-stream") },
    body: buf
  });
  if (!up.ok) {
    const body = await up.text().catch(() => "");
    logger.error({ status: up.status, body }, "[TeamUpload] upload failed");
    return { status: 502, body: { error: "Upload failed \u2014 please try again" } };
  }
  return {
    status: 200,
    body: { url: `${SUPABASE_URL4}/storage/v1/object/public/${BUCKET}/${path}`, name: String(filename), type: String(contentType || "") }
  };
}
async function transcribeChatAudio(dataBase64, contentType) {
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] || "";
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] || "";
  if (!baseUrl || !apiKey) return { status: 503, body: { error: "Transcription not configured" } };
  if (!dataBase64) return { status: 400, body: { error: "dataBase64 required" } };
  let buf;
  try {
    buf = Buffer.from(String(dataBase64), "base64");
  } catch {
    return { status: 400, body: { error: "Bad audio data" } };
  }
  if (!buf.length || buf.length > MAX_BYTES) return { status: 400, body: { error: "Bad audio size" } };
  const type = String(contentType || "audio/webm");
  const ext = /mp4|m4a/.test(type) ? "m4a" : /wav/.test(type) ? "wav" : /mp3|mpeg/.test(type) ? "mp3" : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type }), `memo.${ext}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    logger.error({ status: r.status, body }, "[TeamTranscribe] transcription failed");
    return { status: 502, body: { error: "Transcription failed" } };
  }
  const out = await r.json().catch(() => null);
  return { status: 200, body: { text: String(out?.text || "").trim() } };
}
async function voiceMemosEnabled(companyId) {
  if (!companyId || companyId === EDEN_ORG_ID2) return true;
  const sr = await fetch(
    `${SUPABASE_URL4}/rest/v1/admin_settings?company_id=eq.${EDEN_ORG_ID2}&key=eq.voice_memo_tiers&select=value`,
    { headers: SVC_H2 }
  );
  const srows = sr.ok ? await sr.json().catch(() => []) : [];
  if (!srows[0]?.value) return true;
  let enabledTiers = [];
  try {
    const v = srows[0].value;
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(parsed)) enabledTiers = parsed.map(String);
  } catch {
    return true;
  }
  const or = await fetch(
    `${SUPABASE_URL4}/rest/v1/organizations?id=eq.${companyId}&select=plan`,
    { headers: SVC_H2 }
  );
  const orows = or.ok ? await or.json().catch(() => []) : [];
  const plan = String(orows[0]?.plan || "").toLowerCase();
  if (!plan) return false;
  const pr = await fetch(`${SUPABASE_URL4}/rest/v1/packages?select=id,name`, { headers: SVC_H2 });
  const prows = pr.ok ? await pr.json().catch(() => []) : [];
  const pkg = prows.find((p) => String(p.name || "").toLowerCase() === plan);
  return !!pkg && enabledTiers.includes(String(pkg.id));
}
var SUPABASE_URL4, SUPABASE_ANON3, SERVICE_KEY4, BUCKET, MAX_BYTES, SVC_H2, bucketReady, router4, EDEN_ORG_ID2;
var init_teamUpload = __esm({
  "src/routes/teamUpload.ts"() {
    "use strict";
    init_logger();
    SUPABASE_URL4 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SUPABASE_ANON3 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
    SERVICE_KEY4 = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
    BUCKET = "team-uploads";
    MAX_BYTES = 15 * 1024 * 1024;
    SVC_H2 = {
      apikey: SERVICE_KEY4,
      Authorization: `Bearer ${SERVICE_KEY4}`
    };
    bucketReady = false;
    router4 = Router4();
    router4.post("/team/upload", async (req, res) => {
      try {
        const caller = await requireStaffJwt(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const { filename, contentType, dataBase64 } = req.body || {};
        const out = await storeChatUpload(caller.company_id || "eden", filename, contentType, dataBase64);
        res.status(out.status === 200 ? 200 : out.status).json(out.body);
      } catch (e) {
        logger.error({ err: e }, "[TeamUpload] error");
        res.status(500).json({ error: "Upload failed" });
      }
    });
    EDEN_ORG_ID2 = "b0000000-0000-0000-0000-000000000001";
    router4.get("/team/voice-memos-enabled", async (req, res) => {
      try {
        const caller = await requireStaffJwt(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        res.json({ enabled: await voiceMemosEnabled(caller.company_id) });
      } catch (e) {
        logger.error({ err: e }, "[VoiceMemoGate] error");
        res.json({ enabled: true });
      }
    });
    router4.post("/team/transcribe", async (req, res) => {
      try {
        const caller = await requireStaffJwt(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        if (!await voiceMemosEnabled(caller.company_id)) {
          res.status(403).json({ error: "Voice memos are not included in this organization's tier" });
          return;
        }
        const { dataBase64, contentType } = req.body || {};
        const out = await transcribeChatAudio(dataBase64, contentType);
        res.status(out.status === 200 ? 200 : out.status).json(out.body);
      } catch (e) {
        logger.error({ err: e }, "[TeamTranscribe] error");
        res.status(500).json({ error: "Transcription failed" });
      }
    });
  }
});

// src/routes/huddle.ts
import { Router as Router5 } from "express";
async function dailyKeyForOrg(companyId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL5}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.daily_api_key&select=value`,
      { headers: SH2 }
    );
    const rows = r.ok ? await r.json().catch(() => []) : [];
    const own = String(rows?.[0]?.value || "").trim();
    if (own) return own;
  } catch {
  }
  return companyId === EDEN_ORG_ID3 ? EDEN_DAILY_KEY : "";
}
async function validDailyKey(key) {
  try {
    const r = await fetch("https://api.daily.co/v1/rooms?limit=1", {
      headers: { Authorization: `Bearer ${key}` }
    });
    return r.ok;
  } catch {
    return false;
  }
}
function parseDnd(value) {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value;
    const until = String(v?.until || "");
    if (until === "forever") return { on: true, until: "forever" };
    const t = Date.parse(until);
    if (Number.isFinite(t) && t > Date.now()) return { on: true, until: new Date(t).toISOString() };
  } catch {
  }
  return { on: false, until: null };
}
var EDEN_DAILY_KEY, SERVICE_KEY5, SUPABASE_URL5, EDEN_ORG_ID3, SH2, router5;
var init_huddle = __esm({
  "src/routes/huddle.ts"() {
    "use strict";
    init_checkinForm();
    EDEN_DAILY_KEY = process.env.DAILY_API_KEY || "";
    SERVICE_KEY5 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    SUPABASE_URL5 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    EDEN_ORG_ID3 = "b0000000-0000-0000-0000-000000000001";
    SH2 = {
      apikey: SERVICE_KEY5,
      Authorization: `Bearer ${SERVICE_KEY5}`,
      "Content-Type": "application/json"
    };
    router5 = Router5();
    router5.post("/huddle/create", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const DAILY_API_KEY = await dailyKeyForOrg(caller.company_id);
        if (!DAILY_API_KEY) {
          res.status(400).json({ error: "Video huddles aren't connected for your organization yet \u2014 ask your admin to add a Daily.co API key in the admin panel." });
          return;
        }
        const name = `eden-${String(caller.company_id).slice(0, 8)}-${Date.now()}`;
        const r = await fetch("https://api.daily.co/v1/rooms", {
          method: "POST",
          headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            privacy: "public",
            properties: {
              exp: Math.floor(Date.now() / 1e3) + 4 * 3600,
              // room self-destructs in 4h
              enable_chat: true,
              enable_screenshare: true
            }
          })
        });
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.url) {
          res.status(502).json({ error: "Could not create the call room" });
          return;
        }
        res.json({ ok: true, url: data.url, name: data.name });
      } catch {
        res.status(500).json({ error: "Could not create the call room" });
      }
    });
    router5.get("/huddle/status", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const key = await dailyKeyForOrg(caller.company_id);
        const own = key !== "" && !(caller.company_id === EDEN_ORG_ID3 && key === EDEN_DAILY_KEY);
        res.json({ connected: Boolean(key), source: own ? "own" : key ? "builtin" : "none" });
      } catch {
        res.status(500).json({ error: "Status check failed" });
      }
    });
    router5.post("/huddle/daily-key", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        if (caller.role !== "super_admin") {
          res.status(403).json({ error: "Only admins can connect a Daily.co account" });
          return;
        }
        const key = String(req.body?.key || "").trim();
        if (!key) {
          res.status(400).json({ error: "Paste your Daily.co API key" });
          return;
        }
        if (!await validDailyKey(key)) {
          res.status(400).json({ error: "That key didn't work \u2014 copy it again from dashboard.daily.co \u2192 Developers" });
          return;
        }
        const r = await fetch(`${SUPABASE_URL5}/rest/v1/admin_settings?on_conflict=company_id,key`, {
          method: "POST",
          headers: { ...SH2, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            company_id: caller.company_id,
            key: "daily_api_key",
            value: key,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (!r.ok) {
          res.status(502).json({ error: "Could not save the key" });
          return;
        }
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: "Could not save the key" });
      }
    });
    router5.post("/huddle/daily-key/remove", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        if (caller.role !== "super_admin") {
          res.status(403).json({ error: "Only admins can disconnect Daily.co" });
          return;
        }
        const r = await fetch(
          `${SUPABASE_URL5}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.daily_api_key`,
          { method: "DELETE", headers: SH2 }
        );
        if (!r.ok) {
          res.status(502).json({ error: "Could not disconnect" });
          return;
        }
        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: "Could not disconnect" });
      }
    });
    router5.get("/dnd", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const r = await fetch(
          `${SUPABASE_URL5}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.dnd_${caller.id}&select=value`,
          { headers: SH2 }
        );
        const rows = r.ok ? await r.json().catch(() => []) : [];
        res.json(parseDnd(rows?.[0]?.value));
      } catch {
        res.status(500).json({ error: "Could not load Do Not Disturb" });
      }
    });
    router5.post("/dnd", async (req, res) => {
      try {
        const caller = await requireStaff(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const raw = req.body?.until;
        let until = null;
        if (raw === "forever") until = "forever";
        else if (raw) {
          const t = Date.parse(String(raw));
          if (!Number.isFinite(t) || t <= Date.now()) {
            res.status(400).json({ error: "Invalid Do Not Disturb time" });
            return;
          }
          if (t > Date.now() + 7 * 24 * 3600 * 1e3) {
            res.status(400).json({ error: "Do Not Disturb can be set for up to 7 days" });
            return;
          }
          until = new Date(t).toISOString();
        }
        if (!until) {
          const r2 = await fetch(
            `${SUPABASE_URL5}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.dnd_${caller.id}`,
            { method: "DELETE", headers: SH2 }
          );
          if (!r2.ok) {
            res.status(502).json({ error: "Could not turn off Do Not Disturb" });
            return;
          }
          res.json({ on: false, until: null });
          return;
        }
        const r = await fetch(`${SUPABASE_URL5}/rest/v1/admin_settings?on_conflict=company_id,key`, {
          method: "POST",
          headers: { ...SH2, Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({
            company_id: caller.company_id,
            key: `dnd_${caller.id}`,
            value: JSON.stringify({ until }),
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          })
        });
        if (!r.ok) {
          res.status(502).json({ error: "Could not save Do Not Disturb" });
          return;
        }
        res.json(parseDnd(JSON.stringify({ until })));
      } catch {
        res.status(500).json({ error: "Could not save Do Not Disturb" });
      }
    });
  }
});

// src/routes/dba.ts
var dba_exports = {};
__export(dba_exports, {
  dbaAccess: () => dbaAccess,
  dbaCanvasWriteAllowed: () => dbaCanvasWriteAllowed,
  default: () => dba_default,
  findDbaAnywhere: () => findDbaAnywhere,
  findDbaBrandForEmail: () => findDbaBrandForEmail,
  requireUserJwt: () => requireUserJwt
});
import { Router as Router6 } from "express";
import { randomUUID } from "node:crypto";
async function adminOrgScope(admin, req) {
  const own = admin.company_id || EDEN_ID2;
  const want = String((req.method === "GET" ? req.query.orgId : (req.body || {}).orgId) || "").trim();
  if (!want || want === own) return own;
  if (!isHqAdmin(admin)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(want)) return null;
  const rows = await rest2(`organizations?id=eq.${encodeURIComponent(want)}&is_active=eq.true&select=id`);
  return rows[0] ? want : null;
}
async function rest2(path) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/${path}`, { headers: SVC_H3 });
  if (!r.ok) return [];
  return r.json();
}
function parseDba(value) {
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
      created_at: v.created_at || (/* @__PURE__ */ new Date()).toISOString(),
      members: Array.isArray(v.members) ? v.members : [],
      delegates: Array.isArray(v.delegates) ? v.delegates.filter((d) => d && d.id) : [],
      connect: Array.isArray(v.connect) ? v.connect : [],
      learn_course_ids: Array.isArray(v.learn_course_ids) ? v.learn_course_ids.map(String) : [],
      tier_defs: Array.isArray(v.tier_defs) ? v.tier_defs.filter((t) => t && t.id && String(t.name || "").trim()).map((t) => ({ id: String(t.id), name: String(t.name).trim().slice(0, 60), desc: t.desc ? String(t.desc).trim().slice(0, 300) : null, dm: !!t.dm, app: !!t.app })) : [],
      learn_tiers: v.learn_tiers && typeof v.learn_tiers === "object" && !Array.isArray(v.learn_tiers) ? Object.fromEntries(Object.entries(v.learn_tiers).map(([k, arr]) => [String(k), Array.isArray(arr) ? arr.map(String) : []])) : {}
    };
  } catch {
    return null;
  }
}
async function loadAllDbas() {
  const rows = await rest2("admin_settings?key=like.dba%3A*&select=company_id,key,value");
  const out = [];
  for (const row of rows) {
    const dba = parseDba(row.value);
    if (dba) out.push({ companyId: String(row.company_id), dba });
  }
  return out;
}
async function loadOrgDbas(companyId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=like.dba%3A*&select=value`
  );
  return rows.map((r) => parseDba(r.value)).filter(Boolean);
}
async function saveDbaRow(companyId, dba) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba:${dba.id}`, value: JSON.stringify(dba) })
  });
  return r.ok;
}
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => {
  }).then(fn);
  const settled = run.catch(() => {
  });
  locks.set(key, settled);
  void settled.then(() => {
    if (locks.get(key) === settled) locks.delete(key);
  });
  return run;
}
function sanitizeSlug(input) {
  return String(input || "").toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
async function slugTaken(slug, exceptDbaId) {
  if (RESERVED_SLUGS.has(slug)) return "That link name is reserved \u2014 pick another.";
  const orgs = await rest2(`organizations?slug=eq.${encodeURIComponent(slug)}&select=id`);
  if (orgs.length) return "That link name is already used by an organization.";
  const all = await loadAllDbas();
  const hit = all.find((x) => x.dba.slug === slug && x.dba.id !== exceptDbaId);
  if (hit) return "That link name is already used by another DBA.";
  return null;
}
async function dbaAllowedForOrg(companyId) {
  if (companyId === EDEN_ID2) return true;
  const orgs = await rest2(`organizations?id=eq.${encodeURIComponent(companyId)}&select=plan,is_active`);
  const org = orgs[0];
  if (!org || org.is_active === false) return false;
  const plan = String(org.plan || "").toLowerCase();
  const pkgs = await rest2(`packages?active=eq.true&select=id,name,price`);
  const pkg = pkgs.find((p) => String(p.name || "").toLowerCase() === plan);
  const cfgRows = await rest2(`admin_settings?company_id=eq.${EDEN_ID2}&key=eq.dba_tiers&select=value`);
  let allowedIds = null;
  try {
    const v = cfgRows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(arr)) allowedIds = arr.map(String);
  } catch {
  }
  if (allowedIds !== null) return !!pkg && allowedIds.includes(String(pkg.id));
  if (!pkg) return false;
  const top = pkgs.reduce((a, b) => Number(b.price || 0) > Number(a.price || 0) ? b : a, pkgs[0]);
  return String(pkg.id) === String(top?.id);
}
async function requireUserJwt(req) {
  const auth2 = String(req.get("authorization") || "");
  const token = auth2.startsWith("Bearer ") ? auth2.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON4) return null;
  const r = await fetch(`${SUPABASE_URL6}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON4, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await rest2(
    `user_profiles?email=eq.${encodeURIComponent(email)}&select=id,email,name,role,company_id,is_active`
  );
  const p = rows[0];
  if (!p || p.is_active === false) return null;
  return { id: p.id, email, name: p.name || null, role: p.role || "client", company_id: p.company_id || null };
}
async function findDbaBrandForEmail(email) {
  const norm = email.toLowerCase();
  const all = await loadAllDbas();
  const hit = all.find(
    (x) => x.dba.is_active && x.dba.members.some((m) => m.pure === true && m.email.toLowerCase() === norm)
  );
  return hit ? { name: hit.dba.name, slug: hit.dba.slug } : null;
}
function publicBrand(dba, org) {
  return {
    id: dba.id,
    name: dba.name,
    slug: dba.slug,
    logo_url: dba.logo_url,
    brand_color: dba.brand_color,
    brand_colors: dba.brand_colors,
    org: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    __dba: true
  };
}
async function brandBySlug(slug) {
  const all = await loadAllDbas();
  const hit = all.find((x) => x.dba.slug === slug && x.dba.is_active);
  if (hit) return { name: hit.dba.name, logo: hit.dba.logo_url || null, color: hit.dba.brand_color || null };
  const orgs = await rest2(`organizations?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=name,logo_url,brand_color`);
  if (orgs[0]) return { name: orgs[0].name, logo: orgs[0].logo_url || null, color: orgs[0].brand_color || null };
  return null;
}
async function findDbaAnywhere(dbaId) {
  const all = await loadAllDbas();
  return all.find((x) => x.dba.id === dbaId) || null;
}
function dbaAccess(me, companyId, dba) {
  const member = dba.members.some((m) => m.email.toLowerCase() === me.email);
  const delegated = me.company_id === companyId && me.role !== "client" && me.role !== "dba_member" && (dba.delegates || []).some((d) => d.id === me.id);
  const activeCoach = dba.coach_id === me.id && me.company_id === companyId && me.role !== "client" && me.role !== "dba_member";
  const manage = activeCoach || me.role === "super_admin" && (me.company_id === companyId || isHqAdmin(me)) || delegated;
  return { member, manage };
}
async function dbaEditableCourse(me, dbaId) {
  const hit = await findDbaAnywhere(String(dbaId || ""));
  if (!hit) return { err: 404 };
  if (!dbaAccess(me, hit.companyId, hit.dba).manage) return { err: 403 };
  return { hit };
}
async function loadTierDefs(companyId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${companyId}&key=eq.dba_tier_defs&select=value`
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(arr) && arr.length) {
      return arr.filter((t) => t && t.id && String(t.name || "").trim()).map((t) => ({ id: String(t.id), name: String(t.name).trim().slice(0, 60), dm: !!t.dm, app: !!t.app }));
    }
  } catch {
  }
  return DEFAULT_TIER_DEFS;
}
async function saveTierDefs(companyId, defs) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: "dba_tier_defs", value: JSON.stringify(defs) })
  });
  return r.ok;
}
async function loadCourseModes(courseIds) {
  if (!courseIds.length) return {};
  const keys = courseIds.map((id) => `course_mode:${id}`);
  const rows = await rest2(
    `admin_settings?key=in.(${keys.map((k) => `"${k}"`).join(",")})&select=key,value`
  );
  const out = {};
  for (const r of rows) {
    const id = String(r.key).slice("course_mode:".length);
    const v = typeof r.value === "string" ? r.value.replace(/^"|"$/g, "") : r.value;
    if (v === "sequential") out[id] = true;
  }
  return out;
}
async function saveCourseMode(companyId, courseId, sequential) {
  if (!sequential) {
    const del = await fetch(
      `${SUPABASE_URL6}/rest/v1/admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.${encodeURIComponent(`course_mode:${courseId}`)}`,
      { method: "DELETE", headers: { ...SVC_H3, Prefer: "return=minimal" } }
    );
    return del.ok;
  }
  const ins = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `course_mode:${courseId}`, value: JSON.stringify("sequential") })
  });
  return ins.ok;
}
async function courseOpenToMember(companyId, dba, userId, courseId) {
  const allowed = dba.learn_tiers[courseId];
  if (!allowed || !allowed.length) return true;
  const cfg = await loadChatCfg(companyId, dba.id);
  const myTier = cfg.tiers[userId] || null;
  return myTier !== null && allowed.includes(myTier);
}
async function effectiveTierDefs(companyId, dba) {
  if (dba.tier_defs.length) return dba.tier_defs.map((t) => ({ id: t.id, name: t.name, dm: t.dm, app: t.app }));
  return loadTierDefs(companyId);
}
function dmStaffSide(cfg, userId, isPrivileged) {
  if (isPrivileged) return true;
  return Object.values(cfg.leaders).some((byUser) => {
    const caps = byUser[userId];
    return !!(caps && (caps.del || caps.pin || caps.canvas));
  });
}
function dmSideAllowed(cfg, defs, userId, isPrivileged) {
  if (isPrivileged) return true;
  if (cfg.dm_enabled[userId] === true) return true;
  const tier = defs.find((t) => t.id === cfg.tiers[userId]);
  if (tier?.dm) return true;
  return Object.values(cfg.leaders).some((byUser) => {
    const caps = byUser[userId];
    return !!(caps && (caps.del || caps.pin || caps.canvas));
  });
}
async function loadChatCfg(companyId, dbaId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_chat:${dbaId}`)}&select=value`
  );
  const base2 = { all: {}, dm_enabled: {}, leaders: {}, tiers: {}, cal: {}, booking: {} };
  if (!rows[0]?.value) return base2;
  try {
    const v = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    const obj = (x) => x && typeof x === "object" ? x : {};
    return { all: obj(v?.all), dm_enabled: obj(v?.dm_enabled), leaders: obj(v?.leaders), tiers: obj(v?.tiers), cal: obj(v?.cal), booking: obj(v?.booking) };
  } catch {
    return base2;
  }
}
async function saveChatCfg(companyId, dbaId, cfg) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_chat:${dbaId}`, value: JSON.stringify(cfg) })
  });
  return r.ok;
}
async function chatRoster(companyId, dba) {
  const memberIds = dba.members.map((m) => m.id).filter(Boolean);
  const [memberProfiles, admins] = await Promise.all([
    memberIds.length ? rest2(`user_profiles?id=in.(${memberIds.join(",")})&select=id,name,full_name,email,is_active`) : Promise.resolve([]),
    rest2(`user_profiles?company_id=eq.${companyId}&role=eq.super_admin&is_active=not.is.false&select=id,name,full_name,email`)
  ]);
  const ownerIds = new Set(admins.filter((p) => String(p.email || "").toLowerCase() === OWNER_EMAIL).map((p) => String(p.id)));
  const adminList = admins.filter((p) => !ownerIds.has(String(p.id))).map((p) => ({ id: p.id, name: p.name || p.full_name || p.email, email: p.email, kind: "admin" }));
  const adminIds = new Set(adminList.map((a) => a.id));
  const members = memberProfiles.filter((p) => p.is_active !== false && !adminIds.has(p.id) && p.id !== dba.coach_id && !ownerIds.has(String(p.id))).map((p) => ({ id: p.id, name: p.name || p.full_name || p.email, email: p.email, kind: "member" }));
  return { members, admins: adminList, ownerIds };
}
async function ensureCommunityMembers(communityId, people, addedBy) {
  if (!people.length) return;
  const existing = await rest2(`community_members?community_id=eq.${communityId}&select=user_id`);
  const have = new Set(existing.map((r) => r.user_id));
  const rows = people.filter((p) => p.id && !have.has(p.id)).map((p) => ({
    community_id: communityId,
    user_id: p.id,
    user_name: p.name,
    user_role: p.role || "client",
    added_by: addedBy.id,
    added_by_name: addedBy.name || "Manager"
  }));
  if (!rows.length) return;
  await fetch(`${SUPABASE_URL6}/rest/v1/community_members`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  }).catch(() => {
  });
}
async function findDbaChannel(companyId, dbaId, communityId) {
  const comm = (await rest2(
    `communities?id=eq.${encodeURIComponent(String(communityId || ""))}&select=id,name,company_id,context,is_active`
  ))[0];
  if (!comm) return null;
  if (comm.company_id !== companyId) return null;
  if (comm.context !== `dba:${dbaId}` && comm.context !== `dbadm:${dbaId}`) return null;
  return comm;
}
async function revokeChatAccess(companyId, dbaId, userId) {
  const chans = await rest2(
    `communities?company_id=eq.${companyId}&context=in.(${encodeURIComponent(`"dba:${dbaId}","dbadm:${dbaId}"`)})&select=id,context,name`
  );
  const ids = chans.map((c) => c.id);
  if (ids.length) {
    await fetch(`${SUPABASE_URL6}/rest/v1/community_members?community_id=in.(${ids.join(",")})&user_id=eq.${userId}`, {
      method: "DELETE",
      headers: SVC_H3
    }).catch(() => {
    });
    await fetch(`${SUPABASE_URL6}/rest/v1/message_pins?conversation_id=in.(${ids.join(",")})&user_id=eq.${userId}&context=eq.community`, {
      method: "DELETE",
      headers: SVC_H3
    }).catch(() => {
    });
  }
  const dmIds = chans.filter((c) => c.context === `dbadm:${dbaId}` && String(c.name || "").split("_").includes(userId)).map((c) => c.id);
  if (dmIds.length) {
    await fetch(`${SUPABASE_URL6}/rest/v1/communities?id=in.(${dmIds.join(",")})`, {
      method: "PATCH",
      headers: { ...SVC_H3, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false })
    }).catch(() => {
    });
  }
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
    if (cfg.tiers[userId]) {
      delete cfg.tiers[userId];
      changed = true;
    }
    if (cfg.dm_enabled[userId]) {
      delete cfg.dm_enabled[userId];
      changed = true;
    }
    if (cfg.cal[userId]) {
      delete cfg.cal[userId];
      changed = true;
    }
    if (cfg.booking[userId]) {
      delete cfg.booking[userId];
      changed = true;
    }
    if (changed) await saveChatCfg(companyId, dbaId, cfg);
  } catch (e) {
    logger.warn({ err: e }, "[DBA] revokeChatAccess: config scrub failed");
  }
}
async function channelPower(me, hit, comm) {
  const manage = dbaAccess(me, hit.companyId, hit.dba).manage;
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  let caps = {};
  const granted = (cfg.leaders[comm.id] || {})[me.id];
  if (granted && (granted.del || granted.pin || granted.canvas)) {
    const inChan = await rest2(`community_members?community_id=eq.${comm.id}&user_id=eq.${me.id}&select=id&limit=1`);
    if (inChan.length) caps = granted;
  }
  return { manage, caps, cfg };
}
async function dbaCanvasWriteAllowed(communityId, user) {
  const comm = (await rest2(
    `communities?id=eq.${encodeURIComponent(communityId)}&select=id,company_id,context`
  ))[0];
  const ctx = String(comm?.context || "");
  if (!ctx.startsWith("dba:")) return true;
  const hit = await findDbaAnywhere(ctx.slice(4));
  if (!hit || hit.companyId !== comm.company_id) return false;
  if (user.id === hit.dba.coach_id) return true;
  if (user.role === "super_admin" && (user.companyId === hit.companyId || isHqAdmin({ company_id: user.companyId }))) return true;
  const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
  return !!(cfg.leaders[comm.id] || {})[user.id]?.canvas;
}
async function loadHuddles(companyId, dbaId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_huddles:${dbaId}`)}&select=value`
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
async function saveHuddles(companyId, dbaId, list) {
  const cutoff = Date.now() - 24 * 3600 * 1e3;
  const trimmed = list.filter((h) => h.is_active || Date.parse(h.created_at) > cutoff);
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_huddles:${dbaId}`, value: JSON.stringify(trimmed) })
  });
  return r.ok;
}
async function dailyKeyForDbaScope(companyId, dbaId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${companyId}&key=in.(${encodeURIComponent(`"dba_daily_key:${dbaId}","dba_daily_mode:${dbaId}"`)})&select=key,value`
  );
  const own = String(rows.find((r) => r.key === `dba_daily_key:${dbaId}`)?.value || "").trim();
  const mode = String(rows.find((r) => r.key === `dba_daily_mode:${dbaId}`)?.value || "").trim() === "own" ? "own" : "org";
  if (own) return { key: own, source: "dba", mode };
  if (mode === "own") return { key: "", source: "none", mode };
  const org = await dailyKeyForOrg(companyId);
  return { key: org, source: org ? "org" : "none", mode };
}
function dbaLeaderIds(cfg) {
  const ids = /* @__PURE__ */ new Set();
  for (const byUser of Object.values(cfg.leaders)) {
    for (const [uid, caps] of Object.entries(byUser)) {
      if (caps && (caps.del || caps.pin || caps.canvas)) ids.add(uid);
    }
  }
  return ids;
}
function huddleVisible(h, meId, manage, leaders) {
  if (manage || h.created_by === meId) return true;
  if (h.audience === "all") return true;
  if (h.audience === "leaders") return leaders.has(meId);
  return h.member_ids.includes(meId);
}
function pruneStale(list) {
  let changed = false;
  const out = list.map((h) => {
    if (h.is_active && Date.now() - Date.parse(h.created_at) > HUDDLE_TTL_MS) {
      changed = true;
      return { ...h, is_active: false, ended_at: (/* @__PURE__ */ new Date()).toISOString(), ended_by_name: "auto (room expired)" };
    }
    return h;
  });
  return { list: out, changed };
}
async function loadEvents(companyId, dbaId) {
  const rows = await rest2(
    `admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`dba_events:${dbaId}`)}&select=value`
  );
  try {
    const v = rows[0]?.value;
    const arr = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(arr) ? arr.filter((e) => e && e.id && e.title && e.start) : [];
  } catch {
    return [];
  }
}
async function saveEvents(companyId, dbaId, list) {
  const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key: `dba_events:${dbaId}`, value: JSON.stringify(list) })
  });
  return r.ok;
}
function canManageCalendar(meId, manage, cfg, dba) {
  if (manage) return true;
  return cfg.cal[meId] === true && dba.members.some((m) => m.id === meId);
}
function genTempPassword2() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 12; i++) out += chars[buf[i] % chars.length];
  return out;
}
async function audit(admin, action, targetId, details) {
  try {
    await fetch(`${SUPABASE_URL6}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H3, Prefer: "return=minimal" },
      body: JSON.stringify({
        action,
        actor_id: admin.id,
        actor_name: admin.name || "Admin",
        actor_role: "super_admin",
        target_type: "dba",
        target_id: targetId,
        details
      })
    });
  } catch {
  }
}
var SUPABASE_URL6, SUPABASE_ANON4, SERVICE_KEY6, EDEN_ID2, isHqAdmin, OWNER_EMAIL, SVC_H3, EMAIL_RE3, RESERVED_SLUGS, locks, router6, isEdenCourse, DEFAULT_TIER_DEFS, HUDDLE_TTL_MS, MAX_EVENTS, httpUrl, isoOrNull, dba_default;
var init_dba = __esm({
  "src/routes/dba.ts"() {
    "use strict";
    init_logger();
    init_mailer();
    init_auth();
    init_teamUpload();
    init_huddle();
    SUPABASE_URL6 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SUPABASE_ANON4 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
    SERVICE_KEY6 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    EDEN_ID2 = "b0000000-0000-0000-0000-000000000001";
    isHqAdmin = (a) => !a.company_id || a.company_id === EDEN_ID2;
    OWNER_EMAIL = "info@edencommunications.io";
    SVC_H3 = {
      apikey: SERVICE_KEY6,
      Authorization: `Bearer ${SERVICE_KEY6}`,
      "Content-Type": "application/json"
    };
    EMAIL_RE3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    RESERVED_SLUGS = /* @__PURE__ */ new Set(["video", "api", "__mockup", "eden"]);
    locks = /* @__PURE__ */ new Map();
    router6 = Router6();
    router6.get("/dba/brand", async (req, res) => {
      const slug = sanitizeSlug(String(req.query.slug || ""));
      if (!slug) return res.status(400).json({ ok: false, error: "slug required" });
      const all = await loadAllDbas();
      const hit = all.find((x) => x.dba.slug === slug && x.dba.is_active);
      if (!hit) return res.status(404).json({ ok: false, error: "Not found" });
      const orgs = await rest2(`organizations?id=eq.${encodeURIComponent(hit.companyId)}&select=id,name,slug,is_active`);
      if (orgs[0]?.is_active === false) return res.status(404).json({ ok: false, error: "Not found" });
      return res.json({ ok: true, dba: publicBrand(hit.dba, orgs[0] || null) });
    });
    router6.get("/dba/manifest", async (req, res) => {
      const slug = sanitizeSlug(String(req.query.slug || ""));
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
          { src: `${p}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      };
      res.setHeader("Content-Type", "application/manifest+json");
      res.setHeader("Cache-Control", "public, max-age=300");
      if (!slug) return res.json(edenDefault);
      const b = await brandBySlug(slug);
      if (!b) return res.json(edenDefault);
      const iconSrc = b.logo ? `/api/dba/icon?slug=${encodeURIComponent(slug)}` : null;
      return res.json({
        name: b.name,
        short_name: b.name.length > 12 ? b.name.slice(0, 12) : b.name,
        description: `The private space for ${b.name} members`,
        start_url: `${p}/${slug}`,
        scope: `${p}/`,
        display: "standalone",
        background_color: "#000000",
        theme_color: b.color || "#ffa600",
        orientation: "portrait",
        icons: [
          ...iconSrc ? [{ src: iconSrc, sizes: "512x512", type: "image/png", purpose: "any" }] : [],
          ...edenDefault.icons
        ]
      });
    });
    router6.get("/dba/icon", async (req, res) => {
      const slug = sanitizeSlug(String(req.query.slug || ""));
      try {
        const b = slug ? await brandBySlug(slug) : null;
        const logo = b?.logo || "";
        const dataM = logo.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
        if (dataM) {
          res.setHeader("Content-Type", dataM[1]);
          res.setHeader("Cache-Control", "public, max-age=3600");
          return res.send(Buffer.from(dataM[2], "base64"));
        }
        if (/^https:\/\//i.test(logo) && logo.startsWith(`${SUPABASE_URL6}/storage/`)) {
          const r = await fetch(logo);
          const ct = r.headers.get("content-type") || "";
          if (r.ok && /^image\//i.test(ct)) {
            res.setHeader("Content-Type", ct);
            res.setHeader("Cache-Control", "public, max-age=3600");
            return res.send(Buffer.from(await r.arrayBuffer()));
          }
        }
      } catch {
      }
      return res.redirect(302, "/apple-touch-icon.png");
    });
    router6.get("/dba/list", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (admin) {
        const companyId2 = await adminOrgScope(admin, req);
        if (!companyId2) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
        const [allowed, dbas2] = await Promise.all([dbaAllowedForOrg(companyId2), loadOrgDbas(companyId2)]);
        return res.json({ ok: true, allowed, scope: "org", dbas: dbas2.sort((a, b) => a.created_at.localeCompare(b.created_at)) });
      }
      const me = await requireUserJwt(req);
      if (!me || me.role === "client" || me.role === "dba_member") {
        return res.status(403).json({ ok: false, error: "Not authorized" });
      }
      const companyId = me.company_id || EDEN_ID2;
      const dbas = (await loadOrgDbas(companyId)).filter(
        (d) => d.coach_id === me.id || (d.delegates || []).some((g) => g.id === me.id)
      );
      return res.json({ ok: true, allowed: dbas.length > 0, scope: "mine", dbas: dbas.sort((a, b) => a.created_at.localeCompare(b.created_at)) });
    });
    router6.get("/dba/org-staff", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = await adminOrgScope(admin, req);
      if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      const rows = await rest2(
        `user_profiles?company_id=eq.${encodeURIComponent(companyId)}&role=neq.client&is_active=not.is.false&select=id,name,role,email&order=name.asc`
      );
      return res.json({
        ok: true,
        coaches: rows.filter((r) => ["coach", "head_coach", "super_admin"].includes(r.role)).map((r) => ({ id: r.id, name: r.name, role: r.role })),
        staff: rows.filter((r) => r.role !== "super_admin").map((r) => ({ id: r.id, name: r.name, role: r.role, email: r.email }))
      });
    });
    router6.post("/dba/delegate-set", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = await adminOrgScope(admin, req);
      if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      const { dbaId, userId, allowed } = req.body || {};
      return withLock("dba-write", async () => {
        const dba = (await loadOrgDbas(companyId)).find((d) => d.id === String(dbaId || ""));
        if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
        const rows = await rest2(
          `user_profiles?id=eq.${encodeURIComponent(String(userId || ""))}&company_id=eq.${encodeURIComponent(companyId)}&role=neq.client&is_active=not.is.false&select=id,name,full_name,email,role`
        );
        const person = rows[0];
        if (!person) return res.status(404).json({ ok: false, error: "That person isn't on your team" });
        const name = person.name || person.full_name || "Staff member";
        const had = (dba.delegates || []).some((g) => g.id === person.id);
        if (allowed && !had) {
          dba.delegates = [
            ...dba.delegates || [],
            { id: person.id, name, email: String(person.email || "").toLowerCase(), granted_at: (/* @__PURE__ */ new Date()).toISOString(), granted_by: admin.id }
          ];
        } else if (!allowed && had) {
          dba.delegates = (dba.delegates || []).filter((g) => g.id !== person.id);
        } else {
          return res.json({ ok: true, delegates: dba.delegates || [] });
        }
        if (!await saveDbaRow(companyId, dba)) {
          return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        }
        await audit(admin, "dba_staff_access_changed", dba.id, {
          dba: dba.name,
          staff: name,
          access: allowed ? "granted" : "revoked",
          summary: allowed ? `Gave ${name} management access to ${dba.name}` : `Removed ${name}'s management access to ${dba.name}`
        });
        return res.json({ ok: true, delegates: dba.delegates });
      });
    });
    router6.post("/dba/save", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = await adminOrgScope(admin, req);
      if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      if (!await dbaAllowedForOrg(companyId)) {
        return res.status(403).json({ ok: false, error: "DBAs aren't included in your current plan." });
      }
      return withLock("dba-write", async () => {
        const b = req.body || {};
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
        let coachId = existing?.coach_id || null;
        let coachName = existing?.coach_name || null;
        if (b.coachId !== void 0) {
          if (b.coachId) {
            const rows = await rest2(
              `user_profiles?id=eq.${encodeURIComponent(String(b.coachId))}&company_id=eq.${encodeURIComponent(companyId)}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,name`
            );
            if (!rows[0]) return res.status(400).json({ ok: false, error: "That coach isn't part of your organization" });
            coachId = rows[0].id;
            coachName = rows[0].name || null;
          } else {
            coachId = null;
            coachName = null;
          }
        }
        const hex = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : null;
        const dba = {
          id: existing?.id || randomUUID(),
          delegates: existing?.delegates || [],
          name,
          slug,
          coach_id: coachId,
          coach_name: coachName,
          logo_url: typeof b.logoUrl === "string" ? b.logoUrl.trim() || null : existing?.logo_url || null,
          brand_color: b.brandColor !== void 0 ? hex(b.brandColor) : existing?.brand_color || null,
          brand_colors: Array.isArray(b.brandColors) ? b.brandColors.map(hex).filter(Boolean).slice(0, 5) : existing?.brand_colors || [],
          is_active: existing ? existing.is_active : true,
          created_at: existing?.created_at || (/* @__PURE__ */ new Date()).toISOString(),
          members: existing?.members || [],
          connect: existing?.connect || [],
          learn_course_ids: existing?.learn_course_ids || [],
          tier_defs: existing?.tier_defs || [],
          learn_tiers: existing?.learn_tiers || {}
        };
        if (!await saveDbaRow(companyId, dba)) {
          return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        }
        void audit(admin, existing ? "dba_updated" : "dba_created", dba.id, { name: dba.name, slug: dba.slug, coach: dba.coach_name });
        logger.info({ adminId: admin.id, dbaId: dba.id, slug: dba.slug }, "[DBA] saved");
        return res.json({ ok: true, dba });
      });
    });
    router6.post("/dba/archive", async (req, res) => {
      const admin = await requireAdminJwt(req);
      if (!admin) return res.status(403).json({ ok: false, error: "Not authorized" });
      const companyId = await adminOrgScope(admin, req);
      if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      const { id, active } = req.body || {};
      return withLock("dba-write", async () => {
        const dba = (await loadOrgDbas(companyId)).find((d) => d.id === id);
        if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
        dba.is_active = active !== false;
        if (!await saveDbaRow(companyId, dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(admin, dba.is_active ? "dba_restored" : "dba_archived", dba.id, { name: dba.name });
        return res.json({ ok: true, dba });
      });
    });
    router6.post("/dba/member-add", async (req, res) => {
      const { dbaId } = req.body || {};
      let admin = await requireAdminJwt(req);
      let companyId = null;
      let managerMe = null;
      if (admin) {
        companyId = await adminOrgScope(admin, req);
        if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      } else {
        const me = await requireUserJwt(req);
        if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        admin = me;
        managerMe = me;
        companyId = hit.companyId;
      }
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      const name = String((req.body || {}).name || "").trim();
      if (!email || !EMAIL_RE3.test(email)) return res.status(400).json({ ok: false, error: "Valid email required" });
      if (!name) return res.status(400).json({ ok: false, error: "Name required" });
      return withLock("dba-write", async () => {
        const dba = (await loadOrgDbas(companyId)).find((d) => d.id === dbaId);
        if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (managerMe && !dbaAccess(managerMe, companyId, dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        if (!dba.is_active) return res.status(400).json({ ok: false, error: "This DBA is archived \u2014 restore it first" });
        if (dba.members.some((m) => m.email.toLowerCase() === email)) {
          return res.status(409).json({ ok: false, error: "That person is already a member of this DBA" });
        }
        const profRows = await rest2(
          `user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,role,is_active`
        );
        let profile = profRows[0] || null;
        if (profile && profile.is_active === false) {
          return res.status(400).json({ ok: false, error: "That account is deactivated \u2014 reactivate it first" });
        }
        let emailed = false;
        let existedLogin = !!profile;
        if (!profile) {
          const ins = await fetch(`${SUPABASE_URL6}/rest/v1/user_profiles`, {
            method: "POST",
            headers: { ...SVC_H3, Prefer: "return=representation" },
            // user_profiles.id has no DB default — must supply one. Role must be
            // 'client' (the table's check constraint has no dba_member value);
            // their DBA-member identity lives in auth metadata + the member entry.
            body: JSON.stringify({ id: randomUUID(), email, name, role: "client", company_id: companyId })
          });
          const created = ins.ok ? await ins.json().catch(() => []) : [];
          if (!created[0]) return res.status(502).json({ ok: false, error: "Couldn't create the member profile \u2014 try again" });
          profile = created[0];
          const tempPassword = genTempPassword2();
          const prov = await provisionAuthUser(email, tempPassword, name, true, {
            company_id: companyId,
            intended_role: "dba_member"
          });
          if (!prov.ok) {
            await fetch(`${SUPABASE_URL6}/rest/v1/user_profiles?id=eq.${profile.id}`, { method: "DELETE", headers: SVC_H3 }).catch(() => {
            });
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
          const m = dbaAddedEmail({ name: profile?.name || name, dbaName: dba.name, dbaSlug: dba.slug });
          const sent = await sendEmail({ to: email, fromName: dba.name, ...m });
          emailed = !!sent.ok;
          if (!sent.ok) logger.warn({ email, error: sent.error }, "[DBA] added email failed");
        }
        dba.members.push({ id: profile?.id || null, email, name: profile?.name || name, added_at: (/* @__PURE__ */ new Date()).toISOString(), pure: !existedLogin });
        if (!await saveDbaRow(companyId, dba)) return res.status(502).json({ ok: false, error: "Couldn't save the membership \u2014 try again" });
        try {
          const { recordInviteEmail: recordInviteEmail2 } = await Promise.resolve().then(() => (init_invites(), invites_exports));
          await recordInviteEmail2(companyId, email, emailed);
        } catch {
        }
        void audit(admin, "dba_member_added", dba.id, { dba: dba.name, member: email });
        if (profile?.id) {
          void (async () => {
            try {
              const cfg = await loadChatCfg(companyId, dba.id);
              for (const cid of Object.keys(cfg.all).filter((k) => cfg.all[k])) {
                await ensureCommunityMembers(cid, [{ id: profile.id, name: profile.name || name }], { id: admin.id, name: admin.name || null });
              }
            } catch (e) {
              logger.warn({ err: e }, "[DBA] auto-join failed");
            }
          })();
        }
        return res.json({ ok: true, dba, emailed, existed: existedLogin });
      });
    });
    router6.post("/dba/member-remove", async (req, res) => {
      const { dbaId } = req.body || {};
      let admin = await requireAdminJwt(req);
      let companyId = null;
      let managerMe = null;
      if (admin) {
        companyId = await adminOrgScope(admin, req);
        if (!companyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      } else {
        const me = await requireUserJwt(req);
        if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        admin = me;
        managerMe = me;
        companyId = hit.companyId;
      }
      const email = String((req.body || {}).email || "").trim().toLowerCase();
      return withLock("dba-write", async () => {
        const dba = (await loadOrgDbas(companyId)).find((d) => d.id === dbaId);
        if (!dba) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (managerMe && !dbaAccess(managerMe, companyId, dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const before2 = dba.members.length;
        dba.members = dba.members.filter((m) => m.email.toLowerCase() !== email);
        if (dba.members.length === before2) return res.status(404).json({ ok: false, error: "Not a member" });
        const removed = (await rest2(`user_profiles?email=eq.${encodeURIComponent(email)}&select=id`))[0];
        if (!await saveDbaRow(companyId, dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        if (removed?.id) await revokeChatAccess(companyId, dba.id, removed.id).catch(() => {
        });
        void audit(admin, "dba_member_removed", dba.id, { dba: dba.name, member: email });
        return res.json({ ok: true, dba });
      });
    });
    isEdenCourse = (c) => !c.company_id || c.company_id === EDEN_ID2;
    router6.get("/dba/content", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String(req.query.id || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      const { companyId, dba } = hit;
      const acc = dbaAccess(me, companyId, dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const ids = dba.learn_course_ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      let courses = [];
      let modules = [];
      if (ids.length) {
        courses = await rest2(
          `courses?id=in.(${ids.join(",")})&is_active=eq.true&select=id,title,description,company_id,sort_order&order=sort_order.asc`
        );
        courses = courses.filter((c) => c.company_id === companyId || isEdenCourse(c));
        if (!acc.manage && courses.length) {
          const gated = Object.keys(dba.learn_tiers).length > 0;
          if (gated) {
            const cfg = await loadChatCfg(companyId, dba.id);
            const myTier = cfg.tiers[me.id] || null;
            courses = courses.filter((c) => {
              const allowed = dba.learn_tiers[String(c.id)];
              return !allowed || !allowed.length || myTier !== null && allowed.includes(myTier);
            });
          }
        }
        if (courses.length) {
          modules = await rest2(
            `course_modules?course_id=in.(${courses.map((c) => c.id).join(",")})&select=id,course_id,module_id,title,duration,video_url,admin_notes,section_id,section_title,section_color,sort_order&order=sort_order.asc`
          );
        }
      }
      let completed = [];
      if (courses.length) {
        const prog = await rest2(
          `course_progress?user_id=eq.${encodeURIComponent(me.id)}&course_id=in.(${courses.map((c) => c.id).join(",")})&completed=eq.true&select=module_id`
        );
        completed = prog.map((p) => String(p.module_id));
      }
      let available;
      if (acc.manage) {
        const all = await rest2(`courses?is_active=eq.true&select=id,title,company_id,sort_order&order=sort_order.asc`);
        available = all.filter((c) => c.company_id === companyId || isEdenCourse(c)).map((c) => ({ id: c.id, title: c.title }));
      }
      const seqModes = await loadCourseModes(courses.map((c) => String(c.id)));
      return res.json({
        ok: true,
        connect: dba.connect,
        courses: courses.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description || "",
          // Managers may edit courses owned by the DBA's org (never Eden's shared ones)
          editable: acc.manage && c.company_id === companyId,
          sequential: !!seqModes[String(c.id)],
          modules: modules.filter((m) => m.course_id === c.id)
        })),
        completed,
        can_manage: acc.manage,
        available_courses: available
      });
    });
    router6.post("/dba/connect-save", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, connect } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const clean = (Array.isArray(connect) ? connect : []).map((l) => ({
          id: typeof l?.id === "string" && l.id ? l.id : randomUUID(),
          emoji: l?.emoji ? String(l.emoji).trim().slice(0, 8) : null,
          title: String(l?.title || "").trim().slice(0, 120),
          url: String(l?.url || "").trim().slice(0, 500),
          desc: l?.desc ? String(l.desc).trim().slice(0, 300) : null
        })).filter((l) => l.title && /^https?:\/\//i.test(l.url)).slice(0, 50);
        hit.dba.connect = clean;
        if (!await saveDbaRow(hit.companyId, hit.dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_connect_updated", hit.dba.id, { dba: hit.dba.name, links: clean.length });
        return res.json({ ok: true, connect: clean });
      });
    });
    router6.post("/dba/learn-save", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseIds } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const want = (Array.isArray(courseIds) ? courseIds : []).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
        let valid = [];
        if (want.length) {
          const rows = await rest2(`courses?id=in.(${want.join(",")})&is_active=eq.true&select=id,company_id`);
          valid = rows.filter((c) => c.company_id === hit.companyId || isEdenCourse(c)).map((c) => String(c.id));
        }
        hit.dba.learn_course_ids = valid;
        if (!await saveDbaRow(hit.companyId, hit.dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_learn_updated", hit.dba.id, { dba: hit.dba.name, courses: valid.length });
        return res.json({ ok: true, learn_course_ids: valid });
      });
    });
    router6.post("/dba/course-save", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseId, title, description, sequential } = req.body || {};
      const t = String(title || "").trim().slice(0, 160);
      const d = String(description || "").trim().slice(0, 1e3);
      if (!t) return res.status(400).json({ ok: false, error: "Course needs a title" });
      return withLock("dba-write", async () => {
        const { err, hit } = await dbaEditableCourse(me, dbaId);
        if (err) return res.status(err).json({ ok: false, error: err === 404 ? "DBA not found" : "Not authorized" });
        const { companyId, dba } = hit;
        if (courseId) {
          const rows = await rest2(`courses?id=eq.${encodeURIComponent(String(courseId))}&company_id=eq.${encodeURIComponent(companyId)}&select=id`);
          if (!rows[0] || !dba.learn_course_ids.includes(String(courseId)))
            return res.status(403).json({ ok: false, error: "That course can't be edited here" });
          const r2 = await fetch(`${SUPABASE_URL6}/rest/v1/courses?id=eq.${encodeURIComponent(String(courseId))}&company_id=eq.${encodeURIComponent(companyId)}`, {
            method: "PATCH",
            headers: { ...SVC_H3, Prefer: "return=minimal" },
            body: JSON.stringify({ title: t, description: d || null })
          });
          if (!r2.ok) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
          if (sequential !== void 0 && !await saveCourseMode(companyId, String(courseId), !!sequential))
            return res.status(502).json({ ok: false, error: "Couldn't save the lesson-order setting \u2014 try again" });
          void audit({ id: me.id, name: me.name }, "dba_course_updated", dba.id, { dba: dba.name, course: t });
          return res.json({ ok: true, courseId });
        }
        const maxRows = await rest2(`courses?select=sort_order&order=sort_order.desc.nullslast&limit=1`);
        const sort = (Number(maxRows[0]?.sort_order) || 0) + 1;
        const r = await fetch(`${SUPABASE_URL6}/rest/v1/courses`, {
          method: "POST",
          headers: { ...SVC_H3, Prefer: "return=representation" },
          body: JSON.stringify({ title: t, description: d || null, is_active: true, sort_order: sort, created_by: me.id, company_id: companyId })
        });
        const made = r.ok ? await r.json().catch(() => []) : [];
        if (!made[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't create the course \u2014 try again" });
        dba.learn_course_ids = [...dba.learn_course_ids, String(made[0].id)];
        await saveDbaRow(companyId, dba);
        if (sequential && !await saveCourseMode(companyId, String(made[0].id), true)) {
          return res.status(502).json({ ok: false, error: "The course was created, but the lesson-order setting didn't save \u2014 open the course and set it again from \u270E Edit course" });
        }
        void audit({ id: me.id, name: me.name }, "dba_course_created", dba.id, { dba: dba.name, course: t });
        return res.json({ ok: true, courseId: String(made[0].id) });
      });
    });
    router6.post("/dba/lesson-save", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseId, lessonId, sectionTitle, title, duration, videoUrl, notes } = req.body || {};
      const t = String(title || "").trim().slice(0, 160);
      if (!t) return res.status(400).json({ ok: false, error: "Lesson needs a title" });
      const vid = String(videoUrl || "").trim().slice(0, 500);
      if (vid && !/^https?:\/\//i.test(vid)) return res.status(400).json({ ok: false, error: "Video link must start with http:// or https://" });
      return withLock("dba-write", async () => {
        const { err, hit } = await dbaEditableCourse(me, dbaId);
        if (err) return res.status(err).json({ ok: false, error: err === 404 ? "DBA not found" : "Not authorized" });
        const { companyId, dba } = hit;
        const owned = await rest2(`courses?id=eq.${encodeURIComponent(String(courseId || ""))}&company_id=eq.${encodeURIComponent(companyId)}&select=id`);
        if (!owned[0] || !dba.learn_course_ids.includes(String(courseId)))
          return res.status(403).json({ ok: false, error: "That course can't be edited here" });
        const patchBody = { title: t, duration: String(duration || "").trim().slice(0, 40) || null, video_url: vid || null, admin_notes: String(notes || "").trim().slice(0, 8e3) || null, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        if (lessonId) {
          const own = await rest2(`course_modules?id=eq.${encodeURIComponent(String(lessonId))}&course_id=eq.${encodeURIComponent(String(courseId))}&select=id&limit=1`);
          if (!own[0]) return res.status(403).json({ ok: false, error: "That lesson isn't part of this course" });
          const r2 = await fetch(`${SUPABASE_URL6}/rest/v1/course_modules?id=eq.${encodeURIComponent(String(lessonId))}&course_id=eq.${encodeURIComponent(String(courseId))}`, {
            method: "PATCH",
            headers: { ...SVC_H3, Prefer: "return=minimal" },
            body: JSON.stringify(patchBody)
          });
          if (!r2.ok) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
          return res.json({ ok: true, lessonId });
        }
        const mods = await rest2(`course_modules?course_id=eq.${encodeURIComponent(String(courseId))}&select=section_id,section_title,section_color,sort_order,module_id`);
        const secTitle = String(sectionTitle || "").trim().slice(0, 120) || "Lessons";
        const existing = mods.find((m) => String(m.section_title || "").trim().toLowerCase() === secTitle.toLowerCase());
        const sectionId = existing ? existing.section_id : Math.max(0, ...mods.map((m) => Number(m.section_id) || 0)) + 1;
        const sortOrder = Math.max(0, ...mods.map((m) => Number(m.sort_order) || 0)) + 1;
        const inSection = mods.filter((m) => m.section_id === sectionId).length;
        const r = await fetch(`${SUPABASE_URL6}/rest/v1/course_modules`, {
          method: "POST",
          headers: { ...SVC_H3, Prefer: "return=representation" },
          body: JSON.stringify({
            course_id: courseId,
            section_id: sectionId,
            section_title: secTitle,
            section_color: existing?.section_color || null,
            module_id: `${sectionId}.${inSection + 1}`,
            sort_order: sortOrder,
            ...patchBody
          })
        });
        const made = r.ok ? await r.json().catch(() => []) : [];
        if (!made[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't add the lesson \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_lesson_added", dba.id, { dba: dba.name, lesson: t });
        return res.json({ ok: true, lessonId: String(made[0].id) });
      });
    });
    router6.post("/dba/lesson-delete", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseId, lessonId } = req.body || {};
      return withLock("dba-write", async () => {
        const { err, hit } = await dbaEditableCourse(me, dbaId);
        if (err) return res.status(err).json({ ok: false, error: err === 404 ? "DBA not found" : "Not authorized" });
        const { companyId, dba } = hit;
        const owned = await rest2(`courses?id=eq.${encodeURIComponent(String(courseId || ""))}&company_id=eq.${encodeURIComponent(companyId)}&select=id`);
        if (!owned[0] || !dba.learn_course_ids.includes(String(courseId)))
          return res.status(403).json({ ok: false, error: "That course can't be edited here" });
        const r = await fetch(`${SUPABASE_URL6}/rest/v1/course_modules?id=eq.${encodeURIComponent(String(lessonId || ""))}&course_id=eq.${encodeURIComponent(String(courseId))}`, {
          method: "DELETE",
          headers: { ...SVC_H3, Prefer: "return=minimal" }
        });
        if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't delete \u2014 try again" });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/progress", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseId, moduleId, completed } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      if (!hit.dba.learn_course_ids.includes(String(courseId))) {
        return res.status(403).json({ ok: false, error: "That course isn't part of this DBA" });
      }
      if (!acc.manage && !await courseOpenToMember(hit.companyId, hit.dba, me.id, String(courseId))) {
        return res.status(403).json({ ok: false, error: "Your tier doesn't include that course" });
      }
      const modCheck = await fetch(
        `${SUPABASE_URL6}/rest/v1/course_modules?id=eq.${encodeURIComponent(String(moduleId || ""))}&course_id=eq.${encodeURIComponent(String(courseId))}&select=id&limit=1`,
        { headers: SVC_H3 }
      );
      const modRows = modCheck.ok ? await modCheck.json().catch(() => []) : [];
      if (!modRows[0]) return res.status(403).json({ ok: false, error: "That lesson isn't part of this course" });
      if (!acc.manage && completed !== false) {
        const modes = await loadCourseModes([String(courseId)]);
        if (modes[String(courseId)]) {
          const [allModsRaw, myDone] = await Promise.all([
            rest2(`course_modules?course_id=eq.${encodeURIComponent(String(courseId))}&select=id,section_id,sort_order`),
            rest2(`course_progress?user_id=eq.${encodeURIComponent(me.id)}&course_id=eq.${encodeURIComponent(String(courseId))}&completed=eq.true&select=module_id`)
          ]);
          const allMods = [...allModsRaw].sort((a, b) => (a.section_id ?? 0) - (b.section_id ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)));
          const doneSet = new Set(myDone.map((p) => String(p.module_id)));
          const idx = allMods.findIndex((m) => String(m.id) === String(moduleId));
          const blocked = idx > 0 && allMods.slice(0, idx).some((m) => !doneSet.has(String(m.id)));
          if (blocked) return res.status(403).json({ ok: false, error: "Finish the earlier lessons first \u2014 this course unlocks in order" });
        }
      }
      const r = await fetch(`${SUPABASE_URL6}/rest/v1/course_progress`, {
        method: "POST",
        headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: me.id,
          course_id: courseId,
          module_id: moduleId,
          completed: completed !== false,
          completed_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't save your progress \u2014 try again" });
      return res.json({ ok: true });
    });
    router6.get("/dba/mine", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const all = await loadAllDbas();
      const mine = all.filter(
        ({ companyId, dba }) => dba.is_active && (dba.members.some((m) => m.email.toLowerCase() === me.email) || dba.coach_id === me.id || // org admins see their org's DBAs; Eden HQ admins see every org's
        me.role === "super_admin" && (me.company_id === companyId || isHqAdmin(me)) || // delegated staff enter the DBA space just like its coach
        me.company_id === companyId && me.role !== "client" && me.role !== "dba_member" && (dba.delegates || []).some((g) => g.id === me.id))
      );
      const orgIds = [...new Set(mine.map((m) => m.companyId))];
      const orgs = orgIds.length ? await rest2(`organizations?id=in.(${orgIds.map(encodeURIComponent).join(",")})&select=id,name,slug`) : [];
      const orgMap = new Map(orgs.map((o) => [o.id, o]));
      return res.json({
        ok: true,
        dbas: mine.map(({ companyId, dba }) => publicBrand(dba, orgMap.get(companyId) || null))
      });
    });
    DEFAULT_TIER_DEFS = [
      { id: "t1", name: "Tier 1 \u2014 Community", dm: false, app: false },
      { id: "t2", name: "Tier 2 \u2014 1v1 Access", dm: true, app: false },
      { id: "t3", name: "Tier 3 \u2014 Full App", dm: true, app: true }
    ];
    router6.get("/course-modes", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 100);
      return res.json({ ok: true, modes: await loadCourseModes(ids) });
    });
    router6.post("/course-progress", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { courseId, moduleId, completed } = req.body || {};
      const cid = String(courseId || "");
      const mid = String(moduleId || "");
      if (!/^[0-9a-f-]{36}$/i.test(cid) || !mid || mid.length > 40) {
        return res.status(400).json({ ok: false, error: "courseId and moduleId required" });
      }
      const isAdmin = me.role === "super_admin";
      const modRows = await rest2(
        `course_modules?course_id=eq.${encodeURIComponent(cid)}&module_id=eq.${encodeURIComponent(mid)}&select=id&limit=1`
      );
      if (!modRows[0]) return res.status(403).json({ ok: false, error: "That lesson isn't part of this course" });
      if (!isAdmin) {
        const [access, courseRows] = await Promise.all([
          rest2(`course_access?user_id=eq.${encodeURIComponent(me.id)}&course_id=eq.${encodeURIComponent(cid)}&revoked=eq.false&select=id&limit=1`),
          rest2(`courses?id=eq.${encodeURIComponent(cid)}&is_active=eq.true&select=id&limit=1`)
        ]);
        if (!access[0] || !courseRows[0]) {
          return res.status(403).json({ ok: false, error: "You don't have access to that course" });
        }
      }
      if (!isAdmin && completed !== false) {
        const modes = await loadCourseModes([cid]);
        if (modes[cid]) {
          const [allModsRaw, myDone] = await Promise.all([
            rest2(`course_modules?course_id=eq.${encodeURIComponent(cid)}&select=id,module_id,section_id,sort_order`),
            rest2(`course_progress?user_id=eq.${encodeURIComponent(me.id)}&course_id=eq.${encodeURIComponent(cid)}&completed=eq.true&select=module_id`)
          ]);
          const allMods = [...allModsRaw].sort((a, b) => (a.section_id ?? 0) - (b.section_id ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id)));
          const doneSet = new Set(myDone.map((p) => String(p.module_id)));
          const idx = allMods.findIndex((m) => String(m.module_id) === mid);
          const blocked = idx > 0 && allMods.slice(0, idx).some((m) => !doneSet.has(String(m.module_id)));
          if (blocked) return res.status(403).json({ ok: false, error: "Finish the earlier lessons first \u2014 this course unlocks in order" });
        }
      }
      const r = await fetch(`${SUPABASE_URL6}/rest/v1/course_progress`, {
        method: "POST",
        headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: me.id,
          course_id: cid,
          module_id: mid,
          completed: completed !== false,
          completed_at: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't save your progress \u2014 try again" });
      return res.json({ ok: true });
    });
    router6.get("/dba/chat-config", async (req, res) => {
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
        effectiveTierDefs(hit.companyId, hit.dba),
        // Channel list served here (service key) so managers get it even when
        // their own login's RLS wouldn't let them read another org's communities
        // (Eden HQ managing a white-label org's DBA).
        acc.manage ? rest2(`communities?context=eq.${encodeURIComponent(`dba:${String(req.query.id || "")}`)}&is_active=not.is.false&select=id,name&order=created_at.asc`) : Promise.resolve(null)
      ]);
      const priv = (id) => id === hit.dba.coach_id || roster.admins.some((a) => a.id === id);
      const myDm = dmSideAllowed(cfg, tierDefs, me.id, acc.manage || priv(me.id));
      const everyone = [
        ...roster.members,
        ...roster.admins,
        ...hit.dba.coach_id && !roster.admins.some((a) => a.id === hit.dba.coach_id) && !roster.ownerIds.has(String(hit.dba.coach_id)) ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", email: "", kind: "coach" }] : []
      ];
      const meStaff = acc.manage || dmStaffSide(cfg, me.id, priv(me.id));
      const dmTargets = myDm ? everyone.filter((p) => p.id !== me.id && (meStaff || dmSideAllowed(cfg, tierDefs, p.id, priv(p.id)))).map((p) => p.id) : [];
      return res.json({
        ok: true,
        can_manage: acc.manage,
        me: { id: me.id, name: me.name, role: me.role },
        coach: hit.dba.coach_id && !roster.ownerIds.has(String(hit.dba.coach_id)) ? { id: hit.dba.coach_id, name: hit.dba.coach_name } : null,
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
        channels: Array.isArray(chanRows) ? chanRows.map((c) => ({ id: c.id, name: c.name })) : void 0
      });
    });
    router6.post("/dba/channel-create", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, allDba, memberIds } = req.body || {};
      const name = String((req.body || {}).name || "").trim().slice(0, 80);
      if (!name) return res.status(400).json({ ok: false, error: "Channel name required" });
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const ins = await fetch(`${SUPABASE_URL6}/rest/v1/communities`, {
          method: "POST",
          headers: { ...SVC_H3, Prefer: "return=representation" },
          body: JSON.stringify({
            company_id: hit.companyId,
            name,
            context: `dba:${hit.dba.id}`,
            created_by: me.id,
            created_by_name: me.name || "Manager",
            is_active: true
          })
        });
        const created = ins.ok ? await ins.json().catch(() => []) : [];
        if (!created[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't create the channel \u2014 try again" });
        const communityId = created[0].id;
        const roster = await chatRoster(hit.companyId, hit.dba);
        let people = [{ id: me.id, name: me.name || "Manager", role: me.role }];
        if (allDba) {
          people = people.concat(roster.members.map((m) => ({ id: m.id, name: m.name })));
          if (hit.dba.coach_id) people.push({ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", role: "coach" });
          const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
          cfg.all[communityId] = true;
          await saveChatCfg(hit.companyId, hit.dba.id, cfg);
        } else {
          const wanted = new Set((Array.isArray(memberIds) ? memberIds : []).map(String));
          const eligible = [
            ...roster.members,
            ...roster.admins,
            ...hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach" }] : []
          ];
          people = people.concat(eligible.filter((p) => wanted.has(p.id)).map((p) => ({ id: p.id, name: p.name })));
        }
        await ensureCommunityMembers(communityId, people, { id: me.id, name: me.name });
        void audit({ id: me.id, name: me.name }, "dba_channel_created", hit.dba.id, { dba: hit.dba.name, channel: name, all: !!allDba });
        return res.json({ ok: true, id: communityId });
      });
    });
    router6.post("/dba/channel-rename", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId } = req.body || {};
      const name = String((req.body || {}).name || "").trim().slice(0, 80);
      if (!name) return res.status(400).json({ ok: false, error: "Name required" });
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
      if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
      const r = await fetch(`${SUPABASE_URL6}/rest/v1/communities?id=eq.${comm.id}`, {
        method: "PATCH",
        headers: { ...SVC_H3, "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't rename \u2014 try again" });
      void audit({ id: me.id, name: me.name }, "dba_channel_renamed", hit.dba.id, { dba: hit.dba.name, from: comm.name, to: name });
      return res.json({ ok: true });
    });
    router6.post("/dba/channel-archive", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
        if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
        const r = await fetch(`${SUPABASE_URL6}/rest/v1/communities?id=eq.${comm.id}`, {
          method: "PATCH",
          headers: { ...SVC_H3, "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: false })
        });
        if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't archive \u2014 try again" });
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        if (cfg.all[comm.id]) {
          delete cfg.all[comm.id];
          await saveChatCfg(hit.companyId, hit.dba.id, cfg);
        }
        void audit({ id: me.id, name: me.name }, "dba_channel_archived", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/channel-member-add", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, userId } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
      if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
      const roster = await chatRoster(hit.companyId, hit.dba);
      const eligible = [
        ...roster.members,
        ...roster.admins,
        ...hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach", kind: "coach" }] : []
      ];
      const person = eligible.find((p) => p.id === String(userId));
      if (!person) return res.status(403).json({ ok: false, error: "That person isn't part of this DBA" });
      await ensureCommunityMembers(comm.id, [{ id: person.id, name: person.name, role: person.kind === "member" ? "client" : person.kind }], { id: me.id, name: me.name });
      await audit(me, "dba_channel_member_added", hit.dba.id, { dba: hit.dba.name, channel: comm.name, person: person.name });
      return res.json({ ok: true });
    });
    router6.post("/dba/channel-member-remove", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, userId } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
      if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
      await fetch(`${SUPABASE_URL6}/rest/v1/community_members?community_id=eq.${comm.id}&user_id=eq.${encodeURIComponent(String(userId || ""))}`, {
        method: "DELETE",
        headers: SVC_H3
      }).catch(() => {
      });
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
    router6.post("/dba/chat-flags", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, allDba } = req.body || {};
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
          const people = roster.members.map((m) => ({ id: m.id, name: m.name })).concat(hit.dba.coach_id ? [{ id: hit.dba.coach_id, name: hit.dba.coach_name || "Coach" }] : []);
          await ensureCommunityMembers(comm.id, people, { id: me.id, name: me.name });
        } else {
          delete cfg.all[comm.id];
        }
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        await audit(me, "dba_channel_audience_changed", hit.dba.id, { dba: hit.dba.name, channel: comm.name, everyone: !!allDba });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/dm-open", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, otherId } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
        const acc = dbaAccess(me, hit.companyId, hit.dba);
        if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const other = (await rest2(`user_profiles?id=eq.${encodeURIComponent(String(otherId || ""))}&select=id,name,full_name,email,role,company_id,is_active`))[0];
        if (!other || other.is_active === false) return res.status(404).json({ ok: false, error: "Person not found" });
        const otherName = other.name || other.full_name || other.email;
        const privileged = (id, role, companyId) => id === hit.dba.coach_id || role === "super_admin" && companyId === hit.companyId;
        const otherInDba = hit.dba.members.some((m) => m.id === other.id) || privileged(other.id, other.role, other.company_id);
        if (!otherInDba) return res.status(403).json({ ok: false, error: "That person isn't part of this DBA" });
        const meIsPriv = privileged(me.id, me.role, me.company_id);
        const otherIsPriv = privileged(other.id, other.role, other.company_id);
        const [cfg, tierDefs] = await Promise.all([
          loadChatCfg(hit.companyId, hit.dba.id),
          effectiveTierDefs(hit.companyId, hit.dba)
        ]);
        if (!dmSideAllowed(cfg, tierDefs, me.id, meIsPriv)) {
          return res.status(403).json({ ok: false, error: "Direct messages aren't enabled for you yet" });
        }
        if (!dmStaffSide(cfg, me.id, meIsPriv) && !dmSideAllowed(cfg, tierDefs, other.id, otherIsPriv)) {
          return res.status(403).json({ ok: false, error: "Direct messages aren't enabled for this pair yet" });
        }
        const pairKey = [me.id, other.id].sort().join("_");
        const existing = (await rest2(
          `communities?company_id=eq.${hit.companyId}&context=eq.${encodeURIComponent(`dbadm:${hit.dba.id}`)}&name=eq.${encodeURIComponent(pairKey)}&is_active=eq.true&order=created_at.asc&limit=1`
        ))[0];
        let communityId = existing?.id;
        if (!communityId) {
          const ins = await fetch(`${SUPABASE_URL6}/rest/v1/communities`, {
            method: "POST",
            headers: { ...SVC_H3, Prefer: "return=representation" },
            body: JSON.stringify({
              company_id: hit.companyId,
              name: pairKey,
              context: `dbadm:${hit.dba.id}`,
              created_by: me.id,
              created_by_name: me.name || "User",
              is_active: true
            })
          });
          const created = ins.ok ? await ins.json().catch(() => []) : [];
          if (!created[0]?.id) return res.status(502).json({ ok: false, error: "Couldn't open the conversation \u2014 try again" });
          communityId = created[0].id;
          await ensureCommunityMembers(communityId, [
            { id: me.id, name: me.name || "User", role: me.role },
            { id: other.id, name: otherName, role: other.role }
          ], { id: me.id, name: me.name });
        }
        return res.json({ ok: true, id: communityId, other: { id: other.id, name: otherName } });
      });
    });
    router6.post("/dba/dm-enable", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, userId, enabled } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        if (enabled) cfg.dm_enabled[String(userId)] = true;
        else delete cfg.dm_enabled[String(userId)];
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_dm_gate_changed", hit.dba.id, { dba: hit.dba.name, user: String(userId), enabled: !!enabled });
        return res.json({ ok: true });
      });
    });
    router6.get("/dba/tier-defs", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const dbaId = String(req.query.dbaId || "");
      let companyId = null;
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
    router6.post("/dba/tier-defs", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      if (me.role !== "super_admin") return res.status(403).json({ ok: false, error: "Only an org admin can edit the tier ladder" });
      const tierCompanyId = await adminOrgScope({ company_id: me.company_id }, req);
      if (!tierCompanyId) return res.status(403).json({ ok: false, error: "Not authorized for that organization" });
      const raw = (req.body || {}).defs;
      if (!Array.isArray(raw) || !raw.length || raw.length > 6) return res.status(400).json({ ok: false, error: "Provide 1\u20136 tiers" });
      const defs = [];
      for (const t of raw) {
        const name = String(t?.name || "").trim().slice(0, 60);
        if (!name) return res.status(400).json({ ok: false, error: "Every tier needs a name" });
        defs.push({ id: String(t.id || randomUUID().slice(0, 8)), name, dm: !!t.dm, app: !!t.app });
      }
      if (new Set(defs.map((d) => d.id)).size !== defs.length) return res.status(400).json({ ok: false, error: "Duplicate tier ids" });
      if (!await saveTierDefs(tierCompanyId, defs)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
      void audit({ id: me.id, name: me.name }, "dba_tier_defs_changed", tierCompanyId, { defs });
      return res.json({ ok: true, defs });
    });
    router6.post("/dba/tier-defs-set", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, defs: raw } = req.body || {};
      if (!Array.isArray(raw) || !raw.length || raw.length > 3) return res.status(400).json({ ok: false, error: "Set between 1 and 3 tiers" });
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const defs = [];
        for (const t of raw) {
          const name = String(t?.name || "").trim().slice(0, 60);
          if (!name) return res.status(400).json({ ok: false, error: "Every tier needs a name" });
          defs.push({
            id: String(t?.id || "").trim() || randomUUID().slice(0, 8),
            name,
            desc: t?.desc ? String(t.desc).trim().slice(0, 300) : null,
            dm: !!t?.dm,
            app: !!t?.app
          });
        }
        if (new Set(defs.map((d) => d.id)).size !== defs.length) return res.status(400).json({ ok: false, error: "Duplicate tier ids" });
        const keep = new Set(defs.map((d) => d.id));
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        let cfgChanged = false;
        for (const [uid, tid] of Object.entries(cfg.tiers)) {
          if (!keep.has(tid)) {
            delete cfg.tiers[uid];
            cfgChanged = true;
          }
        }
        for (const [cid, arr] of Object.entries(hit.dba.learn_tiers)) {
          const filtered = arr.filter((t) => keep.has(t));
          if (filtered.length !== arr.length) hit.dba.learn_tiers[cid] = filtered;
          if (!hit.dba.learn_tiers[cid].length) delete hit.dba.learn_tiers[cid];
        }
        hit.dba.tier_defs = defs;
        if (cfgChanged && !await saveChatCfg(hit.companyId, hit.dba.id, cfg)) {
          return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        }
        if (!await saveDbaRow(hit.companyId, hit.dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_tiers_set", hit.dba.id, { dba: hit.dba.name, tiers: defs.map((d) => d.name) });
        return res.json({ ok: true, defs });
      });
    });
    router6.get("/dba/hq", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String(req.query.dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
      const defs = await effectiveTierDefs(hit.companyId, hit.dba);
      const chans = await rest2(
        `communities?company_id=eq.${hit.companyId}&context=eq.${encodeURIComponent(`dba:${hit.dba.id}`)}&is_active=eq.true&select=id,name&order=created_at.asc`
      );
      return res.json({
        ok: true,
        members: hit.dba.members.map((m) => ({ id: m.id, email: m.email, name: m.name, added_at: m.added_at, tier: m.id && cfg.tiers[m.id] || null, dm: !!(m.id && cfg.dm_enabled[m.id]) })),
        tier_defs: hit.dba.tier_defs,
        // the DBA's own ladder ([] = using org default)
        effective_defs: defs,
        // what's actually in force right now
        custom: hit.dba.tier_defs.length > 0,
        learn_tiers: hit.dba.learn_tiers,
        channels: chans.map((c) => ({ id: String(c.id), name: c.name })),
        leaders: cfg.leaders
        // { [communityId]: { [userId]: {del,pin,canvas} } }
      });
    });
    router6.post("/dba/learn-tiers", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, courseId, tierIds } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        if (!hit.dba.learn_course_ids.includes(String(courseId))) return res.status(404).json({ ok: false, error: "That course isn't assigned to this DBA" });
        const defs = await effectiveTierDefs(hit.companyId, hit.dba);
        const valid = new Set(defs.map((d) => d.id));
        const want = (Array.isArray(tierIds) ? tierIds : []).map(String).filter((t) => valid.has(t));
        if (want.length) hit.dba.learn_tiers[String(courseId)] = want;
        else delete hit.dba.learn_tiers[String(courseId)];
        if (!await saveDbaRow(hit.companyId, hit.dba)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_learn_tiers_set", hit.dba.id, { dba: hit.dba.name, course: String(courseId), tiers: want });
        return res.json({ ok: true, learn_tiers: hit.dba.learn_tiers });
      });
    });
    router6.post("/dba/tier-set", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, userId, tierId } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
        const defs = await effectiveTierDefs(hit.companyId, hit.dba);
        const tid = String(tierId || "");
        if (tid && !defs.some((d) => d.id === tid)) return res.status(400).json({ ok: false, error: "Unknown tier" });
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        if (tid) cfg.tiers[String(userId)] = tid;
        else delete cfg.tiers[String(userId)];
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_tier_assigned", hit.dba.id, { dba: hit.dba.name, user: String(userId), tier: tid || "(base)" });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/authority-set", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, userId, caps, patch, communityIds, all } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        let targets = [];
        if (patch && (all || Array.isArray(communityIds))) {
          const chans = await rest2(`communities?context=eq.${encodeURIComponent(`dba:${hit.dba.id}`)}&is_active=eq.true&select=id,name`);
          targets = all ? chans : chans.filter((c) => communityIds.map(String).includes(String(c.id)));
          if (!targets.length) return res.status(400).json({ ok: false, error: "No matching groups" });
        } else {
          const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
          if (!comm || comm.context !== `dba:${hit.dba.id}`) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
          targets = [comm];
        }
        const applied = {};
        for (const comm of targets) {
          const cur = (cfg.leaders[String(comm.id)] || {})[String(userId)] || {};
          const next = patch ? { del: patch.del !== void 0 ? !!patch.del : !!cur.del, pin: patch.pin !== void 0 ? !!patch.pin : !!cur.pin, canvas: patch.canvas !== void 0 ? !!patch.canvas : !!cur.canvas } : { del: !!caps?.del, pin: !!caps?.pin, canvas: !!caps?.canvas };
          const cid = String(comm.id);
          if (!next.del && !next.pin && !next.canvas) {
            if (cfg.leaders[cid]) {
              delete cfg.leaders[cid][String(userId)];
              if (!Object.keys(cfg.leaders[cid]).length) delete cfg.leaders[cid];
            }
          } else {
            cfg.leaders[cid] = { ...cfg.leaders[cid] || {}, [String(userId)]: next };
          }
          applied[cid] = next;
        }
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit({ id: me.id, name: me.name }, "dba_authority_changed", hit.dba.id, { dba: hit.dba.name, channels: targets.map((t) => t.name), user: String(userId), caps: applied });
        return res.json({ ok: true, leaders: cfg.leaders });
      });
    });
    router6.post("/dba/msg-delete", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, messageId } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
      if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
      const msg = (await rest2(`community_messages?id=eq.${encodeURIComponent(String(messageId || ""))}&community_id=eq.${comm.id}&select=id,sender_id,deleted_at`))[0];
      if (!msg) return res.status(404).json({ ok: false, error: "Message not found" });
      const { manage, caps } = await channelPower(me, hit, comm);
      if (!manage && msg.sender_id !== me.id && !caps.del) return res.status(403).json({ ok: false, error: "You can't delete this message" });
      const r = await fetch(`${SUPABASE_URL6}/rest/v1/community_messages?id=eq.${msg.id}`, {
        method: "PATCH",
        headers: { ...SVC_H3, Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: (/* @__PURE__ */ new Date()).toISOString(), deleted_by: me.id, deleted_by_name: me.name || "User" })
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Couldn't delete \u2014 try again" });
      void audit({ id: me.id, name: me.name }, "dba_message_deleted", hit.dba.id, { dba: hit.dba.name, channel: comm.name, message_id: String(msg.id), sender_id: msg.sender_id });
      return res.json({ ok: true });
    });
    router6.post("/dba/pin-all", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, communityId, messageId, unpin } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const comm = await findDbaChannel(hit.companyId, hit.dba.id, communityId);
      if (!comm) return res.status(404).json({ ok: false, error: "Channel not found in this DBA" });
      const { manage, caps } = await channelPower(me, hit, comm);
      if (!manage && !caps.pin) return res.status(403).json({ ok: false, error: "You can't pin for everyone here" });
      const msgId = String(messageId || "");
      const msg = (await rest2(`community_messages?id=eq.${encodeURIComponent(msgId)}&community_id=eq.${comm.id}&select=id`))[0];
      if (!msg) return res.status(404).json({ ok: false, error: "Message not found" });
      if (unpin) {
        await fetch(`${SUPABASE_URL6}/rest/v1/message_pins?message_id=eq.${msg.id}&conversation_id=eq.${comm.id}&context=eq.community`, {
          method: "DELETE",
          headers: SVC_H3
        }).catch(() => {
        });
        await audit(me, "dba_message_unpinned", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
        return res.json({ ok: true });
      }
      const [rows, existing] = await Promise.all([
        rest2(`community_members?community_id=eq.${comm.id}&select=user_id`),
        rest2(`message_pins?message_id=eq.${msg.id}&conversation_id=eq.${comm.id}&context=eq.community&select=user_id`)
      ]);
      const have = new Set(existing.map((r) => r.user_id));
      const inserts = rows.filter((r) => !have.has(r.user_id)).map((r) => ({
        message_id: msg.id,
        conversation_id: String(comm.id),
        context: "community",
        user_id: r.user_id,
        pinned_by: me.id,
        pinned_by_name: me.name || "User"
      }));
      if (inserts.length) {
        const r2 = await fetch(`${SUPABASE_URL6}/rest/v1/message_pins`, {
          method: "POST",
          headers: { ...SVC_H3, Prefer: "return=minimal" },
          body: JSON.stringify(inserts)
        });
        if (!r2.ok) return res.status(502).json({ ok: false, error: "Couldn't pin \u2014 try again" });
      }
      await audit(me, "dba_message_pinned", hit.dba.id, { dba: hit.dba.name, channel: comm.name });
      return res.json({ ok: true });
    });
    router6.post("/dba/promote", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, userId, coachId } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        const member = hit.dba.members.find((m) => m.id === String(userId));
        if (!member) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
        const [cfg, tierDefs] = await Promise.all([
          loadChatCfg(hit.companyId, hit.dba.id),
          effectiveTierDefs(hit.companyId, hit.dba)
        ]);
        const memberTier = tierDefs.find((t) => t.id === cfg.tiers[String(member.id)]) || tierDefs[0];
        if (!memberTier?.app) {
          return res.status(403).json({ ok: false, error: `Their tier (${memberTier?.name || "base"}) doesn't include full app access \u2014 move them to an app-access tier first` });
        }
        const coach = (await rest2(
          `user_profiles?id=eq.${encodeURIComponent(String(coachId || ""))}&company_id=eq.${hit.companyId}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,name,full_name,email`
        ))[0];
        if (!coach) return res.status(400).json({ ok: false, error: "Pick a coach from this organization" });
        const pr = await fetch(
          `${SUPABASE_URL6}/rest/v1/user_profiles?id=eq.${member.id}&company_id=eq.${hit.companyId}`,
          {
            method: "PATCH",
            headers: { ...SVC_H3, Prefer: "return=representation" },
            body: JSON.stringify({ coach_id: coach.id })
          }
        );
        const updated = pr.ok ? await pr.json().catch(() => []) : [];
        if (!Array.isArray(updated) || !updated.length) {
          return res.status(403).json({ ok: false, error: "They don't have a profile in your organization, so they can't be promoted here" });
        }
        try {
          const lookup = await fetch(`${SUPABASE_URL6}/auth/v1/admin/users?page=1&per_page=1&filter=${encodeURIComponent(member.email)}`, { headers: SVC_H3 });
          const found = lookup.ok ? await lookup.json().catch(() => null) : null;
          const authUser = found?.users?.find((u) => String(u.email || "").toLowerCase() === member.email.toLowerCase());
          if (authUser?.id) {
            await fetch(`${SUPABASE_URL6}/auth/v1/admin/users/${authUser.id}`, {
              method: "PUT",
              headers: SVC_H3,
              body: JSON.stringify({ user_metadata: { ...authUser.user_metadata || {}, intended_role: "client" } })
            });
          }
        } catch (e) {
          logger.warn({ err: e }, "[DBA] promote: auth metadata update failed (profile already updated)");
        }
        if (member.pure) {
          member.pure = false;
          await saveDbaRow(hit.companyId, hit.dba);
        }
        void audit({ id: me.id, name: me.name }, "dba_member_promoted", hit.dba.id, {
          dba: hit.dba.name,
          member: member.email,
          coach: coach.name || coach.full_name || coach.email
        });
        return res.json({ ok: true, coach: { id: coach.id, name: coach.name || coach.full_name || coach.email } });
      });
    });
    router6.post("/dba/upload", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, filename, contentType, dataBase64 } = req.body || {};
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
    router6.post("/dba/transcribe", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, dataBase64, contentType } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      if (!await voiceMemosEnabled(hit.companyId)) {
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
    HUDDLE_TTL_MS = 4 * 3600 * 1e3;
    router6.get("/dba/daily-status", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String(req.query.id || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { key, source, mode } = await dailyKeyForDbaScope(hit.companyId, hit.dba.id);
      return res.json({ ok: true, connected: Boolean(key), source, mode });
    });
    router6.post("/dba/daily-mode", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, useOrg } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const modeKey = `dba_daily_mode:${hit.dba.id}`;
      if (useOrg) {
        const r = await fetch(
          `${SUPABASE_URL6}/rest/v1/admin_settings?company_id=eq.${hit.companyId}&key=eq.${encodeURIComponent(modeKey)}`,
          { method: "DELETE", headers: SVC_H3 }
        );
        if (!r.ok) return res.status(502).json({ ok: false, error: "Could not save" });
      } else {
        const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
          method: "POST",
          headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ company_id: hit.companyId, key: modeKey, value: "own" })
        });
        if (!r.ok) return res.status(502).json({ ok: false, error: "Could not save" });
      }
      void audit(me, useOrg ? "dba_daily_use_org" : "dba_daily_own_only", hit.dba.id, { dba: hit.dba.name });
      return res.json({ ok: true, mode: useOrg ? "org" : "own" });
    });
    router6.post("/dba/daily-key", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, key } = req.body || {};
      const hit = await findDbaAnywhere(String(dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const k = String(key || "").trim();
      if (!k) return res.status(400).json({ ok: false, error: "Paste the Daily.co API key" });
      if (!await validDailyKey(k)) {
        return res.status(400).json({ ok: false, error: "That key didn't work \u2014 copy it again from dashboard.daily.co \u2192 Developers" });
      }
      const r = await fetch(`${SUPABASE_URL6}/rest/v1/admin_settings?on_conflict=company_id,key`, {
        method: "POST",
        headers: { ...SVC_H3, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ company_id: hit.companyId, key: `dba_daily_key:${hit.dba.id}`, value: k })
      });
      if (!r.ok) return res.status(502).json({ ok: false, error: "Could not save the key" });
      void audit(me, "dba_daily_connected", hit.dba.id, { dba: hit.dba.name });
      return res.json({ ok: true });
    });
    router6.post("/dba/daily-key-remove", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String((req.body || {}).dbaId || ""));
      if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const r = await fetch(
        `${SUPABASE_URL6}/rest/v1/admin_settings?company_id=eq.${hit.companyId}&key=eq.${encodeURIComponent(`dba_daily_key:${hit.dba.id}`)}`,
        { method: "DELETE", headers: SVC_H3 }
      );
      if (!r.ok) return res.status(502).json({ ok: false, error: "Could not disconnect" });
      void audit(me, "dba_daily_disconnected", hit.dba.id, { dba: hit.dba.name });
      return res.json({ ok: true });
    });
    router6.get("/dba/huddles", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String(req.query.id || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const [cfg, rawList] = await Promise.all([
        loadChatCfg(hit.companyId, hit.dba.id),
        loadHuddles(hit.companyId, hit.dba.id)
      ]);
      const { list, changed } = pruneStale(rawList);
      if (changed) {
        void withLock(`dba-huddles:${hit.dba.id}`, async () => {
          const fresh = pruneStale(await loadHuddles(hit.companyId, hit.dba.id));
          if (fresh.changed) await saveHuddles(hit.companyId, hit.dba.id, fresh.list);
        }).catch(() => {
        });
      }
      const leaders = dbaLeaderIds(cfg);
      const canStart = acc.manage || leaders.has(me.id);
      const visible = list.filter((h) => h.is_active && huddleVisible(h, me.id, acc.manage, leaders));
      let roster = [];
      if (canStart) {
        const r = await chatRoster(hit.companyId, hit.dba);
        roster = r.members.filter((m) => m.id !== me.id).map((m) => ({ id: m.id, name: m.name, leader: leaders.has(m.id) }));
      }
      return res.json({
        ok: true,
        can_start: canStart,
        huddles: visible.map((h) => ({ ...h, can_end: acc.manage || h.created_by === me.id })),
        roster
      });
    });
    router6.post("/dba/huddle-start", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, title, audience, memberIds } = req.body || {};
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
      let ids = [];
      if (aud === "pick") {
        const memberSet = new Set(hit.dba.members.map((m) => String(m.id)).filter(Boolean));
        ids = Array.isArray(memberIds) ? memberIds.map(String).filter((id) => memberSet.has(id)) : [];
        if (!ids.length) return res.status(400).json({ ok: false, error: "Pick at least one member to invite" });
      }
      const { key: DAILY_KEY } = await dailyKeyForDbaScope(hit.companyId, hit.dba.id);
      if (!DAILY_KEY) {
        return res.status(400).json({ ok: false, error: "Video calls aren't connected here yet \u2014 connect a Daily.co key for this DBA (or the organization) in the admin panel." });
      }
      const roomName = `dba-${String(hit.dba.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${Date.now()}`;
      const r = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: { Authorization: `Bearer ${DAILY_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomName,
          privacy: "public",
          properties: { exp: Math.floor(Date.now() / 1e3) + 4 * 3600, enable_chat: true, enable_screenshare: true }
        })
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.url) return res.status(502).json({ ok: false, error: "Could not create the call room" });
      const huddle = {
        id: randomUUID(),
        title: String(title || "").trim().slice(0, 80) || "Huddle",
        room_url: String(data.url),
        room_name: String(data.name || roomName),
        created_by: me.id,
        created_by_name: me.name || me.email,
        audience: aud,
        member_ids: ids,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        is_active: true
      };
      const ok = await withLock(`dba-huddles:${hit.dba.id}`, async () => {
        const list = pruneStale(await loadHuddles(hit.companyId, hit.dba.id)).list;
        list.push(huddle);
        return saveHuddles(hit.companyId, hit.dba.id, list);
      });
      if (!ok) {
        void fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(huddle.room_name)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${DAILY_KEY}` }
        }).catch(() => {
        });
        return res.status(502).json({ ok: false, error: "Couldn't save the huddle \u2014 try again" });
      }
      void audit(me, "dba_huddle_started", hit.dba.id, { dba: hit.dba.name, title: huddle.title, audience: aud, invited: ids.length });
      return res.json({ ok: true, huddle: { ...huddle, can_end: true } });
    });
    router6.post("/dba/huddle-end", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, huddleId } = req.body || {};
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
        h.ended_at = (/* @__PURE__ */ new Date()).toISOString();
        h.ended_by_name = me.name || me.email;
        if (!await saveHuddles(hit.companyId, hit.dba.id, list)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(me, "dba_huddle_ended", hit.dba.id, { dba: hit.dba.name, title: h.title });
        return res.json({ ok: true });
      });
    });
    MAX_EVENTS = 500;
    httpUrl = (v) => {
      const s = String(v || "").trim();
      if (!s) return "";
      if (s.length > 500) return null;
      try {
        const u = new URL(s);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        return u.toString();
      } catch {
        return null;
      }
    };
    isoOrNull = (v) => {
      const s = String(v || "").trim();
      if (!s) return null;
      const t = Date.parse(s);
      return Number.isFinite(t) ? new Date(t).toISOString() : null;
    };
    router6.get("/dba/calendar", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const hit = await findDbaAnywhere(String(req.query.id || ""));
      if (!hit || !hit.dba.is_active) return res.status(404).json({ ok: false, error: "DBA not found" });
      const acc = dbaAccess(me, hit.companyId, hit.dba);
      if (!acc.member && !acc.manage) return res.status(403).json({ ok: false, error: "Not authorized" });
      const [events, cfg] = await Promise.all([
        loadEvents(hit.companyId, hit.dba.id),
        loadChatCfg(hit.companyId, hit.dba.id)
      ]);
      const canManage = canManageCalendar(me.id, acc.manage, cfg, hit.dba);
      const allowedBookers = /* @__PURE__ */ new Set();
      if (hit.dba.coach_id) allowedBookers.add(hit.dba.coach_id);
      for (const [uid, on] of Object.entries(cfg.cal)) {
        if (on === true && hit.dba.members.some((m) => m.id === uid)) allowedBookers.add(uid);
      }
      const bookerIds = [...allowedBookers].filter((uid) => cfg.booking[uid]);
      const profiles2 = bookerIds.length ? await rest2(`user_profiles?id=in.(${bookerIds.join(",")})&select=id,name,full_name,email`) : [];
      const nameOf = (uid) => {
        const p = profiles2.find((x) => x.id === uid);
        if (p) return p.name || p.full_name || p.email;
        return uid === hit.dba.coach_id ? hit.dba.coach_name || "Coach" : "Team member";
      };
      const bookings = bookerIds.map((uid) => ({
        id: uid,
        name: nameOf(uid),
        url: cfg.booking[uid],
        is_coach: uid === hit.dba.coach_id
      }));
      const canSetBooking = acc.manage || me.id === hit.dba.coach_id || canManage;
      const body = {
        ok: true,
        can_manage: canManage,
        can_set_booking: canSetBooking,
        my_booking: cfg.booking[me.id] || "",
        events: events.slice().sort((a, b) => a.start.localeCompare(b.start)).map((e) => ({ ...e, can_edit: canManage }))
      };
      body.bookings = bookings;
      if (acc.manage) {
        const roster = await chatRoster(hit.companyId, hit.dba);
        body.roster = roster.members.filter((m) => m.id !== hit.dba.coach_id).map((m) => ({ id: m.id, name: m.name, allowed: cfg.cal[m.id] === true }));
      }
      return res.json(body);
    });
    router6.post("/dba/event-save", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, event } = req.body || {};
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
      const description = String(event?.description || "").trim().slice(0, 2e3);
      return withLock(`dba-events:${hit.dba.id}`, async () => {
        const list = await loadEvents(hit.companyId, hit.dba.id);
        const existing = event?.id ? list.find((e) => e.id === String(event.id)) : null;
        if (event?.id && !existing) return res.status(404).json({ ok: false, error: "That event no longer exists" });
        if (existing) {
          existing.title = title;
          existing.start = start;
          existing.end = end;
          existing.description = description;
          existing.link = link;
          existing.updated_at = (/* @__PURE__ */ new Date()).toISOString();
        } else {
          if (list.length >= MAX_EVENTS) return res.status(400).json({ ok: false, error: "This calendar is full \u2014 delete some old events first" });
          list.push({
            id: randomUUID(),
            title,
            start,
            end,
            description,
            link,
            created_by: me.id,
            created_by_name: me.name || me.email,
            created_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        if (!await saveEvents(hit.companyId, hit.dba.id, list)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(me, existing ? "dba_event_updated" : "dba_event_created", hit.dba.id, { dba: hit.dba.name, title, start });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/event-delete", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, eventId } = req.body || {};
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
        if (!await saveEvents(hit.companyId, hit.dba.id, list)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(me, "dba_event_deleted", hit.dba.id, { dba: hit.dba.name, title: gone.title });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/cal-authority-set", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, userId, allowed } = req.body || {};
      return withLock("dba-write", async () => {
        const hit = await findDbaAnywhere(String(dbaId || ""));
        if (!hit) return res.status(404).json({ ok: false, error: "DBA not found" });
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) return res.status(403).json({ ok: false, error: "Not authorized" });
        if (!hit.dba.members.some((m) => m.id === String(userId))) return res.status(404).json({ ok: false, error: "That person isn't a member of this DBA" });
        const cfg = await loadChatCfg(hit.companyId, hit.dba.id);
        if (allowed) cfg.cal[String(userId)] = true;
        else {
          delete cfg.cal[String(userId)];
          delete cfg.booking[String(userId)];
        }
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(me, "dba_calendar_authority_changed", hit.dba.id, { dba: hit.dba.name, user: String(userId), allowed: !!allowed });
        return res.json({ ok: true });
      });
    });
    router6.post("/dba/booking-set", async (req, res) => {
      const me = await requireUserJwt(req);
      if (!me) return res.status(403).json({ ok: false, error: "Not authorized" });
      const { dbaId, url } = req.body || {};
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
        if (!await saveChatCfg(hit.companyId, hit.dba.id, cfg)) return res.status(502).json({ ok: false, error: "Couldn't save \u2014 try again" });
        void audit(me, "dba_booking_link_set", hit.dba.id, { dba: hit.dba.name, cleared: !clean });
        return res.json({ ok: true });
      });
    });
    dba_default = router6;
  }
});

// src/routes/push.ts
import { Router as Router7 } from "express";
import crypto2 from "node:crypto";
import webpush from "web-push";
async function dbGet2(path) {
  const r = await fetch(`${SUPABASE_URL7}/rest/v1/${path}`, { headers: SH3 });
  if (!r.ok) return [];
  return r.json().catch(() => []);
}
async function dbUpsertSetting(companyId, key, value) {
  const r = await fetch(`${SUPABASE_URL7}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH3, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ company_id: companyId, key, value, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
  });
  return r.ok;
}
function enc(plain) {
  const iv = crypto2.randomBytes(12);
  const c = crypto2.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}
function dec(stored) {
  try {
    if (!stored?.startsWith("enc1:")) return "";
    const [, iv, tag, ct] = stored.split(":");
    const d = crypto2.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}
async function getVapid() {
  if (VAPID) return VAPID;
  const rows = await dbGet2(`admin_settings?company_id=eq.${EDEN_ORG_ID4}&key=eq.web_push_vapid&select=value`);
  if (rows[0]) {
    try {
      const v2 = JSON.parse(rows[0].value);
      const privateKey = dec(v2.private_enc);
      if (v2.publicKey && privateKey) {
        VAPID = { publicKey: v2.publicKey, privateKey };
      }
    } catch {
    }
  }
  let v = VAPID;
  if (!v) {
    const keys = webpush.generateVAPIDKeys();
    const ok = await dbUpsertSetting(
      EDEN_ORG_ID4,
      "web_push_vapid",
      JSON.stringify({ publicKey: keys.publicKey, private_enc: enc(keys.privateKey) })
    );
    if (!ok) {
      logger.error("[Push] could not persist VAPID keys");
      return null;
    }
    v = VAPID = keys;
    logger.info("[Push] generated new VAPID key pair");
  }
  webpush.setVapidDetails("mailto:support@edencommunications.io", v.publicKey, v.privateKey);
  return v;
}
async function requireUser(req) {
  const auth2 = String(req.get("authorization") || "");
  const token = auth2.startsWith("Bearer ") ? auth2.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON5) return null;
  const r = await fetch(`${SUPABASE_URL7}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON5, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await dbGet2(`user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`);
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID4 };
}
function isTrustedPushEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false;
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return h === "fcm.googleapis.com" || // Chrome/Android
  h === "updates.push.services.mozilla.com" || // Firefox
  h.endsWith(".push.services.mozilla.com") || h === "web.push.apple.com" || h.endsWith(".push.apple.com") || // Safari/iOS
  h.endsWith(".notify.windows.com");
}
async function getUserPush(userId) {
  const rows = await dbGet2(`admin_settings?key=eq.push_sub:${encodeURIComponent(userId)}&select=company_id,value`);
  if (!rows[0]) return null;
  try {
    return { cfg: JSON.parse(rows[0].value), companyId: rows[0].company_id };
  } catch {
    return null;
  }
}
async function saveUserPush(companyId, userId, cfg) {
  return dbUpsertSetting(companyId, `push_sub:${userId}`, JSON.stringify(cfg));
}
var SUPABASE_URL7, SUPABASE_ANON5, SERVICE_KEY7, EDEN_ORG_ID4, SH3, ENC_KEY, VAPID, PUSH_CATEGORIES, CATEGORY_IDS, INSTANCE, router7;
var init_push = __esm({
  "src/routes/push.ts"() {
    "use strict";
    init_logger();
    SUPABASE_URL7 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SUPABASE_ANON5 = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
    SERVICE_KEY7 = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    EDEN_ORG_ID4 = "b0000000-0000-0000-0000-000000000001";
    SH3 = {
      apikey: SERVICE_KEY7,
      Authorization: `Bearer ${SERVICE_KEY7}`,
      "Content-Type": "application/json"
    };
    ENC_KEY = crypto2.createHash("sha256").update(`web-push-vapid:${process.env.SESSION_SECRET || ""}`).digest();
    VAPID = null;
    PUSH_CATEGORIES = [
      { id: "messages", label: "Messages" },
      { id: "plan_updates", label: "Plan updates" },
      { id: "checkins", label: "Check-ins" },
      { id: "reminders", label: "Reminders" },
      { id: "ads_recaps", label: "Ads recaps" }
    ];
    CATEGORY_IDS = new Set(PUSH_CATEGORIES.map((c) => c.id));
    INSTANCE = crypto2.randomBytes(8).toString("hex");
    router7 = Router7();
    router7.get("/push/public-key", async (req, res) => {
      try {
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const v = await getVapid();
        if (!v) {
          res.status(500).json({ error: "Push is not available right now" });
          return;
        }
        res.json({ ok: true, publicKey: v.publicKey });
      } catch {
        res.status(500).json({ error: "Push is not available right now" });
      }
    });
    router7.get("/push/prefs", async (req, res) => {
      try {
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const found = await getUserPush(caller.id);
        const cats = {};
        for (const c of PUSH_CATEGORIES) cats[c.id] = found?.cfg.cats?.[c.id] !== false;
        res.json({
          ok: true,
          enabled: !!found?.cfg.enabled,
          devices: found?.cfg.subs?.length || 0,
          cats,
          categories: PUSH_CATEGORIES
        });
      } catch {
        res.status(500).json({ error: "Could not load settings" });
      }
    });
    router7.post("/push/subscribe", async (req, res) => {
      try {
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const sub = req.body?.subscription;
        if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
          res.status(400).json({ error: "Bad subscription" });
          return;
        }
        if (!isTrustedPushEndpoint(sub.endpoint) || String(sub.keys.p256dh).length > 256 || String(sub.keys.auth).length > 128) {
          res.status(400).json({ error: "Unrecognized push service" });
          return;
        }
        const found = await getUserPush(caller.id);
        const cfg = found?.cfg || { enabled: true, subs: [] };
        cfg.enabled = true;
        cfg.subs = (cfg.subs || []).filter((s) => s.endpoint !== sub.endpoint);
        cfg.subs.push({ endpoint: sub.endpoint, keys: sub.keys, ua: String(req.get("user-agent") || "").slice(0, 120), added: (/* @__PURE__ */ new Date()).toISOString() });
        if (cfg.subs.length > 10) cfg.subs = cfg.subs.slice(-10);
        if (!await saveUserPush(caller.company_id, caller.id, cfg)) {
          res.status(502).json({ error: "Could not save" });
          return;
        }
        const cats = {};
        for (const c of PUSH_CATEGORIES) cats[c.id] = cfg.cats?.[c.id] !== false;
        res.json({ ok: true, devices: cfg.subs.length, cats, categories: PUSH_CATEGORIES });
      } catch {
        res.status(500).json({ error: "Could not subscribe" });
      }
    });
    router7.post("/push/prefs", async (req, res) => {
      try {
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const found = await getUserPush(caller.id);
        const cfg = found?.cfg || { enabled: false, subs: [] };
        if (typeof req.body?.enabled === "boolean") cfg.enabled = req.body.enabled;
        if (req.body?.cats && typeof req.body.cats === "object") {
          const cats2 = { ...cfg.cats || {} };
          for (const [k, v] of Object.entries(req.body.cats)) {
            if (CATEGORY_IDS.has(k) && typeof v === "boolean") cats2[k] = v;
          }
          cfg.cats = cats2;
        }
        if (!await saveUserPush(caller.company_id, caller.id, cfg)) {
          res.status(502).json({ error: "Could not save" });
          return;
        }
        const cats = {};
        for (const c of PUSH_CATEGORIES) cats[c.id] = cfg.cats?.[c.id] !== false;
        res.json({ ok: true, enabled: !!cfg.enabled, devices: cfg.subs?.length || 0, cats });
      } catch {
        res.status(500).json({ error: "Could not save" });
      }
    });
    router7.post("/push/unsubscribe", async (req, res) => {
      try {
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const endpoint = String(req.body?.endpoint || "");
        const found = await getUserPush(caller.id);
        if (!found) {
          res.json({ ok: true, devices: 0 });
          return;
        }
        const cfg = found.cfg;
        cfg.subs = (cfg.subs || []).filter((s) => endpoint && s.endpoint !== endpoint);
        await saveUserPush(found.companyId, caller.id, cfg);
        res.json({ ok: true, devices: cfg.subs.length });
      } catch {
        res.status(500).json({ error: "Could not unsubscribe" });
      }
    });
  }
});

// src/routes/communityPost.ts
var communityPost_exports = {};
__export(communityPost_exports, {
  communityPostDbaSecretFor: () => communityPostDbaSecretFor,
  communityPostSecretFor: () => communityPostSecretFor,
  default: () => communityPost_default,
  mentionedUserIds: () => mentionedUserIds,
  mutedUserIds: () => mutedUserIds,
  notifyCommunityMembers: () => notifyCommunityMembers
});
import { Router as Router8 } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
async function dbGet3(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL8}/rest/v1/${pathAndQuery}`, { headers: H });
  if (!r.ok) return [];
  return r.json();
}
async function dbInsert(table, body) {
  const r = await fetch(`${SUPABASE_URL8}/rest/v1/${table}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return r.ok;
}
function communityPostSecretFor(companyId) {
  if (!SECRET_KEY) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", SECRET_KEY).update(`community-post:${companyId}`).digest("hex").slice(0, 32);
}
function communityPostDbaSecretFor(dbaId) {
  if (!SECRET_KEY) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", SECRET_KEY).update(`community-post-dba:${dbaId}`).digest("hex").slice(0, 32);
}
function rateLimited2(companyId) {
  const now = Date.now();
  const arr = (postTimes.get(companyId) || []).filter((t) => now - t < 36e5);
  if (arr.length >= 30) {
    postTimes.set(companyId, arr);
    return true;
  }
  arr.push(now);
  postTimes.set(companyId, arr);
  return false;
}
function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
function appBase(req) {
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return `https://${host || "edencommunications.io"}`;
}
async function mutedUserIds(communityId) {
  try {
    const prefix = `community_mute:${communityId}:`;
    const rows = await dbGet3(`admin_settings?key=like.${encodeURIComponent(prefix)}*&select=key,value&limit=500`);
    const out = /* @__PURE__ */ new Set();
    for (const r of rows) {
      if (String(r.value) !== "1") continue;
      const uid = String(r.key || "").slice(prefix.length);
      if (uid) out.add(uid);
    }
    return out;
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
async function notifyCommunityMembers(communityId, communityName, senderId) {
  try {
    const [members, muted] = await Promise.all([
      dbGet3(`community_members?community_id=eq.${encodeURIComponent(communityId)}&select=user_id&limit=200`),
      mutedUserIds(communityId)
    ]);
    const rows = members.map((m) => m.user_id).filter((id) => id && id !== senderId && !muted.has(id)).map((id) => ({
      recipient_id: id,
      sender_id: senderId,
      type: "community_post",
      body: `\u{1F4AC} New post in #${communityName} \u2014 check your communities`,
      is_read: false
    }));
    if (rows.length) await dbInsert("notifications", rows);
  } catch (e) {
    logger.warn({ err: String(e) }, "[CommunityPost] member notify failed");
  }
}
async function claimThrottledRecipients(companyId, communityId, candidates) {
  const key = NOTIFY_KEY(communityId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const rows = await dbGet3(`admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&select=value`);
    const rawStored = rows[0] ? String(rows[0].value) : null;
    let stamps = {};
    try {
      stamps = rawStored ? JSON.parse(rawStored) : {};
    } catch {
      stamps = {};
    }
    for (const [k, t] of Object.entries(stamps)) if (typeof t !== "number" || now - t >= NOTIFY_THROTTLE_MS) delete stamps[k];
    const eligible = candidates.filter((id) => !(id in stamps));
    if (!eligible.length) return [];
    for (const id of eligible) stamps[id] = now;
    const newValue = JSON.stringify(stamps);
    if (rawStored === null) {
      const r = await fetch(`${SUPABASE_URL8}/rest/v1/admin_settings`, {
        method: "POST",
        headers: H,
        body: JSON.stringify({ company_id: companyId, key, value: newValue, updated_at: (/* @__PURE__ */ new Date()).toISOString() })
      });
      if (r.ok) return eligible;
    } else {
      const r = await fetch(
        `${SUPABASE_URL8}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&value=eq.${encodeURIComponent(rawStored)}`,
        { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ value: newValue, updated_at: (/* @__PURE__ */ new Date()).toISOString() }) }
      );
      const updated = r.ok ? await r.json().catch(() => []) : [];
      if (Array.isArray(updated) && updated.length) return eligible;
    }
  }
  return [];
}
function mentionedUserIds(text, members) {
  const hits = [];
  for (const m of members) {
    if (!m.user_id || !m.user_name) continue;
    const first = String(m.user_name).split(" ")[0];
    const re = new RegExp(`@(${escRe(m.user_name)}|${escRe(first)})(\\b|$)`, "i");
    if (re.test(text)) hits.push(m.user_id);
  }
  return hits;
}
async function communityForMute(req, res) {
  const communityId = String(req.params.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(communityId)) {
    res.status(400).json({ error: "Bad community id" });
    return null;
  }
  const caller = await requireUser(req);
  if (!caller) {
    res.status(401).json({ error: "Not authorized" });
    return null;
  }
  const comm = (await dbGet3(`communities?id=eq.${encodeURIComponent(communityId)}&select=id,name,company_id&limit=1`))[0];
  if (!comm) {
    res.status(404).json({ error: "Community not found" });
    return null;
  }
  const commOrg = comm.company_id || EDEN_ORG_ID5;
  const isEdenStaff = caller.role !== "client" && caller.company_id === EDEN_ORG_ID5;
  if (caller.company_id !== commOrg && !isEdenStaff) {
    res.status(403).json({ error: "Not authorized" });
    return null;
  }
  const membership = await dbGet3(
    `community_members?community_id=eq.${encodeURIComponent(communityId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=user_id&limit=1`
  );
  const isOrgStaff = caller.role !== "client";
  if (!membership.length && !isOrgStaff) {
    res.status(403).json({ error: "You're not a member of this community" });
    return null;
  }
  return { caller, comm };
}
var EDEN_ORG_ID5, SUPABASE_URL8, SB_KEY, H, SECRET_KEY, postTimes, MUTE_KEY, NOTIFY_THROTTLE_MS, NOTIFY_KEY, escRe, router8, communityPost_default;
var init_communityPost = __esm({
  "src/routes/communityPost.ts"() {
    "use strict";
    init_logger();
    init_checkinForm();
    init_dba();
    init_push();
    EDEN_ORG_ID5 = "b0000000-0000-0000-0000-000000000001";
    SUPABASE_URL8 = "https://jzdoojlwgpqlmworwcsr.supabase.co";
    SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    H = {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    SECRET_KEY = process.env.SESSION_SECRET || "";
    postTimes = /* @__PURE__ */ new Map();
    MUTE_KEY = (cid, uid) => `community_mute:${cid}:${uid}`;
    NOTIFY_THROTTLE_MS = 10 * 6e4;
    NOTIFY_KEY = (cid) => `community_notify:${cid}`;
    escRe = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    router8 = Router8();
    router8.get("/communities/:id/mute", async (req, res) => {
      try {
        const ok = await communityForMute(req, res);
        if (!ok) return;
        const key = MUTE_KEY(ok.comm.id, ok.caller.id);
        const rows = await dbGet3(`admin_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
        res.json({ muted: String(rows[0]?.value ?? "") === "1" });
      } catch {
        res.status(500).json({ error: "Could not load mute state" });
      }
    });
    router8.post("/communities/:id/mute", async (req, res) => {
      try {
        const ok = await communityForMute(req, res);
        if (!ok) return;
        const muted = req.body?.muted === true || req.body?.muted === "true";
        const key = MUTE_KEY(ok.comm.id, ok.caller.id);
        const companyId = ok.comm.company_id || EDEN_ORG_ID5;
        const r = await fetch(`${SUPABASE_URL8}/rest/v1/admin_settings?on_conflict=company_id,key`, {
          method: "POST",
          headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({ company_id: companyId, key, value: muted ? "1" : "0", updated_at: (/* @__PURE__ */ new Date()).toISOString() })
        });
        if (!r.ok) {
          res.status(502).json({ error: "Could not save mute state" });
          return;
        }
        res.json({ ok: true, muted });
      } catch {
        res.status(500).json({ error: "Could not save mute state" });
      }
    });
    router8.post("/webhooks/community-post/:companyId", async (req, res) => {
      try {
        const companyId = String(req.params.companyId || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(companyId)) {
          res.status(400).json({ error: "Bad company id" });
          return;
        }
        const given = String(req.get("x-webhook-secret") || "").trim();
        if (!SECRET_KEY) {
          res.status(503).json({ error: "Webhook not available \u2014 server secret missing" });
          return;
        }
        if (!given || !safeEqual(given, communityPostSecretFor(companyId))) {
          res.status(401).json({ error: "Wrong or missing x-webhook-secret header" });
          return;
        }
        if (rateLimited2(companyId)) {
          res.status(429).json({ error: "Too many posts \u2014 try again later (30 per hour max)" });
          return;
        }
        const b = req.body || {};
        const message = String(b.message ?? b.text ?? b.content ?? "").trim();
        if (!message) {
          res.status(400).json({ error: "Send the text as `message`" });
          return;
        }
        if (message.length > 8e3) {
          res.status(400).json({ error: "Message is too long (8000 characters max)" });
          return;
        }
        const communityId = String(b.community_id || "").trim();
        const communityName = String(b.community || b.community_name || "").trim();
        let comm = null;
        if (communityId) {
          comm = (await dbGet3(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${companyId}&is_active=eq.true&select=id,name`))[0];
        } else if (communityName) {
          comm = (await dbGet3(`communities?name=ilike.${encodeURIComponent(communityName)}&company_id=eq.${companyId}&is_active=eq.true&select=id,name&limit=1`))[0];
        }
        if (!comm) {
          res.status(404).json({ error: "Community not found \u2014 send `community_id` or the exact `community` name" });
          return;
        }
        const senderName = String(b.sender_name || "").trim().slice(0, 60) || "\u{1F4EC} Team Update";
        const ok = await dbInsert("community_messages", {
          community_id: comm.id,
          sender_id: null,
          sender_name: senderName,
          sender_role: "super_admin",
          content: message,
          parent_id: null
        });
        if (!ok) {
          res.status(502).json({ error: "Could not post the message" });
          return;
        }
        await notifyCommunityMembers(comm.id, comm.name, null);
        logger.info({ companyId, community: comm.name }, "[CommunityPost] webhook posted");
        res.json({ ok: true, community: comm.name });
      } catch (e) {
        logger.warn({ err: String(e) }, "[CommunityPost] webhook failed");
        res.status(500).json({ error: "Something went wrong" });
      }
    });
    router8.post("/communities/:id/notify-post", async (req, res) => {
      try {
        const communityId = String(req.params.id || "").trim();
        const messageId = String(req.body?.message_id || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(communityId)) {
          res.status(400).json({ error: "Bad community id" });
          return;
        }
        if (!messageId || messageId.length > 64 || !/^[0-9a-zA-Z-]+$/.test(messageId)) {
          res.status(400).json({ error: "Send the new message's id as `message_id`" });
          return;
        }
        const caller = await requireUser(req);
        if (!caller) {
          res.status(401).json({ error: "Not authorized" });
          return;
        }
        const comm = (await dbGet3(
          `communities?id=eq.${encodeURIComponent(communityId)}&is_active=eq.true&select=id,name,company_id&limit=1`
        ))[0];
        if (!comm) {
          res.status(404).json({ error: "Community not found" });
          return;
        }
        const commOrg = comm.company_id || EDEN_ORG_ID5;
        const isEdenStaff = caller.role !== "client" && caller.company_id === EDEN_ORG_ID5;
        const isOrgStaff = caller.role !== "client" && (caller.company_id === commOrg || isEdenStaff);
        if (caller.company_id !== commOrg && !isEdenStaff) {
          res.status(403).json({ error: "Not authorized" });
          return;
        }
        if (!isOrgStaff) {
          const membership = await dbGet3(
            `community_members?community_id=eq.${encodeURIComponent(communityId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=user_id&limit=1`
          );
          if (!membership.length) {
            res.status(403).json({ error: "Not authorized" });
            return;
          }
        }
        const msg = (await dbGet3(
          `community_messages?id=eq.${encodeURIComponent(messageId)}&community_id=eq.${encodeURIComponent(communityId)}&select=id,sender_id,sender_name,content,created_at,deleted_at&limit=1`
        ))[0];
        if (!msg || msg.sender_id !== caller.id) {
          res.status(403).json({ error: "That message isn't yours or isn't in this community" });
          return;
        }
        if (msg.deleted_at) {
          res.status(409).json({ error: "That message was deleted" });
          return;
        }
        const ageMs = Date.now() - new Date(msg.created_at || 0).getTime();
        if (!(ageMs >= -6e4 && ageMs <= 12e4)) {
          res.status(409).json({ error: "Only brand-new messages can notify" });
          return;
        }
        const members = await dbGet3(`community_members?community_id=eq.${encodeURIComponent(communityId)}&select=user_id,user_name&limit=200`);
        const mentioned = new Set(mentionedUserIds(String(msg.content || ""), members));
        const muted = await mutedUserIds(communityId);
        const senderName = String(msg.sender_name || "").trim().slice(0, 60);
        const content = String(msg.content || "");
        const mentionRows = [...mentioned].filter((id) => id !== caller.id && !muted.has(id)).map((id) => ({
          recipient_id: id,
          sender_id: caller.id,
          type: "mention",
          body: `\u{1F4AC} ${senderName || "Someone"} tagged you in "${comm.name}": "${content.slice(0, 80)}"`,
          is_read: false
        }));
        if (mentionRows.length) await dbInsert("notifications", mentionRows);
        const candidates = members.map((m) => m.user_id).filter((id) => id && id !== caller.id && !mentioned.has(id) && !muted.has(id));
        const recipients = await claimThrottledRecipients(commOrg, comm.id, candidates);
        const rows = recipients.map((id) => ({
          recipient_id: id,
          sender_id: caller.id,
          type: "community_post",
          body: senderName ? `\u{1F4AC} ${senderName} posted in #${comm.name}` : `\u{1F4AC} New post in #${comm.name} \u2014 check your communities`,
          is_read: false
        }));
        if (rows.length && !await dbInsert("notifications", rows)) {
          res.status(502).json({ error: "Could not create notifications" });
          return;
        }
        res.json({ ok: true, notified: rows.length, mentioned: mentionRows.length });
      } catch (e) {
        logger.warn({ err: String(e) }, "[CommunityPost] notify-post failed");
        res.status(500).json({ error: "Something went wrong" });
      }
    });
    router8.post("/webhooks/community-post-dba/:dbaId", async (req, res) => {
      try {
        const dbaId = String(req.params.dbaId || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(dbaId)) {
          res.status(400).json({ error: "Bad DBA id" });
          return;
        }
        const given = String(req.get("x-webhook-secret") || "").trim();
        if (!SECRET_KEY) {
          res.status(503).json({ error: "Webhook not available \u2014 server secret missing" });
          return;
        }
        if (!given || !safeEqual(given, communityPostDbaSecretFor(dbaId))) {
          res.status(401).json({ error: "Wrong or missing x-webhook-secret header" });
          return;
        }
        const hit = await findDbaAnywhere(dbaId);
        if (!hit || !hit.dba.is_active) {
          res.status(404).json({ error: "DBA not found" });
          return;
        }
        if (rateLimited2(`dba:${dbaId}`)) {
          res.status(429).json({ error: "Too many posts \u2014 try again later (30 per hour max)" });
          return;
        }
        const b = req.body || {};
        const message = String(b.message ?? b.text ?? b.content ?? "").trim();
        if (!message) {
          res.status(400).json({ error: "Send the text as `message`" });
          return;
        }
        if (message.length > 8e3) {
          res.status(400).json({ error: "Message is too long (8000 characters max)" });
          return;
        }
        const ctx = encodeURIComponent(`dba:${dbaId}`);
        const communityId = String(b.community_id || "").trim();
        const communityName = String(b.community || b.community_name || "").trim();
        let comm = null;
        if (communityId) {
          comm = (await dbGet3(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name`))[0];
        } else if (communityName) {
          comm = (await dbGet3(`communities?name=ilike.${encodeURIComponent(communityName)}&company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name&limit=1`))[0];
        }
        if (!comm) {
          res.status(404).json({ error: "Channel not found \u2014 send `community_id` or the exact `community` name of one of this DBA's channels" });
          return;
        }
        const senderName = String(b.sender_name || "").trim().slice(0, 60) || "\u{1F4EC} Team Update";
        const ok = await dbInsert("community_messages", {
          community_id: comm.id,
          sender_id: null,
          sender_name: senderName,
          sender_role: "super_admin",
          content: message,
          parent_id: null
        });
        if (!ok) {
          res.status(502).json({ error: "Could not post the message" });
          return;
        }
        await notifyCommunityMembers(comm.id, comm.name, null);
        logger.info({ dbaId, community: comm.name }, "[CommunityPost] DBA webhook posted");
        res.json({ ok: true, community: comm.name });
      } catch (e) {
        logger.warn({ err: String(e) }, "[CommunityPost] DBA webhook failed");
        res.status(500).json({ error: "Something went wrong" });
      }
    });
    router8.get("/webhooks/community-post-dba/:dbaId/config", async (req, res) => {
      try {
        const dbaId = String(req.params.dbaId || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(dbaId)) {
          res.status(400).json({ error: "Bad DBA id" });
          return;
        }
        const me = await requireUserJwt(req);
        if (!me) {
          res.status(403).json({ error: "Not authorized" });
          return;
        }
        const hit = await findDbaAnywhere(dbaId);
        if (!hit || !hit.dba.is_active) {
          res.status(404).json({ error: "DBA not found" });
          return;
        }
        if (!dbaAccess(me, hit.companyId, hit.dba).manage) {
          res.status(403).json({ error: "Not authorized" });
          return;
        }
        const ctx = encodeURIComponent(`dba:${dbaId}`);
        const communities = await dbGet3(`communities?company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name&order=name`);
        res.json({
          url: `${appBase(req)}/api/webhooks/community-post-dba/${dbaId}`,
          secret: communityPostDbaSecretFor(dbaId),
          communities
        });
      } catch {
        res.status(500).json({ error: "Could not load config" });
      }
    });
    router8.get("/webhooks/community-post/:companyId/config", async (req, res) => {
      try {
        const companyId = String(req.params.companyId || "").trim();
        const caller = await requireStaff(req);
        if (!caller || caller.role !== "super_admin" || caller.company_id !== companyId && caller.company_id !== EDEN_ORG_ID5) {
          res.status(403).json({ error: "Not authorized" });
          return;
        }
        const communities = await dbGet3(`communities?company_id=eq.${companyId}&is_active=eq.true&select=id,name&order=name`);
        res.json({
          url: `${appBase(req)}/api/webhooks/community-post/${companyId}`,
          secret: communityPostSecretFor(companyId),
          communities
        });
      } catch {
        res.status(500).json({ error: "Could not load config" });
      }
    });
    communityPost_default = router8;
  }
});

// src/routes/__tests__/communityMute.test.ts
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";
var SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
var ORG = "b0000000-0000-0000-0000-000000000001";
var COMM = "11111111-1111-1111-1111-111111111111";
var MEMBER = "22222222-2222-2222-2222-222222222222";
var MUTED = "33333333-3333-3333-3333-333333333333";
var OUTSIDER = "44444444-4444-4444-4444-444444444444";
var MSG_ID = "55555555-5555-5555-5555-555555555555";
var DBA_ID = "66666666-6666-6666-6666-666666666666";
var tokens = {
  "tok-member": "member@x.co",
  "tok-muted": "muted@x.co",
  "tok-outsider": "outsider@x.co"
};
var profiles = {
  "member@x.co": { id: MEMBER, role: "client", company_id: ORG },
  "muted@x.co": { id: MUTED, role: "client", company_id: ORG },
  "outsider@x.co": { id: OUTSIDER, role: "client", company_id: ORG }
};
var adminSettings = [];
var notifications = [];
var communityMembers = [
  { community_id: COMM, user_id: MEMBER, user_name: "Member One" },
  { community_id: COMM, user_id: MUTED, user_name: "Muted Two" }
];
var realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (u.pathname === "/auth/v1/user") {
      const tok = String(init.headers?.Authorization || "").replace("Bearer ", "");
      const email = tokens[tok];
      return email ? json({ email }) : json({ error: "bad token" }, 401);
    }
    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;
    if (u.pathname === "/rest/v1/user_profiles") {
      const email = String(q.get("email") || "").replace("eq.", "");
      const p = profiles[email];
      return json(p ? [p] : []);
    }
    if (u.pathname === "/rest/v1/communities") {
      const id = String(q.get("id") || "").replace("eq.", "");
      return json(id === COMM ? [{ id: COMM, name: "Busy Chat", company_id: ORG }] : []);
    }
    if (u.pathname === "/rest/v1/community_members") {
      const uid = q.get("user_id");
      if (uid) {
        const id = uid.replace("eq.", "");
        return json(communityMembers.filter((m) => m.user_id === id).map((m) => ({ user_id: m.user_id })));
      }
      return json(communityMembers);
    }
    if (u.pathname === "/rest/v1/admin_settings") {
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        const i = adminSettings.findIndex((r) => r.company_id === body.company_id && r.key === body.key);
        if (i >= 0) {
          if (q.get("on_conflict")) adminSettings[i] = { ...adminSettings[i], ...body };
          else return json({ error: "duplicate key" }, 409);
        } else adminSettings.push(body);
        return json([body], 201);
      }
      const keyEq = q.get("key");
      if (keyEq?.startsWith("eq.")) {
        const k = keyEq.slice(3);
        return json(adminSettings.filter((r) => r.key === k));
      }
      if (keyEq?.startsWith("like.")) {
        const pat = keyEq.slice(5);
        const prefix = pat.endsWith("*") ? pat.slice(0, -1) : pat;
        return json(adminSettings.filter((r) => r.key.startsWith(prefix)));
      }
      return json(adminSettings);
    }
    if (u.pathname === "/rest/v1/community_messages") {
      const id = String(q.get("id") || "").replace("eq.", "");
      if (id === MSG_ID) {
        return json([{
          id: MSG_ID,
          sender_id: MEMBER,
          sender_name: "Member One",
          content: "@Muted hello there",
          created_at: (/* @__PURE__ */ new Date()).toISOString(),
          deleted_at: null
        }]);
      }
      return json([]);
    }
    if (u.pathname === "/rest/v1/notifications") {
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "[]"));
        notifications.push(...Array.isArray(body) ? body : [body]);
        return json(body, 201);
      }
      return json([]);
    }
    return json([], 200);
  });
}
var server;
var base = "";
before(async () => {
  mockSupabase();
  const { default: router9, notifyCommunityMembers: notifyCommunityMembers2 } = await Promise.resolve().then(() => (init_communityPost(), communityPost_exports));
  globalThis.__notify = notifyCommunityMembers2;
  const app = express();
  app.use(express.json());
  app.use(router9);
  server = app.listen(0);
  const addr = server.address();
  base = `http://127.0.0.1:${addr.port}`;
});
after(() => {
  server?.close();
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  adminSettings = [];
  notifications = [];
});
async function api(path, opts = {}) {
  const r = await realFetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers || {} }
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
var auth = (tok) => ({ Authorization: `Bearer ${tok}` });
test("mute then unmute round-trips through GET", async () => {
  let r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.status, 200);
  assert.equal(r.body.muted, false);
  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-member"), body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.muted, true);
  r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.body.muted, true);
  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-member"), body: JSON.stringify({ muted: false }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.muted, false);
  r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.body.muted, false);
});
test("unauthenticated and non-member callers are rejected", async () => {
  let r = await api(`/communities/${COMM}/mute`, { method: "POST", body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 401);
  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-outsider"), body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 403);
});
test("notifyCommunityMembers skips muted members (webhook/recap path)", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  await globalThis.__notify(COMM, "Busy Chat", null);
  const recipients = notifications.map((n) => n.recipient_id).sort();
  assert.deepEqual(recipients, [MEMBER]);
});
test("notify-post creates a mention ping for an unmuted mentioned member", async () => {
  const r = await api(`/communities/${COMM}/notify-post`, {
    method: "POST",
    headers: auth("tok-member"),
    body: JSON.stringify({ message_id: MSG_ID })
  });
  assert.equal(r.status, 200);
  const mentionRows = notifications.filter((n) => n.type === "mention");
  assert.deepEqual(mentionRows.map((n) => n.recipient_id), [MUTED]);
});
test("notify-post sends NO mention ping to a muted mentioned member", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  const r = await api(`/communities/${COMM}/notify-post`, {
    method: "POST",
    headers: auth("tok-member"),
    body: JSON.stringify({ message_id: MSG_ID })
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.filter((n) => n.recipient_id === MUTED), []);
});
test("org webhook post skips muted members, buzzes the rest", async () => {
  const { communityPostSecretFor: communityPostSecretFor2 } = await Promise.resolve().then(() => (init_communityPost(), communityPost_exports));
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  const r = await api(`/webhooks/community-post/${ORG}`, {
    method: "POST",
    headers: { "x-webhook-secret": communityPostSecretFor2(ORG) },
    body: JSON.stringify({ community_id: COMM, message: "Weekly check-in time!" })
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.map((n) => n.recipient_id), [MEMBER]);
});
test("DBA webhook post skips muted members, buzzes the rest", async () => {
  const { communityPostDbaSecretFor: communityPostDbaSecretFor2 } = await Promise.resolve().then(() => (init_communityPost(), communityPost_exports));
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  adminSettings.push({
    company_id: ORG,
    key: `dba:${DBA_ID}`,
    value: JSON.stringify({ id: DBA_ID, name: "Sub Brand", slug: "sub-brand", is_active: true, members: [] })
  });
  const r = await api(`/webhooks/community-post-dba/${DBA_ID}`, {
    method: "POST",
    headers: { "x-webhook-secret": communityPostDbaSecretFor2(DBA_ID) },
    body: JSON.stringify({ community_id: COMM, message: "Sub-brand recap!" })
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.map((n) => n.recipient_id), [MEMBER]);
});
test("unmuting restores webhook buzzes", async () => {
  const { communityPostSecretFor: communityPostSecretFor2 } = await Promise.resolve().then(() => (init_communityPost(), communityPost_exports));
  const secret = communityPostSecretFor2(ORG);
  const post = () => api(`/webhooks/community-post/${ORG}`, {
    method: "POST",
    headers: { "x-webhook-secret": secret },
    body: JSON.stringify({ community_id: COMM, message: "hello" })
  });
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  assert.equal((await post()).status, 200);
  assert.deepEqual(notifications.map((n) => n.recipient_id), [MEMBER]);
  notifications = [];
  const r = await api(`/communities/${COMM}/mute`, {
    method: "POST",
    headers: auth("tok-muted"),
    body: JSON.stringify({ muted: false })
  });
  assert.equal(r.status, 200);
  assert.equal((await post()).status, 200);
  assert.deepEqual(notifications.map((n) => n.recipient_id).sort(), [MEMBER, MUTED].sort());
});
test("an unmuted ('0') row does not silence anyone", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "0" });
  await globalThis.__notify(COMM, "Busy Chat", null);
  const recipients = notifications.map((n) => n.recipient_id).sort();
  assert.deepEqual(recipients, [MEMBER, MUTED].sort());
});
