---
name: Start dates & demo-data sweep
description: Contract start-date gating and conventions from the demo-data removal
---
- `user_profiles.start_date` (date, nullable) gates lateness: clients with a future start date are never counted late; UpcomingStartsSection shows them on coach home + admin overview. GHL webhook accepts optional `start_date` (YYYY-MM-DD) and retries insert without it if the column is missing.
- **Convention:** when filtering active profiles via PostgREST use `is_active=not.is.false`, never `is_active=eq.true` — legacy rows have NULL and would vanish from rosters.
- **Why:** demo-era hardcoded rosters (CLIENT_ROSTER, BROADCAST_COACHES, DEMO_* constants, KNOWN_USERS wearable identities) were removed; all rosters now load live from user_profiles. KNOWN_USERS identity fallbacks still exist in DietBuilder/Week4-7/Notifications but only match retired demo emails — real users always take the DB path.
- Local calendar dates: build `YYYY-MM-DD` from local getFullYear/getMonth/getDate, not `toISOString()` (UTC off-by-one).
