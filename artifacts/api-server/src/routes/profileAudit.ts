// profileAudit.ts — safety net: every Supabase Auth login must have a
// matching user_profiles row, or RLS silently rejects all of their writes
// (reads work, saves match 0 rows — the "edits not saving" mystery).
//
// Attribution: when the app creates a login it stamps company_id and
// intended_role into the auth user's metadata (see auth.ts / bulkImport /
// ghlIntake). That lets us scope this audit per company:
//   • A white-label super_admin sees ONLY orphans stamped with their org.
//   • Eden's super_admin sees their own org's orphans PLUS any unstamped
//     ones (legacy/manually-created logins that can't be attributed).
//
// GET  /profile-audit      (super_admin) → list logins missing a profile row
// POST /profile-audit/fix  (super_admin) → create the missing profile row
//   body: { email, role?, company_id? } — defaults come from the stamp.
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

type Orphan = {
  email: string;
  created_at: string;
  name: string | null;
  company_id: string | null;    // from the metadata stamp (null = unknown)
  intended_role: string | null; // from the metadata stamp (null = unknown)
};

async function listMissing(): Promise<Orphan[]> {
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
    .map((u) => {
      const meta = u.user_metadata || {};
      const role = String(meta.intended_role || "");
      return {
        email: u.email,
        created_at: u.created_at,
        name: meta.name ? String(meta.name) : null,
        company_id: meta.company_id ? String(meta.company_id) : null,
        intended_role: ALLOWED_ROLES.includes(role) ? role : null,
      };
    });
}

// Which orphans is this admin allowed to see/fix?
function visibleTo(caller: { company_id: string }, o: Orphan): boolean {
  if (o.company_id === caller.company_id) return true;
  // Unattributed orphans (legacy/manual logins) go to the platform owner only
  return o.company_id === null && caller.company_id === EDEN_ORG_ID;
}

const router: IRouter = Router();

router.get("/profile-audit", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin") { res.status(401).json({ error: "Not authorized" }); return; }
    const missing = (await listMissing()).filter((o) => visibleTo(caller, o));
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
    if (!email) { res.status(400).json({ error: "Provide a valid email." }); return; }

    // Must actually be an orphaned login this admin is allowed to fix
    const orphan = (await listMissing()).find((m) => m.email.toLowerCase() === email);
    if (!orphan || !visibleTo(caller, orphan)) {
      res.status(400).json({ error: "That login already has a profile (or isn't in your organization)." });
      return;
    }

    // Role: explicit choice wins, then the stamp, then client
    const role = String(req.body?.role || orphan.intended_role || "client").trim();
    if (!ALLOWED_ROLES.includes(role)) { res.status(400).json({ error: "Provide a valid role." }); return; }

    // Company: the stamp wins when present; otherwise the caller's choice
    // (Eden only — unstamped orphans are Eden-visible only), else caller's org.
    let companyId = orphan.company_id || String(req.body?.company_id || "").trim() || caller.company_id;
    // A non-Eden admin can never create outside their own org
    if (caller.company_id !== EDEN_ORG_ID) companyId = caller.company_id;

    const name = String(req.body?.name || orphan.name || "").trim() || email.split("@")[0];

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
