---
name: Emoji reactions
description: Slack-style reactions across all chat surfaces — storage model, authz, and why per-user rows
---
# Emoji reactions (all chat surfaces)

- Surfaces: coach-client 1:1 (`messages`), Communities/Team Hub + DBA chat (`community_messages`), Week7 team chat incl. threads/DMs (`team_messages`). Shared UI: `Reactions.jsx` (ReactionBar + fetchReactions(table, ids) + toggleReaction).
- Storage (zero-DDL): one admin_settings row PER USER per message — key `rx:<messageId>:<userId>`, value `{"n":"Name","e":["👍"]}`. Aggregated server-side via `or=(key.like.rx:<id>:*)`.
- **Why per-user rows:** a shared per-message JSON blob needed CAS via `value=eq.<json>` — PostgREST filter grammar breaks on commas/quotes in JSON, so CAS was unreliable. Per-user rows mean each toggle only writes the caller's own row → no contention, no CAS.
- Authz: BOTH read and toggle verify visibility per message (conversation participant / community member or org staff / same-org staff + team-DM party). "Unguessable UUID" is not authorization — reads must check too (architect flagged this).
- Routes: GET `/reactions?table=&ids=` (uuid-validated, ≤120), POST `/reactions/toggle`. Frontend refetches reactions alongside each message poll, so others' reactions appear within the existing 6s polling.
