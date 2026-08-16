---
name: Content Scheduler (social auto-posting)
description: Eden-only IG/FB auto-poster — storage model, CAS safety rules, Meta permission requirements, weekly recap semantics.
---

# Content Scheduler (IG + FB + TikTok + YouTube Shorts)

Eden-only (gated `company_id === EDEN_ORG_ID` + super_admin); user may later open it to Tier-3 orgs / DBAs.

- Config: admin_settings key `content_sched` (Eden row) — AES-GCM encrypted **page token** (key derived `content-sched-token:${SESSION_SECRET}`), page_id, ig_user_id, recap community + weekly_day/hour_local/tz + `last_weekly` marker.
- Posts: one admin_settings row per post, key `content_post:<uuid>`, whole post JSON (status machine: scheduled → publishing → published/failed/canceled).
- Media: public Supabase Storage bucket `content-media`; 18 MB cap because express json limit is 25 MB (base64 overhead). Bigger reels need a different upload path (multipart/direct-to-storage) — known Phase-2 item.
- Publishing: IG via media container + media_publish (REELS poll status_code up to ~5 min); FB Page via /photos or /videos with the **page** token. Token must carry pages_manage_posts, instagram_content_publish, instagram_manage_insights etc. — the Ads-recap token does NOT have these; user generates a fresh one via Graph API Explorer.

**Why the crash-safety rules exist (architect-reviewed):**
- Publish claim is CAS (status→publishing with claimed_at); terminal write is CAS-from-claimed with plain-save fallback. Stuck `publishing` rows >30 min are recovered to `failed` and admins bell-notified — NEVER auto-retried, since the Graph call may have landed (double-post risk).
- Partial success (IG posted, FB failed) is treated as published, not retried.
- Stats pull uses a `stats_claimed_at` lease; `stats_at` written only after success so a crash retries in 30 min.
- Weekly recap CAS-claims `last_weekly` then rolls it back on post failure so a week is never silently skipped. Window = previous 7 FULL local days (localParts ymd compare), not rolling 168h.

**How to apply:** any new platform must follow the same claim/lease/rollback pattern and the same "never retry an ambiguous publish" rule.

# Phase 2: TikTok + YouTube (video-only platforms)
- Auth is per-app OAuth, NOT paste-a-token: user supplies their own dev-app client id/secret (TikTok developer app, Google Cloud OAuth client); tokens auto-refresh server-side. All secrets/tokens ride encrypted in the same `content_sched` config via a generic SECRET_FIELDS list.
- OAuth callback is unauthenticated by necessity — protected by platform-bound HMAC state (10-min expiry). Redirect URI must include the `/api` prefix (proxy strips it before routing).
- **Platform gotchas:** unaudited TikTok apps force SELF_ONLY (private) posts; unverified Google apps lock uploads private — surfaced in UI, not bugs. TikTok FILE_UPLOAD used instead of PULL_FROM_URL (avoids domain verification). TikTok chunk rule: count = floor(size/chunk), final chunk absorbs remainder BUT must stay ≤64MB → 32MB chunk size satisfies both.
- **Ambiguity rule extended:** once a TikTok publish session inits or YouTube bytes start flowing, any failure throws AmbiguousPublishError → terminal `failed`, never auto-retried (YouTube 4xx = real reject, retryable-safe; 5xx/network = ambiguous).
- Token rotation persists via bounded CAS-retry field-level merge only — a blind upsert fallback can resurrect credentials a concurrent disconnect wiped.
- Big videos (>18MB, up to 512MB) upload browser→storage directly via one-hour signed upload URLs; api-server never buffers bytes. Supabase plan's per-file storage cap still applies.
