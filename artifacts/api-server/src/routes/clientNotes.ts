// clientNotes.ts — client-only endpoints for saving the client's own notes
// on their supplement protocol and prescription list.
//
// Client notes live in SEPARATE admin_settings rows from the coach plan:
//   supp_client_notes:<clientId>  — client's supplement experience notes
//   rx_client_notes:<clientId>    — client's prescription notes
//
// Keeping these separate from supp_plan:<id> and rx_plan:<id> means:
//   • no read-modify-write — the rows are fully owned by the client;
//   • coach saves never overwrite client notes and vice versa;
//   • RLS blocks direct client writes to admin_settings (is_staff() policy),
//     so the server holds the service key and writes on the client's behalf
//     after verifying the token belongs to the target client.
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

// ── Pure helpers (exported for unit tests) ─────────────────────

/** Clamp and coerce raw input to a safe note string. */
export function validateNote(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, 5000) : "";
}

/** admin_settings key for a client's supplement experience notes. */
export function buildSuppNoteKey(clientId: string): string {
  return `supp_client_notes:${clientId}`;
}

/** admin_settings key for a client's prescription notes. */
export function buildRxNoteKey(clientId: string): string {
  return `rx_client_notes:${clientId}`;
}

// ── Auth ───────────────────────────────────────────────────────

export type Profile = { id: string; role: string; company_id: string };

export async function requireClient(req: Request): Promise<Profile | null> {
  const auth = String(req.get("authorization") || "");
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === SUPABASE_ANON) return null;
  const userR = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
  });
  if (!userR.ok) return null;
  const user: any = await userR.json().catch(() => null);
  const email = String(user?.email || "").toLowerCase();
  if (!email) return null;
  const profR = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id`,
    { headers: SH },
  );
  const rows: any[] = profR.ok ? ((await profR.json().catch(() => [])) as any[]) : [];
  if (!rows[0]) return null;
  return { id: rows[0].id, role: rows[0].role, company_id: rows[0].company_id || EDEN_ORG_ID };
}

// ── Service-key upsert ─────────────────────────────────────────

export async function upsertNote(companyId: string, key: string, notes: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`,
    {
      method: "POST",
      headers: { ...SH, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        company_id: companyId,
        key,
        value: JSON.stringify({ notes }),
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return r.ok;
}

// ── Testable core handlers ─────────────────────────────────────
// Exported so tests can exercise auth/ownership logic without needing
// an HTTP server (no supertest dependency).

export type HandlerResult = { status: number; body: Record<string, unknown> };

export async function processSuppNotesSave(
  caller: Profile | null,
  rawNotes: unknown,
): Promise<HandlerResult> {
  if (!caller) return { status: 401, body: { error: "Not authorized" } };
  if (caller.role !== "client") {
    return { status: 403, body: { error: "Only clients can update their own supplement notes." } };
  }
  const notes = validateNote(rawNotes);
  const ok = await upsertNote(caller.company_id, buildSuppNoteKey(caller.id), notes);
  if (!ok) return { status: 500, body: { error: "Could not save notes" } };
  return { status: 200, body: { ok: true } };
}

export async function processRxNotesSave(
  caller: Profile | null,
  rawNotes: unknown,
): Promise<HandlerResult> {
  if (!caller) return { status: 401, body: { error: "Not authorized" } };
  if (caller.role !== "client") {
    return { status: 403, body: { error: "Only clients can update their own prescription notes." } };
  }
  const notes = validateNote(rawNotes);
  const ok = await upsertNote(caller.company_id, buildRxNoteKey(caller.id), notes);
  if (!ok) return { status: 500, body: { error: "Could not save notes" } };
  return { status: 200, body: { ok: true } };
}

// ── Routes ─────────────────────────────────────────────────────

const router: IRouter = Router();

// PATCH /supp/client-notes   body: { clientNotes: string }
router.patch("/supp/client-notes", async (req: Request, res: Response) => {
  try {
    const caller = await requireClient(req);
    const result = await processSuppNotesSave(caller, req.body?.clientNotes);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[clientNotes] supp error", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /rx/client-notes   body: { clientNotes: string }
router.patch("/rx/client-notes", async (req: Request, res: Response) => {
  try {
    const caller = await requireClient(req);
    const result = await processRxNotesSave(caller, req.body?.clientNotes);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[clientNotes] rx error", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
