// huddle.ts — create real Daily.co video rooms for team huddles.
//
// The frontend used to fabricate a daily.co URL without ever creating
// the room, so joining showed "room does not exist". This route creates
// a real room via the Daily REST API (DAILY_API_KEY secret) and returns
// its URL. Rooms auto-expire after 4 hours so they clean themselves up.
// White-label: each org connects its OWN Daily.co account. Org keys live
// in admin_settings (key 'daily_api_key', managed only via the admin-only
// route below). Eden's own org falls back to the DAILY_API_KEY secret.
import { Router, type IRouter, type Request, type Response } from "express";
import { requireStaff } from "./checkinForm";

const EDEN_DAILY_KEY = process.env.DAILY_API_KEY || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

// Resolve the Daily API key for an org: own key first, Eden env fallback
// only for Eden's own org.
export async function dailyKeyForOrg(companyId: string): Promise<string> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.daily_api_key&select=value`,
      { headers: SH },
    );
    const rows = (r.ok ? await r.json().catch(() => []) : []) as any[];
    const own = String(rows?.[0]?.value || "").trim();
    if (own) return own;
  } catch { /* fall through */ }
  return companyId === EDEN_ORG_ID ? EDEN_DAILY_KEY : "";
}

async function validDailyKey(key: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.daily.co/v1/rooms?limit=1", {
      headers: { Authorization: `Bearer ${key}` },
    });
    return r.ok;
  } catch { return false; }
}

const router: IRouter = Router();

router.post("/huddle/create", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const DAILY_API_KEY = await dailyKeyForOrg(caller.company_id);
    if (!DAILY_API_KEY) {
      res.status(400).json({ error: "Video huddles aren't connected for your organization yet — ask your admin to add a Daily.co API key in the admin panel." });
      return;
    }

    const name = `eden-${String(caller.company_id).slice(0, 8)}-${Date.now()}`;
    const r = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${DAILY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        privacy: "public",
        properties: {
          exp: Math.floor(Date.now() / 1000) + 4 * 3600, // room self-destructs in 4h
          enable_chat: true,
          enable_screenshare: true,
        },
      }),
    });
    const data: any = await r.json().catch(() => null);
    if (!r.ok || !data?.url) {
      res.status(502).json({ error: "Could not create the call room" });
      return;
    }
    res.json({ ok: true, url: data.url, name: data.name });
  } catch {
    res.status(500).json({ error: "Could not create the call room" });
  }
});

// ── Admin: connect / disconnect the org's own Daily.co account ──

// Status: is video connected for the caller's org, and how?
router.get("/huddle/status", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const key = await dailyKeyForOrg(caller.company_id);
    const own = key !== "" && !(caller.company_id === EDEN_ORG_ID && key === EDEN_DAILY_KEY);
    res.json({ connected: Boolean(key), source: own ? "own" : key ? "builtin" : "none" });
  } catch {
    res.status(500).json({ error: "Status check failed" });
  }
});

// Save the org's own Daily API key (admins only). Validates it first.
router.post("/huddle/daily-key", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can connect a Daily.co account" }); return; }
    const key = String(req.body?.key || "").trim();
    if (!key) { res.status(400).json({ error: "Paste your Daily.co API key" }); return; }
    if (!(await validDailyKey(key))) {
      res.status(400).json({ error: "That key didn't work — copy it again from dashboard.daily.co → Developers" });
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: caller.company_id,
        key: "daily_api_key",
        value: key,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) { res.status(502).json({ error: "Could not save the key" }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not save the key" });
  }
});

// Disconnect the org's Daily account (admins only).
router.post("/huddle/daily-key/remove", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can disconnect Daily.co" }); return; }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.daily_api_key`,
      { method: "DELETE", headers: SH },
    );
    if (!r.ok) { res.status(502).json({ error: "Could not disconnect" }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not disconnect" });
  }
});

// ── Do Not Disturb — synced across ALL of a user's devices ──────
// Stored zero-DDL in admin_settings as key `dnd_<userId>` with a JSON
// value {"until":"forever"|"<ISO timestamp>"}. Expired timestamps count
// as OFF, so timed DND self-expires with no cleanup job.

function parseDnd(value: unknown): { on: boolean; until: string | null } {
  try {
    const v = typeof value === "string" ? JSON.parse(value) : value as any;
    const until = String(v?.until || "");
    if (until === "forever") return { on: true, until: "forever" };
    const t = Date.parse(until);
    if (Number.isFinite(t) && t > Date.now()) return { on: true, until: new Date(t).toISOString() };
  } catch { /* treat as off */ }
  return { on: false, until: null };
}

router.get("/dnd", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.dnd_${caller.id}&select=value`,
      { headers: SH },
    );
    const rows = (r.ok ? await r.json().catch(() => []) : []) as any[];
    res.json(parseDnd(rows?.[0]?.value));
  } catch {
    res.status(500).json({ error: "Could not load Do Not Disturb" });
  }
});

router.post("/dnd", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const raw = req.body?.until;
    // until: null/"" = turn OFF, "forever", or a future ISO timestamp
    let until: string | null = null;
    if (raw === "forever") until = "forever";
    else if (raw) {
      const t = Date.parse(String(raw));
      if (!Number.isFinite(t) || t <= Date.now()) { res.status(400).json({ error: "Invalid Do Not Disturb time" }); return; }
      if (t > Date.now() + 7 * 24 * 3600 * 1000) { res.status(400).json({ error: "Do Not Disturb can be set for up to 7 days" }); return; }
      until = new Date(t).toISOString();
    }
    if (!until) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.dnd_${caller.id}`,
        { method: "DELETE", headers: SH },
      );
      if (!r.ok) { res.status(502).json({ error: "Could not turn off Do Not Disturb" }); return; }
      res.json({ on: false, until: null });
      return;
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        company_id: caller.company_id,
        key: `dnd_${caller.id}`,
        value: JSON.stringify({ until }),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) { res.status(502).json({ error: "Could not save Do Not Disturb" }); return; }
    res.json(parseDnd(JSON.stringify({ until })));
  } catch {
    res.status(500).json({ error: "Could not save Do Not Disturb" });
  }
});

export default router;
