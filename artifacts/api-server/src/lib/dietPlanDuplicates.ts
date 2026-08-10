// dietPlanDuplicates.ts — duplicate diet-plan row watcher.
//
// A one-time sweep removed leftover duplicate diet_plans rows (only the
// newest row per client remains) and saves now update one canonical row
// per client. If a regression reintroduces insert-per-save behavior,
// duplicates would silently pile up again. This watcher runs hourly,
// counts clients with more than one diet_plans row, and surfaces the
// result on /healthz (degraded/503 when duplicates exist), so nobody has
// to run manual DB queries to notice.
//
// Follows the startDateReminders health pattern: evaluated health (not a
// raw snapshot), misconfig = failed run, malformed responses = failed run,
// staleness detection, and a heartbeat log every run.
import { logger } from "./logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";

// Read at call time (not import time) so a missing key is detected on every
// run — and so tests can exercise the misconfigured path.
function sbKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

// Pure helper (exported for tests): given the client_id of every diet_plans
// row, return the list of client_ids that own more than one row.
export function findDuplicateClientIds(rows: Array<{ client_id: string | null }>): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const id = r?.client_id;
    if (!id) continue; // orphan rows without a client can't be "per-client" duplicates
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

// ---- run health --------------------------------------------------------
export type DietPlanDuplicatesHealth = {
  lastRunAt: string | null;     // ISO timestamp of the last completed run (ok or failed)
  lastSuccessAt: string | null; // ISO timestamp of the last run that finished without error
  lastRunOk: boolean | null;
  lastError: string | null;
  lastTotalRows: number;        // diet_plans rows seen last run
  lastDuplicateClients: number; // clients with >1 diet_plans row last run
  duplicateClientIds: string[]; // capped sample of offending client_ids (for triage)
  runs: number;                 // total runs since process start
};

const health: DietPlanDuplicatesHealth = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastRunOk: null,
  lastError: null,
  lastTotalRows: 0,
  lastDuplicateClients: 0,
  duplicateClientIds: [],
  runs: 0,
};

// The check runs hourly; allow some slack before calling it stale.
export const STALE_AFTER_MS = 75 * 60 * 1000;
const SAMPLE_CAP = 20;

// Evaluated health: healthy only if the last run succeeded recently AND
// found zero clients with duplicate rows. Duplicates piling up (the
// regression this exists to catch), a failed check, and a silently stopped
// interval all turn /healthz degraded on their own.
export function getDietPlanDuplicatesHealth(now: Date = new Date()): DietPlanDuplicatesHealth & { healthy: boolean; stale: boolean } {
  const stale =
    health.runs > 0 &&
    (!health.lastRunAt || now.getTime() - Date.parse(health.lastRunAt) > STALE_AFTER_MS);
  const neverRan = health.runs === 0; // startup grace: first run happens immediately
  return {
    ...health,
    stale,
    healthy: !stale && (neverRan || (health.lastRunOk === true && health.lastDuplicateClients === 0)),
  };
}

// Exported for run-level tests (which mock global fetch).
export async function checkDietPlanDuplicates() {
  health.runs++;
  if (!sbKey()) {
    // Misconfiguration is a FAILED run, not a silent no-op — otherwise a
    // missing key would leave /healthz green while the check never runs.
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = "SUPABASE_SERVICE_ROLE_KEY missing — duplicate check disabled";
    logger.error("[DietPlanDupes] SUPABASE_SERVICE_ROLE_KEY missing — duplicate check disabled");
    return;
  }
  try {
    const key = sbKey();
    // Fetch client_id for EVERY diet_plans row, paginating with Range headers.
    // PostgREST caps a single response (commonly 1,000 rows), so a single GET
    // would silently drop rows beyond the first page — and duplicates hiding
    // on a later page are exactly the regression this watcher must catch.
    // Any failed or malformed page fails the whole run: never coerce partial
    // data to "no duplicates". Counting in memory avoids needing SQL DDL
    // (no DB functions/views can be created in this project).
    const PAGE = 1000;
    const rows: Array<{ client_id: string | null }> = [];
    for (let from = 0; ; from += PAGE) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/diet_plans?select=client_id&order=id.asc`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Range: `${from}-${from + PAGE - 1}`,
            "Range-Unit": "items",
          },
        },
      );
      if (!r.ok) throw new Error(`Supabase GET diet_plans failed: HTTP ${r.status} (rows ${from}+)`);
      let body: unknown;
      try {
        body = await r.json();
      } catch {
        throw new Error(`Supabase GET diet_plans returned a malformed body (rows ${from}+)`);
      }
      if (!Array.isArray(body)) throw new Error(`Supabase GET diet_plans returned a non-array body (rows ${from}+)`);
      rows.push(...(body as Array<{ client_id: string | null }>));
      if (body.length < PAGE) break; // short page = last page
    }

    const dupes = findDuplicateClientIds(rows);
    health.lastRunAt = new Date().toISOString();
    health.lastSuccessAt = health.lastRunAt;
    health.lastRunOk = true;
    health.lastError = null;
    health.lastTotalRows = rows.length;
    health.lastDuplicateClients = dupes.length;
    health.duplicateClientIds = dupes.slice(0, SAMPLE_CAP);
    if (dupes.length > 0) {
      logger.error(
        { totalRows: rows.length, duplicateClients: dupes.length, sample: health.duplicateClientIds },
        "[DietPlanDupes] DUPLICATE diet_plans rows detected — insert-per-save regression? /healthz is degraded until resolved",
      );
    } else {
      // Always log the summary — the hourly "0 duplicates" line is the
      // heartbeat that proves the check is alive.
      logger.info({ totalRows: rows.length, duplicateClients: 0 }, "[DietPlanDupes] check complete — no duplicates");
    }
  } catch (err) {
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "[DietPlanDupes] check FAILED — duplicate status unknown");
  }
}

export function startDietPlanDuplicateWatcher() {
  checkDietPlanDuplicates();                          // once on startup
  setInterval(checkDietPlanDuplicates, 60 * 60 * 1000); // then hourly
}
