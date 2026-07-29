---
name: COO launch-day plan
description: Agreed run order and prerequisites for the Supabase/COO session (from July 28-29, 2026 planning)
---

# COO / Supabase session plan

**Prerequisites the user (owner + COO) must do first:**
1. Upgrade Supabase to Pro (~$25/mo) — needed for reliable email + production readiness.
2. Configure custom SMTP in the Supabase dashboard (Auth → SMTP) so emails send from their domain.
3. Set the Site URL in Supabase Auth settings to the production app URL.

**Status July 29, 2026:** Prereqs done (Supabase Pro? unconfirmed, but SMTP works — Gmail app password; a "personal provider" deliverability warning stands; recommend Resend/Postmark before volume). Step 1 (#46) DONE: API server sends the login email itself via `src/lib/mailer.ts` (nodemailer, secrets SMTP_SENDER_EMAIL + SMTP_APP_PASSWORD, optional APP_URL/SMTP_HOST/SMTP_PORT). GHL webhook verified end-to-end. Temp password now only appears in coach/admin notifications when the email fails.

**Agreed run order after prerequisites (re-propose as project tasks in this order):**
1. #46 — Auto-email new clients their login details after GHL import. ✅ DONE
1b. Branded reset emails ✅ DONE: POST /api/auth/reset-request on the API server (rate-limited, anti-enumeration: instant generic response, background send; server-owned redirect only — APP_URL env or Supabase Site URL fallback). ForgotScreen in App.tsx now calls it instead of supabase.auth.resetPasswordForEmail.
2. User is on US Central time — always report times in Central.
2. Branded password-reset emails (re-propose; not currently on board).
3. Real team logins ✅ DONE (July 29): 3 staff provisioned (Alissa super_admin, Nick coach, Owner super_admin) with must_change_password + credential emails; demo accounts fully retired (profiles deactivated, auth users deleted, DEMO_USERS/demo-session/login-panel code removed). Owner = OWNER_EMAIL constant in App.tsx (no DB column); to swap owner email, edit the constant + update the Supabase Auth email.
4. Admin settings moved into the database (re-propose; not currently on board).
5. RLS lockdown ✅ DONE (July 29, phases 1+2 — see rls-lockdown.md for the scheme and gotchas). Phase-2 policy source kept at artifacts/api-server/sql/rls_phase2.sql.
6. Audit screen ✅ DONE (July 29): AdminActivityLog component in App.tsx ('activity' tab in Eden admin panel); durable audit_logs writes added for course grant/revoke (Week5) and client deactivate/reactivate/transfer (Week6).

**Launch plan complete.** Remaining board items are older tasks (#10, #30, #32, #40, #41, #47, #50).

**Why:** Email-dependent features must come after SMTP works; RLS lockdown must come after real logins exist (RLS needs real auth identities); audit screen last since audit_logs is already collecting data.

**How to apply:** When the user says they're ready for the COO/Supabase work, confirm prerequisites are done, then propose tasks in this order with dependencies. Remember: each new proposal batch cancels prior PROPOSED tasks — keep the untouched older tasks (#10, #30, #32, #40, #41, #47, #50) in mind when batching.
