// ─── Login audit trail ───────────────────────────────────────────────
// POST /audit/login — records a successful login in audit_logs using the
// service key, so EVERY role (including clients, whom RLS blocks from
// writing audit rows directly) gets logged. The caller must present their
// own freshly-issued Supabase JWT; we derive identity from the token, never
// from the request body, so logins can't be forged for other users.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
const SVC_H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const router: IRouter = Router();

router.post("/audit/login", async (req: Request, res: Response) => {
  try {
    const auth = String(req.get("authorization") || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token === SUPABASE_ANON) return res.status(401).json({ error: "auth required" });

    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) return res.status(401).json({ error: "invalid token" });
    const user: any = await ur.json().catch(() => null);
    const email = String(user?.email || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "invalid token" });

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role`,
      { headers: SVC_H },
    );
    const rows: any[] = pr.ok ? await pr.json().catch(() => []) : [];
    const p = rows[0] || null;

    const ir = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        action: "login",
        actor_id: p?.id || null,
        actor_name: p?.name || p?.full_name || email,
        actor_role: p?.role || "client",
        target_type: "session",
        details: { email },
      }),
    });
    if (!ir.ok) {
      const body = await ir.text().catch(() => "");
      logger.error({ status: ir.status, body }, "[AuditLogin] insert failed");
      return res.status(500).json({ error: "insert failed" });
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "[AuditLogin] error");
    return res.status(500).json({ error: "server error" });
  }
});

// POST /audit/login-failed — records a failed sign-in attempt (wrong password)
// for accounts that actually exist. No auth possible (login failed), so we
// only log when the email matches a real profile — typos on unknown emails
// are ignored to keep the log clean.
router.post("/audit/login-failed", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || email.length > 200) return res.json({ ok: true });
    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role`,
      { headers: SVC_H },
    );
    const rows: any[] = pr.ok ? await pr.json().catch(() => []) : [];
    const p = rows[0];
    if (!p) return res.json({ ok: true }); // unknown email — don't log
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        action: "login_failed",
        actor_id: p.id || null,
        actor_name: p.name || p.full_name || email,
        actor_role: p.role || "client",
        target_type: "session",
        details: { email },
      }),
    });
    return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "[AuditLoginFailed] error");
    return res.json({ ok: true });
  }
});

// POST /audit/event — records a whitelisted client-side event (e.g. a client
// submitting their check-in) using the service key, since RLS blocks clients
// from inserting audit rows directly. Identity always comes from the caller's
// JWT, never the body.
const EVENT_WHITELIST = new Set(["checkin_submitted", "notification_send_failed"]);
router.post("/audit/event", async (req: Request, res: Response) => {
  try {
    const auth = String(req.get("authorization") || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token === SUPABASE_ANON) return res.status(401).json({ error: "auth required" });
    const action = String(req.body?.action || "");
    if (!EVENT_WHITELIST.has(action)) return res.status(400).json({ error: "unknown action" });

    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) return res.status(401).json({ error: "invalid token" });
    const user: any = await ur.json().catch(() => null);
    const email = String(user?.email || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "invalid token" });

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id,name,full_name,role`,
      { headers: SVC_H },
    );
    const rows: any[] = pr.ok ? await pr.json().catch(() => []) : [];
    const p = rows[0] || null;

    const rawDetails = req.body?.details;
    const details =
      rawDetails && typeof rawDetails === "object" && JSON.stringify(rawDetails).length <= 2000
        ? rawDetails
        : {};

    const ir = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        action,
        actor_id: p?.id || null,
        actor_name: p?.name || p?.full_name || email,
        actor_role: p?.role || "client",
        target_type: String(req.body?.target_type || "event").slice(0, 60),
        target_id: req.body?.target_id ? String(req.body.target_id).slice(0, 80) : null,
        details,
      }),
    });
    if (!ir.ok) {
      const body = await ir.text().catch(() => "");
      logger.error({ status: ir.status, body }, "[AuditEvent] insert failed");
      return res.status(500).json({ error: "insert failed" });
    }
    return res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, "[AuditEvent] error");
    return res.status(500).json({ error: "server error" });
  }
});

export default router;
