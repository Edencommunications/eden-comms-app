---
name: Coach↔client Messages unread model
description: How unread badges, manual "keep unread" marks, and realtime badge delivery work in the Messages tab
---

- Real unread = `messages.is_read=false` rows (marked read when a conversation opens). Sidebar counts must be POLLED/refreshed — a one-shot load at mount misses anything arriving later or racing the login JWT.
- Manual "keep unread" marks (whole chats AND thread roots) persist via api-server `/msgs/unread` in admin_settings key `msgs_unread:<userId>`, value `{convos:[],threads:[]}` (legacy plain array supported). Server filters to conversations the caller participates in; thread ids must be root messages (`parent_id is null`).
- **Why:** RLS can't scope admin_settings writes per-user, and marks must survive reload/devices; replace-style writes require ONE synchronous marks ref + chained POSTs or concurrent chat/thread marks clobber each other.
- Realtime: supabase broadcast topics `msgs-user-<id>` (Messaging component) and `msgs-tab-<id>` (App-shell tab dot). Two subscribers can't share one topic — send to both from broadcastNewMessage.
- admin_settings upsert with `on_conflict=company_id,key` + `Prefer: resolution=merge-duplicates` works against the live DB (composite constraint exists despite what old .sql snapshots suggest).
