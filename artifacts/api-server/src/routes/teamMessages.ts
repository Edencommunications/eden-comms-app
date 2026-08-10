// teamMessages.ts — server-side reads for Team Hub chat (#general + DMs).
//
// WHY THIS EXISTS: deleted messages are soft-deleted (deleted_at/deleted_by)
// and their original content must only ever be visible to admins. RLS cannot
// redact columns, so the frontend must NOT read team_messages directly —
// it calls GET /team/messages here, and the server strips deleted content
// for non-admin callers before it ever leaves the backend. It also filters
// DM rows to conversations the caller participates in.
//
// GET /team/messages            → { messages: [...] } newest-first, limit 500
// GET /team/messages?ids=a,b,c  → { messages: [...] } specific rows (thread-parent backfill)
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Caller = { id: string; role: string; company_id: string | null };

const isAdminRole = (r: string) => r === "super_admin" || r === "company_admin";

async function requireStaff(req: Request): Promise<Caller | null> {
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
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`,
    { headers: SH },
  );
  const rows: any[] = pr.ok ? ((await pr.json().catch(() => [])) as any[]) : [];
  const me = rows[0];
  if (!me || me.role === "client" || !me.company_id) return null;
  return me;
}

// Pure, unit-tested core: given raw team_messages rows and the caller,
// (a) drop DM rows the caller is not part of, and
// (b) blank the content of soft-deleted rows unless the caller is an admin.
// Deletion metadata (deleted_at, deleted_by_name) survives so the client
// can render the placeholder bubble.
export function redactTeamMessages(rows: any[], caller: { id: string; role: string }): any[] {
  const admin = isAdminRole(caller.role);
  const out: any[] = [];
  for (const r of rows || []) {
    if (r.is_dm && r.sender_id !== caller.id && r.dm_to_id !== caller.id) continue;
    if (r.deleted_at && !admin) {
      out.push({ ...r, content: "" });
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

const router: IRouter = Router();

router.get("/team/messages", async (req: Request, res: Response) => {
  try {
    const me = await requireStaff(req);
    if (!me) { res.status(401).json({ error: "auth required" }); return; }

    let query: string;
    const idsRaw = String(req.query.ids || "").trim();
    if (idsRaw) {
      const ids = idsRaw.split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s));
      if (!ids.length) { res.json({ messages: [] }); return; }
      query = `team_messages?org_id=eq.${me.company_id}&id=in.(${ids.join(",")})&select=*`;
    } else {
      query = `team_messages?org_id=eq.${me.company_id}&order=created_at.desc&limit=500&select=*`;
    }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, { headers: SH });
    if (!r.ok) { res.status(502).json({ error: "upstream read failed" }); return; }
    const rows: any[] = ((await r.json().catch(() => [])) as any[]) || [];
    res.json({ messages: redactTeamMessages(rows, me) });
  } catch (e) {
    logger.error({ err: e }, "team/messages read failed");
    res.status(500).json({ error: "internal error" });
  }
});

// POST /team/messages/:id/delete — soft-delete a Team Hub message.
// Goes through the server because the RLS SELECT policy hides deleted rows,
// which makes a direct PostgREST PATCH fail its RETURNING check.
// Rules: admins delete anything in their org; everyone else only their own.
router.post("/team/messages/:id/delete", async (req: Request, res: Response) => {
  try {
    const me = await requireStaff(req);
    if (!me) { res.status(401).json({ error: "auth required" }); return; }
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) { res.status(400).json({ error: "bad id" }); return; }

    const rr = await fetch(`${SUPABASE_URL}/rest/v1/team_messages?id=eq.${id}&select=*`, { headers: SH });
    const row: any = rr.ok ? (((await rr.json().catch(() => [])) as any[])[0] ?? null) : null;
    if (!row || row.org_id !== me.company_id) { res.status(404).json({ error: "not found" }); return; }
    if (row.deleted_at) { res.json({ ok: true }); return; } // already deleted — idempotent
    if (!isAdminRole(me.role) && row.sender_id !== me.id) {
      res.status(403).json({ error: "you can only delete your own messages" });
      return;
    }

    // Caller identity comes from the verified JWT, never the request body.
    const nr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${me.id}&select=name,full_name`,
      { headers: SH },
    );
    const np: any = nr.ok ? (((await nr.json().catch(() => [])) as any[])[0] ?? {}) : {};
    const myName = np.name || np.full_name || "staff";

    const ur = await fetch(`${SUPABASE_URL}/rest/v1/team_messages?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...SH, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ deleted_at: new Date().toISOString(), deleted_by: me.id, deleted_by_name: myName }),
    });
    if (!ur.ok) { res.status(502).json({ error: "delete failed" }); return; }

    // Audit trail keeps the full original content (admin-only surface).
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SH, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        action: "message_deleted", actor_id: me.id, actor_name: myName, actor_role: me.role,
        target_type: "team_message", target_id: id,
        details: { content: row.content, sender_id: row.sender_id, sender_name: row.sender_name, sent_at: row.created_at || null, context: "team_hub", org_id: row.org_id },
      }),
    }).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "team/messages delete failed");
    res.status(500).json({ error: "internal error" });
  }
});

export default router;
