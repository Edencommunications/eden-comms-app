---
name: Customizable check-in forms
description: How per-org/per-coach check-in form customization is stored, resolved, and secured
---

# Customizable check-in forms

**Storage (zero DDL):** forms live in the existing `admin_settings` table — key `checkin_form` (org-wide) and `checkin_form:<coachProfileId>` (per coach), value = JSON string `{off:[standardKeys], custom:[{id,label,type}]}`. Custom metric ANSWERS are stored in `weekly_checkins.protocol_durations.__custom` (that jsonb column already had an `__others` convention). Cycle notes/pain also go into `__custom` — they never had dedicated columns.

**Resolution:** coach form → org form → standard default (everything on, no custom). Shared lib `react-app/src/lib/checkinForm.js` (registry, cache + listener hook `useCheckinForm`, same live-refresh pattern as tz.js).

**Why writes go through the API server:** admin_settings RLS is org-scoped only, so any coach could forge a REST write to the org form or another coach's form. `/api/checkin-form/save|reset` verifies the JWT and enforces: coaches → own form only; super_admins → their org + its coaches. Frontend must never write these keys via REST directly.

**How to apply:** any new per-org/per-coach setting can reuse this admin_settings key-scheme, but if scope ownership matters (coach-level keys), route writes through the api-server like this one.

**Gotcha (charts):** disabled metrics save as null; CheckInCharts preserves null (no `||0`) so charts show gaps, not fake zeros.
