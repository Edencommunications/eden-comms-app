-- ═══════════════════════════════════════════════════════════════
-- Eden Communications — July 29, 2026
-- Communities, message delete + audit log, per-person pins,
-- module notes, community-only access for offboarded clients.
-- Paste this whole script into Supabase → SQL Editor → Run.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

-- 1. Course module notes (admin writes them, anyone viewing the module sees them)
alter table course_modules add column if not exists admin_notes text;

-- 2. Soft delete on client messages (deleted messages stay in the audit log)
alter table messages add column if not exists deleted_at timestamptz;
alter table messages add column if not exists deleted_by uuid;
alter table messages add column if not exists deleted_by_name text;

-- 3. Soft delete on Team Hub messages
alter table team_messages add column if not exists deleted_at timestamptz;
alter table team_messages add column if not exists deleted_by uuid;
alter table team_messages add column if not exists deleted_by_name text;

-- 4. Audit log (deletions and other sensitive actions, admin-visible)
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid,
  actor_name text,
  actor_role text,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz default now()
);

-- 5. Per-person message pins (pinning for yourself never pins for the other person)
create table if not exists message_pins (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  conversation_id uuid,
  context text default 'dm',            -- 'dm' | 'community'
  user_id uuid not null,                -- whose view this pin belongs to
  pinned_by uuid,
  pinned_by_name text,
  created_at timestamptz default now(),
  unique (message_id, user_id)
);

-- 6. Communities
create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  name text not null,
  context text default 'clients',       -- 'clients' | 'team'
  created_by uuid,
  created_by_name text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists community_members (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  user_id uuid not null,
  user_name text,
  user_role text,
  added_by uuid,
  added_by_name text,
  created_at timestamptz default now(),
  unique (community_id, user_id)
);

create table if not exists community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  sender_id uuid,
  sender_name text,
  sender_role text,
  content text,
  parent_id uuid,                       -- thread replies point at the root message
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_name text,
  created_at timestamptz default now()
);

-- 7. Offboarded clients who keep community/messaging access only
alter table user_profiles add column if not exists community_only boolean default false;
