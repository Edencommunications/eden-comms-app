// startDateReminders.test.ts — unit tests for milestone matching and
// idempotency-marker logic of the start-date reminder job.
// Run with the api-server test script (esbuild bundle + node --test).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayCentral,
  daysBetween,
  milestoneFor,
  markerKey,
  MILESTONES,
  getStartRemindersHealth,
  processReminders,
} from "../startDateReminders";

// ---- daysBetween -------------------------------------------------------

test("daysBetween: exact day counts", () => {
  assert.equal(daysBetween("2026-08-10", "2026-08-17"), 7);
  assert.equal(daysBetween("2026-08-10", "2026-08-11"), 1);
  assert.equal(daysBetween("2026-08-10", "2026-08-10"), 0);
  assert.equal(daysBetween("2026-08-10", "2026-08-09"), -1);
});

test("daysBetween: crosses month and year boundaries", () => {
  assert.equal(daysBetween("2026-08-31", "2026-09-07"), 7);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-12-25", "2027-01-01"), 7);
});

test("daysBetween: DST transitions don't skew day math (UTC-anchored)", () => {
  // US DST starts 2026-03-08 and ends 2026-11-01 (Central).
  assert.equal(daysBetween("2026-03-07", "2026-03-14"), 7);
  assert.equal(daysBetween("2026-03-08", "2026-03-09"), 1);
  assert.equal(daysBetween("2026-10-31", "2026-11-07"), 7);
  assert.equal(daysBetween("2026-11-01", "2026-11-02"), 1);
});

// ---- todayCentral (timezone edges around midnight Central) -------------

test("todayCentral: just before midnight Central is still the same day", () => {
  // 2026-08-11T04:59:00Z == 2026-08-10 23:59 CDT (UTC-5)
  assert.equal(todayCentral(new Date("2026-08-11T04:59:00Z")), "2026-08-10");
});

test("todayCentral: at midnight Central the date rolls over", () => {
  // 2026-08-11T05:00:00Z == 2026-08-11 00:00 CDT
  assert.equal(todayCentral(new Date("2026-08-11T05:00:00Z")), "2026-08-11");
});

test("todayCentral: winter (CST, UTC-6) midnight edge", () => {
  // 2026-01-15T05:59:00Z == 2026-01-14 23:59 CST
  assert.equal(todayCentral(new Date("2026-01-15T05:59:00Z")), "2026-01-14");
  // 2026-01-15T06:00:00Z == 2026-01-15 00:00 CST
  assert.equal(todayCentral(new Date("2026-01-15T06:00:00Z")), "2026-01-15");
});

// ---- milestoneFor ------------------------------------------------------

test("milestoneFor: exact 7/1/0 milestones match", () => {
  assert.equal(milestoneFor("2026-08-10", "2026-08-17")?.type, "start_reminder_7");
  assert.equal(milestoneFor("2026-08-10", "2026-08-11")?.type, "start_reminder_1");
  assert.equal(milestoneFor("2026-08-10", "2026-08-10")?.type, "start_reminder_0");
});

test("milestoneFor: non-milestone gaps do NOT match (no catch-up spam)", () => {
  for (const gap of [8, 6, 5, 4, 3, 2, -1, -7, 30]) {
    const start = new Date(Date.parse("2026-08-10T00:00:00Z") + gap * 86400000)
      .toISOString()
      .slice(0, 10);
    assert.equal(milestoneFor("2026-08-10", start), null, `gap ${gap} should not match`);
  }
});

test("milestoneFor: tolerates timestamp-style start_date values", () => {
  assert.equal(milestoneFor("2026-08-10", "2026-08-17T00:00:00+00:00")?.type, "start_reminder_7");
  assert.equal(milestoneFor("2026-08-10", "2026-08-10T12:34:56Z")?.type, "start_reminder_0");
});

test("milestoneFor: midnight-Central rollover flips the milestone", () => {
  const start = "2026-08-17";
  // 23:59 Central on Aug 10 → still the 7-day reminder
  const before = todayCentral(new Date("2026-08-11T04:59:00Z"));
  assert.equal(milestoneFor(before, start)?.type, "start_reminder_7");
  // 00:00 Central on Aug 11 → 6 days out, no milestone
  const after = todayCentral(new Date("2026-08-11T05:00:00Z"));
  assert.equal(milestoneFor(after, start), null);
});

// ---- idempotency markers -----------------------------------------------

test("markerKey: unique per recipient+type, matches Supabase marker rows", () => {
  const already = new Set(
    [
      { recipient_id: "client-a", type: "start_reminder_7" },
      { recipient_id: "client-b", type: "start_reminder_0" },
    ].map(m => markerKey(m.recipient_id, m.type)),
  );

  // Already sent → suppressed
  assert.ok(already.has(markerKey("client-a", "start_reminder_7")));
  // Same client, different milestone → still sends
  assert.ok(!already.has(markerKey("client-a", "start_reminder_1")));
  // Different client, same milestone → still sends
  assert.ok(!already.has(markerKey("client-c", "start_reminder_7")));
});

test("markerKey types cover every milestone", () => {
  const types = new Set(Object.values(MILESTONES).map(m => m.type));
  assert.deepEqual(
    [...types].sort(),
    ["start_reminder_0", "start_reminder_1", "start_reminder_7"],
  );
});

// ---- health snapshot ----------------------------------------------------

test("health snapshot starts empty and is a copy (not a live reference)", () => {
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunAt, null);
  assert.equal(h.lastRunOk, null);
  assert.equal(h.runs, 0);
  (h as any).runs = 99;
  assert.equal(getStartRemindersHealth().runs, 0);
});

// ---- run-level health (mocked Supabase fetch) ----------------------------
// These tests run last in this file (node:test runs a file's tests in
// declaration order), so the "starts empty" assertions above stay valid.

const realFetch = globalThis.fetch;

function mockSupabase(handlers: {
  clients?: any[];
  markers?: any[];
  onGet?: (table: string) => Response | null;
  onInsert?: () => Response;
}) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!url.includes("supabase.co")) return realFetch(input, init);
    const table = url.match(/\/rest\/v1\/([a-z_]+)/)?.[1] || "";
    if ((init?.method || "GET") === "POST") {
      return handlers.onInsert ? handlers.onInsert() : new Response("[]", { status: 201 });
    }
    const custom = handlers.onGet?.(table);
    if (custom) return custom;
    if (table === "user_profiles") return new Response(JSON.stringify(handlers.clients || []), { status: 200 });
    if (table === "organizations") return new Response("[]", { status: 200 });
    if (table === "notifications") return new Response(JSON.stringify(handlers.markers || []), { status: 200 });
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
}

function dueClient(id: string, daysOut: number) {
  const today = todayCentral();
  const start = new Date(Date.parse(today + "T00:00:00Z") + daysOut * 86400000)
    .toISOString()
    .slice(0, 10);
  return { id, name: "Test Client", email: null, start_date: start, coach_id: null, company_id: null };
}

test("run: failed notification inserts mark the run unhealthy", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({
    clients: [dueClient("aaaa", 7), dueClient("bbbb", 0)],
    onInsert: () => new Response("boom", { status: 500 }),
  });
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /2 of 2 due reminder notification\(s\) failed/);
  assert.equal(h.lastDue, 2);
  assert.equal(h.lastFailed, 2);
  assert.equal(h.lastSent, 0);
  assert.equal(h.lastSuccessAt, null); // never succeeded
});

test("run: idempotent skips count separately and stay healthy", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({
    clients: [dueClient("aaaa", 1), dueClient("bbbb", 1)],
    markers: [{ recipient_id: "aaaa", type: "start_reminder_1" }],
  });
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunOk, true);
  assert.equal(h.lastError, null);
  assert.equal(h.lastDue, 2);
  assert.equal(h.lastSkipped, 1);
  assert.equal(h.lastSent, 1);
  assert.equal(h.lastFailed, 0);
  assert.ok(h.lastSuccessAt);
});

test("run: a failed Supabase GET marks the run failed (no silent empty)", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({
    onGet: table => (table === "user_profiles" ? new Response("err", { status: 503 }) : null),
  });
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /user_profiles.*503/);
});

test("health: a stale last run flips healthy=false even after a success", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({ clients: [] });
  await processReminders(); // healthy, fresh
  const fresh = getStartRemindersHealth();
  assert.equal(fresh.healthy, true);
  assert.equal(fresh.stale, false);
  // Same snapshot evaluated 2 hours later — the interval silently stopped.
  const later = new Date(Date.parse(fresh.lastRunAt!) + 2 * 60 * 60 * 1000);
  const staleView = getStartRemindersHealth(later);
  assert.equal(staleView.stale, true);
  assert.equal(staleView.healthy, false);
});

test("run: a missing service key is a FAILED run, not a silent no-op", async (t) => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = saved; });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /SUPABASE_SERVICE_ROLE_KEY missing/);
  assert.equal(h.healthy, false);
});

test("run: a malformed Supabase body is treated as failure (no silent empty)", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({
    onGet: table => (table === "user_profiles" ? new Response("not json", { status: 200 }) : null),
  });
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /malformed body/);
});

test("run: a zero-due run still updates the heartbeat", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockSupabase({ clients: [] });
  const before = getStartRemindersHealth().runs;
  await processReminders();
  const h = getStartRemindersHealth();
  assert.equal(h.runs, before + 1);
  assert.equal(h.lastRunOk, true);
  assert.equal(h.lastDue, 0);
  assert.ok(h.lastRunAt);
});
