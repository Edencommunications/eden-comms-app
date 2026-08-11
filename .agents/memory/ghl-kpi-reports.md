---
name: GHL KPI reports
description: Per-org weekly GoHighLevel KPI + monthly commission payout posts into a Team Hub community
---

- Now MULTI-ORG: one `ghl_kpi` admin_settings row per company. Eden uses the `GHL_PIT_TOKEN` env secret + built-in defaults (location `kuKtKnNy2D1k5hVocBdJ`); white-labels connect their own GHL — PIT token AES-256-GCM encrypted (`token_enc`, key derived from SESSION_SECRET, same pattern as metaAds) + `location_id`, live-validated on connect. Tokens never returned by status/options.
- History archived per run in `ghl_kpi_hist:<week-start>` / `ghl_kpi_payout:<YYYY-MM>` keys (per company).
- Pipelines and stages are resolved by NAME at run time (never hardcode stage UUIDs) — GHL rebuilds break silently otherwise. **Why:** stage ids are per-pipeline UUIDs that change if the team rebuilds a pipeline.
- GHL `/opportunities/search` paginates with `page=` and returns `meta.total` — verify collected count against total or refuse to report. `/users/{id}` may be scope-blocked (users list returned empty); closer names fall back to a config cache.
- All week/month boundaries are ORG-TZ midnights (cfg `tz`, IANA, default America/Chicago) computed via Intl. Post hour is `hour_local` in org tz; legacy UTC `hour` honored until an hourLocal is saved (see hourGatePassed).
- Setup is org-configurable: `lead_pipelines` (names), `closed_stages` ({pipeline,stage} names), `setter_calendar` (null hides the setter section), `closers` (calendar chips), `commission_rate` (fraction; UI speaks percent). `readyError` gates runs until all pieces exist.
- Weekly dedupe marker is the REPORTED WEEK's start date (org tz), never "today's date" — a UTC-date marker double-posts after UTC midnight while it's still the same local day.
- Scheduler passes the CLAIM-TIME `now` into the run functions so the reported window always matches the claimed marker — a long GHL pull crossing local midnight must not drift the window. Failure rollback only deletes the marker if it still equals THIS claim's key (else another instance's newer marker gets erased → duplicate post).
- EVERY config write (settings saves, closer-name cache, failure rollback) must go through the CAS read-modify-write helper — a plain whole-config save can clobber the other instance's just-claimed marker (dev+prod share the DB).
- Scheduler claims each report (weekly vs payout) with its OWN CAS on fresh bytes. **Why:** a shared claim let one report's failure-rollback resurrect/erase the other's marker on Monday-the-15th. Closer-name cache is merged into fresh config after runs, never a whole-cfg write-back.
- Meta's `/debug_token` self-inspection FAILS for system-user tokens (OAuthException 100) even when the token works for insights — don't trust `token_check_fails` as proof of expiry.
