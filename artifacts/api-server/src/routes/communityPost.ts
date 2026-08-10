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
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";
import { requireStaff } from "./checkinForm";
import { findDbaAnywhere, dbaAccess, requireUserJwt } from "./dba";

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
export function communityPostDbaSecretFor(dbaId: string): string {
  if (!SECRET_KEY) throw new Error("SESSION_SECRET is not set");
  return createHmac("sha256", SECRET_KEY).update(`community-post-dba:${dbaId}`).digest("hex").slice(0, 32);
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

// Notify community members a new post landed — feeds the top bell AND phone
// push (the push watcher mirrors notifications rows). Skips the sender.
export async function notifyCommunityMembers(communityId: string, communityName: string, senderId: string | null): Promise<void> {
  try {
    const members = await dbGet<any>(`community_members?community_id=eq.${encodeURIComponent(communityId)}&select=user_id&limit=200`);
    const rows = members
      .map((m: any) => m.user_id)
      .filter((id: string) => id && id !== senderId)
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

const router: IRouter = Router();

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
    if (!comm) { res.status(404).json({ error: "Community not found — send `community_id` or the exact `community` name for this org" }); return; }

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
    if (!given || !safeEqual(given, communityPostDbaSecretFor(dbaId))) {
      res.status(401).json({ error: "Wrong or missing x-webhook-secret header" }); return;
    }
    const hit = await findDbaAnywhere(dbaId);
    if (!hit || !hit.dba.is_active) { res.status(404).json({ error: "DBA not found" }); return; }
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
    const communities = await dbGet(
      `communities?company_id=eq.${hit.companyId}&context=eq.${encodeURIComponent(`dba:${dbaId}`)}&is_active=eq.true&select=id,name&order=name`,
    );
    res.json({
      url: `${appBase(req)}/api/webhooks/community-post-dba/${dbaId}`,
      secret: communityPostDbaSecretFor(dbaId),
      communities,
    });
  } catch { res.status(500).json({ error: "Could not load config" }); }
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
