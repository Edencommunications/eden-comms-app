---
name: Meta Ads recaps
description: Per-org Meta Marketing API recaps posted into a community by the api-server scheduler.
---
- Per-org config in admin_settings key `meta_ads`; routes under /meta-ads (JWT, super_admin writes); scheduler runs every 15 min from api-server index.ts.
- **Token must stay encrypted**: admin_settings rows are org-wide readable under RLS, so the Meta token is AES-256-GCM encrypted with a key derived from SESSION_SECRET (`token_enc`, prefix `enc1:`). Never store it plaintext; rotating SESSION_SECRET invalidates all stored tokens (orgs must reconnect).
- **Why CAS**: scheduler claims due periods via compare-and-swap on the raw stored value (PATCH with `value=eq.<old>`) so two instances/overlapping passes can't double-post; failed runs roll the marker back with max 3 retries/day tracked as `fails_<period>_<date>` keys.
- Recap = Meta insights (account + campaign level, lead action types) + `/activities` change log, summarized by AI integration (model gpt-5.6-luna) with a plain-format fallback; failures notify org super_admins via notifications (body/is_read).
- Destination community is re-validated (org + is_active) right before every post.
