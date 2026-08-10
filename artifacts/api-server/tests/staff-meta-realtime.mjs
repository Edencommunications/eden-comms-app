// Regression check: editing a staff member's tab access propagates INSTANTLY.
//
// Simulates both sides of the live flow against real Supabase:
//   • LISTENER — subscribed exactly like App.tsx's staffAllowedTabs effect:
//     channel 'staff-meta-<profileId>' with a broadcast handler for
//     'staff-meta-changed' (and postgres_changes on the admin_settings row),
//     which re-reads admin_settings key staff_meta:<profileId> on every nudge.
//   • ADMIN — saves like Week6.jsx saveEditStaff (REST upsert of the
//     staff_meta:<id> row with resolution=merge-duplicates) and then nudges
//     like notifyStaffMetaChanged (throwaway channel, broadcast send).
//
// Asserts the listener observes the NEW tabs list within ~2s of the save —
// i.e. the instant path works and we haven't silently regressed to the
// 10s fallback poll. Creates a throwaway 'va' staff profile (admin_settings
// needs a valid NOT NULL company_id — Eden's) and always cleans up.
//
//   node --test tests/staff-meta-realtime.mjs
// Env: SUPABASE_SERVICE_ROLE_KEY (required)
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_COMPANY = "b0000000-0000-0000-0000-000000000001";
const PROPAGATION_TIMEOUT_MS = Number(process.env.STAFF_META_TIMEOUT_MS || 2000);

const REST = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbRest(method, path, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...REST, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status} ${await r.text().catch(() => "")}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

test("staff-tab access edits propagate instantly via staff-meta broadcast", { timeout: 60000 }, async () => {
  assert.ok(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY is not set — this check needs it to seed/clean the temp staff profile.");

  const run = Math.random().toString(36).slice(2, 8);
  const profileId = randomUUID();
  const email = `staffmeta-test-${run}@example.com`;
  const metaKey = `staff_meta:${profileId}`;
  const channelName = `staff-meta-${profileId}`;

  // supabase-js clients: one for the listening staff session, one for the
  // admin's throwaway broadcast channel (Week6 uses a separate client too).
  const listenerSb = createClient(SUPABASE_URL, SERVICE_KEY, { realtime: { params: { eventsPerSecond: 2 } } });
  listenerSb.realtime.setAuth(SERVICE_KEY);
  const adminSb = createClient(SUPABASE_URL, SERVICE_KEY);
  adminSb.realtime.setAuth(SERVICE_KEY);

  let listenerChannel = null;
  let adminChannel = null;
  let seededProfile = false;
  let seededSetting = false;

  try {
    // ── Seed: temp staff profile (role 'va') under Eden's company ──────────
    await sbRest("POST", "user_profiles", {
      id: profileId, email, name: `StaffMeta Test ${run}`, role: "va", company_id: EDEN_COMPANY,
    }, "return=minimal");
    seededProfile = true;

    // Baseline staff_meta (all tabs) so the save below is a real change.
    await sbRest("POST", "admin_settings?on_conflict=company_id,key", {
      company_id: EDEN_COMPANY, key: metaKey,
      value: JSON.stringify({ label: null, tabs: ["home", "msgs", "team"] }),
    }, "resolution=merge-duplicates,return=minimal");
    seededSetting = true;

    // ── LISTENER: subscribe like App.tsx, re-read staff_meta on each nudge ─
    const readMeta = async () => {
      const rows = await sbRest("GET", `admin_settings?key=eq.${encodeURIComponent(metaKey)}&select=value`);
      const v = rows?.[0]?.value;
      if (!v) return null;
      const meta = typeof v === "string" ? JSON.parse(v) : v;
      return Array.isArray(meta?.tabs) && meta.tabs.length ? meta.tabs : null;
    };

    let resolveTabs;
    const sawNewTabs = new Promise((resolve) => { resolveTabs = resolve; });
    const expected = ["team"]; // the "restricted" tabs list the admin will save
    // Success must be attributable to the BROADCAST nudge specifically —
    // a postgres_changes event alone (admin_settings happens to be published)
    // must NOT satisfy this regression check, because staff sessions rely on
    // the broadcast path even when the table isn't in the publication.
    const maybeResolve = (tabs, source) => {
      if (source !== "broadcast") return;
      if (Array.isArray(tabs) && tabs.length === expected.length && expected.every((t) => tabs.includes(t))) {
        resolveTabs(tabs);
      }
    };
    const refresh = (source) => { readMeta().then((tabs) => maybeResolve(tabs, source)).catch(() => {}); };

    listenerChannel = listenerSb
      .channel(channelName)
      // Subscribed like App.tsx (both handlers), but only the broadcast one can pass the test.
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_settings", filter: `key=eq.${metaKey}` }, () => refresh("postgres_changes"))
      .on("broadcast", { event: "staff-meta-changed" }, ({ payload }) => {
        if (!payload?.id || payload.id === profileId) refresh("broadcast");
      });
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("listener channel did not reach SUBSCRIBED within 10s")), 10000);
      listenerChannel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") { clearTimeout(to); resolve(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(to); reject(new Error(`listener channel failed to subscribe: ${status} ${err || ""}`));
        }
      });
    });

    // ── ADMIN: save like saveEditStaff, then nudge like notifyStaffMetaChanged ─
    const t0 = Date.now();
    await sbRest("POST", "admin_settings?on_conflict=company_id,key", {
      company_id: EDEN_COMPANY, key: metaKey,
      value: JSON.stringify({ label: "Restricted", tabs: expected }),
    }, "resolution=merge-duplicates,return=minimal");

    adminChannel = adminSb.channel(channelName);
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("admin broadcast channel did not reach SUBSCRIBED within 10s")), 10000);
      adminChannel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(to);
          adminChannel
            .send({ type: "broadcast", event: "staff-meta-changed", payload: { id: profileId } })
            .then(resolve, reject);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(to); reject(new Error(`admin channel failed to subscribe: ${status} ${err || ""}`));
        }
      });
    });

    // ── Assert: the new tabs list is observed within the instant window ────
    const got = await Promise.race([
      sawNewTabs,
      new Promise((resolve) => setTimeout(() => resolve(null), PROPAGATION_TIMEOUT_MS)),
    ]);
    const elapsed = Date.now() - t0;
    assert.ok(
      got,
      `Listener did NOT see the new tabs list via the BROADCAST nudge within ${PROPAGATION_TIMEOUT_MS}ms of the save — ` +
        `the instant staff-meta path (broadcast 'staff-meta-changed' on '${channelName}' + re-read of ${metaKey}) ` +
        `is broken and sessions would fall back to the ~10s poll. Check App.tsx's staffAllowedTabs effect and ` +
        `Week6.jsx notifyStaffMetaChanged for channel/event/key mismatches.`,
    );
    console.log(`✓ staff-meta change propagated via broadcast in ${elapsed}ms (tabs: ${got.join(", ")})`);
  } finally {
    // ── Cleanup: channels, then every row we created (verify deletes) ──────
    try { if (listenerChannel) await listenerSb.removeChannel(listenerChannel); } catch {}
    try { if (adminChannel) await adminSb.removeChannel(adminChannel); } catch {}
    try { listenerSb.realtime.disconnect(); } catch {}
    try { adminSb.realtime.disconnect(); } catch {}
    const failures = [];
    if (seededSetting) {
      await sbRest("DELETE", `admin_settings?key=eq.${encodeURIComponent(metaKey)}`).catch((e) => failures.push(String(e)));
    }
    if (seededProfile) {
      await sbRest("DELETE", `user_profiles?id=eq.${profileId}`).catch((e) => failures.push(String(e)));
    }
    // Fail loudly on cleanup problems so live-test records never accumulate silently.
    assert.deepEqual(failures, [], `cleanup failed — remove these manually:\n${failures.join("\n")}`);
  }
});
