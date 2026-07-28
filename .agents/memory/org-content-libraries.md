---
name: Per-org content libraries
description: How company-wide foods/supplements/habits/cardio libraries are scoped and seeded per organization
---

## Rule
All company content libraries (company_foods, company_supplements, company_habits, company_cardio_types) are scoped by `company_id`. Foods used to be Eden-shared-to-everyone; now each org (Eden and each white-label org) manages its own rows. New orgs are seeded by copying Eden's rows at org creation.

**Why:** White-label admins must curate their own coach-facing libraries; Eden's content shouldn't leak into or override theirs.

**How to apply:** Any query on these tables must include a company_id filter. Admin CRUD lives in the Admin Panel "Library" tab; coach pickers read the same tables.

## Gotchas
- Habits and cardio types also have static built-in defaults in code; DB rows only extend them. Eden's habit/cardio DB tables are empty by design — an empty Library list there is normal.
- The admin panel's Supabase helpers: insert returns rows, update returns a boolean (must be checked before mutating local state), delete previously failed silently due to undefined vars (fixed) — be wary of silent-failure helpers when adding CRUD.
- company_habits and company_cardio_types do have `id` columns (verified by probe).
