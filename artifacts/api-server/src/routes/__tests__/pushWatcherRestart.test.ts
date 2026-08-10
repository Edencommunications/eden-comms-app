// pushWatcherRestart.test.ts — verifies the push watcher (watchPass) can't
// double-ring the same huddle invite after a restart:
//   • rows sharing one created_at are never skipped OR re-delivered — the
//     durable cursor {ts, ids} tracks every processed id at that timestamp;
//   • a completed pass persists the cursor so a later pass (i.e. a restarted
//     server reading the same durable state) never re-pushes processed ids;
//   • a fresh lease held by ANOTHER live instance makes the pass skip
//     entirely (autoscale-safe: only one deliverer at a time);
//   • an expired lease from a dead instance does NOT block delivery.
// Run with:  pnpm --filter @workspace/api-server run test
//
// Supabase is mocked at the global-fetch level (including the CAS PATCH with
// value=eq. used to claim the lease); actual push delivery is captured via
// the __setSendForTests hook (never hits FCM/APNs).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WATCH_KEY = "push_watch_state";

let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];
let notifications: Array<{
  id: string; recipient_id: string; type: string; body: string;
  sender_name: string; created_at: string; is_read: boolean;
}> = [];

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;

    if (u.pathname === "/rest/v1/admin_settings") {
      if (method === "POST") {
        // upsert (on_conflict=company_id,key)
        const body = JSON.parse(String(init.body || "{}"));
        const i = adminSettings.findIndex(r => r.company_id === body.company_id && r.key === body.key);
        if (i >= 0) adminSettings[i] = { ...adminSettings[i], ...body };
        else adminSettings.push(body);
        return json([body], 201);
      }
      if (method === "PATCH") {
        // CAS: PATCH ...&key=eq.X&value=eq.<old raw value>
        const keyEq = String(q.get("key") || "").replace(/^eq\./, "");
        const valEq = q.get("value"); // URLSearchParams already decoded it
        const oldVal = valEq?.startsWith("eq.") ? valEq.slice(3) : null;
        const body = JSON.parse(String(init.body || "{}"));
        const matched: any[] = [];
        for (const r of adminSettings) {
          if (r.key === keyEq && (oldVal === null || r.value === oldVal)) {
            r.value = body.value;
            matched.push({ ...r });
          }
        }
        return json(matched, 200);
      }
      const keyEq = q.get("key");
      if (keyEq?.startsWith("eq.")) {
        const k = keyEq.slice(3);
        return json(adminSettings.filter(r => r.key === k));
      }
      return json(adminSettings);
    }

    if (u.pathname === "/rest/v1/notifications") {
      const idEq = String(q.get("id") || "");
      if (idEq.startsWith("eq.")) {
        const row = notifications.find(n => n.id === idEq.slice(3));
        return json(row ? [{ is_read: row.is_read }] : []);
      }
      const gte = String(q.get("created_at") || "");
      let rows = notifications.slice();
      if (gte.startsWith("gte.")) {
        const ts = gte.slice(4);
        rows = rows.filter(n => n.created_at >= ts); // ISO strings compare lexically
      }
      rows.sort((a, b) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 :
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      return json(rows.slice(0, 200).map(({ id, recipient_id, type, body, sender_name, created_at }) =>
        ({ id, recipient_id, type, body, sender_name, created_at })));
    }
    return json([], 200);
  }) as typeof fetch;
}

let sent: Array<{ endpoint: string; payload: any; ttl: number }> = [];
let mod: typeof import("../push");

const T0 = "2026-08-10T12:00:00.000+00:00";

function seedState(state: any) {
  adminSettings.push({ company_id: ORG, key: WATCH_KEY, value: JSON.stringify(state) });
}
function storedState(): any {
  const row = adminSettings.find(r => r.key === WATCH_KEY);
  return row ? JSON.parse(row.value) : null;
}
function huddleRow(id: string, created_at: string) {
  // is_read:true so the ring re-buzz timers (1/2ms in tests) no-op instantly —
  // this file tests the WATCHER's first ring, not the re-buzz loop.
  return { id, recipient_id: USER, type: "huddle_invite", body: "", sender_name: "Sarah", created_at, is_read: true };
}

before(async () => {
  mockSupabase();
  mod = await import("../push");
  mod.__setSendForTests(async (sub: any, payload: string, opts: any) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), ttl: opts.TTL });
  });
  mod.__setRingRepushDelaysForTests([1, 2]);
});
after(() => {
  globalThis.fetch = realFetch;
  mod.__setSendForTests(null);
  mod.__setRingRepushDelaysForTests(null);
});
beforeEach(() => {
  adminSettings = [];
  notifications = [];
  sent = [];
  adminSettings.push({
    company_id: ORG,
    key: `push_sub:${USER}`,
    value: JSON.stringify({
      enabled: true,
      subs: [{ endpoint: "https://fcm.googleapis.com/fcm/send/device-a", keys: { p256dh: "pk", auth: "au" } }],
    }),
  });
});

// ── (1) first boot: state row is created, nothing delivered yet ──
test("first pass with no durable state initializes it and delivers nothing", async () => {
  notifications.push(huddleRow("n-old", "2026-08-10T11:00:00.000+00:00"));
  await mod.watchPass();
  assert.equal(sent.length, 0, "initialization pass must not deliver");
  const st = storedState();
  assert.ok(st && typeof st.ts === "string", "durable cursor row must exist after first pass");
});

// ── (2) rows sharing one created_at: none skipped, none re-delivered ──
test("rows sharing one created_at are all delivered once and never re-delivered", async () => {
  seedState({ ts: T0, ids: [] });
  const SAME = "2026-08-10T12:00:05.000+00:00";
  notifications.push(huddleRow("n-a", SAME), huddleRow("n-b", SAME), huddleRow("n-c", SAME));

  await mod.watchPass();
  assert.equal(sent.length, 3, "every row at the shared timestamp must ring exactly once");

  const st = storedState();
  assert.equal(st.ts, SAME);
  assert.deepEqual([...st.ids].sort(), ["n-a", "n-b", "n-c"], "all processed ids at the cursor ts must be recorded");
  assert.equal(st.lease, undefined, "lease must be released after a completed pass");

  // Same durable state, next pass (or a restarted instance): no double ring.
  sent = [];
  await mod.watchPass();
  assert.equal(sent.length, 0, "completed pass must never re-push processed ids");

  // A NEW row arriving at the very same timestamp is still delivered.
  notifications.push(huddleRow("n-d", SAME));
  await mod.watchPass();
  assert.equal(sent.length, 1, "a late row sharing the cursor timestamp must not be skipped");
  assert.deepEqual([...storedState().ids].sort(), ["n-a", "n-b", "n-c", "n-d"]);
});

// ── (3) restart simulation: completed pass → re-run never double-rings ──
test("after a completed pass, a restart never re-rings the same huddle invite", async () => {
  seedState({ ts: T0, ids: [] });
  notifications.push(
    huddleRow("n-1", "2026-08-10T12:00:01.000+00:00"),
    huddleRow("n-2", "2026-08-10T12:00:02.000+00:00"),
  );
  await mod.watchPass();
  assert.equal(sent.length, 2);

  // "Restart": in-memory state is irrelevant — only the durable row survives.
  // Run three more passes against that same durable state.
  sent = [];
  await mod.watchPass();
  await mod.watchPass();
  await mod.watchPass();
  assert.equal(sent.length, 0, "restarted watcher must never double-ring delivered invites");

  // But genuinely new rows after the cursor still deliver.
  notifications.push(huddleRow("n-3", "2026-08-10T12:00:03.000+00:00"));
  await mod.watchPass();
  assert.equal(sent.length, 1);
});

// ── (4) lease held by another LIVE instance → pass skips entirely ──
test("a fresh lease held by another instance makes the pass skip", async () => {
  seedState({ ts: T0, ids: [], lease: new Date().toISOString(), holder: "some-other-instance" });
  notifications.push(huddleRow("n-x", "2026-08-10T12:00:09.000+00:00"));
  await mod.watchPass();
  assert.equal(sent.length, 0, "must not deliver while another live instance holds the lease");
  const st = storedState();
  assert.equal(st.holder, "some-other-instance", "must not steal a live lease");
  assert.deepEqual(st.ids, [], "cursor must be untouched when skipping");
});

// ── (5) expired lease from a dead instance does NOT block delivery ──
test("an expired lease (dead instance) is taken over and rows are delivered", async () => {
  const stale = new Date(Date.now() - 5 * 60_000).toISOString(); // > 90s old
  seedState({ ts: T0, ids: [], lease: stale, holder: "dead-instance" });
  notifications.push(huddleRow("n-y", "2026-08-10T12:00:09.000+00:00"));
  await mod.watchPass();
  assert.equal(sent.length, 1, "a dead instance's stale lease must not block delivery");
  const st = storedState();
  assert.equal(st.lease, undefined, "lease released after the completed pass");
  assert.deepEqual(st.ids, ["n-y"]);
});

// ── (6) losing the CAS race → no delivery, no cursor damage ──
test("losing the CAS claim (state changed underneath) delivers nothing", async () => {
  seedState({ ts: T0, ids: [] });
  notifications.push(huddleRow("n-z", "2026-08-10T12:00:09.000+00:00"));
  // Sabotage: make the stored value change between the read and the PATCH by
  // intercepting the CAS PATCH and mutating the row first.
  const cur = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = String(init?.method || "GET").toUpperCase();
    if (method === "PATCH" && url.includes("admin_settings")) {
      const row = adminSettings.find(r => r.key === WATCH_KEY)!;
      row.value = JSON.stringify({ ...JSON.parse(row.value), lease: new Date().toISOString(), holder: "racer" });
    }
    return cur(input, init);
  }) as typeof fetch;
  try {
    await mod.watchPass();
  } finally {
    globalThis.fetch = cur;
  }
  assert.equal(sent.length, 0, "a lost CAS race must deliver nothing");
  assert.equal(storedState().holder, "racer", "the winning claimant's state must be intact");
});
