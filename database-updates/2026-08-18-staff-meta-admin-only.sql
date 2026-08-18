-- ═══════════════════════════════════════════════════════════════════
-- 2026-08-18 — Stop team members from granting themselves extra access
-- Paste this whole script into Supabase → SQL Editor → Run.
-- Safe to re-run (idempotent).
--
-- Why: a staff member's tabs / custom title / Connect coach live in an
-- admin_settings row keyed `staff_meta:<profileId>`. The previous write
-- policy let ANY staff-role user in the same org insert/update rows, so
-- a tech-savvy team member could rewrite their OWN staff_meta row and
-- unlock Learn/Connect or point Connect at any coach's links.
--
-- What changes on admin_settings:
--   • SELECT unchanged — org-scoped (staff sessions still read their own
--     staff_meta row for tab gating in the app shell)
--   • INSERT/UPDATE/DELETE: staff may still write org-scoped rows, but
--     `staff_meta:%` keys now require role admin/super_admin. UPDATE pins
--     the key in WITH CHECK too, so a row can't be renamed INTO the
--     protected namespace.
--
-- The app's admin UI writes staff_meta via the API server (service key,
-- bypasses RLS) — POST /api/staff/meta — so nothing user-facing breaks.
-- ═══════════════════════════════════════════════════════════════════

-- Policies are additive-permissive: a stray legacy policy would silently
-- defeat the new ones. Drop EVERY existing policy on the table first.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'admin_settings'
  loop
    execute format('drop policy if exists %I on public.admin_settings', p.policyname);
  end loop;
end $$;

alter table public.admin_settings enable row level security;

-- Read: unchanged — any authenticated user in the same org.
create policy asettings_read on public.admin_settings for select to authenticated
using (company_id = public.current_company_id());

-- Write: staff, org-scoped, but staff_meta:* keys are admin-only.
create policy asettings_write on public.admin_settings for insert to authenticated
with check (
  public.is_staff() and company_id = public.current_company_id()
  and (key not like 'staff_meta:%' or public.my_role() in ('admin','super_admin'))
);

-- UPDATE must guard BOTH sides (USING and WITH CHECK), or a member could
-- take a row they can touch and PATCH its key into staff_meta:*.
create policy asettings_upd on public.admin_settings for update to authenticated
using (
  public.is_staff() and company_id = public.current_company_id()
  and (key not like 'staff_meta:%' or public.my_role() in ('admin','super_admin'))
)
with check (
  public.is_staff() and company_id = public.current_company_id()
  and (key not like 'staff_meta:%' or public.my_role() in ('admin','super_admin'))
);

create policy asettings_del on public.admin_settings for delete to authenticated
using (
  public.is_staff() and company_id = public.current_company_id()
  and (key not like 'staff_meta:%' or public.my_role() in ('admin','super_admin'))
);
