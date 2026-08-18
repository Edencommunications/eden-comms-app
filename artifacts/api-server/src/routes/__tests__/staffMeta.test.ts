// staffMeta.test.ts — unit tests for the admin-only staff_meta write route.
//
// Verifies:
//   • sanitizeTabs filters to the canonical set and defaults to ['team']
//   • validateConnectCoach only accepts a same-org active coach/head_coach
//   • POST /staff/meta rejects non-admin callers (staff self-escalation)
//   • rejects cross-org targets
//   • an admin write lands on the staff_meta:<id> key with sanitized value
// Run with:  pnpm --filter @workspace/api-server run test

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import staffMetaRouter, { sanitizeTabs, validateConnectCoach } from "../staffMeta";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG   = "b0000000-0000-0000-0000-000000000001";
const ORG2  = "b0000000-0000-0000-0000-000000000002";
const ADMIN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const STAFF = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const COACH = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHER = "ffffffff-ffff-ffff-ffff-ffffffffffff"; // profile in ORG2

// tokens → emails; emails → profiles
const tokens: Record<string, string> = {
  "admin-token": "admin@example.com",
  "staff-token": "staff@example.com",
};
const profiles: Record<string, any> = {
  "admin@example.com": { id: ADMIN, role: "super_admin", company_id: ORG,  name: "Admin" },
  "staff@example.com": { id: STAFF, role: "va",          company_id: ORG,  name: "Staffer" },
};
const profileRows: any[] = [
  { id: ADMIN, role: "super_admin", company_id: ORG,  is_active: true },
  { id: STAFF, role: "va",          company_id: ORG,  is_active: true },
  { id: COACH, role: "coach",       company_id: ORG,  is_active: true },
  { id: OTHER, role: "va",          company_id: ORG2, is_active: true },
];

let upserts: any[] = [];
const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;

    if (u.pathname === "/auth/v1/user") {
      const tok = String(init.headers?.Authorization || "").replace("Bearer ", "");
      const email = tokens[tok];
      return email ? json({ email }) : json({ error: "bad token" }, 401);
    }
    if (u.pathname === "/rest/v1/user_profiles") {
      const emailQ = q.get("email");
      if (emailQ?.startsWith("eq.")) {
        const p = profiles[emailQ.slice(3)];
        // route applies role/is_active filters in the query; emulate role filter
        const roleQ = q.get("role") || "";
        if (!p) return json([]);
        if (roleQ === "eq.super_admin" && p.role !== "super_admin") return json([]);
        return json([p]);
      }
      const idQ = q.get("id");
      if (idQ?.startsWith("eq.")) {
        let rows = profileRows.filter((r) => r.id === idQ.slice(3));
        const roleIn = q.get("role");
        if (roleIn?.startsWith("in.")) {
          const roles = roleIn.slice(4, -1).split(",");
          rows = rows.filter((r) => roles.includes(r.role));
        }
        const co = q.get("company_id");
        if (co?.startsWith("eq.")) rows = rows.filter((r) => r.company_id === co.slice(3));
        return json(rows);
      }
      return json([]);
    }
    if (u.pathname === "/rest/v1/admin_settings" && method === "POST") {
      upserts.push(JSON.parse(String(init.body || "{}")));
      return new Response(null, { status: 201 });
    }
    return json([], 404);
  }) as any;
});
after(() => { globalThis.fetch = realFetch; });
beforeEach(() => { upserts = []; });

function app() {
  const a = express();
  a.use(express.json());
  a.use(staffMetaRouter);
  return a;
}
async function post(token: string | null, body: any) {
  const srv = app().listen(0);
  const port = (srv.address() as any).port;
  try {
    const r = await realFetch(`http://127.0.0.1:${port}/staff/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } finally { srv.close(); }
}

test("sanitizeTabs filters unknown tabs and defaults to ['team']", () => {
  assert.deepEqual(sanitizeTabs(["msgs", "hack", "learn", "msgs"]), ["msgs", "learn"]);
  assert.deepEqual(sanitizeTabs([]), ["team"]);
  assert.deepEqual(sanitizeTabs("nope"), ["team"]);
});

test("validateConnectCoach accepts only same-org active coach", async () => {
  assert.equal(await validateConnectCoach(COACH, ORG), COACH);
  assert.equal(await validateConnectCoach(STAFF, ORG), null);   // va, not coach
  assert.equal(await validateConnectCoach(COACH, ORG2), null);  // wrong org
  assert.equal(await validateConnectCoach("not-a-uuid", ORG), null);
});

test("staff JWT cannot write staff_meta (403)", async () => {
  const r = await post("staff-token", { profileId: STAFF, tabs: ["home", "msgs", "team", "learn", "community"] });
  assert.equal(r.status, 403);
  assert.equal(upserts.length, 0);
});

test("missing token rejected", async () => {
  const r = await post(null, { profileId: STAFF, tabs: ["team"] });
  assert.equal(r.status, 403);
});

test("admin cannot target another org's profile", async () => {
  const r = await post("admin-token", { profileId: OTHER, tabs: ["team"] });
  assert.equal(r.status, 403);
  assert.equal(upserts.length, 0);
});

test("admin write lands on staff_meta:<id> with sanitized value", async () => {
  const r = await post("admin-token", {
    profileId: STAFF, label: "  Closer  ", tabs: ["team", "bogus", "community"], connect_coach: COACH,
  });
  assert.equal(r.status, 200);
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].key, `staff_meta:${STAFF}`);
  assert.equal(upserts[0].company_id, ORG);
  const val = JSON.parse(upserts[0].value);
  assert.deepEqual(val, { label: "Closer", tabs: ["team", "community"], connect_coach: COACH });
});

test("connect_coach dropped when community tab is off or coach invalid", async () => {
  let r = await post("admin-token", { profileId: STAFF, tabs: ["team"], connect_coach: COACH });
  assert.equal(JSON.parse(upserts[0].value).connect_coach, null);
  r = await post("admin-token", { profileId: STAFF, tabs: ["community"], connect_coach: STAFF });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(upserts[1].value).connect_coach, null);
});
