-- ══════════════════════════════════════════════════════════════
-- LIVE SUPABASE SCHEMA SNAPSHOT — generated from the running DB
-- Generated: 2026-08-10
-- This file is the AUTHORITATIVE reference for what actually
-- exists in the live database. The other .sql files in this repo
-- are historical and may be stale — trust THIS file.
-- NOTE: reference only. Do NOT run this against the database.
-- ══════════════════════════════════════════════════════════════

-- table: admin_audit_log
CREATE TABLE admin_audit_log (
  id uuid PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES user_profiles(id),
  action text NOT NULL,
  target_user_id uuid REFERENCES user_profiles(id),
  target_table text,
  target_id uuid,
  ip_address text,
  created_at timestamp,
  actor_id uuid,
  actor_name text,
  target_type text,
  target_name text,
  details jsonb
);

-- table: admin_settings
CREATE TABLE admin_settings (
  company_id uuid PRIMARY KEY,
  key text PRIMARY KEY,
  value text,
  updated_at timestamp
);

-- table: audit_logs
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  action text NOT NULL,
  actor_id uuid,
  actor_name text,
  actor_role text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamp
);

-- table: broadcast_messages
CREATE TABLE broadcast_messages (
  id uuid PRIMARY KEY,
  sent_by_name text,
  audience_type text NOT NULL,
  audience_label text,
  coach_id uuid,
  check_in_day text,
  recipient_ids text,
  message text NOT NULL,
  sent_at timestamp,
  status text,
  scheduled_for timestamp
);

-- table: checkin_status
CREATE TABLE checkin_status (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  check_in_day text NOT NULL,
  cycle_date date NOT NULL,
  submitted boolean,
  submitted_at timestamp,
  viewed_by_coach boolean,
  viewed_at timestamp
);

-- table: client_access
CREATE TABLE client_access (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  staff_id uuid NOT NULL REFERENCES user_profiles(id),
  client_id uuid REFERENCES user_profiles(id),
  permissions jsonb NOT NULL,
  assigned_by uuid REFERENCES user_profiles(id),
  created_at timestamp,
  coach_id uuid
);

-- table: client_documents
CREATE TABLE client_documents (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  company_id uuid,
  added_by_id uuid,
  added_by_name text,
  doc_type text NOT NULL,
  title text NOT NULL,
  content text,
  file_url text,
  created_at timestamp NOT NULL
);

-- table: client_intakes
CREATE TABLE client_intakes (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  health_history text,
  current_meds text,
  conditions text,
  goals text,
  lifestyle_notes text,
  call_notes text,
  what_brought_in text,
  start_date date,
  start_weight text,
  start_photos text,
  created_at timestamp,
  updated_at timestamp
);

-- table: client_recipes
CREATE TABLE client_recipes (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  recipe_name text NOT NULL,
  recipe_data jsonb,
  meal_name text,
  assigned_at timestamp NOT NULL
);

-- table: client_workout_logs
CREATE TABLE client_workout_logs (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  week integer NOT NULL,
  logs jsonb NOT NULL,
  saved_at timestamp
);

-- table: coach_responses
CREATE TABLE coach_responses (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  checkin_date text NOT NULL,
  coach_notes text,
  coach_loom text,
  updated_at timestamp NOT NULL
);

-- table: coach_settings
CREATE TABLE coach_settings (
  user_id uuid PRIMARY KEY REFERENCES user_profiles(id),
  org_id uuid REFERENCES organizations(id),
  calendar_url text,
  updated_at timestamp
);

-- table: coach_social_links
CREATE TABLE coach_social_links (
  id uuid PRIMARY KEY,
  coach_id uuid NOT NULL,
  links jsonb NOT NULL,
  updated_at timestamp
);

-- table: coach_updates
CREATE TABLE coach_updates (
  id uuid PRIMARY KEY,
  coach_id uuid NOT NULL,
  client_id uuid NOT NULL,
  date text NOT NULL,
  note text,
  loom text,
  created_at timestamp NOT NULL
);

-- table: communities
CREATE TABLE communities (
  id uuid PRIMARY KEY,
  company_id uuid,
  name text NOT NULL,
  context text,
  created_by uuid,
  created_by_name text,
  is_active boolean,
  created_at timestamp
);

-- table: community_members
CREATE TABLE community_members (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_name text,
  user_role text,
  added_by uuid,
  added_by_name text,
  created_at timestamp
);

-- table: community_messages
CREATE TABLE community_messages (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL,
  sender_id uuid,
  sender_name text,
  sender_role text,
  content text,
  parent_id uuid,
  deleted_at timestamp,
  deleted_by uuid,
  deleted_by_name text,
  created_at timestamp
);

-- table: companies
CREATE TABLE companies (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamp
);

-- table: company_cardio_types
CREATE TABLE company_cardio_types (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_by uuid,
  created_at timestamp,
  company_id uuid
);

-- table: company_foods
CREATE TABLE company_foods (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  serving text NOT NULL,
  cat text NOT NULL,
  cal numeric,
  pro numeric,
  carb numeric,
  fat numeric,
  fib numeric,
  created_by uuid,
  created_at timestamp NOT NULL,
  company_id uuid
);

-- table: company_habits
CREATE TABLE company_habits (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  default_target integer NOT NULL,
  created_by uuid,
  created_at timestamp,
  company_id uuid
);

-- table: company_hidden_items
CREATE TABLE company_hidden_items (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  created_at timestamp
);

-- table: company_intake_secrets
CREATE TABLE company_intake_secrets (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  secret text NOT NULL,
  created_at timestamp
);

-- table: company_links
CREATE TABLE company_links (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  links jsonb NOT NULL,
  updated_at timestamp
);

-- table: company_resource_links
CREATE TABLE company_resource_links (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  label text NOT NULL,
  url text NOT NULL,
  note text,
  sort_order integer,
  created_at timestamp
);

-- table: company_supplements
CREATE TABLE company_supplements (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  category text NOT NULL,
  name text NOT NULL,
  dose text,
  directions text,
  code text,
  link text,
  sort_order integer,
  created_at timestamp
);

-- table: consultation_notes
CREATE TABLE consultation_notes (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  call_date date NOT NULL,
  call_type text,
  summary text NOT NULL,
  focus_points text,
  action_items text,
  next_call_date date,
  created_at timestamp,
  loom_url text,
  other_links text
);

-- table: conversation_files
CREATE TABLE conversation_files (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  uploaded_by uuid NOT NULL REFERENCES user_profiles(id),
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  file_type text NOT NULL,
  description text,
  created_at timestamp
);

-- table: conversation_participants
CREATE TABLE conversation_participants (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id),
  user_id uuid PRIMARY KEY REFERENCES user_profiles(id)
);

-- table: conversations
CREATE TABLE conversations (
  id uuid PRIMARY KEY,
  coach_id uuid REFERENCES user_profiles(id),
  client_id uuid REFERENCES user_profiles(id),
  org_id text NOT NULL,
  created_at timestamp,
  last_message text,
  last_message_at timestamp,
  participant_a_id uuid REFERENCES user_profiles(id),
  participant_b_id uuid REFERENCES user_profiles(id),
  company_id uuid REFERENCES companies(id)
);

-- table: course_access
CREATE TABLE course_access (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id),
  user_id uuid NOT NULL,
  user_name text,
  user_role text,
  coach_id uuid,
  granted_by uuid,
  granted_at timestamp,
  revoked boolean
);

-- table: course_modules
CREATE TABLE course_modules (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id),
  module_id text NOT NULL,
  section_id integer NOT NULL,
  section_title text,
  section_color text,
  title text NOT NULL,
  duration text,
  sort_order integer,
  video_url text,
  updated_at timestamp,
  updated_by uuid,
  admin_notes text
);

-- table: course_progress
CREATE TABLE course_progress (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES courses(id),
  module_id text NOT NULL,
  completed boolean,
  completed_at timestamp,
  created_at timestamp
);

-- table: courses
CREATE TABLE courses (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text,
  is_active boolean,
  sort_order integer,
  created_by uuid,
  created_at timestamp,
  updated_at timestamp,
  company_id uuid,
  tiers jsonb NOT NULL
);

-- table: diet_plans
CREATE TABLE diet_plans (
  id uuid PRIMARY KEY,
  client_id uuid,
  coach_id uuid,
  protocol text,
  high_day_meals jsonb,
  low_day_meals jsonb,
  targets jsonb,
  supplements text,
  prescriptions text,
  notes text,
  is_active boolean,
  created_at timestamp,
  updated_at timestamp
);

-- table: food_log_entries
CREATE TABLE food_log_entries (
  id bigint PRIMARY KEY,
  client_id uuid NOT NULL,
  date date NOT NULL,
  meal text NOT NULL,
  description text NOT NULL,
  calories integer,
  created_at timestamp NOT NULL
);

-- table: global_config
CREATE TABLE global_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamp
);

-- table: habit_logs
CREATE TABLE habit_logs (
  id uuid PRIMARY KEY,
  client_id uuid,
  week_start date,
  habits jsonb,
  overall_pct integer,
  created_at timestamp
);

-- table: huddle_rooms
CREATE TABLE huddle_rooms (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  room_url text,
  created_by uuid REFERENCES user_profiles(id),
  creator_name text,
  is_active boolean,
  created_at timestamp
);

-- table: lab_comments
CREATE TABLE lab_comments (
  id uuid PRIMARY KEY,
  lab_id uuid NOT NULL REFERENCES lab_results(id),
  author_id uuid NOT NULL,
  author_name text,
  author_role text,
  content text NOT NULL,
  created_at timestamp
);

-- table: lab_results
CREATE TABLE lab_results (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  uploaded_by uuid NOT NULL,
  uploader_name text,
  lab_type text NOT NULL,
  file_url text,
  file_name text,
  file_size bigint,
  notes text,
  created_at timestamp,
  loom_url text
);

-- table: login_sessions
CREATE TABLE login_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_profiles(id),
  ip_address text,
  user_agent text,
  device_type text,
  browser text,
  logged_in_at timestamp,
  logged_out_at timestamp,
  duration_mins integer,
  is_active boolean,
  org_id text
);

-- table: message_pins
CREATE TABLE message_pins (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  conversation_id uuid,
  context text,
  user_id uuid NOT NULL,
  pinned_by uuid,
  pinned_by_name text,
  created_at timestamp
);

-- table: messages
CREATE TABLE messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_id uuid NOT NULL REFERENCES user_profiles(id),
  content text,
  message_type text NOT NULL,
  file_url text,
  file_name text,
  file_size integer,
  file_type text,
  is_read boolean,
  read_at timestamp,
  created_at timestamp,
  parent_id uuid,
  deleted_at timestamp,
  deleted_by uuid,
  deleted_by_name text
);

-- table: notifications
CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  recipient_id uuid NOT NULL,
  sender_id uuid,
  sender_name text,
  type text NOT NULL,
  body text NOT NULL,
  link_to text,
  is_read boolean,
  read_at timestamp,
  created_at timestamp
);

-- table: organizations
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  brand_color text,
  calendar_url text,
  instagram_url text,
  facebook_url text,
  youtube_url text,
  tiktok_url text,
  website_url text,
  is_active boolean,
  is_white_label boolean,
  plan text,
  billing_email text,
  created_at timestamp,
  created_by uuid,
  brand_colors jsonb NOT NULL
);

-- table: packages
CREATE TABLE packages (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  price numeric NOT NULL,
  active boolean NOT NULL,
  created_at timestamp,
  includes_courses boolean NOT NULL,
  includes_recipes boolean NOT NULL
);

-- table: prescription_tapers
CREATE TABLE prescription_tapers (
  id uuid PRIMARY KEY,
  prescription_id uuid NOT NULL REFERENCES prescriptions(id),
  effective_date date NOT NULL,
  new_dose text NOT NULL,
  notes text,
  created_at timestamp
);

-- table: prescriptions
CREATE TABLE prescriptions (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  name text NOT NULL,
  dose text NOT NULL,
  directions text,
  start_date date,
  is_active boolean,
  created_at timestamp
);

-- table: progress_photos
CREATE TABLE progress_photos (
  id uuid PRIMARY KEY,
  client_id uuid REFERENCES user_profiles(id),
  week_label text,
  photo_url text,
  file_name text,
  file_size bigint,
  notes text,
  taken_at timestamp,
  created_at timestamp
);

-- table: recipe_access
CREATE TABLE recipe_access (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  granted_by text,
  granted_at timestamp
);

-- table: supplement_custom_text
CREATE TABLE supplement_custom_text (
  id uuid PRIMARY KEY,
  protocol_id uuid NOT NULL REFERENCES supplement_protocols(id),
  content text
);

-- table: supplement_items
CREATE TABLE supplement_items (
  id uuid PRIMARY KEY,
  protocol_id uuid NOT NULL REFERENCES supplement_protocols(id),
  name text NOT NULL,
  category text,
  custom_dose text,
  custom_dir text,
  discount_code text,
  purchase_url text,
  sort_order integer
);

-- table: supplement_protocols
CREATE TABLE supplement_protocols (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  created_at timestamp,
  updated_at timestamp
);

-- table: team_messages
CREATE TABLE team_messages (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  sender_id uuid REFERENCES user_profiles(id),
  sender_name text,
  sender_role text,
  content text NOT NULL,
  thread_id text,
  reply_count integer,
  is_dm boolean,
  dm_to_id uuid,
  dm_to_name text,
  created_at timestamp,
  deleted_at timestamp,
  deleted_by uuid,
  deleted_by_name text
);

-- table: user_profiles
CREATE TABLE user_profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text NOT NULL,
  role text NOT NULL,
  org_id text NOT NULL,
  coach_id uuid REFERENCES user_profiles(id),
  avatar_url text,
  phone text,
  is_active boolean,
  created_at timestamp,
  updated_at timestamp,
  company_id uuid REFERENCES companies(id),
  name text,
  check_in_day text,
  last_seen timestamp,
  initials text,
  is_online boolean,
  update_day text,
  temp_password text,
  community_only boolean,
  start_date date,
  timezone text,
  deadline_time text
);

-- table: weekly_checkins
CREATE TABLE weekly_checkins (
  id uuid PRIMARY KEY,
  client_id uuid,
  coach_id uuid,
  weight text,
  temp text,
  steps text,
  blood_pressure text,
  sleep text,
  sleep_notes text,
  wake_consistent text,
  bloating text,
  brain_fog text,
  sex_drive text,
  energy text,
  hunger text,
  bowel_count text,
  bowel_formed text,
  heart_rate text,
  hrv text,
  cycle_notes text,
  cycle_pain text,
  other_notes text,
  photo_note text,
  submitted_at timestamp,
  sleepWindow text,
  sleepCycles text,
  sleepDisruption text,
  bowelCount text,
  bowelType text,
  coach_notes text,
  coach_reviewed_at timestamp,
  meal_notes jsonb,
  protocol_durations jsonb
);

-- table: workout_logs
CREATE TABLE workout_logs (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  workout_plan_id uuid REFERENCES workout_plans(id),
  week_number integer NOT NULL,
  week_start date,
  log_data jsonb,
  created_at timestamp
);

-- table: workout_plans
CREATE TABLE workout_plans (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL,
  coach_id uuid,
  workouts jsonb,
  cardio jsonb,
  notes text,
  created_at timestamp,
  updated_at timestamp
);
