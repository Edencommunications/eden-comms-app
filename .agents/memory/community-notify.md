---
name: Community post notifications
description: How human community messages buzz bells/phones, and the review-mandated security pattern for notify endpoints.
---

Human posts in communities notify members via an authenticated api-server endpoint the frontend calls right after inserting the message.

**Rules the completion reviewer enforces for any service-role notify endpoint (apply to future ones, e.g. team chat):**
- Must be bound to a verified, freshly-created row (caller sends the new id; server checks author = caller, right parent, created within ~2 min, not deleted). Never trust sender_name/exclude lists from the request body — derive server-side.
- Must enforce tenant boundary explicitly: caller's company_id must match the resource's org (Eden staff exempt), plus membership-or-staff check. Service-role reads bypass RLS, so the endpoint is the boundary.
- Throttling must be shared/atomic, not in-memory: persist stamps in an admin_settings row and claim recipients via CAS (same pattern as push_watch_state).

**How it works here:** `/communities/:id/notify-post` inserts `community_post` notification rows (push watcher mirrors them to phones); mention-detection is duplicated server-side so @mentioned users (already pinged by the frontend) aren't double-notified; throttle = 1 buzz per community per recipient per 10 min in `admin_settings community_notify:<cid>`.

**Constraint:** notify endpoints reachable from chat must authenticate with the any-user helper, not the staff-only one — clients post in communities too, and a staff-only gate silently kills their notifications.

**Known gap:** community_messages RLS still lets a member insert arbitrary sender_id; the endpoint's checks close the notify path but the RLS itself needs DDL to fix.

## Per-community mutes (added Aug 2026)
- Mute state: admin_settings key `community_mute:<communityId>:<userId>`, value "1"/"0", upserted atomically on (company_id,key). Server-only reads/writes via /communities/:id/mute (requireUser + org/membership check).
- **Rule:** EVERY buzz producer for a community must consult `mutedUserIds()` — regular posts, webhook/recap posts, mentions, and reaction pings. Mentions must be created server-side in notify-post (Communities.jsx AND DbaChat.jsx group channels); client-side sendNotification bypasses mute and got the task rejected twice in review.
- api-server now has a test setup: `pnpm run test` (esbuild bundle → node --test, Supabase mocked at global fetch). node --experimental-strip-types can't run app imports (extensionless); tsx isn't installed.

## Notification deep-links to communities
Bell/push notifications store `link_to` as `<tab>?comm=<communityId>` (tab = `team` for team/dba-context communities, `community` for client ones). The app parses it in Notifications.tsx, stashes the id in sessionStorage `eden_open_community`, and Week7/Communities auto-open that community on mount or via the `eden-open-community` window event (covers already-mounted tabs). Old linkless rows fall back to a per-type destination map in handleNotifClick; clients are rerouted off staff-only tabs (`team`/`admin` → `community`).
