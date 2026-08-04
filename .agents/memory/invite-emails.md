---
name: Invite emails & Invites list
description: How welcome/invite emails work, the Invites admin list, and the false-failure lesson
---

- Welcome emails send via Resend (RESEND_API_KEY, from team@edencommunications.io) with Gmail SMTP fallback; mailer in api-server lib/mailer.ts. Both paths verified working from dev.
- Invite history lives in admin_settings key `invite_log` per company (`{email: {at, ok}}`), written by /auth/provision and the /invites routes.
- Invites admin UI (Week6 Coaches tab → ✉️ Invites): GET /invites (profiles + Supabase auth last_sign_in), POST /invites/resend (new temp password + re-email), POST /invites/revoke (only if never signed in).
- **Lesson:** the long "email could not be sent" saga had TWO causes: (1) production ran a stale published build without the mail code/secrets — always check `listDeploymentBuilds` + probe a new endpoint on prod (404 vs 403) to see which build is live; (2) the frontend wrapper `provisionLogin()` returned `{ok:true}` and silently dropped the server's `emailed` flag, so the UI always claimed failure even when the send succeeded. When a "failed" report contradicts server logs, check whether the client wrapper passes the flag through.
- Autoscale "deployment starting" log lines are cold starts, not new publishes. The workspace Publish button spinner can hang forever cosmetically even after the build succeeded.
