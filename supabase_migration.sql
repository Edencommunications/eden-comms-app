-- ============================================================
-- Eden Communications — Full Supabase Migration
-- Run this entire script in your Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste → Run
--
-- IMPORTANT: This app uses the anon key without Supabase Auth
-- sessions, so all RLS policies use "true" (open) checks.
-- When you add real Supabase Auth, swap "true" for
-- auth.uid() = client_id / role checks.
-- ============================================================


-- ── 0. USER PROFILES ────────────────────────────────────────
-- Central profile table. One row per user (coach or client).
-- update_day is the weekday the client must submit by 9 AM CST.

create table if not exists public.user_profiles (
  id           uuid        primary key default gen_random_uuid(),
  email        text        unique,
  name         text,
  initials     text,
  role         text        not null default 'client',  -- 'client' | 'coach' | 'super_admin'
  company_id   uuid,
  update_day   text,       -- 'Monday' | 'Tuesday' | … | 'Sunday' — coach-assigned check-in day
  created_at   timestamptz not null default now()
);

-- Add update_day if this table already existed without it
alter table public.user_profiles
  add column if not exists update_day text;

create index if not exists user_profiles_email_idx
  on public.user_profiles (email);

create index if not exists user_profiles_company_idx
  on public.user_profiles (company_id, role);

-- RLS — open policies so the anon key works without a real Auth session.
-- Replace "using (true)" with auth.uid() checks once you add Supabase Auth.
alter table public.user_profiles enable row level security;

drop policy if exists "Anon select user_profiles"  on public.user_profiles;
drop policy if exists "Anon insert user_profiles"  on public.user_profiles;
drop policy if exists "Anon update user_profiles"  on public.user_profiles;

create policy "Anon select user_profiles"
  on public.user_profiles for select using (true);

create policy "Anon insert user_profiles"
  on public.user_profiles for insert with check (true);

create policy "Anon update user_profiles"
  on public.user_profiles for update using (true) with check (true);


-- ── SEED DATA ────────────────────────────────────────────────
-- Known demo users. Jordan is assigned Wednesday.
-- on conflict = safe to re-run without wiping existing data.

insert into public.user_profiles (id, email, name, initials, role, update_day, company_id)
values
  (
    '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
    'coach@eden.io',
    'Coach Marcus',
    'CM',
    'coach',
    null,
    'aaaaaaaa-0000-0000-0000-000000000001'
  ),
  (
    'ece58b33-3f2a-4ce7-bed9-a157c914056c',
    'client@eden.io',
    'Jordan Williams',
    'JW',
    'client',
    'Wednesday',                   -- ← Jordan's assigned check-in day
    'aaaaaaaa-0000-0000-0000-000000000001'
  )
on conflict (id) do update
  set
    email      = excluded.email,
    name       = excluded.name,
    initials   = excluded.initials,
    role       = excluded.role,
    company_id = excluded.company_id,
    -- Only overwrite update_day when the seed value is not null,
    -- so a coach's live assignment is never clobbered by a re-run.
    update_day = coalesce(public.user_profiles.update_day, excluded.update_day);


-- ── 1. WEEKLY CHECK-INS ─────────────────────────────────────
-- Every weekly check-in a client submits.

create table if not exists public.weekly_checkins (
  id               uuid        primary key default gen_random_uuid(),
  client_id        uuid        not null references public.user_profiles(id),
  coach_id         uuid        not null references public.user_profiles(id),
  submitted_at     timestamptz not null default now(),

  -- Vitals
  weight           text,
  temp             text,
  steps            text,
  heart_rate       text,
  hrv              text,
  blood_pressure   text,

  -- Wellbeing scores (1–10)
  energy           int2,
  sleep            int2,
  bloating         int2,
  brain_fog        int2,
  sex_drive        int2,
  hunger           int2,
  stress           int2,
  compliance       int2,
  mood             text,

  -- Sleep details
  sleep_window     text,
  sleep_cycles     text,
  sleep_disruption text,

  -- Digestion
  bowel_count      text,
  bowel_type       text,

  -- Notes
  notes            text,

  -- Habits (JSON object of { habitId: count })
  habits           jsonb,
  habit_pct        int2,

  -- Per-meal adjustment notes from client, e.g. {"Meal 1":"skipped carbs","Meal 3":"added rice"}
  meal_notes       jsonb
);

alter table public.weekly_checkins
  add column if not exists meal_notes jsonb;

create index if not exists weekly_checkins_client_idx
  on public.weekly_checkins (client_id, submitted_at desc);

alter table public.weekly_checkins enable row level security;

drop policy if exists "Anon select weekly_checkins" on public.weekly_checkins;
drop policy if exists "Anon insert weekly_checkins" on public.weekly_checkins;
drop policy if exists "Anon update weekly_checkins" on public.weekly_checkins;

create policy "Anon select weekly_checkins"
  on public.weekly_checkins for select using (true);

create policy "Anon insert weekly_checkins"
  on public.weekly_checkins for insert with check (true);

create policy "Anon update weekly_checkins"
  on public.weekly_checkins for update using (true) with check (true);


-- ── 2. COACH RESPONSES ──────────────────────────────────────
-- Coach's written feedback + Loom link per client check-in.

create table if not exists public.coach_responses (
  id            uuid        primary key default gen_random_uuid(),
  client_id     uuid        not null references public.user_profiles(id),
  coach_id      uuid        not null references public.user_profiles(id),
  checkin_date  text        not null,   -- display date, e.g. "Jul 9 2026"
  coach_notes   text,
  coach_loom    text,
  updated_at    timestamptz not null default now(),

  unique (client_id, checkin_date)
);

create index if not exists coach_responses_client_idx
  on public.coach_responses (client_id);

alter table public.coach_responses enable row level security;

drop policy if exists "Anon select coach_responses" on public.coach_responses;
drop policy if exists "Anon insert coach_responses" on public.coach_responses;
drop policy if exists "Anon update coach_responses" on public.coach_responses;

create policy "Anon select coach_responses"
  on public.coach_responses for select using (true);

create policy "Anon insert coach_responses"
  on public.coach_responses for insert with check (true);

create policy "Anon update coach_responses"
  on public.coach_responses for update using (true) with check (true);


-- ── 3. COACH UPDATES ────────────────────────────────────────
-- Standalone coach posts visible to the client in Check-In tab.

create table if not exists public.coach_updates (
  id          uuid        primary key default gen_random_uuid(),
  coach_id    uuid        not null references public.user_profiles(id),
  client_id   uuid        not null references public.user_profiles(id),
  date        text        not null,   -- display date, e.g. "Jul 14 2026"
  note        text,
  loom        text,
  created_at  timestamptz not null default now()
);

create index if not exists coach_updates_client_idx
  on public.coach_updates (client_id, created_at desc);

alter table public.coach_updates enable row level security;

drop policy if exists "Anon select coach_updates" on public.coach_updates;
drop policy if exists "Anon insert coach_updates" on public.coach_updates;
drop policy if exists "Anon update coach_updates" on public.coach_updates;
drop policy if exists "Anon delete coach_updates" on public.coach_updates;

create policy "Anon select coach_updates"
  on public.coach_updates for select using (true);

create policy "Anon insert coach_updates"
  on public.coach_updates for insert with check (true);

create policy "Anon update coach_updates"
  on public.coach_updates for update using (true) with check (true);

create policy "Anon delete coach_updates"
  on public.coach_updates for delete using (true);


-- ── 4. PROGRESS PHOTOS ──────────────────────────────────────
-- Metadata for photos stored in the "progress-photos" bucket.

create table if not exists public.progress_photos (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references public.user_profiles(id),
  week_label  text,                   -- e.g. "Week 3"
  photo_url   text        not null,   -- public Storage URL
  file_name   text,
  file_size   bigint,
  notes       text,
  taken_at    timestamptz not null default now()
);

create index if not exists progress_photos_client_idx
  on public.progress_photos (client_id, taken_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "Anon select progress_photos" on public.progress_photos;
drop policy if exists "Anon insert progress_photos" on public.progress_photos;
drop policy if exists "Anon delete progress_photos" on public.progress_photos;

create policy "Anon select progress_photos"
  on public.progress_photos for select using (true);

create policy "Anon insert progress_photos"
  on public.progress_photos for insert with check (true);

create policy "Anon delete progress_photos"
  on public.progress_photos for delete using (true);


-- ── 5. CLIENT RECIPES ───────────────────────────────────────
-- Recipes a coach assigns to a specific client, slotted into meals.

create table if not exists public.client_recipes (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references public.user_profiles(id),
  coach_id     uuid        not null references public.user_profiles(id),
  recipe_name  text        not null,
  recipe_data  jsonb,      -- { name, cal, pro, fat, carb, fib, category }
  meal_name    text,       -- which meal slot, e.g. "Meal 2"
  assigned_at  timestamptz not null default now()
);

alter table public.client_recipes
  add column if not exists meal_name text;

create index if not exists client_recipes_client_idx
  on public.client_recipes (client_id, assigned_at desc);

alter table public.client_recipes enable row level security;

drop policy if exists "Anon select client_recipes" on public.client_recipes;
drop policy if exists "Anon insert client_recipes" on public.client_recipes;
drop policy if exists "Anon update client_recipes" on public.client_recipes;
drop policy if exists "Anon delete client_recipes" on public.client_recipes;

create policy "Anon select client_recipes"
  on public.client_recipes for select using (true);

create policy "Anon insert client_recipes"
  on public.client_recipes for insert with check (true);

create policy "Anon update client_recipes"
  on public.client_recipes for update using (true) with check (true);

create policy "Anon delete client_recipes"
  on public.client_recipes for delete using (true);


-- ── 6. DIET PLANS ───────────────────────────────────────────
-- The coach's saved diet plan for a client (high/low day meals + targets).

create table if not exists public.diet_plans (
  id              uuid        primary key default gen_random_uuid(),
  client_id       uuid        not null references public.user_profiles(id),
  coach_id        uuid        not null references public.user_profiles(id),
  protocol        text,
  high_day_meals  jsonb,
  low_day_meals   jsonb,
  targets         jsonb,
  updated_at      timestamptz not null default now()
);

create index if not exists diet_plans_client_idx
  on public.diet_plans (client_id, updated_at desc);

alter table public.diet_plans enable row level security;

drop policy if exists "Anon select diet_plans" on public.diet_plans;
drop policy if exists "Anon insert diet_plans" on public.diet_plans;
drop policy if exists "Anon update diet_plans" on public.diet_plans;

create policy "Anon select diet_plans"
  on public.diet_plans for select using (true);

create policy "Anon insert diet_plans"
  on public.diet_plans for insert with check (true);

create policy "Anon update diet_plans"
  on public.diet_plans for update using (true) with check (true);


-- ── 7. CONVERSATIONS & MESSAGES ─────────────────────────────
-- Messaging between coaches and clients.

create table if not exists public.conversations (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid,
  created_at   timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          uuid not null references public.user_profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id               uuid        primary key default gen_random_uuid(),
  conversation_id  uuid        not null references public.conversations(id) on delete cascade,
  sender_id        uuid        not null references public.user_profiles(id),
  content          text,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conv_idx
  on public.messages (conversation_id, created_at asc);

alter table public.conversations            enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                 enable row level security;

drop policy if exists "Anon select conversations"             on public.conversations;
drop policy if exists "Anon insert conversations"             on public.conversations;
drop policy if exists "Anon select conversation_participants" on public.conversation_participants;
drop policy if exists "Anon insert conversation_participants" on public.conversation_participants;
drop policy if exists "Anon select messages"                  on public.messages;
drop policy if exists "Anon insert messages"                  on public.messages;

create policy "Anon select conversations"              on public.conversations             for select using (true);
create policy "Anon insert conversations"              on public.conversations             for insert with check (true);
create policy "Anon select conversation_participants"  on public.conversation_participants for select using (true);
create policy "Anon insert conversation_participants"  on public.conversation_participants for insert with check (true);
create policy "Anon select messages"                   on public.messages                 for select using (true);
create policy "Anon insert messages"                   on public.messages                 for insert with check (true);


-- ── 8. CLIENT ACCESS (staff permissions) ────────────────────
-- Which staff members can see which clients, and what they can access.

create table if not exists public.client_access (
  id           uuid    primary key default gen_random_uuid(),
  company_id   uuid,
  staff_id     uuid    not null references public.user_profiles(id),
  client_id    uuid    not null references public.user_profiles(id),
  permissions  jsonb   default '{}',   -- { messages:true, diet:true, labs:false, … }
  unique (staff_id, client_id)
);

alter table public.client_access enable row level security;

drop policy if exists "Anon select client_access" on public.client_access;
drop policy if exists "Anon insert client_access" on public.client_access;
drop policy if exists "Anon update client_access" on public.client_access;

create policy "Anon select client_access"
  on public.client_access for select using (true);

create policy "Anon insert client_access"
  on public.client_access for insert with check (true);

create policy "Anon update client_access"
  on public.client_access for update using (true) with check (true);


-- ── 9. STORAGE BUCKET ───────────────────────────────────────
-- Create this manually in the Supabase dashboard:
--   Storage → New Bucket → Name: progress-photos → Public ✓
--
-- If you prefer SQL (requires service-role key, not anon):
-- insert into storage.buckets (id, name, public)
-- values ('progress-photos', 'progress-photos', true)
-- on conflict (id) do nothing;
--
-- Storage RLS (run after bucket exists):
-- create policy "Public read progress photos"
--   on storage.objects for select using (bucket_id = 'progress-photos');
--
-- create policy "Anon upload progress photos"
--   on storage.objects for insert with check (bucket_id = 'progress-photos');


-- ── DONE ─────────────────────────────────────────────────────
-- After running this script:
--
-- 1. Jordan Williams is seeded with update_day = 'Wednesday'.
--    Coach can change it any time via the client detail modal —
--    the new value persists in Supabase and the client sees it
--    immediately on next load.
--
-- 2. Create the "progress-photos" Storage bucket manually
--    (Storage → New Bucket → toggle Public ON).
--
-- 3. All RLS policies are open (anon-friendly) for the demo.
--    When you add Supabase Auth, swap "using (true)" for
--    proper auth.uid() = client_id / role-based checks.
