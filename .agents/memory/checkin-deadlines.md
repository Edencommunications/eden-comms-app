---
name: Check-in deadline model
description: Per-coach deadline time/timezone model; clients always inherit their coach's setting
---

**Rule:** Check-in deadlines are per-COACH only. `user_profiles.timezone` + `deadline_time` are read for staff; for clients, `fetchDeadline` in `lib/tz.js` IGNORES client-row values and always resolves the coach's (client-level overrides were removed by user decision — "those could get mixed up"). Defaults: 9 AM America/Chicago.

**Why:** User (Nick) rejected both org-level settings (never ran the `companies` timezone SQL — those columns DO NOT exist) and per-client overrides (confusing next to per-coach). Admin edits any coach's deadline from BOTH admin surfaces: App.tsx AdminHomeScreen Overview ("Coach Check-In Deadlines" card) and Week6 dashboard ("Check-In Status — All Coaches" rows).

**How to apply:** Never write timezone/deadline_time on client rows; never depend on `companies.timezone/deadline_time`. `clearTzCache()` now bumps a version + notifies mounted `useDeadline` hooks so they refetch — call it after any deadline save. Note: the app has TWO admin UIs (App.tsx AdminHomeScreen with Overview/Staff Access/Convos/Activity subtabs is what the user actually uses; Week6 has a parallel admin portal) — put admin features in App.tsx's panel first.

Also: demo accounts (eden.io emails, duplicate Eden Admin, demo clients Alex Carter/Jordan Williams) were hard-deleted from user_profiles + dependents on Jul 30 2026; KNOWN_USERS maps in components are now dead code (no matching auth users). Staff/client pickers must filter `is_active=not.is.false`.
