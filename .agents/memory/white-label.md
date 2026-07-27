---
name: White-label architecture
description: How white-label orgs, tiers, and content gating work in the Eden coaching app
---

- Two org tables exist: `organizations` (app-facing, plan/branding) and legacy `companies` — `user_profiles.company_id` FK points to **companies**, so every new org must be mirrored into `companies` with the same id (createOrg does this; rolls back if the mirror fails).
- White-label admins are stored as role `super_admin` with `company_id` = their org; the "org_admin" option in Add User is UI-only sugar.
- Tier flags on `packages` (`includes_courses`, `includes_recipes`) gate Eden content for white-label users; org.plan matches packages.name (ilike).
- Eden **course** sharing is per-course now: `courses.tiers` (jsonb array of package ids) decides which tiers see each Eden course; empty = Eden-only. This replaced the all-or-nothing `includes_courses` gate for courses (recipes still use the flag). Backfill SQL granted existing Eden courses to includes_courses tiers to preserve behavior.
- Courses are tenant-scoped via `courses.company_id` (null/Eden id = Eden platform content); white-label admin queries filter server-side (`company_id=eq.`), never fetch-all-then-filter.
- Per-company Connect links live in `company_links` (one row per company, `links` jsonb), mirroring the coach_social_links pattern.
- UI gating must wait for async profile/company resolution (`profileReady` gate) — otherwise Eden content flashes/leaks for white-label users on first render.
- **Why:** anon-key REST with RLS disabled means all isolation is app-level; query scoping + load gating are the only tenant boundaries.

## Habit/cardio/food libraries (July 2026)
- company_habits & company_cardio_types are scoped by company_id; each org gets an independent COPY of Eden's rows seeded at org creation (Week6 createOrg) — no ongoing sync.
- company_foods stays Eden-only: everyone reads company_id=Eden; add/remove food UI hidden for WL admins (isWLOrg gate in DietBuilder).
- company_cardio_types has UNIQUE (company_id, name) — the old global name unique was dropped; deletes must always filter by company_id AND name.
