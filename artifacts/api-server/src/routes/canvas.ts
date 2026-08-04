// canvas.ts — shared collaborative "Canvas" documents (like Slack canvases)
// attached to communities and Team Hub DMs. Stored in admin_settings as
// key `canvas:<scope>` (no DDL possible on external Supabase).
//
// GET  /canvas/:scope  → { content, title, updated_by_name, updated_at }
// POST /canvas/:scope  → save { content, title? }
//
// Scopes:
//   community:<uuid>       — a community (Messages tab or Team Hub); caller must
//                            be a member of it, its creator, or an admin.
//   teamdm:<uuidA>_<uuidB> — a Team Hub 1:1 DM; caller must be one of the pair
//                            and staff (clients never reach the Team Hub).
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

// Returns the company_id to store under, or null if not allowed.
async function authorizeScope(caller: Caller, scope: string): Promise<string | null> {
  const isAdmin = caller.role === "super_admin" || caller.role === "company_admin";
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
  if (scope.startsWith("teamdm:")) {
    if (caller.role === "client") return null;
    const pair = scope.slice("teamdm:".length).split("_");
    if (pair.length !== 2 || !pair.every((u) => UUID_RE.test(u))) return null;
    if (!pair.includes(caller.id)) return null;
    return caller.companyId;
  }
  return null;
}

const validScope = (s: string) => /^(community|teamdm):[0-9a-f_-]{36,80}$/i.test(s);

const router: IRouter = Router();

router.get("/canvas/:scope", async (req: Request, res: Response) => {
  try {
    const scope = String(req.params["scope"] || "");
    if (!validScope(scope)) return res.status(400).json({ error: "bad scope" });
    const caller = await resolveCaller(req);
    if (!caller) return res.status(401).json({ error: "auth required" });
    const companyId = await authorizeScope(caller, scope);
    if (!companyId) return res.status(403).json({ error: "not a member" });
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(`canvas:${scope}`)}&select=value`,
      { headers: SVC_H },
    );
    const rows: any[] = r.ok ? await r.json().catch(() => []) : [];
    let doc: any = { content: "", title: "", updated_by_name: null, updated_at: null };
    if (rows[0]?.value) {
      try { doc = { ...doc, ...(typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value) }; } catch {}
    }
    return res.json(doc);
  } catch (e) {
    logger.error({ err: e }, "[Canvas] get error");
    return res.status(500).json({ error: "server error" });
  }
});

router.post("/canvas/:scope", async (req: Request, res: Response) => {
  try {
    const scope = String(req.params["scope"] || "");
    if (!validScope(scope)) return res.status(400).json({ error: "bad scope" });
    const caller = await resolveCaller(req);
    if (!caller) return res.status(401).json({ error: "auth required" });
    const companyId = await authorizeScope(caller, scope);
    if (!companyId) return res.status(403).json({ error: "not a member" });
    const content = String(req.body?.content ?? "");
    if (content.length > 200_000) return res.status(413).json({ error: "canvas too large" });
    const title = String(req.body?.title ?? "").slice(0, 120);
    const doc = {
      content,
      title,
      updated_by: caller.id,
      updated_by_name: caller.name,
      updated_at: new Date().toISOString(),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        company_id: companyId,
        key: `canvas:${scope}`,
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

export default router;
