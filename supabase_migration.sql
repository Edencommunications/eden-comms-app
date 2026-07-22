-- ============================================================
-- Eden Communications — Full Supabase Migration
-- Run this entire script in your Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query → paste → Run)
-- ============================================================

-- ── 1. WEEKLY CHECK-INS ─────────────────────────────────────
-- Stores every weekly check-in submitted by a client

create table if not exists public.weekly_checkins (
  id               uuid        primary key default gen_random_uuid(),
  client_id        uuid        not null,
  coach_id         uuid        not null,
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
  meal_notes       jsonb    -- per-meal adjustment notes from client, e.g. {"Meal 1":"skipped carbs"}
);

-- If you already ran the previous migration, add the column with:
-- alter table public.weekly_checkins add column if not exists meal_notes jsonb;

-- Index for fast client lookups
create index if not exists weekly_checkins_client_idx
  on public.weekly_checkins (client_id, submitted_at desc);

-- RLS
alter table public.weekly_checkins enable row level security;

drop policy if exists "Clients can insert own checkins"   on public.weekly_checkins;
drop policy if exists "Clients can read own checkins"     on public.weekly_checkins;
drop policy if exists "Coaches can read all checkins"     on public.weekly_checkins;

create policy "Clients can insert own checkins"
  on public.weekly_checkins for insert
  with check (auth.uid() = client_id);

create policy "Clients can read own checkins"
  on public.weekly_checkins for select
  using (auth.uid() = client_id);

create policy "Coaches can read all checkins"
  on public.weekly_checkins for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  );


-- ── 2. COACH RESPONSES ──────────────────────────────────────
-- Stores the coach's written feedback + Loom link for each
-- individual client check-in, keyed by client + date string.

create table if not exists public.coach_responses (
  id            uuid        primary key default gen_random_uuid(),
  client_id     uuid        not null,
  coach_id      uuid        not null,
  checkin_date  text        not null,   -- e.g. "Jul 9 2026"
  coach_notes   text,
  coach_loom    text,
  updated_at    timestamptz not null default now(),

  unique (client_id, checkin_date)
);

create index if not exists coach_responses_client_idx
  on public.coach_responses (client_id);

alter table public.coach_responses enable row level security;

drop policy if exists "Coaches can upsert responses"    on public.coach_responses;
drop policy if exists "Clients can read own responses"  on public.coach_responses;

create policy "Coaches can upsert responses"
  on public.coach_responses for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  );

create policy "Clients can read own responses"
  on public.coach_responses for select
  using (auth.uid() = client_id);


-- ── 3. COACH UPDATES ────────────────────────────────────────
-- Standalone updates a coach posts for a client (no check-in
-- required). Visible to the client in their Check-In tab.

create table if not exists public.coach_updates (
  id          uuid        primary key default gen_random_uuid(),
  coach_id    uuid        not null,
  client_id   uuid        not null,
  date        text        not null,   -- display date e.g. "Jul 14 2026"
  note        text,
  loom        text,
  created_at  timestamptz not null default now()
);

create index if not exists coach_updates_client_idx
  on public.coach_updates (client_id, created_at desc);

alter table public.coach_updates enable row level security;

drop policy if exists "Coaches can manage updates"     on public.coach_updates;
drop policy if exists "Clients can read own updates"   on public.coach_updates;

create policy "Coaches can manage updates"
  on public.coach_updates for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  );

create policy "Clients can read own updates"
  on public.coach_updates for select
  using (auth.uid() = client_id);


-- ── 4. PROGRESS PHOTOS ──────────────────────────────────────
-- Metadata for client progress photos stored in the
-- "progress-photos" Storage bucket.

create table if not exists public.progress_photos (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null,
  week_label  text,                   -- e.g. "Week 3"
  photo_url   text        not null,   -- public storage URL
  file_name   text,
  file_size   bigint,
  notes       text,
  taken_at    timestamptz not null default now()
);

create index if not exists progress_photos_client_idx
  on public.progress_photos (client_id, taken_at desc);

alter table public.progress_photos enable row level security;

drop policy if exists "Clients can insert own photos"   on public.progress_photos;
drop policy if exists "Clients can read own photos"     on public.progress_photos;
drop policy if exists "Coaches can read all photos"     on public.progress_photos;

create policy "Clients can insert own photos"
  on public.progress_photos for insert
  with check (auth.uid() = client_id);

create policy "Clients can read own photos"
  on public.progress_photos for select
  using (auth.uid() = client_id);

create policy "Coaches can read all photos"
  on public.progress_photos for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  );


-- ── 5. CLIENT RECIPES ───────────────────────────────────────
-- Individual recipes a coach assigns to a specific client.
-- Client can see these unlocked on their diet screen.

create table if not exists public.client_recipes (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null,
  coach_id     uuid        not null,
  recipe_name  text        not null,
  recipe_data  jsonb,                   -- full recipe object { name, cal, pro, fat, carb, fib, category }
  meal_name    text,                    -- which meal this recipe is slotted into, e.g. "Meal 2"
  assigned_at  timestamptz not null default now()
);

-- If you already ran the previous migration, add the column with:
-- alter table public.client_recipes add column if not exists meal_name text;

create index if not exists client_recipes_client_idx
  on public.client_recipes (client_id, assigned_at desc);

alter table public.client_recipes enable row level security;

drop policy if exists "Coaches can manage client recipes"  on public.client_recipes;
drop policy if exists "Clients can read own recipes"       on public.client_recipes;

create policy "Coaches can manage client recipes"
  on public.client_recipes for all
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role in ('coach','super_admin')
    )
  );

create policy "Clients can read own recipes"
  on public.client_recipes for select
  using (auth.uid() = client_id);


-- ── 6. STORAGE BUCKET ───────────────────────────────────────
-- Run this separately if the bucket doesn't exist yet.
-- Go to: Storage → New Bucket → Name: progress-photos → Public ✓

-- Or run via SQL (requires service role key, not anon):
-- insert into storage.buckets (id, name, public)
-- values ('progress-photos', 'progress-photos', true)
-- on conflict (id) do nothing;

-- Storage RLS for the progress-photos bucket:
-- Allow authenticated clients to upload to their own folder:
-- create policy "Clients upload own photos"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'progress-photos'
--     and auth.uid()::text = (string_to_array(name, '/'))[1]
--   );

-- Allow public read of all photos (bucket is public):
-- create policy "Public read progress photos"
--   on storage.objects for select
--   using (bucket_id = 'progress-photos');


-- ── 6. DONE ─────────────────────────────────────────────────
-- After running this script:
-- 1. Go to Storage and create a bucket named "progress-photos"
--    with "Public bucket" toggled ON.
-- 2. The app will now persist check-ins, coach responses,
--    coach updates, and progress photos to your database.
