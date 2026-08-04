// Integration tests for the auth provisioning endpoints.
// Requires the API server dev workflow to be running (proxied on localhost:80).
//   node --test tests/auth.integration.mjs
import test from "node:test";
import assert from "node:assert/strict";

const API = process.env.API_BASE || "http://localhost:80/api";
const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";

const post = (path, body, headers = {}) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const target = { email: "authztest-should-never-exist@example.com", password: "Whatever123!" };

test("provision rejects requests with no token", async () => {
  const r = await post("/auth/provision", target);
  assert.equal(r.status, 403);
});

test("provision rejects a forged/garbage token", async () => {
  const r = await post("/auth/provision", target, { Authorization: "Bearer forged.token.value" });
  assert.equal(r.status, 403);
});

test("provision rejects the public anon key used as a token", async () => {
  const r = await post("/auth/provision", target, { Authorization: `Bearer ${SUPABASE_ANON}` });
  assert.equal(r.status, 403);
});

test("provision rejects x-admin-id spoofing (legacy header no longer trusted)", async () => {
  const r = await post("/auth/provision", target, { "x-admin-id": "00000000-0000-0000-0000-000000000000" });
  assert.equal(r.status, 403);
});

test("migrate rejects unknown/wrong credentials with 401", async () => {
  const r = await post("/auth/migrate", { email: "nobody-here@example.com", password: "nope1234" });
  assert.equal(r.status, 401);
});

test("migrate rate-limits repeated attempts for the same email", async () => {
  const email = `ratelimit-${Date.now()}@example.com`;
  let last = 0;
  for (let i = 0; i < 7; i++) {
    const r = await post("/auth/migrate", { email, password: "wrongpass" });
    last = r.status;
  }
  assert.equal(last, 429);
});

// ── update-identity (task: fix a typo in a user's name/email) ──
test("update-identity rejects requests with no token", async () => {
  const r = await post("/auth/update-identity", { id: "00000000-0000-0000-0000-000000000000", email: "x@example.com" });
  assert.equal(r.status, 403);
});

test("update-identity rejects a forged token", async () => {
  const r = await post("/auth/update-identity", { id: "00000000-0000-0000-0000-000000000000", name: "X" },
    { Authorization: "Bearer forged.token.value" });
  assert.equal(r.status, 403);
});

test("update-identity rejects the public anon key used as a token", async () => {
  const r = await post("/auth/update-identity", { id: "00000000-0000-0000-0000-000000000000", name: "X" },
    { Authorization: `Bearer ${SUPABASE_ANON}` });
  assert.equal(r.status, 403);
});

test("demo-session endpoint is retired (404)", async () => {
  const r = await post("/auth/demo-session", { email: "admin@edencomms.io", password: "Admin1234!" });
  assert.equal(r.status, 404);
});
