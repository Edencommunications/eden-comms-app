-- ═══════════════════════════════════════════════════════════════
-- Per-course tier distribution (run once in Supabase SQL Editor)
-- Adds courses.tiers: a jsonb array of package (tier) ids that
-- include this Eden course. Empty array = "Eden only" — the course
-- stays internal to Lifestyle of Eden and is never shown to
-- white-label users.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: preserve current behavior. Tiers whose package had
-- includes_courses = true previously received the ENTIRE Eden
-- library, so grant every existing Eden course to those tiers.
-- New courses created after this default to Eden-only.
UPDATE courses
SET tiers = COALESCE(
  (SELECT jsonb_agg(id) FROM packages WHERE includes_courses = TRUE AND active = TRUE),
  '[]'::jsonb
)
WHERE (company_id IS NULL OR company_id = 'b0000000-0000-0000-0000-000000000001')
  AND tiers = '[]'::jsonb;
