// realtimeWatch.ts — scheduled watchdog for the "instant admin updates"
// realtime publication.
//
// A Supabase restore (or manual publication edit) can silently drop
// `organizations` / `packages` / `client_documents` / `admin_settings` from
// the `supabase_realtime` publication. Nothing errors — admins just quietly
// fall back to the ~10s poll. The headless check
// (tests/realtime-publication.mjs) catches this, but only when someone
// remembers to run it.
//
// This job runs the same verification once a day, server-side:
//   1. subscribe to postgres_changes for each watched table
//   2. issue a no-op PATCH (a column set to its current value still emits
//      an UPDATE event)
//   3. assert the event arrives within a few seconds
//
// On failure it:
//   - logs a prominent error naming the exact ALTER PUBLICATION fix
//   - inserts a bell notification for every active super_admin (once per
//     day — the day's existing alert row is the idempotency marker)
//   - flips the evaluated health snapshot on /healthz to degraded
//
// Health follows the startDateReminders pattern: misconfiguration is a
// FAILED run, staleness (no completed run within interval + slack) is
// unhealthy, and every run — including passing ones — logs a heartbeat.
import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";

export const WATCHED_TABLES = [
  "organizations",
  "packages",
  "client_documents",
  "admin_settings",
];

export const ALERT_TYPE = "realtime_watch_alert";
const EVENT_TIMEOUT_MS = Number(process.env.REALTIME_EVENT_TIMEOUT_MS || 5000);

// A single missed event (or a slow overnight socket handshake) is almost
// always a transient Supabase blip, not a dropped publication. Before waking
// admins up with "run this SQL", re-run the check a couple of times with a
// pause in between and only alert when the failure PERSISTS across every
// attempt. Delay is read at call time so tests can shrink it.
export const RETRY_ATTEMPTS = 2; // re-checks after the initial failure
export function retryDelayMs(): number {
  return Number(process.env.REALTIME_RETRY_DELAY_MS || 90_000); // 1.5 min
}

export const FIX_HINT =
  `Realtime events are NOT being delivered — the table is likely missing from the ` +
  `supabase_realtime publication (a Supabase restore can drop it). Fix in the Supabase SQL editor:\n` +
  `  ALTER PUBLICATION supabase_realtime ADD TABLE organizations, packages, client_documents, admin_settings;\n` +
  `(Until then, admins fall back to the ~10s poll.)`;

// Read at call time (not import time) so a missing key is detected on every
// run — and so tests can exercise the misconfigured path.
function sbKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function sbHeaders(): Record<string, string> {
  const key = sbKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

// Distinguishes "no rows" from "request failed": a failed GET must fail the
// run, never coerce to an empty result set.
async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${table} failed: HTTP ${r.status}`);
  let body: unknown;
  try {
    body = await r.json();
  } catch {
    throw new Error(`Supabase GET ${table} returned a malformed body`);
  }
  if (!Array.isArray(body)) throw new Error(`Supabase GET ${table} returned a non-array body`);
  return body as any[];
}

// Pick a harmless scalar column to re-write with its current value.
export function pickColumn(row: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(row)) {
    if (k === "id" || k.endsWith("_id")) continue;
    if (typeof v === "string") return k;
  }
  return Object.keys(row).find((k) => k !== "id") || null;
}

// ---- the actual delivery check ------------------------------------------
// Returns a list of human-readable failure strings ([] = all tables OK).
// Throws only on infrastructure errors (channel never subscribed, REST reads
// failing) — those are run failures too, just with a different message.
export async function checkRealtimeDelivery(): Promise<string[]> {
  const key = sbKey();
  const sb = createClient(SUPABASE_URL, key, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  sb.realtime.setAuth(key);

  const received = new Map<string, (v: boolean) => void>();
  const waiters: Record<string, Promise<boolean>> = {};
  for (const t of WATCHED_TABLES) {
    waiters[t] = new Promise((resolve) => received.set(t, resolve));
  }

  let channel = sb.channel("realtime-watchdog");
  for (const t of WATCHED_TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: t },
      () => received.get(t)?.(true),
    );
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(
        () => reject(new Error("Realtime channel did not reach SUBSCRIBED within 10s")),
        10000,
      );
      channel.subscribe((status, err) => {
        if (status === "SUBSCRIBED") { clearTimeout(to); resolve(); }
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(to);
          reject(new Error(`Realtime channel failed to subscribe: ${status} ${err || ""}`));
        }
      });
    });

    const failures: string[] = [];
    for (const table of WATCHED_TABLES) {
      const rows = await sbGet(table, "select=*&limit=1");
      const row = rows[0];
      if (!row) {
        failures.push(`${table}: table has no rows, so delivery could not be verified.`);
        continue;
      }
      const col = pickColumn(row);
      if (!col) {
        failures.push(`${table}: no updatable column found on the sample row.`);
        continue;
      }
      // admin_settings is keyed by (key, company_id) instead of id.
      const filter =
        "id" in row
          ? `id=eq.${encodeURIComponent(row.id)}`
          : `key=eq.${encodeURIComponent(row.key)}&company_id=eq.${encodeURIComponent(row.company_id)}`;
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: "PATCH",
        headers: sbHeaders(),
        body: JSON.stringify({ [col]: row[col] }),
      });
      if (!patch.ok) throw new Error(`${table}: no-op PATCH failed: HTTP ${patch.status}`);

      const got = await Promise.race([
        waiters[table],
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), EVENT_TIMEOUT_MS)),
      ]);
      if (!got) failures.push(`${table}: realtime UPDATE did not arrive within ${EVENT_TIMEOUT_MS}ms.`);
    }
    return failures;
  } finally {
    try { await sb.removeChannel(channel); } catch { /* best effort */ }
    sb.realtime.disconnect();
  }
}

// ---- alerting ------------------------------------------------------------
// Bell-notify every active super_admin, at most once per day (the day's
// existing alert row is the idempotency marker — same check-then-insert
// approach as start-date reminders; safe for our single daily process).
// Returns { notified, failed } counts.
export async function alertAdmins(detail: string): Promise<{ notified: number; failed: number }> {
  const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const existing = await sbGet(
    "notifications",
    `type=eq.${ALERT_TYPE}&created_at=gte.${todayStart}&select=recipient_id`,
  );
  const alreadyToday = new Set(existing.map((n) => n.recipient_id));

  const admins = await sbGet(
    "user_profiles",
    "role=eq.super_admin&is_active=not.is.false&select=id",
  );

  const body =
    `⚠️ Instant admin updates may be BROKEN: ${detail} ` +
    `Admin edits may take up to 10s to appear. ` +
    `Fix (Supabase SQL editor): ALTER PUBLICATION supabase_realtime ADD TABLE ` +
    `organizations, packages, client_documents, admin_settings;`;

  let notified = 0, failed = 0;
  for (const a of admins) {
    if (alreadyToday.has(a.id)) continue;
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "return=minimal" },
      body: JSON.stringify({
        recipient_id: a.id,
        sender_id: null,
        type: ALERT_TYPE,
        body,
        is_read: false,
        created_at: new Date().toISOString(),
      }),
    });
    if (ins.ok) notified++;
    else {
      failed++;
      logger.warn({ admin: a.id, status: ins.status }, "[RealtimeWatch] alert notification insert failed");
    }
  }
  return { notified, failed };
}

// ---- run health -----------------------------------------------------------
export type RealtimeWatchHealth = {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRunOk: boolean | null;   // true = check ran AND all tables delivered
  lastError: string | null;
  lastFailedTables: string[];  // tables that missed delivery last run
  lastNotified: number;        // admin alerts inserted last run
  lastAttempts: number;        // check attempts made last run (retries included)
  runs: number;
};

const health: RealtimeWatchHealth = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastRunOk: null,
  lastError: null,
  lastFailedTables: [],
  lastNotified: 0,
  lastAttempts: 0,
  runs: 0,
};

export const RUN_EVERY_MS = 24 * 60 * 60 * 1000; // daily
// Allow generous slack before calling the daily job stale.
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export function getRealtimeWatchHealth(now: Date = new Date()): RealtimeWatchHealth & { healthy: boolean; stale: boolean } {
  const stale =
    health.runs > 0 &&
    (!health.lastRunAt || now.getTime() - Date.parse(health.lastRunAt) > STALE_AFTER_MS);
  const neverRan = health.runs === 0; // startup grace: first run happens shortly after boot
  return {
    ...health,
    stale,
    healthy: !stale && (neverRan || health.lastRunOk === true),
  };
}

// Exported for tests: `check` is injectable so run-level tests don't need a
// live realtime socket.
export async function runRealtimeWatch(
  check: () => Promise<string[]> = checkRealtimeDelivery,
): Promise<void> {
  health.runs++;
  if (!sbKey()) {
    // Misconfiguration is a FAILED run, not a silent no-op.
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = "SUPABASE_SERVICE_ROLE_KEY missing — realtime watchdog disabled";
    health.lastFailedTables = [];
    health.lastNotified = 0;
    health.lastAttempts = 0;
    logger.error("[RealtimeWatch] SUPABASE_SERVICE_ROLE_KEY missing — realtime watchdog disabled");
    return;
  }
  // Run the check up to 1 + RETRY_ATTEMPTS times. A transient miss (single
  // failed attempt followed by a clean one) is LOGGED, never alerted — only a
  // failure that persists across every attempt wakes admins up.
  const totalAttempts = 1 + RETRY_ATTEMPTS;
  let failures: string[] = [];
  let thrown: unknown = null;
  let transientMisses = 0;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    failures = [];
    thrown = null;
    try {
      failures = await check();
    } catch (err) {
      thrown = err;
    }
    health.lastAttempts = attempt;
    if (!thrown && failures.length === 0) break; // clean pass
    transientMisses++;
    if (attempt < totalAttempts) {
      const what = thrown
        ? `check threw (${thrown instanceof Error ? thrown.message : String(thrown)})`
        : `missed delivery for ${failures.map((f) => f.split(":")[0] || f).join(", ")}`;
      // Log-only: a single miss is very likely a transient Supabase blip.
      logger.warn(
        { attempt, of: totalAttempts, failures },
        `[RealtimeWatch] ${what} — retrying in ${retryDelayMs()}ms before alerting (transient blips are expected overnight)`,
      );
      await new Promise((r) => setTimeout(r, retryDelayMs()));
    }
  }

  health.lastRunAt = new Date().toISOString();
  health.lastNotified = 0;

  if (!thrown && failures.length === 0) {
    health.lastRunOk = true;
    health.lastError = null;
    health.lastSuccessAt = health.lastRunAt;
    health.lastFailedTables = [];
    if (transientMisses > 0) {
      // Recovered on retry — heartbeat notes the blip but nobody is alerted.
      logger.warn(
        { transientMisses },
        "[RealtimeWatch] realtime publication OK after retry — earlier miss was transient, no alert sent",
      );
    } else {
      // Heartbeat: a passing run still logs, proving the watchdog is alive.
      logger.info({ tables: WATCHED_TABLES }, "[RealtimeWatch] realtime publication OK — instant admin updates verified");
    }
    return;
  }

  if (thrown) {
    // A thrown verification error (channel never subscribed, REST read/PATCH
    // failed…) also means instant updates could NOT be verified — that is
    // itself an alertable failure, not just a health/log event. The service
    // key and notifications table may still be reachable, so attempt the
    // same once-per-day deduplicated bell alert.
    const msg = thrown instanceof Error ? thrown.message : String(thrown);
    health.lastRunOk = false;
    health.lastError = msg;
    health.lastFailedTables = [];
    logger.error({ err: thrown }, `[RealtimeWatch] check itself FAILED on all ${totalAttempts} attempts — could not verify instant admin updates.\n${FIX_HINT}`);
    await tryAlertAdmins(
      `the daily realtime verification itself failed on all ${totalAttempts} attempts (${msg}).`,
    );
    return;
  }

  health.lastRunOk = false;
  health.lastError = failures.join(" | ");
  health.lastFailedTables = failures.map((f) => f.split(":")[0] || f);
  logger.error(
    { failures, attempts: totalAttempts },
    `[RealtimeWatch] INSTANT ADMIN UPDATES ARE BROKEN — failure persisted across ${totalAttempts} checks.\n${FIX_HINT}`,
  );
  await tryAlertAdmins(
    `realtime events stopped arriving for ${health.lastFailedTables.join(", ")} — ` +
      `this failure PERSISTED across ${totalAttempts} checks spaced ${Math.round(retryDelayMs() / 1000)}s apart, so it is not a transient blip.`,
  );
}

// Best-effort admin alerting shared by both failure paths; alerting failures
// are appended to lastError so they stay visible on /healthz.
async function tryAlertAdmins(detail: string): Promise<void> {
  try {
    const { notified, failed } = await alertAdmins(detail);
    health.lastNotified = notified;
    if (failed > 0) {
      health.lastError += ` | ${failed} admin alert insert(s) failed`;
    }
    logger.error({ notified, failed }, "[RealtimeWatch] admin bell alerts processed");
  } catch (err) {
    health.lastError += ` | alerting failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error({ err }, "[RealtimeWatch] failed to insert admin alerts — regression is only visible in logs/healthz");
  }
}

export function startRealtimeWatch() {
  // Slight delay so boot isn't slowed by the websocket handshake.
  setTimeout(() => runRealtimeWatch(), 15_000);
  setInterval(() => runRealtimeWatch(), RUN_EVERY_MS);
}
