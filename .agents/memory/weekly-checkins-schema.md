---
name: weekly_checkins live schema
description: Live weekly_checkins columns differ from the .sql files; extras ride in protocol_durations JSON
---
The live `weekly_checkins` table does NOT match supabase_migration.sql. PostgREST rejects the whole insert if any column is unknown, and the frontend's dbInsert swallows the error — check-ins were silently lost for weeks this way (bell notification still fired, making it look delivered).

**Live columns (probed 2026-08-05):** id, client_id, coach_id, weight, temp, steps, blood_pressure, sleep, sleep_notes, wake_consistent, bloating, brain_fog, sex_drive, energy, hunger, bowel_count, bowel_formed, heart_rate, hrv, cycle_notes, cycle_pain, other_notes, photo_note, submitted_at, sleepWindow, sleepCycles, sleepDisruption, bowelCount, bowelType, coach_notes, coach_reviewed_at, meal_notes, protocol_durations.

**Rules:**
- No columns exist for stress, compliance, mood, habits, habit_pct, notes — these live in `protocol_durations.__extra` (alongside `__others` and `__custom`). Client notes go in `other_notes`. Sleep/bowel detail uses the camelCase columns (sleepWindow, sleepCycles, sleepDisruption, bowelType).
- Readers must fall back: `__extra` first, then legacy snake_case columns (older demo rows).
- **Why:** no DDL is possible on this Supabase (service key is data-only); probe the live schema with a service-key insert before trusting any .sql file in the repo.
- **How to apply:** whenever adding fields to check-ins, extend `__extra`/`__custom` instead of inventing columns, and never let dbInsert failures pass silently on user-facing saves.
