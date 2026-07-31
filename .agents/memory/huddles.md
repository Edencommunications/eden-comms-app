---
name: Video huddles
description: How team huddle video calls work (Daily.co, per-org keys, live-room state)
---

# Video huddles (Daily.co)

**Rule:** huddle rooms must be created server-side via the Daily REST API — the frontend previously fabricated daily.co URLs that pointed to rooms that were never created ("room does not exist").

**Per-org accounts (white-label):** each org connects its OWN Daily.co account; the key is stored in `admin_settings` (key `daily_api_key`, managed only through admin-gated api-server routes). Eden's own org falls back to the `DAILY_API_KEY` workspace secret. Orgs without a key get a friendly "ask your admin to connect" error.

**Why:** the user explicitly required white-label orgs to not run calls on Eden's Daily account (billing/minutes separation).

**Accepted risk:** admin_settings is org-scoped RLS, so an org's own coaches could technically read their org's Daily key via REST. No DDL available to lock it down further; deemed low harm.

**Live state:** `huddle_rooms.is_active` (org-scoped) drives the "huddle live — join" banner (20s polling); rooms self-expire after 4h; starter identity comes from the row's `created_by`, so ownership survives reloads. Known gaps (abandoned rooms, realtime pings) are tracked as project tasks.

## Global huddle layer (Slack-style)
- Huddle state moved OUT of Week7 into `HuddleHub.jsx` (HuddleProvider wraps AppShell in App.tsx): the Daily iframe lives in a fixed floating window (shrink/expand) so calls survive navigation to any tab.
- Incoming huddle_invite/huddle_ping notifications trigger a full-screen ringing overlay + WebAudio ring loop app-wide (realtime + poll fallback); only rings for invites <90s old; auto-quiets after 45s.
- Do Not Disturb is per-device (localStorage `eden_dnd`), toggled via 🌙 DndButton in the top bar; it silences ring + overlay only (bell still collects invites).
- Week7 consumes useHuddle(); it no longer renders the call iframe. Ownership (End vs Leave) exposed as `isStarter` from the provider.
