// pushToggle.test.ts — verifies the phone-notification toggle cycle:
// OFF must stop pushes to every device, ON must resume them, and
// per-device unsubscribe must drop just that endpoint.
// Run with:  pnpm --filter @workspace/api-server run test
//
// Supabase is mocked at the global-fetch level; actual push delivery is
// captured via the __setSendForTests hook (never hits FCM/APNs).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const tokens: Record<string, string> = { "tok-user": "user@x.co" };
const profiles: Record<string, any> = {
  "user@x.co": { id: USER, role: "client", company_id: ORG },
};

let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];

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
      const email = String(q.get("email") || "").replace("eq.", "");
      const p = profiles[email];
      return json(p ? [p] : []);
    }
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
    return json([], 200);
  }) as typeof fetch;
}

let server: http.Server; let base = "";
let sent: Array<{ endpoint: string; payload: any }> = [];
let pushToUser: (userId: string, title: string, body: string, type?: string, url?: string) => Promise<void>;

before(async () => {
  mockSupabase();
  const mod = await import("../push");
  mod.__setSendForTests(async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });
  pushToUser = mod.pushToUser;
  const app = express();
  app.use(express.json());
  app.use(mod.default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; });
beforeEach(() => { adminSettings = []; sent = []; });

async function api(path: string, opts: any = {}) {
  const r = await realFetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok-user", ...(opts.headers || {}) },
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

const SUB_A = { endpoint: "https://fcm.googleapis.com/fcm/send/device-a", keys: { p256dh: "pkA", auth: "authA" } };
const SUB_B = { endpoint: "https://web.push.apple.com/device-b", keys: { p256dh: "pkB", auth: "authB" } };

async function subscribeBoth() {
  let r = await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: SUB_A }) });
  assert.equal(r.status, 200);
  r = await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: SUB_B }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.devices, 2);
}

test("toggle OFF stops pushes to ALL devices; toggle ON resumes them", async () => {
  await subscribeBoth();

  // Baseline: enabled → both devices buzz
  await pushToUser(USER, "💬 New message", "Coach sent you a message", "message");
  assert.equal(sent.length, 2);

  // Toggle OFF (what disablePush() in Notifications.jsx sends)
  sent.length = 0;
  let r = await api("/push/prefs", { method: "POST", body: JSON.stringify({ enabled: false }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.devices, 2); // devices kept, just silenced

  await pushToUser(USER, "💬 New message", "Coach sent you a message", "message");
  assert.equal(sent.length, 0); // NOTHING delivered while off

  // Even always-deliver types (huddle rings) respect the master switch
  await pushToUser(USER, "📞 Incoming call", "Coach is calling", "huddle_invite");
  assert.equal(sent.length, 0);

  // Toggle back ON → pushes resume to both stored devices
  r = await api("/push/prefs", { method: "POST", body: JSON.stringify({ enabled: true }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.enabled, true);

  await pushToUser(USER, "💬 New message", "Coach sent you a message", "message");
  assert.equal(sent.length, 2);
  assert.deepEqual(sent.map(s => s.endpoint).sort(), [SUB_A.endpoint, SUB_B.endpoint].sort());
});

test("re-subscribing after OFF (the enablePush() path) also turns pushes back on", async () => {
  await subscribeBoth();
  await api("/push/prefs", { method: "POST", body: JSON.stringify({ enabled: false }) });
  await pushToUser(USER, "t", "b", "message");
  assert.equal(sent.length, 0);

  // enablePush() re-subscribes the current device rather than posting prefs
  const r = await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: SUB_A }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.devices, 2); // deduped, not a third device

  await pushToUser(USER, "t", "b", "message");
  assert.equal(sent.length, 2);
});

test("GET /push/prefs reflects the toggle state the UI renders", async () => {
  await subscribeBoth();
  let r = await api("/push/prefs");
  assert.equal(r.body.enabled, true);
  await api("/push/prefs", { method: "POST", body: JSON.stringify({ enabled: false }) });
  r = await api("/push/prefs");
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.devices, 2);
});

test("per-device unsubscribe removes only that endpoint", async () => {
  await subscribeBoth();
  const r = await api("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: SUB_A.endpoint }) });
  assert.equal(r.status, 200);
  assert.equal(r.body.devices, 1);
  await pushToUser(USER, "t", "b", "message");
  assert.deepEqual(sent.map(s => s.endpoint), [SUB_B.endpoint]);
});

test("category switch off silences that type but not others", async () => {
  await subscribeBoth();
  let r = await api("/push/prefs", { method: "POST", body: JSON.stringify({ cats: { messages: false } }) });
  assert.equal(r.body.cats.messages, false);
  await pushToUser(USER, "t", "b", "message");
  assert.equal(sent.length, 0);
  await pushToUser(USER, "t", "b", "checkin_received");
  assert.equal(sent.length, 2);
});
