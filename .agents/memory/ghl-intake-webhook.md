---
name: GHL intake webhook
description: How per-org GHL contract-signed webhooks work and quirks of the live notifications table.
---

- Per-org webhook secrets are deterministic: HMAC-SHA256(`ghl-intake:<companyId>`, SESSION_SECRET), because the anon key cannot run DDL — no new Supabase columns/tables possible. The admin panel fetches URL+secret from the API server config endpoint.
- **Why:** external Supabase is schema-frozen from this workspace; secrets must be derivable, not stored.
- Live `notifications` table columns differ from `supabase-schema.sql`: it has `body`, `is_read`, `sender_name` — NOT `message` or `title`. Inserts using the schema file's columns fail silently in the frontend (dbInsert swallows errors). Verify against a live row before trusting the .sql files.
- Config/troubleshooting endpoints are admin-gated: caller sends `x-admin-id` (their profile UUID); server verifies role=super_admin and org membership (own org or Eden) against user_profiles — that's the strongest authz possible under the demo-auth model.
- Webhook accepts header secret (`x-webhook-secret`) or timestamped HMAC signature (`x-webhook-signature: t=...,v1=...` over `${t}.${rawBody}`, 5-min tolerance); query/body secrets are rejected per security review.
- Webhook received-log is in-memory only (ring buffer on the API server); it resets on restart.
