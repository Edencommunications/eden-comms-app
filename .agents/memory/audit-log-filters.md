---
name: Audit log server-side filtering
description: How the Week6 Audit tab filters/paginates audit_logs server-side, and the PostgREST distinct-facet scan pattern
---

- Person/action/date filters on the Audit tab are server-side PostgREST params (`actor_name=eq.`, `action=eq.`, date range) built in `auditKeyset.js`; keyset "Load older" pagination carries the same filters.
- **Distinct values via PostgREST**: no DISTINCT support — walk the column with ordered pages resuming `column=gt."lastValue"` (skips duplicate runs), dedupe client-side (`fetchAuditFacet`). Must throw on page-cap/fetch failure and show a retriable error; never treat a truncated list as complete (a single big-limit request was rejected in review for silent truncation).
- **Race guard**: filter changes bump a request-generation ref; responses (including in-flight Load older) from an older generation are dropped so slow queries can't overwrite newer results.
- Free-text search remains client-side (follow-up task exists for server-wide text search).
