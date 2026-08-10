// ─── Org / DBA logo uploads ─────────────────────────────────────────────
// POST /branding/logo — any active staff member uploads a logo image for
// white-label branding. Files land in the public Supabase Storage bucket
// `org-logos` (created on demand with the service key, so no storage
// policies are needed) and the public https URL comes back. The actual
// organizations.logo_url write still happens client-side under RLS, so
// this endpoint only turns bytes into a hosted URL — it grants no write
// access to any org's branding.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { requireStaffJwt } from "./teamUpload";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
const BUCKET = "org-logos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — plenty for a logo

const SVC_H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

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
  logger.error({ status: r.status, body }, "[OrgLogo] bucket create failed");
  throw new Error("bucket unavailable");
}

const router: IRouter = Router();

router.post("/branding/logo", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaffJwt(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }

    const { key, contentType, dataBase64 } = (req.body || {}) as Record<string, unknown>;
    if (!dataBase64) { res.status(400).json({ error: "dataBase64 required" }); return; }
    const type = String(contentType || "");
    if (!ALLOWED_TYPES.has(type)) { res.status(400).json({ error: "Please upload an image file" }); return; }

    let buf: Buffer;
    try { buf = Buffer.from(String(dataBase64), "base64"); } catch { res.status(400).json({ error: "Bad file data" }); return; }
    if (!buf.length) { res.status(400).json({ error: "Empty file" }); return; }
    if (buf.length > MAX_BYTES) { res.status(413).json({ error: "File too large (5 MB max)" }); return; }

    await ensureBucket();

    const ext =
      type === "image/png" ? "png" :
      type === "image/gif" ? "gif" :
      type === "image/webp" ? "webp" :
      type === "image/svg+xml" ? "svg" :
      type === "image/avif" ? "avif" : "jpg";
    const safeKey = String(key || caller.company_id || "org").slice(0, 60).replace(/[^A-Za-z0-9_-]+/g, "_") || "org";
    const path = `${safeKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...SVC_H, "Content-Type": type, "Cache-Control": "public, max-age=31536000" },
      body: buf as any,
    });
    if (!up.ok) {
      const body = await up.text().catch(() => "");
      logger.error({ status: up.status, body }, "[OrgLogo] upload failed");
      res.status(502).json({ error: "Upload failed — please try again" });
      return;
    }
    res.json({ url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` });
  } catch (e) {
    logger.error({ err: e }, "[OrgLogo] error");
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
