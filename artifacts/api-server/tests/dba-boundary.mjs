#!/usr/bin/env node
// DBA org-boundary safety tests (Task: repeatable verification net).
//
// Seeds throwaway users + a throwaway DBA, exercises the live API's access
// rules, and ALWAYS cleans up (finally block) — including auth logins,
// profiles, and every admin_settings row it created. Safe to re-run anytime.
//
// Run:  node artifacts/api-server/tests/dba-boundary.mjs
// Env:  SUPABASE_SERVICE_ROLE_KEY (required)
//       API_BASE (default https://$REPLIT_DEV_DOMAIN/api)
//
// Covers:
//   1. Cross-org userId rejected by /dba/delegate-set
//   2. Client login rejected by /dba/list (DBA-member logins share role 'client')
//   3. Non-admin staff get scope "mine" and never another coach's DBAs
//   4. Grant -> immediate access on manage routes (chat-config, event-save, huddles)
//   5. Revoke -> immediate 403 on the same routes
//   6. Cross-org staff token rejected on manage + member-facing routes
//      (chat-config, event-save, content) and never sees another org's DBAs
//   7. Concurrency: simultaneous /dba/save + /dba/delegate-set lose neither write
//
// Cleanup is verified: every delete must return 2xx, test-generated audit
// rows are removed, and final sweeps (profiles, auth users, settings keys)
// also catch residue from interrupted PRIOR runs (any bt166-* identity).

import { randomUUID } from "node:crypto";

const SB = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SK) { console.error("SUPABASE_SERVICE_ROLE_KEY is required"); process.exit(1); }
const API = process.env.API_BASE || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
const EDEN = "b0000000-0000-0000-0000-000000000001";
const SVC = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };

const run = Math.random().toString(36).slice(2, 8);
const PW = `Bt166!${randomUUID().slice(0, 12)}`;
const mail = (tag) => `bt166-${tag}-${run}@example.com`;

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name} ${extra}`); }
};

const sb = async (method, path, body, prefer) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method, headers: { ...SVC, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    if (method === "GET") return [];
    throw new Error(`${method} ${path} → ${r.status} ${await r.text().catch(() => "")}`);
  }
  return r.status === 204 ? null : r.json().catch(() => null);
};

const api = async (token, method, path, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

// ── seed helpers ─────────────────────────────────────────────────
const authIds = [], profileIds = [], settingsKeys = [];

async function seedUser(tag, role, companyId) {
  const email = mail(tag);
  const id = randomUUID();
  const prof = await sb("POST", "user_profiles", { id, email, name: `BT166 ${tag}`, role, company_id: companyId }, "return=representation");
  if (!prof?.[0]) throw new Error(`profile seed failed for ${tag}`);
  profileIds.push(id);
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST", headers: SVC,
    body: JSON.stringify({ email, password: PW, email_confirm: true }),
  });
  const u = await r.json();
  if (!u?.id) throw new Error(`auth seed failed for ${tag}: ${JSON.stringify(u)}`);
  authIds.push(u.id);
  return { id, email };
}

async function login(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await r.json();
  if (!j?.access_token) throw new Error(`login failed for ${email}`);
  return j.access_token;
}

async function readDbaRow(dbaId) {
  const rows = await sb("GET", `admin_settings?company_id=eq.${EDEN}&key=eq.dba:${dbaId}&select=value`);
  const v = rows?.[0]?.value;
  return typeof v === "string" ? JSON.parse(v) : v;
}

// ── Residue sweep ────────────────────────────────────────────────
// Every resource this suite creates is DISCOVERABLE without knowing the
// run's random ids: profiles/auth use bt166-* emails, test DBAs use bt166-*
// slugs (their uuid then keys every per-DBA settings row), audit rows point
// at those uuids/actor ids. Run before seeding (recovers interrupted prior
// runs) and again in the finally block; returns leftover descriptions.
async function sweepResidue() {
  const problems = [];

  // 1. Prior/current test DBAs — find by bt166-* slug, then purge EVERY
  //    settings row keyed by that uuid (dba:<id>, dba_events:<id>,
  //    dba_chat:<id>, dba_huddles:<id>, …) plus its audit rows.
  //    settingsKeys also feeds ids in, so the current run's DBA is purged
  //    even if its primary row was already removed.
  // Exact per-DBA key namespaces the API writes (see routes/dba.ts):
  const DBA_KEY_PREFIXES = ["dba", "dba_events", "dba_chat", "dba_huddles"];
  const keysFor = (id) => DBA_KEY_PREFIXES.map((pfx) => `${pfx}:${id}`);
  const dbaIds = new Set(settingsKeys.map((k) => k.slice(4)));
  const rows = await sb("GET", `admin_settings?company_id=eq.${EDEN}&key=like.dba%3A*&select=key,value`);
  for (const row of rows || []) {
    let v; try { v = typeof row.value === "string" ? JSON.parse(row.value) : row.value; } catch { continue; }
    if (/^bt166-/.test(String(v?.slug || ""))) dbaIds.add(String(v.id || row.key.slice(4)));
  }
  for (const id of dbaIds) {
    // Exact key names only, scoped to Eden — never a broad substring match
    // (a DBA uuid could legitimately appear inside unrelated settings values).
    await sb("DELETE", `admin_settings?company_id=eq.${EDEN}&key=in.(${keysFor(id).join(",")})`);
    await sb("DELETE", `audit_logs?target_type=eq.dba&target_id=eq.${id}`);
  }

  // 2. Audit rows by throwaway actors, then the profiles themselves
  const profs = await sb("GET", `user_profiles?email=like.bt166-*&select=id`);
  const ids = (profs || []).map((p) => p.id);
  if (ids.length) await sb("DELETE", `audit_logs?actor_id=in.(${ids.join(",")})`);
  await sb("DELETE", `user_profiles?email=like.bt166-*`);

  // 3. Auth logins by email pattern
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`${SB}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: SVC });
    const j = await r.json().catch(() => null);
    const users = j?.users || [];
    for (const u of users) {
      if (/^bt166-/.test(u.email || "")) {
        const d = await fetch(`${SB}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: SVC });
        if (!d.ok) problems.push(`auth login ${u.email} could not be deleted (${d.status})`);
      }
    }
    if (users.length < 200) break;
  }

  // 4. Verify: nothing test-shaped survives anywhere
  const leftProfiles = await sb("GET", `user_profiles?email=like.bt166-*&select=id,email`);
  if ((leftProfiles || []).length) problems.push(`profiles: ${JSON.stringify(leftProfiles)}`);
  const leftDbas = (await sb("GET", `admin_settings?key=like.dba%3A*&select=value`) || [])
    .filter((r2) => { try { const v = typeof r2.value === "string" ? JSON.parse(r2.value) : r2.value; return /^bt166-/.test(String(v?.slug || "")); } catch { return false; } });
  if (leftDbas.length) problems.push(`test DBA rows: ${leftDbas.length}`);
  for (const id of dbaIds) {
    // per-DBA config rows (events/chat/huddles): none of the exact keys may survive
    const leftKeys = await sb("GET", `admin_settings?company_id=eq.${EDEN}&key=in.(${keysFor(id).join(",")})&select=key`);
    if ((leftKeys || []).length) problems.push(`settings keys for ${id}: ${JSON.stringify(leftKeys)}`);
  }
  if (ids.length) {
    const leftAudit = await sb("GET", `audit_logs?actor_id=in.(${ids.join(",")})&select=id`);
    if ((leftAudit || []).length) problems.push(`audit rows: ${JSON.stringify(leftAudit)}`);
  }
  return problems;
}

// ── main ─────────────────────────────────────────────────────────
(async () => {
try {
  console.log("Pre-run sweep (recovers residue from any interrupted prior run)…");
  const prior = await sweepResidue();
  if (prior.length) throw new Error("Pre-run sweep could not clear residue:\n" + prior.join("\n"));

  console.log("Seeding throwaway users + DBA…");
  // A second real org id for the cross-org user (any non-Eden org works; the
  // seeded user is temporary — the org itself is never modified).
  const orgs = await sb("GET", `organizations?id=neq.${EDEN}&is_active=eq.true&select=id&limit=1`);
  const ORG_B = orgs?.[0]?.id;
  if (!ORG_B) throw new Error("Need at least one non-Eden org in the database for cross-org checks");

  const admin = await seedUser("admin", "super_admin", EDEN);
  const coach = await seedUser("coach", "coach", EDEN);
  const staff = await seedUser("staff", "coach", EDEN);   // delegate target
  const client = await seedUser("client", "client", EDEN);
  const outsider = await seedUser("xorg", "coach", ORG_B); // cross-org staff

  const [tAdmin, tCoach, tStaff, tClient, tOut] = await Promise.all(
    [admin, coach, staff, client, outsider].map((u) => login(u.email)),
  );

  // DBA under Eden, coached by `coach`, with `client` as a member entry
  const dbaId = randomUUID();
  const dba = {
    id: dbaId, name: `BT166 DBA ${run}`, slug: `bt166-${run}`,
    coach_id: coach.id, coach_name: "BT166 coach", logo_url: null,
    brand_color: null, brand_colors: [], is_active: true,
    created_at: new Date().toISOString(),
    members: [{ id: client.id, email: client.email, name: "BT166 client", added_at: new Date().toISOString(), pure: true }],
    delegates: [], connect: [], learn_course_ids: [],
  };
  settingsKeys.push(`dba:${dbaId}`);
  await sb("POST", "admin_settings?on_conflict=company_id,key",
    { company_id: EDEN, key: `dba:${dbaId}`, value: JSON.stringify(dba) }, "resolution=merge-duplicates");
  // config keys the API may create for this DBA (cleaned up as a sweep below)

  console.log("\n1. Cross-org delegation rejected");
  let r = await api(tAdmin, "POST", "/dba/delegate-set", { dbaId, userId: outsider.id, allowed: true });
  check("delegate-set with cross-org userId → 404", r.status === 404, `got ${r.status}`);
  check("record has no delegates after rejected grant", ((await readDbaRow(dbaId))?.delegates || []).length === 0);

  console.log("\n2. Client / member logins rejected by /dba/list");
  r = await api(tClient, "GET", "/dba/list");
  check("client (also a DBA member) → 403", r.status === 403, `got ${r.status}`);

  console.log("\n3. Staff see only their own scope");
  r = await api(tStaff, "GET", "/dba/list");
  check("undelegated staff → scope mine, empty list", r.status === 200 && r.json?.scope === "mine" && (r.json?.dbas || []).length === 0, JSON.stringify(r.json));
  r = await api(tCoach, "GET", "/dba/list");
  check("coach sees exactly their own DBA", r.status === 200 && r.json?.scope === "mine" && r.json?.dbas?.length === 1 && r.json.dbas[0].id === dbaId);

  console.log("\n4. Grant takes effect immediately");
  r = await api(tStaff, "GET", `/dba/chat-config?id=${dbaId}`);
  check("pre-grant: chat-config → 403", r.status === 403, `got ${r.status}`);
  r = await api(tAdmin, "POST", "/dba/delegate-set", { dbaId, userId: staff.id, allowed: true });
  check("grant accepted", r.status === 200 && r.json?.delegates?.length === 1);
  r = await api(tStaff, "GET", `/dba/chat-config?id=${dbaId}`);
  check("post-grant: chat-config → 200 with can_manage", r.status === 200 && r.json?.can_manage === true, `got ${r.status}`);
  r = await api(tStaff, "GET", `/dba/huddles?id=${dbaId}`);
  check("post-grant: huddles → 200 with can_start", r.status === 200 && r.json?.can_start === true, `got ${r.status}`);
  r = await api(tStaff, "POST", "/dba/event-save", { dbaId, event: { title: "BT166 event", start: new Date(Date.now() + 864e5).toISOString() } });
  check("post-grant: event-save → 200", r.status === 200, `got ${r.status} ${JSON.stringify(r.json)}`);
  r = await api(tStaff, "GET", "/dba/list");
  check("post-grant: staff list now includes the DBA", r.status === 200 && r.json?.dbas?.some((d) => d.id === dbaId));

  console.log("\n5. Revoke takes effect immediately");
  r = await api(tAdmin, "POST", "/dba/delegate-set", { dbaId, userId: staff.id, allowed: false });
  check("revoke accepted", r.status === 200 && (r.json?.delegates || []).length === 0);
  r = await api(tStaff, "GET", `/dba/chat-config?id=${dbaId}`);
  check("post-revoke: chat-config → 403", r.status === 403, `got ${r.status}`);
  r = await api(tStaff, "GET", `/dba/huddles?id=${dbaId}`);
  check("post-revoke: huddles → 403", r.status === 403, `got ${r.status}`);
  r = await api(tStaff, "POST", "/dba/event-save", { dbaId, event: { title: "BT166 sneaky", start: new Date().toISOString() } });
  check("post-revoke: event-save → 403", r.status === 403, `got ${r.status}`);
  r = await api(tStaff, "GET", "/dba/list");
  check("post-revoke: staff list empty again", r.status === 200 && (r.json?.dbas || []).length === 0);

  console.log("\n6. Cross-org staff walled off entirely");
  r = await api(tOut, "GET", `/dba/chat-config?id=${dbaId}`);
  check("cross-org staff: chat-config → 403", r.status === 403, `got ${r.status}`);
  r = await api(tOut, "POST", "/dba/event-save", { dbaId, event: { title: "x", start: new Date().toISOString() } });
  check("cross-org staff: event-save → 403", r.status === 403, `got ${r.status}`);
  r = await api(tOut, "GET", `/dba/content?id=${dbaId}`);
  check("cross-org staff: content → 403", r.status === 403, `got ${r.status}`);
  r = await api(tOut, "GET", "/dba/list");
  check(
    "cross-org staff: list is exactly scope 'mine' and empty",
    r.status === 200 && r.json?.scope === "mine" && (r.json?.dbas || []).length === 0,
    `got ${r.status} ${JSON.stringify(r.json)}`,
  );

  console.log("\n7. Concurrent edit + delegation — neither write lost");
  const newName = `BT166 renamed ${run}`;
  const [rSave, rDel] = await Promise.all([
    api(tAdmin, "POST", "/dba/save", { id: dbaId, name: newName, slug: dba.slug }),
    api(tAdmin, "POST", "/dba/delegate-set", { dbaId, userId: staff.id, allowed: true }),
  ]);
  check("both concurrent writes accepted", rSave.status === 200 && rDel.status === 200, `${rSave.status}/${rDel.status}`);
  const finalRow = await readDbaRow(dbaId);
  check("rename survived", finalRow?.name === newName, `name=${finalRow?.name}`);
  check("delegation survived", (finalRow?.delegates || []).some((d) => d.id === staff.id), JSON.stringify(finalRow?.delegates));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error("SUITE ERROR:", e.message || e);
  process.exitCode = 1;
} finally {
  console.log("\nCleaning up…");
  try {
    const problems = await sweepResidue();
    if (problems.length) { console.error("RESIDUE LEFT:\n" + problems.join("\n")); process.exitCode = 1; }
    else console.log("Cleanup complete — no residue (profiles, auth, settings, audit all verified).");
  } catch (e) {
    console.error("CLEANUP ERROR (manual sweep needed for bt166-* rows):", e.message || e);
    process.exitCode = 1;
  }
}
})();
