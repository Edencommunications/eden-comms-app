#!/usr/bin/env node
// One command to run every live-Supabase safety check before shipping.
//
// Run:  pnpm --filter @workspace/api-server run test:live
// Env:  SUPABASE_SERVICE_ROLE_KEY (required)
//
// Runs every standalone live-integration check in sequence with clear
// per-check pass/fail output. Checks that need the API server dev workflow
// running (dba-boundary, auth.integration) are gated behind a preflight
// ping — if the server isn't reachable they're reported as SKIPPED with
// instructions, and the suite exits non-zero so a skip can't slip by
// unnoticed before shipping.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(here, "..");

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is required to run the live suite.");
  process.exit(1);
}

// ── Preflight: is the API server reachable? ─────────────────────
const API = process.env.API_BASE || `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
let apiUp = false;
try {
  const r = await fetch(`${API}/healthz`, { signal: AbortSignal.timeout(5000) });
  apiUp = r.ok;
} catch { /* not reachable */ }

// ── Check definitions ───────────────────────────────────────────
// mode "test" → node --test <file>; mode "script" → node <file>
const CHECKS = [
  { name: "realtime-publication (Supabase Realtime delivery)", file: "realtime-publication.mjs", mode: "test" },
  { name: "staff-meta-realtime (instant staff-tab propagation)", file: "staff-meta-realtime.mjs", mode: "test" },
  { name: "community-notify-throttle (push throttle & exclusions)", file: "community-notify-throttle.mjs", mode: "script" },
  { name: "push-categories (per-category push preferences)", file: "push-categories.mjs", mode: "script" },
  { name: "dba-boundary (DBA org-boundary access rules)", file: "dba-boundary.mjs", mode: "script", needsApi: true },
  { name: "auth.integration (auth provisioning hardening)", file: "auth.integration.mjs", mode: "test", needsApi: true },
];

const results = [];
for (const check of CHECKS) {
  console.log(`\n━━━ ${check.name} ━━━`);
  if (check.needsApi && !apiUp) {
    console.log(`⏭️  SKIPPED — API server not reachable at ${API}. Start the "API Server" workflow and re-run.`);
    results.push({ ...check, status: "skipped" });
    continue;
  }
  const args = check.mode === "test" ? ["--test", path.join("tests", check.file)] : [path.join("tests", check.file)];
  const env = { ...process.env };
  if (check.needsApi && check.file === "auth.integration.mjs" && !process.env.API_BASE) {
    env.API_BASE = API; // auth.integration defaults to localhost:80; align with preflight target
  }
  const r = spawnSync("node", args, { cwd: pkgDir, stdio: "inherit", env });
  results.push({ ...check, status: r.status === 0 ? "pass" : "fail" });
}

// ── Summary ─────────────────────────────────────────────────────
console.log("\n══════════ LIVE SUITE SUMMARY ══════════");
for (const r of results) {
  const icon = r.status === "pass" ? "✅ PASS" : r.status === "skipped" ? "⏭️  SKIP" : "❌ FAIL";
  console.log(`${icon}  ${r.name}`);
}
const failed = results.filter((r) => r.status === "fail").length;
const skipped = results.filter((r) => r.status === "skipped").length;
if (failed) {
  console.log(`\n${failed} check(s) FAILED.`);
  process.exit(1);
}
if (skipped) {
  console.log(`\n${skipped} check(s) SKIPPED (API server not running). Not safe to ship until they run.`);
  process.exit(1);
}
console.log("\nAll live-Supabase safety checks passed. ✅");
