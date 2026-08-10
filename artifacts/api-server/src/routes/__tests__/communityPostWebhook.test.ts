// communityPostWebhook.test.ts — scoping tests for the community-post webhooks.
//
// Guards the critical boundaries:
//   * org webhook  POST /webhooks/community-post/:companyId
//   * DBA webhook  POST /webhooks/community-post-dba/:dbaId
// A DBA secret must only reach that DBA's own `dba:<id>` channels — never org
// communities, another DBA's channels, or the org-level endpoint. Org secrets
// must never work on the DBA endpoint and vice versa.
//
// Supabase is mocked at the global-fetch level (no live data is touched), so
// these tests exercise the real route handlers end-to-end over HTTP.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";

const ORG_A = "a0000000-0000-0000-0000-00000000000a";
const ORG_B = "b0000000-0000-0000-0000-00000000000b";
const DBA_1 = "d1111111-1111-1111-1111-111111111111"; // belongs to ORG_A
const DBA_2 = "d2222222-2222-2222-2222-222222222222"; // belongs to ORG_B
const DBA_3 = "d3333333-3333-3333-3333-333333333333"; // sibling DBA, ALSO in ORG_A
const DBA_INACTIVE = "d4444444-4444-4444-4444-444444444444"; // archived DBA in ORG_A

// Communities (context null = org community; "dba:<id>" = DBA channel)
const COMM_ORG_A = "c0000000-0000-0000-0000-0000000000a1"; // org A community
const COMM_DBA_1 = "c1111111-1111-1111-1111-1111111111d1"; // DBA_1 channel (org A)
const COMM_DBA_2 = "c2222222-2222-2222-2222-2222222222d2"; // DBA_2 channel (org B)
const COMM_DBA_3 = "c3333333-3333-3333-3333-3333333333d3"; // DBA_3 channel (org A — same org as DBA_1)

const communities = [
  { id: COMM_ORG_A, name: "Team Check-In", company_id: ORG_A, context: null, is_active: true },
  { id: COMM_DBA_1, name: "DBA One Chat", company_id: ORG_A, context: `dba:${DBA_1}`, is_active: true },
  { id: COMM_DBA_2, name: "DBA Two Chat", company_id: ORG_B, context: `dba:${DBA_2}`, is_active: true },
  { id: COMM_DBA_3, name: "DBA Three Chat", company_id: ORG_A, context: `dba:${DBA_3}`, is_active: true },
];

const dbaRow = (companyId: string, id: string, name: string, isActive = true) => ({
  company_id: companyId,
  key: `dba:${id}`,
  value: JSON.stringify({ id, name, slug: name.toLowerCase().replace(/\s+/g, "-"), is_active: isActive, members: [] }),
});
const adminSettings = [
  dbaRow(ORG_A, DBA_1, "DBA One"),
  dbaRow(ORG_B, DBA_2, "DBA Two"),
  dbaRow(ORG_A, DBA_3, "DBA Three"),
  dbaRow(ORG_A, DBA_INACTIVE, "DBA Archived", false),
];

let postedMessages: any[] = [];
let notifications: any[] = [];

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
    const eq = (name: string) => {
      const v = q.get(name);
      return v?.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
    };

    if (u.pathname === "/rest/v1/communities") {
      let rows = communities.slice();
      const id = eq("id");
      if (id) rows = rows.filter((c) => c.id === id);
      const name = q.get("name"); // ilike.<name>
      if (name?.startsWith("ilike.")) {
        const n = decodeURIComponent(name.slice(6)).toLowerCase();
        rows = rows.filter((c) => c.name.toLowerCase() === n);
      }
      const company = eq("company_id");
      if (company) rows = rows.filter((c) => c.company_id === company);
      const ctx = eq("context");
      if (ctx !== null) rows = rows.filter((c) => c.context === ctx);
      if (eq("is_active") === "true") rows = rows.filter((c) => c.is_active);
      return json(rows.map((c) => ({ id: c.id, name: c.name })));
    }
    if (u.pathname === "/rest/v1/admin_settings") {
      // Only DBA lookups (key=like.dba:*) matter here.
      let rows = adminSettings.slice();
      const company = eq("company_id");
      if (company) rows = rows.filter((r) => r.company_id === company);
      return json(rows);
    }
    if (u.pathname === "/rest/v1/community_messages" && method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      postedMessages.push(body);
      return json([body], 201);
    }
    if (u.pathname === "/rest/v1/community_members") return json([]);
    if (u.pathname === "/rest/v1/notifications" && method === "POST") {
      const body = JSON.parse(String(init.body || "[]"));
      notifications.push(...(Array.isArray(body) ? body : [body]));
      return json(body, 201);
    }
    return json([], 200);
  }) as typeof fetch;
}

let server: http.Server; let base = "";
let orgSecretA = ""; let orgSecretB = ""; let dbaSecret1 = ""; let dbaSecret2 = "";

before(async () => {
  mockSupabase();
  const mod = await import("../communityPost");
  orgSecretA = mod.communityPostSecretFor(ORG_A);
  orgSecretB = mod.communityPostSecretFor(ORG_B);
  dbaSecret1 = mod.communityPostDbaSecretFor(DBA_1);
  dbaSecret2 = mod.communityPostDbaSecretFor(DBA_2);
  const app = express();
  app.use(express.json());
  app.use(mod.default);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => { server?.close(); globalThis.fetch = realFetch; });
beforeEach(() => { postedMessages = []; notifications = []; });

async function post(path: string, secret: string | null, body: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;
  const r = await realFetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
const orgPath = (id: string) => `/webhooks/community-post/${id}`;
const dbaPath = (id: string) => `/webhooks/community-post-dba/${id}`;

// ── Org webhook: happy path stays intact ─────────────────────────
test("org secret posts into that org's community (by id and by name)", async () => {
  let r = await post(orgPath(ORG_A), orgSecretA, { community_id: COMM_ORG_A, message: "weekly check-in" });
  assert.equal(r.status, 200);
  assert.equal(r.body.community, "Team Check-In");

  r = await post(orgPath(ORG_A), orgSecretA, { community: "team check-in", message: "by name" });
  assert.equal(r.status, 200);
  assert.equal(postedMessages.length, 2);
  assert.ok(postedMessages.every((m) => m.community_id === COMM_ORG_A && m.sender_id === null));
});

// ── Secrets are endpoint- and tenant-specific ────────────────────
test("missing, wrong, or swapped secrets are rejected with 401", async () => {
  // No secret at all
  let r = await post(orgPath(ORG_A), null, { community_id: COMM_ORG_A, message: "x" });
  assert.equal(r.status, 401);
  // Garbage secret
  r = await post(orgPath(ORG_A), "not-a-real-secret", { community_id: COMM_ORG_A, message: "x" });
  assert.equal(r.status, 401);
  // Another org's secret on this org's endpoint
  r = await post(orgPath(ORG_A), orgSecretB, { community_id: COMM_ORG_A, message: "x" });
  assert.equal(r.status, 401);
  // A DBA secret can never open the org endpoint (even its own org's)
  r = await post(orgPath(ORG_A), dbaSecret1, { community_id: COMM_ORG_A, message: "x" });
  assert.equal(r.status, 401);
  // An org secret can never open the DBA endpoint
  r = await post(dbaPath(DBA_1), orgSecretA, { community_id: COMM_DBA_1, message: "x" });
  assert.equal(r.status, 401);
  // One DBA's secret can't open another DBA's endpoint
  r = await post(dbaPath(DBA_2), dbaSecret1, { community_id: COMM_DBA_2, message: "x" });
  assert.equal(r.status, 401);
  assert.equal(postedMessages.length, 0);
});

// ── Org webhook cannot cross tenants even with a valid secret ────
test("org secret can't reach another org's or a DBA's community", async () => {
  // Org A secret pointed at org B... but ORG_B has no org communities;
  // simulate cross-tenant by aiming org A's endpoint at DBA_2's channel (org B)
  let r = await post(orgPath(ORG_A), orgSecretA, { community_id: COMM_DBA_2, message: "x" });
  assert.equal(r.status, 404);
  // Note: DBA channels DO carry the org's company_id, so the org-wide secret
  // reaching its own org's DBA channels is by design (broader credential).
  r = await post(orgPath(ORG_A), orgSecretA, { community: "DBA Two Chat", message: "x" });
  assert.equal(r.status, 404);
  assert.equal(postedMessages.length, 0);
});

// ── DBA webhook: strictly scoped to its own dba:<id> channels ────
test("DBA secret posts only into its own channels", async () => {
  const r = await post(dbaPath(DBA_1), dbaSecret1, { community_id: COMM_DBA_1, message: "hello dba" });
  assert.equal(r.status, 200);
  assert.equal(r.body.community, "DBA One Chat");
  assert.equal(postedMessages.length, 1);
  assert.equal(postedMessages[0].community_id, COMM_DBA_1);
});

test("DBA secret cannot post into org communities", async () => {
  // Same org (ORG_A) plain community — must 404, by id and by name
  let r = await post(dbaPath(DBA_1), dbaSecret1, { community_id: COMM_ORG_A, message: "x" });
  assert.equal(r.status, 404);
  r = await post(dbaPath(DBA_1), dbaSecret1, { community: "Team Check-In", message: "x" });
  assert.equal(r.status, 404);
  assert.equal(postedMessages.length, 0);
});

test("DBA secret cannot post into another DBA's channels", async () => {
  // Cross-org sibling (DBA_2 in ORG_B)
  let r = await post(dbaPath(DBA_1), dbaSecret1, { community_id: COMM_DBA_2, message: "x" });
  assert.equal(r.status, 404);
  r = await post(dbaPath(DBA_1), dbaSecret1, { community: "DBA Two Chat", message: "x" });
  assert.equal(r.status, 404);
  // SAME-org sibling (DBA_3 also lives in ORG_A) — this is the sharp edge:
  // a regression that only filters by company_id would let this through.
  r = await post(dbaPath(DBA_1), dbaSecret1, { community_id: COMM_DBA_3, message: "x" });
  assert.equal(r.status, 404);
  r = await post(dbaPath(DBA_1), dbaSecret1, { community: "DBA Three Chat", message: "x" });
  assert.equal(r.status, 404);
  assert.equal(postedMessages.length, 0);
});

test("unknown DBA id is rejected even with a matching secret", async () => {
  const ghost = "d9999999-9999-9999-9999-999999999999";
  const mod = await import("../communityPost");
  const r = await post(dbaPath(ghost), mod.communityPostDbaSecretFor(ghost), { community_id: COMM_DBA_1, message: "x" });
  // Unknown DBA → 404 so callers know the endpoint is gone (the handler
  // resolves the DBA before checking the secret, whose nonce it needs).
  assert.equal(r.status, 404);
  assert.equal(postedMessages.length, 0);
});

test("an archived (inactive) DBA's secret stops working", async () => {
  const mod = await import("../communityPost");
  const r = await post(dbaPath(DBA_INACTIVE), mod.communityPostDbaSecretFor(DBA_INACTIVE), { community_id: COMM_DBA_1, message: "x" });
  assert.equal(r.status, 404);
  assert.equal(postedMessages.length, 0);
});
