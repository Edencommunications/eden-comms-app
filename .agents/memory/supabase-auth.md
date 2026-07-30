---
name: Supabase Auth model
description: How real authentication works after the temp-password migration, and dashboard-side constraints.
---

Rule: Passwords live only in Supabase Auth (hashed). `user_profiles` remains the app identity record (looked up by email, ids differ from auth user ids) and must never store passwords; `temp_password` is legacy-only and is nulled on first successful migration login.

**Why:** Original demo auth stored plain-text temp passwords in `user_profiles` with no change/reset path.

**How to apply:**
- New accounts (GHL webhook, admin add, bulk add) must be provisioned server-side via the API server's auth provisioning (service role key, `SUPABASE_SERVICE_ROLE_KEY` secret) as pre-confirmed users with `user_metadata.must_change_password=true` — anon-key signUp is unusable (email confirmation is ON, blocks sign-in).
- Login order: hardcoded DEMO_USERS → supabase signInWithPassword → one-time `/api/auth/migrate` fallback that verifies legacy temp_password, creates the auth user, clears the plain-text column.
- Change/set password = client-side `supabase.auth.updateUser` (needs the auth session; demo logins have none, so the UI hides it).
- Dashboard constraints (user-owned, not fixable from workspace): Site URL was `http://localhost:3000` — reset-email links break until user sets Site URL / redirect allow-list; built-in mailer is rate-limited (~2 emails/hour) until custom SMTP is configured.
- The auth admin API can also delete test users; always clean up test auth users AND their `user_profiles` rows.

**Bulk roster import:** POST /api/admin/bulk-import (admin JWT) creates coaches before clients from CSV rows; skips existing profiles. Orphan auth users (auth account, no profile — from past partial failures) get their password explicitly reset via GoTrue admin PUT before temp credentials are issued — never trust `existed:true` from provisioning to mean the generated password is valid.
