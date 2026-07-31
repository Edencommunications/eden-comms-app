// checkinForm.ts — save/reset customizable check-in forms with scope
// ownership enforced server-side (service role key, bypasses RLS).
//
// Why a server route: admin_settings RLS is org-scoped only, so a coach
// could otherwise forge a REST write to the org-wide form or another
// coach's form. Here the caller's JWT is verified and:
//   • super_admin — may edit the org form and any coach's form in their org
//   • coach/head_coach — may edit ONLY their own form
import { Router, type IRouter, type Request, type Response } from "express";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function svcGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SH });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as any[];
}

// Verify the caller's Supabase JWT and load their staff profile.
async function requireStaff(req: Request): Promise<{ id: string; role: string; company_id: string } | null> {
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
  const rows = await svcGet(
    "user_profiles",
    `email=eq.${encodeURIComponent(email)}&role=in.(coach,head_coach,super_admin)&is_active=not.is.false&select=id,role,company_id`,
  );
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID };
}

// Authorize the requested scope. Returns the (companyId, key) to write, or null.
async function authorizeScope(
  caller: { id: string; role: string; company_id: string },
  coachId: string | null,
): Promise<{ companyId: string; key: string } | null> {
  if (!coachId) {
    // Org-wide form — admins only
    if (caller.role !== "super_admin") return null;
    return { companyId: caller.company_id, key: "checkin_form" };
  }
  if (caller.role === "super_admin") {
    // Admin may edit any coach in their own org
    const rows = await svcGet("user_profiles", `id=eq.${encodeURIComponent(coachId)}&select=id,company_id`);
    if (!rows[0]) return null;
    if ((rows[0].company_id || EDEN_ORG_ID) !== caller.company_id) return null;
    return { companyId: caller.company_id, key: `checkin_form:${coachId}` };
  }
  // Coach — own form only
  if (coachId !== caller.id) return null;
  return { companyId: caller.company_id, key: `checkin_form:${caller.id}` };
}

const ALLOWED_TYPES = new Set(["number", "scale", "text"]);
function sanitizeForm(raw: any): { off: string[]; custom: any[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const off = Array.isArray(raw.off) ? raw.off.filter((k: any) => typeof k === "string").slice(0, 50) : [];
  const custom = Array.isArray(raw.custom)
    ? raw.custom
        .filter((c: any) => c && typeof c.label === "string" && c.label.trim())
        .slice(0, 30)
        .map((c: any) => ({
          id: String(c.id || Date.now()),
          label: String(c.label).trim().slice(0, 120),
          type: ALLOWED_TYPES.has(c.type) ? c.type : "text",
        }))
    : [];
  return { off, custom };
}

const router: IRouter = Router();

// Save (create/update) a form at a scope. Body: { coachId: string|null, form: {off,custom} }
router.post("/checkin-form/save", async (req: Request, res: Response) => {
  try {
    if (!SERVICE_KEY) { res.status(500).json({ error: "Service not configured" }); return; }
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const coachId = req.body?.coachId ? String(req.body.coachId) : null;
    const scope = await authorizeScope(caller, coachId);
    if (!scope) { res.status(403).json({ error: "You can only edit your own check-in form" }); return; }
    const form = sanitizeForm(req.body?.form);
    if (!form) { res.status(400).json({ error: "Invalid form" }); return; }
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        company_id: scope.companyId,
        key: scope.key,
        value: JSON.stringify(form),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) { res.status(502).json({ error: "Save failed" }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Save failed" });
  }
});

// Remove a scope's customization (coach inherits org form again; org resets to standard).
router.post("/checkin-form/reset", async (req: Request, res: Response) => {
  try {
    if (!SERVICE_KEY) { res.status(500).json({ error: "Service not configured" }); return; }
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const coachId = req.body?.coachId ? String(req.body.coachId) : null;
    const scope = await authorizeScope(caller, coachId);
    if (!scope) { res.status(403).json({ error: "You can only reset your own check-in form" }); return; }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${scope.companyId}&key=eq.${encodeURIComponent(scope.key)}`,
      { method: "DELETE", headers: SH },
    );
    if (!r.ok) { res.status(502).json({ error: "Reset failed" }); return; }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
