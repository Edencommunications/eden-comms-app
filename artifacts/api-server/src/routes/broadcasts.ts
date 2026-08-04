// broadcasts.ts — actually DELIVER broadcast messages to their recipients.
//
// Historically, broadcasts were only saved to broadcast_messages history —
// clients never received anything. This module makes a broadcast real:
//   • each client recipient gets the text as a message in their conversation
//     with the sender (created if needed) — it shows up in their Messages tab
//   • every recipient (clients AND staff) gets a bell notification, which the
//     bell picks up instantly via realtime
//
// POST /broadcasts/deliver { id }  → deliver a broadcast row now (admin JWT).
// deliverBroadcast(id) is also called by the scheduler when a scheduled
// broadcast comes due.
//
// recipient_ids column format (JSON string):
//   new: { "sender": "<profile uuid>", "ids": ["client uuid", ...], "staff": ["coach uuid", ...] }
//   legacy: ["client uuid", ...]  → notifications only (no sender known)

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { requireAdminJwt } from "./auth";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const SVC_H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function restGet<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SVC_H });
  if (!r.ok) return [];
  return r.json() as Promise<T[]>;
}
async function restPost(table: string, body: any): Promise<any[] | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SVC_H, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    logger.warn({ table, status: r.status, body: await r.text().catch(() => "") }, "[Broadcast] insert failed");
    return null;
  }
  return r.json().catch(() => null);
}
async function restPatch(path: string, body: any): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: { ...SVC_H, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/** Find (or create) the 1-on-1 conversation between two profiles. */
async function findOrCreateConvo(aId: string, bId: string, companyId: string | null): Promise<string | null> {
  const [pA, pB] = [aId, bId].sort();
  const rows = await restGet<{ id: string }>(
    `conversations?participant_a_id=eq.${pA}&participant_b_id=eq.${pB}&select=id&limit=1`,
  );
  if (rows.length) return rows[0].id;
  const created = await restPost("conversations", {
    participant_a_id: pA, participant_b_id: pB, company_id: companyId,
  });
  return created?.[0]?.id ?? null;
}

/**
 * Deliver one broadcast row: conversation messages for clients (when the
 * sender is known) + bell notifications for everyone. Idempotence: callers
 * must only invoke this once per row (immediate send or scheduler flip).
 */
export async function deliverBroadcast(id: string): Promise<{ delivered: number; notified: number }> {
  const rows = await restGet<any>(`broadcast_messages?id=eq.${encodeURIComponent(id)}&limit=1`);
  const b = rows[0];
  if (!b) throw new Error("broadcast not found");

  // Parse recipients — new object format or legacy plain array
  let sender: string | null = null;
  let clientIds: string[] = [];
  let staffIds: string[] = [];
  try {
    const parsed = JSON.parse(b.recipient_ids || "[]");
    if (Array.isArray(parsed)) clientIds = parsed;
    else if (parsed && typeof parsed === "object") {
      sender = parsed.sender || null;
      clientIds = Array.isArray(parsed.ids) ? parsed.ids : [];
      staffIds = Array.isArray(parsed.staff) ? parsed.staff : [];
    }
  } catch { /* unparseable → nothing to deliver */ }

  const text = String(b.message || "").trim();
  if (!text || (!clientIds.length && !staffIds.length)) return { delivered: 0, notified: 0 };

  const senderName = b.sent_by_name || "Your coaching team";
  const preview = text.slice(0, 80);

  // Sender's org (for new conversations)
  let companyId: string | null = null;
  if (sender) {
    const prof = await restGet<any>(`user_profiles?id=eq.${sender}&select=company_id&limit=1`);
    companyId = prof[0]?.company_id ?? null;
  }

  let delivered = 0;
  let notified = 0;
  const all = [
    ...clientIds.map((rid) => ({ rid, isClient: true })),
    ...staffIds.map((rid) => ({ rid, isClient: false })),
  ];

  for (const { rid, isClient } of all) {
    if (!rid || rid === sender) continue;

    // 1) Real message in the client's Messages tab (needs a known sender;
    //    staff↔staff chat lives in Team Hub, so staff get the bell only)
    if (isClient && sender) {
      const convoId = await findOrCreateConvo(sender, rid, companyId);
      if (convoId) {
        const ins = await restPost("messages", {
          conversation_id: convoId, sender_id: sender,
          content: `📢 ${text}`, message_type: "text",
        });
        if (ins) {
          delivered++;
          await restPatch(`conversations?id=eq.${convoId}`, {
            last_message: `📢 ${preview}`, last_message_at: new Date().toISOString(),
          });
        }
      }
    }

    // 2) Bell notification for every recipient
    const n = await restPost("notifications", {
      recipient_id: rid, sender_id: sender, sender_name: senderName,
      type: "message", body: `📢 Broadcast from ${senderName}: "${preview}"`,
      is_read: false, link_to: "msgs",
    });
    if (n) notified++;
  }

  logger.info({ id, delivered, notified }, "[Broadcast] delivered");
  return { delivered, notified };
}

const router: IRouter = Router();

// POST /broadcasts/deliver — deliver an immediate broadcast right after the
// frontend saves it as status='sent'.
router.post("/broadcasts/deliver", requireAdminJwt, async (req: Request, res: Response) => {
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const result = await deliverBroadcast(id);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    logger.warn({ err: String(err) }, "[Broadcast] deliver failed");
    res.status(500).json({ error: "delivery failed" });
  }
});

export default router;
