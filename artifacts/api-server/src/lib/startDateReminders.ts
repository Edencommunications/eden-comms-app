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
//
// Monitoring: every run (even "0 due") logs a summary and updates an
// in-memory health snapshot exposed via getStartRemindersHealth() on
// the /healthz endpoint, so a silently-dead job is visible.
import { logger } from "./logger";
import { mailerConfigured, sendEmail, appUrl } from "./mailer";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

// Read at call time (not import time) so a missing key is detected on every
// run — and so tests can exercise the misconfigured path.
function sbKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sbHeaders(): Record<string, string> {
  const key = sbKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// sbGet distinguishes "no rows" from "request failed" — a failed fetch of
// idempotency markers must abort the run (otherwise we'd double-send).
// A malformed body on a 2xx also throws: no silent empty result sets.
async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${table} failed: HTTP ${r.status}`);
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    throw new Error(`Supabase GET ${table} returned a malformed body`);
  }
  if (!Array.isArray(body)) throw new Error(`Supabase GET ${table} returned a non-array body`);
  return body as any[];
}

// Today's date (YYYY-MM-DD) in the org's home timezone.
export function todayCentral(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(toYmd + "T00:00:00Z") - Date.parse(fromYmd + "T00:00:00Z")) / 86400000);
}

function prettyDate(ymd: string): string {
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

export const MILESTONES: Record<number, { type: string; note: (d: string) => string; subject: (o: string) => string; line: (d: string) => string }> = {
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

// Pure milestone matcher: which reminder (if any) is due for a client with
// this start_date on this day? Returns null when no milestone matches.
export function milestoneFor(todayYmd: string, startDateRaw: string): { type: string } & (typeof MILESTONES)[number] | null {
  const startYmd = String(startDateRaw).slice(0, 10);
  const days = daysBetween(todayYmd, startYmd);
  return MILESTONES[days] || null;
}

// Pure idempotency helper: marker key for the already-sent set.
export function markerKey(recipientId: string, type: string): string {
  return `${recipientId}|${type}`;
}

// ---- run health --------------------------------------------------------
export type StartRemindersHealth = {
  lastRunAt: string | null;      // ISO timestamp of the last completed run (ok or failed)
  lastSuccessAt: string | null;  // ISO timestamp of the last run that finished without error
  lastRunOk: boolean | null;
  lastError: string | null;
  lastCandidates: number;        // clients inside the 8-day window last run
  lastDue: number;               // clients matching an exact milestone last run
  lastSkipped: number;           // due but already sent (idempotency marker hit)
  lastSent: number;              // notifications actually inserted last run
  lastFailed: number;            // due, not yet sent, but the insert failed
  runs: number;                  // total runs since process start
};

const health: StartRemindersHealth = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastRunOk: null,
  lastError: null,
  lastCandidates: 0,
  lastDue: 0,
  lastSkipped: 0,
  lastSent: 0,
  lastFailed: 0,
  runs: 0,
};

// The job runs hourly; allow some slack before calling it stale.
export const STALE_AFTER_MS = 75 * 60 * 1000;

// Evaluated health: healthy only if the last run succeeded AND completed
// recently. A hung/stopped interval therefore turns unhealthy on its own —
// the primary "silently stopped" failure this monitoring exists to catch.
export function getStartRemindersHealth(now: Date = new Date()): StartRemindersHealth & { healthy: boolean; stale: boolean } {
  const stale =
    health.runs > 0 &&
    (!health.lastRunAt || now.getTime() - Date.parse(health.lastRunAt) > STALE_AFTER_MS);
  const neverRan = health.runs === 0; // startup grace: first run happens immediately
  return {
    ...health,
    stale,
    healthy: !stale && (neverRan || health.lastRunOk === true),
  };
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Exported for run-level tests (which mock global fetch).
export async function processReminders() {
  health.runs++;
  if (!sbKey()) {
    // Misconfiguration is a FAILED run, not a silent no-op — otherwise a
    // missing key would leave /healthz green while reminders never send.
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = "SUPABASE_SERVICE_ROLE_KEY missing — reminders disabled";
    logger.error("[StartReminders] SUPABASE_SERVICE_ROLE_KEY missing — reminders disabled");
    return;
  }
  let candidates = 0, due = 0, skipped = 0, sent = 0, failed = 0;
  try {
    const today = todayCentral();
    const horizon = new Date(Date.parse(today + "T00:00:00Z") + 8 * 86400000).toISOString().slice(0, 10);
    const clients = await sbGet(
      "user_profiles",
      `role=eq.client&is_active=not.is.false&start_date=gte.${today}&start_date=lte.${horizon}` +
        `&select=id,name,email,start_date,coach_id,company_id`,
    );
    candidates = clients.length;

    let orgs: any[] = [];
    let already = new Set<string>();
    if (clients.length) {
      // Org names for branding (one fetch per distinct org)
      const orgIds = [...new Set(clients.map(c => c.company_id || EDEN_ORG_ID))];
      orgs = await sbGet("organizations", `id=in.(${orgIds.join(",")})&select=id,name,slug`);

      // Idempotency markers: one batched fetch of already-sent reminders for
      // all candidates (the notification row doubles as the sent-marker).
      // Note: without a DB unique constraint (no DDL available) this is
      // check-then-insert; safe for our single hourly process.
      const markers = await sbGet(
        "notifications",
        `recipient_id=in.(${clients.map(c => c.id).join(",")})` +
          `&type=in.(start_reminder_7,start_reminder_1,start_reminder_0)&select=recipient_id,type`,
      );
      already = new Set(markers.map(m => markerKey(m.recipient_id, m.type)));
    }

    const orgName = (id: string) =>
      orgs.find(o => o.id === id)?.name || "Eden Communications";

    for (const c of clients) {
      const m = milestoneFor(today, String(c.start_date));
      if (!m) continue;
      due++;
      if (already.has(markerKey(c.id, m.type))) { skipped++; continue; }

      const nice = prettyDate(String(c.start_date).slice(0, 10));
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
        method: "POST",
        headers: { ...sbHeaders(), Prefer: "return=representation" },
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
        failed++;
        logger.warn({ client: c.id, status: ins.status }, "[StartReminders] notification insert failed — skipping email");
        continue;
      }
      sent++;

      // Email (best effort — the in-app notification already exists)
      if (mailerConfigured() && c.email) {
        const org = orgName(c.company_id || EDEN_ORG_ID);
        const first = String(c.name || "").split(" ")[0] || "there";
        const url = appUrl(orgs.find(o => o.id === (c.company_id || EDEN_ORG_ID))?.slug);
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
        try {
          await sendEmail({ to: c.email, subject: m.subject(org), html, text, fromName: org });
        } catch (err) {
          logger.warn({ err, client: c.id }, "[StartReminders] reminder email failed (notification already delivered)");
        }
      }
    }

    health.lastRunAt = new Date().toISOString();
    health.lastCandidates = candidates;
    health.lastDue = due;
    health.lastSkipped = skipped;
    health.lastSent = sent;
    health.lastFailed = failed;
    if (failed > 0) {
      // A run with failed inserts is NOT healthy — surfacing it here is the
      // whole point of this monitoring.
      health.lastRunOk = false;
      health.lastError = `${failed} of ${due} due reminder notification(s) failed to insert`;
      logger.error({ candidates, due, skipped, sent, failed }, "[StartReminders] run finished with FAILED inserts — some reminders were not delivered");
    } else {
      health.lastSuccessAt = health.lastRunAt;
      health.lastRunOk = true;
      health.lastError = null;
      // Always log the summary — a "0 due" line each hour is the heartbeat
      // that proves the job is alive.
      logger.info({ candidates, due, skipped, sent }, "[StartReminders] run complete");
    }
  } catch (err) {
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = err instanceof Error ? err.message : String(err);
    health.lastCandidates = candidates;
    health.lastDue = due;
    health.lastSkipped = skipped;
    health.lastSent = sent;
    health.lastFailed = failed;
    logger.error({ err, candidates, due, skipped, sent, failed }, "[StartReminders] run FAILED — reminders may not have been sent");
  }
}

export function startStartDateReminders() {
  processReminders();                       // once on startup
  setInterval(processReminders, 60 * 60 * 1000); // then hourly
}
