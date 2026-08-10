#!/usr/bin/env node
// Verifies /communities/:id/notify-post throttling & exclusions (task: confirm
// rapid-fire community chats only buzz phones once per 10 minutes).
//
// In-process integration test: bundles src/routes/communityPost.ts, mounts the
// real router in express, and stubs global fetch for the Supabase REST/auth
// calls with an in-memory DB that honours CAS semantics on admin_settings.
//
// Asserts:
//   1. Burst of messages → exactly ONE community_post notification per
//      recipient per 10-minute window (client community)
//   2. The sender is never notified
//   3. @mentioned members are excluded (they already got a mention notification)
//   4. After the 10-minute window expires, recipients can be buzzed again
//   5. Same throttle behaviour holds for a Team Hub (staff context) community
//   6. A second sender in the same window adds no extra buzzes for already-
//      stamped recipients (throttle is per community+recipient, not per sender)
//
// Run:  node artifacts/api-server/tests/community-notify-throttle.mjs
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "src", "routes", "communityPost.ts");
const out = path.join(here, `.community-post-under-test-${Date.now()}.mjs`);
execSync(`npx esbuild ${src} --bundle --format=esm --platform=node --packages=external --outfile=${out}`, {
  cwd: path.join(here, ".."), stdio: "pipe",
});

const SB = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001"; // Eden
const CLIENT_COMM = "c1111111-1111-1111-1111-111111111111"; // client community
const HUB_COMM = "c2222222-2222-2222-2222-222222222222"; // Team Hub community

// ── In-memory "Supabase" ────────────────────────────────────────
const users = {
  "alice@test.io": { id: "u-alice", role: "client", company_id: ORG, name: "Alice Client" },
  "bob@test.io": { id: "u-bob", role: "client", company_id: ORG, name: "Bob Client" },
  "cara@test.io": { id: "u-cara", role: "client", company_id: ORG, name: "Cara Client" },
  "dan@test.io": { id: "u-dan", role: "coach", company_id: ORG, name: "Dan Coach" },
  "eve@test.io": { id: "u-eve", role: "head_coach", company_id: ORG, name: "Eve Head" },
};
const tokenToEmail = Object.fromEntries(Object.keys(users).map((e) => [`tok-${e.split("@")[0]}`, e]));

const DBA_ID = "d3333333-3333-3333-3333-333333333333";
const DBA_COMM = "c4444444-4444-4444-4444-444444444444";
const communities = [
  { id: CLIENT_COMM, name: "General", company_id: ORG, context: "client", is_active: true },
  { id: HUB_COMM, name: "Team Hub", company_id: ORG, context: "staff", is_active: true },
  { id: DBA_COMM, name: "DBA Lounge", company_id: ORG, context: `dba:${DBA_ID}`, is_active: true },
];
const members = {
  [CLIENT_COMM]: [
    { user_id: "u-alice", user_name: "Alice Client" },
    { user_id: "u-bob", user_name: "Bob Client" },
    { user_id: "u-cara", user_name: "Cara Client" },
    { user_id: "u-dan", user_name: "Dan Coach" },
  ],
  [HUB_COMM]: [
    { user_id: "u-dan", user_name: "Dan Coach" },
    { user_id: "u-eve", user_name: "Eve Head" },
  ],
  [DBA_COMM]: [
    { user_id: "u-alice", user_name: "Alice Client" },
    { user_id: "u-bob", user_name: "Bob Client" },
  ],
};
let messages = [];   // community_messages
let notifications = []; // inserted notification rows
let adminSettings = new Map(); // `${company_id}|${key}` -> value (string)

let NOW = Date.parse("2026-08-10T12:00:00Z");
const realNow = Date.now.bind(Date);
Date.now = () => NOW;

function q(url) { return Object.fromEntries(new URL(url).searchParams.entries()); }
const eq = (v) => (v || "").replace(/^eq\./, "");
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const method = (init.method || "GET").toUpperCase();
  if (!url.startsWith(SB)) throw new Error(`unexpected fetch: ${url}`);

  if (url.startsWith(`${SB}/auth/v1/user`)) {
    const tok = String((init.headers || {}).Authorization || "").replace("Bearer ", "");
    const email = tokenToEmail[tok];
    return email ? json({ email }) : json({}, 401);
  }
  const p = q(url);
  if (url.includes("/rest/v1/user_profiles")) {
    const email = decodeURIComponent(eq(p.email) || "");
    const u = users[email];
    return json(u ? [{ id: u.id, role: u.role, company_id: u.company_id }] : []);
  }
  if (url.includes("/rest/v1/communities")) {
    const id = eq(p.id); const org = eq(p.company_id); const ctx = p.context ? decodeURIComponent(eq(p.context)) : "";
    let rows = communities.filter((c) => c.is_active);
    if (id) rows = rows.filter((c) => c.id === id);
    if (org) rows = rows.filter((c) => c.company_id === org);
    if (ctx) rows = rows.filter((c) => c.context === ctx);
    if (p.name) { const n = decodeURIComponent(p.name.replace(/^ilike\./, "")).toLowerCase(); rows = rows.filter((c) => c.name.toLowerCase() === n); }
    return json(rows.map(({ id, name, company_id }) => ({ id, name, company_id })));
  }
  if (url.includes("/rest/v1/community_members")) {
    const cid = eq(p.community_id); const uid = eq(p.user_id);
    let rows = members[cid] || [];
    if (uid) rows = rows.filter((m) => m.user_id === uid);
    return json(rows);
  }
  if (url.includes("/rest/v1/community_messages")) {
    if (method === "POST") { const b = JSON.parse(init.body); messages.push(b); return json([b], 201); }
    const id = eq(p.id); const cid = eq(p.community_id);
    return json(messages.filter((m) => m.id === id && m.community_id === cid));
  }
  if (url.includes("/rest/v1/notifications") && method === "POST") {
    const b = JSON.parse(init.body);
    notifications.push(...(Array.isArray(b) ? b : [b]));
    return json([], 201);
  }
  if (url.includes("/rest/v1/admin_settings")) {
    const keyOf = (cid, k) => `${cid}|${k}`;
    if (method === "GET") {
      const rawKey = decodeURIComponent(p.key || "");
      if (rawKey.startsWith("like.")) {
        const re = new RegExp("^" + rawKey.slice(5).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
        const rows = [...adminSettings.entries()]
          .filter(([k]) => re.test(k.split("|")[1]))
          .map(([k, value]) => ({ company_id: k.split("|")[0], key: k.split("|")[1], value }));
        return json(rows);
      }
      const k = keyOf(eq(p.company_id), rawKey.replace(/^eq\./, ""));
      return json(adminSettings.has(k) ? [{ value: adminSettings.get(k) }] : []);
    }
    if (method === "POST") {
      const b = JSON.parse(init.body);
      const k = keyOf(b.company_id, b.key);
      if (adminSettings.has(k)) return json({ code: "23505" }, 409); // duplicate key
      adminSettings.set(k, b.value);
      return json([b], 201);
    }
    if (method === "PATCH") {
      // CAS: only update when current value matches the value=eq. filter
      const k = keyOf(eq(p.company_id), decodeURIComponent(eq(p.key)));
      const expected = decodeURIComponent(eq(p.value));
      if (adminSettings.get(k) !== expected) return json([], 200); // no rows matched
      const b = JSON.parse(init.body);
      adminSettings.set(k, b.value);
      return json([{ value: b.value }], 200);
    }
  }
  throw new Error(`unhandled supabase call: ${method} ${url}`);
};

// ── Boot the real router ────────────────────────────────────────
const { default: router, communityPostDbaSecretFor, communityPostSecretFor } = await import(out);
const fs = await import("node:fs"); fs.unlinkSync(out);
const { default: express } = await import("express");
const app = express();
app.use(express.json());
app.use(router);

let msgSeq = 0;
async function post(senderKey, communityId, content) {
  // Simulate the frontend: insert the message row, then call notify-post.
  const u = users[`${senderKey}@test.io`];
  const id = `m0000000-0000-0000-0000-${String(++msgSeq).padStart(12, "0")}`;
  messages.push({ id, community_id: communityId, sender_id: u.id, sender_name: u.name, content, created_at: new Date(NOW).toISOString(), deleted_at: null });
  const res = await callRoute("POST", `/communities/${communityId}/notify-post`, { message_id: id }, `tok-${senderKey}`);
  return res;
}

// Drive express without opening a port
import { createServer } from "node:http";
const server = createServer(app);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const realFetch = (await import("node:http")).request;
function callRoute(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = realFetch({ host: "127.0.0.1", port, path, method, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), authorization: `Bearer ${token}` } }, (res) => {
      let buf = ""; res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(buf || "{}") }));
    });
    req.on("error", reject); req.end(data);
  });
}

let failed = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : ` — ${extra}`}`); if (!cond) failed++; };
const buzzes = (uid) => notifications.filter((n) => n.recipient_id === uid && n.type === "community_post");

// 1+2. Rapid-fire burst from Alice in the client community
let r1 = await post("alice", CLIENT_COMM, "hey everyone");
NOW += 5_000; await post("alice", CLIENT_COMM, "quick follow-up");
NOW += 5_000; await post("alice", CLIENT_COMM, "one more thing");
check("first post notifies each other member once", r1.status === 200 && r1.body.notified === 3, JSON.stringify(r1));
check("burst → exactly 1 buzz per recipient (bob)", buzzes("u-bob").length === 1);
check("burst → exactly 1 buzz per recipient (cara)", buzzes("u-cara").length === 1);
check("burst → exactly 1 buzz per recipient (dan)", buzzes("u-dan").length === 1);
check("sender (alice) never notified", buzzes("u-alice").length === 0);

// 6. Second sender inside the same window: only the first sender (alice,
//    previously skipped as sender) is newly claimable.
NOW += 10_000;
const r2 = await post("bob", CLIENT_COMM, "replying fast");
check("second sender in window only buzzes previously-skipped alice", r2.body.notified === 1 && buzzes("u-alice").length === 1, JSON.stringify(r2));
check("bob/cara/dan still only 1 buzz each", buzzes("u-bob").length === 1 && buzzes("u-cara").length === 1 && buzzes("u-dan").length === 1);

// 4. Window expiry → buzzes flow again
NOW += 10 * 60_000 + 1000;
const r3 = await post("alice", CLIENT_COMM, "new window!");
check("after 10 min, recipients buzz again", r3.body.notified === 3 && buzzes("u-bob").length === 2);

// 3. Mentioned users excluded (they already got the mention notification)
NOW += 11 * 60_000;
const r4 = await post("alice", CLIENT_COMM, "@Bob can you check this?");
check("mentioned user excluded from community_post buzz", r4.body.notified === 2 && buzzes("u-bob").length === 2, JSON.stringify(r4));
check("non-mentioned recipients still buzzed", buzzes("u-cara").length === 3 && buzzes("u-dan").length === 3);

// 5. Team Hub (staff) community: independent throttle, same rules
const hubBefore = notifications.length;
let h1 = await post("dan", HUB_COMM, "staff sync at 3pm");
NOW += 3_000; await post("dan", HUB_COMM, "bring your notes");
NOW += 3_000; const h3 = await post("eve", HUB_COMM, "on it");
check("Team Hub: first post buzzes the other member once", h1.body.notified === 1 && buzzes("u-eve").length === 1, JSON.stringify(h1));
check("Team Hub: burst adds only the reply-to-sender buzz", notifications.length - hubBefore === 2 && h3.body.notified === 1);
check("Team Hub: sender (dan) got exactly 1 buzz (from eve's reply)", notifications.filter((n) => n.recipient_id === "u-dan" && n.body.includes("Team Hub")).length === 1);
check("Team Hub throttle independent of client community", buzzes("u-dan").length === 4);

// 7. DBA group channel via the human chat path (DbaChat.jsx → notify-post):
//    same throttle rules apply in DBA-context communities.
NOW += 11 * 60_000;
const d1 = await post("alice", DBA_COMM, "hello dba crew");
NOW += 4_000; const d2 = await post("alice", DBA_COMM, "rapid follow-up");
check("DBA channel: first human post buzzes the other member", d1.status === 200 && d1.body.notified === 1, JSON.stringify(d1));
check("DBA channel: rapid-fire second post adds no buzz", d2.body.notified === 0, JSON.stringify(d2));
check("DBA channel: bob got exactly 1 buzz for the burst", notifications.filter((n) => n.recipient_id === "u-bob" && n.body.includes("DBA Lounge")).length === 1);
check("DBA channel: sender alice not notified", notifications.filter((n) => n.recipient_id === "u-alice" && n.body.includes("DBA Lounge")).length === 0);

// 8. DBA webhook success path: posts into the DBA's own channel and notifies
//    all members (automated post, sender null → no sender skip needed).
adminSettings.set(`${ORG}|dba:${DBA_ID}`, JSON.stringify({ id: DBA_ID, slug: "dba-lounge", name: "DBA Lounge", is_active: true, members: [] }));
function webhook(path, secret, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = realFetch({ host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data), "x-webhook-secret": secret } }, (res) => {
      let buf = ""; res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(buf || "{}") }));
    });
    req.on("error", reject); req.end(data);
  });
}
const beforeDba = notifications.length;
const w1 = await webhook(`/webhooks/community-post-dba/${DBA_ID}`, communityPostDbaSecretFor(DBA_ID), { community_id: DBA_COMM, message: "weekly check-in link" });
check("DBA webhook posts successfully into the DBA channel", w1.status === 200 && w1.body.ok === true && w1.body.community === "DBA Lounge", JSON.stringify(w1));
check("DBA webhook message row inserted", messages.some((m) => m.community_id === DBA_COMM && m.content === "weekly check-in link"));
check("DBA webhook notifies every channel member", notifications.length - beforeDba === 2);
const w2 = await webhook(`/webhooks/community-post-dba/${DBA_ID}`, "wrong-secret", { community_id: DBA_COMM, message: "nope" });
check("DBA webhook rejects a wrong secret", w2.status === 401);
// Org-level webhook still works too (post by community name).
const beforeOrg = notifications.length;
const w3 = await webhook(`/webhooks/community-post/${ORG}`, communityPostSecretFor(ORG), { community: "general", message: "org-wide blast" });
check("org webhook posts by community name", w3.status === 200 && w3.body.ok === true && w3.body.community === "General", JSON.stringify(w3));
check("org webhook notifies all community members", notifications.length - beforeOrg === 4);

// Sanity: only community_post rows were inserted, all bound to real senders
check("all notification rows are community_post and never self-addressed", notifications.every((n) => n.type === "community_post" && n.recipient_id !== n.sender_id));

server.close();
Date.now = realNow;
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
