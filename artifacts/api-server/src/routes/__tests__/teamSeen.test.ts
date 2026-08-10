// teamSeen.test.ts — cross-device read-state sync for Team Hub chat.
// Run with:  npx tsx --test src/routes/__tests__/teamSeen.test.ts
//
// Supabase is mocked at the global-fetch level (in-memory admin_settings
// store), so the real route handlers run end-to-end over HTTP — including
// the compare-and-swap retry loop under concurrent writes.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const COACH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COACH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DM_KEY = [COACH_A, COACH_B].sort().join("_");

const tokens: Record<string, string> = {
  "tok-a": "a@x.co",
  "tok-b": "b@x.co",
  "tok-client": "client@x.co",
};
const profiles: Record<string, any> = {
  "a@x.co": { id: COACH_A, role: "coach", company_id: ORG },
  "b@x.co": { id: COACH_B, role: "coach", company_id: ORG },
  "client@x.co": { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "client", company_id: ORG },
};

// In-memory admin_settings store
let adminSettings: Array<{ company_id: string; key: string; value: string; updated_at: string | null }> = [];
let stampCounter = 0;

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (u.pathname === "/auth/v1/user") {
      const tok = String(init.headers?.Authorization || "").replace("Bearer ", "");
      const email = tokens[tok];
      return email ? json({ email }) : json({ error: "bad token" }, 401);
    }

    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;

    if (u.pathname === "/rest/v1/user_profiles") {
      const email = decodeURIComponent(String(q.get("email") || "").replace("eq.", ""));
      const p = profiles[email];
      return json(p ? [p] : []);
    }

    if (u.pathname === "/rest/v1/admin_settings") {
      const keyFilter = q.get("key") ? decodeURIComponent(q.get("key")!.replace("eq.", "")) : null;
      // Yield so two in-flight requests interleave between read and write —
      // this is what forces the CAS retry path in the concurrency test.
      await new Promise((r) => setImmediate(r));

      if (method === "GET") {
        return json(adminSettings.filter((r) => !keyFilter || r.key === keyFilter));
      }
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        if (adminSettings.some((r) => r.company_id === body.company_id && r.key === body.key)) {
          return json({ error: "duplicate key" }, 409);
        }
        adminSettings.push({ ...body, updated_at: `stamp-${++stampCounter}` });
        return json([body], 201);
      }
      if (method === "PATCH") {
        const guard = q.get("updated_at"); // "eq.<stamp>" or "is.null"
        const body = JSON.parse(String(init.body || "{}"));
        const hits = adminSettings.filter((r) => {
          if (keyFilter && r.key !== keyFilter) return false;
          if (guard === "is.null") return r.updated_at === null;
          if (guard?.startsWith("eq.")) return r.updated_at === decodeURIComponent(guard.slice(3));
          return true;
        });
        for (const r of hits) { r.value = body.value; r.updated_at = `stamp-${++stampCounter}`; }
        return json(hits.map((r) => ({ key: r.key })));
      }
    }
    return json({ error: `unmocked ${method} ${u.pathname}` }, 500);
  }) as typeof fetch;
}

let server: http.Server;
let base = "";

before(async () => {
  mockSupabase();
  const { default: teamSeenRouter } = await import("../teamSeen");
  const app = express();
  app.use(express.json());
  app.use(teamSeenRouter);
  await new Promise<void>((res) => { server = app.listen(0, () => res()); });
  base = `http://localhost:${(server.address() as any).port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; });
beforeEach(() => { adminSettings = []; });

const post = (tok: string, seen: any) =>
  realFetch(`${base}/team/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: JSON.stringify({ seen }),
  });
const get = (tok: string) =>
  realFetch(`${base}/team/seen`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });

const DBA_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CHAN_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DBA_KEY = `dba:${DBA_ID}:${CHAN_ID}`;

test("requires auth", async () => {
  assert.equal((await get("")).status, 401);
  assert.equal((await post("", { general: 1000 })).status, 401);
});

test("clients can sync ONLY dba:* keys — Team Hub keys are dropped", async () => {
  const r = await post("tok-client", { general: 1000, [DM_KEY]: 2000, [DBA_KEY]: 3000 });
  assert.equal(r.status, 200);
  const b: any = await (await get("tok-client")).json();
  assert.deepEqual(b.seen, { [DBA_KEY]: 3000 });
});

test("staff can mix Team Hub and DBA keys in one map", async () => {
  await post("tok-a", { general: 1000, [DBA_KEY]: 3000 });
  const b: any = await (await get("tok-a")).json();
  assert.deepEqual(b.seen, { general: 1000, [DBA_KEY]: 3000 });
});

test("dba keys get the same per-key max merge (no rollback)", async () => {
  await post("tok-client", { [DBA_KEY]: 5000 });
  await post("tok-client", { [DBA_KEY]: 1000 }); // stale device — ignored
  const b: any = await (await get("tok-client")).json();
  assert.equal(b.seen[DBA_KEY], 5000);
});

test("malformed dba keys are dropped", async () => {
  await post("tok-a", { "dba:nope:really": 1000, [`dba:${DBA_ID}`]: 2000, [`dba:${DBA_ID}:${CHAN_ID}:x`]: 3000 });
  const b: any = await (await get("tok-a")).json();
  assert.deepEqual(b.seen, {});
});

test("round-trips a seen map and sanitizes bad input", async () => {
  const future = Date.now() + 86_400_000;
  const r = await post("tok-a", {
    general: 1000, [DM_KEY]: 2000,
    "not a key": 3000, general2: 4000, [DM_KEY]: 2000, // invalid keys dropped
    ...( { "evil": future } as any ),
  });
  assert.equal(r.status, 200);
  const b: any = await (await get("tok-a")).json();
  assert.deepEqual(b.seen, { general: 1000, [DM_KEY]: 2000 });
});

test("rejects future timestamps and non-numbers", async () => {
  await post("tok-a", { general: Date.now() + 86_400_000 });
  await post("tok-a", { general: "soon", [DM_KEY]: -5 });
  const b: any = await (await get("tok-a")).json();
  assert.deepEqual(b.seen, {});
});

test("stale device can never roll read state backwards", async () => {
  await post("tok-a", { general: 5000 });
  await post("tok-a", { general: 1000 }); // older — must be ignored
  const b: any = await (await get("tok-a")).json();
  assert.equal(b.seen.general, 5000);
});

test("concurrent writes from two devices both survive (CAS merge)", async () => {
  await post("tok-a", { general: 100 }); // seed the row
  // Device 1 marks the DM, device 2 bumps general — racing full round-trips
  const [r1, r2] = await Promise.all([
    post("tok-a", { [DM_KEY]: 7000 }),
    post("tok-a", { general: 9000 }),
  ]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  const b: any = await (await get("tok-a")).json();
  assert.equal(b.seen.general, 9000, "general bump must not be lost");
  assert.equal(b.seen[DM_KEY], 7000, "DM read must not be lost");
});

test("concurrent first writes (insert race) both survive", async () => {
  const [r1, r2] = await Promise.all([
    post("tok-a", { general: 1234 }),
    post("tok-a", { [DM_KEY]: 5678 }),
  ]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  const b: any = await (await get("tok-a")).json();
  assert.deepEqual(b.seen, { general: 1234, [DM_KEY]: 5678 });
});

test("users are isolated — each reads and writes only their own row", async () => {
  await post("tok-a", { general: 1111 });
  await post("tok-b", { general: 2222 });
  const a: any = await (await get("tok-a")).json();
  const bb: any = await (await get("tok-b")).json();
  assert.equal(a.seen.general, 1111);
  assert.equal(bb.seen.general, 2222);
  assert.equal(adminSettings.length, 2);
  assert.ok(adminSettings.some((r) => r.key === `teamhub_seen:${COACH_A}`));
  assert.ok(adminSettings.some((r) => r.key === `teamhub_seen:${COACH_B}`));
});
