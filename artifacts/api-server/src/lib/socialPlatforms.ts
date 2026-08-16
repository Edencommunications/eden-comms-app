// socialPlatforms.ts — TikTok + YouTube helpers for the Content Scheduler.
//
// Both platforms use per-app OAuth (unlike Meta's paste-a-token flow):
// the admin creates a free developer app on each platform, saves its
// client id/secret here, and completes a browser OAuth handshake. We keep
// the refresh token and rotate access tokens automatically.
//
// IMPORTANT platform constraints (surfaced in the UI too):
// - TikTok: until the developer app passes TikTok's audit, all API posts are
//   forced to SELF_ONLY (private) visibility. We ask for the most public
//   privacy level the account allows.
// - YouTube: until the Google OAuth app passes verification, uploaded videos
//   are locked private. Shorts = vertical video ≤3 min with #Shorts tag.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger";

const TT_API = "https://open.tiktokapis.com";
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Thrown when a publish MAY have landed remotely (session created / bytes
// sent) but we lost track of the outcome. Callers must NEVER auto-retry
// these — that's how double-posts happen.
export class AmbiguousPublishError extends Error {
  publishId?: string;
  constructor(message: string, publishId?: string) {
    super(message);
    this.name = "AmbiguousPublishError";
    this.publishId = publishId;
  }
}

// ── OAuth state (HMAC-signed, 10-minute expiry) ─────────────────
const STATE_KEY = crypto.createHash("sha256").update(`content-sched-oauth:${process.env.SESSION_SECRET || ""}`).digest();
export function signState(platform: string, now = Date.now()): string {
  const payload = `${platform}.${now}`;
  const mac = crypto.createHmac("sha256", STATE_KEY).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}
export function verifyState(state: string, platform: string, now = Date.now()): boolean {
  try {
    const [payloadB64, mac] = String(state || "").split(".");
    if (!payloadB64 || !mac) return false;
    const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
    const expect = crypto.createHmac("sha256", STATE_KEY).update(payload).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return false;
    const [p, tsStr] = payload.split(".");
    if (p !== platform) return false;
    const ts = Number(tsStr);
    return Number.isFinite(ts) && now - ts < 10 * 60 * 1000 && now - ts >= 0;
  } catch { return false; }
}

// ── Shared: download media to a temp file (avoids huge Buffers) ─
export async function downloadToTemp(url: string): Promise<{ filePath: string; size: number; cleanup: () => void }> {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`Could not download media (${r.status})`);
  const filePath = path.join(os.tmpdir(), `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const ws = fs.createWriteStream(filePath);
  await new Promise<void>((resolve, reject) => {
    const reader = (r.body as any).getReader();
    const pump = () => reader.read().then(({ done, value }: any) => {
      if (done) { ws.end(() => resolve()); return; }
      ws.write(Buffer.from(value), (err) => (err ? reject(err) : pump()));
    }).catch(reject);
    pump();
  });
  const size = fs.statSync(filePath).size;
  const cleanup = () => { try { fs.unlinkSync(filePath); } catch { /* already gone */ } };
  if (!size) { cleanup(); throw new Error("Downloaded media was empty"); }
  return { filePath, size, cleanup };
}

// ── TikTok ──────────────────────────────────────────────────────
export function ttAuthorizeUrl(clientKey: string, redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_key: clientKey,
    scope: "user.info.basic,video.publish,video.list",
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${qs}`;
}

type TtTokens = { access_token: string; refresh_token: string; expires_in: number; open_id: string };
async function ttTokenCall(body: Record<string, string>): Promise<TtTokens> {
  const r = await fetch(`${TT_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error || !j?.access_token) {
    throw new Error(j?.error_description || j?.error || `TikTok token call failed (${r.status})`);
  }
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in || 86400), open_id: String(j.open_id || "") };
}
export function ttExchangeCode(clientKey: string, clientSecret: string, code: string, redirectUri: string): Promise<TtTokens> {
  return ttTokenCall({ client_key: clientKey, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
}
export function ttRefreshToken(clientKey: string, clientSecret: string, refreshToken: string): Promise<TtTokens> {
  return ttTokenCall({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
}

async function ttPost(pathName: string, token: string, body: any): Promise<any> {
  const r = await fetch(`${TT_API}${pathName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || (j?.error && j.error.code !== "ok")) {
    throw new Error(j?.error?.message || j?.error?.code || `TikTok ${pathName} failed (${r.status})`);
  }
  return j;
}

export async function ttCreatorInfo(token: string): Promise<{ username: string; privacyOptions: string[] }> {
  const j = await ttPost("/v2/post/publish/creator_info/query/", token, {});
  return {
    username: String(j?.data?.creator_username || j?.data?.creator_nickname || ""),
    privacyOptions: Array.isArray(j?.data?.privacy_level_options) ? j.data.privacy_level_options.map(String) : [],
  };
}

// TikTok chunk rules: total_chunk_count = floor(size / chunk_size), with the
// final chunk absorbing the remainder — AND every chunk must stay ≤64 MB.
// A 32 MB chunk size satisfies both: the final chunk is at most
// 32 MB + (remainder < 32 MB) < 64 MB.
export function planTtChunks(size: number): { chunkSize: number; count: number; ranges: Array<{ start: number; end: number }> } {
  const CHUNK = 32 * 1024 * 1024;
  if (size <= 64 * 1024 * 1024) return { chunkSize: size, count: 1, ranges: [{ start: 0, end: size - 1 }] };
  const count = Math.floor(size / CHUNK);
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < count; i++) {
    const start = i * CHUNK;
    const end = i === count - 1 ? size - 1 : start + CHUNK - 1; // last chunk absorbs remainder
    ranges.push({ start, end });
  }
  return { chunkSize: CHUNK, count, ranges };
}

// Pick the most public privacy level the account/app allows. Unaudited apps
// only get SELF_ONLY — the post still works, it's just private.
export function ttPickPrivacy(options: string[]): string {
  const pref = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];
  for (const p of pref) if (options.includes(p)) return p;
  return options[0] || "SELF_ONLY";
}

// Direct-post a video via FILE_UPLOAD (no domain verification needed).
// Returns the publish_id and, once processing completes, the public video id.
export async function ttPublishVideo(token: string, mediaUrl: string, caption: string): Promise<{ publishId: string; videoId?: string; privacy: string }> {
  const info = await ttCreatorInfo(token);
  const privacy = ttPickPrivacy(info.privacyOptions);
  const dl = await downloadToTemp(mediaUrl);
  try {
    const plan = planTtChunks(dl.size);
    const init = await ttPost("/v2/post/publish/video/init/", token, {
      post_info: {
        title: String(caption || "").slice(0, 2200),
        privacy_level: privacy,
        disable_duet: false, disable_comment: false, disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: dl.size,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.count,
      },
    });
    const publishId = String(init?.data?.publish_id || "");
    const uploadUrl = String(init?.data?.upload_url || "");
    if (!publishId || !uploadUrl) throw new Error("TikTok did not return an upload URL");
    // From here on a publish session exists on TikTok's side — any failure is
    // ambiguous (the video may still go live) and must never be auto-retried.
    try {
    const fd = fs.openSync(dl.filePath, "r");
    try {
      for (const rg of plan.ranges) {
        const len = rg.end - rg.start + 1;
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, rg.start);
        const up = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(len),
            "Content-Range": `bytes ${rg.start}-${rg.end}/${dl.size}`,
          },
          body: buf as any,
        });
        if (!up.ok && up.status !== 201) throw new Error(`TikTok chunk upload failed (${up.status})`);
      }
    } finally { fs.closeSync(fd); }
    // Poll processing status up to ~5 minutes.
    let videoId: string | undefined;
    for (let i = 0; i < 30; i++) {
      await sleep(10_000);
      const st = await ttPost("/v2/post/publish/status/fetch/", token, { publish_id: publishId });
      const status = String(st?.data?.status || "");
      if (status === "PUBLISH_COMPLETE") {
        const ids = st?.data?.publicaly_available_post_id;
        if (Array.isArray(ids) && ids[0] != null) videoId = String(ids[0]);
        return { publishId, videoId, privacy };
      }
      if (status === "FAILED") throw new Error(`TikTok rejected the video: ${st?.data?.fail_reason || "unknown reason"}`);
    }
    // Still processing after 5 min — treat as posted (TikTok has the video).
    logger.warn({ publishId }, "[ContentSched] TikTok still processing after 5 min — assuming success");
    return { publishId, videoId, privacy };
    } catch (e) {
      // A definitive FAILED status from TikTok is a real failure — safe to
      // surface normally. Anything else (network blip mid-upload/polling)
      // is ambiguous: the video may still publish.
      if (String((e as Error).message).startsWith("TikTok rejected the video")) throw e;
      throw new AmbiguousPublishError(`TikTok outcome unknown: ${String((e as Error).message).slice(0, 200)}`, publishId);
    }
  } finally { dl.cleanup(); }
}

// Photo / carousel direct post. Photos only support PULL_FROM_URL — TikTok
// fetches each image itself, and the URL prefix must be a verified URL
// property on the developer app (hence the api-server media relay).
export async function ttPublishPhotos(token: string, imageUrls: string[], caption: string): Promise<{ publishId: string; videoId?: string; privacy: string }> {
  const info = await ttCreatorInfo(token);
  const privacy = ttPickPrivacy(info.privacyOptions);
  const firstLine = String(caption || "").split("\n")[0].trim().slice(0, 90);
  const init = await ttPost("/v2/post/publish/content/init/", token, {
    post_info: {
      title: firstLine, description: String(caption || "").slice(0, 4000),
      privacy_level: privacy, disable_comment: false, auto_add_music: true,
    },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: imageUrls },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  });
  const publishId = String(init?.data?.publish_id || "");
  if (!publishId) throw new Error("TikTok did not accept the photo post");
  // Session exists — failures past this point are ambiguous.
  try {
    for (let i = 0; i < 18; i++) { // photos process faster than video; ~3 min
      await sleep(10_000);
      const st = await ttPost("/v2/post/publish/status/fetch/", token, { publish_id: publishId });
      const status = String(st?.data?.status || "");
      if (status === "PUBLISH_COMPLETE") {
        const ids = st?.data?.publicaly_available_post_id;
        return { publishId, videoId: Array.isArray(ids) && ids[0] != null ? String(ids[0]) : undefined, privacy };
      }
      if (status === "FAILED") throw new Error(`TikTok rejected the photos: ${st?.data?.fail_reason || "unknown reason"} (is the media URL prefix verified in your TikTok app?)`);
    }
    logger.warn({ publishId }, "[ContentSched] TikTok photos still processing after 3 min — assuming success");
    return { publishId, privacy };
  } catch (e) {
    if (String((e as Error).message).startsWith("TikTok rejected the photos")) throw e;
    throw new AmbiguousPublishError(`TikTok outcome unknown: ${String((e as Error).message).slice(0, 200)}`, publishId);
  }
}

export async function ttVideoStats(token: string, videoId: string): Promise<any> {
  const r = await fetch(`${TT_API}/v2/video/query/?fields=like_count,comment_count,share_count,view_count`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: [videoId] } }),
  });
  const j: any = await r.json().catch(() => ({}));
  const v = j?.data?.videos?.[0];
  if (!v) return { error: j?.error?.message || "TikTok stats not available yet" };
  return { views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0 };
}

// ── YouTube ─────────────────────────────────────────────────────
export function ytAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const qs = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on re-connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

type YtTokens = { access_token: string; refresh_token?: string; expires_in: number };
async function ytTokenCall(body: Record<string, string>): Promise<YtTokens> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.access_token) throw new Error(j?.error_description || j?.error || `Google token call failed (${r.status})`);
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in || 3600) };
}
export function ytExchangeCode(clientId: string, clientSecret: string, code: string, redirectUri: string): Promise<YtTokens> {
  return ytTokenCall({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
}
export function ytRefreshToken(clientId: string, clientSecret: string, refreshToken: string): Promise<YtTokens> {
  return ytTokenCall({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function ytChannelInfo(token: string): Promise<{ channelId: string; title: string }> {
  const r = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json().catch(() => ({}));
  const ch = j?.items?.[0];
  if (!ch) throw new Error(j?.error?.message || "No YouTube channel on this Google account");
  return { channelId: String(ch.id), title: String(ch.snippet?.title || "") };
}

// Shorts are detected automatically (vertical, ≤3 min) but #Shorts in the
// title/description makes intent explicit. Title = first caption line.
export function ytShortTitle(caption: string): string {
  const firstLine = String(caption || "").split("\n")[0].trim().slice(0, 88) || "New video";
  return /#shorts/i.test(firstLine) ? firstLine : `${firstLine} #Shorts`;
}

export async function ytUploadVideo(token: string, mediaUrl: string, caption: string): Promise<string> {
  const dl = await downloadToTemp(mediaUrl);
  try {
    const meta = {
      snippet: { title: ytShortTitle(caption), description: String(caption || "").slice(0, 4900), categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    };
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(dl.size),
      },
      body: JSON.stringify(meta),
    });
    if (!init.ok) {
      const j: any = await init.json().catch(() => ({}));
      throw new Error(j?.error?.message || `YouTube upload init failed (${init.status})`);
    }
    const session = init.headers.get("location") || "";
    if (!session) throw new Error("YouTube did not return an upload session");
    // Bytes are about to flow — from here a lost response means the upload
    // may have completed on YouTube's side. Never auto-retry.
    let up: globalThis.Response;
    try {
      up = await fetch(session, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(dl.size) },
        body: fs.createReadStream(dl.filePath) as any,
        duplex: "half", // node fetch needs this for streamed bodies
      } as any);
    } catch (e) {
      throw new AmbiguousPublishError(`YouTube outcome unknown: ${String((e as Error).message).slice(0, 200)}`);
    }
    const j: any = await up.json().catch(() => ({}));
    if (up.ok && j?.id) return String(j.id);
    // 4xx = YouTube definitively rejected it; 5xx/parse trouble = ambiguous.
    if (up.status >= 400 && up.status < 500) throw new Error(j?.error?.message || `YouTube rejected the upload (${up.status})`);
    throw new AmbiguousPublishError(j?.error?.message || `YouTube outcome unknown (${up.status})`);
  } finally { dl.cleanup(); }
}

export async function ytVideoStats(token: string, videoId: string): Promise<any> {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j: any = await r.json().catch(() => ({}));
  const st = j?.items?.[0]?.statistics;
  if (!st) return { error: j?.error?.message || "YouTube stats not available yet" };
  return {
    views: Number(st.viewCount || 0), likes: Number(st.likeCount || 0), comments: Number(st.commentCount || 0),
    url: `https://youtube.com/shorts/${videoId}`,
  };
}
