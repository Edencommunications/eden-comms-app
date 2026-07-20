-- ═══════════════════════════════════════════════════════════════
-- EDEN COMMUNICATIONS — WEEK 7 SCHEMA
-- COO: Supabase → SQL Editor → New Query → Paste All → Run
-- ═══════════════════════════════════════════════════════════════

-- ── Coach calendar settings (one row per coach) ───────────────
CREATE TABLE IF NOT EXISTS coach_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  org_id          UUID,
  calendar_url    TEXT,
  huddle_room_url TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Team chat channels ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN DEFAULT FALSE,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Team chat messages ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID REFERENCES team_channels(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL,
  sender_id   UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT,
  content     TEXT NOT NULL,
  thread_id   UUID,              -- null = top-level, uuid = reply to that message
  reply_count INTEGER DEFAULT 0,
  is_dm       BOOLEAN DEFAULT FALSE,
  dm_to_id    UUID,              -- for 1v1 DMs
  dm_to_name  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Huddle rooms ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS huddle_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL,
  room_url    TEXT NOT NULL,
  created_by  UUID,
  creator_name TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  participant_ids UUID[],
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Wearable connections ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS wearable_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL UNIQUE,
  oura_token      TEXT,
  oura_connected  BOOLEAN DEFAULT FALSE,
  whoop_token     TEXT,
  whoop_connected BOOLEAN DEFAULT FALSE,
  last_synced     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Wearable data snapshots ───────────────────────────────────
CREATE TABLE IF NOT EXISTS wearable_data (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL,
  source          TEXT NOT NULL,  -- 'oura' | 'whoop'
  date            DATE NOT NULL,
  hrv             FLOAT,
  resting_hr      INTEGER,
  sleep_score     INTEGER,
  sleep_hours     FLOAT,
  recovery_score  INTEGER,
  steps           INTEGER,
  body_temp       FLOAT,
  raw_data        JSONB,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, source, date)
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_messages_channel  ON team_messages(channel_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_team_messages_thread   ON team_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_team_messages_dm       ON team_messages(sender_id, dm_to_id);
CREATE INDEX IF NOT EXISTS idx_wearable_data_client   ON wearable_data(client_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_huddle_rooms_org       ON huddle_rooms(org_id, is_active);

-- ── Seed Eden org default channel ────────────────────────────
INSERT INTO team_channels (org_id, name, description, is_default)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'general',
  'Main channel for all Lifestyle of Eden coaches',
  TRUE
) ON CONFLICT DO NOTHING;

-- ── Seed demo coach calendar setting ─────────────────────────
INSERT INTO coach_settings (user_id, org_id, calendar_url)
VALUES (
  '414b1fb3-f38c-4480-bdb2-fe7b1d844051',
  'b0000000-0000-0000-0000-000000000001',
  'https://calendar.google.com/calendar/embed?src=lifestyleofeden%40gmail.com&ctz=America%2FChicago'
) ON CONFLICT (user_id) DO NOTHING;
