---
name: GHL KPI reports
description: Weekly GoHighLevel KPI + monthly commission payout posts into a Team Hub community
---

- GHL Private Integration Token lives ONLY in the `GHL_PIT_TOKEN` env secret (never in admin_settings, unlike Meta's per-org token). Location `kuKtKnNy2D1k5hVocBdJ`; Eden-only feature (routes gated to Eden super admins).
- Config in admin_settings key `ghl_kpi` (Eden org); history archived per run in `ghl_kpi_hist:<week-start>` / `ghl_kpi_payout:<YYYY-MM>` keys.
- Pipelines and stages are resolved by NAME at run time (never hardcode stage UUIDs) — GHL rebuilds break silently otherwise. **Why:** stage ids are per-pipeline UUIDs that change if the team rebuilds a pipeline.
- GHL `/opportunities/search` paginates with `page=` and returns `meta.total` — verify collected count against total or refuse to report. `/users/{id}` may be scope-blocked (users list returned empty); closer names fall back to a config cache.
- All week/month boundaries are **US Central midnights** computed via Intl (America/Chicago), not UTC — a Sunday-11pm-Texas close belongs to that week. Scheduler dueness (Monday / the 15th) also uses the Central calendar; post hour stays UTC like metaAds.
- Scheduler claims each report (weekly vs payout) with its OWN CAS on fresh bytes. **Why:** a shared claim let one report's failure-rollback resurrect/erase the other's marker on Monday-the-15th. Closer-name cache is merged into fresh config after runs, never a whole-cfg write-back.
- Meta's `/debug_token` self-inspection FAILS for system-user tokens (OAuthException 100) even when the token works for insights — don't trust `token_check_fails` as proof of expiry.
