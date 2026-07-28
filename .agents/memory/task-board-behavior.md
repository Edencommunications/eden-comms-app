---
name: Task board proposal behavior
description: Proposing new follow-up tasks cancels previously PROPOSED (un-started) tasks on this project's board
---
Each `proposeFollowUpTasks` batch cancels the prior batch of still-PROPOSED tasks — the board effectively keeps only the latest proposals (observed repeatedly July 2026: proposing #59-61 cancelled #58; #62-64 cancelled #59-61; #65-67 cancelled #62-64).

**Why:** avoids futile re-proposal loops and confusing the user about "lost" tasks.

**How to apply:** don't try to keep >3 pending proposals alive. Keep the master task list in conversation/plan notes, propose only the batch that's about to be worked on, and re-propose the next batch when its turn comes. Pending launch backlog (July 2026): #46 auto-email logins, branded reset emails, real team logins + Owner account (incl. tiered email-swap), admin settings→DB, DB lockdown, audit logging.
