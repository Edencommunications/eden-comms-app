#!/usr/bin/env node
// Live RLS check: staff can no longer grant themselves extra tab access by
// writing their own staff_meta:* row directly via Supabase REST.
//
// Run:  node artifacts/api-server/tests/rls-staff-meta-lockdown.mjs
// Env:  SUPABASE_SERVICE_ROLE_KEY  (required)
//       API_BASE                   (optional — enables the /api/staff/meta check)
//
// Requires database-updates/2026-08-18-staff-meta-admin-only.sql to have been
// applied — this script FAILS (by design) until it has been.
//
// Covers:
//   1. Staff can SELECT their own staff_meta row (App.tsx tab-gating still works)
//   2. Staff CANNOT INSERT a new staff_meta:* key via direct REST (0 rows upserted)
//   3. Staff CANNOT UPDATE their own staff_meta row via direct REST (no effect)
//   4. Staff CAN still write non-staff_meta admin_settings keys (seen-state, etc.)
//   5. Admin write via POST /api/staff/meta succeeds (requires API_BASE)
//
// Seeds throwaway auth users + profiles in the Eden org and ALWAYS cleans up.

import { randomUUID } from "node:crypto";

const SB = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";

const SK = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SK) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(1);
}

const EDEN = "b0000000-0000-0000-0000-000000000001";
const SVC  = { apikey: SK, Authorization: `Bearer ${SK}`, "Content-Type": "application/json" };
const API  = process.env.API_BASE ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}/api` : "");

const run = Math.random().toString(36).slice(2, 8);

// Two throwaway accounts: a VA (staff, non-admin) and a super_admin.
const VA_PW    = `Sm319va!${randomUUID().slice(0, 10)}`;
const VA_EMAIL = `sm319-va-${run}@example.com`;
const AD_PW    = `Sm319ad!${randomUUID().slice(0, 10)}`;
const AD_EMAIL = `sm319-admin-${run}@example.com`;

let pass = 0, fail = 0;
const check = (name, ok, hint = "") => {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else    { fail++; console.error(`FAIL  ${name}${hint ? "\n      " + hint : ""}`); }
};

// ── Low-level helpers ────────────────────────────────────────────────────────

const svc = (method, path, body, prefer) =>
  fetch(`${SB}/rest/v1/${path}`, {
    method,
    headers: { ...SVC, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

const userHdrs = (jwt) => ({
  apikey: ANON,
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
});

async function createAuthUser(email, password) {
  const r = await fetch(`${SB}/auth/v1/admin/users`, {
    method: "POST", headers: SVC,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const j = await r.json();
  return j?.id || null;
}

async function deleteAuthUser(id) {
  if (!id) return;
  await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: SVC });
}

async function login(email, password) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return (await r.json())?.access_token || null;
}

// Track IDs for cleanup
let vaAuthId = null, vaProfileId = null;
let adAuthId = null, adProfileId = null;
const settingKeys = []; // admin_settings keys to delete

try {
  // ── Seed VA (role='va') ──────────────────────────────────────────────────
  vaAuthId    = await createAuthUser(VA_EMAIL, VA_PW);
  vaProfileId = randomUUID();
  check("seed VA auth user",    !!vaAuthId);

  const vpr = await svc("POST", "user_profiles", {
    id: vaProfileId, email: VA_EMAIL, name: `SM319 VA ${run}`,
    role: "va", company_id: EDEN, is_active: true,
  }, "return=minimal");
  check("seed VA profile", vpr.ok, `HTTP ${vpr.status}`);

  // Pre-seed a staff_meta row for the VA via service key (read check needs data)
  const metaKey = `staff_meta:${vaProfileId}`;
  const seededMeta = { label: null, tabs: ["team"] };
  const seedR = await svc("POST", "admin_settings?on_conflict=company_id,key", {
    company_id: EDEN, key: metaKey,
    value: JSON.stringify(seededMeta),
  }, "resolution=merge-duplicates,return=minimal");
  check("pre-seed staff_meta row via service key", seedR.ok, `HTTP ${seedR.status}`);
  settingKeys.push(metaKey);

  // ── Seed super_admin ─────────────────────────────────────────────────────
  adAuthId    = await createAuthUser(AD_EMAIL, AD_PW);
  adProfileId = randomUUID();
  check("seed admin auth user", !!adAuthId);

  const apr = await svc("POST", "user_profiles", {
    id: adProfileId, email: AD_EMAIL, name: `SM319 Admin ${run}`,
    role: "super_admin", company_id: EDEN, is_active: true,
  }, "return=minimal");
  check("seed admin profile", apr.ok, `HTTP ${apr.status}`);

  // ── Log in as the VA ─────────────────────────────────────────────────────
  const vaJwt = await login(VA_EMAIL, VA_PW);
  check("VA login", !!vaJwt);
  if (!vaJwt) throw new Error("VA login failed; cannot continue checks");

  // ── CHECK 1: Staff can SELECT their own staff_meta row ───────────────────
  const s1 = await fetch(
    `${SB}/rest/v1/admin_settings?key=eq.${encodeURIComponent(metaKey)}&select=key,value`,
    { headers: userHdrs(vaJwt) },
  );
  const s1rows = s1.ok ? await s1.json() : [];
  check(
    "1. Staff SELECT own staff_meta row works (tab-gating reads still ok)",
    Array.isArray(s1rows) && s1rows.length === 1 && s1rows[0]?.key === metaKey,
    `status=${s1.status} rows=${JSON.stringify(s1rows).slice(0, 200)}`,
  );

  // ── CHECK 2: Staff CANNOT INSERT a staff_meta row ────────────────────────
  // Attempts to insert a key that gives all tabs (self-escalation scenario).
  const hackKey = `staff_meta:${randomUUID()}`;
  const ins = await fetch(`${SB}/rest/v1/admin_settings`, {
    method: "POST",
    headers: { ...userHdrs(vaJwt), Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: EDEN, key: hackKey,
      value: JSON.stringify({ label: "HACKED", tabs: ["home", "msgs", "team", "learn", "community"] }),
    }),
  });
  const insRows = ins.ok ? await ins.json() : [];
  const insertBlocked = !ins.ok || (Array.isArray(insRows) && insRows.length === 0);
  check(
    "2. Staff cannot INSERT a staff_meta:* row (RLS blocks self-escalation)",
    insertBlocked,
    `status=${ins.status} rows=${JSON.stringify(insRows).slice(0, 200)}\n` +
    `      → Run database-updates/2026-08-18-staff-meta-admin-only.sql first`,
  );
  // If somehow something leaked through, clean it up
  if (!insertBlocked) await svc("DELETE", `admin_settings?key=eq.${encodeURIComponent(hackKey)}&company_id=eq.${EDEN}`);

  // Verify via service key that the row really wasn't inserted
  const hackCheck = await (await svc("GET", `admin_settings?key=eq.${encodeURIComponent(hackKey)}&select=key`)).json();
  check(
    "2b. No staff_meta hack row exists in DB (confirmed via service key)",
    !Array.isArray(hackCheck) || hackCheck.length === 0,
    `found: ${JSON.stringify(hackCheck).slice(0, 120)}`,
  );

  // ── CHECK 3: Staff CANNOT UPDATE their own staff_meta row ────────────────
  const upd = await fetch(
    `${SB}/rest/v1/admin_settings?key=eq.${encodeURIComponent(metaKey)}&company_id=eq.${EDEN}`,
    {
      method: "PATCH",
      headers: { ...userHdrs(vaJwt), Prefer: "return=representation" },
      body: JSON.stringify({
        value: JSON.stringify({ label: "SELF-GRANTED", tabs: ["home", "msgs", "team", "learn", "community"] }),
      }),
    },
  );
  const updRows = upd.ok ? await upd.json() : [];
  // Verify actual DB state — PostgREST may return 200 with 0 matched rows
  const afterR = await (await svc("GET", `admin_settings?key=eq.${encodeURIComponent(metaKey)}&select=value`)).json();
  const afterMeta = (() => { try { return JSON.parse(afterR?.[0]?.value || "{}"); } catch { return {}; } })();
  const noSelfGrant =
    afterMeta?.label !== "SELF-GRANTED" &&
    !(Array.isArray(afterMeta?.tabs) && afterMeta.tabs.includes("learn") && afterMeta.tabs.includes("community"));
  check(
    "3. Staff cannot UPDATE their own staff_meta row (write has no effect)",
    noSelfGrant,
    `actual DB value after PATCH attempt: ${JSON.stringify(afterMeta)}\n` +
    `      → Run database-updates/2026-08-18-staff-meta-admin-only.sql first`,
  );

  // ── CHECK 4: Staff CAN still write non-staff_meta admin_settings keys ────
  // Simulates writing a seen-state or reaction row (common staff actions).
  const seenKey = `seen:${vaProfileId}:sm319-${run}`;
  settingKeys.push(seenKey);
  const seenR = await fetch(`${SB}/rest/v1/admin_settings`, {
    method: "POST",
    headers: { ...userHdrs(vaJwt), Prefer: "return=minimal" },
    body: JSON.stringify({ company_id: EDEN, key: seenKey, value: "true" }),
  });
  check(
    "4. Staff CAN write non-staff_meta admin_settings keys (seen-state still works)",
    seenR.ok || seenR.status === 201,
    `status=${seenR.status} — other staff-writable keys must still work after the lockdown`,
  );

  // ── CHECK 5: Admin write via /api/staff/meta succeeds ────────────────────
  if (API) {
    const adJwt = await login(AD_EMAIL, AD_PW);
    check("admin login for API check", !!adJwt);

    if (adJwt) {
      const apiR = await fetch(`${API}/staff/meta`, {
        method: "POST",
        headers: { ...userHdrs(adJwt), Authorization: `Bearer ${adJwt}` },
        body: JSON.stringify({
          profileId: vaProfileId,
          label: "SM319 Probe",
          tabs: ["team", "msgs"],
        }),
        signal: AbortSignal.timeout(10_000),
      }).catch((e) => ({ ok: false, _err: String(e) }));

      if (apiR._err) {
        console.log(`  ⏭  5. /api/staff/meta not reachable: ${apiR._err}`);
      } else {
        const apiBody = apiR.ok ? await apiR.json().catch(() => ({})) : {};
        check(
          "5. Admin write via /api/staff/meta succeeds",
          apiR.ok && apiBody?.ok === true,
          `status=${apiR.status} body=${JSON.stringify(apiBody).slice(0, 200)}`,
        );

        // Confirm the row was actually updated in the DB
        const apiAfter = await (await svc("GET", `admin_settings?key=eq.${encodeURIComponent(metaKey)}&select=value`)).json();
        const apiMeta  = (() => { try { return JSON.parse(apiAfter?.[0]?.value || "{}"); } catch { return {}; } })();
        check(
          "5b. API write actually persisted the new tab list",
          Array.isArray(apiMeta?.tabs) && apiMeta.tabs.includes("msgs"),
          `stored: ${JSON.stringify(apiMeta)}`,
        );
      }
    }
  } else {
    console.log("  ⏭  5. API_BASE not configured — /api/staff/meta check skipped");
    console.log(`        Set API_BASE=https://<domain>/api and re-run to test the admin write path.`);
  }

} finally {
  // ── Cleanup — always runs ────────────────────────────────────────────────
  for (const k of settingKeys) {
    await svc("DELETE", `admin_settings?key=eq.${encodeURIComponent(k)}&company_id=eq.${EDEN}`).catch(() => {});
  }
  if (vaProfileId) {
    const dp = await svc("DELETE", `user_profiles?id=eq.${vaProfileId}`);
    check("cleanup: VA profile removed", dp.ok, `HTTP ${dp.status}`);
  }
  if (adProfileId) {
    const dp = await svc("DELETE", `user_profiles?id=eq.${adProfileId}`);
    check("cleanup: admin profile removed", dp.ok, `HTTP ${dp.status}`);
  }
  await deleteAuthUser(vaAuthId);
  await deleteAuthUser(adAuthId);
  // Sweep any residue from interrupted prior runs
  await svc("DELETE", `admin_settings?key=like.sm319-*&company_id=eq.${EDEN}`).catch(() => {});
  await svc("DELETE", `user_profiles?email=like.sm319-*`).catch(() => {});

  const icon = fail ? "❌" : "✅";
  console.log(`\n${icon} rls-staff-meta-lockdown: ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nMost likely cause: the RLS lockdown SQL has not been run yet.");
    console.log("Paste and run database-updates/2026-08-18-staff-meta-admin-only.sql");
    console.log("in Supabase → SQL Editor, then re-run this probe.\n");
  }
  process.exit(fail ? 1 : 0);
}
