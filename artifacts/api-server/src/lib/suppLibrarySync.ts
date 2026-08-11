// suppLibrarySync.ts — add-only propagation of Eden's supplement library.
//
// Eden's company_supplements rows are the master list. Every hour (and on
// boot), any Eden supplement an org has NEVER received is copied into that
// org's own library. Add-only: an org's edits and deletions are respected —
// once a supplement has been propagated to an org it is never re-inserted,
// even if the org deletes it. Eden edits to an existing supp are NOT pushed
// (orgs own their copies).
//
// Per-org "already propagated" state lives in admin_settings key
// `supp_sync_seen` (company_id = the org), a JSON array of normalized
// "category||name" keys. On an org's first pass, the org's EXISTING supps
// are seeded into that list so same-name supps are never duplicated.
//
// Monitoring: follows the startDateReminders pattern — every run logs a
// heartbeat summary and updates an evaluated health snapshot for /healthz
// (failed last run or a silently-stopped job turns health degraded).
import { logger } from "./logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
const SEEN_KEY = "supp_sync_seen";
const INTERVAL_MS = 60 * 60 * 1000; // hourly
const STALE_AFTER_MS = 2 * 60 * 60 * 1000 + 10 * 60 * 1000; // 2h10m — two missed runs

function sbKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}
function sbHeaders(): Record<string, string> {
  const key = sbKey();
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}
async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`Supabase GET ${table} failed: HTTP ${r.status}`);
  const body = await r.json().catch(() => { throw new Error(`Supabase GET ${table} returned a malformed body`); });
  if (!Array.isArray(body)) throw new Error(`Supabase GET ${table} returned a non-array body`);
  return body as any[];
}

export function normKey(category: any, name: any): string {
  return `${String(category || "").trim().toLowerCase()}||${String(name || "").trim().toLowerCase()}`;
}

// ---- run health --------------------------------------------------------
type SuppSyncHealth = {
  runs: number;
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastError: string | null;
  lastInserted: number;
  lastOrgs: number;
};
const health: SuppSyncHealth = { runs: 0, lastRunAt: null, lastRunOk: null, lastError: null, lastInserted: 0, lastOrgs: 0 };

export function getSuppSyncHealth(now: Date = new Date()): SuppSyncHealth & { healthy: boolean; stale: boolean } {
  const stale = health.runs > 0 && (!health.lastRunAt || now.getTime() - Date.parse(health.lastRunAt) > STALE_AFTER_MS);
  const neverRan = health.runs === 0; // startup grace: first run happens on boot
  const healthy = neverRan || (health.lastRunOk === true && !stale);
  return { ...health, healthy, stale };
}

// ---- one pass ----------------------------------------------------------
// ---- multi-instance lease (dev + prod share the DB) --------------------
// Claimed by compare-and-swap on an admin_settings row, exactly like the
// push watcher: only one server instance syncs at a time, so two instances
// can never both insert the same missing rows.
const LEASE_KEY = "supp_sync_lease";
const LEASE_MS = 10 * 60 * 1000; // generous: a pass is seconds, lease 10 min
async function claimLease(instance: string): Promise<boolean> {
  const rows = await sbGet("admin_settings", `company_id=eq.${EDEN_ORG_ID}&key=eq.${LEASE_KEY}&select=value`);
  const raw: string | null = rows[0] ? String(rows[0].value) : null;
  let cur: { at?: string; holder?: string } = {};
  try { cur = raw ? JSON.parse(raw) : {}; } catch { cur = {}; }
  if (cur.at && cur.holder !== instance && Date.now() - Date.parse(cur.at) < LEASE_MS) return false;
  const next = JSON.stringify({ at: new Date().toISOString(), holder: instance });
  if (raw === null) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
      method: "POST", headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify([{ company_id: EDEN_ORG_ID, key: LEASE_KEY, value: next }]),
    });
    return r.ok; // a duplicate-key failure means someone else just created it
  }
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${LEASE_KEY}&value=eq.${encodeURIComponent(raw)}`,
    { method: "PATCH", headers: { ...sbHeaders(), Prefer: "return=representation" }, body: JSON.stringify({ value: next }) },
  );
  const won = (r.ok ? await r.json().catch(() => []) : []) as any[];
  return Array.isArray(won) && won.length > 0;
}

const INSTANCE = Math.random().toString(36).slice(2);

export async function runSuppSyncPass(): Promise<{ orgs: number; inserted: number; skipped?: boolean }> {
  if (!sbKey()) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  if (!(await claimLease(INSTANCE))) return { orgs: 0, inserted: 0, skipped: true };

  // Master list = Eden's current library
  const eden = await sbGet(
    "company_supplements",
    `company_id=eq.${EDEN_ORG_ID}&select=category,name,dose,directions,code,link&order=category.asc,sort_order.asc.nullslast,created_at.asc`,
  );
  const edenByKey = new Map<string, any>();
  for (const s of eden) edenByKey.set(normKey(s.category, s.name), s);
  if (edenByKey.size === 0) return { orgs: 0, inserted: 0 }; // never blank-sync

  // Every org except Eden. companies mirrors organizations (FK target for
  // company_supplements), so it is the authoritative org list here.
  const orgs = await sbGet("companies", `id=neq.${EDEN_ORG_ID}&select=id`);

  let inserted = 0;
  for (const org of orgs) {
    const orgId = org.id;
    // Already-propagated keys for this org (tombstones survive org deletions)
    const seenRows = await sbGet("admin_settings", `company_id=eq.${orgId}&key=eq.${SEEN_KEY}&select=value`);
    let seen: string[] | null = null;
    try { seen = seenRows[0] ? JSON.parse(String(seenRows[0].value)) : null; } catch { seen = null; }
    const firstRun = !Array.isArray(seen);
    const seenSet = new Set<string>(Array.isArray(seen) ? seen : []);

    // First pass for an org: mark everything it ALREADY has as seen so a
    // same-name supp is never duplicated, and long-standing orgs aren't
    // suddenly flooded with the whole Eden catalog they chose not to keep…
    // except they never chose — so on first run we DO copy missing Eden supps
    // (that is the point of add-only sync) but skip name matches.
    // Belt-and-braces: ALWAYS check what the org currently has right before
    // inserting — even outside the first run. If a previous pass inserted a
    // row but crashed before writing the tombstone, this prevents a duplicate.
    const existing = await sbGet("company_supplements", `company_id=eq.${orgId}&select=category,name`);
    const existingKeys = new Set(existing.map((s: any) => normKey(s.category, s.name)));
    if (firstRun) for (const k of existingKeys) seenSet.add(k);

    const missing = [...edenByKey.entries()].filter(([k]) => !seenSet.has(k) && !existingKeys.has(k));
    // Rows the org already has but the tombstone list missed (crash recovery):
    // record them as seen so they are never candidates again.
    let seenChanged = false;
    for (const k of edenByKey.keys()) {
      if (!seenSet.has(k) && existingKeys.has(k)) { seenSet.add(k); seenChanged = true; }
    }
    if (missing.length > 0) {
      const rows = missing.map(([, s]) => ({
        company_id: orgId,
        category: s.category, name: s.name,
        dose: s.dose || "", directions: s.directions || "", code: s.code || "", link: s.link || "",
      }));
      const r = await fetch(`${SUPABASE_URL}/rest/v1/company_supplements`, {
        method: "POST", headers: sbHeaders(), body: JSON.stringify(rows),
      });
      if (!r.ok) throw new Error(`Supabase INSERT company_supplements (org ${orgId}) failed: HTTP ${r.status}`);
      inserted += rows.length;
      for (const [k] of missing) seenSet.add(k);
    }

    // Persist the seen list whenever it changed (first-run seeding counts)
    if (firstRun || missing.length > 0 || seenChanged) {
      const value = JSON.stringify([...seenSet]);
      const up = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
        method: "POST",
        headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([{ company_id: orgId, key: SEEN_KEY, value }]),
      });
      if (!up.ok) throw new Error(`Supabase UPSERT admin_settings ${SEEN_KEY} (org ${orgId}) failed: HTTP ${up.status}`);
    }
  }
  return { orgs: orgs.length, inserted };
}

async function pass() {
  health.runs += 1;
  try {
    const { orgs, inserted } = await runSuppSyncPass();
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = true;
    health.lastError = null;
    health.lastInserted = inserted;
    health.lastOrgs = orgs;
    // Heartbeat — logged every run, even "0 inserted"
    logger.info({ orgs, inserted }, "[SuppSync] run complete");
  } catch (e) {
    health.lastRunAt = new Date().toISOString();
    health.lastRunOk = false;
    health.lastError = String(e);
    logger.warn({ err: String(e) }, "[SuppSync] run failed");
  }
}

export function startSuppLibrarySync() {
  pass(); // run once on boot
  setInterval(pass, INTERVAL_MS);
}
