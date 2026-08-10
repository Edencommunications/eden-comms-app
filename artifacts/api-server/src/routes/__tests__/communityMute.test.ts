// communityMute.test.ts — focused tests for the per-community mute feature.
// Run with:  npx tsx --test src/routes/__tests__/communityMute.test.ts
//
// Supabase is mocked at the global-fetch level (all calls to the Supabase
// host are intercepted and served from an in-memory store), so these tests
// exercise the real route handlers end-to-end over HTTP.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const COMM = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222"; // client, member
const MUTED = "33333333-3333-3333-3333-333333333333";  // client, member, muted
const OUTSIDER = "44444444-4444-4444-4444-444444444444"; // client, NOT a member
const MSG_ID = "55555555-5555-5555-5555-555555555555";   // fresh message by MEMBER mentioning @Muted
const DBA_ID = "66666666-6666-6666-6666-666666666666";   // DBA whose channel is COMM (for the DBA webhook test)

// token → email; email → profile
const tokens: Record<string, string> = {
  "tok-member": "member@x.co",
  "tok-muted": "muted@x.co",
  "tok-outsider": "outsider@x.co",
};
const profiles: Record<string, any> = {
  "member@x.co": { id: MEMBER, role: "client", company_id: ORG },
  "muted@x.co": { id: MUTED, role: "client", company_id: ORG },
  "outsider@x.co": { id: OUTSIDER, role: "client", company_id: ORG },
};

// In-memory Supabase state
let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];
let notifications: any[] = [];
const communityMembers = [
  { community_id: COMM, user_id: MEMBER, user_name: "Member One" },
  { community_id: COMM, user_id: MUTED, user_name: "Muted Two" },
];

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    // Auth: token → user
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
    if (u.pathname === "/rest/v1/communities") {
      const id = String(q.get("id") || "").replace("eq.", "");
      return json(id === COMM ? [{ id: COMM, name: "Busy Chat", company_id: ORG }] : []);
    }
    if (u.pathname === "/rest/v1/community_members") {
      const uid = q.get("user_id");
      if (uid) {
        const id = uid.replace("eq.", "");
        return json(communityMembers.filter(m => m.user_id === id).map(m => ({ user_id: m.user_id })));
      }
      return json(communityMembers);
    }
    if (u.pathname === "/rest/v1/admin_settings") {
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        const i = adminSettings.findIndex(r => r.company_id === body.company_id && r.key === body.key);
        if (i >= 0) {
          if (q.get("on_conflict")) adminSettings[i] = { ...adminSettings[i], ...body };
          else return json({ error: "duplicate key" }, 409);
        } else adminSettings.push(body);
        return json([body], 201);
      }
      // GET with key filters
      const keyEq = q.get("key");
      if (keyEq?.startsWith("eq.")) {
        const k = keyEq.slice(3);
        return json(adminSettings.filter(r => r.key === k));
      }
      if (keyEq?.startsWith("like.")) {
        const pat = keyEq.slice(5);
        const prefix = pat.endsWith("*") ? pat.slice(0, -1) : pat;
        return json(adminSettings.filter(r => r.key.startsWith(prefix)));
      }
      return json(adminSettings);
    }
    if (u.pathname === "/rest/v1/community_messages") {
      const id = String(q.get("id") || "").replace("eq.", "");
      if (id === MSG_ID) {
        return json([{
          id: MSG_ID, sender_id: MEMBER, sender_name: "Member One",
          content: "@Muted hello there", created_at: new Date().toISOString(), deleted_at: null,
        }]);
      }
      return json([]);
    }
    if (u.pathname === "/rest/v1/notifications") {
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "[]"));
        notifications.push(...(Array.isArray(body) ? body : [body]));
        return json(body, 201);
      }
      return json([]);
    }
    return json([], 200);
  }) as typeof fetch;
}

let server: http.Server; let base = "";
before(async () => {
  mockSupabase();
  const { default: router, notifyCommunityMembers } = await import("../communityPost");
  (globalThis as any).__notify = notifyCommunityMembers;
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; });
beforeEach(() => { adminSettings = []; notifications = []; });

async function api(path: string, opts: any = {}) {
  const r = await realFetch(`${base}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const auth = (tok: string) => ({ Authorization: `Bearer ${tok}` });

test("mute then unmute round-trips through GET", async () => {
  let r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.status, 200); assert.equal(r.body.muted, false);

  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-member"), body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 200); assert.equal(r.body.muted, true);
  r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.body.muted, true);

  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-member"), body: JSON.stringify({ muted: false }) });
  assert.equal(r.status, 200); assert.equal(r.body.muted, false);
  r = await api(`/communities/${COMM}/mute`, { headers: auth("tok-member") });
  assert.equal(r.body.muted, false);
});

test("unauthenticated and non-member callers are rejected", async () => {
  let r = await api(`/communities/${COMM}/mute`, { method: "POST", body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 401);
  r = await api(`/communities/${COMM}/mute`, { method: "POST", headers: auth("tok-outsider"), body: JSON.stringify({ muted: true }) });
  assert.equal(r.status, 403);
});

test("notifyCommunityMembers skips muted members (webhook/recap path)", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  await (globalThis as any).__notify(COMM, "Busy Chat", null);
  const recipients = notifications.map(n => n.recipient_id).sort();
  assert.deepEqual(recipients, [MEMBER]); // muted member excluded, other member buzzed
});

test("notify-post creates a mention ping for an unmuted mentioned member", async () => {
  const r = await api(`/communities/${COMM}/notify-post`, {
    method: "POST", headers: auth("tok-member"), body: JSON.stringify({ message_id: MSG_ID }),
  });
  assert.equal(r.status, 200);
  const mentionRows = notifications.filter(n => n.type === "mention");
  assert.deepEqual(mentionRows.map(n => n.recipient_id), [MUTED]);
});

test("notify-post sends NO mention ping to a muted mentioned member", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  const r = await api(`/communities/${COMM}/notify-post`, {
    method: "POST", headers: auth("tok-member"), body: JSON.stringify({ message_id: MSG_ID }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.filter(n => n.recipient_id === MUTED), []);
});

// ── Full webhook paths (Zapier/recap posts) ────────────────────────
// These go through the real HTTP routes with real derived secrets, so a
// regression anywhere in the webhook → notifyCommunityMembers chain shows up.

test("org webhook post skips muted members, buzzes the rest", async () => {
  const { communityPostSecretFor } = await import("../communityPost");
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  const r = await api(`/webhooks/community-post/${ORG}`, {
    method: "POST",
    headers: { "x-webhook-secret": communityPostSecretFor(ORG) },
    body: JSON.stringify({ community_id: COMM, message: "Weekly check-in time!" }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.map(n => n.recipient_id), [MEMBER]);
});

test("DBA webhook post skips muted members, buzzes the rest", async () => {
  const { communityPostDbaSecretFor } = await import("../communityPost");
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  adminSettings.push({
    company_id: ORG,
    key: `dba:${DBA_ID}`,
    value: JSON.stringify({ id: DBA_ID, name: "Sub Brand", slug: "sub-brand", is_active: true, members: [] }),
  });
  const r = await api(`/webhooks/community-post-dba/${DBA_ID}`, {
    method: "POST",
    headers: { "x-webhook-secret": communityPostDbaSecretFor(DBA_ID) },
    body: JSON.stringify({ community_id: COMM, message: "Sub-brand recap!" }),
  });
  assert.equal(r.status, 200);
  assert.deepEqual(notifications.map(n => n.recipient_id), [MEMBER]);
});

test("unmuting restores webhook buzzes", async () => {
  const { communityPostSecretFor } = await import("../communityPost");
  const secret = communityPostSecretFor(ORG);
  const post = () => api(`/webhooks/community-post/${ORG}`, {
    method: "POST",
    headers: { "x-webhook-secret": secret },
    body: JSON.stringify({ community_id: COMM, message: "hello" }),
  });
  // Muted: silent
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "1" });
  assert.equal((await post()).status, 200);
  assert.deepEqual(notifications.map(n => n.recipient_id), [MEMBER]);
  // Member unmutes via the real route, then the next webhook post buzzes them
  notifications = [];
  const r = await api(`/communities/${COMM}/mute`, {
    method: "POST", headers: auth("tok-muted"), body: JSON.stringify({ muted: false }),
  });
  assert.equal(r.status, 200);
  assert.equal((await post()).status, 200);
  assert.deepEqual(notifications.map(n => n.recipient_id).sort(), [MEMBER, MUTED].sort());
});

test("an unmuted ('0') row does not silence anyone", async () => {
  adminSettings.push({ company_id: ORG, key: `community_mute:${COMM}:${MUTED}`, value: "0" });
  await (globalThis as any).__notify(COMM, "Busy Chat", null);
  const recipients = notifications.map(n => n.recipient_id).sort();
  assert.deepEqual(recipients, [MEMBER, MUTED].sort());
});
