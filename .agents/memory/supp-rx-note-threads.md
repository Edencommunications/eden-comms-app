---
name: Supp/Rx note threads
description: Client supplement & prescription notes are dated threads with coach replies, stored in admin_settings, served by /notes-thread API.
---
Client supp/rx notes live in admin_settings `supp_client_notes:<id>` / `rx_client_notes:<id>` as `{entries:[{id,author_id,author_name,role,text,at}]}` (max 200, 5000 chars each).
- API (clientNotes.ts): GET/POST `/notes-thread/:kind` (kind supp|rx). Clients act only on themselves; staff pass clientId (org-checked). Appends use a CAS loop guarded on the row's updated_at.
- Cross-party bell notifications (type supp_update, link_to 'diet'): client post → their coach_id; coach post → client.
- Legacy: old `{notes}` values parse into one dated client entry; very old rx notes in `rx_plan.rxNotes` are folded in as the first entry on first append (seed) and shown on GET when the thread is empty. Legacy PATCH /supp|rx/client-notes endpoints (old cached PWAs) append entries too and also notify.
**Why:** the old single-notepad overwrote itself, had no history, and coaches couldn't reply.
**How to apply:** any new per-client note feature should reuse this thread pattern; never revert to whole-value overwrites of these keys.
