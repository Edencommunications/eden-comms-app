// canvas.ts — shared collaborative "Canvas" documents (like Slack canvases)
// attached to communities, the Team Hub #general channel, and Team Hub DMs.
// Each conversation can have MANY canvases. Stored in admin_settings as
// key `canvas:<scope>:<canvasId>` (legacy single canvas lives at `canvas:<scope>`
// and is surfaced with id "main"). No DDL possible on external Supabase.
//
// GET    /canvas/:scope            → { canvases: [{id,title,updated_by_name,updated_at,created_by,created_by_name}] }
// GET    /canvas/:scope/:id        → full doc { content, title, ... }
// POST   /canvas/:scope/:id        → save { content, title? } (creates on first save)
// DELETE /canvas/:scope/:id        → creator or admin only
//
// Scopes:
//   community:<uuid>       — member of it, its creator, or an admin.
//   teamgeneral:<orgUuid>  — any staff member of that org.
//   teamdm:<uuidA>_<uuidB> — one of the pair, staff only.
// Identity always derives from the caller's JWT; writes use the service key
// because RLS on admin_settings is staff/org scoped.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
const SVC_H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANVAS_ID_RE = /^(main|[0-9a-f-]{8,36})$/i;

type Caller = { id: string; name: string; role: string; companyId: string | null };

async function resolveCaller(req: Request): Promise<Caller | null> {
  const auth = String(req.get("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON) return null;
  const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!ur.ok) return null;
  const user: any = await ur.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role,company_id`,
    { headers: SVC_H },
  );
  const rows: any[] = pr.ok ? await pr.json().catch(() => []) : [];
  const p = rows[0];
  if (!p) return null;
  return { id: p.id, name: p.name || p.full_name || email, role: p.role || "client", companyId: p.company_id || null };
}

const isAdminRole = (r: string) => r === "super_admin" || r === "company_admin";

// Returns the company_id to store under, or null if not allowed.
async function authorizeScope(caller: Caller, scope: string): Promise<string | null> {
  const isAdmin = isAdminRole(caller.role);
  if (scope.startsWith("community:")) {
    const cid = scope.slice("community:".length);
    if (!UUID_RE.test(cid)) return null;
    const cr = await fetch(
      `${SUPABASE_URL}/rest/v1/communities?id=eq.${cid}&select=id,company_id,created_by`,
      { headers: SVC_H },
    );
    const comm = ((cr.ok ? await cr.json().catch(() => []) : []) as any[])[0];
    if (!comm) return null;
    if (isAdmin || comm.created_by === caller.id) return comm.company_id;
    const mr = await fetch(
      `${SUPABASE_URL}/rest/v1/community_members?community_id=eq.${cid}&user_id=eq.${caller.id}&select=id&limit=1`,
      { headers: SVC_H },
    );
    const mem = (mr.ok ? await mr.json().catch(() => []) : []) as any[];
    return mem.length ? comm.company_id : null;
  }
  if (scope.startsWith("teamgeneral:")) {
    // The org-wide #general Team Hub channel — any staff member of that org.
    if (caller.role === "client") return null;
    const oid = scope.slice("teamgeneral:".length);
    if (!UUID_RE.test(oid) || caller.companyId !== oid) return null;
    return oid;
  }
  if (scope.startsWith("teamdm:")) {
    if (caller.role === "client") return null;
    const pair = scope.slice("teamdm:".length).split("_");
    if (pair.length !== 2 || !pair.every((u) => UUID_RE.test(u))) return null;
    if (!pair.includes(caller.id)) return null;
    return caller.companyId;
  }
  return null;
}

const validScope = (s: string) => /^(community|teamdm|teamgeneral):[0-9a-f_-]{36,80}$/i.test(s);
const keyFor = (scope: string, id: string) => (id === "main" ? `canvas:${scope}` : `canvas:${scope}:${id}`);

function parseDoc(value: any): any {
  const base = { content: "", title: "", updated_by_name: null, updated_at: null, created_by: null, created_by_name: null };
  if (!value) return base;
  try { return { ...base, ...(typeof value === "string" ? JSON.parse(value) : value) }; } catch { return base; }
}

async function fetchDoc(companyId: string, scope: string, id: string): Promise<any | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(keyFor(scope, id))}&select=value`,
    { headers: SVC_H },
  );
  const rows: any[] = r.ok ? await r.json().catch(() => []) : [];
  return rows.length ? parseDoc(rows[0].value) : null;
}

// Common guard: validate scope + id, auth, membership. Returns null after responding on failure.
async function guard(req: Request, res: Response, needId: boolean): Promise<{ caller: Caller; companyId: string; scope: string; id: string } | null> {
  const scope = String(req.params["scope"] || "");
  const id = String(req.params["id"] || "");
  if (!validScope(scope) || (needId && !CANVAS_ID_RE.test(id))) { res.status(400).json({ error: "bad scope" }); return null; }
  const caller = await resolveCaller(req);
  if (!caller) { res.status(401).json({ error: "auth required" }); return null; }
  const companyId = await authorizeScope(caller, scope);
  if (!companyId) { res.status(403).json({ error: "not a member" }); return null; }
  return { caller, companyId, scope, id };
}

const router: IRouter = Router();

// List all canvases for a conversation (content stripped — it can be huge).
router.get("/canvas/:scope", async (req: Request, res: Response) => {
  try {
    const g = await guard(req, res, false);
    if (!g) return;
    const prefix = `canvas:${g.scope}`;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${g.companyId}&key=like.${encodeURIComponent(prefix + "*")}&select=key,value`,
      { headers: SVC_H },
    );
    const rows: any[] = r.ok ? await r.json().catch(() => []) : [];
    const canvases = rows
      .filter((row) => row.key === prefix || String(row.key).startsWith(prefix + ":"))
      .map((row) => {
        const doc = parseDoc(row.value);
        const id = row.key === prefix ? "main" : String(row.key).slice(prefix.length + 1);
        return {
          id, title: doc.title || "", updated_by_name: doc.updated_by_name, updated_at: doc.updated_at,
          created_by: doc.created_by, created_by_name: doc.created_by_name,
        };
      })
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    return res.json({ canvases });
  } catch (e) {
    logger.error({ err: e }, "[Canvas] list error");
    return res.status(500).json({ error: "server error" });
  }
});

// Open one canvas.
router.get("/canvas/:scope/:id", async (req: Request, res: Response) => {
  try {
    const g = await guard(req, res, true);
    if (!g) return;
    const doc = await fetchDoc(g.companyId, g.scope, g.id);
    return res.json(doc || { content: "", title: "", updated_by_name: null, updated_at: null, created_by: null, created_by_name: null });
  } catch (e) {
    logger.error({ err: e }, "[Canvas] get error");
    return res.status(500).json({ error: "server error" });
  }
});

// Save (creates the canvas on first save). No character limit beyond the
// server's 25 MB request cap.
router.post("/canvas/:scope/:id", async (req: Request, res: Response) => {
  try {
    const g = await guard(req, res, true);
    if (!g) return;
    const existing = await fetchDoc(g.companyId, g.scope, g.id);
    const content = String(req.body?.content ?? "");
    const title = String(req.body?.title ?? "").slice(0, 200);
    const doc = {
      content,
      title,
      created_by: existing?.created_by || g.caller.id,
      created_by_name: existing?.created_by_name || g.caller.name,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_by: g.caller.id,
      updated_by_name: g.caller.name,
      updated_at: new Date().toISOString(),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        company_id: g.companyId,
        key: keyFor(g.scope, g.id),
        value: JSON.stringify(doc),
        updated_at: doc.updated_at,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      logger.error({ status: r.status, body }, "[Canvas] save failed");
      return res.status(502).json({ error: "save failed" });
    }
    return res.json({ ok: true, updated_by_name: doc.updated_by_name, updated_at: doc.updated_at });
  } catch (e) {
    logger.error({ err: e }, "[Canvas] save error");
    return res.status(500).json({ error: "server error" });
  }
});

// Delete — only the canvas creator or an admin.
router.delete("/canvas/:scope/:id", async (req: Request, res: Response) => {
  try {
    const g = await guard(req, res, true);
    if (!g) return;
    const existing = await fetchDoc(g.companyId, g.scope, g.id);
    if (!existing) return res.status(404).json({ error: "not found" });
    const mayDelete = isAdminRole(g.caller.role) || existing.created_by === g.caller.id ||
      // legacy canvases predate created_by — let admins-or-anyone-with-access clean those up only if admin
      (!existing.created_by && isAdminRole(g.caller.role));
    if (!mayDelete) return res.status(403).json({ error: "only the creator or an admin can delete this canvas" });
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${g.companyId}&key=eq.${encodeURIComponent(keyFor(g.scope, g.id))}`,
      { method: "DELETE", headers: SVC_H },
    );
    if (!r.ok) return res.status(502).json({ error: "delete failed" });
    return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "[Canvas] delete error");
    return res.status(500).json({ error: "server error" });
  }
});

export default router;
