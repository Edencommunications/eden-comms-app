// push.ts — real phone push notifications (Web Push) for Android + iPhone.
//
// How it works:
//   • The browser/PWA subscribes via the Push API and sends us its
//     subscription (endpoint + keys). We store it — zero DDL — in
//     admin_settings under key `push_sub:<userId>` (one row per user,
//     multiple devices inside).
//   • A watcher polls the `notifications` table every 20 s; every new bell
//     notification is mirrored as a phone push to the recipient's devices
//     (if they turned phone notifications ON). This automatically covers
//     every notification source — messages, broadcasts, ads recaps,
//     plan changes — including ones inserted directly by the frontend.
//   • VAPID keys are generated once on first boot and stored encrypted in
//     admin_settings (key `web_push_vapid`, Eden org row) — admin_settings
//     is org-readable under RLS, so the private key is AES-encrypted with
//     a SESSION_SECRET-derived key, same scheme as the Meta Ads token.
//   • Users toggle pushes on/off in the bell panel; the flag lives
//     server-side so OFF silences every device at once.
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import webpush from "web-push";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function dbGet<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}
async function dbUpsertSetting(companyId: string, key: string, value: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ company_id: companyId, key, value, updated_at: new Date().toISOString() }),
  });
  return r.ok;
}

// ── Encryption (same scheme as metaAds.ts) ─────────────────────
const ENC_KEY = crypto.createHash("sha256").update(`web-push-vapid:${process.env.SESSION_SECRET || ""}`).digest();
function enc(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}
function dec(stored: string): string {
  try {
    if (!stored?.startsWith("enc1:")) return "";
    const [, iv, tag, ct] = stored.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch { return ""; }
}

// ── VAPID keys: generate once, reuse forever ───────────────────
let VAPID: { publicKey: string; privateKey: string } | null = null;
async function getVapid(): Promise<{ publicKey: string; privateKey: string } | null> {
  if (VAPID) return VAPID;
  const rows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.web_push_vapid&select=value`);
  if (rows[0]) {
    try {
      const v = JSON.parse(rows[0].value);
      const privateKey = dec(v.private_enc);
      if (v.publicKey && privateKey) { VAPID = { publicKey: v.publicKey, privateKey }; }
    } catch { /* regenerate below */ }
  }
  let v = VAPID;
  if (!v) {
    const keys = webpush.generateVAPIDKeys();
    const ok = await dbUpsertSetting(EDEN_ORG_ID, "web_push_vapid",
      JSON.stringify({ publicKey: keys.publicKey, private_enc: enc(keys.privateKey) }));
    if (!ok) { logger.error("[Push] could not persist VAPID keys"); return null; }
    v = VAPID = keys;
    logger.info("[Push] generated new VAPID key pair");
  }
  webpush.setVapidDetails("mailto:support@edencommunications.io", v.publicKey, v.privateKey);
  return v;
}

// ── Auth: any logged-in user (clients included) ────────────────
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
  const rows = await dbGet<any>(`user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`);
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID };
}

// ── Endpoint validation (anti-SSRF) ────────────────────────────
// The watcher later POSTs to stored endpoints with server-side fetch, so
// only real browser push services may ever be saved — otherwise any
// authenticated user could aim our backend at internal/arbitrary URLs.
function isTrustedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1024) return false;
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return (
    h === "fcm.googleapis.com" ||                             // Chrome/Android
    h === "updates.push.services.mozilla.com" ||              // Firefox
    h.endsWith(".push.services.mozilla.com") ||
    h === "web.push.apple.com" || h.endsWith(".push.apple.com") || // Safari/iOS
    h.endsWith(".notify.windows.com")                         // Edge
  );
}

// ── Per-user subscription storage ──────────────────────────────
type UserPush = { enabled: boolean; subs: Array<{ endpoint: string; keys: any; ua?: string; added?: string }> };

async function getUserPush(userId: string): Promise<{ cfg: UserPush; companyId: string } | null> {
  const rows = await dbGet<any>(`admin_settings?key=eq.push_sub:${encodeURIComponent(userId)}&select=company_id,value`);
  if (!rows[0]) return null;
  try { return { cfg: JSON.parse(rows[0].value), companyId: rows[0].company_id }; } catch { return null; }
}
async function saveUserPush(companyId: string, userId: string, cfg: UserPush): Promise<boolean> {
  return dbUpsertSetting(companyId, `push_sub:${userId}`, JSON.stringify(cfg));
}

// ── Sending ────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  message: "💬 New message", diet_update: "🥗 Diet plan updated", supp_update: "💊 Supplements updated",
  workout_update: "💪 Workout updated", checkin_received: "📋 Check-in received", lab_uploaded: "🧪 Lab uploaded",
  update_note: "📝 Coach update", loom_posted: "🎥 Video update", meta_ads: "📊 Ads recap",
  start_reminder_7: "🚀 Program starts soon", start_reminder_1: "⏰ Starts tomorrow", start_reminder_0: "🎉 Starts today",
};

async function pushToUser(userId: string, title: string, body: string): Promise<void> {
  const found = await getUserPush(userId);
  if (!found || !found.cfg.enabled || !found.cfg.subs?.length) return;
  if (!(await getVapid())) return;
  const alive: typeof found.cfg.subs = [];
  let changed = false;
  for (const sub of found.cfg.subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body: body.slice(0, 180), url: "/" }),
        { TTL: 3600 },
      );
      alive.push(sub);
    } catch (e: any) {
      // 404/410 = subscription dead (user cleared site data / uninstalled)
      if (e?.statusCode === 404 || e?.statusCode === 410) { changed = true; continue; }
      alive.push(sub); // transient error — keep the device
      logger.warn({ userId, status: e?.statusCode }, "[Push] send failed (kept device)");
    }
  }
  if (changed) {
    // Re-read before pruning so we only remove the dead endpoints and never
    // clobber a device/preference change that happened during the sends.
    const dead = new Set(found.cfg.subs.filter((s) => !alive.includes(s)).map((s) => s.endpoint));
    const fresh = await getUserPush(userId);
    if (fresh) {
      fresh.cfg.subs = (fresh.cfg.subs || []).filter((s) => !dead.has(s.endpoint));
      await saveUserPush(fresh.companyId, userId, fresh.cfg);
    }
  }
}

// ── Watcher: mirror new bell notifications as phone pushes ─────
// Durable, multi-instance-safe delivery:
//   • The cursor {ts, ids-processed-at-ts} is PERSISTED in admin_settings
//     (key `push_watch_state`) and only advanced AFTER each row's send is
//     attempted — a crash/redeploy re-sends at most the in-flight rows
//     (at-least-once) instead of dropping them.
//   • Queries use created_at >= ts + an id exclusion list, so many rows
//     sharing one timestamp (e.g. a broadcast) can never be skipped.
//   • A 90-second lease claimed by compare-and-swap makes sure only one
//     server instance delivers at a time (autoscale-safe).
const WATCH_KEY = "push_watch_state";
const INSTANCE = crypto.randomBytes(8).toString("hex");
let watching = false;

type WatchState = { ts: string; ids: string[]; lease?: string; holder?: string };

async function watchPass() {
  if (watching) return; // never overlap passes within this process
  watching = true;
  try {
    if (!SERVICE_KEY) return;
    // Load (or initialize) the durable state row
    const rows0 = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${WATCH_KEY}&select=value`);
    let rawStored: string | null = rows0[0] ? String(rows0[0].value) : null;
    let state: WatchState;
    try { state = rawStored ? JSON.parse(rawStored) : { ts: new Date().toISOString(), ids: [] }; }
    catch { state = { ts: new Date().toISOString(), ids: [] }; }
    if (!rawStored) {
      await dbUpsertSetting(EDEN_ORG_ID, WATCH_KEY, JSON.stringify(state));
      return; // start delivering from next pass
    }
    // Lease: skip if another live instance holds it
    if (state.lease && state.holder !== INSTANCE && Date.now() - new Date(state.lease).getTime() < 90_000) return;
    const claimed: WatchState = { ...state, lease: new Date().toISOString(), holder: INSTANCE };
    const cas = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${WATCH_KEY}&value=eq.${encodeURIComponent(rawStored)}`,
      { method: "PATCH", headers: { ...SH, Prefer: "return=representation" }, body: JSON.stringify({ value: JSON.stringify(claimed) }) },
    );
    const casRows = (cas.ok ? await cas.json().catch(() => []) : []) as any[];
    if (!Array.isArray(casRows) || !casRows.length) return; // lost the claim
    state = claimed;

    const fetched = await dbGet<any>(
      `notifications?created_at=gte.${encodeURIComponent(state.ts)}&select=id,recipient_id,type,body,sender_name,created_at&order=created_at.asc,id.asc&limit=200`,
    );
    const done = new Set(state.ids || []);
    const pending = fetched.filter((n) => !done.has(n.id));
    for (const n of pending) {
      if (n.recipient_id) {
        const title = TYPE_LABELS[n.type] || "🔔 Notification";
        const body = n.sender_name && !String(n.body || "").includes(n.sender_name)
          ? `${n.sender_name}: ${n.body || ""}` : (n.body || "");
        await pushToUser(n.recipient_id, title, body).catch(() => {});
      }
      // Advance the durable cursor after EVERY row: ts = this row's stamp,
      // ids = all processed rows sharing that stamp.
      if (n.created_at !== state.ts) { state.ts = n.created_at; state.ids = []; }
      if (!state.ids.includes(n.id)) state.ids.push(n.id);
    }
    state.lease = undefined; state.holder = undefined;
    await dbUpsertSetting(EDEN_ORG_ID, WATCH_KEY, JSON.stringify(state));
  } catch (e) {
    logger.warn({ err: String(e) }, "[Push] watcher pass failed");
  } finally {
    watching = false;
  }
}

export function startPushWatcher() {
  getVapid().catch(() => {}); // warm up / generate keys on boot
  setInterval(watchPass, 20_000);
}

// ── Routes ─────────────────────────────────────────────────────
const router: IRouter = Router();

// Public VAPID key — needed by the browser to subscribe. Auth'd users only.
router.get("/push/public-key", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const v = await getVapid();
    if (!v) { res.status(500).json({ error: "Push is not available right now" }); return; }
    res.json({ ok: true, publicKey: v.publicKey });
  } catch { res.status(500).json({ error: "Push is not available right now" }); }
});

// Current status for the caller: enabled flag + device count.
router.get("/push/prefs", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const found = await getUserPush(caller.id);
    res.json({ ok: true, enabled: !!found?.cfg.enabled, devices: found?.cfg.subs?.length || 0 });
  } catch { res.status(500).json({ error: "Could not load settings" }); }
});

// Register this device + turn pushes on.
router.post("/push/subscribe", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      res.status(400).json({ error: "Bad subscription" }); return;
    }
    if (!isTrustedPushEndpoint(sub.endpoint) ||
        String(sub.keys.p256dh).length > 256 || String(sub.keys.auth).length > 128) {
      res.status(400).json({ error: "Unrecognized push service" }); return;
    }
    const found = await getUserPush(caller.id);
    const cfg: UserPush = found?.cfg || { enabled: true, subs: [] };
    cfg.enabled = true;
    cfg.subs = (cfg.subs || []).filter((s) => s.endpoint !== sub.endpoint);
    cfg.subs.push({ endpoint: sub.endpoint, keys: sub.keys, ua: String(req.get("user-agent") || "").slice(0, 120), added: new Date().toISOString() });
    if (cfg.subs.length > 10) cfg.subs = cfg.subs.slice(-10); // sanity cap per user
    if (!(await saveUserPush(caller.company_id, caller.id, cfg))) {
      res.status(502).json({ error: "Could not save" }); return;
    }
    res.json({ ok: true, devices: cfg.subs.length });
  } catch { res.status(500).json({ error: "Could not subscribe" }); }
});

// Toggle pushes on/off for ALL of the caller's devices at once.
router.post("/push/prefs", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const enabled = !!req.body?.enabled;
    const found = await getUserPush(caller.id);
    const cfg: UserPush = found?.cfg || { enabled, subs: [] };
    cfg.enabled = enabled;
    if (!(await saveUserPush(caller.company_id, caller.id, cfg))) {
      res.status(502).json({ error: "Could not save" }); return;
    }
    res.json({ ok: true, enabled, devices: cfg.subs?.length || 0 });
  } catch { res.status(500).json({ error: "Could not save" }); }
});

// Remove this device's subscription (e.g. before logout on a shared device).
router.post("/push/unsubscribe", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const endpoint = String(req.body?.endpoint || "");
    const found = await getUserPush(caller.id);
    if (!found) { res.json({ ok: true, devices: 0 }); return; }
    const cfg = found.cfg;
    cfg.subs = (cfg.subs || []).filter((s) => endpoint && s.endpoint !== endpoint);
    await saveUserPush(found.companyId, caller.id, cfg);
    res.json({ ok: true, devices: cfg.subs.length });
  } catch { res.status(500).json({ error: "Could not unsubscribe" }); }
});

export default router;
