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

export type Profile = { id: string; role: string; company_id: string; name?: string };

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
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id,name,full_name`,
    { headers: SH },
  );
  const rows: any[] = profR.ok ? ((await profR.json().catch(() => [])) as any[]) : [];
  if (!rows[0]) return null;
  return {
    id: rows[0].id, role: rows[0].role,
    company_id: rows[0].company_id || EDEN_ORG_ID,
    name: String(rows[0].full_name || rows[0].name || "").trim(),
  };
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

// ── Dated note threads ─────────────────────────────────────────
// New format stored in the same admin_settings keys:
//   { entries: [{ id, author_id, author_name, role, text, at }] }
// Legacy format { notes: "..." } is migrated on read into a single
// client-authored entry dated by the row's updated_at.

export type NoteEntry = {
  id: string;
  author_id: string;
  author_name: string;
  role: "client" | "coach";
  text: string;
  at: string; // ISO timestamp
};

const MAX_ENTRIES = 200;

export function parseThread(rawValue: unknown, rowUpdatedAt?: string | null): NoteEntry[] {
  try {
    const v = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
    if (v && Array.isArray(v.entries)) {
      return v.entries
        .filter((e: any) => e && typeof e.text === "string" && e.text.trim())
        .slice(-MAX_ENTRIES)
        .map((e: any) => ({
          id: String(e.id || Math.random().toString(36).slice(2)),
          author_id: String(e.author_id || ""),
          author_name: String(e.author_name || ""),
          role: e.role === "coach" ? "coach" : "client",
          text: String(e.text).slice(0, 5000),
          at: String(e.at || new Date().toISOString()),
        }));
    }
    // Legacy single-notepad format
    if (v && typeof v.notes === "string" && v.notes.trim()) {
      return [{
        id: "legacy",
        author_id: "",
        author_name: "",
        role: "client",
        text: v.notes.slice(0, 5000),
        at: rowUpdatedAt || new Date().toISOString(),
      }];
    }
  } catch { /* fall through */ }
  return [];
}

export function threadKey(kind: "supp" | "rx", clientId: string): string {
  return kind === "rx" ? buildRxNoteKey(clientId) : buildSuppNoteKey(clientId);
}

type ThreadRow = { entries: NoteEntry[]; updatedAt: string | null; exists: boolean };

async function loadThread(companyId: string, key: string): Promise<ThreadRow> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}&select=value,updated_at`,
    { headers: SH },
  );
  const rows = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
  if (!rows[0]) return { entries: [], updatedAt: null, exists: false };
  return { entries: parseThread(rows[0].value, rows[0].updated_at), updatedAt: rows[0].updated_at || null, exists: true };
}

/**
 * Very old Rx notes were embedded in the coach's rx_plan row as `rxNotes`.
 * Surface that as a dated legacy entry so it never disappears once the
 * thread gains new entries.
 */
export async function fetchLegacyRxEntry(companyId: string, clientId: string): Promise<NoteEntry | null> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent("rx_plan:" + clientId)}&select=value,updated_at`,
    { headers: SH },
  );
  const rows = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
  if (!rows[0]) return null;
  try {
    const v = JSON.parse(rows[0].value);
    if (typeof v?.rxNotes === "string" && v.rxNotes.trim()) {
      return {
        id: "legacy-rxplan", author_id: clientId, author_name: "",
        role: "client", text: v.rxNotes.slice(0, 5000),
        at: rows[0].updated_at || new Date().toISOString(),
      };
    }
  } catch { /* ignore */ }
  return null;
}

/** Append one entry with a small CAS-retry loop (concurrent saves keep both). */
export async function appendThreadEntry(
  companyId: string,
  key: string,
  entry: NoteEntry,
  seed?: NoteEntry[],
): Promise<NoteEntry[] | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await loadThread(companyId, key);
    // Dedupe: same author resubmitting identical text (legacy UI double-save)
    const last = cur.entries[cur.entries.length - 1];
    if (last && last.author_id === entry.author_id && last.text === entry.text) return cur.entries;
    // First-ever entry: fold in any legacy seed (old rx_plan.rxNotes) so it's
    // permanently part of the thread instead of vanishing behind new entries.
    const base = cur.entries.length ? cur.entries : (seed || []);
    const entries = [...base, entry].slice(-MAX_ENTRIES);
    const now = new Date().toISOString();
    const body = JSON.stringify({ value: JSON.stringify({ entries }), updated_at: now });
    if (cur.exists) {
      const guard = cur.updatedAt ? `&updated_at=eq.${encodeURIComponent(cur.updatedAt)}` : `&updated_at=is.null`;
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}${guard}`,
        { method: "PATCH", headers: { ...SH, Prefer: "return=representation" }, body },
      );
      const rows = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
      if (rows.length > 0) return entries;
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
        method: "POST",
        headers: { ...SH, Prefer: "return=minimal" },
        body: JSON.stringify({ company_id: companyId, key, value: JSON.stringify({ entries }), updated_at: now }),
      });
      if (r.ok) return entries;
    }
    // lost the race — re-read and try again
  }
  return null;
}

async function notifyOtherParty(
  caller: Profile & { name?: string },
  clientId: string,
  kind: "supp" | "rx",
  authorName: string,
): Promise<void> {
  try {
    let recipient: string | null = null;
    if (caller.role === "client") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${clientId}&select=coach_id`, { headers: SH });
      const rows = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
      recipient = rows[0]?.coach_id || null;
    } else {
      recipient = clientId;
    }
    if (!recipient || recipient === caller.id) return;
    const what = kind === "rx" ? "prescription" : "supplement";
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: { ...SH, Prefer: "return=minimal" },
      body: JSON.stringify({
        recipient_id: recipient,
        sender_id: caller.id,
        sender_name: authorName,
        type: "supp_update",
        body: `💬 ${authorName || "Someone"} added a ${what} note`,
        is_read: false,
        link_to: "diet",
      }),
    });
  } catch (err) {
    console.error("[clientNotes] notify error", err);
  }
}

/** Staff may post/read on any client in their org; clients only on themselves. */
export async function resolveTargetClient(
  caller: Profile,
  requestedClientId: unknown,
): Promise<{ clientId: string } | { error: string; status: number }> {
  if (caller.role === "client") return { clientId: caller.id };
  const cid = String(requestedClientId || "").trim();
  if (!cid) return { error: "clientId required", status: 400 };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?id=eq.${encodeURIComponent(cid)}&select=id,company_id`,
    { headers: SH },
  );
  const rows = r.ok ? ((await r.json().catch(() => [])) as any[]) : [];
  if (!rows[0]) return { error: "Client not found", status: 404 };
  if ((rows[0].company_id || EDEN_ORG_ID) !== caller.company_id) return { error: "Not your client", status: 403 };
  return { clientId: cid };
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
  if (!notes.trim()) return { status: 200, body: { ok: true } };
  // Legacy endpoint (old cached UIs): append as a dated entry so nothing is overwritten.
  const entries = await appendThreadEntry(caller.company_id, buildSuppNoteKey(caller.id), {
    id: Math.random().toString(36).slice(2), author_id: caller.id,
    author_name: caller.name || "", role: "client", text: notes, at: new Date().toISOString(),
  });
  if (!entries) return { status: 500, body: { error: "Could not save notes" } };
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
  if (!notes.trim()) return { status: 200, body: { ok: true } };
  const entries = await appendThreadEntry(caller.company_id, buildRxNoteKey(caller.id), {
    id: Math.random().toString(36).slice(2), author_id: caller.id,
    author_name: caller.name || "", role: "client", text: notes, at: new Date().toISOString(),
  });
  if (!entries) return { status: 500, body: { error: "Could not save notes" } };
  return { status: 200, body: { ok: true } };
}

// ── Routes ─────────────────────────────────────────────────────

const router: IRouter = Router();

// PATCH /supp/client-notes   body: { clientNotes: string }
router.patch("/supp/client-notes", async (req: Request, res: Response) => {
  try {
    const caller = await requireClient(req);
    const result = await processSuppNotesSave(caller, req.body?.clientNotes);
    // Old cached UIs land here — still bell the coach like the thread endpoint does.
    if (result.status === 200 && caller && String(req.body?.clientNotes || "").trim()) {
      void notifyOtherParty(caller, caller.id, "supp", caller.name || "");
    }
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
    if (result.status === 200 && caller && String(req.body?.clientNotes || "").trim()) {
      void notifyOtherParty(caller, caller.id, "rx", caller.name || "");
    }
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[clientNotes] rx error", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Thread routes (dated entries + coach replies) ──────────────

function parseKind(raw: string): "supp" | "rx" | null {
  return raw === "supp" || raw === "rx" ? raw : null;
}

// GET /notes-thread/:kind?clientId=<uuid>   (clientId ignored for clients)
router.get("/notes-thread/:kind", async (req: Request, res: Response) => {
  try {
    const kind = parseKind(String(req.params.kind));
    if (!kind) { res.status(400).json({ error: "Bad kind" }); return; }
    const caller = await requireClient(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role === "community_only") { res.status(403).json({ error: "Not available" }); return; }
    const target = await resolveTargetClient(caller, req.query.clientId);
    if ("error" in target) { res.status(target.status).json({ error: target.error }); return; }
    const t = await loadThread(caller.company_id, threadKey(kind, target.clientId));
    let entries = t.entries;
    if (kind === "rx" && entries.length === 0) {
      const legacy = await fetchLegacyRxEntry(caller.company_id, target.clientId);
      if (legacy) entries = [legacy];
    }
    res.json({ entries });
  } catch (err) {
    console.error("[clientNotes] thread get error", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /notes-thread/:kind   body: { clientId?, text }
router.post("/notes-thread/:kind", async (req: Request, res: Response) => {
  try {
    const kind = parseKind(String(req.params.kind));
    if (!kind) { res.status(400).json({ error: "Bad kind" }); return; }
    const caller = await requireClient(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role === "community_only") { res.status(403).json({ error: "Not available" }); return; }
    const text = validateNote(req.body?.text).trim();
    if (!text) { res.status(400).json({ error: "Note is empty" }); return; }
    const target = await resolveTargetClient(caller, req.body?.clientId);
    if ("error" in target) { res.status(target.status).json({ error: target.error }); return; }
    const entry: NoteEntry = {
      id: Math.random().toString(36).slice(2),
      author_id: caller.id,
      author_name: caller.name || "",
      role: caller.role === "client" ? "client" : "coach",
      text,
      at: new Date().toISOString(),
    };
    const seed = kind === "rx" ? await fetchLegacyRxEntry(caller.company_id, target.clientId) : null;
    const entries = await appendThreadEntry(caller.company_id, threadKey(kind, target.clientId), entry, seed ? [seed] : undefined);
    if (!entries) { res.status(500).json({ error: "Could not save — please try again" }); return; }
    // Bell the other side (coach ← client, client ← coach); fire-and-forget.
    void notifyOtherParty(caller, target.clientId, kind, caller.name || (entry.role === "coach" ? "Your coach" : "Your client"));
    res.json({ ok: true, entries });
  } catch (err) {
    console.error("[clientNotes] thread post error", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
