---
name: Staff titles/access & team chat uploads
description: Zero-DDL storage for custom staff titles, per-staff tab access, and Team Hub file attachments
---
- Custom staff titles + manual tab access live in `admin_settings` key `staff_meta:<profileId>` → JSON `{label, tabs:['home','msgs','team']}`. App shell filters staff sidebar tabs from it; Week7 shows the label. Role stays a standard value (`va`/`head_coach`/`staff`) so all role gates keep working — never invent free-text roles in `user_profiles.role`.
- Team Hub chat attachments travel INSIDE `team_messages.content` as markers `[[file|name|url|type]]` (no DDL possible). Week7 `splitAtts`/`renderBody` parse them; only http(s) URLs may render as links/images (injection guard — keep `safeUrl`).
- Files upload via api-server `POST /team/upload` (any active non-client JWT) → Supabase Storage bucket `team-uploads` (public, created on demand with service key). Express json limit raised to 25mb for base64 bodies.
**Why:** no DDL on the external Supabase, so both features had to piggyback on existing tables/content.
**How to apply:** any new per-staff setting → another `staff_meta` field; any new chat embed → a new `[[...]]` marker type parsed in renderBody, always URL-validated.

**Live access updates (Aug 2026):** the app shell subscribes per-staff to a `staff-meta-<profileId>` realtime channel — postgres_changes on admin_settings plus a broadcast `staff-meta-changed` nudge sent by the admin UI on save — with a slow always-on poll fallback. admin_settings was verified NOT in the supabase_realtime publication, so the broadcast nudge is the guaranteed instant path; if the user later runs ALTER PUBLICATION for admin_settings, postgres_changes starts working too.

## Learn/Connect staff tabs (Aug 2026)
- staff_meta.tabs may now include `learn` and `community` (opt-in, default off). Canonical tab set: home,msgs,team,learn,community — normalized on read in App.tsx and on write in auth.ts create-account.
- Access is enforced at RENDER level in the staff branch (not just hidden nav) — direct `?goto=` cannot bypass; while meta loads, staff get the conservative classic trio.
- `staff_meta.connect_coach` = which coach's social links the staff member sees in Connect. Server validates same-org active coach/head_coach; CommunityScreen re-validates on read (stale/removed coach falls back to default links).
- Course grants for staff: Week5 access-manager roster includes va/head_coach; staff Learn works like clients via course_access.
- KNOWN GAP: admin_settings RLS lets any same-company user write staff_meta rows → staff could self-escalate their own tabs. Needs write-path hardening (API-only writes or admin-only RLS).
