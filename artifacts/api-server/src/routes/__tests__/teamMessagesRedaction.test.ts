// teamMessagesRedaction.test.ts — deleted Team Hub messages must never leak
// their content to non-admins, at the transport level.
//
// Supabase is mocked at the global-fetch level, so the real GET /team/messages
// handler runs end-to-end over HTTP. Asserts:
//   • non-admin (coach) responses contain NO deleted-message bodies — roots,
//     thread replies, DM roots, and DM thread replies alike
//   • admins DO receive the original content (for the "(admins only)" bubble)
//   • DM rows are filtered to conversations the caller participates in
//   • clients and anonymous callers are rejected

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COACH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const SECRET = (tag: string) => `TOP-SECRET-${tag}-original-text`;

const tokens: Record<string, string> = {
  "tok-admin": "admin@x.co",
  "tok-coach": "coach@x.co",
  "tok-client": "client@x.co",
};
const profiles: Record<string, any> = {
  "admin@x.co": { id: ADMIN, role: "super_admin", company_id: ORG },
  "coach@x.co": { id: COACH, role: "coach", company_id: ORG },
  "client@x.co": { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", role: "client", company_id: ORG },
};

const row = (id: string, extra: any = {}) => ({
  id: `${id.repeat(8)}-${id.repeat(4)}-4${id.repeat(3)}-8${id.repeat(3)}-${id.repeat(12)}`,
  org_id: ORG, sender_id: OTHER, sender_name: "Someone", sender_role: "coach",
  content: "hello", created_at: "2026-08-01T00:00:00Z",
  is_dm: false, dm_to_id: null, thread_id: null,
  deleted_at: null, deleted_by: null, deleted_by_name: null,
  ...extra,
});

// One deleted message on each Team Hub surface:
const teamMessages = [
  row("1", { content: SECRET("general-root"), deleted_at: "2026-08-02T00:00:00Z", deleted_by_name: "Admin" }),
  row("2", { content: SECRET("general-reply"), thread_id: row("1").id, deleted_at: "2026-08-02T00:00:00Z", deleted_by_name: "Admin" }),
  row("3", { content: SECRET("dm-root"), is_dm: true, dm_to_id: COACH, deleted_at: "2026-08-02T00:00:00Z", deleted_by_name: "Admin" }),
  row("4", { content: SECRET("dm-reply"), is_dm: true, dm_to_id: COACH, thread_id: row("3").id, deleted_at: "2026-08-02T00:00:00Z", deleted_by_name: "Admin" }),
  row("5", { content: "live message" }),
  row("6", { content: SECRET("foreign-dm"), is_dm: true, sender_id: ADMIN, dm_to_id: OTHER }),
  row("7", { content: "coach's own live message", sender_id: COACH }),
  row("8", { content: "another live message from someone else" }),
];
const auditRows: any[] = [];

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const authz = String((init.headers || {})["Authorization"] || "");
    if (u.pathname === "/auth/v1/user") {
      const tok = authz.replace("Bearer ", "");
      const email = tokens[tok];
      return email
        ? new Response(JSON.stringify({ email }), { status: 200 })
        : new Response("{}", { status: 401 });
    }
    if (u.pathname === "/rest/v1/user_profiles") {
      const m = /email=eq\.([^&]+)/.exec(u.search);
      if (m) {
        const p = profiles[decodeURIComponent(m[1])];
        return new Response(JSON.stringify(p ? [p] : []), { status: 200 });
      }
      const im = /id=eq\.([^&]+)/.exec(u.search);
      const p = Object.values(profiles).find((x: any) => x.id === (im ? im[1] : ""));
      return new Response(JSON.stringify(p ? [{ name: "Mock Name", full_name: "Mock Name" }] : []), { status: 200 });
    }
    if (u.pathname === "/rest/v1/team_messages") {
      assert.equal(authz, `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "must use service key");
      const method = String(init.method || "GET").toUpperCase();
      if (method === "PATCH") {
        const im = /[?&]id=eq\.([^&]+)/.exec(u.search);
        const target = teamMessages.find((r) => r.id === (im ? im[1] : ""));
        if (target) Object.assign(target, JSON.parse(init.body));
        return new Response(null, { status: 204 });
      }
      let rows = teamMessages.filter((r) => r.org_id && u.search.includes(`org_id=eq.${r.org_id}`));
      const single = /[?&]id=eq\.([^&]+)/.exec(u.search);
      if (single) rows = teamMessages.filter((r) => r.id === single[1]);
      const idm = /id=in\.\(([^)]+)\)/.exec(decodeURIComponent(u.search));
      if (idm) { const ids = new Set(idm[1].split(",")); rows = rows.filter((r) => ids.has(r.id)); }
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (u.pathname === "/rest/v1/audit_logs") {
      auditRows.push(JSON.parse(init.body));
      return new Response("", { status: 201 });
    }
    return new Response("[]", { status: 200 });
  }) as any;
}

let server: http.Server; let base = "";
before(async () => {
  mockSupabase();
  const { default: router } = await import("../teamMessages");
  const app = express();
  app.use(express.json());
  app.use(router);
  server = http.createServer(app);
  await new Promise<void>((ok) => server.listen(0, () => ok()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => { server.close(); globalThis.fetch = realFetch; });

const get = (tok: string | null, qs = "") =>
  realFetch(`${base}/team/messages${qs}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });

test("non-admin response contains no deleted content on any surface", async () => {
  const r = await get("tok-coach");
  assert.equal(r.status, 200);
  const body = await r.text();
  for (const tag of ["general-root", "general-reply", "dm-root", "dm-reply"]) {
    assert.ok(!body.includes(SECRET(tag)), `deleted ${tag} content leaked to coach`);
  }
  const { messages } = JSON.parse(body);
  // Deletion metadata survives so the placeholder bubble still renders
  const deleted = messages.filter((m: any) => m.deleted_at);
  assert.equal(deleted.length, 4);
  for (const m of deleted) { assert.equal(m.content, ""); assert.equal(m.deleted_by_name, "Admin"); }
  assert.ok(messages.some((m: any) => m.content === "live message"), "live messages untouched");
});

test("admin receives original deleted content for the admins-only bubble", async () => {
  const r = await get("tok-admin");
  const { messages } = await r.json() as any;
  for (const tag of ["general-root", "general-reply"]) {
    assert.ok(messages.some((m: any) => m.content === SECRET(tag)), `admin missing ${tag}`);
  }
});

test("DM rows are filtered to the caller's own conversations", async () => {
  const r = await get("tok-coach");
  const body = await r.text();
  assert.ok(!body.includes(SECRET("foreign-dm")), "coach saw a DM they are not part of");
});

test("ids backfill query is redacted the same way", async () => {
  const r = await get("tok-coach", `?ids=${teamMessages[0].id},${teamMessages[2].id}`);
  const body = await r.text();
  assert.ok(!body.includes(SECRET("general-root")));
  assert.ok(!body.includes(SECRET("dm-root")));
  assert.equal((JSON.parse(body).messages || []).length, 2);
});

test("soft delete goes through the server: own message ok, others' forbidden", async () => {
  const own = teamMessages[6]; // coach's own live message
  const foreign = teamMessages[7]; // someone else's live message

  // Coach cannot delete someone else's message
  const f = await realFetch(`${base}/team/messages/${foreign.id}/delete`, { method: "POST", headers: { Authorization: "Bearer tok-coach" } });
  assert.equal(f.status, 403);
  assert.equal(foreign.deleted_at, null);

  // Coach deletes their own — row marked + audit row captures original content
  const r = await realFetch(`${base}/team/messages/${own.id}/delete`, { method: "POST", headers: { Authorization: "Bearer tok-coach" } });
  assert.equal(r.status, 200);
  assert.ok(own.deleted_at, "row soft-deleted");
  assert.equal(own.deleted_by, COACH);
  const audit = auditRows.find((a) => a.target_id === own.id);
  assert.ok(audit, "audit row written");
  assert.equal(audit.details.content, "coach's own live message");

  // Admin can delete anything in their org
  const a = await realFetch(`${base}/team/messages/${foreign.id}/delete`, { method: "POST", headers: { Authorization: "Bearer tok-admin" } });
  assert.equal(a.status, 200);
  assert.ok(foreign.deleted_at);
});

test("clients and anonymous callers are rejected", async () => {
  assert.equal((await get("tok-client")).status, 401);
  assert.equal((await get(null)).status, 401);
  assert.equal((await get("tok-bogus")).status, 401);
});
