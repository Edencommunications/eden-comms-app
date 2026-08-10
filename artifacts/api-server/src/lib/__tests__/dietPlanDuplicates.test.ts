// dietPlanDuplicates.test.ts — unit + run-level tests for the duplicate
// diet-plan row watcher (mocks global fetch for the Supabase host).
// Run with the api-server test script (esbuild bundle + node --test).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicateClientIds,
  getDietPlanDuplicatesHealth,
  checkDietPlanDuplicates,
} from "../dietPlanDuplicates";

// ---- findDuplicateClientIds ---------------------------------------------

test("findDuplicateClientIds: one row per client → no duplicates", () => {
  assert.deepEqual(
    findDuplicateClientIds([{ client_id: "a" }, { client_id: "b" }, { client_id: "c" }]),
    [],
  );
});

test("findDuplicateClientIds: flags every client with >1 row", () => {
  const dupes = findDuplicateClientIds([
    { client_id: "a" }, { client_id: "a" }, { client_id: "a" },
    { client_id: "b" },
    { client_id: "c" }, { client_id: "c" },
  ]);
  assert.deepEqual(dupes.sort(), ["a", "c"]);
});

test("findDuplicateClientIds: null/missing client_id rows are ignored", () => {
  assert.deepEqual(
    findDuplicateClientIds([{ client_id: null }, { client_id: null }, { client_id: "a" }]),
    [],
  );
});

// ---- health snapshot -----------------------------------------------------

test("health snapshot starts empty, healthy (startup grace), and is a copy", () => {
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.runs, 0);
  assert.equal(h.lastRunAt, null);
  assert.equal(h.healthy, true); // first run happens immediately at startup
  (h as any).runs = 99;
  assert.equal(getDietPlanDuplicatesHealth().runs, 0);
});

// ---- run-level tests (mocked Supabase fetch) ------------------------------
// Declared after the "starts empty" assertions; node:test runs a file's
// tests in declaration order.

const realFetch = globalThis.fetch;

function mockDietPlans(response: Response | (() => Response)) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!url.includes("supabase.co")) return realFetch(input, init);
    assert.match(url, /\/rest\/v1\/diet_plans\?select=client_id/);
    return typeof response === "function" ? response() : response;
  }) as typeof fetch;
}

// Serves the given full row set in Range-header pages, like PostgREST does.
function mockPagedDietPlans(allRows: Array<{ client_id: string | null }>, opts?: { failFrom?: number }) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!url.includes("supabase.co")) return realFetch(input, init);
    const range = String(init?.headers?.Range || "0-999");
    const [from, to] = range.split("-").map(Number);
    if (opts?.failFrom !== undefined && from >= opts.failFrom) {
      return new Response("err", { status: 500 });
    }
    return new Response(JSON.stringify(allRows.slice(from, to + 1)), { status: 200 });
  }) as typeof fetch;
}

test("run: zero duplicates → healthy heartbeat", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response(JSON.stringify([{ client_id: "a" }, { client_id: "b" }]), { status: 200 }));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, true);
  assert.equal(h.lastError, null);
  assert.equal(h.lastTotalRows, 2);
  assert.equal(h.lastDuplicateClients, 0);
  assert.equal(h.healthy, true);
  assert.ok(h.lastSuccessAt);
});

test("run: duplicates found → run succeeds but health is UNHEALTHY", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response(
    JSON.stringify([{ client_id: "a" }, { client_id: "a" }, { client_id: "b" }]),
    { status: 200 },
  ));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, true); // the check itself worked…
  assert.equal(h.lastDuplicateClients, 1);
  assert.deepEqual(h.duplicateClientIds, ["a"]);
  assert.equal(h.healthy, false); // …but duplicates flip /healthz to degraded
});

test("run: a later clean run recovers health", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response(JSON.stringify([{ client_id: "a" }, { client_id: "b" }]), { status: 200 }));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastDuplicateClients, 0);
  assert.deepEqual(h.duplicateClientIds, []);
  assert.equal(h.healthy, true);
});

test("run: duplicates hiding beyond the first 1,000-row page are still caught", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  // 1,500 rows: the first 1,000 are unique; the duplicate pair only appears
  // on the SECOND page. A single un-paginated GET would miss it entirely.
  const rows = Array.from({ length: 1500 }, (_, i) => ({ client_id: `client-${i}` }));
  rows.push({ client_id: "client-1200" }); // duplicate on page 2
  mockPagedDietPlans(rows);
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, true);
  assert.equal(h.lastTotalRows, 1501);
  assert.equal(h.lastDuplicateClients, 1);
  assert.deepEqual(h.duplicateClientIds, ["client-1200"]);
  assert.equal(h.healthy, false);
});

test("run: a failed LATER page fails the whole run (no partial 'no dupes')", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  const rows = Array.from({ length: 1500 }, (_, i) => ({ client_id: `client-${i}` }));
  mockPagedDietPlans(rows, { failFrom: 1000 });
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /HTTP 500 \(rows 1000\+\)/);
  assert.equal(h.healthy, false);
});

test("run: a failed Supabase GET marks the run failed (no silent 'no dupes')", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response("err", { status: 503 }));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /diet_plans.*503/);
  assert.equal(h.healthy, false);
});

test("run: a malformed body is treated as failure (never coerced to empty)", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response("not json", { status: 200 }));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /malformed body/);
});

test("run: a non-array body is treated as failure", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response(JSON.stringify({ oops: true }), { status: 200 }));
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /non-array body/);
});

test("run: a missing service key is a FAILED run, not a silent no-op", async (t) => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  t.after(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = saved; });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await checkDietPlanDuplicates();
  const h = getDietPlanDuplicatesHealth();
  assert.equal(h.lastRunOk, false);
  assert.match(String(h.lastError), /SUPABASE_SERVICE_ROLE_KEY missing/);
  assert.equal(h.healthy, false);
});

test("health: a stale last run flips healthy=false even after a success", async (t) => {
  t.after(() => { globalThis.fetch = realFetch; });
  mockDietPlans(new Response("[]", { status: 200 }));
  await checkDietPlanDuplicates(); // healthy, fresh
  const fresh = getDietPlanDuplicatesHealth();
  assert.equal(fresh.healthy, true);
  assert.equal(fresh.stale, false);
  // Same snapshot evaluated 2 hours later — the interval silently stopped.
  const later = new Date(Date.parse(fresh.lastRunAt!) + 2 * 60 * 60 * 1000);
  const staleView = getDietPlanDuplicatesHealth(later);
  assert.equal(staleView.stale, true);
  assert.equal(staleView.healthy, false);
});
