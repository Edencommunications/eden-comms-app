// authProvisionDuplicate.test.ts — duplicate-account guard for POST /auth/provision.
//
// user_profiles has NO unique email index (external Supabase, schema frozen),
// so the DB-level uniqueness that actually blocks a race is auth.users' unique
// login email. Every add flow calls /auth/provision FIRST, so this endpoint
// must turn "login already exists" into a 409 the browser aborts on — never
// an idempotent success that lets a second profile be inserted.
//
// Supabase (PostgREST + GoTrue admin API) is mocked at the global-fetch level;
// the mock enforces the real unique-email behavior of auth.users.

// Make sure the mailer is NOT configured — the provision route would otherwise
// try to send a real welcome email after a successful create.
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_APP_PASSWORD;
delete process.env.SMTP_SENDER_EMAIL;
delete process.env.SMTP_FROM_EMAIL;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ADMIN_TOKEN = "test-admin-jwt";
const ADMIN_EMAIL = "admin@test.io";
const ORG = "a0000000-0000-0000-0000-00000000000a";

// Mutable fixture state
let profiles: { id: string; email: string; role: string; company_id: string | null; name?: string; is_active?: boolean }[] = [];
let authUsers: { email: string; id: string; created_at: string }[] = []; // "auth.users" rows
let createUserCalls = 0;
let passwordResets: string[] = []; // auth user ids whose password was admin-reset
const OLD = new Date(Date.now() - 60 * 60_000).toISOString(); // 1h ago = genuine orphan
function nowIso() { return new Date().toISOString(); }

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    const method = String(init.method || "GET").toUpperCase();

    // GoTrue: verify the caller's JWT
    if (u.pathname === "/auth/v1/user") {
      const auth = String(init.headers?.Authorization || (init.headers as any)?.authorization || "");
      if (auth === `Bearer ${ADMIN_TOKEN}`) return json({ email: ADMIN_EMAIL });
      return json({ msg: "invalid token" }, 401);
    }

    // GoTrue admin: create user — enforces auth.users' unique email exactly
    // like the real thing (the DB-level constraint this task leans on).
    if (u.pathname === "/auth/v1/admin/users" && method === "POST") {
      createUserCalls++;
      const body = JSON.parse(String(init.body || "{}"));
      const email = String(body.email || "").toLowerCase();
      if (authUsers.some((a) => a.email === email)) {
        return json({ error_code: "email_exists", msg: "A user with this email address has already been registered" }, 422);
      }
      const row = { email, id: `auth-${authUsers.length + 1}`, created_at: nowIso() };
      authUsers.push(row);
      return json({ id: row.id }, 200);
    }

    // GoTrue admin: list users (findAuthUserByEmail) + password reset (orphan repair)
    if (u.pathname === "/auth/v1/admin/users" && method === "GET") {
      return json({ users: authUsers.map((a) => ({ id: a.id, email: a.email, created_at: a.created_at })) });
    }
    const putMatch = u.pathname.match(/^\/auth\/v1\/admin\/users\/(.+)$/);
    if (putMatch && method === "PUT") {
      passwordResets.push(putMatch[1]);
      return json({ id: putMatch[1] });
    }

    // PostgREST: user_profiles lookups (admin role check uses email=eq.,
    // the duplicate guard uses email=ilike.)
    if (u.pathname === "/rest/v1/user_profiles" && method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      const row = { id: String(body.id), email: String(body.email), role: String(body.role), company_id: body.company_id ?? null, name: body.name };
      profiles.push(row);
      return json([row], 201);
    }
    if (u.pathname === "/rest/v1/user_profiles") {
      const q = u.searchParams;
      let rows = profiles.slice();
      const emailParam = q.get("email") || "";
      if (emailParam.startsWith("eq.")) {
        const v = decodeURIComponent(emailParam.slice(3)).toLowerCase();
        rows = rows.filter((r) => r.email.toLowerCase() === v);
      } else if (emailParam.startsWith("ilike.")) {
        // No wildcards are sent, so this is an exact case-insensitive match
        const v = decodeURIComponent(emailParam.slice(6)).toLowerCase();
        rows = rows.filter((r) => r.email.toLowerCase() === v);
      }
      const roleParam = q.get("role") || "";
      if (roleParam.startsWith("eq.")) rows = rows.filter((r) => r.role === roleParam.slice(3));
      return json(rows);
    }

    return json([], 200);
  }) as typeof fetch;
}

let server: http.Server;
let base = "";

before(async () => {
  mockSupabase();
  const mod = await import("../auth");
  const app = express();
  app.use(express.json());
  app.use(mod.default);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  globalThis.fetch = realFetch;
});

beforeEach(() => {
  profiles = [
    { id: "admin-1", email: ADMIN_EMAIL, role: "super_admin", company_id: ORG, name: "Admin" },
  ];
  authUsers = [{ email: ADMIN_EMAIL, id: "auth-admin", created_at: OLD }];
  createUserCalls = 0;
  passwordResets = [];
});

function provision(email: string) {
  return fetch(`${base}/auth/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ email, password: "TempPass123!", name: "New Person", role: "client" }),
  });
}

test("a fresh email provisions successfully", async () => {
  const r = await provision("new@x.com");
  assert.equal(r.status, 200);
  const b: any = await r.json();
  assert.equal(b.ok, true);
  assert.ok(authUsers.some((a) => a.email === "new@x.com"));
});

test("an existing profile is rejected 409 even with different casing", async () => {
  profiles.push({ id: "p-1", email: "bob@x.com", role: "client", company_id: ORG });
  const r = await provision("Bob@X.com");
  assert.equal(r.status, 409);
  const b: any = await r.json();
  assert.equal(b.duplicate, true);
  // Never even reached the auth create — no orphan login for the duplicate
  assert.equal(createUserCalls, 0);
});

test("an existing auth login (no profile yet) is rejected 409, not treated as success", async () => {
  authUsers.push({ email: "orphan@x.com", id: "auth-orphan", created_at: nowIso() });
  const r = await provision("orphan@x.com");
  assert.equal(r.status, 409);
  const b: any = await r.json();
  assert.equal(b.duplicate, true);
});

test("two concurrent provisions for the same email: exactly one wins, the loser gets 409", async () => {
  // Both requests pass the profile pre-check (no profile exists yet); the
  // auth-side unique email is what breaks the tie — same as two admins
  // clicking Add at the same moment.
  const [r1, r2] = await Promise.all([provision("race@x.com"), provision("race@x.com")]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const loser = r1.status === 409 ? r1 : r2;
  const b: any = await loser.json();
  assert.equal(b.duplicate, true);
  assert.equal(b.ok, false); // browser aborts → no second profile insert
  // Exactly one auth user was created for the raced email
  assert.equal(authUsers.filter((a) => a.email === "race@x.com").length, 1);
});

// ── Shared primitive: provisionNewAuthUser (used by GHL webhook, bulk
// import, and DBA member-add — the flows that don't go through the HTTP
// endpoint above) ─────────────────────────────────────────────────

test("primitive: concurrent same-email provisions — exactly one ok, one duplicate, one auth user", async () => {
  const mod = await import("../auth");
  const [a, b] = await Promise.all([
    mod.provisionNewAuthUser("prim-race@x.com", "TempPass123!"),
    mod.provisionNewAuthUser("prim-race@x.com", "TempPass456!"),
  ]);
  const results = [a, b];
  assert.equal(results.filter((r) => r.ok).length, 1);
  const loser: any = results.find((r) => !r.ok);
  assert.equal(loser.duplicate, true);
  assert.equal(authUsers.filter((u) => u.email === "prim-race@x.com").length, 1);
  // The loser must NOT have "repaired" (password-reset) the winner's fresh login
  assert.equal(passwordResets.length, 0);
});

test("primitive: existing profile (any casing) rejects before any auth call", async () => {
  profiles.push({ id: "p-2", email: "case@x.com", role: "client", company_id: ORG });
  const mod = await import("../auth");
  const r: any = await mod.provisionNewAuthUser("CASE@X.COM", "TempPass123!");
  assert.equal(r.ok, false);
  assert.equal(r.duplicate, true);
  assert.equal(createUserCalls, 0);
});

test("primitive: a genuinely old orphaned login is repaired (password reset), not duplicated", async () => {
  authUsers.push({ email: "old-orphan@x.com", id: "auth-old", created_at: OLD });
  const mod = await import("../auth");
  const r: any = await mod.provisionNewAuthUser("old-orphan@x.com", "TempPass123!");
  assert.equal(r.ok, true);
  assert.equal(r.repairedOrphan, true);
  assert.deepEqual(passwordResets, ["auth-old"]);
  assert.equal(authUsers.filter((u) => u.email === "old-orphan@x.com").length, 1);
});

test("primitive: a FRESH login without a profile is treated as an in-flight creation → duplicate, no reset", async () => {
  authUsers.push({ email: "inflight@x.com", id: "auth-fresh", created_at: nowIso() });
  const mod = await import("../auth");
  const r: any = await mod.provisionNewAuthUser("inflight@x.com", "TempPass123!");
  assert.equal(r.ok, false);
  assert.equal(r.duplicate, true);
  assert.equal(passwordResets.length, 0);
});

// ── POST /auth/create-account — the atomic browser-facing endpoint ─

function createAccount(email: string, extra: Record<string, unknown> = {}) {
  return realFetch(`${base}/auth/create-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ email, password: "TempPass123!", name: "New Person", role: "client", ...extra }),
  }).then(async (r) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as any }));
}

test("create-account: concurrent same-email requests — one 200, one 409, exactly one profile", async () => {
  const [a, b] = await Promise.all([createAccount("atomic-race@x.com"), createAccount("atomic-race@x.com")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(profiles.filter((p) => p.email.toLowerCase() === "atomic-race@x.com").length, 1);
  assert.equal(authUsers.filter((u) => u.email === "atomic-race@x.com").length, 1);
});

test("create-account: a retry after success is a 409, never a second profile", async () => {
  const first = await createAccount("retry@x.com");
  assert.equal(first.status, 200);
  const retry = await createAccount("retry@x.com");
  assert.equal(retry.status, 409);
  assert.equal(retry.body.duplicate, true);
  assert.equal(profiles.filter((p) => p.email.toLowerCase() === "retry@x.com").length, 1);
});

test("create-account: an old orphaned login is repaired AND still yields exactly one profile", async () => {
  authUsers.push({ email: "orphan-create@x.com", id: "auth-oc", created_at: OLD });
  const r = await createAccount("orphan-create@x.com");
  assert.equal(r.status, 200);
  assert.equal(profiles.filter((p) => p.email.toLowerCase() === "orphan-create@x.com").length, 1);
  // and a further retry is now a duplicate
  const again = await createAccount("orphan-create@x.com");
  assert.equal(again.status, 409);
  assert.equal(profiles.filter((p) => p.email.toLowerCase() === "orphan-create@x.com").length, 1);
});

test("create-account: requires an admin JWT", async () => {
  const r = await realFetch(`${base}/auth/create-account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nojwt@x.com", password: "TempPass123!", name: "X", role: "client" }),
  });
  assert.equal(r.status, 403);
  assert.equal(profiles.filter((p) => p.email === "nojwt@x.com").length, 0);
});
