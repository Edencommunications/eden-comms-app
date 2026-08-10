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
//     server-side so OFF silences every device at once. Per-category
//     switches (Messages, Plan updates, …) live in the same JSON.
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
export async function requireUser(req: Request): Promise<Profile | null> {
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
// `cats` = per-category opt-outs. Missing key ⇒ ON (default everything buzzes).
type QuietHours = { on: boolean; start: string; end: string; tz?: string };
type UserPush = {
  enabled: boolean;
  subs: Array<{ endpoint: string; keys: any; ua?: string; added?: string }>;
  cats?: Record<string, boolean>;
  quiet?: QuietHours;
};

// ── Quiet hours ────────────────────────────────────────────────
// Optional nightly window (e.g. 22:00–07:00) during which NO phone push is
// sent — bell notifications still land in-app, so nothing is lost. Times are
// interpreted in the user's own timezone (IANA name captured when they save).
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
function isValidTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}
function minutesNowIn(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return (h % 24) * 60 + m;
}
export function inQuietHours(q: QuietHours | undefined, now?: number): boolean {
  if (!q?.on || !HHMM.test(q.start || "") || !HHMM.test(q.end || "")) return false;
  const tz = q.tz && isValidTz(q.tz) ? q.tz : "UTC";
  const cur = typeof now === "number" ? now : minutesNowIn(tz);
  const [sh, sm] = q.start.split(":").map(Number);
  const [eh, em] = q.end.split(":").map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  if (s === e) return false; // zero-length window = off
  // Window may wrap midnight (22:00–07:00): inside if after start OR before end.
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}
function sanitizeQuiet(raw: any): QuietHours | null {
  if (!raw || typeof raw !== "object") return null;
  const on = raw.on === true;
  const start = HHMM.test(String(raw.start || "")) ? String(raw.start) : "22:00";
  const end = HHMM.test(String(raw.end || "")) ? String(raw.end) : "07:00";
  const tzRaw = String(raw.tz || "").slice(0, 64);
  const tz = tzRaw && isValidTz(tzRaw) ? tzRaw : undefined;
  return { on, start, end, ...(tz ? { tz } : {}) };
}
function quietOut(q?: QuietHours): QuietHours {
  return { on: !!q?.on, start: q?.start || "22:00", end: q?.end || "07:00", ...(q?.tz ? { tz: q.tz } : {}) };
}

// ── Notification categories (per-type phone-push preferences) ──
export const PUSH_CATEGORIES = [
  { id: "messages", label: "Messages" },
  { id: "plan_updates", label: "Plan updates" },
  { id: "checkins", label: "Check-ins" },
  { id: "reminders", label: "Reminders" },
  { id: "ads_recaps", label: "Ads recaps" },
] as const;
const CATEGORY_IDS = new Set(PUSH_CATEGORIES.map((c) => c.id as string));

// Every notification type that lands in the `notifications` table must be
// owned by exactly one category (or listed in ALWAYS_DELIVER below).
export const TYPE_CATEGORY: Record<string, string> = {
  message: "messages", mention: "messages", broadcast: "messages",
  community_post: "messages", community_message: "messages", team_message: "messages",
  community: "messages", community_added: "messages", reaction: "messages",
  diet_update: "plan_updates", supp_update: "plan_updates", workout_update: "plan_updates",
  update_note: "plan_updates", loom_posted: "plan_updates", course_access: "plan_updates",
  checkin_received: "checkins", lab_uploaded: "checkins",
  start_reminder_7: "reminders", start_reminder_1: "reminders", start_reminder_0: "reminders",
  ghl_intake: "reminders",
  meta_ads: "ads_recaps",
};
// Product decision: live-call rings behave like incoming phone calls and are
// controlled only by the master phone-notifications switch, not a category.
const ALWAYS_DELIVER = new Set(["huddle_invite", "huddle_ping"]);
// Product decision: an UNKNOWN/new type must never bypass the switches — it is
// governed by the "Messages" switch (the most-visible one) until a developer
// maps it above. A warn log makes the missing mapping visible.
const UNKNOWN_TYPE_CATEGORY = "messages";

export function categoryAllowed(cfg: UserPush, type: string): boolean {
  if (ALWAYS_DELIVER.has(type)) return true;
  let cat = TYPE_CATEGORY[type];
  if (!cat) {
    logger.warn({ type }, "[Push] unmapped notification type — governed by the Messages switch; add it to TYPE_CATEGORY");
    cat = UNKNOWN_TYPE_CATEGORY;
  }
  return cfg.cats?.[cat] !== false; // missing key ⇒ on
}

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
  community_post: "💬 New community post", community: "👥 Community update", mention: "🏷️ You were tagged",
  start_reminder_7: "🚀 Program starts soon", start_reminder_1: "⏰ Starts tomorrow", start_reminder_0: "🎉 Starts today",
};

// ── Privacy: phone buzzes never include message/plan content ──
// Only the KIND of alert (and safe names like a community or sender) shows on
// the lock screen. Full details stay inside the app's bell.
const SAFE_BODY: Record<string, string> = {
  message: "You have a new message — open the app to read it",
  diet_update: "Your diet plan was updated",
  supp_update: "Your supplement plan was updated",
  workout_update: "Your workout was updated",
  checkin_received: "A check-in was submitted",
  lab_uploaded: "A lab result was uploaded",
  update_note: "Your coach posted an update",
  loom_posted: "Your coach posted a video update",
  meta_ads: "A new ads recap was posted",
};
// Types whose bodies are safe topic lines (who/where — never message content)
// vs. types whose bodies may quote a message and need a sanitized stand-in.
const SAFE_SENDER_BODY: Record<string, (name: string) => string> = {
  mention: (n) => `${n} tagged you — open the app to see where`,
};
// Community alerts are safe to pass through — their bodies only name the
// community (never message content), built server-side.
const PASSTHROUGH_TYPES = new Set(["community_post", "community_added", "community"]);
// Where a tap should land inside the app (tab key, applied after login too)
const TYPE_GOTO: Record<string, string> = {
  message: "msgs", diet_update: "diet", supp_update: "diet", workout_update: "workout",
  checkin_received: "checkin", lab_uploaded: "labs", community_post: "community",
  community_added: "community", community: "community", meta_ads: "community", mention: "team",
};

// Injectable sender so tests can capture deliveries instead of hitting
// real push services (FCM/APNs). Production always uses webpush directly.
type SendFn = (sub: { endpoint: string; keys: any }, payload: string, opts: { TTL: number }) => Promise<unknown>;
let sendFn: SendFn = (sub, payload, opts) => webpush.sendNotification(sub, payload, opts);
export function __setSendForTests(fn: SendFn | null) { sendFn = fn || ((sub, payload, opts) => webpush.sendNotification(sub, payload, opts)); }

export async function pushToUser(userId: string, title: string, body: string, type = "", url = "/"): Promise<void> {
  const found = await getUserPush(userId);
  if (!found || !found.cfg.enabled || !found.cfg.subs?.length) return;
  // Quiet hours: no phone buzzes inside the window — bell notifications
  // still appear in-app, and no push is queued for later (by design).
  if (inQuietHours(found.cfg.quiet)) return;
  if (!categoryAllowed(found.cfg, type)) return;
  if (!(await getVapid())) return;
  const alive: typeof found.cfg.subs = [];
  let changed = false;
  for (const sub of found.cfg.subs) {
    try {
      await sendFn(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify({ title, body: body.slice(0, 180), url }),
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
        // Never push actual content to the lock screen — type + safe names only
        let body: string;
        if (PASSTHROUGH_TYPES.has(n.type)) {
          body = n.body || "New community activity";
        } else if (n.type === "message" && n.sender_name) {
          body = `${n.sender_name} sent you a message`;
        } else {
          body = SAFE_BODY[n.type] || "Open the app to view";
        }
        const url = TYPE_GOTO[n.type] ? `/?goto=${TYPE_GOTO[n.type]}` : "/";
        await pushToUser(n.recipient_id, title, body, String(n.type || ""), url).catch(() => {});
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

// Current status for the caller: enabled flag + device count + category switches.
router.get("/push/prefs", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const found = await getUserPush(caller.id);
    const cats: Record<string, boolean> = {};
    for (const c of PUSH_CATEGORIES) cats[c.id] = found?.cfg.cats?.[c.id] !== false;
    res.json({
      ok: true, enabled: !!found?.cfg.enabled, devices: found?.cfg.subs?.length || 0,
      cats, categories: PUSH_CATEGORIES, quiet: quietOut(found?.cfg.quiet),
    });
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
    const cats: Record<string, boolean> = {};
    for (const c of PUSH_CATEGORIES) cats[c.id] = cfg.cats?.[c.id] !== false;
    res.json({ ok: true, devices: cfg.subs.length, cats, categories: PUSH_CATEGORIES, quiet: quietOut(cfg.quiet) });
  } catch { res.status(500).json({ error: "Could not subscribe" }); }
});

// Toggle pushes on/off (all devices) and/or update per-category switches.
router.post("/push/prefs", async (req: Request, res: Response) => {
  try {
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const found = await getUserPush(caller.id);
    const cfg: UserPush = found?.cfg || { enabled: false, subs: [] };
    if (typeof req.body?.enabled === "boolean") cfg.enabled = req.body.enabled;
    // Per-category switches: accept only known category ids, booleans only.
    if (req.body?.cats && typeof req.body.cats === "object") {
      const cats: Record<string, boolean> = { ...(cfg.cats || {}) };
      for (const [k, v] of Object.entries(req.body.cats)) {
        if (CATEGORY_IDS.has(k) && typeof v === "boolean") cats[k] = v;
      }
      cfg.cats = cats;
    }
    // Quiet hours: {on, start:"HH:MM", end:"HH:MM", tz:"IANA/Zone"} — validated,
    // invalid times fall back to sensible defaults, invalid tz is dropped (UTC).
    if (req.body?.quiet !== undefined) {
      const q = sanitizeQuiet(req.body.quiet);
      if (q) cfg.quiet = q;
    }
    if (!(await saveUserPush(caller.company_id, caller.id, cfg))) {
      res.status(502).json({ error: "Could not save" }); return;
    }
    const cats: Record<string, boolean> = {};
    for (const c of PUSH_CATEGORIES) cats[c.id] = cfg.cats?.[c.id] !== false;
    res.json({ ok: true, enabled: !!cfg.enabled, devices: cfg.subs?.length || 0, cats, quiet: quietOut(cfg.quiet) });
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
