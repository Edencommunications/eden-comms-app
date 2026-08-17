// notifs.ts — mark-read endpoints for bell notifications.
//
// Why this exists: the notifications RLS policy's WITH CHECK clause only
// allows updates when sender_id = me() or the caller is staff. A CLIENT
// marking a received notification read (recipient = me, sender = coach)
// passes USING but fails WITH CHECK, so the direct PATCH from the browser
// silently updated 0 rows and the notifications kept coming back.
// The server holds the service key and updates on the recipient's behalf
// after verifying the token belongs to that recipient.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve the caller's user_profiles row from their Supabase JWT. */
async function requireUser(req: Request): Promise<{ id: string } | null> {
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
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id`,
    { headers: SH },
  );
  if (!pr.ok) return null;
  const rows = (await pr.json().catch(() => [])) as any[];
  return rows[0] || null;
}

async function markRead(filter: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/notifications?${filter}`, {
    method: "PATCH",
    headers: SH,
    body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }),
  });
  return r.ok;
}

const router: IRouter = Router();

// POST /notifs/read  body: { id } — mark one of MY notifications read
router.post("/notifs/read", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not signed in" }); return; }
    const id = String(req.body?.id || "");
    if (!UUID_RE.test(id) && !/^\d+$/.test(id)) { res.status(400).json({ error: "Bad id" }); return; }
    const ok = await markRead(`id=eq.${encodeURIComponent(id)}&recipient_id=eq.${me.id}`);
    if (!ok) { res.status(502).json({ error: "Update failed" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[notifs] read error");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /notifs/read-all — mark ALL my unread notifications read
router.post("/notifs/read-all", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not signed in" }); return; }
    const ok = await markRead(`recipient_id=eq.${me.id}&is_read=eq.false`);
    if (!ok) { res.status(502).json({ error: "Update failed" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[notifs] read-all error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
