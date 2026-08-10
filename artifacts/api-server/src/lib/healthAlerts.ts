// healthAlerts.ts — email the platform admin when /healthz turns red.
//
// /healthz already evaluates job health (start-date reminders, duplicate
// diet-plan watcher) and returns 503 when anything is unhealthy — but that
// only helps if someone is watching the endpoint. This watcher re-evaluates
// the same signals every minute and, when overall health flips
// healthy → unhealthy, sends ONE alert email to the platform admin via the
// existing mailer. While health stays red it re-alerts at most every
// REALERT_AFTER_MS (no hourly spam); when health recovers it sends a single
// "all clear" so the admin knows the incident is over.
//
// Recipient: HEALTH_ALERT_EMAIL env var, falling back to SMTP_SENDER_EMAIL
// (the platform admin's own sender inbox). Email is best effort — a failed
// send is logged and retried on the next tick (state only advances when the
// send succeeds, so a transient SMTP failure can't swallow the alert).
import { logger } from "./logger";
import { mailerConfigured, sendEmail } from "./mailer";
import { getStartRemindersHealth } from "./startDateReminders";
import { getDietPlanDuplicatesHealth } from "./dietPlanDuplicates";
import { getRealtimeWatchHealth } from "./realtimeWatch";

export const CHECK_INTERVAL_MS = 60 * 1000;          // evaluate every minute
export const REALERT_AFTER_MS = 6 * 60 * 60 * 1000;  // still-red reminder cadence

export type HealthSignal = { name: string; healthy: boolean; detail: string };

// Read at call time so tests (and config changes) are picked up per tick.
export function alertRecipient(): string {
  return process.env.HEALTH_ALERT_EMAIL || process.env.SMTP_SENDER_EMAIL || "";
}

// The same signals /healthz aggregates, flattened for the email body.
export function collectHealthSignals(now: Date = new Date()): HealthSignal[] {
  const reminders = getStartRemindersHealth(now);
  const dupes = getDietPlanDuplicatesHealth(now);
  const realtime = getRealtimeWatchHealth(now);
  return [
    {
      name: "Start-date reminders job",
      healthy: reminders.healthy,
      detail: reminders.healthy
        ? "ok"
        : reminders.stale
          ? `stale — no completed run since ${reminders.lastRunAt || "startup"}`
          : reminders.lastError || "last run failed",
    },
    {
      name: "Duplicate diet-plan watcher",
      healthy: dupes.healthy,
      detail: dupes.healthy
        ? "ok"
        : dupes.stale
          ? `stale — no completed run since ${dupes.lastRunAt || "startup"}`
          : dupes.lastDuplicateClients > 0
            ? `${dupes.lastDuplicateClients} client(s) have duplicate diet_plans rows (sample: ${dupes.duplicateClientIds.join(", ")})`
            : dupes.lastError || "last run failed",
    },
    {
      name: "Realtime-publication watchdog",
      healthy: realtime.healthy,
      detail: realtime.healthy
        ? "ok"
        : realtime.stale
          ? `stale — no completed run since ${realtime.lastRunAt || "startup"}`
          : realtime.lastFailedTables.length > 0
            ? `realtime delivery failed for: ${realtime.lastFailedTables.join(", ")}`
            : realtime.lastError || "last run failed",
    },
  ];
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Exported for tests.
export function buildAlertEmail(kind: "alert" | "recovery", signals: HealthSignal[], at: Date): {
  subject: string; html: string; text: string;
} {
  const red = signals.filter(s => !s.healthy);
  const subject =
    kind === "alert"
      ? `🔴 Health check DEGRADED — ${red.map(s => s.name).join(", ")}`
      : `🟢 Health check recovered — all systems healthy`;
  const lines =
    kind === "alert"
      ? red.map(s => `• ${s.name}: ${s.detail}`)
      : signals.map(s => `• ${s.name}: ok`);
  const text = [
    kind === "alert"
      ? `The platform health check (/healthz) turned DEGRADED at ${at.toISOString()}.`
      : `The platform health check (/healthz) recovered at ${at.toISOString()}. All signals are healthy again.`,
    ``,
    ...lines,
    ``,
    kind === "alert"
      ? `The /healthz endpoint is returning 503 until this is resolved. You'll get one "all clear" email when it recovers.`
      : `No action needed.`,
  ].join("\n");
  const color = kind === "alert" ? "#e5484d" : "#30a46c";
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#111111;border-radius:12px;overflow:hidden">
    <div style="background:#1a1a1a;padding:28px 32px;border-bottom:2px solid ${color}">
      <h1 style="margin:0;color:${color};font-size:18px;letter-spacing:1px">${kind === "alert" ? "Health check DEGRADED" : "Health check recovered"}</h1>
    </div>
    <div style="padding:32px;color:#e8e8e8;font-size:14px;line-height:1.7">
      <p style="margin:0 0 16px">${
        kind === "alert"
          ? `The platform health check (<strong>/healthz</strong>) turned <strong style="color:${color}">DEGRADED</strong> at ${esc(at.toISOString())}.`
          : `The platform health check (<strong>/healthz</strong>) recovered at ${esc(at.toISOString())}. All signals are healthy again.`
      }</p>
      <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px 20px;margin:0 0 20px">
        ${lines.map(l => `<p style="margin:0 0 6px">${esc(l)}</p>`).join("")}
      </div>
      <p style="margin:0;color:#999;font-size:12px">${
        kind === "alert"
          ? `/healthz is returning 503 until this is resolved. You'll get one "all clear" email when it recovers.`
          : `No action needed.`
      }</p>
    </div>
  </div>`;
  return { subject, html, text };
}

// ---- alerting state -------------------------------------------------------
export type HealthAlertState = {
  lastObservedHealthy: boolean | null; // null = never evaluated
  lastAlertAt: string | null;          // last DEGRADED alert that actually sent
  lastRecoveryAt: string | null;       // last all-clear that actually sent
  alertsSent: number;
  recoveriesSent: number;
};

const state: HealthAlertState = {
  lastObservedHealthy: null,
  lastAlertAt: null,
  lastRecoveryAt: null,
  alertsSent: 0,
  recoveriesSent: 0,
};

export function getHealthAlertState(): HealthAlertState {
  return { ...state };
}

export function resetHealthAlertStateForTests(): void {
  state.lastObservedHealthy = null;
  state.lastAlertAt = null;
  state.lastRecoveryAt = null;
  state.alertsSent = 0;
  state.recoveriesSent = 0;
}

type SendFn = typeof sendEmail;

// One evaluation tick. Dependency-injected for tests (send + signals + clock).
export async function checkHealthAlerts(deps?: {
  now?: Date;
  signals?: HealthSignal[];
  send?: SendFn;
  configured?: boolean;
}): Promise<void> {
  const now = deps?.now ?? new Date();
  const signals = deps?.signals ?? collectHealthSignals(now);
  const send = deps?.send ?? sendEmail;
  const configured = deps?.configured ?? mailerConfigured();
  const healthy = signals.every(s => s.healthy);
  const was = state.lastObservedHealthy;

  try {
    if (!healthy) {
      // Alert on the healthy→unhealthy flip (including a red FIRST observation
      // — a server that boots degraded must not stay silent). While still red,
      // re-alert only after REALERT_AFTER_MS.
      const flipped = was !== false;
      const throttled =
        state.lastAlertAt !== null &&
        now.getTime() - Date.parse(state.lastAlertAt) < REALERT_AFTER_MS;
      if (flipped || !throttled) {
        const to = alertRecipient();
        if (!configured || !to) {
          logger.error(
            { configured, hasRecipient: Boolean(to) },
            "[HealthAlerts] health is DEGRADED but no alert email can be sent (mailer unconfigured or no recipient)",
          );
        } else {
          const mail = buildAlertEmail("alert", signals, now);
          const res = await send({ to, ...mail, fromName: "Eden Platform Monitor" });
          if (res.ok) {
            state.lastAlertAt = now.toISOString();
            state.alertsSent++;
            logger.warn({ to, signals: signals.filter(s => !s.healthy) }, "[HealthAlerts] degraded-health alert email sent");
          } else {
            logger.error({ error: res.error }, "[HealthAlerts] alert email FAILED to send — will retry next tick");
            // Don't record lastObservedHealthy=false yet: leaving the flip
            // "unconsumed" makes the next tick retry the alert immediately.
            return;
          }
        }
      }
    } else if (was === false) {
      // Recovery: one "all clear" — but only if we actually alerted for this
      // incident (otherwise a silent blip would email out of nowhere).
      if (state.lastAlertAt && (!state.lastRecoveryAt || Date.parse(state.lastRecoveryAt) < Date.parse(state.lastAlertAt))) {
        const to = alertRecipient();
        if (configured && to) {
          const mail = buildAlertEmail("recovery", signals, now);
          const res = await send({ to, ...mail, fromName: "Eden Platform Monitor" });
          if (res.ok) {
            state.lastRecoveryAt = now.toISOString();
            state.recoveriesSent++;
            logger.info({ to }, "[HealthAlerts] all-clear email sent");
          } else {
            logger.error({ error: res.error }, "[HealthAlerts] all-clear email FAILED to send — will retry next tick");
            return; // keep lastObservedHealthy=false so the recovery retries
          }
        }
      }
    }
    state.lastObservedHealthy = healthy;
  } catch (err) {
    // A crashed tick must never kill the interval.
    logger.error({ err }, "[HealthAlerts] tick failed");
  }
}

export function startHealthAlertWatcher(): void {
  // No immediate tick: the jobs get their startup grace (runs === 0 is
  // healthy), and the first interval tick a minute in sees real state.
  setInterval(() => { void checkHealthAlerts(); }, CHECK_INTERVAL_MS);
  logger.info({ intervalMs: CHECK_INTERVAL_MS, recipientConfigured: Boolean(alertRecipient()) }, "[HealthAlerts] watcher started");
}
