---
name: Web Push phone notifications
description: How phone push notifications work (VAPID, storage, watcher) and their constraints.
---
- Web Push via api-server routes /push/* + `web-push` pkg; service worker handlers live in react-app public/sw.js (existing PWA SW).
- VAPID keys generated once at boot, stored in admin_settings Eden row key `web_push_vapid`; private key AES-GCM encrypted with SESSION_SECRET-derived key (rotating SESSION_SECRET kills push — all devices must resubscribe).
- Per-user devices in admin_settings key `push_sub:<userId>`; server-side `enabled` flag silences all devices at once (toggle in Notifications.jsx bell footer).
- **Why endpoint allow-list**: subscribe stores URLs the backend later fetches — without restricting hosts to real push providers (fcm/apple/mozilla/windows) any user gets an SSRF primitive.
- Watcher mirrors ALL new `notifications` rows as pushes (covers frontend-inserted bells too); durable cursor {ts, ids-at-ts} + CAS lease in admin_settings key `push_watch_state` → at-least-once, multi-instance safe, equal-timestamp batches never skipped.
- Per-category push prefs live in the same `push_sub:<userId>` JSON (`cats` map, missing key = ON); every notification type must be mapped in TYPE_CATEGORY or added to ALWAYS_DELIVER (huddle rings) — unmapped types fall back to the Messages switch and log a warning; tests/push-categories.mjs enumerates producers.
- iPhone requires the app added to Home Screen before push works; UI shows this hint on iOS non-standalone.
