// reactions.ts — Slack-style emoji reactions for every chat surface.
//
// Zero-DDL storage, race-free by construction: each user's reactions to a
// message live in their OWN admin_settings row, key `rx:<messageId>:<userId>`,
// value JSON { "n": "Display Name", "e": ["👍","🎉"] }. A toggle only ever
// rewrites the caller's row, so concurrent users can never clobber each other.
// Reads aggregate all rows for a message into { emoji: [{id, n}] }.
//
// Both read and write verify the caller can actually SEE each message
// (conversation participant, community member, org staff, or DM party).
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function rest<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}

type Profile = { id: string; name: string; role: string; company_id: string | null };
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
  const rows = await rest<any>(`user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,name,role,company_id`);
  if (!rows[0]) return null;
  return rows[0];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAFF_ROLES = ["super_admin", "company_admin", "coach", "head_coach", "va", "staff"];
const TABLES = new Set(["messages", "community_messages", "team_messages"]);

// Only real emoji, sensibly short (covers multi-codepoint: flags, skin tones, ZWJ)
function validEmoji(s: any): s is string {
  if (typeof s !== "string" || !s || s.length > 20) return false;
  try { return /^[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f]+$/u.test(s); } catch { return false; }
}

// Which of these message ids can this user see? Returns Map id → owning org.
async function visibleMessages(me: Profile, table: string, ids: string[]): Promise<Map<string, string>> {
  const ok = new Map<string, string>();
  if (!ids.length) return ok;
  const inList = `id=in.(${ids.map(encodeURIComponent).join(",")})`;

  if (table === "messages") {
    const msgs = await rest<any>(`messages?${inList}&select=id,conversation_id`);
    const convIds = [...new Set(msgs.map((m: any) => m.conversation_id).filter(Boolean))];
    if (!convIds.length) return ok;
    const convs = await rest<any>(`conversations?id=in.(${convIds.map(encodeURIComponent).join(",")})&select=id,participant_a_id,participant_b_id,coach_id,client_id,company_id,org_id`);
    const mine = new Map<string, string>();
    for (const c of convs) {
      if ([c.participant_a_id, c.participant_b_id, c.coach_id, c.client_id].includes(me.id)) {
        mine.set(c.id, c.company_id || c.org_id || me.company_id || "");
      }
    }
    for (const m of msgs) if (mine.has(m.conversation_id)) ok.set(m.id, mine.get(m.conversation_id)!);
    return ok;
  }

  if (table === "community_messages") {
    const msgs = await rest<any>(`community_messages?${inList}&select=id,community_id`);
    const comIds = [...new Set(msgs.map((m: any) => m.community_id).filter(Boolean))];
    if (!comIds.length) return ok;
    const comList = comIds.map(encodeURIComponent).join(",");
    const [coms, memberships] = await Promise.all([
      rest<any>(`communities?id=in.(${comList})&select=id,company_id`),
      rest<any>(`community_members?community_id=in.(${comList})&user_id=eq.${encodeURIComponent(me.id)}&select=community_id`),
    ]);
    const memberOf = new Set(memberships.map((m: any) => m.community_id));
    const allowed = new Map<string, string>();
    for (const c of coms) {
      const orgStaff = me.company_id === c.company_id && STAFF_ROLES.includes(me.role);
      if (memberOf.has(c.id) || orgStaff) allowed.set(c.id, c.company_id);
    }
    for (const m of msgs) if (allowed.has(m.community_id)) ok.set(m.id, allowed.get(m.community_id)!);
    return ok;
  }

  if (table === "team_messages") {
    if (me.role === "client") return ok;
    const msgs = await rest<any>(`team_messages?${inList}&select=id,org_id,is_dm,sender_id,dm_to_id`);
    for (const m of msgs) {
      if (m.org_id !== me.company_id) continue;
      if (m.is_dm && m.sender_id !== me.id && m.dm_to_id !== me.id) continue; // DMs stay private
      ok.set(m.id, m.org_id);
    }
    return ok;
  }
  return ok;
}

type RxMap = Record<string, Array<{ id: string; n: string }>>;

// Aggregate all per-user rows for these message ids → { msgId: { emoji: [{id,n}] } }
async function readReactions(messageIds: string[]): Promise<Record<string, RxMap>> {
  const out: Record<string, RxMap> = {};
  for (let i = 0; i < messageIds.length; i += 40) {
    const chunk = messageIds.slice(i, i + 40);
    const or = chunk.map((id) => `key.like.rx:${id}:*`).join(",");
    const rows = await rest<any>(`admin_settings?or=(${encodeURIComponent(or)})&select=key,value&limit=2000`);
    for (const r of rows) {
      const parts = String(r.key).split(":"); // rx : <msgId> : <userId>
      if (parts.length !== 3) continue;
      const [, msgId, userId] = parts;
      let v: any = null;
      try { v = JSON.parse(r.value); } catch { continue; }
      const emojis: string[] = Array.isArray(v?.e) ? v.e : [];
      const name = String(v?.n || "Someone").slice(0, 60);
      if (!emojis.length) continue;
      const map = (out[msgId] ||= {});
      for (const e of emojis) {
        if (typeof e !== "string" || e.length > 20) continue;
        (map[e] ||= []).push({ id: userId, n: name });
      }
    }
  }
  return out;
}

const router: IRouter = Router();

// GET /reactions?table=<table>&ids=<id,id,...> — reactions for messages the caller can see.
router.get("/reactions", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    const table = String(req.query.table || "");
    if (!TABLES.has(table)) { res.status(400).json({ error: "Bad table" }); return; }
    const ids = String(req.query.ids || "").split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)).slice(0, 120);
    if (!ids.length) { res.json({ ok: true, reactions: {} }); return; }
    const visible = await visibleMessages(me, table, ids);
    const reactions = await readReactions([...visible.keys()]);
    res.json({ ok: true, reactions });
  } catch (e) {
    logger.warn({ err: String(e) }, "[Reactions] read failed");
    res.status(500).json({ error: "Could not load reactions" });
  }
});

// POST /reactions/toggle {table, messageId, emoji} — add/remove my reaction.
// Only touches the caller's own row, so concurrent users never conflict.
router.post("/reactions/toggle", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    const { table, messageId, emoji } = (req.body || {}) as Record<string, any>;
    if (!TABLES.has(String(table)) || !UUID_RE.test(String(messageId)) || !validEmoji(emoji)) {
      res.status(400).json({ error: "Bad request" }); return;
    }
    const visible = await visibleMessages(me, String(table), [String(messageId)]);
    const orgId = visible.get(String(messageId));
    if (!orgId) { res.status(403).json({ error: "Not authorized" }); return; }

    const key = `rx:${messageId}:${me.id}`;
    const rows = await rest<any>(`admin_settings?company_id=eq.${orgId}&key=eq.${encodeURIComponent(key)}&select=value`);
    let mine: string[] = [];
    try { const v = rows[0] ? JSON.parse(rows[0].value) : null; if (Array.isArray(v?.e)) mine = v.e; } catch {}
    const idx = mine.indexOf(emoji);
    if (idx >= 0) mine.splice(idx, 1); else mine.push(emoji);
    if (mine.length > 25) { res.status(400).json({ error: "That's plenty of reactions for one message 🙂" }); return; }

    if (!mine.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${orgId}&key=eq.${encodeURIComponent(key)}`, { method: "DELETE", headers: SH });
    } else {
      const body = JSON.stringify({ company_id: orgId, key, value: JSON.stringify({ n: String(me.name || "Someone").slice(0, 60), e: mine }), updated_at: new Date().toISOString() });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
        method: "POST", headers: { ...SH, Prefer: "resolution=merge-duplicates" }, body,
      });
      if (!r.ok) { res.status(500).json({ error: "Could not save reaction" }); return; }
    }
    const all = await readReactions([String(messageId)]);
    res.json({ ok: true, reactions: all[String(messageId)] || {} });
  } catch (e) {
    logger.warn({ err: String(e) }, "[Reactions] toggle failed");
    res.status(500).json({ error: "Could not save reaction" });
  }
});

export default router;
