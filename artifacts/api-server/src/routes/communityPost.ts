// communityPost.ts — Zapier/automation → post a message into a community.
//
// POST /api/webhooks/community-post/:companyId   (secret required)
//   Headers: x-webhook-secret: <per-org secret>
//   Body: { community_id | community (name), message, sender_name? }
//   Posts the message into the chosen community for that org — used to pipe
//   things like the weekly Google Form check-in link from Zapier into the
//   in-app Team Check-In community. Works for any white-label org, and for
//   DBA sub-brands by targeting the DBA's community.
//
// GET /api/webhooks/community-post/:companyId/config
//   Admin-only. Returns the org's webhook URL + secret + community list
//   (shown in the Admin Panel so admins can self-serve Zapier setup).

import { Router, type IRouter, type Request, type Response } from "express";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { logger } from "../lib/logger";
import { requireStaff } from "./checkinForm";
import { findDbaAnywhere, dbaAccess, requireUserJwt, rotateDbaWebhookNonce } from "./dba";
import { requireUser } from "./push";

const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const H = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function dbGet<T = any>(pathAndQuery: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}
async function dbInsert(table: string, body: unknown): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  return r.ok;
}

// Per-org shared secret — deterministic HMAC keyed by the server secret, so
// no schema change is needed and it's stable across restarts. Distinct label
// from the GHL intake secret so the two webhooks can't be swapped.
const SECRET_KEY = process.env.SESSION_SECRET || "";
export function communityPostSecretFor(companyId: string): string {
  // Fail closed: without the server secret we can't mint org secrets safely.
  if (!SECRET_KEY) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", SECRET_KEY).update(`community-post:${companyId}`).digest("hex").slice(0, 32);
}
// Per-DBA secret — distinct label so a DBA credential can never be mistaken
// for (or upgraded to) the org-wide one. Scoped to that DBA's own channels.
// A stored per-DBA nonce (set by "Reset secret") is mixed into the HMAC so a
// single leaked DBA secret can be rotated without touching SESSION_SECRET.
// No nonce (legacy DBAs) → original derivation, so existing secrets keep working.
export function communityPostDbaSecretFor(dbaId: string, nonce?: string | null): string {
  if (!SECRET_KEY) throw new Error("SESSION_SECRET is not set");
  const label = nonce ? `community-post-dba:${dbaId}:${nonce}` : `community-post-dba:${dbaId}`;
  return createHmac("sha256", SECRET_KEY).update(label).digest("hex").slice(0, 32);
}

// Simple per-org rate limit: at most 30 posts per hour. Zapier check-in
// blasts are weekly, so this is generous while capping abuse if a secret
// ever leaks (rotating SESSION_SECRET rotates all webhook secrets).
const postTimes = new Map<string, number[]>();
function rateLimited(companyId: string): boolean {
  const now = Date.now();
  const arr = (postTimes.get(companyId) || []).filter(t => now - t < 3600_000);
  if (arr.length >= 30) { postTimes.set(companyId, arr); return true; }
  arr.push(now); postTimes.set(companyId, arr);
  return false;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function appBase(req: Request): string {
  const host = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim();
  return `https://${host || "edencommunications.io"}`;
}

// ── Per-member community mutes ─────────────────────────────────
// A member can mute a busy community's buzzes without leaving it: we keep a
// tiny admin_settings row per (community, user) — key `community_mute:<cid>:<uid>`,
// value "1" (muted) or "0" (unmuted). No schema change needed. Muted members
// still get the in-app unread badge (that's computed from messages, not
// notifications); they just stop receiving bell/push notification rows for
// that community.
const MUTE_KEY = (cid: string, uid: string) => `community_mute:${cid}:${uid}`;
export async function mutedUserIds(communityId: string): Promise<Set<string>> {
  try {
    const prefix = `community_mute:${communityId}:`;
    const rows = await dbGet<any>(`admin_settings?key=like.${encodeURIComponent(prefix)}*&select=key,value&limit=500`);
    const out = new Set<string>();
    for (const r of rows) {
      if (String(r.value) !== "1") continue;
      const uid = String(r.key || "").slice(prefix.length);
      if (uid) out.add(uid);
    }
    return out;
  } catch { return new Set(); }
}

// Notify community members a new post landed — feeds the top bell AND phone
// push (the push watcher mirrors notifications rows). Skips the sender and
// anyone who muted this community.
export async function notifyCommunityMembers(communityId: string, communityName: string, senderId: string | null): Promise<void> {
  try {
    const [members, muted] = await Promise.all([
      dbGet<any>(`community_members?community_id=eq.${encodeURIComponent(communityId)}&select=user_id&limit=200`),
      mutedUserIds(communityId),
    ]);
    const rows = members
      .map((m: any) => m.user_id)
      .filter((id: string) => id && id !== senderId && !muted.has(id))
      .map((id: string) => ({
        recipient_id: id,
        sender_id: senderId,
        type: "community_post",
        body: `💬 New post in #${communityName} — check your communities`,
        is_read: false,
      }));
    if (rows.length) await dbInsert("notifications", rows);
  } catch (e) {
    logger.warn({ err: String(e) }, "[CommunityPost] member notify failed");
  }
}

// ── Human chat posts → throttled member notifications ──────────
// At most one notification per community per recipient per 10 minutes, so a
// busy back-and-forth doesn't buzz phones on every single message. The
// throttle state is PERSISTED in admin_settings (key `community_notify:<id>`)
// and claimed via compare-and-swap, so it holds across restarts and with
// multiple autoscaled server instances: whichever instance wins the CAS
// claims those recipients; the loser retries against the fresh state and
// finds them already stamped.
const NOTIFY_THROTTLE_MS = 10 * 60_000;
const NOTIFY_KEY = (cid: string) => `community_notify:${cid}`;

async function claimThrottledRecipients(companyId: string, communityId: string, candidates: string[]): Promise<string[]> {
  const key = NOTIFY_KEY(communityId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const rows = await dbGet<any>(`admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&select=value`);
    const rawStored: string | null = rows[0] ? String(rows[0].value) : null;
    let stamps: Record<string, number> = {};
    try { stamps = rawStored ? JSON.parse(rawStored) : {}; } catch { stamps = {}; }
    for (const [k, t] of Object.entries(stamps)) if (typeof t !== "number" || now - t >= NOTIFY_THROTTLE_MS) delete stamps[k];
    const eligible = candidates.filter((id) => !(id in stamps));
    if (!eligible.length) return [];
    for (const id of eligible) stamps[id] = now;
    const newValue = JSON.stringify(stamps);
    if (rawStored === null) {
      // First-ever notification for this community: insert; a duplicate-key
      // failure means another instance beat us — retry against its row.
      const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
        method: "POST", headers: H,
        body: JSON.stringify({ company_id: companyId, key, value: newValue, updated_at: new Date().toISOString() }),
      });
      if (r.ok) return eligible;
    } else {
      // CAS: only wins if nobody changed the row since we read it.
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&value=eq.${encodeURIComponent(rawStored)}`,
        { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ value: newValue, updated_at: new Date().toISOString() }) },
      );
      const updated = (r.ok ? await r.json().catch(() => []) : []) as any[];
      if (Array.isArray(updated) && updated.length) return eligible;
    }
  }
  return []; // lost the race 3× — someone else notified; stay silent
}

// Same mention detection the frontend uses — computed server-side from the
// verified message text so mentioned members (who already got a mention
// notification) aren't pinged twice, and callers can't spoof exclusions.
const escRe = (s: string) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function mentionedUserIds(text: string, members: Array<{ user_id: string; user_name?: string | null }>): string[] {
  const hits: string[] = [];
  for (const m of members) {
    if (!m.user_id || !m.user_name) continue;
    const first = String(m.user_name).split(" ")[0];
    const re = new RegExp(`@(${escRe(m.user_name)}|${escRe(first)})(\\b|$)`, "i");
    if (re.test(text)) hits.push(m.user_id);
  }
  return hits;
}

const router: IRouter = Router();

// ── Mute / unmute a community's buzzes (any member, clients included) ──
// GET  /communities/:id/mute   → { muted: boolean }
// POST /communities/:id/mute   { muted: boolean }
async function communityForMute(req: Request, res: Response): Promise<{ caller: any; comm: any } | null> {
  const communityId = String(req.params.id || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(communityId)) { res.status(400).json({ error: "Bad community id" }); return null; }
  const caller = await requireUser(req);
  if (!caller) { res.status(401).json({ error: "Not authorized" }); return null; }
  const comm = (await dbGet<any>(`communities?id=eq.${encodeURIComponent(communityId)}&select=id,name,company_id&limit=1`))[0];
  if (!comm) { res.status(404).json({ error: "Community not found" }); return null; }
  // Only actual members (or same-org staff / Eden staff) can touch mute state.
  const commOrg = comm.company_id || EDEN_ORG_ID;
  const isEdenStaff = caller.role !== "client" && caller.company_id === EDEN_ORG_ID;
  if (caller.company_id !== commOrg && !isEdenStaff) { res.status(403).json({ error: "Not authorized" }); return null; }
  const membership = await dbGet<any>(
    `community_members?community_id=eq.${encodeURIComponent(communityId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=user_id&limit=1`,
  );
  const isOrgStaff = caller.role !== "client";
  if (!membership.length && !isOrgStaff) { res.status(403).json({ error: "You're not a member of this community" }); return null; }
  return { caller, comm };
}

router.get("/communities/:id/mute", async (req: Request, res: Response) => {
  try {
    const ok = await communityForMute(req, res);
    if (!ok) return;
    const key = MUTE_KEY(ok.comm.id, ok.caller.id);
    const rows = await dbGet<any>(`admin_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
    res.json({ muted: String(rows[0]?.value ?? "") === "1" });
  } catch { res.status(500).json({ error: "Could not load mute state" }); }
});

router.post("/communities/:id/mute", async (req: Request, res: Response) => {
  try {
    const ok = await communityForMute(req, res);
    if (!ok) return;
    const muted = req.body?.muted === true || req.body?.muted === "true";
    const key = MUTE_KEY(ok.comm.id, ok.caller.id);
    const companyId = ok.comm.company_id || EDEN_ORG_ID;
    // Atomic upsert on (company_id,key): a single explicit "1"/"0" row, so
    // concurrent toggles can't leave a half-written state and any failure is
    // reported instead of silently claiming success.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ company_id: companyId, key, value: muted ? "1" : "0", updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { res.status(502).json({ error: "Could not save mute state" }); return; }
    res.json({ ok: true, muted });
  } catch { res.status(500).json({ error: "Could not save mute state" }); }
});

router.post("/webhooks/community-post/:companyId", async (req: Request, res: Response) => {
  try {
    const companyId = String(req.params.companyId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) { res.status(400).json({ error: "Bad company id" }); return; }
    const given = String(req.get("x-webhook-secret") || "").trim();
    if (!SECRET_KEY) { res.status(503).json({ error: "Webhook not available — server secret missing" }); return; }
    if (!given || !safeEqual(given, communityPostSecretFor(companyId))) {
      res.status(401).json({ error: "Wrong or missing x-webhook-secret header" }); return;
    }
    if (rateLimited(companyId)) { res.status(429).json({ error: "Too many posts — try again later (30 per hour max)" }); return; }

    const b: any = req.body || {};
    const message = String(b.message ?? b.text ?? b.content ?? "").trim();
    if (!message) { res.status(400).json({ error: "Send the text as `message`" }); return; }
    if (message.length > 8000) { res.status(400).json({ error: "Message is too long (8000 characters max)" }); return; }

    // Find the community: by id, or by (case-insensitive) name within this org.
    const communityId = String(b.community_id || "").trim();
    const communityName = String(b.community || b.community_name || "").trim();
    let comm: any = null;
    if (communityId) {
      comm = (await dbGet(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${companyId}&is_active=eq.true&select=id,name`))[0];
    } else if (communityName) {
      comm = (await dbGet(`communities?name=ilike.${encodeURIComponent(communityName)}&company_id=eq.${companyId}&is_active=eq.true&select=id,name&limit=1`))[0];
    }
    if (!comm) { res.status(404).json({ error: "Community not found — send `community_id` or the exact `community` name" }); return; }

    const senderName = String(b.sender_name || "").trim().slice(0, 60) || "📬 Team Update";
    const ok = await dbInsert("community_messages", {
      community_id: comm.id,
      sender_id: null,
      sender_name: senderName,
      sender_role: "super_admin",
      content: message,
      parent_id: null,
    });
    if (!ok) { res.status(502).json({ error: "Could not post the message" }); return; }
    await notifyCommunityMembers(comm.id, comm.name, null);
    logger.info({ companyId, community: comm.name }, "[CommunityPost] webhook posted");
    res.json({ ok: true, community: comm.name });
  } catch (e) {
    logger.warn({ err: String(e) }, "[CommunityPost] webhook failed");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Human chat posts: the frontend calls this right after inserting a
// community_messages row, so regular messages buzz bells + phones too
// (not just automated webhook/recap posts).
//
// Anti-spam/integrity: the notification is BOUND to a real, freshly created
// message — the caller sends the new message_id, and we verify the row
// exists in this community, was authored by the authenticated caller, and
// is recent. Sender name and mention exclusions are derived server-side
// from the verified row, so nothing in the request body can be spoofed.
router.post("/communities/:id/notify-post", async (req: Request, res: Response) => {
  try {
    const communityId = String(req.params.id || "").trim();
    const messageId = String(req.body?.message_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(communityId)) { res.status(400).json({ error: "Bad community id" }); return; }
    if (!messageId || messageId.length > 64 || !/^[0-9a-zA-Z-]+$/.test(messageId)) { res.status(400).json({ error: "Send the new message's id as `message_id`" }); return; }
    // Any active user (clients post in communities too — staff-only would
    // silently kill client-post notifications).
    const caller = await requireUser(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }

    const comm = (await dbGet<any>(
      `communities?id=eq.${encodeURIComponent(communityId)}&is_active=eq.true&select=id,name,company_id&limit=1`,
    ))[0];
    if (!comm) { res.status(404).json({ error: "Community not found" }); return; }

    // Tenant + membership authorization: the caller must belong to the
    // community's org (Eden staff may span orgs) and be a member — or be
    // org staff, who may post in any of their org's communities.
    const commOrg = comm.company_id || EDEN_ORG_ID;
    const isEdenStaff = caller.role !== "client" && caller.company_id === EDEN_ORG_ID;
    const isOrgStaff = caller.role !== "client" && (caller.company_id === commOrg || isEdenStaff);
    if (caller.company_id !== commOrg && !isEdenStaff) { res.status(403).json({ error: "Not authorized" }); return; }
    if (!isOrgStaff) {
      const membership = await dbGet<any>(
        `community_members?community_id=eq.${encodeURIComponent(communityId)}&user_id=eq.${encodeURIComponent(caller.id)}&select=user_id&limit=1`,
      );
      if (!membership.length) { res.status(403).json({ error: "Not authorized" }); return; }
    }

    const msg = (await dbGet<any>(
      `community_messages?id=eq.${encodeURIComponent(messageId)}&community_id=eq.${encodeURIComponent(communityId)}&select=id,sender_id,sender_name,content,created_at,deleted_at&limit=1`,
    ))[0];
    if (!msg || msg.sender_id !== caller.id) { res.status(403).json({ error: "That message isn't yours or isn't in this community" }); return; }
    if (msg.deleted_at) { res.status(409).json({ error: "That message was deleted" }); return; }
    const ageMs = Date.now() - new Date(msg.created_at || 0).getTime();
    if (!(ageMs >= -60_000 && ageMs <= 120_000)) { res.status(409).json({ error: "Only brand-new messages can notify" }); return; }

    const members = await dbGet<any>(`community_members?community_id=eq.${encodeURIComponent(communityId)}&select=user_id,user_name&limit=200`);
    const mentioned = new Set(mentionedUserIds(String(msg.content || ""), members));
    const muted = await mutedUserIds(communityId);
    // Sender name comes from the VERIFIED message row — never the request body.
    const senderName = String(msg.sender_name || "").trim().slice(0, 60);

    // Mention pings are created HERE (server-side, from the verified message
    // text) so the per-community mute applies to them too — a muted member
    // gets no buzz at all from this community, mentions included.
    const content = String(msg.content || "");
    const mentionRows = [...mentioned]
      .filter((id) => id !== caller.id && !muted.has(id))
      .map((id) => ({
        recipient_id: id,
        sender_id: caller.id,
        type: "mention",
        body: `💬 ${senderName || "Someone"} tagged you in "${comm.name}": "${content.slice(0, 80)}"`,
        is_read: false,
      }));
    if (mentionRows.length) await dbInsert("notifications", mentionRows);

    const candidates = members
      .map((m: any) => m.user_id)
      .filter((id: string) => id && id !== caller.id && !mentioned.has(id) && !muted.has(id));

    // Shared, atomic throttle: only recipients we successfully claim get a row.
    const recipients = await claimThrottledRecipients(commOrg, comm.id, candidates);
    const rows = recipients.map((id: string) => ({
      recipient_id: id,
      sender_id: caller.id,
      type: "community_post",
      body: senderName ? `💬 ${senderName} posted in #${comm.name}` : `💬 New post in #${comm.name} — check your communities`,
      is_read: false,
    }));
    if (rows.length && !(await dbInsert("notifications", rows))) {
      res.status(502).json({ error: "Could not create notifications" }); return;
    }
    res.json({ ok: true, notified: rows.length, mentioned: mentionRows.length });
  } catch (e) {
    logger.warn({ err: String(e) }, "[CommunityPost] notify-post failed");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ── DBA sub-brand webhook ─────────────────────────────────────────
// Each DBA gets its own derived secret, valid ONLY for that DBA's group
// channels (communities with context `dba:<dbaId>`). The org-level webhook
// above is untouched — this is a narrower credential for sub-brand admins.
router.post("/webhooks/community-post-dba/:dbaId", async (req: Request, res: Response) => {
  try {
    const dbaId = String(req.params.dbaId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(dbaId)) { res.status(400).json({ error: "Bad DBA id" }); return; }
    const given = String(req.get("x-webhook-secret") || "").trim();
    if (!SECRET_KEY) { res.status(503).json({ error: "Webhook not available — server secret missing" }); return; }
    // Load the DBA first: the expected secret depends on its stored nonce.
    const hit = await findDbaAnywhere(dbaId);
    // Unknown or inactive DBA → 404 so callers know the endpoint is gone.
    if (!hit) { res.status(404).json({ error: "DBA not found" }); return; }
    if (!hit.dba.is_active) { res.status(404).json({ error: "DBA not found" }); return; }
    // Wrong or missing secret → 401.
    if (!given || !safeEqual(given, communityPostDbaSecretFor(dbaId, hit.dba.webhook_nonce))) {
      res.status(401).json({ error: "Wrong or missing x-webhook-secret header" }); return;
    }
    if (rateLimited(`dba:${dbaId}`)) { res.status(429).json({ error: "Too many posts — try again later (30 per hour max)" }); return; }

    const b: any = req.body || {};
    const message = String(b.message ?? b.text ?? b.content ?? "").trim();
    if (!message) { res.status(400).json({ error: "Send the text as `message`" }); return; }
    if (message.length > 8000) { res.status(400).json({ error: "Message is too long (8000 characters max)" }); return; }

    // Only this DBA's own group channels are reachable with this secret —
    // never org communities, other DBAs' channels, or 1v1 DMs.
    const ctx = encodeURIComponent(`dba:${dbaId}`);
    const communityId = String(b.community_id || "").trim();
    const communityName = String(b.community || b.community_name || "").trim();
    let comm: any = null;
    if (communityId) {
      comm = (await dbGet(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name`))[0];
    } else if (communityName) {
      comm = (await dbGet(`communities?name=ilike.${encodeURIComponent(communityName)}&company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name&limit=1`))[0];
    }
    if (!comm) { res.status(404).json({ error: "Channel not found — send `community_id` or the exact `community` name of one of this DBA's channels" }); return; }

    const senderName = String(b.sender_name || "").trim().slice(0, 60) || "📬 Team Update";
    const ok = await dbInsert("community_messages", {
      community_id: comm.id,
      sender_id: null,
      sender_name: senderName,
      sender_role: "super_admin",
      content: message,
      parent_id: null,
    });
    if (!ok) { res.status(502).json({ error: "Could not post the message" }); return; }
    await notifyCommunityMembers(comm.id, comm.name, null);
    logger.info({ dbaId, community: comm.name }, "[CommunityPost] DBA webhook posted");
    res.json({ ok: true, community: comm.name });
  } catch (e) {
    logger.warn({ err: String(e) }, "[CommunityPost] DBA webhook failed");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DBA config: URL + secret + the DBA's channel list. Anyone who can manage
// the DBA (coach, delegated staff, org/HQ admin) may view it.
router.get("/webhooks/community-post-dba/:dbaId/config", async (req: Request, res: Response) => {
  try {
    const dbaId = String(req.params.dbaId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(dbaId)) { res.status(400).json({ error: "Bad DBA id" }); return; }
    const me = await requireUserJwt(req);
    if (!me) { res.status(403).json({ error: "Not authorized" }); return; }
    const hit = await findDbaAnywhere(dbaId);
    if (!hit || !hit.dba.is_active) { res.status(404).json({ error: "DBA not found" }); return; }
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) { res.status(403).json({ error: "Not authorized" }); return; }
    const ctx = encodeURIComponent(`dba:${dbaId}`);
    const communities = await dbGet(`communities?company_id=eq.${hit.companyId}&context=eq.${ctx}&is_active=eq.true&select=id,name&order=name`);
    res.json({
      url: `${appBase(req)}/api/webhooks/community-post-dba/${dbaId}`,
      secret: communityPostDbaSecretFor(dbaId, hit.dba.webhook_nonce),
      communities,
    });
  } catch { res.status(500).json({ error: "Could not load config" }); }
});

// Reset a DBA's webhook secret — rotates ONLY this DBA's credential by
// storing a fresh nonce in its record. The old secret stops working the
// moment the nonce is saved; org-level and other DBA secrets are untouched.
router.post("/webhooks/community-post-dba/:dbaId/reset-secret", async (req: Request, res: Response) => {
  try {
    const dbaId = String(req.params.dbaId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(dbaId)) { res.status(400).json({ error: "Bad DBA id" }); return; }
    if (!SECRET_KEY) { res.status(503).json({ error: "Webhook not available — server secret missing" }); return; }
    const me = await requireUserJwt(req);
    if (!me) { res.status(403).json({ error: "Not authorized" }); return; }
    const hit = await findDbaAnywhere(dbaId);
    if (!hit || !hit.dba.is_active) { res.status(404).json({ error: "DBA not found" }); return; }
    if (!dbaAccess(me, hit.companyId, hit.dba).manage) { res.status(403).json({ error: "Not authorized" }); return; }
    const nonce = randomBytes(16).toString("hex");
    const saved = await rotateDbaWebhookNonce(dbaId, nonce, { id: me.id, name: me.name });
    if (!saved) { res.status(502).json({ error: "Could not reset the secret — try again" }); return; }
    logger.info({ dbaId }, "[CommunityPost] DBA webhook secret reset");
    res.json({ ok: true, secret: communityPostDbaSecretFor(dbaId, nonce) });
  } catch { res.status(500).json({ error: "Something went wrong" }); }
});

// Admin-only config: URL + secret + this org's communities for easy setup.
router.get("/webhooks/community-post/:companyId/config", async (req: Request, res: Response) => {
  try {
    const companyId = String(req.params.companyId || "").trim();
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin" ||
        (caller.company_id !== companyId && caller.company_id !== EDEN_ORG_ID)) {
      res.status(403).json({ error: "Not authorized" }); return;
    }
    const communities = await dbGet(`communities?company_id=eq.${companyId}&is_active=eq.true&select=id,name&order=name`);
    res.json({
      url: `${appBase(req)}/api/webhooks/community-post/${companyId}`,
      secret: communityPostSecretFor(companyId),
      communities,
    });
  } catch { res.status(500).json({ error: "Could not load config" }); }
});

export default router;
