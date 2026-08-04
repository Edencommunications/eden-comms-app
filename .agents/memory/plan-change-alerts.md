---
name: Plan-change alerts & supplement persistence
description: Conventions for notifying clients on plan changes and where supplement protocols persist.
---

- Rule: plan-change notifications (diet_update, supp_update, workout_update) must only insert after the underlying save is confirmed (`res.ok`/truthy insert), and skip self (recipient === sender).
  **Why:** completion review rejects notifications that can fire on failed saves — misleading alerts.
  **How to apply:** gate every new `dbInsert('notifications', ...)` behind the persistence result; fail the UI toast when the save fails.
- Coach-built supplement protocols persist per client in `admin_settings` key `supp_plan:<client uuid>` (JSON {supps, custom, notes}), company_id-scoped — the Supplements tab "Save Protocol" button was a dead button before this existed.
- In coach-viewing-client contexts, the component's "my" uuid is the CLIENT's uuid; use the resolved coach id (COACH_UUID / myCoachId) as notification sender.
