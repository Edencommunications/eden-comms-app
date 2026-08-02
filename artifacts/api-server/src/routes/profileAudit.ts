// profileAudit.ts — safety net: every Supabase Auth login must have a
// matching user_profiles row, or RLS silently rejects all of their writes
// (reads work, saves match 0 rows — the "edits not saving" mystery).
//
// GET  /profile-audit      (super_admin) → list logins missing a profile row
// POST /profile-audit/fix  (super_admin) → create the missing profile row
//   body: { email, role, company_id?, name? }
//   White-label safe: a non-Eden super_admin can only create profiles in
//   their OWN org; Eden super_admins may pass any company_id.
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { requireStaff } from "./checkinForm";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const ALLOWED_ROLES = ["client", "coach", "head_coach", "super_admin"];

async function listMissing(): Promise<{ email: string; created_at: string }[]> {
  // All auth users (paged, cap 1000)
  const users: any[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: SH });
    if (!r.ok) break;
    const batch = ((await r.json().catch(() => ({}))) as any)?.users || [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=email&limit=2000`, { headers: SH });
  const profiles = (pr.ok ? ((await pr.json().catch(() => [])) as any[]) : []);
  const have = new Set(profiles.map((p) => String(p.email || "").toLowerCase()));
  return users
    .filter((u) => u.email && !have.has(String(u.email).toLowerCase()))
    .map((u) => ({ email: u.email, created_at: u.created_at }));
}

const router: IRouter = Router();

router.get("/profile-audit", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin") { res.status(401).json({ error: "Not authorized" }); return; }
    const missing = await listMissing();
    res.json({ missing });
  } catch {
    res.status(500).json({ error: "Audit failed — please try again." });
  }
});

router.post("/profile-audit/fix", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin") { res.status(401).json({ error: "Not authorized" }); return; }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const role = String(req.body?.role || "").trim();
    const name = String(req.body?.name || "").trim() || email.split("@")[0];
    let companyId = String(req.body?.company_id || "").trim() || caller.company_id;
    if (!email || !ALLOWED_ROLES.includes(role)) {
      res.status(400).json({ error: "Provide a valid email and role." });
      return;
    }
    // Non-Eden admins can only create profiles inside their own org
    if (caller.company_id !== EDEN_ORG_ID) companyId = caller.company_id;

    // Must actually be a login that's missing a profile (no free-form inserts)
    const missing = await listMissing();
    if (!missing.some((m) => m.email.toLowerCase() === email)) {
      res.status(400).json({ error: "That login already has a profile (or doesn't exist)." });
      return;
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: "POST",
      headers: { ...SH, Prefer: "return=representation" },
      body: JSON.stringify({
        id: randomUUID(), // user_profiles.id has no default — must supply
        email, name, role, company_id: companyId, is_active: true,
      }),
    });
    const rows = (await r.json().catch(() => null)) as any;
    if (!r.ok || !Array.isArray(rows) || !rows.length) {
      res.status(500).json({ error: "Could not create the profile — please try again." });
      return;
    }
    res.json({ ok: true, profile: rows[0] });
  } catch {
    res.status(500).json({ error: "Fix failed — please try again." });
  }
});

export default router;
