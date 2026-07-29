---
name: Communities & messaging moderation
description: How communities, message pins, soft delete/audit, and community-only offboarded access work
---

# Communities & messaging moderation (July 29, 2026)

- **Communities** live in `communities` / `community_members` / `community_messages` (threads via `parent_id`). One shared `Communities.jsx` component serves two contexts: `clients` (mounted in Messaging via a Messages|Communities tab switch) and `team` (Team Hub nav section). Create rights: clients context = coach/head_coach/admin; team context = admin only.
- **Pins are per-user** (`message_pins`, unique message_id+user_id, `context` 'dm'|'community') — pinning never affects the other person. Admin/VA get "pin for all" which inserts a row per participant/member.
- **Deletes are soft** (`deleted_at/deleted_by/deleted_by_name` on `messages`, `team_messages`, `community_messages`) and every delete inserts an `audit_logs` row with full original content. Admins see the original content inline flagged as deleted; others see a placeholder. Rules: DMs coach/head_coach/admin delete anything; communities coach/admin; Team Hub admin-any, member-own-only.
- **Offboarded clients**: `user_profiles.community_only=true` lets an `is_active=false` client log in but the app collapses their tabs to Messages only. Adding an offboarded client to a community sets the flag automatically.
- **Mentions**: parsed on send against roster names (@First or @Full Name), notified via `notifications` inserts — live table uses `body` + `is_read` columns (NOT message/title/read).
- **Team Hub chat loads live** from `team_messages` with 8s polling (it was write-only before July 29); demo seed rows only show until the first DB row exists.
- **Why:** these rules came directly from the owner's spec; keep them consistent when extending messaging.
