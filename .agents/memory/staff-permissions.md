---
name: Staff access & messaging model
description: How VA/head-coach access, permissions, and conversations are structured in the Eden app
---
- `client_access` rows grant staff access at three scopes: specific client (`client_id`), all clients of a coach (`coach_id`, auto-includes future clients), or company-wide (both null). Specific perms override coach-scope override company-wide.
- `coach_convo` is a **separate** permission: staff assigned to a client can message the client, but only see the coach↔client thread (read-only) when this is explicitly granted.
- `conversations` is participant-based (`participant_a_id`/`participant_b_id`, sorted); legacy `coach_id`/`client_id` columns are now nullable (NOT NULL was dropped 2026-07-26) so staff↔staff threads work. Never reintroduce NOT NULL there.
- Team Hub (Week7) roster loads from `user_profiles` (role ≠ client) with demo fallback; all non-client roles (va, head_coach) get the Team Hub tab.
**Why:** the original schema assumed only coach↔client convos; the NOT NULL constraint silently broke staff messaging with 400s.
**How to apply:** when adding new staff roles or convo types, use the participant columns and `client_access` scopes — don't add role-specific tables.
