// healthAlerts.test.ts — tests for the degraded-health alert emailer.
// The mailer is mocked via the injected `send` dependency; health signals
// are injected directly so no Supabase fetch mocking is needed.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkHealthAlerts,
  resetHealthAlertStateForTests,
  getHealthAlertState,
  buildAlertEmail,
  collectHealthSignals,
  alertRecipient,
  REALERT_AFTER_MS,
  type HealthSignal,
} from "../healthAlerts";

const OK: HealthSignal[] = [
  { name: "Start-date reminders job", healthy: true, detail: "ok" },
  { name: "Duplicate diet-plan watcher", healthy: true, detail: "ok" },
];
const RED: HealthSignal[] = [
  { name: "Start-date reminders job", healthy: true, detail: "ok" },
  { name: "Duplicate diet-plan watcher", healthy: false, detail: "2 client(s) have duplicate diet_plans rows (sample: a, b)" },
];

function mockMailer(result: { ok: true } | { ok: false; error: string } = { ok: true }) {
  const calls: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const send = async (opts: any) => { calls.push(opts); return result; };
  return { calls, send };
}

const T0 = new Date("2026-08-10T12:00:00Z");
const mins = (n: number) => new Date(T0.getTime() + n * 60 * 1000);

process.env.HEALTH_ALERT_EMAIL = "admin@example.com";

beforeEach(() => resetHealthAlertStateForTests());

test("healthy → healthy: no email ever", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: OK, send: m.send, configured: true });
  await checkHealthAlerts({ now: mins(1), signals: OK, send: m.send, configured: true });
  assert.equal(m.calls.length, 0);
  assert.equal(getHealthAlertState().alertsSent, 0);
});

test("healthy → unhealthy flip sends exactly one alert email to the admin", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: OK, send: m.send, configured: true });
  await checkHealthAlerts({ now: mins(1), signals: RED, send: m.send, configured: true });
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0]!.to, "admin@example.com");
  assert.match(m.calls[0]!.subject, /DEGRADED/);
  assert.match(m.calls[0]!.text, /duplicate diet_plans rows/);
  assert.equal(getHealthAlertState().alertsSent, 1);
});

test("still red on later ticks: throttled — no repeat emails every hour", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: true });
  assert.equal(m.calls.length, 1); // red first observation alerts too
  for (const n of [1, 60, 120, 180]) {
    await checkHealthAlerts({ now: mins(n), signals: RED, send: m.send, configured: true });
  }
  assert.equal(m.calls.length, 1); // all within the re-alert window
});

test("still red past REALERT_AFTER_MS: one reminder alert goes out", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: true });
  const later = new Date(T0.getTime() + REALERT_AFTER_MS + 60 * 1000);
  await checkHealthAlerts({ now: later, signals: RED, send: m.send, configured: true });
  assert.equal(m.calls.length, 2);
});

test("recovery sends a single all-clear, then stays quiet", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: true });
  await checkHealthAlerts({ now: mins(5), signals: OK, send: m.send, configured: true });
  await checkHealthAlerts({ now: mins(6), signals: OK, send: m.send, configured: true });
  assert.equal(m.calls.length, 2);
  assert.match(m.calls[1]!.subject, /recovered/);
  assert.equal(getHealthAlertState().recoveriesSent, 1);
});

test("no all-clear when no alert was sent for the incident", async () => {
  const m = mockMailer();
  // Degraded observed but mailer unconfigured — no alert could go out.
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: false });
  await checkHealthAlerts({ now: mins(5), signals: OK, send: m.send, configured: true });
  assert.equal(m.calls.length, 0);
});

test("a failed alert send retries on the next tick (flip not consumed)", async () => {
  const fail = mockMailer({ ok: false, error: "smtp down" });
  await checkHealthAlerts({ now: T0, signals: RED, send: fail.send, configured: true });
  assert.equal(getHealthAlertState().alertsSent, 0);
  const okMailer = mockMailer();
  await checkHealthAlerts({ now: mins(1), signals: RED, send: okMailer.send, configured: true });
  assert.equal(okMailer.calls.length, 1);
  assert.equal(getHealthAlertState().alertsSent, 1);
});

test("a failed all-clear send retries on the next tick", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: true });
  const fail = mockMailer({ ok: false, error: "smtp down" });
  await checkHealthAlerts({ now: mins(5), signals: OK, send: fail.send, configured: true });
  assert.equal(getHealthAlertState().recoveriesSent, 0);
  await checkHealthAlerts({ now: mins(6), signals: OK, send: m.send, configured: true });
  assert.equal(getHealthAlertState().recoveriesSent, 1);
  assert.equal(m.calls.length, 2); // original alert + all-clear
});

test("degraded but unconfigured mailer: no crash, no send, state still tracks", async () => {
  const m = mockMailer();
  await checkHealthAlerts({ now: T0, signals: RED, send: m.send, configured: false });
  assert.equal(m.calls.length, 0);
  assert.equal(getHealthAlertState().lastObservedHealthy, false);
});

test("alertRecipient falls back to SMTP_SENDER_EMAIL", () => {
  const saved = process.env.HEALTH_ALERT_EMAIL;
  const savedSender = process.env.SMTP_SENDER_EMAIL;
  delete process.env.HEALTH_ALERT_EMAIL;
  process.env.SMTP_SENDER_EMAIL = "sender@example.com";
  assert.equal(alertRecipient(), "sender@example.com");
  process.env.HEALTH_ALERT_EMAIL = saved;
  if (savedSender === undefined) delete process.env.SMTP_SENDER_EMAIL;
  else process.env.SMTP_SENDER_EMAIL = savedSender;
});

test("buildAlertEmail lists only the unhealthy signals in an alert", () => {
  const mail = buildAlertEmail("alert", RED, T0);
  assert.match(mail.subject, /Duplicate diet-plan watcher/);
  assert.doesNotMatch(mail.text, /Start-date reminders job/);
  assert.match(mail.text, /returning 503/);
});

test("buildAlertEmail escapes HTML in signal details", () => {
  const mail = buildAlertEmail("alert", [{ name: "x", healthy: false, detail: `<img src=x onerror=alert(1)>` }], T0);
  assert.doesNotMatch(mail.html, /<img/);
  assert.match(mail.html, /&lt;img/);
});

test("collectHealthSignals reflects the real health getters (startup grace = healthy)", () => {
  // No job has run in this test process → all are in startup grace.
  const signals = collectHealthSignals(T0);
  assert.equal(signals.length, 3);
  assert.ok(signals.every(s => s.healthy));
});

// ---- integration: a real realtime-watch failure drives the alert email ----
// Uses the REAL runRealtimeWatch + getRealtimeWatchHealth (injected check fn,
// mocked Supabase fetch for its bell alerts) feeding the REAL
// collectHealthSignals — proving every signal /healthz aggregates also
// triggers the degraded email and the all-clear.

test("realtime-watch failure → degraded alert email; its recovery → all-clear", async (t) => {
  const { runRealtimeWatch } = await import("../realtimeWatch");
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  // Stub Supabase REST (realtime-watch bell alerts) so the run completes.
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!url.includes("supabase.co")) return realFetch(input, init);
    return new Response("[]", { status: 200 });
  }) as typeof fetch;

  const m = mockMailer();
  // Failed realtime delivery for two tables → real health getter turns red.
  await runRealtimeWatch(async () => ["user_profiles: no event", "admin_settings: no event"]);
  let signals = collectHealthSignals(new Date());
  const rt = signals.find(s => s.name === "Realtime-publication watchdog")!;
  assert.equal(rt.healthy, false);
  assert.match(rt.detail, /user_profiles/);

  await checkHealthAlerts({ now: T0, signals, send: m.send, configured: true });
  assert.equal(m.calls.length, 1);
  assert.match(m.calls[0]!.subject, /DEGRADED/);
  assert.match(m.calls[0]!.subject, /Realtime-publication watchdog/);
  assert.match(m.calls[0]!.text, /user_profiles/);

  // Recovery: a passing run flips the real getter healthy → all-clear email.
  await runRealtimeWatch(async () => []);
  signals = collectHealthSignals(new Date());
  assert.ok(signals.every(s => s.healthy));
  await checkHealthAlerts({ now: mins(5), signals, send: m.send, configured: true });
  assert.equal(m.calls.length, 2);
  assert.match(m.calls[1]!.subject, /recovered/);
});
