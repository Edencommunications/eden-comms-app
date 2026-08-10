# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- **User is in US Central time (CST/CDT).** Always convert timestamps to Central time when reporting them — database timestamps are stored in UTC (Central is UTC-5 in summer, UTC-6 in winter).
- **Always include Supabase SQL proactively.** Any time a code change touches a new table, adds a column, or introduces a new database interaction, provide the full SQL (CREATE TABLE, RLS enable, open policy) in the same response — never wait to be asked. The user may not know to ask and will miss it.

## Gotchas

- **Before shipping, run every live-Supabase safety check with one command:** `pnpm --filter @workspace/api-server run test:live` (needs `SUPABASE_SERVICE_ROLE_KEY`). It runs realtime-publication, staff-meta-realtime, community-notify-throttle, push-categories, dba-boundary, and auth.integration with per-check pass/fail output. The last two need the "API Server" workflow running — if it isn't reachable they're reported as SKIPPED and the suite exits non-zero, so start the workflow and re-run for a full pass.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
