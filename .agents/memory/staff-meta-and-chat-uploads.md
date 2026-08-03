---
name: Staff titles/access & team chat uploads
description: Zero-DDL storage for custom staff titles, per-staff tab access, and Team Hub file attachments
---
- Custom staff titles + manual tab access live in `admin_settings` key `staff_meta:<profileId>` → JSON `{label, tabs:['home','msgs','team']}`. App shell filters staff sidebar tabs from it; Week7 shows the label. Role stays a standard value (`va`/`head_coach`/`staff`) so all role gates keep working — never invent free-text roles in `user_profiles.role`.
- Team Hub chat attachments travel INSIDE `team_messages.content` as markers `[[file|name|url|type]]` (no DDL possible). Week7 `splitAtts`/`renderBody` parse them; only http(s) URLs may render as links/images (injection guard — keep `safeUrl`).
- Files upload via api-server `POST /team/upload` (any active non-client JWT) → Supabase Storage bucket `team-uploads` (public, created on demand with service key). Express json limit raised to 25mb for base64 bodies.
**Why:** no DDL on the external Supabase, so both features had to piggyback on existing tables/content.
**How to apply:** any new per-staff setting → another `staff_meta` field; any new chat embed → a new `[[...]]` marker type parsed in renderBody, always URL-validated.
