// startDateReminders.ts — "your program starts soon" reminders.
//
// Runs hourly. For every active client with a future (or today's)
// start_date, at 7 days / 1 day / day-of it:
//   1. inserts an in-app notification (bell) — also the idempotency
//      marker, so restarts and repeated runs never double-send
//   2. emails the client a branded reminder (best effort)
//
// Milestones must match EXACTLY (7, 1, 0 days out) — no catch-up spam
// for clients created inside the window.
import { logger } from "./logger";
import { mailerConfigured, sendEmail, appUrl } from "./mailer";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: H });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as any[];
}

// Today's date (YYYY-MM-DD) in the org's home timezone.
function todayCentral(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd + "T00:00:00Z") - Date.parse(fromYmd + "T00:00:00Z")) / 86400000);
}

function prettyDate(ymd: string): string {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

const MILESTONES: Record<number, { type: string; note: (d: string) => string; subject: (o: string) => string; line: (d: string) => string }> = {
  7: {
    type: "start_reminder_7",
    note: d => `🚀 One week to go! Your program officially starts ${d}.`,
    subject: o => `One week until your ${o} program begins!`,
    line: d => `Just one week to go — your program officially starts <strong>${d}</strong>. Get excited!`,
  },
  1: {
    type: "start_reminder_1",
    note: d => `⏰ Tomorrow's the day — your program starts ${d}!`,
    subject: o => `Tomorrow's the day — your ${o} program starts!`,
    line: d => `Tomorrow (<strong>${d}</strong>) your program officially begins. Get a good night's sleep — it starts now.`,
  },
  0: {
    type: "start_reminder_0",
    note: () => `🎉 Today's the day! Your program officially starts — let's go!`,
    subject: o => `Today's the day — welcome to your ${o} program! 🎉`,
    line: () => `Today your program officially begins. Log in, check your plan, and let's get to work!`,
  },
};

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function processReminders() {
  if (!SB_KEY) return;
  try {
    const today = todayCentral();
    const horizon = new Date(Date.parse(today + "T00:00:00Z") + 8 * 86400000).toISOString().slice(0, 10);
    const clients = await sbGet(
      "user_profiles",
      `role=eq.client&is_active=not.is.false&start_date=gte.${today}&start_date=lte.${horizon}` +
        `&select=id,name,email,start_date,coach_id,company_id`,
    );
    if (!clients.length) return;

    // Org names for branding (one fetch per distinct org)
    const orgIds = [...new Set(clients.map(c => c.company_id || EDEN_ORG_ID))];
    const orgs = await sbGet("organizations", `id=in.(${orgIds.join(",")})&select=id,name`);
    const orgName = (id: string) =>
      orgs.find(o => o.id === id)?.name || "Eden Communications";

    // Idempotency markers: one batched fetch of already-sent reminders for
    // all candidates (the notification row doubles as the sent-marker).
    // Note: without a DB unique constraint (no DDL available) this is
    // check-then-insert; safe for our single hourly process.
    const markers = await sbGet(
      "notifications",
      `recipient_id=in.(${clients.map(c => c.id).join(",")})` +
        `&type=in.(start_reminder_7,start_reminder_1,start_reminder_0)&select=recipient_id,type`,
    );
    const already = new Set(markers.map(m => `${m.recipient_id}|${m.type}`));

    let sent = 0;
    for (const c of clients) {
      const days = daysBetween(today, String(c.start_date).slice(0, 10));
      const m = MILESTONES[days];
      if (!m) continue;
      if (already.has(`${c.id}|${m.type}`)) continue;

      const nice = prettyDate(String(c.start_date).slice(0, 10));
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({
          recipient_id: c.id,
          sender_id: c.coach_id || null,
          type: m.type,
          body: m.note(nice),
          is_read: false,
          created_at: new Date().toISOString(),
        }),
      });
      if (!ins.ok) {
        logger.warn({ client: c.id, status: ins.status }, "[StartReminders] notification insert failed — skipping email");
        continue;
      }
      sent++;

      // Email (best effort — the in-app notification already exists)
      if (mailerConfigured() && c.email) {
        const org = orgName(c.company_id || EDEN_ORG_ID);
        const first = String(c.name || "").split(" ")[0] || "there";
        const url = appUrl();
        const line = m.line(esc(nice));
        const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid #ffa600">
      <h1 style="margin:0;color:#ffa600;font-size:20px;letter-spacing:1px">${esc(org)}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">Hi ${esc(first)},</p>
      <p style="margin:0 0 20px">${line}</p>
      ${url ? `<p style="margin:0 0 24px;text-align:center"><a href="${esc(url)}" style="background:#ffa600;color:#111;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;display:inline-block">Open the App</a></p>` : ""}
      <p style="margin:0">The ${esc(org)} Team</p>
    </div>
  </div>`;
        const text = `Hi ${first},\n\n${m.note(nice)}\n\n${url ? `Open the app: ${url}\n\n` : ""}The ${org} Team`;
        await sendEmail({ to: c.email, subject: m.subject(org), html, text, fromName: org });
      }
    }
    if (sent) logger.info({ sent }, "[StartReminders] sent start-date reminders");
  } catch (err) {
    logger.warn({ err }, "[StartReminders] run failed");
  }
}

export function startStartDateReminders() {
  processReminders();                       // once on startup
  setInterval(processReminders, 60 * 60 * 1000); // then hourly
}
