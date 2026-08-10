---
name: Deleted chat message redaction
description: Security invariant — deleted message content is admin-only and must be redacted server-side
---

# Deleted chat message redaction

**Rule:** soft-deleted chat content (`team_messages` etc.) is admin-only. The original text must never reach a non-admin browser — UI-level hiding is not enough, because the client can read the REST response.

**Why:** RLS cannot redact columns, so any client-side fetch of the raw row leaks deleted bodies regardless of what the UI renders. A completion review rejected a UI-only fix for exactly this.

**How to apply:** chat reads that can include deleted rows must go through an api-server endpoint (service key) that blanks content for non-admins; direct RLS SELECT should hide soft-deleted rows entirely (per-verb policies — the UPDATE policy must NOT require `deleted_at is null` in USING or the soft-delete PATCH itself is contested). DB policy changes ship as paste-and-run scripts in `database-updates/` and are enforced by the live suite. Communities/Messaging surfaces still read raw rows (follow-up task exists).
