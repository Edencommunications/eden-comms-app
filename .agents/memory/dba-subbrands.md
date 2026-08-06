---
name: DBA sub-brands
description: How white-label sub-brands (DBAs) are stored, gated, branded, and how their members log in
---

# DBA (sub-brand) foundation

- **Storage (no DDL possible):** each DBA is an org-scoped `admin_settings` row — key `dba:<uuid>`, value JSON `{id,name,slug,coach_id,coach_name,logo_url,brand_color,brand_colors,is_active,created_at,members:[{id,email,name,added_at,pure?}],connect:[{id,title,url,desc}],learn_course_ids:[…]}`. All reads/writes go through api-server `/dba/*` routes (service key); the frontend never touches these rows directly.
- **Why:** external Supabase schema is frozen; admin_settings JSON + server-enforced authz is the established pattern. Membership is an array in the JSON — mutations are serialized with an in-process `withLock("dba-write", …)` promise chain (single api-server process), which also makes slug validation+create atomic.
- **Slugs are globally unique** across reserved segments (video/api/__mockup/eden), org slugs, and other DBA slugs — enforced server-side in `/dba/save` only (no DB constraint possible).
- **Pre-auth branding:** RLS blocks anon reads of admin_settings, so the login page loads DBA branding from public `GET /api/dba/brand?slug=`. Brand loader order: `?dba=` param → org table (`?org=`/subpath) → DBA brand endpoint fallback. DBA brand objects carry `__dba:true`.
- **Members:** real Supabase Auth logins. `user_profiles.role` CHECK constraint only allows client/coach/head_coach/super_admin/admin — there is NO `dba_member` role. Pure DBA members get role `'client'` + auth `user_metadata.intended_role='dba_member'` + `pure:true` on their member entry; frontend routes on `user.dbaMember` (from metadata). Also: `user_profiles.id` has no DB default — every insert must supply a UUID. They never see the main app — App.tsx routes them to `DbaHome` (branded landing + multi-DBA switcher via `GET /dba/mine`, which also includes DBAs where the user is the coach or the org's admin). Non-member roles arriving via a DBA link get DbaHome with an "Open the full app" exit.
- **Emails:** new members get the org welcome email branded as the DBA (name + `/…slug` destination); existing logins get `dbaAddedEmail` (no password). Password resets use DBA branding only for pure members (`findDbaBrandForEmail` matches `pure:true` entries); existing org users added to a DBA keep org-branded resets.
- **Member content (Connect & Learn):** `GET /dba/content?id=` returns links + assigned courses (strictly DBA's org or Eden) + my completed module ids; manager-only `POST /dba/connect-save` / `/dba/learn-save`; `POST /dba/progress` upserts course_progress server-side and validates the module belongs to the course — members never hit Supabase REST.
- **Tier gating:** Eden-level admin_settings key `dba_tiers` (array of package ids), toggled per package in Week6 packages editor (🏷 DBAs button, mirrors voice-memo pattern). Default when unset: only the highest-priced active package — server `dbaAllowedForOrg` and Week6 `tierHasDba` must stay in agreement.
- **Admin UI:** `DbaManagerCard` in App.tsx admin settings (non-HQ orgs only); hidden entirely when the plan doesn't include DBAs (server's `allowed` flag).

## DBA chat (communities reuse)
- Group channels = `communities` rows with context `dba:<dbaId>`; 1v1s = context `dbadm:<dbaId>` with name = sorted `<idA>_<idB>` pair key. Messages/pins/audit ride community_messages/message_pins/audit_logs (context 'community') — DBA members are role client in the owning org, so org RLS lets the frontend post/read directly.
- Per-DBA chat config in admin_settings key `dba_chat:<dbaId>` = `{ all: {communityId:true}, dm_enabled: {profileId:true} }`. "Everyone" channels materialize community_members rows (canvas auth needs real rows); member-add auto-joins all=true channels; toggling all off keeps current members by design (stops future auto-joins only).
- All moderation (channel create/rename/archive, channel member add/remove, chat-flags, dm-open/dm-enable, upload/transcribe) is server-side in dba.ts — every route validates via findDbaChannel (company_id + exact dba:/dbadm: context). **Why:** RLS is only org-level; DBA boundaries must be app-enforced.
- DBA member-remove hard-revokes chat: deletes their community_members + pins across the DBA's channels and deactivates their 1v1s. JSON-only removal would leave table access intact.
- Member 1v1s stay locked until dm_enabled (Phase 4 hook); coach↔org-admin DM always allowed.

## Delegated authority & tiers (Phase 4)
- Leader authority (delete/pin/canvas) is strictly per-channel and lives in the DBA chat config JSON; the org-wide tier ladder lives in per-org `dba_tier_defs`. Only the org super_admin edits the ladder; DBA managers assign tiers and grants.
- All moderation and DM-pair decisions are server-side; the frontend only renders what chat-config returns (`my_dm`, `dm_targets`, `leaders`, `tiers`). Never gate these client-side.
**Why (from code review):** patching user_profiles by id alone let one org's DBA manager mutate another org's user — profile writes must always filter on company_id (DBA rosters can contain other orgs' emails).
**Why (from code review):** delegated grants must die with membership: leader caps only count while the user is a current channel member, and member/channel removal scrubs leaders/tiers/dm flags — otherwise stale grants are a broken-access-control hole.
- Promotion to full client is tier-gated (member's tier needs `app:true`) and flips auth metadata intended_role→'client' plus the member's `pure` flag.

## DBA huddles (Phase 5)
- DBA huddles are fully separate from org/Team Hub huddles: room records live in per-DBA admin_settings JSON (`dba_huddles:<id>`), never in huddle_rooms. Daily rooms reuse the org's key (Eden env fallback) and self-expire at 4h; listing lazily prunes stale records.
- Start rights = DBA manager or any Phase-4 delegated leader; each huddle has an audience (leaders/all/pick) and members only ever see huddles they can join. Visibility is decided server-side.
**Why (from code review):** all writes to a shared JSON array row must go through the same per-DBA lock — including "background" prune saves triggered by GETs — or concurrent starts/ends get silently overwritten. Also: if the external room is created but the save fails, delete the room (no orphaned live rooms).

## DBA calendar & booking (Phase 6)
- Shared events calendar per DBA: events in admin_settings JSON `dba_events:<id>` (per-DBA lock); calendar authority (`cal`) and per-person booking URLs (`booking`) live inside the existing `dba_chat:<id>` config, so member-removal scrubbing covers them automatically.
- Rights model: coach/org admin OR a member with an explicit `cal` grant manages events AND may publish their own Calendly/GHL booking embed. Booking embeds shown = coach + currently-granted current members only; revoking the grant also deletes the person's booking URL.
**Why:** authority must be re-derived from live config on every request (no cached rights), and any per-user data tied to an authority grant should be deleted when the grant goes — otherwise stale embeds/URLs resurface. No external calendar sync by design; events are in-app only.

## Admin oversight & staff delegation (Phase 7)
- Staff delegation lives in `delegates` inside the dba:<id> JSON record; dbaAccess re-derives manage rights live from it on every request (same-org, non-client roles only). GET /dba/list now serves non-admin staff too (scope "mine" = coached + delegated DBAs); admins keep org-wide scope.
- Delegates get coach-equivalent rights only — DBA member invites remain org-admin-only by design.
- Audit-log labels for all dba_* actions live in the App.tsx ACTION_LABELS map; new server audit actions need a matching entry there or they render as fallback text.

## Branded phone installs (PWA)
- Chrome ignores blob/data manifests for install scope — branded installs must use a real same-origin manifest endpoint, swapped into <link rel=manifest> at document-parse time (inline index.html script using Vite %BASE_URL%) before beforeinstallprompt fires.
- A captured install prompt is bound to the manifest at capture time: discard it whenever the manifest changes after load (fall back to manual install steps), or the wrong app gets installed.
- E2E seed scripts run by task agents have left orphaned users/DBAs in shared Supabase before (T158 residue found Aug 2026: profiles + auth logins + dba rows). Any seeded-data test must delete auth users AND profile AND admin_settings rows in a trap/always-run cleanup; sweep pattern: @example.com emails.

**Navigation wording:** the Eden HQ admin UI has NO "Settings" tab — tabs are Overview / Staff Access / Conversations. The DBA manager, Organizations list ("Manage →" popup with logo/colors), and all branding panels live on the **Overview** tab. Telling the user "Settings" repeatedly confused them. Also: user often views the *published* site — remind them unpublished workspace changes won't appear there.

**Branding parity:** DBA editor now matches the org branding editor — typed hex + picker for primary, up to 4 palette colors (brand_colors), logo Upload Image via sbUploadLogo (org-logos bucket, `dba-<id>` path) with <400KB data-URL fallback. Uploads are draft-guarded (applied only if the same DBA draft is still open).

## DBA course builder & Connect (Aug 2026)
- DBA managers build courses from inside the DBA Learn tab: /dba/course-save, /dba/lesson-save, /dba/lesson-delete (api-server dba.ts). Courses land in the org's normal catalog (company_id = org) and auto-assign to the DBA; Eden shared courses are never editable from a DBA (`editable` flag in /dba/content).
- dbaAccess coach branch requires the coach to still be non-client staff of the DBA's org (demotion/transfer revokes manage). PATCH predicates must carry company_id/course_id to avoid authz TOCTOU — architect review caught both.
- Lessons live in course_modules (denormalized sections: section_id/section_title, module_id = "sec.n"); no course_sections table. Video URLs normalized client-side (dbaToEmbed) to YouTube/Vimeo/Loom/Drive embeds.
- DBA Connect links support optional emoji; member view is a 2-col accent-gradient card grid cycling through brand_colors palette.
