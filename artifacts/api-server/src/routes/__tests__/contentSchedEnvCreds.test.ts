// contentSchedEnvCreds.test.ts — Regression test for the env-var credential
// fallback in the TikTok token persist path.
//
// When the TikTok developer-app credentials come from server env secrets
// (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET) rather than being pasted into
// admin_settings, the stored config row has tt_refresh but NO tt_client_key.
// persistTokenFields must still save refreshed access-token / rotated
// refresh-token fields — the old guard (!fresh.tt_client_key) incorrectly
// treated this as a "disconnected" state and silently dropped every tt_* field.
//
// The fix: use the ABSENCE OF tt_refresh (the platform's actual disconnect
// signal) rather than the absence of tt_client_key.
//
// NOTE: serializeCfg encrypts SECRET_FIELDS (tt_access → tt_access_enc,
// tt_refresh → tt_refresh_enc, etc.). When reading back the stored config via
// JSON.parse, we therefore assert on the *_enc fields plus the plaintext
// tt_expires_at (not a secret, stored without encryption).

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";
// Simulate env-var credentials being present (the operator pre-configured them).
process.env.TIKTOK_CLIENT_KEY ||= "env-client-key";
process.env.TIKTOK_CLIENT_SECRET ||= "env-client-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const EDEN_ORG = "b0000000-0000-0000-0000-000000000001";
const CFG_KEY = "content_sched";

// ── In-memory admin_settings store ──────────────────────────────
let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];

const realFetch = globalThis.fetch;

function mockFetch() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : String(input.url ?? input);
    const u = new URL(url);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (u.host !== SUPABASE_HOST) return realFetch(input, init);

    const method = String(init?.method || "GET").toUpperCase();
    const q = u.searchParams;
    const eq = (k: string) => {
      const v = q.get(k);
      return v?.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null;
    };

    if (u.pathname === "/rest/v1/admin_settings") {
      if (method === "GET") {
        let rows = [...adminSettings];
        if (eq("company_id")) rows = rows.filter((r) => r.company_id === eq("company_id"));
        if (eq("key")) rows = rows.filter((r) => r.key === eq("key"));
        return json(rows);
      }
      if (method === "PATCH") {
        // CAS path: value=eq.<exact bytes> — only matches when stored value equals expected.
        const cid = eq("company_id");
        const key = eq("key");
        const expected = eq("value");
        const body = JSON.parse(String(init?.body || "{}"));
        const matched = adminSettings.filter(
          (r) => r.company_id === cid && r.key === key && (expected == null || r.value === expected),
        );
        for (const r of matched) r.value = body.value;
        return json(matched.map((r) => ({ ...r })));
      }
      if (method === "POST") {
        const body = JSON.parse(String(init?.body || "{}"));
        const hit = adminSettings.find((r) => r.company_id === body.company_id && r.key === body.key);
        if (hit) hit.value = body.value;
        else adminSettings.push({ company_id: body.company_id, key: body.key, value: body.value });
        return json([], 201);
      }
    }
    return json([], 200);
  }) as any;
}

let persistTokenFields: (patch: Record<string, string>) => Promise<void>;

before(async () => {
  mockFetch();
  ({ persistTokenFields } = await import("../contentScheduler"));
});

after(() => { globalThis.fetch = realFetch; });

beforeEach(() => { adminSettings = []; });

// Return the stored config row's parsed JSON (un-decrypted — secrets are still
// in their _enc form since we have no key access in tests).
function storedValue(): any {
  const row = adminSettings.find((r) => r.company_id === EDEN_ORG && r.key === CFG_KEY);
  if (!row) return null;
  return JSON.parse(row.value);
}

test("env-only TikTok: persistTokenFields saves refreshed tokens even without tt_client_key in DB", async () => {
  // Seed an env-only connection: no tt_client_key in DB (credentials live in
  // env secrets), but tt_refresh IS present (OAuth was completed earlier).
  // parseCfg reads plaintext tt_refresh directly when tt_refresh_enc is absent.
  const oldExpiry = new Date(0).toISOString();
  adminSettings = [{
    company_id: EDEN_ORG,
    key: CFG_KEY,
    value: JSON.stringify({ tt_refresh: "old-refresh-token", tt_access: "old-access", tt_expires_at: oldExpiry }),
  }];

  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await persistTokenFields({ tt_access: "new-access-token", tt_refresh: "rotated-refresh-token", tt_expires_at: newExpiry } as any);

  const saved = storedValue();
  assert.ok(saved, "config row must still exist after persist");

  // serializeCfg encrypts SECRET_FIELDS, so we read back *_enc keys, not plain.
  // A non-empty enc1:... string means the field was saved and encrypted.
  assert.ok(
    typeof saved.tt_access_enc === "string" && saved.tt_access_enc.startsWith("enc1:"),
    "refreshed access token must be saved (as tt_access_enc) — previously silently dropped",
  );
  assert.ok(
    typeof saved.tt_refresh_enc === "string" && saved.tt_refresh_enc.startsWith("enc1:"),
    "rotated refresh token must be saved (as tt_refresh_enc) — losing this causes a hard disconnect on next expiry",
  );
  // tt_expires_at is NOT in SECRET_FIELDS, so it's stored plaintext.
  assert.equal(saved.tt_expires_at, newExpiry, "token expiry must be saved plaintext");

  // The plaintext copies must have been stripped by serializeCfg.
  assert.equal(saved.tt_access, undefined, "plaintext access token must not persist to DB");
  assert.equal(saved.tt_refresh, undefined, "plaintext refresh token must not persist to DB");
});

test("a genuine TikTok disconnect (tt_refresh absent) prevents phantom token resurrection", async () => {
  // Disconnect endpoint wipes all tt_* fields including tt_refresh.
  // A concurrent refresh call that already had old tokens in memory must not
  // write them back and resurrect a dead connection.
  adminSettings = [{
    company_id: EDEN_ORG,
    key: CFG_KEY,
    // No tt_refresh — platform was disconnected.
    value: JSON.stringify({ page_token_enc: "dummy-page-token-enc" }),
  }];

  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await persistTokenFields({ tt_access: "stale-access", tt_refresh: "stale-refresh", tt_expires_at: newExpiry } as any);

  const saved = storedValue();
  assert.ok(saved, "config row itself must survive");
  assert.equal(saved.tt_access_enc, undefined, "stale encrypted access token must NOT be written back after disconnect");
  assert.equal(saved.tt_refresh_enc, undefined, "stale encrypted refresh token must NOT resurrect a disconnected account");
  assert.equal(saved.tt_expires_at, undefined, "expiry must NOT be written back after disconnect");
});

test("DB-stored tt_client_key config also persists refreshed tokens correctly after guard change", async () => {
  // Regression guard: the legacy path where credentials ARE stored in DB must
  // still work after the disconnect-guard change from !tt_client_key → !tt_refresh.
  const oldExpiry = new Date(0).toISOString();
  adminSettings = [{
    company_id: EDEN_ORG,
    key: CFG_KEY,
    value: JSON.stringify({
      tt_client_key: "db-key",
      tt_client_secret: "db-secret",
      tt_refresh: "old-refresh",
      tt_expires_at: oldExpiry,
    }),
  }];

  const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await persistTokenFields({ tt_access: "db-new-access", tt_refresh: "db-new-refresh", tt_expires_at: newExpiry } as any);

  const saved = storedValue();
  assert.ok(
    typeof saved.tt_access_enc === "string" && saved.tt_access_enc.startsWith("enc1:"),
    "access token encrypted and saved in DB-credential mode",
  );
  assert.ok(
    typeof saved.tt_refresh_enc === "string" && saved.tt_refresh_enc.startsWith("enc1:"),
    "refresh token encrypted and saved in DB-credential mode",
  );
  assert.equal(saved.tt_expires_at, newExpiry, "expiry saved plaintext");
  // Original DB-stored non-secret credentials must be preserved in the merged config.
  assert.equal(saved.tt_client_key, "db-key", "app client key must be preserved");
});
