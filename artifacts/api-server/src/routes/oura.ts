// oura.ts — Oura Ring OAuth2 connect + data sync.
//
// Flow: client taps "Connect Oura Ring" → POST /oura/connect returns the
// Oura authorize URL (state is HMAC-signed with SESSION_SECRET so the
// callback can't be forged) → Oura redirects to GET /oura/callback →
// tokens are exchanged and stored server-side in admin_settings
// (key `oura:<clientId>`, schema is frozen so no new tables) → the
// Wearables tab pulls GET /oura/data which syncs sleep / readiness /
// heart-rate / activity from the Oura API v2, refreshing tokens as needed.
//
// Auth: the client themself may connect/disconnect; the client OR any
// active staff member in the same org may read status/data (coaches see
// their clients' data in the client panel).
import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID || "";
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const OURA_AUTH_URL = "https://cloud.ouraring.com/oauth/authorize";
// Must exactly match the Redirect URL registered in the Oura developer
// portal (developer.ouraring.com). Sent in BOTH the authorize URL and the
// token exchange — Oura's newer apps reject exchanges without it.
const OURA_REDIRECT_URI =
  process.env.OURA_REDIRECT_URI || "https://edencommunications.io/api/oura/callback";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_API = "https://api.ouraring.com/v2/usercollection";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function svcGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SH });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as any[];
}

// ── Auth helpers ──────────────────────────────────────────────
type Profile = { id: string; role: string; company_id: string };

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
  const rows = await svcGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`,
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID };
}

// Staff roles that may view a same-org client's wearable data (mirrors the
// roles that get the client tool panel in the app).
const STAFF_ROLES = new Set(["coach", "head_coach", "super_admin", "va", "staff", "company_admin"]);

// Caller may read clientId's wearable data if they ARE the client, or
// they are staff in the same org as the client.
async function canRead(caller: Profile, clientId: string): Promise<boolean> {
  if (caller.id === clientId) return true;
  if (!STAFF_ROLES.has(caller.role)) return false;
  const rows = await svcGet("user_profiles", `id=eq.${encodeURIComponent(clientId)}&select=id,company_id`);
  if (!rows[0]) return false;
  return (rows[0].company_id || EDEN_ORG_ID) === caller.company_id;
}

// ── Signed OAuth state ────────────────────────────────────────
function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}
function makeState(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
function readState(state: string): any | null {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data?.uid || !data?.ts || Date.now() - data.ts > 15 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

// ── Token encryption ──────────────────────────────────────────
// admin_settings rows are org-readable via RLS, so OAuth tokens are NEVER
// stored in plaintext: they're AES-256-GCM encrypted with a server-only key
// derived from SESSION_SECRET. A same-org client reading the row directly
// through Supabase gets only ciphertext.
const ENC_KEY = createHash("sha256").update(`oura-tokens:${SESSION_SECRET}`).digest();

function encryptTokens(tokens: any): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return `enc1.${iv.toString("base64url")}.${ct.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

function decryptTokens(value: string): any | null {
  try {
    const [ver, ivB64, ctB64, tagB64] = String(value || "").split(".");
    if (ver !== "enc1" || !ivB64 || !ctB64 || !tagB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
    return JSON.parse(pt.toString("utf8"));
  } catch { return null; }
}

// ── Token storage (admin_settings, key oura:<clientId>, encrypted) ──
async function loadTokens(companyId: string, clientId: string): Promise<any | null> {
  const rows = await svcGet(
    "admin_settings",
    `company_id=eq.${companyId}&key=eq.${encodeURIComponent(`oura:${clientId}`)}&select=value`,
  );
  if (!rows[0]?.value) return null;
  return decryptTokens(rows[0].value);
}

async function saveTokens(companyId: string, clientId: string, tokens: any): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id: companyId,
      key: `oura:${clientId}`,
      value: encryptTokens(tokens),
      updated_at: new Date().toISOString(),
    }),
  });
  return r.ok;
}

async function deleteTokens(companyId: string, clientId: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`oura:${clientId}`)}`,
    { method: "DELETE", headers: SH },
  ).catch(() => {});
}

// ── Oura token exchange / refresh ─────────────────────────────
async function tokenRequest(params: Record<string, string>): Promise<any | null> {
  const r = await fetch(OURA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: OURA_CLIENT_ID,
      client_secret: OURA_CLIENT_SECRET,
      ...params,
    }).toString(),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error(`[oura] token request failed (${r.status}): ${detail.slice(0, 300)}`);
    return null;
  }
  return await r.json().catch(() => null);
}

// Get a valid access token, refreshing if expired. Returns null when the
// connection is broken (user must reconnect).
async function freshAccessToken(companyId: string, clientId: string): Promise<string | null> {
  const tokens = await loadTokens(companyId, clientId);
  if (!tokens?.access_token) return null;
  const expiresAt = Number(tokens.expires_at || 0);
  if (expiresAt && Date.now() < expiresAt - 60_000) return tokens.access_token;
  if (!tokens.refresh_token) return tokens.access_token; // try anyway
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  if (!refreshed?.access_token) return null;
  await saveTokens(companyId, clientId, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + Number(refreshed.expires_in || 86400) * 1000,
    connected_at: tokens.connected_at || new Date().toISOString(),
  });
  return refreshed.access_token;
}

async function ouraGet(accessToken: string, path: string, start: string, end: string): Promise<any[]> {
  try {
    const r = await fetch(`${OURA_API}/${path}?start_date=${start}&end_date=${end}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return [];
    const j: any = await r.json().catch(() => null);
    return Array.isArray(j?.data) ? j.data : [];
  } catch { return []; }
}

const router: IRouter = Router();

// ── Start OAuth: returns the Oura authorize URL ───────────────
// Body: { origin: string, returnPath?: string }
router.post("/oura/connect", async (req: Request, res: Response) => {
  try {
    if (!OURA_CLIENT_ID || !OURA_CLIENT_SECRET) {
      res.status(400).json({ error: "Oura isn't configured yet — ask your admin to add the Oura app credentials." });
      return;
    }
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    // Self-connect only, clients only: tokens are stored under the CALLER's
    // id, so any non-client (coach, VA, admin…) must never start this flow —
    // e.g. a coach viewing a client's Wearables tab would otherwise link
    // their own Oura account under the wrong identity.
    if (caller.role !== "client") {
      res.status(403).json({ error: "Only clients can connect their own Oura Ring." });
      return;
    }
    const origin = String(req.body?.origin || "");
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(origin)) { res.status(400).json({ error: "Invalid origin" }); return; }
    const returnPath = String(req.body?.returnPath || "/").slice(0, 200);
    // The return destination (origin + path the user came from) is carried
    // in the signed `state` parameter; redirect_uri is the fixed registered
    // callback and must match the Oura developer portal exactly.
    const state = makeState({ uid: caller.id, cid: caller.company_id, origin, rp: returnPath, ts: Date.now() });
    const url =
      `${OURA_AUTH_URL}?response_type=code` +
      `&client_id=${encodeURIComponent(OURA_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(OURA_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent("email personal daily heartrate")}` +
      `&state=${encodeURIComponent(state)}`;
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Could not start Oura connection" });
  }
});

// ── OAuth callback (browser redirect from Oura) ───────────────
router.get("/oura/callback", async (req: Request, res: Response) => {
  const data = readState(String(req.query["state"] || ""));
  const back = (extra: string) => {
    const base = data?.origin && data?.rp ? `${data.origin}${data.rp}` : "/";
    res.redirect(`${base}${base.includes("?") ? "&" : "?"}${extra}`);
  };
  try {
    if (!data) { res.status(400).send("Invalid or expired connection link. Please go back to the app and try again."); return; }
    if (req.query["error"]) { back("oura=denied"); return; }
    const code = String(req.query["code"] || "");
    if (!code) { back("oura=error"); return; }
    // redirect_uri must be present and identical to the one sent in the
    // authorize request, per OAuth2 — Oura rejects the exchange otherwise.
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: OURA_REDIRECT_URI,
    });
    if (!tokens?.access_token) { back("oura=error"); return; }
    const ok = await saveTokens(data.cid, data.uid, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: Date.now() + Number(tokens.expires_in || 86400) * 1000,
      connected_at: new Date().toISOString(),
    });
    back(ok ? "oura=connected" : "oura=error");
  } catch {
    back("oura=error");
  }
});

// ── Connection status ─────────────────────────────────────────
router.get("/oura/status", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const clientId = String(req.query["clientId"] || caller.id);
    if (!(await canRead(caller, clientId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await svcGet("user_profiles", `id=eq.${encodeURIComponent(clientId)}&select=company_id`);
    const companyId = rows[0]?.company_id || EDEN_ORG_ID;
    const tokens = await loadTokens(companyId, clientId);
    res.json({ connected: !!tokens?.access_token, connectedAt: tokens?.connected_at || null });
  } catch {
    res.status(500).json({ error: "Status check failed" });
  }
});

// ── Synced data: last 7 days of sleep / readiness / HR / steps ─
router.get("/oura/data", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const clientId = String(req.query["clientId"] || caller.id);
    if (!(await canRead(caller, clientId))) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await svcGet("user_profiles", `id=eq.${encodeURIComponent(clientId)}&select=company_id`);
    const companyId = rows[0]?.company_id || EDEN_ORG_ID;
    const accessToken = await freshAccessToken(companyId, clientId);
    if (!accessToken) { res.json({ connected: false, readings: [] }); return; }

    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [dailySleep, sleep, readiness, activity] = await Promise.all([
      ouraGet(accessToken, "daily_sleep", start, end),
      ouraGet(accessToken, "sleep", start, end),
      ouraGet(accessToken, "daily_readiness", start, end),
      ouraGet(accessToken, "daily_activity", start, end),
    ]);

    // Merge per-day. `sleep` sessions carry HRV / lowest HR / duration;
    // pick the longest session per day.
    const byDay: Record<string, any> = {};
    const day = (d: string) => { byDay[d] = byDay[d] || { date: d }; return byDay[d]; };
    for (const s of dailySleep) day(s.day).sleepScore = s.score ?? null;
    for (const r of readiness) {
      const d = day(r.day);
      d.readinessScore = r.score ?? null;
      const dev = r.temperature_deviation;
      d.bodyTemp = typeof dev === "number" ? +(dev * 1.8).toFixed(1) : null; // °F deviation
    }
    for (const a of activity) day(a.day).steps = a.steps ?? null;
    for (const s of sleep) {
      const d = day(s.day);
      const dur = Number(s.total_sleep_duration || 0);
      if (!d.__dur || dur > d.__dur) {
        d.__dur = dur;
        d.sleepHours = dur ? +(dur / 3600).toFixed(1) : null;
        d.hrv = s.average_hrv != null ? Math.round(s.average_hrv) : null;
        d.restingHr = s.lowest_heart_rate != null ? Math.round(s.lowest_heart_rate) : null;
      }
    }
    const readings = Object.values(byDay)
      .map(({ __dur, ...r }: any) => r)
      .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 7);
    res.json({ connected: true, readings });
  } catch {
    res.status(500).json({ error: "Sync failed" });
  }
});

// ── Disconnect (client only, their own connection) ────────────
router.post("/oura/disconnect", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "client") { res.status(403).json({ error: "Only clients can disconnect their own Oura Ring." }); return; }
    await deleteTokens(caller.company_id, caller.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Disconnect failed" });
  }
});

export default router;
