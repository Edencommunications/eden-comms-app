// metaAdsTokenExpiry.test.ts — tests for the daily Meta token expiry check.
//
// Covers Task 209's acceptance list:
//  • ≤7-day warning fires once (not again same day OR later days, same token)
//  • expired notice fires once
//  • a new token (different fingerprint) re-arms BOTH warnings
//  • unreachable Meta skips silently and releases the day's claim for retry
//  • the CAS claim prevents double-notify from two concurrent scheduler passes
//
// Supabase AND the Meta Graph API are mocked at the global-fetch level, so
// checkTokenExpiries() runs its real logic end-to-end against an in-memory
// admin_settings/notifications store.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const GRAPH_HOST = "graph.facebook.com";
const ORG = "b0000000-0000-0000-0000-000000000001";
const ADMIN = "a1111111-1111-1111-1111-111111111111";

// ── In-memory Supabase state ────────────────────────────────────
let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];
let notifications: any[] = [];

// ── Mocked Meta /debug_token behavior (set per test) ────────────
type TokenInfo = { is_valid: boolean; expires_at: number } | "unreachable" | "oauth-dead";
let tokenInfo: Record<string, TokenInfo> = {};

const realFetch = globalThis.fetch;

function mockFetch() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (u.host === GRAPH_HOST) {
      if (u.pathname.endsWith("/debug_token")) {
        const tok = u.searchParams.get("input_token") || "";
        const info = tokenInfo[tok];
        if (info === undefined || info === "unreachable") {
          // Simulate a network failure / non-JSON 500 → debugToken returns null.
          return new Response("bad gateway", { status: 502 });
        }
        if (info === "oauth-dead") return json({ error: { code: 190, message: "expired" } }, 400);
        return json({ data: info });
      }
      return json({ error: { message: "unexpected graph call" } }, 400);
    }

    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;
    const eq = (k: string) => {
      const v = q.get(k);
      return v?.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
    };

    if (u.pathname === "/rest/v1/admin_settings") {
      if (method === "GET") {
        let rows = adminSettings;
        if (eq("company_id")) rows = rows.filter((r) => r.company_id === eq("company_id"));
        if (eq("key")) rows = rows.filter((r) => r.key === eq("key"));
        return json(rows);
      }
      if (method === "PATCH") {
        // CAS path: value=eq.<exact bytes>. Applied atomically in-memory.
        const cid = eq("company_id"), key = eq("key"), expected = eq("value");
        const body = JSON.parse(init.body);
        const matched = adminSettings.filter(
          (r) => r.company_id === cid && r.key === key && (expected == null || r.value === expected),
        );
        for (const r of matched) r.value = body.value;
        return json(matched.map((r) => ({ ...r })));
      }
      if (method === "POST") {
        const body = JSON.parse(init.body);
        const hit = adminSettings.find((r) => r.company_id === body.company_id && r.key === body.key);
        if (hit) hit.value = body.value;
        else adminSettings.push({ company_id: body.company_id, key: body.key, value: body.value });
        return json([], 201);
      }
    }
    if (u.pathname === "/rest/v1/user_profiles" && method === "GET") {
      // notifyAdmins: super_admins of the org
      if (eq("company_id") === ORG && eq("role") === "super_admin") return json([{ id: ADMIN }]);
      return json([]);
    }
    if (u.pathname === "/rest/v1/notifications" && method === "POST") {
      notifications.push(JSON.parse(init.body));
      return json([], 201);
    }
    return json([], 200);
  }) as any;
}

let checkTokenExpiries: () => Promise<void>;

before(async () => {
  mockFetch();
  ({ checkTokenExpiries } = await import("../metaAds"));
});
after(() => { globalThis.fetch = realFetch; });

// ── Helpers ─────────────────────────────────────────────────────
const NOW = Date.now();
const days = (n: number) => Math.floor(NOW / 1000) + n * 86400;

function seedCfg(token: string, extra: Record<string, any> = {}) {
  adminSettings = [{
    company_id: ORG,
    key: "meta_ads",
    // parseCfg accepts a plaintext `token` field (only token_enc is decrypted).
    value: JSON.stringify({ token, ad_account_id: "123", community_id: "c1", daily: true, ...extra }),
  }];
}
const storedCfg = (): any => JSON.parse(adminSettings[0].value);
// Simulate "a later day": drop the daily claim marker but keep everything else.
function nextDay() {
  const c = storedCfg();
  delete c.last_token_check;
  adminSettings[0].value = JSON.stringify(c);
}

beforeEach(() => { notifications = []; tokenInfo = {}; });

// ── Tests ───────────────────────────────────────────────────────

test("≤7-day warning fires once, then never again for the same token", async () => {
  seedCfg("tok-a");
  tokenInfo["tok-a"] = { is_valid: true, expires_at: days(5) };

  await checkTokenExpiries();
  assert.equal(notifications.length, 1, "exactly one warning bell");
  assert.equal(notifications[0].recipient_id, ADMIN);
  assert.match(notifications[0].body, /expires in 4 days|expires in 5 days/);
  assert.ok(storedCfg().warned_expiring_fp, "fingerprint flag recorded");

  // Same day again → skipped by last_token_check claim.
  await checkTokenExpiries();
  assert.equal(notifications.length, 1, "no duplicate same day");

  // Later days, same token → skipped by warned_expiring_fp.
  nextDay();
  await checkTokenExpiries();
  nextDay();
  await checkTokenExpiries();
  assert.equal(notifications.length, 1, "no duplicate on later days");
});

test("expired notice fires once (invalid token via oauth error too)", async () => {
  seedCfg("tok-dead");
  tokenInfo["tok-dead"] = { is_valid: false, expires_at: 0 };

  await checkTokenExpiries();
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].body, /has expired/);
  assert.ok(storedCfg().warned_expired_fp);

  nextDay();
  await checkTokenExpiries();
  assert.equal(notifications.length, 1, "expired notice not repeated");

  // A code-190 OAuth error counts as expired the same way.
  seedCfg("tok-oauth");
  tokenInfo["tok-oauth"] = "oauth-dead";
  notifications = [];
  await checkTokenExpiries();
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].body, /has expired/);
});

test("a past expires_at with is_valid=true is still treated as expired", async () => {
  seedCfg("tok-past");
  tokenInfo["tok-past"] = { is_valid: true, expires_at: days(-1) };
  await checkTokenExpiries();
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].body, /has expired/);
});

test("a new token (different fingerprint) re-arms both warnings", async () => {
  // Old token already warned for both flags.
  seedCfg("tok-old");
  tokenInfo["tok-old"] = { is_valid: true, expires_at: days(3) };
  await checkTokenExpiries();
  assert.equal(notifications.length, 1);

  // Admin reconnects with a fresh token; keep the OLD fingerprint flags,
  // exactly what /connect leaves behind (it never touches warned_* flags).
  const old = storedCfg();
  seedCfg("tok-new", {
    warned_expiring_fp: old.warned_expiring_fp,
    warned_expired_fp: "stale-expired-fp",
  });

  // New token also close to expiry → must warn again (new fingerprint).
  tokenInfo["tok-new"] = { is_valid: true, expires_at: days(2) };
  await checkTokenExpiries();
  assert.equal(notifications.length, 2, "expiring warning re-armed for new token");

  // And when the new token later dies → expired notice also fires again.
  nextDay();
  tokenInfo["tok-new"] = { is_valid: false, expires_at: 0 };
  await checkTokenExpiries();
  assert.equal(notifications.length, 3, "expired notice re-armed for new token");
});

test("a healthy far-future token never notifies (and 0 = never expires)", async () => {
  seedCfg("tok-good");
  tokenInfo["tok-good"] = { is_valid: true, expires_at: days(60) };
  await checkTokenExpiries();
  assert.equal(notifications.length, 0);

  seedCfg("tok-forever");
  tokenInfo["tok-forever"] = { is_valid: true, expires_at: 0 };
  await checkTokenExpiries();
  assert.equal(notifications.length, 0);
});

test("unreachable Meta skips silently and releases the claim for retry", async () => {
  seedCfg("tok-flaky");
  tokenInfo["tok-flaky"] = "unreachable";

  await checkTokenExpiries();
  assert.equal(notifications.length, 0, "no bell on network failure");
  let c = storedCfg();
  assert.equal(c.last_token_check, undefined, "claim released so a later pass retries");
  assert.equal(c.token_check_fails, 1);

  // Meta comes back on the retry (e.g. next scheduler pass or next day).
  tokenInfo["tok-flaky"] = { is_valid: true, expires_at: days(2) };
  await checkTokenExpiries();
  assert.equal(notifications.length, 1, "warning delivered once reachable again");
  c = storedCfg();
  assert.equal(c.token_check_fails, undefined, "fail counter cleared after success");

  // Bounded retries: after 3 straight failures the day's claim sticks.
  seedCfg("tok-down");
  tokenInfo["tok-down"] = "unreachable";
  await checkTokenExpiries();
  await checkTokenExpiries();
  await checkTokenExpiries();
  c = storedCfg();
  assert.equal(c.token_check_fails, 3);
  assert.ok(c.last_token_check, "claim kept after 3rd failure — no more retries today");
  await checkTokenExpiries();
  assert.equal(storedCfg().token_check_fails, 3, "4th pass is a no-op");
  assert.equal(notifications.length, 1);
});

test("CAS claim prevents double-notify from two concurrent scheduler passes", async () => {
  seedCfg("tok-race");
  tokenInfo["tok-race"] = { is_valid: true, expires_at: days(4) };

  // Two server instances run the check at the same moment.
  await Promise.all([checkTokenExpiries(), checkTokenExpiries()]);
  assert.equal(notifications.length, 1, "only the CAS winner notifies");

  // And a config change mid-check (admin reconnects) makes the in-flight
  // check abandon its write instead of clobbering the fresh token.
  seedCfg("tok-race2");
  let resolveDebug: (r: Response) => void;
  const gate = new Promise<Response>((res) => { resolveDebug = res; });
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: any, init: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("debug_token") && url.includes("tok-race2")) return gate;
    return inner(input, init);
  }) as any;
  const run = checkTokenExpiries(); // claims, then blocks on debug_token
  await new Promise((r) => setTimeout(r, 20));
  // Admin reconnects while the check is in flight.
  adminSettings[0].value = JSON.stringify({ token: "tok-fresh", ad_account_id: "123", community_id: "c1" });
  resolveDebug!(new Response(JSON.stringify({ data: { is_valid: false, expires_at: 0 } }),
    { status: 200, headers: { "Content-Type": "application/json" } }));
  await run;
  globalThis.fetch = inner;
  // The expired notice for the OLD token was still sent (it was true when
  // checked), but the stale flag write lost the CAS — the fresh config is intact.
  const c = storedCfg();
  assert.equal(c.token, "tok-fresh", "reconnected config not clobbered");
  assert.equal(c.warned_expired_fp, undefined, "stale flag write abandoned");
});
