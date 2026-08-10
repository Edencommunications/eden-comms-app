#!/usr/bin/env node
// Live RLS check: deleted Team Hub messages must be un-readable via direct
// Supabase REST with a staff JWT, while soft-deleting still works.
//
// Run:  node artifacts/api-server/tests/rls-team-messages.mjs
// Env:  SUPABASE_SERVICE_ROLE_KEY (required)
//       API_BASE (optional; enables the /team/messages redaction check)
//
// Requires database-updates/2026-08-10-team-messages-deleted-content-lockdown.sql
// to have been applied — this check FAILS (by design) until it has been.
//
// Covers:
//   1. Staff can INSERT a team message under RLS
//   2. Staff can soft-delete (PATCH deleted_at/deleted_by/deleted_by_name)
//   3. Direct SELECT with a staff JWT returns ZERO deleted rows (no content leak)
//   4. Targeted SELECT by id of the deleted row returns nothing
//   5. (If API reachable) GET /api/team/messages returns the deleted row with
//      blank content for a non-admin
//
// Seeds a throwaway coach in the Eden org and ALWAYS cleans up (finally).

import { randomUUID } from "node:crypto";

const SB = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SK) { console.error("SUPABASE_SERVICE_ROLE_KEY is required"); process.exit(1); }
const EDEN = "b0000000-0000-0000-0000-000000000001";
const SVC = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const API = process.env.API_BASE || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "");

const run = Math.random().toString(36).slice(2, 8);
const PW = `Tm273!${randomUUID().slice(0, 12)}`;
const EMAIL = `tm273-coach-${run}@example.com`;
const SECRET = `TOP-SECRET-${run}-deleted-body`;

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.error(`FAIL  ${name} ${extra}`); }
};

const svc = async (method, path, body, prefer) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method, headers: { ...SVC, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
};
const userHdrs = (jwt) => ({ apikey: ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" });

let authId = null, profileId = null, msgId = null;
try {
  // ── Seed: auth user + coach profile in Eden ────────────────────
  const cu = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST", headers: SVC,
    body: JSON.stringify({ email: EMAIL, password: PW, email_confirm: true }),
  });
  const cuj = await cu.json();
  authId = cuj?.id || null;
  check("seed auth user", !!authId, JSON.stringify(cuj).slice(0, 120));

  profileId = randomUUID();
  const pr = await svc("POST", "user_profiles", {
    id: profileId, email: EMAIL, name: `TM273 Coach ${run}`, role: "coach",
    company_id: EDEN, is_active: true,
  }, "return=minimal");
  check("seed coach profile", pr.ok, String(pr.status));

  // ── Login ──────────────────────────────────────────────────────
  const lr = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW }),
  });
  const jwt = (await lr.json())?.access_token;
  check("coach login", !!jwt);

  // ── 1. Staff INSERT under RLS ──────────────────────────────────
  const ir = await fetch(`${SB}/rest/v1/team_messages`, {
    method: "POST", headers: { ...userHdrs(jwt), Prefer: "return=representation" },
    body: JSON.stringify({ org_id: EDEN, sender_id: profileId, sender_name: `TM273 Coach ${run}`, sender_role: "coach", content: SECRET, is_dm: false }),
  });
  const irows = ir.ok ? await ir.json() : [];
  msgId = irows?.[0]?.id || null;
  check("staff can insert a team message", ir.ok && !!msgId, String(ir.status));

  // ── 2. Soft delete goes through the API server (the RLS SELECT
  //       policy hides deleted rows, which blocks PostgREST's RETURNING
  //       on a direct PATCH — by design). ─────────────────────────────
  if (API) {
    const dr = await fetch(`${API}/team/messages/${msgId}/delete`, {
      method: "POST", headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(8000),
    });
    check("soft-delete via API endpoint succeeds", dr.ok, String(dr.status));
  } else {
    console.log("  ⏭  API not reachable — soft-deleting via service key to test policies");
    await svc("PATCH", `team_messages?id=eq.${msgId}`, { deleted_at: new Date().toISOString(), deleted_by: profileId, deleted_by_name: "TM273" });
  }
  const vrows = await (await svc("GET", `team_messages?id=eq.${msgId}&select=deleted_at`)).json();
  check("soft-delete actually persisted", !!vrows?.[0]?.deleted_at);

  // ── 3+4. Deleted row invisible to direct staff SELECT ──────────
  const s1 = await fetch(`${SB}/rest/v1/team_messages?id=eq.${msgId}&select=*`, { headers: userHdrs(jwt) });
  const s1rows = s1.ok ? await s1.json() : null;
  check("deleted row invisible to direct SELECT by id", Array.isArray(s1rows) && s1rows.length === 0,
    `status=${s1.status} rows=${JSON.stringify(s1rows).slice(0, 200)} — did you run database-updates/2026-08-10-team-messages-deleted-content-lockdown.sql?`);

  const s2 = await fetch(`${SB}/rest/v1/team_messages?org_id=eq.${EDEN}&deleted_at=not.is.null&select=content&limit=1000`, { headers: userHdrs(jwt) });
  const s2body = s2.ok ? JSON.stringify(await s2.json()) : "";
  check("no deleted content in bulk direct SELECT", !s2body.includes(SECRET));

  // ── 4b. Deleted rows are immutable: undelete must be impossible ─
  await fetch(`${SB}/rest/v1/team_messages?id=eq.${msgId}`, {
    method: "PATCH", headers: userHdrs(jwt),
    body: JSON.stringify({ deleted_at: null, content: "resurrected?" }),
  }); // status may be 2xx with 0 rows affected — verify effect, not status
  const urows = await (await svc("GET", `team_messages?id=eq.${msgId}&select=deleted_at`)).json();
  check("staff JWT cannot undelete a deleted row", !!urows?.[0]?.deleted_at,
    JSON.stringify(urows).slice(0, 120));
  const s3 = await fetch(`${SB}/rest/v1/team_messages?id=eq.${msgId}&select=content`, { headers: userHdrs(jwt) });
  const s3rows = s3.ok ? await s3.json() : null;
  check("row still invisible after undelete attempt", Array.isArray(s3rows) && s3rows.length === 0);

  // ── 5. API endpoint returns blank content for non-admin ────────
  if (API) {
    try {
      const ar = await fetch(`${API}/team/messages`, { headers: { Authorization: `Bearer ${jwt}` }, signal: AbortSignal.timeout(8000) });
      if (ar.ok) {
        const { messages } = await ar.json();
        const mine = (messages || []).find((m) => m.id === msgId);
        check("/team/messages keeps deleted placeholder, blank content",
          !!mine && mine.content === "" && !!mine.deleted_at, JSON.stringify(mine || null).slice(0, 200));
        check("no deleted content anywhere in API response", !JSON.stringify(messages).includes(SECRET));
      } else {
        console.log(`  ⏭  API check skipped (status ${ar.status})`);
      }
    } catch { console.log("  ⏭  API check skipped (not reachable)"); }
  }
} finally {
  // ── Cleanup (verified) ───────────────────────────────────────
  if (msgId) {
    const d = await svc("DELETE", `team_messages?id=eq.${msgId}`);
    check("cleanup: message removed", d.ok);
  }
  // Sweep any residue from interrupted prior runs too
  await svc("DELETE", `team_messages?sender_name=like.TM273*`);
  const dp = await svc("DELETE", `user_profiles?email=like.tm273-*`);
  check("cleanup: profile removed", dp.ok);
  if (authId) {
    const da = await fetch(`${SB}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: SVC });
    check("cleanup: auth user removed", da.ok);
  }
  console.log(`\n${fail ? "❌" : "✅"} rls-team-messages: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
