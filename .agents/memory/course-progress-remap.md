---
name: Course progress remap safety
description: Why course_progress remaps after lesson renumbering must be primary-key-based, not module_id-text-based.
---

Course lessons are identified by text `module_id` ("<section>.<sort>") and `course_progress` rows key off that text. Any reorder/move renumbers module_ids.

**Rule:** remap `course_progress` rows by PRIMARY KEY from a pre-move snapshot (`select=id,module_id`), never by text matching on module_id.

**Why:** in-section reorders permute ids cyclically (1.1→1.2, 1.2→1.3, 1.3→1.1) and cross-section moves reuse ids, so text-based remapping/verification can't distinguish "already migrated" from "not yet migrated" rows — it either misroutes rows or reports false failure on legitimate results. Row ids are unambiguous.

**How to apply:** snapshot affected rows before writing (treat a failed read as abort, not "no rows" — the app's `dbGet` coerces errors to `[]`, use a null-on-error variant); write two-pass via `tmp.<id>` so unique (user, module_id) pairs never collide mid-flight; verify by re-reading the snapshotted row ids and checking exact destinations; on failure restore modules and rows by primary key. See `executeLessonDrop` in the react-app's courseMoveUtils for the reference implementation (pure, db-injected, integration-tested with injected failures). The older text-based `remapProgress` still backs the legacy arrow/swap paths and misreports cyclic permutations as failures.
