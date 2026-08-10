---
name: Background-job health monitoring bar
description: What "can't silently stop" means for scheduled jobs in this project (review bar for health endpoints).
---

Rule: a scheduled job's health signal must be *evaluated*, not just a raw snapshot. To pass completion review it must:
- mark the run failed on partial failures (e.g. some inserts failed), with separate due/skipped/sent/failed counters
- treat misconfiguration (missing secret) as a failed run, not a silent no-op — read env at call time so tests can exercise it
- treat malformed/non-array Supabase bodies and non-2xx GETs as failures (never coerce to empty)
- compute staleness (interval + slack) and return 503/"degraded" from /healthz when stale or last run failed
- log a heartbeat summary every run, including 0-due runs
- have run-level tests that mock global fetch for the Supabase host

**Why:** task #-style reviews rejected a snapshot-only health signal three times until all of the above existed.
**How to apply:** copy the startDateReminders health pattern for any new scheduled job (broadcasts, sweeps, watchers).
