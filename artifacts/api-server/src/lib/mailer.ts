// ─────────────────────────────────────────────────────────────────
// mailer.ts — transactional email via SMTP (Gmail App Password today,
// swappable to Resend/Postmark later by changing env vars only).
//
// Required env:
//   SMTP_SENDER_EMAIL — full sender address (also the SMTP username)
//   SMTP_APP_PASSWORD — Gmail App Password / SMTP password
// Optional env:
//   SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465)
//   APP_URL — public login URL used in emails
// ─────────────────────────────────────────────────────────────────
import nodemailer from "nodemailer";
import { logger } from "./logger";

// Resend takes priority when configured; falls back to legacy Gmail SMTP.
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.SMTP_FROM_EMAIL || process.env.SMTP_SENDER_EMAIL || "";
const SENDER = FROM;
const PASSWORD = RESEND_KEY || process.env.SMTP_APP_PASSWORD || "";
const USERNAME = RESEND_KEY ? "resend" : (process.env.SMTP_SENDER_EMAIL || "");
const HOST = process.env.SMTP_HOST || (RESEND_KEY ? "smtp.resend.com" : "smtp.gmail.com");
const PORT = Number(process.env.SMTP_PORT || 465);

export function mailerConfigured(): boolean {
  return Boolean(SENDER && PASSWORD);
}

export function appUrl(): string {
  return (
    process.env.APP_URL ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/` : "")
  );
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USERNAME, pass: PASSWORD },
    });
  }
  return transporter;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mailerConfigured()) {
    return { ok: false, error: "SMTP not configured (SMTP_SENDER_EMAIL / SMTP_APP_PASSWORD missing)" };
  }
  try {
    await getTransporter().sendMail({
      from: `"${(opts.fromName || "Eden Comms").replace(/"/g, "'")}" <${SENDER}>`,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.error({ error, to: opts.to, subject: opts.subject }, "[mailer] send failed");
    return { ok: false, error };
  }
}

// Escape untrusted text before inserting it into email HTML.
function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Branded password-reset email ─────────────────────────────────
export function resetEmail(params: {
  name: string;
  orgName: string;
  actionLink: string;
}): { subject: string; html: string; text: string } {
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
    `If you didn't request this, you can safely ignore this email — your password won't change.`,
    ``,
    `The ${orgName} Team`,
  ].join("\n");

  const safeLink = /^https?:\/\//i.test(actionLink) ? actionLink : "";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid #ffa600">
      <h1 style="margin:0;color:#ffa600;font-size:20px;letter-spacing:1px">${esc(orgName)}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">Hi ${esc(firstName)},</p>
      <p style="margin:0 0 20px">We received a request to reset your <strong>${esc(orgName)}</strong> password. Click below to choose a new one — the link expires soon.</p>
      ${safeLink ? `<p style="margin:0 0 24px;text-align:center"><a href="${esc(safeLink)}" style="background:#ffa600;color:#111;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;display:inline-block">Reset My Password</a></p>` : ""}
      <p style="margin:0 0 16px;color:#999;font-size:12px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
      <p style="margin:0">The ${esc(orgName)} Team</p>
    </div>
  </div>`;

  return { subject, html, text };
}

// ── Welcome / login-details email for newly imported clients ─────
export function welcomeEmail(params: {
  clientName: string;
  email: string;
  tempPassword: string;
  orgName: string;
  coachName?: string | null;
}): { subject: string; html: string; text: string } {
  const { clientName, email, tempPassword, orgName, coachName } = params;
  const url = appUrl();
  const firstName = clientName.split(" ")[0] || clientName;
  const subject = `Welcome to ${orgName} — your login details`;

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
    `The ${orgName} Team`,
  ].filter((l) => l !== "").join("\n");

  // Only allow http(s) URLs in the button link
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
