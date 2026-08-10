// teamSeen.ts — cross-device read/unread sync for Team Hub chat.
//
// Each staff member's "last viewed" timestamps live in ONE admin_settings row,
// key `teamhub_seen:<userId>`, value JSON { general: ts, "<idA>_<idB>": ts }.
// The server always merges per-key with Math.max, so a stale device can never
// roll another device's newer read state backwards. localStorage on the client
// remains a fast local cache; this row is the source of truth.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

async function rest<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}

type Profile = { id: string; role: string; company_id: string | null };
async function requireStaff(req: Request): Promise<Profile | null> {
  const auth = String(req.get("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const user: any = await r.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const rows = await rest<any>(`user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`);
  const me = rows[0];
  if (!me || me.role === "client") return null; // Team Hub is staff-only
  return me;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
// Valid conversation keys: "general" or "<uuidA>_<uuidB>" (DM pair, sorted)
const KEY_RE = new RegExp(`^(general|${UUID}_${UUID})$`, "i");

export function sanitize(input: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== "object") return out;
  const now = Date.now() + 5 * 60 * 1000; // reject clock-skewed future stamps
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (n >= 500) break; // hard cap — a seen map should never be this big
    if (!KEY_RE.test(k)) continue;
    const t = Number(v);
    if (!Number.isFinite(t) || t <= 0 || t > now) continue;
    out[k] = Math.floor(t);
    n++;
  }
  return out;
}

async function readSeenRow(me: Profile): Promise<{ seen: Record<string, number>; updatedAt: string | null; exists: boolean }> {
  const key = `teamhub_seen:${me.id}`;
  const rows = await rest<any>(`admin_settings?key=eq.${encodeURIComponent(key)}&select=value,updated_at&limit=1`);
  const row = rows[0];
  let seen: Record<string, number> = {};
  try { seen = sanitize(JSON.parse(row?.value ?? "{}")); } catch {}
  return { seen, updatedAt: row?.updated_at ?? null, exists: !!row };
}

export function mergeMax(current: Record<string, number>, incoming: Record<string, number>): Record<string, number> {
  const merged = { ...current };
  for (const [k, t] of Object.entries(incoming)) {
    if (!merged[k] || t > merged[k]) merged[k] = t;
  }
  return merged;
}

// Atomic persist: merge per-key max, then write with a compare-and-swap on
// updated_at so two concurrent devices can never clobber each other's keys.
// On CAS miss, re-read and retry — every retry re-merges against the latest
// row, so timestamps only ever move forward.
async function saveSeenAtomic(me: Profile, incoming: Record<string, number>): Promise<Record<string, number> | null> {
  const key = `teamhub_seen:${me.id}`;
  const orgId = me.company_id || EDEN_ORG_ID;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { seen: current, updatedAt, exists } = await readSeenRow(me);
    const merged = mergeMax(current, incoming);
    // Nothing new to persist — current DB state already covers the incoming map
    if (exists && Object.keys(merged).every((k) => current[k] === merged[k]) &&
        Object.keys(current).length === Object.keys(merged).length) return merged;
    const value = JSON.stringify(merged);
    const stamp = new Date().toISOString();
    if (!exists) {
      // Plain insert — a concurrent insert makes this 409, and we retry-merge
      const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
        method: "POST", headers: SH,
        body: JSON.stringify({ company_id: orgId, key, value, updated_at: stamp }),
      });
      if (r.ok) return merged;
      if (r.status !== 409) return null;
      continue; // lost the insert race — re-read and merge
    }
    // Conditional update: only lands if nobody wrote since our read
    const guard = updatedAt === null ? "updated_at=is.null" : `updated_at=eq.${encodeURIComponent(updatedAt)}`;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?key=eq.${encodeURIComponent(key)}&company_id=eq.${orgId}&${guard}`,
      { method: "PATCH", headers: { ...SH, Prefer: "return=representation" }, body: JSON.stringify({ value, updated_at: stamp }) },
    );
    if (!r.ok) return null;
    const affected = await r.json().catch(() => []);
    if (Array.isArray(affected) && affected.length > 0) return merged; // CAS hit
    // CAS miss — someone else wrote in between; loop re-reads and re-merges
  }
  return null;
}

const router: IRouter = Router();

// GET /team/seen — this user's last-viewed map from the DB.
router.get("/team/seen", async (req: Request, res: Response) => {
  try {
    const me = await requireStaff(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    res.json({ ok: true, seen: (await readSeenRow(me)).seen });
  } catch (e) {
    logger.warn({ err: String(e) }, "[TeamSeen] read failed");
    res.status(500).json({ error: "Could not load read state" });
  }
});

// POST /team/seen { seen } — merge (per-key max) the caller's map into the DB.
// Returns the merged map so the device can update its cache.
router.post("/team/seen", async (req: Request, res: Response) => {
  try {
    const me = await requireStaff(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    const incoming = sanitize((req.body || {}).seen);
    const merged = await saveSeenAtomic(me, incoming);
    if (!merged) { res.status(500).json({ error: "Could not save read state" }); return; }
    res.json({ ok: true, seen: merged });
  } catch (e) {
    logger.warn({ err: String(e) }, "[TeamSeen] save failed");
    res.status(500).json({ error: "Could not save read state" });
  }
});

export default router;
