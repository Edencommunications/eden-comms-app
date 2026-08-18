// staffMeta.ts — admin-only writes of a staff member's title + tab access.
//
// A staff member's tabs (Team Hub / Messages / My Clients / Learn / Connect),
// custom title, and "whose Connect links they see" live in an admin_settings
// row keyed `staff_meta:<profileId>`. The org-scoped RLS write policy on
// admin_settings cannot express "admins only for these keys", so a staff
// member could otherwise rewrite their OWN row and grant themselves extra
// tabs. Writes therefore go through this endpoint only (same pattern as the
// check-in forms routes): the caller's JWT is verified server-side and must
// belong to an active super_admin; the row is written with the service key.
//
// POST /staff/meta
//   Body: { profileId, label?, tabs?: string[], connect_coach?: string|null }
//   • target profile must exist, be in the admin's own org
//   • tabs are filtered to the canonical set (default ['team'])
//   • connect_coach must be a real, active coach/head_coach in the SAME org
//     (never trust a raw UUID from the client — cross-org link leakage)

import { Router, type IRouter, type Request, type Response } from "express";
import { requireAdminJwt } from "./auth";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ALLOWED_TABS = ["home", "msgs", "team", "learn", "community"] as const;

export type StaffMetaRow = { label: string | null; tabs: string[]; connect_coach: string | null };

/** Normalize the requested tab list to the canonical set; empty → ['team']. */
export function sanitizeTabs(raw: any): string[] {
  const tabs = Array.isArray(raw)
    ? raw.filter((t: any) => (ALLOWED_TABS as readonly string[]).includes(t))
    : [];
  // de-dupe, preserve canonical order
  const set = new Set(tabs);
  const out = (ALLOWED_TABS as readonly string[]).filter((t) => set.has(t));
  return out.length ? out : ["team"];
}

async function svcGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SH });
  if (!r.ok) return [];
  return (await r.json().catch(() => [])) as any[];
}

/** Validate connect_coach: must be an active coach/head_coach in companyId. */
export async function validateConnectCoach(raw: any, companyId: string): Promise<string | null> {
  if (typeof raw !== "string" || !UUID_RE.test(raw)) return null;
  const rows = await svcGet(
    "user_profiles",
    `id=eq.${encodeURIComponent(raw)}&company_id=eq.${encodeURIComponent(companyId)}&role=in.(coach,head_coach)&is_active=not.is.false&select=id&limit=1`,
  );
  return rows.length ? raw : null;
}

const router: IRouter = Router();

router.post("/staff/meta", async (req: Request, res: Response) => {
  try {
    if (!SERVICE_KEY) { res.status(503).json({ ok: false, error: "Service not configured" }); return; }
    const admin = await requireAdminJwt(req);
    if (!admin) { res.status(403).json({ ok: false, error: "Not authorized" }); return; }
    const companyId = admin.company_id || EDEN_ORG_ID;

    const b = (req.body || {}) as Record<string, any>;
    const profileId = String(b.profileId || "").trim();
    if (!UUID_RE.test(profileId)) { res.status(400).json({ ok: false, error: "Valid profileId required" }); return; }

    // Target must be a profile inside the admin's own org — an admin can
    // never rewrite another org's staff access.
    const target = await svcGet(
      "user_profiles",
      `id=eq.${encodeURIComponent(profileId)}&select=id,company_id&limit=1`,
    );
    if (!target[0] || (target[0].company_id || EDEN_ORG_ID) !== companyId) {
      res.status(403).json({ ok: false, error: "You can only edit staff in your own organization" });
      return;
    }

    const tabs = sanitizeTabs(b.tabs);
    const connectCoach = tabs.includes("community")
      ? await validateConnectCoach(b.connect_coach, companyId)
      : null;
    const label = typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 80) : null;
    const meta: StaffMetaRow = { label, tabs, connect_coach: connectCoach };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        company_id: companyId,
        key: `staff_meta:${profileId}`,
        value: JSON.stringify(meta),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      logger.error({ status: r.status, body: t }, "[StaffMeta] upsert failed");
      res.status(502).json({ ok: false, error: "Save failed" });
      return;
    }
    logger.info({ adminId: admin.id, profileId, tabs: meta.tabs }, "[StaffMeta] staff access updated");
    res.json({ ok: true, meta });
  } catch {
    res.status(500).json({ ok: false, error: "Save failed" });
  }
});

export default router;
