---
name: API route prefix
description: How /api paths map from browser to the api-server (proxy strips the prefix)
---

# API route prefix

The frontend calls `fetch('/api/whatever')`; the platform's path-based proxy routes `/api/*` to the api-server artifact and STRIPS the `/api` prefix. So Express routes must be registered WITHOUT `/api` (e.g. `router.post("/checkin-form/save", ...)` ← reachable at `/api/checkin-form/save`).

**Why:** a new route registered as `/api/...` inside the server 404s from the browser and from `curl $REPLIT_DEV_DOMAIN/api/...` — confusing because it "looks" consistent with the frontend call.

**How to apply:** when adding api-server endpoints, copy the path style of existing routes — no `/api` prefix server-side.
