-- ═══════════════════════════════════════════════════════════════════
-- 2026-08-10 — Deleted Team Hub messages can never leak their content
-- Paste this whole script into Supabase → SQL Editor → Run.
-- Safe to re-run (idempotent).
--
-- Why: deleted messages are soft-deleted and their original text is
-- admin-only. The app now reads Team Hub chat through the API server
-- (GET /api/team/messages), which redacts deleted content for
-- non-admins. This script closes the remaining hole: a member using
-- the anon key + their own JWT against the REST API directly.
--
-- What it does on team_messages:
--   • SELECT: staff in their org, but soft-deleted rows are INVISIBLE
--     to direct reads (the API server uses the service key, which
--     bypasses RLS, so admins still get the audit view and everyone
--     still sees the "Message deleted" placeholder in the app)
--   • INSERT / UPDATE / DELETE: unchanged (staff in their own org;
--     soft-delete marking still works — WITH CHECK does not require
--     deleted_at to be null)
--
-- teamUnread.js already filters deleted_at=is.null, so unread badges
-- are unaffected.
-- ═══════════════════════════════════════════════════════════════════

-- Policies are additive-permissive: drop EVERY existing policy first
-- (same approach as the phase-2 lockdown script).
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'team_messages'
  loop
    execute format('drop policy if exists %I on public.team_messages', p.policyname);
  end loop;
end $$;

alter table public.team_messages enable row level security;

create policy team_msg_select on public.team_messages for select to authenticated
using (public.is_staff()
       and (org_id is null or org_id = public.current_company_id())
       and deleted_at is null);

create policy team_msg_insert on public.team_messages for insert to authenticated
with check (public.is_staff() and (org_id is null or org_id = public.current_company_id()));

-- UPDATE: USING is evaluated against the EXISTING row, WITH CHECK against
-- the new one — so `deleted_at is null` in USING permits the soft-delete
-- transition (old row is not deleted yet) while making already-deleted
-- rows immutable to direct REST: nobody can PATCH deleted_at back to null
-- to resurrect hidden content.
create policy team_msg_update on public.team_messages for update to authenticated
using (public.is_staff() and (org_id is null or org_id = public.current_company_id())
       and deleted_at is null)
with check (public.is_staff() and (org_id is null or org_id = public.current_company_id()));

create policy team_msg_delete on public.team_messages for delete to authenticated
using (public.is_staff() and (org_id is null or org_id = public.current_company_id()));
