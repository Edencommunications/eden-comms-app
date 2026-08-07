---
name: Wearable OAuth integrations
description: Durable security constraints for wearable (Oura/Whoop) connections
---
- One platform-wide Oura developer app serves all orgs/clients; each client OAuths into their own Oura account — no per-org apps.
- Oura accounts can only be created via their free mobile app (no ring required); register the redirect URI for both dev and production domains.
- OAuth tokens must never be stored in plaintext in org-readable tables: admin_settings is selectable by every same-org user under RLS, so token payloads are encrypted with a server-only key before persisting.
- Device connect/disconnect is strictly client self-service; staff roles get read-only same-org access.
