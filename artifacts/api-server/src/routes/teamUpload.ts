// ─── Team Hub chat uploads ───────────────────────────────────────────
// POST /team/upload — any active staff member (role ≠ client) uploads a file
// for team chat. Files land in the Supabase Storage bucket `team-uploads`
// (created on demand, public) under <companyId>/<timestamp>-<name>. The
// service key does the storage write server-side so no storage policies are
// needed and the client never sees privileged credentials.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
const BUCKET = "team-uploads";
const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const SVC_H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// Verify the caller's Supabase JWT and require an active non-client profile.
async function requireStaffJwt(req: Request): Promise<{ id: string; company_id: string | null; role: string } | null> {
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
  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&role=neq.client&is_active=not.is.false&select=id,company_id,role`,
    { headers: SVC_H },
  );
  if (!pr.ok) return null;
  const rows: any[] = await pr.json().catch(() => []) as any[];
  return rows[0] ? { id: rows[0].id, company_id: rows[0].company_id || null, role: rows[0].role } : null;
}

let bucketReady = false;
async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...SVC_H, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  // 200 = created; 400/409 = already exists — both fine
  if (r.ok || r.status === 400 || r.status === 409) { bucketReady = true; return; }
  const body = await r.text().catch(() => "");
  logger.error({ status: r.status, body }, "[TeamUpload] bucket create failed");
  throw new Error("bucket unavailable");
}

// Shared upload core — used by /team/upload here and /dba/upload in dba.ts.
// Returns {status, body} so each route keeps its own auth.
export async function storeChatUpload(
  companyKey: string,
  filename: unknown,
  contentType: unknown,
  dataBase64: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  if (!filename || !dataBase64) return { status: 400, body: { error: "filename and dataBase64 required" } };
  let buf: Buffer;
  try { buf = Buffer.from(String(dataBase64), "base64"); } catch { return { status: 400, body: { error: "Bad file data" } }; }
  if (!buf.length) return { status: 400, body: { error: "Empty file" } };
  if (buf.length > MAX_BYTES) return { status: 413, body: { error: "File too large (15 MB max)" } };

  await ensureBucket();

  const safe = String(filename).slice(-120).replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  const path = `${companyKey || "eden"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...SVC_H, "Content-Type": String(contentType || "application/octet-stream") },
    body: buf as any,
  });
  if (!up.ok) {
    const body = await up.text().catch(() => "");
    logger.error({ status: up.status, body }, "[TeamUpload] upload failed");
    return { status: 502, body: { error: "Upload failed — please try again" } };
  }
  return {
    status: 200,
    body: { url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`, name: String(filename), type: String(contentType || "") },
  };
}

// Shared transcription core — used by /team/transcribe here and /dba/transcribe.
export async function transcribeChatAudio(
  dataBase64: unknown,
  contentType: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] || "";
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] || "";
  if (!baseUrl || !apiKey) return { status: 503, body: { error: "Transcription not configured" } };
  if (!dataBase64) return { status: 400, body: { error: "dataBase64 required" } };
  let buf: Buffer;
  try { buf = Buffer.from(String(dataBase64), "base64"); } catch { return { status: 400, body: { error: "Bad audio data" } }; }
  if (!buf.length || buf.length > MAX_BYTES) return { status: 400, body: { error: "Bad audio size" } };

  const type = String(contentType || "audio/webm");
  const ext = /mp4|m4a/.test(type) ? "m4a" : /wav/.test(type) ? "wav" : /mp3|mpeg/.test(type) ? "mp3" : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type }), `memo.${ext}`);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("response_format", "json");

  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    logger.error({ status: r.status, body }, "[TeamTranscribe] transcription failed");
    return { status: 502, body: { error: "Transcription failed" } };
  }
  const out: any = await r.json().catch(() => null);
  return { status: 200, body: { text: String(out?.text || "").trim() } };
}

const router: IRouter = Router();

router.post("/team/upload", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaffJwt(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const { filename, contentType, dataBase64 } = (req.body || {}) as Record<string, unknown>;
    const out = await storeChatUpload(caller.company_id || "eden", filename, contentType, dataBase64);
    res.status(out.status === 200 ? 200 : out.status).json(out.body);
  } catch (e) {
    logger.error({ err: e }, "[TeamUpload] error");
    res.status(500).json({ error: "Upload failed" });
  }
});

// ── Voice memo gating (per pricing tier, controlled by Eden) ────────────
// Zero-DDL: admin_settings row (Eden org) key `voice_memo_tiers` holds a JSON
// array of package ids where voice memos are INCLUDED. No row = every tier
// (and every org) has voice memos. Eden's own team always has them.
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";

export async function voiceMemosEnabled(companyId: string | null): Promise<boolean> {
  if (!companyId || companyId === EDEN_ORG_ID) return true;
  const sr = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.voice_memo_tiers&select=value`,
    { headers: SVC_H },
  );
  const srows: any[] = sr.ok ? await sr.json().catch(() => []) as any[] : [];
  if (!srows[0]?.value) return true; // gating never configured → on for everyone
  let enabledTiers: string[] = [];
  try {
    const v = srows[0].value;
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    if (Array.isArray(parsed)) enabledTiers = parsed.map(String);
  } catch { return true; }
  // Org's plan name → matching package id
  const or = await fetch(
    `${SUPABASE_URL}/rest/v1/organizations?id=eq.${companyId}&select=plan`,
    { headers: SVC_H },
  );
  const orows: any[] = or.ok ? await or.json().catch(() => []) as any[] : [];
  const plan = String(orows[0]?.plan || "").toLowerCase();
  if (!plan) return false; // gating configured + org has no tier → off
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/packages?select=id,name`, { headers: SVC_H });
  const prows: any[] = pr.ok ? await pr.json().catch(() => []) as any[] : [];
  const pkg = prows.find((p) => String(p.name || "").toLowerCase() === plan);
  return !!pkg && enabledTiers.includes(String(pkg.id));
}

// GET /team/voice-memos-enabled — the frontend asks whether to show the mic
router.get("/team/voice-memos-enabled", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaffJwt(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    res.json({ enabled: await voiceMemosEnabled(caller.company_id) });
  } catch (e) {
    logger.error({ err: e }, "[VoiceMemoGate] error");
    res.json({ enabled: true }); // fail open — never brick chat over a gate check
  }
});

// POST /team/transcribe — speech-to-text for Team Hub voice memos via the
// Replit AI Integrations OpenAI proxy. Best-effort: callers should treat a
// failure as "no transcript", never block the memo itself.
router.post("/team/transcribe", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaffJwt(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (!(await voiceMemosEnabled(caller.company_id))) {
      res.status(403).json({ error: "Voice memos are not included in this organization's tier" });
      return;
    }
    const { dataBase64, contentType } = (req.body || {}) as Record<string, unknown>;
    const out = await transcribeChatAudio(dataBase64, contentType);
    res.status(out.status === 200 ? 200 : out.status).json(out.body);
  } catch (e) {
    logger.error({ err: e }, "[TeamTranscribe] error");
    res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
