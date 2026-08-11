// msgUnread.ts — cross-device "keep this conversation unread" marks for the
// coach↔client Messages tab.
//
// Each user's manual unread marks live in ONE admin_settings row,
// key `msgs_unread:<userId>`, value JSON array of conversation UUIDs.
// The list is small (a handful of pinned-unread threads), so the write is a
// simple replace — one user, last device wins.
//
// Authz: caller must be an active user; every conversation id they mark must
// be a conversation they participate in (participant_a_id / participant_b_id).
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MARKS = 100;

async function rest<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}

type Profile = { id: string; company_id: string | null };
async function requireUser(req: Request): Promise<Profile | null> {
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
  const rows = await rest<any>(`user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,company_id`);
  return rows[0] || null;
}

export function sanitizeMarks(input: any): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    const s = String(v || "").trim();
    if (!UUID_RE.test(s)) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length >= MAX_MARKS) break;
  }
  return out;
}

async function readMarks(userId: string): Promise<string[]> {
  const rows = await rest<any>(`admin_settings?key=eq.${encodeURIComponent(`msgs_unread:${userId}`)}&select=value&limit=1`);
  try { return sanitizeMarks(JSON.parse(rows[0]?.value ?? "[]")); } catch { return []; }
}

// Keep only conversations the caller actually participates in.
async function filterToMine(me: Profile, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const list = ids.join(",");
  const rows = await rest<any>(
    `conversations?id=in.(${list})&or=(participant_a_id.eq.${me.id},participant_b_id.eq.${me.id})&select=id`,
  );
  const mine = new Set(rows.map((r: any) => r.id));
  return ids.filter((id) => mine.has(id));
}

async function saveMarks(me: Profile, ids: string[]): Promise<boolean> {
  const key = `msgs_unread:${me.id}`;
  const value = JSON.stringify(ids);
  const stamp = new Date().toISOString();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`,
    {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{ company_id: me.company_id || EDEN_ORG_ID, key, value, updated_at: stamp }]),
    },
  );
  return r.ok;
}

const router: IRouter = Router();

// GET /msgs/unread — this user's manual unread conversation ids.
router.get("/msgs/unread", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    res.json({ ok: true, unread: await readMarks(me.id) });
  } catch (e) {
    logger.warn({ err: String(e) }, "[MsgUnread] read failed");
    res.status(500).json({ error: "Could not load unread marks" });
  }
});

// POST /msgs/unread { unread: [convoId,...] } — replace this user's marks.
router.post("/msgs/unread", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    const wanted = sanitizeMarks((req.body || {}).unread);
    const mine = await filterToMine(me, wanted);
    if (!(await saveMarks(me, mine))) { res.status(500).json({ error: "Could not save unread marks" }); return; }
    res.json({ ok: true, unread: mine });
  } catch (e) {
    logger.warn({ err: String(e) }, "[MsgUnread] save failed");
    res.status(500).json({ error: "Could not save unread marks" });
  }
});

export default router;
