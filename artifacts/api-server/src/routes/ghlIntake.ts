import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { logger } from "../lib/logger";

// ── GHL client intake webhook ───────────────────────────────────────────
// Each company has a secret intake key (company_intake_secrets table).
// GHL workflows POST contact data to /api/ghl-intake/:secret when a
// contract is signed. We resolve the company from the secret, resolve the
// coach from the assigned user's email, create the client profile, and
// link it to the coach via client_access.

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";

const HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
};

async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: HEADERS,
  });
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function sbInsert(table: string, body: unknown): Promise<any[] | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    logger.error({ table, status: r.status, body: await r.text() }, "ghl-intake insert failed");
    return null;
  }
  return (await r.json()) as any[];
}

/** Pull a usable string out of the loosely-typed GHL/Zapier payload. */
function pick(...vals: unknown[]): string {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

const ghlIntakeRouter: IRouter = Router();

ghlIntakeRouter.post("/ghl-intake/:secret", async (req, res) => {
  try {
    const secret = req.params.secret || "";
    if (secret.length < 20) return res.status(403).json({ ok: false, error: "invalid key" });

    const rows = await sbGet(
      "company_intake_secrets",
      `secret=eq.${encodeURIComponent(secret)}&select=company_id`,
    );
    const companyId = rows[0]?.company_id;
    if (!companyId) return res.status(403).json({ ok: false, error: "invalid key" });

    const b: any = req.body || {};
    const cd: any = b.customData || b.custom_data || {};

    const email = pick(cd.email, b.email, b.contact_email, b.contact?.email).toLowerCase();
    const name = pick(
      cd.name, b.full_name, b.name,
      [pick(b.first_name, b.firstName), pick(b.last_name, b.lastName)].filter(Boolean).join(" "),
      b.contact?.name,
    );
    const phone = pick(cd.phone, b.phone, b.contact?.phone);
    const coachEmail = pick(
      cd.coach_email, cd.coachEmail,
      b.user?.email, b.assigned_user_email, b.assignedUserEmail, b.owner_email,
    ).toLowerCase();

    if (!email || !name) {
      logger.warn({ body: b }, "ghl-intake missing name/email");
      return res.status(400).json({ ok: false, error: "missing contact name or email" });
    }

    // Duplicate? Same email already in this company → acknowledge, don't recreate.
    const dupes = await sbGet(
      "user_profiles",
      `email=eq.${encodeURIComponent(email)}&company_id=eq.${companyId}&select=id`,
    );
    if (dupes.length) {
      logger.info({ email, companyId }, "ghl-intake duplicate ignored");
      return res.json({ ok: true, status: "duplicate", message: "client already exists" });
    }

    // Resolve coach by email within this company
    let coach: any = null;
    if (coachEmail) {
      const coaches = await sbGet(
        "user_profiles",
        `email=eq.${encodeURIComponent(coachEmail)}&company_id=eq.${companyId}&role=in.(coach,head_coach)&select=id,name`,
      );
      coach = coaches[0] || null;
    }

    const initials = name.split(" ").filter(Boolean).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
    const tempPass = `Eden${crypto.randomBytes(3).toString("hex").toUpperCase()}!`;
    const inserted = await sbInsert("user_profiles", {
      id: crypto.randomUUID(),
      name,
      email,
      role: "client",
      initials,
      company_id: companyId,
      update_day: "Wednesday",
      temp_password: tempPass,
      phone: phone || null,
    });
    let clientId = inserted?.[0]?.id;
    if (!clientId && inserted === null) {
      // phone column may not exist — retry without it
      const retry = await sbInsert("user_profiles", {
        id: crypto.randomUUID(),
        name, email, role: "client", initials,
        company_id: companyId, update_day: "Wednesday", temp_password: tempPass,
      });
      clientId = retry?.[0]?.id;
    }
    if (!clientId) return res.status(500).json({ ok: false, error: "could not create client" });

    if (coach) {
      await sbInsert("client_access", {
        company_id: companyId,
        staff_id: coach.id,
        client_id: clientId,
        permissions: { messages: true, diet: true, labs: true, workout: true, checkins: true, habits: true },
        assigned_by: null,
      });
    }

    logger.info({ email, companyId, coach: coach?.name || null }, "ghl-intake client created");
    return res.json({
      ok: true,
      status: "created",
      client: { name, email },
      coach: coach ? coach.name : null,
      note: coach ? undefined : "No matching coach found for this company — client created unassigned; assign a coach in the admin panel.",
    });
  } catch (err) {
    logger.error({ err }, "ghl-intake error");
    return res.status(500).json({ ok: false, error: "internal error" });
  }
});

export default ghlIntakeRouter;
