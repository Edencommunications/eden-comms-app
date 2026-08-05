---
name: Branded login links & email destinations
description: How white-label (and future DBA) branded login URLs and email links work
---

- Branded login supports two forms: `?org=<slug>` query param and subpath `/<slug>` (first path segment, base-path-aware via `import.meta.env.BASE_URL`). Reserved segments: `video`, `api`, `__mockup` — keep this list in sync between App.tsx parsing and Week6.jsx org creation.
- All transactional emails (welcome/invite/bulk/GHL/start-reminders) must pass the org's slug so `appUrl(orgSlug)` builds a branded destination; password-reset `redirect_to` uses the query form (`APP_URL/?org=slug`) because Supabase's redirect allow-list matches the base URL.
- **Why:** emails previously linked to the plain root, so users from email saw the generic Eden login even for white-label orgs.
- **How to apply:** any new email-sending route must fetch the org's `slug` (from `organizations`, not `companies` — companies has no slug) and pass it to `welcomeEmail`/`appUrl`. DBAs will extend the same pattern one level deeper (`?dba=` / `/<dba-slug>`); DBA slugs must share the reserved-word + global-uniqueness rules.
- Slug enforcement is UI-only so far; server/DB uniqueness + reserved-word checks are an open task.
