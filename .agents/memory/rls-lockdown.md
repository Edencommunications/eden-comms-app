---
name: RLS lockdown (phase 1)
description: How row-level security is wired — frontend JWT headers, policy scheme, and gotchas
---

# RLS lockdown — done July 29, 2026 (phase 1)

**Scheme:** RLS enabled on every public table. Tables with a `company_id` column get `org_scoped` policy (`company_id is null or company_id = current_company_id()`); all others get `authenticated_all`. `current_company_id()` is a security-definer SQL function resolving the org from `auth.jwt()->>'email'` (profile ids ≠ auth ids, so email is the join key). Anon may only SELECT `organizations` (branded login page). Storage buckets (chat-media, lab-files, org-logos, progress-photos) are authenticated-only via one storage.objects policy.

**Frontend:** every raw REST/storage call sends the user's live JWT. Shared helper `react-app/src/lib/sbAuth.js` (`sbBearer()`, `sbAccessToken()`) reads the supabase-js session from localStorage (`sb-*-auth-token`) at call time. Module-scope header consts use `get Authorization(){ return sbBearer() }` getters so token refreshes are picked up and spreads still work. Week6 realtime calls `sb.realtime.setAuth(token)` after createClient.

**Server:** api-server (broadcastScheduler, ghlIntake, auth dbGet) uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) — never the anon key for server-side DB work.

**Why:** the anon key ships in the JS bundle; before RLS anyone could read/write the whole DB.

**Gotchas:**
- Policies are additive-permissive: early-dev "allow all" policies silently defeated the new ones. The final SQL loops pg_policies and drops EVERY existing policy per table before recreating. Any future policy work should assume stray legacy policies may exist.
- Any new frontend REST call must include the Authorization getter (import sbBearer) or it returns empty under RLS.
- Phase 2 (not done): per-row policies on tables without company_id (messages, course_progress, etc.) — currently any authenticated user passes; isolation there is still app-level.
- Identity-carrying columns (sender_id etc.) need per-verb policies, and the UPDATE policy must ALSO pin the column (`sender_id = me()` in both USING and WITH CHECK for non-staff) — otherwise a member inserts as themself then PATCHes sender_id to a victim. One-off policy scripts must drop ALL existing policies on the table first (additive-permissive), and every policy change ships as a paste-and-run script mirrored into the rerunnable lockdown script.

**How to apply:** when adding tables, add company_id where sensible and re-run the policy DO-block; when adding frontend fetch helpers, copy the header-getter pattern from any component.

## Notifications mark-read pitfall
The `notif_access` policy's WITH CHECK only allows `sender_id = me()` or staff — a CLIENT updating a received notification passes USING but fails WITH CHECK, so browser PATCHes silently update 0 rows. Mark-read must go through api-server `/notifs/read` + `/notifs/read-all` (service key, recipient verified from JWT). Any future client-side UPDATE on a table with asymmetric USING/WITH CHECK has the same trap — route it through the api-server.
