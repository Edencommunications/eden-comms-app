// prefs.ts — tiny per-user preferences (currently: appearance theme).
//
// Zero-DDL storage: each user's prefs live in their own admin_settings row,
// key `prefs:<userId>`, value JSON { theme: 'dark'|'light' }. Only the caller
// can read/write their own row (identity comes from their Supabase JWT), so
// no cross-user or cross-org access is possible.
import { Router, type IRouter, type Request, type Response } from "express";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const EDEN_ID = "b0000000-0000-0000-0000-000000000001";

type Me = { id: string; company_id: string | null };
async function requireUser(req: Request): Promise<Me | null> {
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
  const q = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,company_id&limit=1`,
    { headers: SH },
  );
  const rows: any[] = q.ok ? ((await q.json().catch(() => [])) as any[]) : [];
  return rows[0] || null;
}

const prefsKey = (id: string) => `prefs:${id}`;

async function loadPrefs(me: Me): Promise<any> {
  const cid = me.company_id || EDEN_ID;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${cid}&key=eq.${encodeURIComponent(prefsKey(me.id))}&select=value&limit=1`,
    { headers: SH },
  );
  const rows: any[] = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
  try { return rows[0] ? JSON.parse(rows[0].value) : {}; } catch { return {}; }
}

const router: IRouter = Router();

router.get("/prefs/theme", async (req: Request, res: Response) => {
  const me = await requireUser(req);
  if (!me) { res.status(401).json({ error: "Not signed in" }); return; }
  const prefs = await loadPrefs(me);
  res.json({ ok: true, mode: prefs.theme === "light" || prefs.theme === "brand" ? prefs.theme : "dark" });
});

router.post("/prefs/theme", async (req: Request, res: Response) => {
  const me = await requireUser(req);
  if (!me) { res.status(401).json({ error: "Not signed in" }); return; }
  const m = req.body?.mode === "light" || req.body?.mode === "brand" ? req.body.mode : "dark";
  const cid = me.company_id || EDEN_ID;
  const prefs = await loadPrefs(me);
  prefs.theme = m;
  const value = JSON.stringify(prefs);
  // Upsert own row (last write wins is fine — it's the same person's toggle).
  const up = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${cid}&key=eq.${encodeURIComponent(prefsKey(me.id))}`,
    { method: "PATCH", headers: { ...SH, Prefer: "return=representation" }, body: JSON.stringify({ value }) },
  );
  const patched: any[] = up.ok ? ((await up.json().catch(() => [])) as any[]) : [];
  if (!patched.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
      method: "POST", headers: { ...SH, Prefer: "return=minimal" },
      body: JSON.stringify({ company_id: cid, key: prefsKey(me.id), value }),
    });
  }
  res.json({ ok: true, mode: m });
});

export default router;
