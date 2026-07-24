---
name: Client lifecycle state
description: How client deactivation, reactivation, and coach transfer are persisted in the Eden app
---

Rule: Supabase `user_profiles` (`is_active`, `coach_id`) is the source of truth for client deactivation and coach assignment. localStorage keys (`eden_deactivated_clients`, `eden_client_coach_map`, `eden_removed_coaches`) are a same-device cache only.

**Why:** Early implementation used localStorage only — coaches on other devices couldn't see admin deactivations, and stale local entries could block a reactivated client's login. A review round flagged both; fixed by DB-first login check and DB sync-on-load that clears stale local entries.

**How to apply:** Any new lifecycle feature (suspension, org moves, etc.) must write to Supabase and treat local caches as reconcilable, never authoritative. Coach removal must refuse to complete while active clients have no transfer target.
