---
name: Silent save failures from expired sessions
description: Why "Could not save" hits all coach tools at once, and the keep-alive + audit fixes
---

# Expired-JWT save failures (diagnosed Aug 9, 2026)

**Symptom:** every save (diet, supps, workout/cardio) fails at once with the generic "Could not save…" alert, while the same saves worked earlier.

**Root cause:** direct Supabase REST writes send `sbBearer()`. When the app sleeps for hours (phone PWA especially), the stored access token expires; supabase-js hasn't refreshed it, so writes hit RLS 42501/401. Not a schema/policy problem — verified all three save paths succeed with a fresh authenticated JWT + Eden profile.

**Fix:** App root keep-alive effect calls `supabase.auth.getSession()` on visibilitychange/focus + 5-min interval, which triggers token refresh.

**How to apply:** if users report cross-tool save failures, suspect stale JWT first; test by replicating the exact REST call with a throwaway auth user + user_profiles row (profile insert needs explicit `id`, no default).

**Audit trail rule:** frontend must NEVER insert into `audit_logs` directly (the `audit_access` RLS policy is staff-wide FOR ALL — forgeable). Route through api-server `POST /audit/event` (whitelist in auditLogin.ts), which derives actor from the JWT. Plan saves (diet/supp/workout) now audit this way.
