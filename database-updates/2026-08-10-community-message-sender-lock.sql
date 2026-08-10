-- ═══════════════════════════════════════════════════════════════════
-- 2026-08-10 — Stop chat members from posting under someone else's name
-- Paste this whole script into Supabase → SQL Editor → Run.
-- Safe to re-run (idempotent).
--
-- What it does on community_messages:
--   • INSERT must carry sender_id = your own profile id (public.me())
--   • UPDATE/DELETE: members may only touch their OWN messages and may
--     not reassign sender_id; staff keep full moderation (soft deletes,
--     including webhook rows with sender_id null)
--   • SELECT is unchanged (members, or staff within their org)
--
-- Webhook/automation posts (sender_id null) are unaffected: the API
-- server inserts them with the service-role key, which bypasses RLS.
-- ═══════════════════════════════════════════════════════════════════

-- Policies are additive-permissive, so a stray legacy policy would
-- silently defeat the new ones. Drop EVERY existing policy on the
-- table first (same approach as the phase-2 lockdown script).
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'community_messages'
  loop
    execute format('drop policy if exists %I on public.community_messages', p.policyname);
  end loop;
end $$;

alter table public.community_messages enable row level security;

-- Read: community members, or staff within their own org
-- (the "exists … communities" check rides on the communities org policy,
--  so staff only reach communities inside their own org)
create policy cmsg_select on public.community_messages for select to authenticated
using (public.is_community_member(community_id)
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)));

-- Write: same audience, but the row MUST be posted as yourself.
create policy cmsg_insert on public.community_messages for insert to authenticated
with check (
  sender_id = public.me()
  and (public.is_community_member(community_id)
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)))
);

-- Members: update only their own messages, and the row must still be
-- theirs afterwards (no reassigning sender_id to someone else).
create policy cmsg_update_own on public.community_messages for update to authenticated
using (sender_id = public.me() and public.is_community_member(community_id))
with check (sender_id = public.me() and public.is_community_member(community_id));

-- Staff: full moderation within their org (soft deletes of any row,
-- including webhook posts where sender_id is null).
create policy cmsg_update_staff on public.community_messages for update to authenticated
using (public.is_staff() and exists (select 1 from communities c where c.id = community_id))
with check (public.is_staff() and exists (select 1 from communities c where c.id = community_id));

-- Delete: own rows, or staff moderation. (The app only soft-deletes via
-- UPDATE; this closes direct hard-deletes of other people's rows.)
create policy cmsg_delete on public.community_messages for delete to authenticated
using ((sender_id = public.me() and public.is_community_member(community_id))
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)));

-- ── Verify ──────────────────────────────────────────────────────────
-- Should list exactly: cmsg_select, cmsg_insert, cmsg_update_own,
-- cmsg_update_staff, cmsg_delete
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'community_messages'
order by policyname;
