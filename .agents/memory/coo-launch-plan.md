---
name: COO launch-day plan
description: Agreed run order and prerequisites for the Supabase/COO session (from July 28-29, 2026 planning)
---

# COO / Supabase session plan

**Prerequisites the user (owner + COO) must do first:**
1. Upgrade Supabase to Pro (~$25/mo) — needed for reliable email + production readiness.
2. Configure custom SMTP in the Supabase dashboard (Auth → SMTP) so emails send from their domain.
3. Set the Site URL in Supabase Auth settings to the production app URL.

**Agreed run order after prerequisites (re-propose as project tasks in this order):**
1. #46 — Auto-email new clients their login details after GHL import.
2. Branded password-reset emails (re-propose; not currently on board).
3. #65 — Real team logins, retire demo accounts, plus Owner account & email-swap flow.
4. Admin settings moved into the database (re-propose; not currently on board).
5. #66 — RLS lockdown (per-user database security rules).
6. #67 — Full audit tracking/logging with admin review screen (audit_logs table already exists and receives message-deletion entries).

**Why:** Email-dependent features must come after SMTP works; RLS lockdown must come after real logins exist (RLS needs real auth identities); audit screen last since audit_logs is already collecting data.

**How to apply:** When the user says they're ready for the COO/Supabase work, confirm prerequisites are done, then propose tasks in this order with dependencies. Remember: each new proposal batch cancels prior PROPOSED tasks — keep the untouched older tasks (#10, #30, #32, #40, #41, #47, #50) in mind when batching.
