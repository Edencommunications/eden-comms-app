// realtimeWatch.test.ts — run-level tests for the daily realtime-publication
// watchdog. The delivery check itself is injected (no live websocket needed);
// Supabase REST traffic (notifications, user_profiles) is mocked via fetch.
// Run with the api-server test script (esbuild bundle + node --test).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runRealtimeWatch,
  getRealtimeWatchHealth,
  pickColumn,
  ALERT_TYPE,
  STALE_AFTER_MS,
  RUN_EVERY_MS,
} from "../realtimeWatch";

// ---- pickColumn ----------------------------------------------------------

test("pickColumn: prefers a string column that is not an id", () => {
  assert.equal(pickColumn({ id: "x", company_id: "y", name: "Acme", n: 3 }), "name");
});

test("pickColumn: falls back to any non-id column", () => {
  assert.equal(pickColumn({ id: "x", count: 3 }), "count");
  assert.equal(pickColumn({ id: "x" }), null);
});

// ---- health snapshot -----------------------------------------------------

test("health snapshot starts empty and is a copy (not a live reference)", () => {
  const h = getRealtimeWatchHealth();
  assert.equal(h.runs, 0);
  assert.equal(h.lastRunOk, null);
  assert.equal(h.healthy, true); // startup grace before the first run
  (h as any).runs = 99;
  assert.equal(getRealtimeWatchHealth().runs, 0);
});

// ---- mocked Supabase REST ------------------------------------------------

const realFetch = globalThis.fetch;

type Insert = { table: string; body: any };

function mockSupabase(opts: {
  admins?: any[];
  existingAlerts?: any[];
  inserts?: Insert[];
  onInsert?: () => Response;
  onGet?: (table: string) => Response | null;
} = {}) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!url.includes("supabase.co")) return realFetch(input, init);
    const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1] || "";
    if ((init?.method || "GET") === "POST") {
      opts.inserts?.push({ table, body: JSON.parse(String(init?.body || "{}")) });
      return opts.onInsert ? opts.onInsert() : new Response(null, { status: 201 });
    }
    const custom = opts.onGet?.(table);
    if (custom) return custom;
    if (table === "user_profiles") return new Response(JSON.stringify(opts.admins || []), { status: 200 });
    if (table === "notifications") return new Response(JSON.stringify(opts.existingAlerts || []), { status: 200 });
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
}

// ---- runs ------------------------------------------------------------------

test("run: all tables delivering → healthy, heartbeat, no alerts", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const inserts: Insert[] = [];
  mockSupabase({ admins: [{ id: "admin-1" }], inserts });
  await runRealtimeWatch(async () => []);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, true);
  assert.equal(h.lastError, null);
  assert.ok(h.lastSuccessAt);
  assert.equal(h.healthy, true);
  assert.equal(inserts.length, 0); // no false-alarm notifications
});

test("run: missed delivery → unhealthy + bell alert for every super_admin", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const inserts: Insert[] = [];
  mockSupabase({ admins: [{ id: "admin-1" }, { id: "admin-2" }], inserts });
  await runRealtimeWatch(async () => ["organizations: realtime UPDATE did not arrive within 5000ms."]);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.equal(h.healthy, false);
  assert.deepEqual(h.lastFailedTables, ["organizations"]);
  assert.equal(h.lastNotified, 2);
  assert.equal(inserts.length, 2);
  for (const ins of inserts) {
    assert.equal(ins.table, "notifications");
    assert.equal(ins.body.type, ALERT_TYPE);
    // The alert must name the exact fix.
    assert.match(ins.body.body, /ALTER PUBLICATION supabase_realtime ADD TABLE/);
  }
});

test("run: alerts are deduped — admins already alerted today are skipped", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const inserts: Insert[] = [];
  mockSupabase({
    admins: [{ id: "admin-1" }, { id: "admin-2" }],
    existingAlerts: [{ recipient_id: "admin-1" }],
    inserts,
  });
  await runRealtimeWatch(async () => ["packages: no event"]);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastNotified, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].body.recipient_id, "admin-2");
});

test("run: failed alert inserts are surfaced in lastError", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({ admins: [{ id: "admin-1" }], onInsert: () => new Response("boom", { status: 500 }) });
  await runRealtimeWatch(async () => ["packages: no event"]);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /1 admin alert insert\(s\) failed/);
});

test("run: alerting-path GET failure is surfaced, run stays failed", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({ onGet: table => (table === "notifications" ? new Response("err", { status: 503 }) : null) });
  await runRealtimeWatch(async () => ["organizations: no event"]);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /alerting failed/);
});

test("run: a throwing check (e.g. channel never subscribed) is a FAILED run and still bell-alerts admins", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const inserts: Insert[] = [];
  mockSupabase({ admins: [{ id: "admin-1" }, { id: "admin-2" }], inserts });
  await runRealtimeWatch(async () => { throw new Error("Realtime channel did not reach SUBSCRIBED within 10s"); });
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.equal(h.healthy, false);
  assert.match(String(h.lastError), /SUBSCRIBED/);
  // A verification-infrastructure failure is alertable too.
  assert.equal(h.lastNotified, 2);
  assert.equal(inserts.length, 2);
  for (const ins of inserts) {
    assert.equal(ins.body.type, ALERT_TYPE);
    assert.match(ins.body.body, /verification itself failed/);
    assert.match(ins.body.body, /ALTER PUBLICATION supabase_realtime ADD TABLE/);
  }
});

test("run: thrown-check alerts are deduped per day like delivery-failure alerts", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const inserts: Insert[] = [];
  mockSupabase({
    admins: [{ id: "admin-1" }, { id: "admin-2" }],
    existingAlerts: [{ recipient_id: "admin-2" }],
    inserts,
  });
  await runRealtimeWatch(async () => { throw new Error("boom"); });
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastNotified, 1);
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].body.recipient_id, "admin-1");
});

test("run: thrown check + unreachable notifications table stays a health/log failure", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({ onGet: table => (table === "notifications" ? new Response("err", { status: 503 }) : null) });
  await runRealtimeWatch(async () => { throw new Error("socket down"); });
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /socket down/);
  assert.match(String(h.lastError), /alerting failed/);
  assert.equal(h.lastNotified, 0);
});

test("run: a missing service key is a FAILED run, not a silent no-op", async (t) => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = saved; });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await runRealtimeWatch(async () => []);
  const h = getRealtimeWatchHealth();
  assert.equal(h.lastRunOk, false);
  assert.equal(h.healthy, false);
  assert.match(String(h.lastError), /SUPABASE_SERVICE_ROLE_KEY missing/);
});

test("health: a stale last run flips healthy=false even after a success", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase();
  await runRealtimeWatch(async () => []);
  const fresh = getRealtimeWatchHealth();
  assert.equal(fresh.healthy, true);
  assert.equal(fresh.stale, false);
  // Evaluate the same snapshot past the staleness window — the daily
  // interval silently stopped.
  const later = new Date(Date.parse(fresh.lastRunAt!) + STALE_AFTER_MS + 60_000);
  const staleView = getRealtimeWatchHealth(later);
  assert.equal(staleView.stale, true);
  assert.equal(staleView.healthy, false);
});

test("staleness window is wider than the run interval (no false alarms)", () => {
  assert.ok(STALE_AFTER_MS > RUN_EVERY_MS);
});
