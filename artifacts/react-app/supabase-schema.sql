-- ═══════════════════════════════════════════════════════════════════════════
-- EDEN COMMUNICATIONS — COMPLETE SUPABASE SCHEMA
-- Run this entire script in: Supabase Dashboard → SQL Editor → New Query
--
-- Covers every table, index, permission, storage bucket, and seed row
-- used by the app since Week 7 was first uploaded:
--   Week 4  — Labs, Lab Comments, Workout Plans
--   Week 5  — Courses, Modules, Access, Progress, Recipes
--   Week 6  — Admin, Consultation Notes, Client Intakes, Organizations
--   Week 7  — Team Messages, Huddle Rooms, Coach Settings
--   App     — Messaging, Conversations, Files, Notifications,
--             Diet Plans, Weekly Check-Ins, Progress Photos
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ════════════════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS
--    White-label companies + the main Eden org
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS organizations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  slug           TEXT        UNIQUE,
  brand_color    TEXT        DEFAULT '#ffa600',
  calendar_url   TEXT,
  billing_email  TEXT,
  plan           TEXT        DEFAULT 'standard',
  is_white_label BOOLEAN     DEFAULT false,
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 2. USER PROFILES
--    Clients, coaches, admins, VAs, head coaches
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT        UNIQUE NOT NULL,
  name        TEXT,
  role        TEXT        DEFAULT 'client',
  -- role values: client | coach | super_admin | company_admin | head_coach | va
  initials    TEXT,
  coach_id    UUID        REFERENCES user_profiles(id) ON DELETE SET NULL,
  company_id  UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  is_online   BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 3. CLIENT ACCESS
--    Grants staff members (coach, VA, head coach) permission to a client
--    client_id = NULL means the row applies company-wide (all clients)
-- ════════════════════════════════════════════════════════════════════════════
-- permissions JSONB shape:
--   { "messages": true, "labs": true, "diet": true,
--     "workout": true, "checkins": true }
CREATE TABLE IF NOT EXISTS client_access (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID        REFERENCES organizations(id),
  staff_id     UUID        REFERENCES user_profiles(id) ON DELETE CASCADE,
  client_id    UUID        REFERENCES user_profiles(id) ON DELETE CASCADE,
  permissions  JSONB       DEFAULT '{}',
  assigned_by  UUID        REFERENCES user_profiles(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. MESSAGING
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a_id  UUID        REFERENCES user_profiles(id) ON DELETE CASCADE,
  participant_b_id  UUID        REFERENCES user_profiles(id) ON DELETE CASCADE,
  company_id        UUID        REFERENCES organizations(id),
  last_message      TEXT,
  last_message_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (participant_a_id, participant_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        UUID        REFERENCES user_profiles(id),
  content          TEXT,
  message_type     TEXT        DEFAULT 'text',  -- text | image | file
  file_url         TEXT,
  file_name        TEXT,
  file_size        BIGINT,
  file_type        TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_files (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE CASCADE,
  uploaded_by      UUID        REFERENCES user_profiles(id),
  file_url         TEXT,
  file_name        TEXT,
  file_size        BIGINT,
  file_type        TEXT,        -- image | lab | document
  created_at       TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 5. NOTIFICATIONS
-- ════════════════════════════════════════════════════════════════════════════
-- type examples: checkin_submitted | message_received | lab_uploaded |
--                coach_update_posted | lab_reviewed
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID        REFERENCES user_profiles(id) ON DELETE CASCADE,
  type          TEXT,
  title         TEXT,
  body          TEXT,
  link_to       TEXT,        -- app tab key: "msgs" | "checkin" | "labs" | "progress"
  is_read       BOOLEAN     DEFAULT false,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 6. TEAM HUB  (Week 7 — coach/admin internal only)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS team_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        REFERENCES organizations(id),
  sender_id    UUID        REFERENCES user_profiles(id),
  sender_name  TEXT,
  sender_role  TEXT,
  content      TEXT        NOT NULL,
  thread_id    TEXT,        -- parent team_messages.id for thread replies (NULL = root)
  reply_count  INT         DEFAULT 0,
  is_dm        BOOLEAN     DEFAULT false,
  dm_to_id     UUID,        -- recipient UUID for direct messages
  dm_to_name   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS huddle_rooms (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        REFERENCES organizations(id),
  room_url      TEXT,
  created_by    UUID        REFERENCES user_profiles(id),
  creator_name  TEXT,
  is_active     BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Upsert on user_id — one settings row per coach
CREATE TABLE IF NOT EXISTS coach_settings (
  user_id       UUID        PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  org_id        UUID        REFERENCES organizations(id),
  calendar_url  TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 7. COURSES & LEARNING  (Week 5)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS courses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     DEFAULT false,
  sort_order  INT         DEFAULT 0,
  created_by  UUID        REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_modules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        REFERENCES courses(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  video_url      TEXT,
  sort_order     INT         DEFAULT 0,
  section_id     TEXT,
  section_title  TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- One row per user per course. Upsert-safe via UNIQUE constraint.
CREATE TABLE IF NOT EXISTS course_access (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        REFERENCES courses(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  user_name   TEXT,
  user_role   TEXT,
  coach_id    UUID,
  granted_by  UUID,
  revoked     BOOLEAN     DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (course_id, user_id)
);

-- One row per user per module. Upsert-safe via UNIQUE constraint.
CREATE TABLE IF NOT EXISTS course_progress (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL,
  course_id    UUID        REFERENCES courses(id) ON DELETE CASCADE,
  module_id    UUID        REFERENCES course_modules(id) ON DELETE CASCADE,
  completed    BOOLEAN     DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, module_id)
);

-- Recipe book — gated by purchase / admin grant
CREATE TABLE IF NOT EXISTS recipe_access (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        UNIQUE NOT NULL,
  granted_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 8. DIET PLANS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS diet_plans (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        REFERENCES user_profiles(id),
  coach_id        UUID        REFERENCES user_profiles(id),
  protocol        TEXT,
  high_day_meals  JSONB,
  low_day_meals   JSONB,
  targets         JSONB,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 9. WEEKLY CHECK-INS
--
--  IMPORTANT: Several column names are camelCase (quoted) because the app
--  spreads the JS form state object directly into the INSERT payload.
--  PostgREST preserves quoted identifiers, so the casing here must match
--  the exact JS property names used in the app.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS weekly_checkins (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID        REFERENCES user_profiles(id),
  coach_id          UUID        REFERENCES user_profiles(id),
  submitted_at      TIMESTAMPTZ DEFAULT now(),

  -- Vitals
  weight            TEXT,               -- lbs (fasted)
  temp              TEXT,               -- body temperature °F
  steps             TEXT,               -- avg daily steps
  "heartRate"       TEXT,               -- resting BPM
  hrv               TEXT,               -- HRV score
  "bloodPressure"   TEXT,               -- e.g. "118/74"

  -- Sleep
  sleep             NUMERIC,            -- quality 1–10
  "sleepWindow"     TEXT,               -- e.g. "10:30 PM – 6:00 AM"
  "sleepCycles"     TEXT,               -- e.g. "5"
  "sleepDisruption" TEXT,               -- free text disruption notes

  -- Wellbeing scales (1–10)
  energy            NUMERIC,
  hunger            NUMERIC,            -- 1=fine, 10=starving
  "sexDrive"        NUMERIC,
  "brainFog"        NUMERIC,            -- 1=extreme fog, 10=none
  bloating          NUMERIC,            -- 1=severe, 10=none
  stress            NUMERIC,            -- 1=calm, 10=maxed out

  -- Digestion
  "bowelCount"      TEXT,               -- avg daily bowel movements
  "bowelType"       TEXT,               -- Well formed | Loose | Diarrhea | Constipated | Mixed

  -- Mood & notes
  mood              TEXT,               -- Excellent | Great | Motivated | … | Struggling
  notes             TEXT,               -- client free-text notes

  -- Compliance (set by coach or computed externally)
  compliance        NUMERIC,            -- 0–100

  -- Coach review
  coach_notes       TEXT,               -- coach feedback shown in client My Progress
  coach_reviewed_at TIMESTAMPTZ,

  created_at        TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 10. CONSULTATION NOTES  (Week 6 — coach call logs)
--     Clients see these in My Progress → Coach Updates
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS consultation_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        REFERENCES user_profiles(id),
  coach_id       UUID        REFERENCES user_profiles(id),
  call_date      DATE,
  call_type      TEXT,        -- Monthly Check-In | Intake / Onboarding | Lab Review |
                              -- Therapy / Support | Strategy Call | Emergency Call | Other
  summary        TEXT,
  focus_points   TEXT,
  action_items   TEXT,
  next_call_date DATE,
  loom_url       TEXT,        -- Loom share URL; app embeds it for the client to watch
  created_at     TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 11. CLIENT INTAKES  (Week 6 — onboarding intake notes)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS client_intakes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        REFERENCES user_profiles(id),
  coach_id      UUID        REFERENCES user_profiles(id),
  call_notes    TEXT,
  start_date    DATE,
  start_weight  TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 12. LABS  (Week 4)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lab_results (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID        REFERENCES user_profiles(id),
  coach_id       UUID        REFERENCES user_profiles(id),
  uploaded_by    UUID        REFERENCES user_profiles(id),
  uploader_name  TEXT,
  lab_type       TEXT,        -- Blood Work | DUTCH Test | GI-MAP | Thyroid Panel | etc.
  file_url       TEXT,        -- Supabase storage URL (lab-files bucket)
  file_name      TEXT,
  file_size      BIGINT,
  notes          TEXT,        -- upload notes (e.g. "Fasted 12hr before draw")
  loom_url       TEXT,        -- Coach lab review recording; client sees embedded video
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lab_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id       UUID        REFERENCES lab_results(id) ON DELETE CASCADE,
  author_id    UUID        REFERENCES user_profiles(id),
  author_name  TEXT,
  author_role  TEXT,        -- coach | client
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 13. WORKOUT PLANS  (Week 4)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS workout_plans (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        REFERENCES user_profiles(id),
  coach_id    UUID        REFERENCES user_profiles(id),
  workouts    JSONB,       -- array of { name, exercises: [{name,sets,reps,rest,cues,videoLink}] }
  cardio      JSONB,       -- array of { type, duration, frequency, notes }
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 14. PROGRESS PHOTOS
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS progress_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        REFERENCES user_profiles(id),
  week_label  TEXT,        -- e.g. "Week 12"
  photo_url   TEXT,        -- Supabase storage URL (progress-photos bucket)
  file_name   TEXT,
  file_size   BIGINT,
  notes       TEXT,
  taken_at    TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 15. INDEXES
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_user_profiles_email     ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_company   ON user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_coach     ON user_profiles(coach_id);
CREATE INDEX IF NOT EXISTS idx_client_access_staff     ON client_access(staff_id);
CREATE INDEX IF NOT EXISTS idx_client_access_client    ON client_access(client_id);
CREATE INDEX IF NOT EXISTS idx_client_access_company   ON client_access(company_id);
CREATE INDEX IF NOT EXISTS idx_conversations_a         ON conversations(participant_a_id);
CREATE INDEX IF NOT EXISTS idx_conversations_b         ON conversations(participant_b_id);
CREATE INDEX IF NOT EXISTS idx_messages_convo          ON messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conv_files_convo        ON conversation_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_messages_org       ON team_messages(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_access_user      ON course_access(user_id, revoked);
CREATE INDEX IF NOT EXISTS idx_course_access_course    ON course_access(course_id, revoked);
CREATE INDEX IF NOT EXISTS idx_course_progress_user    ON course_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_checkins_client         ON weekly_checkins(client_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultation_client     ON consultation_notes(client_id, call_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_client      ON lab_results(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_comments_lab        ON lab_comments(lab_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_progress_photos_client  ON progress_photos(client_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_diet_plans_client       ON diet_plans(client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workout_plans_client    ON workout_plans(client_id, updated_at DESC);


-- ════════════════════════════════════════════════════════════════════════════
-- 16. PERMISSIONS
--     The app uses the anon key directly (no Supabase Auth yet).
--     Disable RLS and grant full anon access to all tables.
--     Tighten to auth-based RLS policies when you add real login.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE organizations      DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles      DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_access      DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations      DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages           DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages      DISABLE ROW LEVEL SECURITY;
ALTER TABLE huddle_rooms       DISABLE ROW LEVEL SECURITY;
ALTER TABLE coach_settings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses            DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules     DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_access      DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_progress    DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_access      DISABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plans         DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_checkins    DISABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE client_intakes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results        DISABLE ROW LEVEL SECURITY;
ALTER TABLE lab_comments       DISABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans      DISABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos    DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;


-- ════════════════════════════════════════════════════════════════════════════
-- 17. STORAGE BUCKETS
--     3 buckets — all public so the app can display files via URL directly.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('lab-files',       'lab-files',       true),   -- lab result PDFs/images (Week 4 + Messaging)
  ('chat-media',      'chat-media',      true),   -- chat image attachments (Messaging)
  ('progress-photos', 'progress-photos', true)    -- client progress photos (My Progress)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — allow the anon key to upload and read
-- Drop first so the script is safe to re-run
DROP POLICY IF EXISTS "anon_insert_lab_files"       ON storage.objects;
DROP POLICY IF EXISTS "anon_select_lab_files"        ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_chat_media"       ON storage.objects;
DROP POLICY IF EXISTS "anon_select_chat_media"       ON storage.objects;
DROP POLICY IF EXISTS "anon_insert_progress_photos"  ON storage.objects;
DROP POLICY IF EXISTS "anon_select_progress_photos"  ON storage.objects;

CREATE POLICY "anon_insert_lab_files"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'lab-files');

CREATE POLICY "anon_select_lab_files"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'lab-files');

CREATE POLICY "anon_insert_chat_media"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "anon_select_chat_media"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'chat-media');

CREATE POLICY "anon_insert_progress_photos"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'progress-photos');

CREATE POLICY "anon_select_progress_photos"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'progress-photos');


-- ════════════════════════════════════════════════════════════════════════════
-- 18. PATCH EXISTING TABLES
--     Adds any columns that may be missing if you ran an earlier version.
--     Must run BEFORE the seed inserts below.
-- ════════════════════════════════════════════════════════════════════════════

-- user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS initials    TEXT,
  ADD COLUMN IF NOT EXISTS coach_id    UUID,
  ADD COLUMN IF NOT EXISTS company_id  UUID,
  ADD COLUMN IF NOT EXISTS is_online   BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();

-- full_name may exist from an earlier schema version with a NOT NULL constraint.
-- Step 1: ensure the column exists (no-op if already there).
-- Step 2: make it nullable so INSERTs that don't supply it still work.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE user_profiles ALTER COLUMN full_name DROP NOT NULL;

-- organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_white_label BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_email  TEXT,
  ADD COLUMN IF NOT EXISTS calendar_url   TEXT,
  ADD COLUMN IF NOT EXISTS created_by     UUID;

-- consultation_notes — loom_url added this session
ALTER TABLE consultation_notes
  ADD COLUMN IF NOT EXISTS loom_url TEXT;

-- lab_results — loom_url added this session
ALTER TABLE lab_results
  ADD COLUMN IF NOT EXISTS loom_url TEXT;

-- weekly_checkins — sleep details, digestion, and coach review added this session
ALTER TABLE weekly_checkins
  ADD COLUMN IF NOT EXISTS "sleepWindow"     TEXT,
  ADD COLUMN IF NOT EXISTS "sleepCycles"     TEXT,
  ADD COLUMN IF NOT EXISTS "sleepDisruption" TEXT,
  ADD COLUMN IF NOT EXISTS "bowelCount"      TEXT,
  ADD COLUMN IF NOT EXISTS "bowelType"       TEXT,
  ADD COLUMN IF NOT EXISTS coach_notes       TEXT,
  ADD COLUMN IF NOT EXISTS coach_reviewed_at TIMESTAMPTZ;

-- progress_photos — may not exist yet
CREATE TABLE IF NOT EXISTS progress_photos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        REFERENCES user_profiles(id),
  week_label  TEXT,
  photo_url   TEXT,
  file_name   TEXT,
  file_size   BIGINT,
  notes       TEXT,
  taken_at    TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════════════════════════════════════════
-- 19. SEED DATA
--     Fixed UUIDs used across all components — must match exactly.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Eden org — insert into BOTH tables ────────────────────────────────────
-- Your existing user_profiles.company_id FK points to "companies", so that
-- table must have the row before the user inserts below can succeed.
INSERT INTO companies (id, name)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Lifestyle of Eden'
) ON CONFLICT (id) DO NOTHING;

-- Also keep the row in organizations (used by Week 6 admin screens).
INSERT INTO organizations (id, name, slug, brand_color, plan, is_white_label)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'Lifestyle of Eden',
  'eden',
  '#ffa600',
  'platform_owner',
  false
) ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  slug        = EXCLUDED.slug,
  brand_color = EXCLUDED.brand_color;

-- ── Three demo users ───────────────────────────────────────────────────────
INSERT INTO user_profiles (id, email, name, role, initials, company_id)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'admin@edencomms.io',
    'Eden Admin',
    'super_admin',
    'EA',
    'b0000000-0000-0000-0000-000000000001'
  ),
  (
    '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
    'coach@eden.io',
    'Coach Marcus',
    'coach',
    'CM',
    'b0000000-0000-0000-0000-000000000001'
  ),
  (
    'ece58b33-3f2a-4ce7-bed9-a157c914056c',
    'client@eden.io',
    'Jordan Williams',
    'client',
    'JW',
    'b0000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO UPDATE SET
  email      = EXCLUDED.email,
  name       = EXCLUDED.name,
  role       = EXCLUDED.role,
  initials   = EXCLUDED.initials,
  company_id = EXCLUDED.company_id;

-- Assign Jordan's primary coach
UPDATE user_profiles
SET coach_id = '414b1fb3-f38c-4480-bdb2-fe7b1d844051'
WHERE id = 'ece58b33-3f2a-4ce7-bed9-a157c914056c';

-- ── CEO course (fixed ID used in Week 5) ───────────────────────────────────
INSERT INTO courses (id, title, description, is_active, sort_order, created_by)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'The Mind of a CEO',
  'A transformational course covering mindset, productivity, and performance for health-focused entrepreneurs.',
  true,
  1,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Grant Jordan access to the CEO course
INSERT INTO course_access (course_id, user_id, user_name, user_role, coach_id, granted_by, revoked)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'ece58b33-3f2a-4ce7-bed9-a157c914056c',
  'Jordan Williams',
  'client',
  '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
  '00000000-0000-0000-0000-000000000001',
  false
) ON CONFLICT (course_id, user_id) DO NOTHING;

-- ── Coach calendar setting ─────────────────────────────────────────────────
INSERT INTO coach_settings (user_id, org_id, calendar_url)
VALUES (
  '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
  'b0000000-0000-0000-0000-000000000001',
  'https://calendar.google.com/calendar/embed?src=lifestyleofeden%40gmail.com&ctz=America%2FChicago'
) ON CONFLICT (user_id) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════════════
-- DONE.
-- After running this script:
--   1. Confirm all 23 tables appear in Table Editor
--   2. Confirm 3 buckets appear in Storage (lab-files, chat-media, progress-photos)
--   3. Log in as client@eden.io and open My Progress — demo data renders
--   4. Log in as coach@eden.io and open a client → Add Call Note, paste a
--      Loom URL — client will see the embedded video in Coach Updates
--   5. Lab uploads with a Loom URL will show an embedded review video
--      in the lab detail panel
-- ════════════════════════════════════════════════════════════════════════════
