// ─── Progress photo deletion ─────────────────────────────────────────
// POST /photos/delete { id } — a client deletes one of their OWN progress
// photos. The storage bucket `progress-photos` has no DELETE policy for
// browser sessions (by design), so the service key removes both the DB row
// and the underlying storage object server-side after verifying ownership.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZG9vamx3Z3BxbG13b3J3Y3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTgzNzYsImV4cCI6MjA5OTUzNDM3Nn0.gIIdDMvbxOP-dELZTjmmTfzcbrLPVsFk_NGXqWg_guU";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
const BUCKET = "progress-photos";

const SVC_H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const router: IRouter = Router();

router.post("/photos/delete", async (req: Request, res: Response) => {
  try {
    const auth = String(req.get("authorization") || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token || token === SUPABASE_ANON) return res.status(401).json({ error: "auth required" });

    const photoId = String(req.body?.id || "").trim();
    if (!photoId) return res.status(400).json({ error: "id required" });

    // Who is calling?
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!ur.ok) return res.status(401).json({ error: "invalid session" });
    const user: any = await ur.json().catch(() => null);
    const email = String(user?.email || "").toLowerCase();
    if (!email) return res.status(401).json({ error: "invalid session" });

    const pr = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&is_active=not.is.false&select=id`,
      { headers: SVC_H },
    );
    const profiles: any[] = pr.ok ? ((await pr.json().catch(() => [])) as any[]) : [];
    const me = profiles[0]?.id as string | undefined;
    if (!me) return res.status(403).json({ error: "no active profile" });

    // Load the photo and verify ownership — only the client who uploaded it may delete it.
    const phr = await fetch(
      `${SUPABASE_URL}/rest/v1/progress_photos?id=eq.${encodeURIComponent(photoId)}&select=id,client_id,photo_url`,
      { headers: SVC_H },
    );
    const photos: any[] = phr.ok ? ((await phr.json().catch(() => [])) as any[]) : [];
    const photo = photos[0];
    if (!photo) return res.status(404).json({ error: "photo not found" });
    if (String(photo.client_id) !== String(me)) return res.status(403).json({ error: "not your photo" });

    // Delete the storage object first (so we never leave a public file behind
    // after the row disappears). Tolerate "not found" — the row is what matters.
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const url = String(photo.photo_url || "");
    const i = url.indexOf(marker);
    if (i >= 0) {
      const path = url.slice(i + marker.length);
      const sr = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: "DELETE",
        headers: SVC_H,
      });
      if (!sr.ok && sr.status !== 404) {
        logger.error({ photoId, status: sr.status }, "progress photo storage delete failed");
        return res.status(502).json({ error: "could not remove the photo file — try again" });
      }
    }

    const dr = await fetch(`${SUPABASE_URL}/rest/v1/progress_photos?id=eq.${encodeURIComponent(photoId)}`, {
      method: "DELETE",
      headers: SVC_H,
    });
    if (!dr.ok) {
      logger.error({ photoId, status: dr.status }, "progress photo row delete failed");
      return res.status(502).json({ error: "could not delete the photo record — try again" });
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "photos/delete failed");
    return res.status(500).json({ error: "internal error" });
  }
});

export default router;
