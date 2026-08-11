---
name: Web app typecheck
description: How the react-app passes strict tsc and the pitfalls to avoid when extending it
---
Rule: `src/untyped-js-modules.d.ts` holds shorthand wildcard `declare module "*/X"` entries so remaining legacy .js/.jsx imports type as `any` (wildcards must match SIBLING imports like `./X`, so use `*/X`, not `*/components/X`). Most legacy components are now .tsx with pragmatic `: any` prop annotations and widened `useState<any>` generics; only a handful of small siblings (Communities, CanvasPanel, MentionInput, Reactions, recipeDetails, libraryDefaults, courseMoveUtils, auditKeyset, checkinForm) remain shimmed. App.tsx still carries `// @ts-nocheck`.
**Why:** Enabling `allowJs` instead made TS infer required props from .jsx destructuring defaults, producing dozens of false TS2739/2741 errors at call sites. Also `B.bg` was a real missing palette key (silently undefined backgrounds) — added as alias of surface.
**How to apply:** When converting a .jsx component to .tsx, delete its wildcard entry from untyped-js-modules.d.ts. The "typecheck" validation runs both api-server and react-app; keep both green.
