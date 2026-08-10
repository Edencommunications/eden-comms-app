// huddleRing.test.ts — verifies huddle "ring" pushes behave like a phone call:
//   • huddle_invite/huddle_ping carry the app-built body (PASSTHROUGH) under
//     the title '🎙 Live huddle — you're invited' — never the generic fallback;
//   • payloads carry urgent:true + tag 'huddle-ring' with a short TTL (90s);
//   • scheduleRingRepush re-buzzes only while the notification row is still
//     is_read=false (max 2 re-buzzes) and stops once answered/read;
//   • ordinary types get none of the ring behavior.
// Run with:  pnpm --filter @workspace/api-server run test
//
// Supabase is mocked at the global-fetch level; actual push delivery is
// captured via the __setSendForTests hook (never hits FCM/APNs).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];
// notifications rows the mock serves for the re-buzz is_read check
let notifications: Record<string, { id: string; is_read: boolean }> = {};

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
        const body = JSON.parse(String(init.body || "{}"));
        const i = adminSettings.findIndex(r => r.company_id === body.company_id && r.key === body.key);
        if (i >= 0) adminSettings[i] = { ...adminSettings[i], ...body };
        else adminSettings.push(body);
        return json([body], 201);
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
        const row = notifications[idEq.slice(3)];
        return json(row ? [{ is_read: row.is_read }] : []);
      }
      return json([]);
    }
    return json([], 200);
  }) as typeof fetch;
}

let sent: Array<{ endpoint: string; payload: any; ttl: number }> = [];
let mod: typeof import("../push");

before(async () => {
  mockSupabase();
  mod = await import("../push");
  mod.__setSendForTests(async (sub, payload, opts) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload), ttl: opts.TTL });
  });
  // Fast re-buzz schedule so tests finish in ~100ms instead of 45s
  mod.__setRingRepushDelaysForTests([20, 40]);
});
after(() => {
  globalThis.fetch = realFetch;
  mod.__setSendForTests(null);
  mod.__setRingRepushDelaysForTests(null);
});
beforeEach(() => {
  adminSettings = [];
  notifications = {};
  sent = [];
  // A subscribed, push-enabled user (stored the same way /push/subscribe does)
  adminSettings.push({
    company_id: ORG,
    key: `push_sub:${USER}`,
    value: JSON.stringify({
      enabled: true,
      subs: [{ endpoint: "https://fcm.googleapis.com/fcm/send/device-a", keys: { p256dh: "pk", auth: "au" } }],
    }),
  });
  // A pre-existing VAPID row so getVapid() never tries to persist fresh keys
  // mid-test (the module caches after first load anyway).
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── (1) Ring pushes carry a specific huddle body, never the generic fallback ──
// The body is built SERVER-SIDE from the sender's name (never trusted from the
// stored row — a bad row could put private text on a lock screen).
test("huddle_invite/huddle_ping get a server-built huddle body with the ring title", () => {
  for (const type of ["huddle_invite", "huddle_ping"]) {
    const c = mod.buildPushContent({ type, body: "private text that must never surface", sender_name: "Sarah" });
    assert.equal(c.title, "🎙 Live huddle — you're invited", `${type} must never use the generic title`);
    assert.equal(c.body, "🎙 Sarah is inviting you to a live huddle — hit Join to jump in.");
    assert.ok(!c.body.includes("private text"), "stored row body must never reach the lock screen");
    assert.equal(c.url, "/?goto=team");
    // Never the generic fallbacks
    assert.notEqual(c.title, "🔔 Notification");
    assert.ok(!c.body.includes("You have a new update"));
  }
  // Both ring types are recognized as rings; ordinary types are not
  assert.ok(mod.isRingType("huddle_invite"));
  assert.ok(mod.isRingType("huddle_ping"));
  assert.equal(mod.isRingType("message"), false);
  assert.equal(mod.isRingType("broadcast"), false);
});

test("a huddle row with no sender name still gets a topical line, not silence", () => {
  const c = mod.buildPushContent({ type: "huddle_invite", body: "" });
  assert.equal(c.title, "🎙 Live huddle — you're invited");
  assert.equal(c.body, "🎙 A teammate is inviting you to a live huddle — hit Join to jump in.");
});

// ── (2) urgent flag + huddle-ring tag + short TTL ──────────────
test("ring payloads carry urgent:true, tag 'huddle-ring', and 90s TTL", async () => {
  await mod.pushToUser(USER, "🎙 Live huddle — you're invited", "Sarah is inviting you", "huddle_invite", "/?goto=team");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.urgent, true);
  assert.equal(sent[0].payload.tag, "huddle-ring");
  assert.equal(sent[0].ttl, 90);

  sent = [];
  await mod.pushToUser(USER, "🎙 Live huddle — you're invited", "Sarah pinged you", "huddle_ping", "/?goto=team");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.urgent, true);
  assert.equal(sent[0].payload.tag, "huddle-ring");
  assert.equal(sent[0].ttl, 90);
});

// ── (4) Non-huddle types get no ring behavior ──────────────────
test("non-huddle pushes have no urgent flag, no ring tag, and the long TTL", async () => {
  await mod.pushToUser(USER, "💬 New message", "Coach sent you a message", "message", "/?goto=msgs");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.urgent, undefined);
  assert.equal(sent[0].payload.tag, undefined);
  assert.equal(sent[0].ttl, 3600);
});

// ── (3) Re-buzz only while unread; stops once read; max 2 ──────
test("scheduleRingRepush re-buzzes twice while the invite stays unread", async () => {
  const n = { id: "n-1", recipient_id: USER, type: "huddle_invite" };
  notifications["n-1"] = { id: "n-1", is_read: false };
  mod.scheduleRingRepush(n, "🎙 Live huddle — you're invited", "Sarah is inviting you", "/?goto=team");
  await sleep(120); // both injected delays (20/40ms) elapse
  assert.equal(sent.length, 2, "exactly two re-buzzes, no more");
  for (const s of sent) {
    assert.equal(s.payload.urgent, true);
    assert.equal(s.payload.tag, "huddle-ring"); // same tag → replaces, never stacks
    assert.equal(s.ttl, 90);
    assert.equal(s.payload.title, "🎙 Live huddle — you're invited");
    assert.equal(s.payload.body, "Sarah is inviting you");
  }
});

test("re-buzzing STOPS once the notification is marked read (answered)", async () => {
  const n = { id: "n-2", recipient_id: USER, type: "huddle_invite" };
  notifications["n-2"] = { id: "n-2", is_read: false };
  mod.scheduleRingRepush(n, "🎙 Live huddle — you're invited", "Sarah is inviting you", "/?goto=team");
  await sleep(30); // first re-buzz (20ms) fires while unread
  assert.equal(sent.length, 1);
  notifications["n-2"].is_read = true; // user answers the huddle
  await sleep(60); // second re-buzz window (40ms) passes
  assert.equal(sent.length, 1, "no re-buzz after the invite was answered");
});

test("already-read invite never re-buzzes at all", async () => {
  const n = { id: "n-3", recipient_id: USER, type: "huddle_invite" };
  notifications["n-3"] = { id: "n-3", is_read: true };
  mod.scheduleRingRepush(n, "🎙 Live huddle — you're invited", "Sarah is inviting you", "/?goto=team");
  await sleep(120);
  assert.equal(sent.length, 0);
});

test("a deleted notification row (huddle cleaned up) never re-buzzes", async () => {
  const n = { id: "n-gone", recipient_id: USER, type: "huddle_ping" };
  // no notifications row at all
  mod.scheduleRingRepush(n, "🎙 Live huddle — you're invited", "Sarah pinged you", "/?goto=team");
  await sleep(120);
  assert.equal(sent.length, 0);
});
