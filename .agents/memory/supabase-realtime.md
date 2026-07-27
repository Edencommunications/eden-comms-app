---
name: Supabase realtime sync
description: How cross-device admin lifecycle sync works and its Supabase-side requirement
---
Admin views subscribe to postgres_changes on `user_profiles` via @supabase/supabase-js (already a react-app dependency). Row events are debounced (~250ms) into one `syncLifecycleFromDb()` refresh. The old 10s poll and visibility refresh remain but only fire while the channel is NOT `SUBSCRIBED`; on reconnect a catch-up sync runs.
**Why:** instant cross-device convergence with polling kept solely as a fallback.
**How to apply:** if realtime updates don't arrive, check that the table is in the `supabase_realtime` publication on the external Supabase project — without it the channel subscribes but delivers nothing, and the poll fallback silently masks the gap only when the socket is down. `user_profiles` was added (user ran the ALTER PUBLICATION SQL, verified July 2026). Note: the anon key cannot run DDL and no admin credentials exist in this workspace — publication changes must be run by the user in their Supabase dashboard. To verify delivery headlessly: subscribe with supabase-js in Node, PATCH a row via REST, expect the event within ~1-3s.
