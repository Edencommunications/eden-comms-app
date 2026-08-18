// contentScheduler.ts — Social content auto-posting + analytics (Phase 1: Instagram/Facebook).
//
// EDEN-ONLY for now (may open to Tier-3 orgs / DBAs later). A super admin
// connects a Meta token (with page + IG publish permissions), uploads media,
// and schedules posts. A scheduler (started from index.ts):
//   1. publishes due posts to IG and/or the FB Page via the Graph API,
//   2. pulls per-post analytics ~24h after publish (views, reach, likes,
//      comments, shares, saves, and for Reels avg/total watch time —
//      the closest thing IG's API exposes to a "skip rate"),
//   3. every week posts a recap of the previous week's posts into a chosen
//      community, exactly like the Meta Ads recaps and GHL KPI reports do.
//
// Zero-DDL storage in admin_settings:
//   key 'content_sched'        — org config (encrypted page token, IG user id,
//                                FB page id, report community + cadence markers)
//   key 'content_post:<id>'    — one row per scheduled/published post
// All state changes on shared rows go through exact-value CAS so two server
// instances can never double-post.
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { logger } from "../lib/logger";
import { notifyCommunityMembers } from "./communityPost";
import { requireStaff } from "./checkinForm";
import {
  signState, verifyState, AmbiguousPublishError,
  ttAuthorizeUrl, ttExchangeCode, ttRefreshToken, ttCreatorInfo, ttPublishVideo, ttPublishPhotos, ttVideoStats,
  ytAuthorizeUrl, ytExchangeCode, ytRefreshToken, ytChannelInfo, ytUploadVideo, ytVideoStats,
} from "../lib/socialPlatforms";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GRAPH = "https://graph.facebook.com/v21.0";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
// TikTok developer-app credentials may be supplied as server env secrets so
// the admin never has to paste them manually. Admin_settings values take
// precedence (allowing per-instance overrides), but env vars are used as a
// transparent fallback at every call site.
const TT_ENV_KEY = process.env.TIKTOK_CLIENT_KEY || "";
const TT_ENV_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
const BUCKET = "content-media";
const MAX_BYTES = 18 * 1024 * 1024; // express json limit is 25mb; base64 of 18MB ≈ 24MB
const DEFAULT_TZ = "America/Chicago";

const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function dbGet<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}
async function dbInsert(table: string, body: any): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers: { ...SH, Prefer: "return=minimal" }, body: JSON.stringify(body),
  });
  return r.ok;
}
async function upsertSetting(companyId: string, key: string, value: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST", headers: { ...SH, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, key, value }),
  });
  return r.ok;
}
async function deleteSetting(companyId: string, key: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.${encodeURIComponent(key)}`,
    { method: "DELETE", headers: SH },
  );
  return r.ok;
}
// Exact-value CAS on an admin_settings row: only wins if the stored value is
// still exactly what we read. Losing means another instance got there first.
async function casSetting(companyId: string, key: string, expectedRaw: string, newRaw: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.${encodeURIComponent(key)}&value=eq.${encodeURIComponent(expectedRaw)}`,
    { method: "PATCH", headers: { ...SH, Prefer: "return=representation" }, body: JSON.stringify({ value: newRaw }) },
  );
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

// ── Token encryption (same pattern as metaAds.ts, separate key) ──
const ENC_KEY = crypto.createHash("sha256").update(`content-sched-token:${process.env.SESSION_SECRET || ""}`).digest();
function encToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `enc1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}
function decToken(stored: string): string {
  try {
    if (!stored?.startsWith("enc1:")) return "";
    const [, ivB64, tagB64, ctB64] = stored.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivB64, "base64"));
    d.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([d.update(Buffer.from(ctB64, "base64")), d.final()]).toString("utf8");
  } catch { return ""; }
}

// ── Config ──────────────────────────────────────────────────────
type SchedCfg = {
  page_token?: string;         // plaintext in memory only
  page_token_enc?: string;
  page_id?: string;
  page_name?: string;
  ig_user_id?: string;
  ig_username?: string;
  community_id?: string | null;
  community_name?: string | null;
  weekly_enabled?: boolean;
  weekly_day?: number;         // 0=Sun … 6=Sat (default 1 = Monday)
  hour_local?: number;         // default 8
  tz?: string;
  last_weekly?: string;        // ISO date of the Monday-week marker already posted
  connected_by_name?: string;
  // TikTok (per-app OAuth; plaintext fields live in memory only)
  tt_client_key?: string;
  tt_client_secret?: string;   tt_client_secret_enc?: string;
  tt_access?: string;          tt_access_enc?: string;
  tt_refresh?: string;         tt_refresh_enc?: string;
  tt_expires_at?: string;      // ISO — access token expiry
  tt_open_id?: string;
  tt_username?: string;
  // YouTube (Google OAuth)
  yt_client_id?: string;
  yt_client_secret?: string;   yt_client_secret_enc?: string;
  yt_access?: string;          yt_access_enc?: string;
  yt_refresh?: string;         yt_refresh_enc?: string;
  yt_expires_at?: string;
  yt_channel_id?: string;
  yt_channel_title?: string;
  // TikTok photo posts (PULL_FROM_URL): images relay through our own domain,
  // which the admin verifies as a URL property in the TikTok app.
  public_base?: string;        // https://<host> captured when saving app creds
  tt_verify_name?: string;     // TikTok verification file name (e.g. tiktokABC.txt)
  tt_verify_content?: string;  // its exact contents
};
const CFG_KEY = "content_sched";

// Every secret config field is AES-encrypted at rest (admin_settings is
// org-readable under RLS). Plaintext lives only in parsed in-memory copies.
const SECRET_FIELDS = ["page_token", "tt_client_secret", "tt_access", "tt_refresh", "yt_client_secret", "yt_access", "yt_refresh"] as const;

function serializeCfg(cfg: SchedCfg): string {
  const rest: any = { ...cfg };
  for (const f of SECRET_FIELDS) {
    if (rest[f]) rest[`${f}_enc`] = encToken(String(rest[f]));
    delete rest[f];
  }
  return JSON.stringify(rest);
}
function parseCfg(raw: string): SchedCfg | null {
  try {
    const cfg = JSON.parse(raw) as any;
    for (const f of SECRET_FIELDS) {
      if (cfg[`${f}_enc`]) cfg[f] = decToken(String(cfg[`${f}_enc`]));
    }
    return cfg as SchedCfg;
  } catch { return null; }
}
async function loadCfgRaw(): Promise<{ raw: string; cfg: SchedCfg } | null> {
  const rows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${CFG_KEY}&select=value&limit=1`);
  if (!rows[0]?.value) return null;
  const cfg = parseCfg(String(rows[0].value));
  return cfg ? { raw: String(rows[0].value), cfg } : null;
}

// ── Media-kind checks (exported for tests) ─────────────────────
// Uploads are prefixed i-/v- by verified content type; legacy files have no
// prefix and are treated as matching (they predate carousels/covers anyway).
export const OUR_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
export const isOurs = (u: string) => u.startsWith(OUR_PREFIX);
export const isImage = (u: string) => isOurs(u) && !u.slice(OUR_PREFIX.length).startsWith("v-");
export const isVideo = (u: string) => isOurs(u) && !u.slice(OUR_PREFIX.length).startsWith("i-");

// TikTok fetches photo posts itself (PULL_FROM_URL) and only from a URL
// prefix verified in the developer app. Supabase's domain can't be verified
// by the user, so photos relay through our own /api/content-sched/media/
// path on the app's domain. Exported for tests.
export function ttRelayUrls(cfg: { public_base?: string }, post: { media_type: string; media_url: string; media_urls?: string[] }): string[] {
  const urls = post.media_type === "carousel" ? (post.media_urls || []) : [post.media_url];
  if (!cfg.public_base) return urls; // not configured — TikTok will reject with a clear error
  return urls.map((u) => (u.startsWith(OUR_PREFIX)
    ? `${cfg.public_base}/api/content-sched/media/${encodeURIComponent(u.slice(OUR_PREFIX.length))}`
    : u));
}

// ── Post rows ───────────────────────────────────────────────────
type PostRow = {
  id: string;
  created_at: string;
  client_key?: string;         // frontend idempotency key (dedupes batch retries)
  media_url: string;           // single photo/video URL (first item for carousels)
  media_urls?: string[];       // carousel: 2-10 image URLs in order
  cover_url?: string;          // reel cover photo (IG only; FB auto-generates)
  media_type: "image" | "video" | "carousel";
  caption: string;
  platforms: Array<"ig" | "fb" | "tt" | "yt">;
  scheduled_at: string;        // ISO
  status: "scheduled" | "publishing" | "published" | "failed" | "canceled";
  attempts?: number;
  ig_media_id?: string;
  fb_post_id?: string;
  fb_video_id?: string;
  tt_publish_id?: string;      // TikTok publish handle (always set on success)
  tt_video_id?: string;        // public TikTok video id (once processing done)
  tt_privacy?: string;         // privacy level TikTok actually allowed
  yt_video_id?: string;
  published_at?: string;
  claimed_at?: string;         // when a scheduler instance claimed the publish
  error?: string;
  stats?: any;
  stats_claimed_at?: string;   // stats-pull lease (retry after 30 min if no stats_at)
  stats_at?: string;
  reported_week?: string;      // set once included in a weekly recap
};
const postKey = (id: string) => `content_post:${id}`;

async function loadPosts(): Promise<Array<{ raw: string; post: PostRow }>> {
  const rows = await dbGet<any>(
    `admin_settings?company_id=eq.${EDEN_ORG_ID}&key=like.content_post:*&select=key,value&limit=500`,
  );
  const out: Array<{ raw: string; post: PostRow }> = [];
  for (const r of rows) {
    try { out.push({ raw: String(r.value), post: JSON.parse(String(r.value)) }); } catch { /* skip bad row */ }
  }
  return out;
}
async function savePost(post: PostRow): Promise<boolean> {
  return upsertSetting(EDEN_ORG_ID, postKey(post.id), JSON.stringify(post));
}
async function casPost(expectedRaw: string, post: PostRow): Promise<boolean> {
  return casSetting(EDEN_ORG_ID, postKey(post.id), expectedRaw, JSON.stringify(post));
}

// ── Graph API helpers ───────────────────────────────────────────
async function gGet(path: string, token: string, params: Record<string, string> = {}): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  const r = await fetch(`${GRAPH}/${path}${path.includes("?") ? "&" : "?"}${qs}`);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `Graph GET ${path} failed (${r.status})`);
  return j;
}
async function gPost(path: string, token: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.message || `Graph POST ${path} failed (${r.status})`);
  return j;
}

// ── Publishing ──────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Instagram: create a media container, wait for video processing, publish.
async function publishToInstagram(cfg: SchedCfg, post: PostRow): Promise<string> {
  const token = cfg.page_token || "";
  const igId = cfg.ig_user_id || "";
  if (!token || !igId) throw new Error("Instagram not connected");
  let creationId: string;
  if (post.media_type === "video") {
    const params: Record<string, string> = {
      media_type: "REELS", video_url: post.media_url, caption: post.caption || "", share_to_feed: "true",
    };
    if (post.cover_url) params.cover_url = post.cover_url;
    const c = await gPost(`${igId}/media`, token, params);
    creationId = String(c.id);
    // Reels are processed async — poll status up to ~5 minutes.
    for (let i = 0; i < 30; i++) {
      await sleep(10_000);
      const s = await gGet(`${creationId}`, token, { fields: "status_code" });
      if (s.status_code === "FINISHED") break;
      if (s.status_code === "ERROR") throw new Error("Instagram could not process this video (check format/length)");
      if (i === 29) throw new Error("Instagram video processing timed out");
    }
  } else if (post.media_type === "carousel") {
    // Create one child container per image, then a CAROUSEL parent.
    const children: string[] = [];
    for (const url of post.media_urls || []) {
      const ch = await gPost(`${igId}/media`, token, { image_url: url, is_carousel_item: "true" });
      children.push(String(ch.id));
    }
    if (children.length < 2) throw new Error("A carousel needs at least 2 photos");
    const c = await gPost(`${igId}/media`, token, {
      media_type: "CAROUSEL", children: children.join(","), caption: post.caption || "",
    });
    creationId = String(c.id);
  } else {
    const c = await gPost(`${igId}/media`, token, { image_url: post.media_url, caption: post.caption || "" });
    creationId = String(c.id);
  }
  const pub = await gPost(`${igId}/media_publish`, token, { creation_id: creationId });
  return String(pub.id);
}

// Facebook Page: photos for images, videos (Reels-eligible) for video.
async function publishToFacebook(cfg: SchedCfg, post: PostRow): Promise<{ postId?: string; videoId?: string }> {
  const token = cfg.page_token || "";
  const pageId = cfg.page_id || "";
  if (!token || !pageId) throw new Error("Facebook Page not connected");
  if (post.media_type === "video") {
    const v = await gPost(`${pageId}/videos`, token, { file_url: post.media_url, description: post.caption || "" });
    return { videoId: String(v.id) };
  }
  if (post.media_type === "carousel") {
    // Upload each photo unpublished, then attach them all to one feed post.
    const ids: string[] = [];
    for (const url of post.media_urls || []) {
      const ph = await gPost(`${pageId}/photos`, token, { url, published: "false" });
      ids.push(String(ph.id));
    }
    if (ids.length < 2) throw new Error("A carousel needs at least 2 photos");
    const params: Record<string, string> = { message: post.caption || "" };
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const p = await gPost(`${pageId}/feed`, token, params);
    return { postId: String(p.id) };
  }
  const p = await gPost(`${pageId}/photos`, token, { url: post.media_url, message: post.caption || "" });
  return { postId: String(p.post_id || p.id) };
}

// ── TikTok / YouTube token upkeep ───────────────────────────────
// Access tokens rotate (TikTok ~24h, Google ~1h). Refresh on demand and
// persist the rotated tokens with a bounded CAS-retry merge — never a blind
// upsert, which could resurrect credentials a concurrent disconnect wiped.
// Exported for regression testing; callers outside this module should not
// call it directly — use ensureTtToken / ensureYtToken instead.
export async function persistTokenFields(patch: Partial<SchedCfg>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const loaded = await loadCfgRaw();
    if (!loaded) return; // config deleted (disconnected) — don't recreate it
    const fresh: any = { ...loaded.cfg };
    const p: any = { ...patch };
    // If the platform was disconnected since we read our copy, drop its fields.
    // Detect active connection via the REFRESH TOKEN (not the app credentials),
    // because in an env-var setup tt_client_key is intentionally absent from
    // admin_settings — its absence must never be mis-read as a disconnect.
    // The disconnect endpoint wipes tt_refresh, so its absence is the true signal.
    if (!fresh.tt_refresh) for (const k of Object.keys(p)) if (k.startsWith("tt_")) delete p[k];
    if (!fresh.yt_client_id) for (const k of Object.keys(p)) if (k.startsWith("yt_")) delete p[k];
    if (!Object.keys(p).length) return;
    if (await casSetting(EDEN_ORG_ID, CFG_KEY, loaded.raw, serializeCfg({ ...fresh, ...p }))) return;
  }
  logger.warn("[ContentSched] token persist lost 3 CAS rounds — will refresh again next pass");
}
async function ensureTtToken(cfg: SchedCfg): Promise<string> {
  // Credentials may live in admin_settings (admin pasted them) OR in env secrets
  // (pre-configured by the server operator). Admin_settings take precedence.
  const clientKey = cfg.tt_client_key || TT_ENV_KEY;
  const clientSecret = cfg.tt_client_secret || TT_ENV_SECRET;
  if (!cfg.tt_refresh || !clientKey || !clientSecret) throw new Error("TikTok not connected");
  const exp = cfg.tt_expires_at ? new Date(cfg.tt_expires_at).getTime() : 0;
  if (cfg.tt_access && exp - Date.now() > 10 * 60 * 1000) return cfg.tt_access;
  const t = await ttRefreshToken(clientKey, clientSecret, cfg.tt_refresh);
  cfg.tt_access = t.access_token;
  if (t.refresh_token) cfg.tt_refresh = t.refresh_token; // TikTok rotates refresh tokens
  cfg.tt_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await persistTokenFields({ tt_access: cfg.tt_access, tt_refresh: cfg.tt_refresh, tt_expires_at: cfg.tt_expires_at });
  return cfg.tt_access;
}
async function ensureYtToken(cfg: SchedCfg): Promise<string> {
  if (!cfg.yt_refresh || !cfg.yt_client_id || !cfg.yt_client_secret) throw new Error("YouTube not connected");
  const exp = cfg.yt_expires_at ? new Date(cfg.yt_expires_at).getTime() : 0;
  if (cfg.yt_access && exp - Date.now() > 5 * 60 * 1000) return cfg.yt_access;
  const t = await ytRefreshToken(cfg.yt_client_id, cfg.yt_client_secret, cfg.yt_refresh);
  cfg.yt_access = t.access_token;
  cfg.yt_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await persistTokenFields({ yt_access: cfg.yt_access, yt_expires_at: cfg.yt_expires_at });
  return cfg.yt_access;
}

// ── Analytics (~24h after publish) ─────────────────────────────
async function pullIgStats(cfg: SchedCfg, post: PostRow): Promise<any> {
  const token = cfg.page_token || "";
  const id = post.ig_media_id || "";
  if (!token || !id) return null;
  const out: any = {};
  try {
    const basic = await gGet(id, token, { fields: "like_count,comments_count,permalink" });
    out.likes = basic.like_count ?? 0;
    out.comments = basic.comments_count ?? 0;
    out.permalink = basic.permalink || "";
  } catch (e) { out.basic_error = String((e as Error).message); }
  const metricSets = post.media_type === "video"
    ? ["views,reach,shares,saved,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time", "views,reach,shares,saved"]
    : ["views,reach,shares,saved,total_interactions", "views,reach"];
  for (const metrics of metricSets) {
    try {
      const ins = await gGet(`${id}/insights`, token, { metric: metrics });
      for (const m of ins.data || []) {
        const v = m.values?.[0]?.value;
        if (typeof v === "number") out[m.name] = v;
      }
      break;
    } catch (e) { out.insights_error = String((e as Error).message); }
  }
  // Reels watch metrics come back in milliseconds → seconds, plus a
  // watched-vs-skipped view: avg watch time is IG's closest "skip rate" signal.
  if (typeof out.ig_reels_avg_watch_time === "number") out.avg_watch_sec = Math.round(out.ig_reels_avg_watch_time / 100) / 10;
  if (typeof out.ig_reels_video_view_total_time === "number") out.total_watch_min = Math.round(out.ig_reels_video_view_total_time / 60000);
  return out;
}

async function pullFbStats(cfg: SchedCfg, post: PostRow): Promise<any> {
  const token = cfg.page_token || "";
  const out: any = {};
  try {
    if (post.fb_video_id) {
      const v = await gGet(post.fb_video_id, token, { fields: "views,likes.summary(true),comments.summary(true)" });
      out.views = v.views ?? 0;
      out.likes = v.likes?.summary?.total_count ?? 0;
      out.comments = v.comments?.summary?.total_count ?? 0;
    } else if (post.fb_post_id) {
      const p = await gGet(post.fb_post_id, token, { fields: "shares,likes.summary(true),comments.summary(true)" });
      out.likes = p.likes?.summary?.total_count ?? 0;
      out.comments = p.comments?.summary?.total_count ?? 0;
      out.shares = p.shares?.count ?? 0;
      try {
        const ins = await gGet(`${post.fb_post_id}/insights`, token, { metric: "post_impressions,post_impressions_unique" });
        for (const m of ins.data || []) {
          const v = m.values?.[0]?.value;
          if (m.name === "post_impressions" && typeof v === "number") out.impressions = v;
          if (m.name === "post_impressions_unique" && typeof v === "number") out.reach = v;
        }
      } catch { /* page insights may lag — fine */ }
    }
  } catch (e) { out.error = String((e as Error).message); }
  return out;
}

// ── Weekly recap ────────────────────────────────────────────────
export function localParts(tz: string, d = new Date()): { ymd: string; weekday: number; hour: number } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[String(parts.weekday)] ?? 0,
    hour: Number(parts.hour) % 24,
  };
}

const fmtN = (n: any) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export function buildWeeklyText(posts: PostRow[], weekLabel: string): string {
  const lines: string[] = [`📱 Content Recap — week of ${weekLabel}`, ""];
  if (!posts.length) {
    lines.push("No posts went out this week.");
    return lines.join("\n");
  }
  let igViews = 0, fbViews = 0, ttViews = 0, ytViews = 0;
  for (const p of posts) {
    const when = new Date(p.published_at || p.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const cap = (p.caption || "(no caption)").replace(/\s+/g, " ").slice(0, 60);
    lines.push(`▸ ${when} — ${p.media_type === "video" ? "🎬" : p.media_type === "carousel" ? "🎠" : "🖼"} ${cap}${(p.caption || "").length > 60 ? "…" : ""}`);
    const ig = p.stats?.ig, fb = p.stats?.fb;
    if (ig) {
      igViews += ig.views || 0;
      let l = `   IG: ${fmtN(ig.views)} views · ${fmtN(ig.reach)} reach · ${fmtN(ig.likes)} likes · ${fmtN(ig.comments)} comments · ${fmtN(ig.shares)} shares · ${fmtN(ig.saved)} saves`;
      if (typeof ig.avg_watch_sec === "number") l += ` · avg watch ${ig.avg_watch_sec}s`;
      lines.push(l);
    }
    if (fb) {
      fbViews += fb.views || 0;
      lines.push(`   FB: ${fmtN(fb.views ?? fb.impressions)} ${fb.views != null ? "views" : "impressions"} · ${fmtN(fb.likes)} likes · ${fmtN(fb.comments)} comments${fb.shares != null ? ` · ${fmtN(fb.shares)} shares` : ""}`);
    }
    const tt = p.stats?.tt, yt = p.stats?.yt;
    if (tt && !tt.error && !tt.note) {
      ttViews += tt.views || 0;
      lines.push(`   TikTok: ${fmtN(tt.views)} views · ${fmtN(tt.likes)} likes · ${fmtN(tt.comments)} comments · ${fmtN(tt.shares)} shares`);
    } else if (tt?.note) {
      lines.push(`   TikTok: posted (stats unavailable — post is private until the app is approved)`);
    }
    if (yt && !yt.error) {
      ytViews += yt.views || 0;
      lines.push(`   YouTube: ${fmtN(yt.views)} views · ${fmtN(yt.likes)} likes · ${fmtN(yt.comments)} comments`);
    }
    if (p.status === "failed") lines.push(`   ⚠️ this post FAILED: ${p.error || "unknown error"}`);
    lines.push("");
  }
  const totalBits = [`${fmtN(igViews)} IG views`, `${fmtN(fbViews)} FB views`];
  if (ttViews) totalBits.push(`${fmtN(ttViews)} TikTok views`);
  if (ytViews) totalBits.push(`${fmtN(ytViews)} YouTube views`);
  lines.push(`Totals: ${totalBits.join(" · ")} across ${posts.length} post${posts.length === 1 ? "" : "s"}.`);
  lines.push("Numbers are captured ~24h after each post; platforms keep counting after that.");
  return lines.join("\n");
}

async function postWeeklyRecap(cfg: SchedCfg, posts: PostRow[], weekLabel: string): Promise<boolean> {
  if (!cfg.community_id) return false;
  const comm = await dbGet<any>(`communities?id=eq.${encodeURIComponent(cfg.community_id)}&company_id=eq.${EDEN_ORG_ID}&select=id,name&limit=1`);
  if (!comm[0]) { logger.warn("[ContentSched] weekly recap community missing"); return false; }
  const ok = await dbInsert("community_messages", {
    community_id: cfg.community_id,
    sender_id: null,
    sender_name: "📱 Content Recap",
    sender_role: "super_admin",
    content: buildWeeklyText(posts, weekLabel),
  });
  if (ok) await notifyCommunityMembers(cfg.community_id, comm[0].name || cfg.community_name || "Content", null);
  return ok;
}

// Bell-notify Eden super admins when a post fails so it never dies silently.
async function notifyAdminsOfFailure(post: PostRow): Promise<void> {
  try {
    const admins = await dbGet<any>(`user_profiles?company_id=eq.${EDEN_ORG_ID}&role=eq.super_admin&is_active=not.is.false&select=id&limit=20`);
    const rows = admins.map((a: any) => ({
      recipient_id: a.id, sender_id: null, type: "content_sched",
      body: `⚠️ Scheduled post failed to publish: ${(post.caption || post.media_url).slice(0, 60)} — ${String(post.error || "").slice(0, 100)}`,
      is_read: false, link_to: "team",
    }));
    if (rows.length) await dbInsert("notifications", rows);
  } catch (e) { logger.warn({ err: String(e) }, "[ContentSched] admin notify failed"); }
}

// ── Scheduler ───────────────────────────────────────────────────
const health = {
  runs: 0, lastRunAt: 0, lastSuccessAt: 0, lastRunOk: true, lastError: "", published: 0, statsPulled: 0, weeklySent: 0,
};
export function getContentSchedHealth() {
  const configured = health.runs > 0; // refined below in processDue
  const stale = health.lastRunAt > 0 && Date.now() - health.lastRunAt > 60 * 60 * 1000;
  return {
    healthy: (health.lastRunOk || health.runs === 0) && !stale,
    runs: health.runs, lastRunAt: health.lastRunAt ? new Date(health.lastRunAt).toISOString() : null,
    lastRunOk: health.lastRunOk, lastError: health.lastError || null,
    published: health.published, statsPulled: health.statsPulled, weeklySent: health.weeklySent, configured,
  };
}

export async function processDue(now = new Date()): Promise<void> {
  health.runs++; health.lastRunAt = Date.now();
  try {
    const loaded = await loadCfgRaw();
    if (!loaded) { health.lastRunOk = true; health.lastSuccessAt = Date.now(); return; }
    const { cfg } = loaded;
    const posts = await loadPosts();

    // 0) Recover posts stuck in "publishing" (crash/redeploy mid-publish).
    //    We can't know whether the Graph call landed, so NEVER auto-retry —
    //    mark failed and tell the admins to check IG/FB before rescheduling.
    for (const { raw, post } of posts) {
      if (post.status !== "publishing") continue;
      const age = now.getTime() - new Date(post.claimed_at || post.scheduled_at).getTime();
      if (age < 30 * 60 * 1000) continue; // still plausibly in-flight
      const recovered: PostRow = {
        ...post, status: "failed",
        error: "Publishing was interrupted (server restart). It MAY have partially posted — check IG/FB before rescheduling.",
      };
      if (await casPost(raw, recovered)) await notifyAdminsOfFailure(recovered);
    }

    // 1) Publish due posts (CAS-claimed so only one instance wins).
    for (const { raw, post } of posts) {
      if (post.status !== "scheduled") continue;
      if (new Date(post.scheduled_at).getTime() > now.getTime()) continue;
      if ((post.attempts || 0) >= 3) continue;
      const claimed: PostRow = { ...post, status: "publishing", attempts: (post.attempts || 0) + 1, claimed_at: new Date().toISOString() };
      if (!(await casPost(raw, claimed))) continue; // another instance took it
      const claimedRaw = JSON.stringify(claimed);
      try {
        if (claimed.platforms.includes("ig")) claimed.ig_media_id = await publishToInstagram(cfg, claimed);
        if (claimed.platforms.includes("fb")) {
          const fb = await publishToFacebook(cfg, claimed);
          claimed.fb_post_id = fb.postId; claimed.fb_video_id = fb.videoId;
        }
        if (claimed.platforms.includes("tt")) {
          const token = await ensureTtToken(cfg);
          const tt = claimed.media_type === "video"
            ? await ttPublishVideo(token, claimed.media_url, claimed.caption || "")
            : await ttPublishPhotos(token, ttRelayUrls(cfg, claimed), claimed.caption || "");
          claimed.tt_publish_id = tt.publishId; claimed.tt_video_id = tt.videoId; claimed.tt_privacy = tt.privacy;
        }
        if (claimed.platforms.includes("yt")) {
          const token = await ensureYtToken(cfg);
          claimed.yt_video_id = await ytUploadVideo(token, claimed.media_url, claimed.caption || "");
        }
        claimed.status = "published"; claimed.published_at = new Date().toISOString(); claimed.error = "";
        health.published++;
      } catch (e) {
        claimed.error = String((e as Error).message).slice(0, 300);
        const ambiguous = e instanceof AmbiguousPublishError;
        if (ambiguous && (e as AmbiguousPublishError).publishId) claimed.tt_publish_id = (e as AmbiguousPublishError).publishId;
        // Partial success (IG went out, FB failed) still counts as published —
        // retrying would double-post the side that succeeded. An AMBIGUOUS
        // outcome (upload may have landed on TikTok/YouTube) is terminal
        // failed and never auto-retried, for the same reason.
        claimed.status = claimed.ig_media_id || claimed.fb_post_id || claimed.fb_video_id || claimed.yt_video_id
          ? "published"
          : ambiguous ? "failed"
          : (claimed.attempts! >= 3 ? "failed" : "scheduled");
        if (ambiguous) claimed.error = `${claimed.error} — it MAY have posted; check the platform before rescheduling.`.slice(0, 300);
        if (claimed.status === "published") claimed.published_at = new Date().toISOString();
        if (claimed.status === "failed" || claimed.status === "published") await notifyAdminsOfFailure(claimed);
        logger.warn({ err: claimed.error, id: claimed.id }, "[ContentSched] publish attempt failed");
      }
      // Terminal write is CAS from the claimed value. If it loses, only
      // overwrite when the row still exists (e.g. stale-claim recovery marked
      // it failed — our real outcome wins); never recreate a deleted post.
      if (!(await casPost(claimedRaw, claimed))) {
        const still = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${postKey(claimed.id)}&select=key&limit=1`);
        if (still[0]) await savePost(claimed);
        else logger.warn({ id: claimed.id }, "[ContentSched] post row deleted mid-publish — result dropped");
      }
    }

    // 2) Pull stats for posts published ≥24h ago that don't have them yet.
    //    Claim with stats_claimed_at (lease), write stats_at only AFTER a
    //    successful pull — a crash mid-pull just means a retry in 30 min.
    const fresh = await loadPosts();
    for (const { raw, post } of fresh) {
      if (post.status !== "published" || post.stats_at || !post.published_at) continue;
      if (now.getTime() - new Date(post.published_at).getTime() < 24 * 60 * 60 * 1000) continue;
      if (post.stats_claimed_at && now.getTime() - new Date(post.stats_claimed_at).getTime() < 30 * 60 * 1000) continue;
      const claimed: PostRow = { ...post, stats_claimed_at: new Date().toISOString() };
      if (!(await casPost(raw, claimed))) continue;
      const stats: any = {};
      if (post.ig_media_id) stats.ig = await pullIgStats(cfg, post);
      if (post.fb_post_id || post.fb_video_id) stats.fb = await pullFbStats(cfg, post);
      if (post.tt_video_id) {
        try { stats.tt = await ttVideoStats(await ensureTtToken(cfg), post.tt_video_id); }
        catch (e) { stats.tt = { error: String((e as Error).message).slice(0, 200) }; }
      } else if (post.tt_publish_id) {
        stats.tt = { note: "posted (video id not returned — private/unaudited posts don't expose stats)" };
      }
      if (post.yt_video_id) {
        try { stats.yt = await ytVideoStats(await ensureYtToken(cfg), post.yt_video_id); }
        catch (e) { stats.yt = { error: String((e as Error).message).slice(0, 200) }; }
      }
      claimed.stats = stats;
      claimed.stats_at = new Date().toISOString();
      await savePost(claimed);
      health.statsPulled++;
    }

    // 3) Weekly recap — on the configured local day/hour, covering the
    //    previous 7 full days. CAS on the config row prevents double-sends.
    if (cfg.weekly_enabled !== false && cfg.community_id) {
      const tz = cfg.tz || DEFAULT_TZ;
      const lp = localParts(tz, now);
      const targetDay = cfg.weekly_day ?? 1;
      const targetHour = cfg.hour_local ?? 8;
      if (lp.weekday === targetDay && lp.hour >= targetHour && cfg.last_weekly !== lp.ymd) {
        const reread = await loadCfgRaw();
        if (reread && reread.cfg.last_weekly !== lp.ymd) {
          const claimedCfg = { ...reread.cfg, last_weekly: lp.ymd };
          const claimedRaw = serializeCfg(claimedCfg);
          if (await casSetting(EDEN_ORG_ID, CFG_KEY, reread.raw, claimedRaw)) {
            // Previous 7 FULL local days: local date in [today-7d .. yesterday].
            const startYmd = localParts(tz, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).ymd;
            const weekPosts = (await loadPosts())
              .map((p) => p.post)
              .filter((p) => {
                if (!((p.status === "published" || p.status === "failed") && p.published_at)) return false;
                const pYmd = localParts(tz, new Date(p.published_at)).ymd;
                return pYmd >= startYmd && pYmd < lp.ymd;
              })
              .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
            const endYmd = localParts(tz, new Date(now.getTime() - 24 * 60 * 60 * 1000)).ymd;
            const ok = await postWeeklyRecap(claimedCfg, weekPosts, `${startYmd} – ${endYmd}`);
            if (ok) health.weeklySent++;
            else {
              // Roll the marker back (best effort) so the recap retries next
              // pass instead of silently skipping the whole week.
              await casSetting(EDEN_ORG_ID, CFG_KEY, claimedRaw, serializeCfg({ ...claimedCfg, last_weekly: reread.cfg.last_weekly }));
              logger.warn("[ContentSched] weekly recap post failed — marker rolled back");
            }
          }
        }
      }
    }

    health.lastRunOk = true; health.lastSuccessAt = Date.now(); health.lastError = "";
  } catch (e) {
    health.lastRunOk = false; health.lastError = String((e as Error).message).slice(0, 300);
    logger.error({ err: health.lastError }, "[ContentSched] pass failed");
  }
}

let started = false;
export function startContentScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => { void processDue(); }, 60_000);
  setInterval(() => { void processDue(); }, 5 * 60 * 1000);
  logger.info("[ContentSched] scheduler started (every 5 min)");
}

// ── Media upload (Supabase Storage, public bucket) ─────────────
let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST", headers: SH, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (r.ok || r.status === 400 || r.status === 409) { bucketReady = true; return; }
  throw new Error("storage bucket unavailable");
}

// ── Routes (Eden super-admin only) ─────────────────────────────
async function requireEdenAdmin(req: Request, res: Response): Promise<{ id: string; role: string } | null> {
  const staff = await requireStaff(req);
  if (!staff || staff.role !== "super_admin" || staff.company_id !== EDEN_ORG_ID) {
    res.status(403).json({ error: "Eden admins only" });
    return null;
  }
  return staff;
}

const router: IRouter = Router();

// Step 1 of connect: paste a user token → list Pages (+ linked IG accounts).
// Step 2: caller picks a page → we store that page's own token (long-lived).
router.post("/content-sched/connect", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const token = String(req.body?.token || "").trim();
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  try {
    const pages = await gGet("me/accounts", token, { fields: "name,access_token,instagram_business_account{id,username}" });
    const list = (pages.data || []).map((p: any) => ({
      page_id: String(p.id), page_name: String(p.name || ""),
      ig_user_id: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : null,
      ig_username: p.instagram_business_account?.username || null,
    }));
    const pageId = String(req.body?.page_id || "").trim();
    if (!pageId) { res.json({ pages: list }); return; } // step 1: pick a page
    const chosen = (pages.data || []).find((p: any) => String(p.id) === pageId);
    if (!chosen) { res.status(400).json({ error: "That page was not in the token's account list" }); return; }
    if (!chosen.instagram_business_account?.id) {
      { res.status(400).json({ error: "That Facebook Page has no linked Instagram business account — link it in Meta Business Suite first" }); return; }
    }
    const prev = await loadCfgRaw();
    const cfg: SchedCfg = {
      ...(prev?.cfg || {}),
      page_token: String(chosen.access_token || token),
      page_id: pageId, page_name: String(chosen.name || ""),
      ig_user_id: String(chosen.instagram_business_account.id),
      ig_username: String(chosen.instagram_business_account.username || ""),
      tz: (prev?.cfg?.tz) || DEFAULT_TZ,
      connected_by_name: String(req.body?.connected_by_name || ""),
    };
    const ok = await upsertSetting(EDEN_ORG_ID, CFG_KEY, serializeCfg(cfg));
    if (!ok) { res.status(502).json({ error: "Could not save connection" }); return; }
    res.json({ ok: true, page_name: cfg.page_name, ig_username: cfg.ig_username });
  } catch (e) {
    res.status(400).json({ error: `Meta rejected that token: ${String((e as Error).message).slice(0, 200)}` });
  }
});

router.get("/content-sched/status", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const loaded = await loadCfgRaw();
  if (!loaded) {
    res.json({
      connected: false,
      tt_app_saved: !!(TT_ENV_KEY && TT_ENV_SECRET),
      tt_app_from_env: !!(TT_ENV_KEY && TT_ENV_SECRET),
    });
    return;
  }
  const safe: any = { ...loaded.cfg };
  for (const f of SECRET_FIELDS) { delete safe[f]; delete safe[`${f}_enc`]; }
  res.json({
    connected: !!(loaded.cfg.page_token && loaded.cfg.ig_user_id),
    tt_connected: !!loaded.cfg.tt_refresh,
    yt_connected: !!loaded.cfg.yt_refresh,
    // tt_app_saved is true if credentials were pasted via the UI OR supplied
    // as server env secrets (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET).
    tt_app_saved: !!(loaded.cfg.tt_client_key && loaded.cfg.tt_client_secret) || !!(TT_ENV_KEY && TT_ENV_SECRET),
    tt_app_from_env: !!(TT_ENV_KEY && TT_ENV_SECRET) && !(loaded.cfg.tt_client_key && loaded.cfg.tt_client_secret),
    yt_app_saved: !!(loaded.cfg.yt_client_id && loaded.cfg.yt_client_secret),
    ...safe,
  });
});

router.post("/content-sched/settings", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const loaded = await loadCfgRaw();
  if (!loaded) { res.status(400).json({ error: "Connect Meta first" }); return; }
  const cfg = { ...loaded.cfg };
  const b = req.body || {};
  if (b.community_id !== undefined) {
    if (b.community_id) {
      const comm = await dbGet<any>(`communities?id=eq.${encodeURIComponent(String(b.community_id))}&company_id=eq.${EDEN_ORG_ID}&select=id,name&limit=1`);
      if (!comm[0]) { res.status(400).json({ error: "That community doesn't exist in Eden" }); return; }
      cfg.community_id = comm[0].id; cfg.community_name = comm[0].name;
    } else { cfg.community_id = null; cfg.community_name = null; }
  }
  if (b.weekly_enabled !== undefined) cfg.weekly_enabled = !!b.weekly_enabled;
  if (b.weekly_day !== undefined && Number(b.weekly_day) >= 0 && Number(b.weekly_day) <= 6) cfg.weekly_day = Number(b.weekly_day);
  if (b.hour_local !== undefined && Number(b.hour_local) >= 0 && Number(b.hour_local) <= 23) cfg.hour_local = Number(b.hour_local);
  const ok = await casSetting(EDEN_ORG_ID, CFG_KEY, loaded.raw, serializeCfg(cfg));
  if (!ok) { res.status(409).json({ error: "Settings changed elsewhere — reload and try again" }); return; }
  res.json({ ok: true });
});

router.post("/content-sched/disconnect", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  await deleteSetting(EDEN_ORG_ID, CFG_KEY);
  res.json({ ok: true });
});

router.post("/content-sched/upload", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const { filename, contentType, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) { res.status(400).json({ error: "filename and dataBase64 required" }); return; }
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
  if (!ALLOWED.includes(String(contentType || ""))) { res.status(400).json({ error: "Only JPG/PNG/WebP photos and MP4/MOV videos are supported" }); return; }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(String(dataBase64))) { res.status(400).json({ error: "Bad file data" }); return; }
  let buf: Buffer;
  try { buf = Buffer.from(String(dataBase64), "base64"); } catch { res.status(400).json({ error: "Bad file data" }); return; }
  if (!buf.length) { res.status(400).json({ error: "Empty file" }); return; }
  if (buf.length > MAX_BYTES) { res.status(413).json({ error: "File too large (18 MB max for now)" }); return; }
  try { await ensureBucket(); } catch { res.status(502).json({ error: "Storage unavailable" }); return; }
  const safe = String(filename).slice(-120).replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  // Kind prefix ('i-'/'v-') bakes the verified content type into the URL so
  // the create-post route can enforce photo-vs-video without extra state.
  const kind = String(contentType).startsWith("video/") ? "v" : "i";
  const path = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": String(contentType || "application/octet-stream") },
    body: buf as any,
  });
  if (!up.ok) { res.status(502).json({ error: "Upload failed — please try again" }); return; }
  res.json({ url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` });
});

router.post("/content-sched/posts", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const b = req.body || {};
  const mediaType = b.media_type === "video" ? "video" : b.media_type === "carousel" ? "carousel" : "image";
  const mediaUrls: string[] = Array.isArray(b.media_urls) ? b.media_urls.map((u: any) => String(u).trim()).filter(Boolean) : [];
  const mediaUrl = String(b.media_url || mediaUrls[0] || "").trim();
  const coverUrl = String(b.cover_url || "").trim();
  const platforms = Array.isArray(b.platforms) ? b.platforms.filter((p: any) => p === "ig" || p === "fb" || p === "tt" || p === "yt") : [];
  // YouTube Shorts is video-only. (TikTok takes photos/carousels too.)
  if (platforms.includes("yt") && mediaType !== "video") {
    res.status(400).json({ error: "YouTube can only receive videos" }); return;
  }
  const scheduledAt = new Date(String(b.scheduled_at || ""));
  if (mediaType === "carousel") {
    if (mediaUrls.length < 2 || mediaUrls.length > 10) { res.status(400).json({ error: "A carousel needs 2-10 photos" }); return; }
    if (!mediaUrls.every(isImage)) { res.status(400).json({ error: "Carousels can only contain uploaded photos" }); return; }
  } else if (mediaType === "video") {
    if (!isVideo(mediaUrl)) { res.status(400).json({ error: "Upload the video first" }); return; }
  } else if (!isImage(mediaUrl)) { res.status(400).json({ error: "Upload the photo first" }); return; }
  if (coverUrl && !isImage(coverUrl)) { res.status(400).json({ error: "The cover must be an uploaded photo" }); return; }
  if (!platforms.length) { res.status(400).json({ error: "Pick at least one platform" }); return; }
  if (isNaN(scheduledAt.getTime())) { res.status(400).json({ error: "Bad scheduled time" }); return; }
  {
    const loaded = await loadCfgRaw();
    if ((platforms.includes("ig") || platforms.includes("fb")) && !loaded?.cfg.page_token) { res.status(400).json({ error: "Connect Instagram/Facebook first" }); return; }
    if (platforms.includes("tt") && !loaded?.cfg.tt_refresh) { res.status(400).json({ error: "Connect TikTok first" }); return; }
    if (platforms.includes("yt") && !loaded?.cfg.yt_refresh) { res.status(400).json({ error: "Connect YouTube first" }); return; }
  }
  // Idempotency: the frontend sends a stable per-draft client_key. If a post
  // with that key already exists (response was lost, user hit retry), return
  // it instead of creating a duplicate.
  const clientKey = String(b.client_key || "").slice(0, 64);
  if (clientKey) {
    const existing = (await loadPosts()).find((p) => p.post.client_key === clientKey);
    if (existing) { res.json({ ok: true, post: existing.post, deduped: true }); return; }
  }
  const post: PostRow = {
    id: crypto.randomUUID(), created_at: new Date().toISOString(),
    ...(clientKey ? { client_key: clientKey } : {}),
    media_url: mediaUrl, media_type: mediaType, caption: String(b.caption || "").slice(0, 2200),
    ...(mediaType === "carousel" ? { media_urls: mediaUrls } : {}),
    ...(mediaType === "video" && coverUrl ? { cover_url: coverUrl } : {}),
    platforms, scheduled_at: scheduledAt.toISOString(), status: "scheduled", attempts: 0,
  };
  const ok = await savePost(post);
  if (!ok) { res.status(502).json({ error: "Could not save post" }); return; }
  res.json({ ok: true, post });
});

router.get("/content-sched/posts", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const posts = (await loadPosts()).map((p) => p.post)
    .sort((a, b) => String(b.scheduled_at).localeCompare(String(a.scheduled_at)));
  res.json({ posts });
});

router.post("/content-sched/posts/:id/cancel", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const id = String(req.params.id || "");
  const rows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${encodeURIComponent(postKey(id))}&select=value&limit=1`);
  if (!rows[0]) { res.status(404).json({ error: "Post not found" }); return; }
  const post: PostRow = JSON.parse(String(rows[0].value));
  if (post.status !== "scheduled" && post.status !== "failed") { res.status(400).json({ error: `Can't cancel a ${post.status} post` }); return; }
  const ok = await casPost(String(rows[0].value), { ...post, status: "canceled" });
  if (!ok) { res.status(409).json({ error: "Post changed — reload and try again" }); return; }
  res.json({ ok: true });
});

router.delete("/content-sched/posts/:id", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const id = String(req.params.id || "");
  const rows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${encodeURIComponent(postKey(id))}&select=value&limit=1`);
  if (!rows[0]) { res.status(404).json({ error: "Post not found" }); return; }
  const post: PostRow = JSON.parse(String(rows[0].value));
  if (post.status === "publishing") { res.status(400).json({ error: "Post is publishing right now" }); return; }
  await deleteSetting(EDEN_ORG_ID, postKey(id));
  res.json({ ok: true });
});

// ── Public media relay (for TikTok PULL_FROM_URL photo posts) ──
// Unauthenticated by design: TikTok's servers fetch these. Serves only
// image objects from our own bucket, plus the TikTok verification file the
// admin saved (so the URL prefix can be verified as a TikTok URL property).
router.get("/content-sched/media/:name", async (req: Request, res: Response) => {
  const name = String(req.params.name || "");
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(name)) { res.status(404).end(); return; }
  const loaded = await loadCfgRaw();
  if (loaded?.cfg.tt_verify_name && name === loaded.cfg.tt_verify_name) {
    res.type("text/plain").send(loaded.cfg.tt_verify_content || ""); return;
  }
  if (!name.startsWith("i-")) { res.status(404).end(); return; } // images only
  const up = await fetch(`${OUR_PREFIX}${name}`);
  if (!up.ok || !up.body) { res.status(404).end(); return; }
  res.status(200);
  res.setHeader("Content-Type", up.headers.get("content-type") || "image/jpeg");
  const len = up.headers.get("content-length"); if (len) res.setHeader("Content-Length", len);
  res.setHeader("Cache-Control", "public, max-age=3600");
  const { Readable } = await import("node:stream");
  Readable.fromWeb(up.body as any).pipe(res);
});

// ── TikTok / YouTube OAuth ──────────────────────────────────────
// The public callback URL must include the /api prefix (the platform proxy
// strips it before routes see the path).
function oauthRedirectUri(req: Request, platform: string): string {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return `${proto}://${host}/api/content-sched/oauth/${platform}/callback`;
}

// Save the developer-app credentials and get back the authorize URL.
router.post("/content-sched/oauth/:platform/app", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const platform = req.params.platform === "tiktok" ? "tiktok" : req.params.platform === "youtube" ? "youtube" : null;
  if (!platform) { res.status(400).json({ error: "Unknown platform" }); return; }
  const clientId = String(req.body?.client_id || "").trim();
  const clientSecret = String(req.body?.client_secret || "").trim();
  const loaded = await loadCfgRaw();
  const cfg: SchedCfg = { ...(loaded?.cfg || {}) };
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const publicBase = host ? `${proto}://${host}` : "";
  const verifyName = String(req.body?.verify_name || "").trim().replace(/[^A-Za-z0-9._-]/g, "");
  const verifyContent = String(req.body?.verify_content || "").trim().slice(0, 500);
  const changedVerify = platform === "tiktok" && verifyName && verifyContent;
  const changedBase = publicBase && cfg.public_base !== publicBase;
  if (clientId && clientSecret || changedVerify || changedBase) {
    if (publicBase) cfg.public_base = publicBase;
    if (changedVerify) { cfg.tt_verify_name = verifyName; cfg.tt_verify_content = verifyContent; }
    if (clientId && clientSecret) {
      if (platform === "tiktok") { cfg.tt_client_key = clientId; cfg.tt_client_secret = clientSecret; }
      else { cfg.yt_client_id = clientId; cfg.yt_client_secret = clientSecret; }
    }
    const ok = loaded
      ? await casSetting(EDEN_ORG_ID, CFG_KEY, loaded.raw, serializeCfg(cfg))
      : await upsertSetting(EDEN_ORG_ID, CFG_KEY, serializeCfg(cfg));
    if (!ok) { res.status(409).json({ error: "Settings changed elsewhere — reload and try again" }); return; }
  }
  // For TikTok, env secrets act as a transparent fallback so the admin can
  // click Connect without having to paste credentials into the UI.
  const key = platform === "tiktok" ? (cfg.tt_client_key || TT_ENV_KEY) : cfg.yt_client_id;
  const secret = platform === "tiktok" ? (cfg.tt_client_secret || TT_ENV_SECRET) : cfg.yt_client_secret;
  if (!key || !secret) { res.status(400).json({ error: "Enter the app's client key and secret first" }); return; }
  const redirectUri = oauthRedirectUri(req, platform);
  const state = signState(platform);
  const authorizeUrl = platform === "tiktok" ? ttAuthorizeUrl(key, redirectUri, state) : ytAuthorizeUrl(key, redirectUri, state);
  const mediaPrefix = platform === "tiktok" && cfg.public_base ? `${cfg.public_base}/api/content-sched/media/` : undefined;
  res.json({ ok: true, redirect_uri: redirectUri, authorize_url: authorizeUrl, media_prefix: mediaPrefix });
});

// Browser lands here after approving access. No session — state is the auth.
router.get("/content-sched/oauth/:platform/callback", async (req: Request, res: Response) => {
  const platform = req.params.platform === "tiktok" ? "tiktok" : req.params.platform === "youtube" ? "youtube" : null;
  const page = (title: string, msg: string) =>
    `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>${title}</h2><p>${msg}</p><p>You can close this tab and go back to the app.</p></body>`;
  if (!platform) { res.status(400).send(page("Hmm", "Unknown platform.")); return; }
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  if (!code || !verifyState(state, platform)) {
    res.status(400).send(page("Connection failed", "The link expired or was invalid — go back to the app and click Connect again."));
    return;
  }
  try {
    const loaded = await loadCfgRaw();
    const cfg: SchedCfg = { ...(loaded?.cfg || {}) };
    const redirectUri = oauthRedirectUri(req, platform);
    if (platform === "tiktok") {
      const clientKey = cfg.tt_client_key || TT_ENV_KEY;
      const clientSecret = cfg.tt_client_secret || TT_ENV_SECRET;
      if (!clientKey || !clientSecret) throw new Error("TikTok app credentials missing — check TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET server env vars");
      const t = await ttExchangeCode(clientKey, clientSecret, code, redirectUri);
      cfg.tt_access = t.access_token; cfg.tt_refresh = t.refresh_token;
      cfg.tt_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
      cfg.tt_open_id = t.open_id;
      try { cfg.tt_username = (await ttCreatorInfo(t.access_token)).username; } catch { /* audit-pending apps may block this */ }
    } else {
      if (!cfg.yt_client_id || !cfg.yt_client_secret) throw new Error("YouTube app credentials missing");
      const t = await ytExchangeCode(cfg.yt_client_id, cfg.yt_client_secret, code, redirectUri);
      cfg.yt_access = t.access_token;
      if (t.refresh_token) cfg.yt_refresh = t.refresh_token;
      if (!cfg.yt_refresh) throw new Error("Google did not return a refresh token — remove the app's access at myaccount.google.com/permissions and connect again");
      cfg.yt_expires_at = new Date(Date.now() + t.expires_in * 1000).toISOString();
      const ch = await ytChannelInfo(t.access_token);
      cfg.yt_channel_id = ch.channelId; cfg.yt_channel_title = ch.title;
    }
    const ok = loaded
      ? await casSetting(EDEN_ORG_ID, CFG_KEY, loaded.raw, serializeCfg(cfg))
      : await upsertSetting(EDEN_ORG_ID, CFG_KEY, serializeCfg(cfg));
    if (!ok) {
      // Lost the CAS — merge ONLY this platform's fresh token fields.
      const patch: Partial<SchedCfg> = platform === "tiktok"
        ? { tt_access: cfg.tt_access, tt_refresh: cfg.tt_refresh, tt_expires_at: cfg.tt_expires_at, tt_open_id: cfg.tt_open_id, tt_username: cfg.tt_username }
        : { yt_access: cfg.yt_access, yt_refresh: cfg.yt_refresh, yt_expires_at: cfg.yt_expires_at, yt_channel_id: cfg.yt_channel_id, yt_channel_title: cfg.yt_channel_title };
      await persistTokenFields(patch);
    }
    const who = platform === "tiktok" ? (cfg.tt_username || "your TikTok account") : (cfg.yt_channel_title || "your YouTube channel");
    res.send(page("✅ Connected!", `${platform === "tiktok" ? "TikTok" : "YouTube"} is now linked to ${who}.`));
  } catch (e) {
    logger.warn({ err: String(e) }, "[ContentSched] oauth callback failed");
    res.status(400).send(page("Connection failed", String((e as Error).message).slice(0, 300)));
  }
});

router.post("/content-sched/oauth/:platform/disconnect", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const platform = req.params.platform;
  const loaded = await loadCfgRaw();
  if (!loaded) { res.json({ ok: true }); return; }
  const cfg: any = { ...loaded.cfg };
  const fields = platform === "tiktok"
    ? ["tt_client_key", "tt_client_secret", "tt_client_secret_enc", "tt_access", "tt_access_enc", "tt_refresh", "tt_refresh_enc", "tt_expires_at", "tt_open_id", "tt_username"]
    : ["yt_client_id", "yt_client_secret", "yt_client_secret_enc", "yt_access", "yt_access_enc", "yt_refresh", "yt_refresh_enc", "yt_expires_at", "yt_channel_id", "yt_channel_title"];
  for (const f of fields) delete cfg[f];
  await upsertSetting(EDEN_ORG_ID, CFG_KEY, serializeCfg(cfg));
  res.json({ ok: true });
});

// ── Direct-to-storage uploads (big videos, no 18 MB base64 cap) ─
// Returns a one-hour signed upload URL; the browser PUTs the file straight
// to Supabase Storage, so the api-server never buffers the video.
router.post("/content-sched/upload-url", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  const { filename, contentType } = req.body || {};
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
  if (!ALLOWED.includes(String(contentType || ""))) { res.status(400).json({ error: "Only JPG/PNG/WebP photos and MP4/MOV videos are supported" }); return; }
  try { await ensureBucket(); } catch { res.status(502).json({ error: "Storage unavailable" }); return; }
  const safe = String(filename || "file").slice(-120).replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  const kind = String(contentType).startsWith("video/") ? "v" : "i";
  const objPath = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${objPath}`, {
    method: "POST", headers: SH, body: JSON.stringify({}),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.url) { res.status(502).json({ error: "Could not create an upload link — try again" }); return; }
  res.json({
    upload_url: `${SUPABASE_URL}/storage/v1${String(j.url).startsWith("/") ? "" : "/"}${j.url}`,
    public_url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objPath}`,
  });
});

// Kick a scheduler pass right now (also lets an admin test the weekly recap).
router.post("/content-sched/run-now", async (req: Request, res: Response) => {
  const staff = await requireEdenAdmin(req, res); if (!staff) return;
  await processDue();
  res.json({ ok: true, health: getContentSchedHealth() });
});

export default router;
