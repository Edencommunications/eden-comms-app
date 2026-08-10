-- Enable database-level instant delivery for settings changes.
--
-- The app already listens for postgres_changes on admin_settings (see
-- artifacts/react-app/src/App.tsx, staffAllowedTabs effect), but events only
-- flow if the table is in the supabase_realtime publication. This must be run
-- in the Supabase SQL editor (anon/service keys cannot run DDL).
--
-- Applied to production on 2026-08-10 (verified by a headless probe:
-- subscribe + PATCH -> event DELIVERED; see
-- artifacts/api-server/tests/realtime-publication.mjs, `pnpm --filter
-- @workspace/api-server run test:realtime`).
--
-- Idempotent: skips if the table is already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_settings;
  END IF;
END $$;
