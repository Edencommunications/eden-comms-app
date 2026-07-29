-- ═══════════════════════════════════════════════════════════════════
-- RLS PHASE 2 — fine-grained row security
-- Clients: only their own records. Staff: only their own org.
-- Chat: participants only. Safe to re-run (idempotent).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) Helper functions (security definer = they may look up identity
--       tables without being blocked by RLS themselves) ──────────────

create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from user_profiles
  where lower(email) = lower(coalesce(auth.jwt()->>'email','')) limit 1
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from user_profiles
  where lower(email) = lower(coalesce(auth.jwt()->>'email','')) limit 1
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('coach','head_coach','admin','super_admin','va'), false)
$$;

create or replace function public.same_org(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select company_id from user_profiles where id = uid) = public.current_company_id(),
    false)
$$;

create or replace function public.is_community_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members
                 where community_id = cid and user_id = public.me())
$$;

create or replace function public.can_access_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c
                 where c.id = cid
                   and (c.participant_a_id = public.me() or c.participant_b_id = public.me()
                     or c.coach_id = public.me() or c.client_id = public.me()
                     or (public.is_staff()
                         and (c.company_id is null or c.company_id = public.current_company_id()))))
      or exists (select 1 from conversation_participants cp
                 where cp.conversation_id = cid and cp.user_id = public.me())
$$;

-- ── 2) Client-owned tables: client sees own rows; staff see their org ─

do $$
declare t text; p record;
begin
  foreach t in array array[
    'checkin_status','client_intakes','client_recipes','client_workout_logs',
    'coach_responses','coach_updates','consultation_notes','diet_plans',
    'food_log_entries','habit_logs','lab_results','prescriptions',
    'progress_photos','supplement_protocols','weekly_checkins',
    'workout_logs','workout_plans'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy client_owned on public.%I for all to authenticated
       using (client_id = public.me() or (public.is_staff() and public.same_org(client_id)))
       with check (client_id = public.me() or (public.is_staff() and public.same_org(client_id)))', t);
  end loop;
end $$;

-- ── 3) Per-table rules for everything else ──────────────────────────

do $$
declare t text; p record;
begin
  foreach t in array array[
    'conversations','conversation_participants','messages','message_pins',
    'conversation_files','community_members','community_messages','team_messages',
    'notifications','lab_comments','broadcast_messages','course_progress',
    'course_access','recipe_access','coach_settings','coach_social_links',
    'login_sessions','audit_logs','admin_audit_log','global_config',
    'course_modules','packages','companies','huddle_rooms',
    'prescription_tapers','supplement_items','supplement_custom_text',
    'user_profiles','client_access','company_intake_secrets','admin_settings'
  ] loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Chat: participants (or staff) only
create policy convo_access on public.conversations for all to authenticated
using ((public.is_staff() and (company_id is null or company_id = public.current_company_id()))
       or participant_a_id = public.me() or participant_b_id = public.me()
       or coach_id = public.me() or client_id = public.me()
       or exists (select 1 from conversation_participants cp
                  where cp.conversation_id = id and cp.user_id = public.me()))
with check ((public.is_staff() and (company_id is null or company_id = public.current_company_id()))
       or participant_a_id = public.me() or participant_b_id = public.me()
       or coach_id = public.me() or client_id = public.me());

create policy cp_access on public.conversation_participants for all to authenticated
using (user_id = public.me() or public.can_access_conversation(conversation_id))
with check (user_id = public.me() or public.can_access_conversation(conversation_id));

-- Messages: read/update within your conversations; new messages must be
-- sent as yourself (no impersonation); delete = own messages or staff.
create policy msg_read on public.messages for select to authenticated
using (public.can_access_conversation(conversation_id));
create policy msg_ins on public.messages for insert to authenticated
with check (sender_id = public.me() and public.can_access_conversation(conversation_id));
create policy msg_upd on public.messages for update to authenticated
using (public.can_access_conversation(conversation_id))
with check (public.can_access_conversation(conversation_id));
create policy msg_del on public.messages for delete to authenticated
using (sender_id = public.me() or (public.is_staff() and public.can_access_conversation(conversation_id)));

create policy pin_access on public.message_pins for all to authenticated
using (user_id = public.me() or pinned_by = public.me() or public.is_staff()
       or (conversation_id is not null and public.can_access_conversation(conversation_id)))
with check (user_id = public.me() or pinned_by = public.me() or public.is_staff()
       or (conversation_id is not null and public.can_access_conversation(conversation_id)));

create policy cf_access on public.conversation_files for all to authenticated
using (public.can_access_conversation(conversation_id))
with check (public.can_access_conversation(conversation_id));

-- Communities: members (or staff) only
-- (the "exists … communities" check rides on the communities org policy,
--  so staff only reach communities inside their own org)
create policy cm_access on public.community_members for all to authenticated
using (user_id = public.me() or public.is_community_member(community_id)
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)))
with check (user_id = public.me()
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)));

create policy cmsg_access on public.community_messages for all to authenticated
using (public.is_community_member(community_id)
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)))
with check (public.is_community_member(community_id)
       or (public.is_staff() and exists (select 1 from communities c where c.id = community_id)));

-- Team chat: staff in their own org only
create policy team_access on public.team_messages for all to authenticated
using (public.is_staff() and (org_id is null or org_id = public.current_company_id()))
with check (public.is_staff() and (org_id is null or org_id = public.current_company_id()));

-- Notifications: yours (sent or received); staff can manage
create policy notif_access on public.notifications for all to authenticated
using (recipient_id = public.me() or sender_id = public.me()
       or (public.is_staff() and (recipient_id is null or public.same_org(recipient_id))))
with check (sender_id = public.me()
       or (public.is_staff() and (recipient_id is null or public.same_org(recipient_id))));

-- Lab comments: staff, or the client the lab belongs to
create policy labc_access on public.lab_comments for all to authenticated
using (public.is_staff() or exists (select 1 from lab_results l where l.id = lab_id and l.client_id = public.me()))
with check (public.is_staff() or exists (select 1 from lab_results l where l.id = lab_id and l.client_id = public.me()));

-- Broadcasts: everyone signed-in may read; only staff write
create policy bc_read  on public.broadcast_messages for select to authenticated using (true);
create policy bc_write on public.broadcast_messages for insert to authenticated with check (public.is_staff());
create policy bc_upd   on public.broadcast_messages for update to authenticated using (public.is_staff());
create policy bc_del   on public.broadcast_messages for delete to authenticated using (public.is_staff());

-- Own rows or staff
create policy cprog_access on public.course_progress for all to authenticated
using (user_id = public.me() or public.is_staff())
with check (user_id = public.me() or public.is_staff());

create policy caccess_read on public.course_access for select to authenticated
using (user_id = public.me() or public.is_staff());
create policy caccess_write on public.course_access for insert to authenticated with check (public.is_staff());
create policy caccess_upd on public.course_access for update to authenticated using (public.is_staff());
create policy caccess_del on public.course_access for delete to authenticated using (public.is_staff());

create policy raccess_read on public.recipe_access for select to authenticated
using (user_id = public.me() or public.is_staff());
create policy raccess_write on public.recipe_access for insert to authenticated with check (public.is_staff());
create policy raccess_upd on public.recipe_access for update to authenticated using (public.is_staff());
create policy raccess_del on public.recipe_access for delete to authenticated using (public.is_staff());

create policy csettings_access on public.coach_settings for all to authenticated
using (user_id = public.me() or public.is_staff())
with check (user_id = public.me() or public.is_staff());

create policy csocial_read on public.coach_social_links for select to authenticated using (true);
create policy csocial_write on public.coach_social_links for all to authenticated
using (coach_id = public.me() or public.is_staff())
with check (coach_id = public.me() or public.is_staff());

create policy sessions_ins on public.login_sessions for insert to authenticated with check (user_id = public.me());
create policy sessions_upd on public.login_sessions for update to authenticated using (user_id = public.me() or public.is_staff());
create policy sessions_read on public.login_sessions for select to authenticated using (user_id = public.me() or public.is_staff());

-- Audit trails: staff only
create policy audit_access on public.audit_logs for all to authenticated
using (public.is_staff()) with check (public.is_staff());
create policy aal_access on public.admin_audit_log for all to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Reference data: read for all signed-in, write for staff
create policy gc_read on public.global_config for select to authenticated using (true);
create policy gc_write on public.global_config for insert to authenticated with check (public.is_staff());
create policy gc_upd on public.global_config for update to authenticated using (public.is_staff());
create policy gc_del on public.global_config for delete to authenticated using (public.is_staff());

create policy cmod_read on public.course_modules for select to authenticated using (true);
create policy cmod_write on public.course_modules for insert to authenticated with check (public.is_staff());
create policy cmod_upd on public.course_modules for update to authenticated using (public.is_staff());
create policy cmod_del on public.course_modules for delete to authenticated using (public.is_staff());

create policy pkg_read on public.packages for select to authenticated using (true);
create policy pkg_write on public.packages for insert to authenticated with check (public.is_staff());
create policy pkg_upd on public.packages for update to authenticated using (public.is_staff());
create policy pkg_del on public.packages for delete to authenticated using (public.is_staff());

create policy comp_read on public.companies for select to authenticated using (true);
create policy comp_write on public.companies for insert to authenticated with check (public.is_staff());
create policy comp_upd on public.companies for update to authenticated using (public.is_staff());
create policy comp_del on public.companies for delete to authenticated using (public.is_staff());

create policy huddle_read on public.huddle_rooms for select to authenticated
using (org_id is null or org_id = public.current_company_id());
create policy huddle_write on public.huddle_rooms for insert to authenticated with check (public.is_staff());
create policy huddle_upd on public.huddle_rooms for update to authenticated using (public.is_staff());
create policy huddle_del on public.huddle_rooms for delete to authenticated using (public.is_staff());

-- Child tables inherit access from their parent record
create policy taper_access on public.prescription_tapers for all to authenticated
using (public.is_staff() or exists (select 1 from prescriptions pr where pr.id = prescription_id and pr.client_id = public.me()))
with check (public.is_staff() or exists (select 1 from prescriptions pr where pr.id = prescription_id and pr.client_id = public.me()));

create policy sitem_access on public.supplement_items for all to authenticated
using (public.is_staff() or exists (select 1 from supplement_protocols sp where sp.id = protocol_id and sp.client_id = public.me()))
with check (public.is_staff() or exists (select 1 from supplement_protocols sp where sp.id = protocol_id and sp.client_id = public.me()));

create policy stext_access on public.supplement_custom_text for all to authenticated
using (public.is_staff() or exists (select 1 from supplement_protocols sp where sp.id = protocol_id and sp.client_id = public.me()))
with check (public.is_staff() or exists (select 1 from supplement_protocols sp where sp.id = protocol_id and sp.client_id = public.me()));

-- Organizations: anyone may read branding (incl. pre-login); only staff write
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='public' and tablename='organizations' loop
    execute format('drop policy %I on public.organizations', p.policyname);
  end loop;
end $$;
create policy org_read_anon on public.organizations for select to anon using (true);
create policy org_read_auth on public.organizations for select to authenticated using (true);
create policy org_write on public.organizations for insert to authenticated with check (public.is_staff());
create policy org_upd on public.organizations for update to authenticated using (public.is_staff());
create policy org_del on public.organizations for delete to authenticated using (public.is_staff());

-- Profiles: whole org may read (names/avatars); only you or staff may edit you
create policy profiles_read on public.user_profiles for select to authenticated
using (company_id is null or company_id = public.current_company_id());
create policy profiles_ins on public.user_profiles for insert to authenticated
with check (public.is_staff() and (company_id is null or company_id = public.current_company_id()));
-- Self-edit: you may update your own row, but NOT change your role, org, or email
create policy profiles_upd_self on public.user_profiles for update to authenticated
using (id = public.me())
with check (id = public.me()
            and role = public.my_role()
            and company_id is not distinct from public.current_company_id()
            and lower(email) = lower(coalesce(auth.jwt()->>'email','')));
-- Admins manage anyone in their org; other staff manage client rows only
create policy profiles_upd_admin on public.user_profiles for update to authenticated
using (public.my_role() in ('admin','super_admin','head_coach')
       and (company_id is null or company_id = public.current_company_id()))
with check (public.my_role() in ('admin','super_admin','head_coach')
       and (company_id is null or company_id = public.current_company_id()));
create policy profiles_upd_staff on public.user_profiles for update to authenticated
using (public.is_staff() and role = 'client'
       and (company_id is null or company_id = public.current_company_id()))
with check (public.is_staff() and role = 'client'
       and (company_id is null or company_id = public.current_company_id()));
create policy profiles_del on public.user_profiles for delete to authenticated
using (public.my_role() in ('admin','super_admin')
       and (company_id is null or company_id = public.current_company_id()));

-- Staff-only org tables (clients have no business here)
create policy ca_access on public.client_access for all to authenticated
using (public.is_staff() and (company_id is null or company_id = public.current_company_id()))
with check (public.is_staff() and (company_id is null or company_id = public.current_company_id()));

create policy secrets_access on public.company_intake_secrets for all to authenticated
using (public.is_staff() and company_id = public.current_company_id())
with check (public.is_staff() and company_id = public.current_company_id());

create policy asettings_read on public.admin_settings for select to authenticated
using (company_id = public.current_company_id());
create policy asettings_write on public.admin_settings for insert to authenticated
with check (public.is_staff() and company_id = public.current_company_id());
create policy asettings_upd on public.admin_settings for update to authenticated
using (public.is_staff() and company_id = public.current_company_id());
create policy asettings_del on public.admin_settings for delete to authenticated
using (public.is_staff() and company_id = public.current_company_id());
