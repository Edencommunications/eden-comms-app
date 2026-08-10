// pushNudge.test.ts — the "Turn on phone notifications" nudge dismissal is
// server-side (admin_settings push_sub:<userId>.nudgeDismissed) so it sticks
// across every device. These tests guard that contract:
//   • GET /push/prefs reports nudgeDismissed:true once set — and also when
//     push is enabled (enabling anywhere counts as "seen the nudge").
//   • POST /push/prefs with nudgeDismissed:true persists it; false/garbage
//     values are ignored (one-way flag — no way to "un-see" the nudge).
//   • POST /push/subscribe sets nudgeDismissed:true.
// Run with:  pnpm --filter @workspace/api-server run test
//
// Supabase is mocked at the global-fetch level (same harness as pushToggle).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const tokens: Record<string, string> = { "tok-user": "nudge@x.co" };
const profiles: Record<string, any> = {
  "nudge@x.co": { id: USER, role: "client", company_id: ORG },
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

before(async () => {
  mockSupabase();
  const mod = await import("../push");
  mod.__setSendForTests(async () => {}); // never hit real push services
  const app = express();
  app.use(express.json());
  app.use(mod.default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; });
beforeEach(() => { adminSettings = []; });

async function api(path: string, opts: any = {}) {
  const r = await realFetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok-user", ...(opts.headers || {}) },
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}

function storedCfg(): any {
  const row = adminSettings.find(r => r.key === `push_sub:${USER}`);
  return row ? JSON.parse(row.value) : null;
}

const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/device-n", keys: { p256dh: "pkN", auth: "authN" } };

test("fresh user: nudge not dismissed", async () => {
  const r = await api("/push/prefs");
  assert.equal(r.status, 200);
  assert.equal(r.body.nudgeDismissed, false);
});

test("POST /push/prefs nudgeDismissed:true persists and GET reflects it (cross-device)", async () => {
  let r = await api("/push/prefs", { method: "POST", body: JSON.stringify({ nudgeDismissed: true }) });
  assert.equal(r.status, 200);
  assert.equal(storedCfg()?.nudgeDismissed, true); // persisted server-side, not device-local

  // Any other device fetching prefs sees the dismissal
  r = await api("/push/prefs");
  assert.equal(r.body.nudgeDismissed, true);
  assert.equal(r.body.enabled, false); // dismissing the nudge does NOT enable push
});

test("nudge dismissal is one-way: false and garbage values are ignored", async () => {
  await api("/push/prefs", { method: "POST", body: JSON.stringify({ nudgeDismissed: true }) });

  for (const bad of [false, "false", 0, null, "yes", 1, {}, []]) {
    const r = await api("/push/prefs", { method: "POST", body: JSON.stringify({ nudgeDismissed: bad }) });
    assert.equal(r.status, 200);
    assert.equal(storedCfg()?.nudgeDismissed, true, `value ${JSON.stringify(bad)} must not clear the flag`);
  }
  const r = await api("/push/prefs");
  assert.equal(r.body.nudgeDismissed, true);
});

test("garbage nudgeDismissed on a fresh user never sets the flag", async () => {
  for (const bad of ["true", 1, {}, [true]]) {
    await api("/push/prefs", { method: "POST", body: JSON.stringify({ nudgeDismissed: bad }) });
    assert.notEqual(storedCfg()?.nudgeDismissed, true, `value ${JSON.stringify(bad)} must not set the flag`);
  }
  const r = await api("/push/prefs");
  assert.equal(r.body.nudgeDismissed, false);
});

test("POST /push/subscribe marks the nudge dismissed everywhere", async () => {
  const r = await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: SUB }) });
  assert.equal(r.status, 200);
  assert.equal(storedCfg()?.nudgeDismissed, true);

  const g = await api("/push/prefs");
  assert.equal(g.body.nudgeDismissed, true);
  assert.equal(g.body.enabled, true);
});

test("push enabled counts as dismissed even without the stored flag (legacy rows)", async () => {
  // Simulate a pre-existing row from before the nudge flag existed
  adminSettings.push({
    company_id: ORG,
    key: `push_sub:${USER}`,
    value: JSON.stringify({ enabled: true, subs: [{ endpoint: SUB.endpoint, keys: SUB.keys }] }),
  });
  const r = await api("/push/prefs");
  assert.equal(r.body.nudgeDismissed, true);
});

test("dismissal survives unrelated prefs updates (toggle off, category changes)", async () => {
  await api("/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: SUB }) });
  await api("/push/prefs", { method: "POST", body: JSON.stringify({ enabled: false, cats: { messages: false } }) });
  assert.equal(storedCfg()?.nudgeDismissed, true);
  // Disabled push + stored dismissal ⇒ still no nudge on any device
  const r = await api("/push/prefs");
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.nudgeDismissed, true);
});
