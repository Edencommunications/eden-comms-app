---
name: DBA sub-brands
description: How white-label sub-brands (DBAs) are stored, gated, branded, and how their members log in
---

# DBA (sub-brand) foundation

- **Storage (no DDL possible):** each DBA is an org-scoped `admin_settings` row — key `dba:<uuid>`, value JSON `{id,name,slug,coach_id,coach_name,logo_url,brand_color,brand_colors,is_active,created_at,members:[{id,email,name,added_at}]}`. All reads/writes go through api-server `/dba/*` routes (service key); the frontend never touches these rows directly.
- **Why:** external Supabase schema is frozen; admin_settings JSON + server-enforced authz is the established pattern. Membership is an array in the JSON — mutations are serialized with an in-process `withLock("dba-write", …)` promise chain (single api-server process), which also makes slug validation+create atomic.
- **Slugs are globally unique** across reserved segments (video/api/__mockup/eden), org slugs, and other DBA slugs — enforced server-side in `/dba/save` only (no DB constraint possible).
- **Pre-auth branding:** RLS blocks anon reads of admin_settings, so the login page loads DBA branding from public `GET /api/dba/brand?slug=`. Brand loader order: `?dba=` param → org table (`?org=`/subpath) → DBA brand endpoint fallback. DBA brand objects carry `__dba:true`.
- **Members:** real Supabase Auth logins, `user_profiles.role='dba_member'` (company_id = owning org). They never see the main app — App.tsx routes them to `DbaHome` (branded landing + multi-DBA switcher via `GET /dba/mine`, which also includes DBAs where the user is the coach or the org's admin). Non-member roles arriving via a DBA link get DbaHome with an "Open the full app" exit.
- **Emails:** new members get the org welcome email branded as the DBA (name + `/…slug` destination); existing logins get `dbaAddedEmail` (no password). Password resets for `dba_member` use the DBA's name and `?dba=<slug>` redirect (query form for Supabase allow-list) — the reset-request profile query must select `role` for this branch to fire.
- **Tier gating:** Eden-level admin_settings key `dba_tiers` (array of package ids), toggled per package in Week6 packages editor (🏷 DBAs button, mirrors voice-memo pattern). Default when unset: only the highest-priced active package — server `dbaAllowedForOrg` and Week6 `tierHasDba` must stay in agreement.
- **Admin UI:** `DbaManagerCard` in App.tsx admin settings (non-HQ orgs only); hidden entirely when the plan doesn't include DBAs (server's `allowed` flag).
