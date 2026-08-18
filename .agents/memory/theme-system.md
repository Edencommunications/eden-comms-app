---
name: Dark/Light theme system
description: How the switchable theme works and its constraints (mutable shared tokens, onAccent, per-user prefs route)
---

# Dark/Light theme system (Aug 2026)

- All palettes alias one mutable token object `T` in `react-app/src/lib/theme.ts` (`App.tsx`'s `B` and every component's `C` are `= T`; DbaChat uses `{ ...T, gold: primary }` inside the component). `applyTheme()` mutates `T` in place and the App root bumps state to re-render the tree.
- **Rule:** never capture a token VALUE at module scope (e.g. a config object with `color: C.gold`) — it freezes at import time. Use getters or resolve at render. Never add `React.memo` boundaries that read tokens without a theme dep.
- `onAccent` token = text drawn ON gold/brand fills; dark in both themes. Old `color:B.black` text-on-gold usages were codemodded to it — new code must use `onAccent`, not `black`, for text on accent fills.
- `black` = page background (flips light), `white`/`text` = body text (flips dark). Don't use `white` as a background.
- Third mode `brand` (Brand-heavy): dark-based tokens mixed from the active org/DBA primary color; shells call `setBrandAccent(primary)` so white-labels get their own wash. Toggle cycles dark→light→brand.
- Per-user persistence: localStorage `eden_theme:<userId>` + api-server `GET/POST /prefs/theme` → admin_settings key `prefs:<userId>` (org-readable under RLS — low-sensitivity prefs only). Fetch is generation-guarded against logout/user-switch races; logout resets to dark (login screens are always dark brand look).
- Known un-themed areas (stay dark in light mode, polish later): login/branded login screens, LegalPages, InstallBanner, video scenes.
