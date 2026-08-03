// welcome.ts — automated welcome messages.
//
// Admins (per org) write a welcome message that is automatically dropped
// into a new client's chat with their coach the FIRST time the client
// opens the app. Admins can pause it org-wide, and customize/pause it
// per coach so each coach's clients get their own welcome.
//
// Storage (admin_settings, org-scoped — no DDL available):
//   key 'welcome_messages'          → { enabled, defaultText, perCoach: { [coachId]: { text, paused } } }
//   key 'welcome_sent:<clientId>'   → iso timestamp (one row per client — the
//     row INSERT is the atomic claim: a duplicate insert conflicts, so two
//     concurrent checks can never both send; the claim is rolled back if the
//     message insert fails, so a transient error can't permanently eat the welcome)
//
// Routes:
//   GET  /welcome/settings   (super_admin)  → current settings for caller's org
//   POST /welcome/settings   (super_admin)  → save settings
//   POST /welcome/check      (any signed-in client) → sends the welcome once
//
// The message is inserted as the COACH (sender_id = coach profile) into the
// client↔coach conversation, so it reads like a personal greeting. If the
// client has no coach yet, it is sent from an org super_admin into an
// admin↔client conversation instead, so no new client lands in silence.
// Placeholders: {client_name} {coach_name}
import { Router, type IRouter, type Request, type Response } from "express";
import { requireStaff } from "./checkinForm";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

async function getSetting(companyId: string, key: string): Promise<any | null> {
  const rows = await svcGet("admin_settings", `company_id=eq.${companyId}&key=eq.${key}&select=value`);
  if (!rows[0]) return null;
  try { return typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value; }
  catch { return null; }
}

async function putSetting(companyId: string, key: string, value: any): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ company_id: companyId, key, value: JSON.stringify(value) }),
  });
  return r.ok;
}

// Atomic claim: plain INSERT (no upsert). On the unique (company_id,key)
// constraint a second concurrent claim gets a conflict error → returns false.
async function claimOnce(companyId: string, key: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings`, {
    method: "POST",
    headers: SH,
    body: JSON.stringify({ company_id: companyId, key, value: JSON.stringify(new Date().toISOString()) }),
  });
  return r.ok;
}

async function releaseClaim(companyId: string, key: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${companyId}&key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: SH,
  }).catch(() => {});
}

type WelcomeSettings = {
  enabled: boolean;
  defaultText: string;
  perCoach: Record<string, { text?: string; paused?: boolean }>;
};

const EMPTY: WelcomeSettings = { enabled: false, defaultText: "", perCoach: {} };

function firstName(full: string): string {
  return String(full || "").trim().split(/\s+/)[0] || "there";
}

// Verify JWT → any active profile (clients included; requireStaff is staff-only)
async function requireUser(req: Request): Promise<{ id: string; role: string; company_id: string | null; name: string; coach_id: string | null } | null> {
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
    `email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id,role,company_id,name,coach_id`,
  );
  return rows[0] || null;
}

const router: IRouter = Router();

router.get("/welcome/settings", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin") { res.status(401).json({ error: "Not authorized" }); return; }
    const s = (await getSetting(caller.company_id, "welcome_messages")) || EMPTY;
    res.json({ settings: { ...EMPTY, ...s } });
  } catch { res.status(500).json({ error: "Could not load settings" }); }
});

router.post("/welcome/settings", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller || caller.role !== "super_admin") { res.status(401).json({ error: "Not authorized" }); return; }
    const b = req.body || {};
    const settings: WelcomeSettings = {
      enabled: !!b.enabled,
      defaultText: String(b.defaultText || "").slice(0, 2000),
      perCoach: {},
    };
    if (b.perCoach && typeof b.perCoach === "object") {
      for (const [k, v] of Object.entries(b.perCoach as Record<string, any>)) {
        if (!v || typeof v !== "object") continue;
        const text = String(v.text || "").slice(0, 2000);
        const paused = !!v.paused;
        if (text || paused) settings.perCoach[k] = { ...(text ? { text } : {}), ...(paused ? { paused: true } : {}) };
      }
    }
    const ok = await putSetting(caller.company_id, "welcome_messages", settings);
    if (!ok) { res.status(500).json({ error: "Could not save settings" }); return; }
    res.json({ ok: true, settings });
  } catch { res.status(500).json({ error: "Could not save settings" }); }
});

// Called by the app once after a client signs in. Idempotent.
router.post("/welcome/check", async (req: Request, res: Response) => {
  try {
    const me = await requireUser(req);
    if (!me) { res.status(401).json({ error: "Not authorized" }); return; }
    if (me.role !== "client" || !me.company_id) { res.json({ sent: false }); return; }

    const settings: WelcomeSettings = { ...EMPTY, ...((await getSetting(me.company_id, "welcome_messages")) || {}) };
    if (!settings.enabled) { res.json({ sent: false }); return; }

    // Already welcomed? (one claim row per client)
    const claimKey = `welcome_sent:${me.id}`;
    const existing = await svcGet("admin_settings", `company_id=eq.${me.company_id}&key=eq.${encodeURIComponent(claimKey)}&select=key`);
    if (existing.length) { res.json({ sent: false }); return; }

    // Sender: the client's coach if they have one in the SAME org — otherwise
    // fall back to an org super_admin so no new client lands in silence.
    let sender: { id: string; name: string } | null = null;
    let override: { text?: string; paused?: boolean } = {};
    if (me.coach_id) {
      sender = (await svcGet(
        "user_profiles",
        `id=eq.${me.coach_id}&company_id=eq.${me.company_id}&role=in.(coach,head_coach)&is_active=not.is.false&select=id,name`,
      ))[0] || null;
      if (sender) override = settings.perCoach[me.coach_id] || {};
    }
    if (!sender) {
      // No coach yet (or the assigned coach is inactive/missing) → send from
      // an org super_admin into an admin↔client conversation instead.
      sender = (await svcGet(
        "user_profiles",
        `company_id=eq.${me.company_id}&role=eq.super_admin&is_active=not.is.false&select=id,name&order=name&limit=1`,
      ))[0] || null;
    }
    if (!sender) { res.json({ sent: false }); return; }

    if (override.paused) { res.json({ sent: false }); return; }
    const template = (override.text || settings.defaultText || "").trim();
    if (!template) { res.json({ sent: false }); return; }

    const content = template
      .replaceAll("{client_name}", firstName(me.name))
      .replaceAll("{coach_name}", firstName(sender.name));

    // Atomic claim FIRST so a double-fire can't send twice (unique constraint
    // rejects the second insert). Rolled back below if the send fails.
    const claimed = await claimOnce(me.company_id, claimKey);
    if (!claimed) { res.json({ sent: false }); return; }

    // Find or create the sender↔client conversation (ids sorted, same as app)
    const [pA, pB] = [me.id, sender.id].sort();
    let convoId: string | null =
      (await svcGet("conversations", `participant_a_id=eq.${pA}&participant_b_id=eq.${pB}&select=id&limit=1`))[0]?.id || null;
    if (!convoId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
        method: "POST",
        headers: { ...SH, Prefer: "return=representation" },
        body: JSON.stringify({ participant_a_id: pA, participant_b_id: pB, company_id: me.company_id }),
      });
      const rows = (await r.json().catch(() => null)) as any;
      convoId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
    }
    if (!convoId) { await releaseClaim(me.company_id, claimKey); res.json({ sent: false }); return; }

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: "POST",
      headers: { ...SH, Prefer: "return=representation" },
      body: JSON.stringify({ conversation_id: convoId, sender_id: sender.id, content, message_type: "text" }),
    });
    // Send failed → roll the claim back so the next sign-in retries
    if (!ins.ok) { await releaseClaim(me.company_id, claimKey); res.json({ sent: false }); return; }
    await fetch(`${SUPABASE_URL}/rest/v1/conversations?id=eq.${convoId}`, {
      method: "PATCH",
      headers: SH,
      body: JSON.stringify({ last_message: content.slice(0, 80), last_message_at: new Date().toISOString() }),
    });
    res.json({ sent: true });
  } catch { res.status(500).json({ error: "Welcome check failed" }); }
});

export default router;
