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

**Known gap:** community_messages RLS still lets a member insert arbitrary sender_id; the endpoint's checks close the notify path but the RLS itself needs DDL to fix.
