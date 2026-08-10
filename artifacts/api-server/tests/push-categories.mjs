#!/usr/bin/env node
// Per-category phone-push preference tests (pure logic, no network/DB).
//
// Bundles src/routes/push.ts with esbuild and asserts:
//   1. A disabled category blocks every notification type mapped to it
//   2. Missing/absent prefs mean everything delivers (default ON)
//   3. Unknown/new types are governed by the "Messages" switch — they can
//      never silently bypass user opt-outs
//   4. huddle_invite (live call ring) always delivers when push is on
//   5. Every TYPE_CATEGORY value is a real, user-visible category id
//
// Run:  node artifacts/api-server/tests/push-categories.mjs
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "src", "routes", "push.ts");
// Bundle next to the package so external deps (express, web-push) resolve.
const out = path.join(here, `.push-under-test-${Date.now()}.mjs`);
execSync(`npx esbuild ${src} --bundle --format=esm --platform=node --packages=external --outfile=${out}`, {
  cwd: path.join(here, ".."), stdio: "pipe",
});
let categoryAllowed, TYPE_CATEGORY, PUSH_CATEGORIES;
try {
  ({ categoryAllowed, TYPE_CATEGORY, PUSH_CATEGORIES } = await import(out));
} finally {
  const fs = await import("node:fs");
  fs.unlinkSync(out);
}

let failed = 0;
function check(name, cond) {
  console.log(`${cond ? "✅" : "❌"} ${name}`);
  if (!cond) failed++;
}

const catIds = new Set(PUSH_CATEGORIES.map((c) => c.id));

// 1. Disabled category blocks all of its types
for (const [type, cat] of Object.entries(TYPE_CATEGORY)) {
  check(`cats.${cat}=false blocks '${type}'`, categoryAllowed({ enabled: true, subs: [], cats: { [cat]: false } }, type) === false);
}

// 2. Default ON: no cats object, empty cats, and other-category-off all deliver
check("no cats ⇒ 'message' delivers", categoryAllowed({ enabled: true, subs: [] }, "message") === true);
check("empty cats ⇒ 'meta_ads' delivers", categoryAllowed({ enabled: true, subs: [], cats: {} }, "meta_ads") === true);
check("ads_recaps off leaves 'message' alone", categoryAllowed({ enabled: true, subs: [], cats: { ads_recaps: false } }, "message") === true);

// 3. Unknown types are governed by the Messages switch
check("unknown type delivers when messages ON", categoryAllowed({ enabled: true, subs: [], cats: {} }, "some_future_type") === true);
check("unknown type blocked when messages OFF", categoryAllowed({ enabled: true, subs: [], cats: { messages: false } }, "some_future_type") === false);

// 4. Live-call rings are never category-filtered
const allOff = Object.fromEntries([...catIds].map((c) => [c, false]));
for (const ring of ["huddle_invite", "huddle_ping"]) {
  check(`${ring} delivers even with every category off`, categoryAllowed({ enabled: true, subs: [], cats: allOff }, ring) === true);
}

// 4b. Enumerate every notification producer in the codebase: each type that is
// ever INSERTED into the `notifications` table must be mapped or a live ring.
// (List curated from grep of dbInsert('notifications')/sendNotification callers
// across api-server and react-app — extend when adding a producer.)
const PRODUCED_TYPES = [
  "message", "mention", "broadcast", "community_post", "community_message",
  "team_message", "community", "reaction",
  "diet_update", "supp_update", "workout_update", "update_note", "loom_posted", "course_access",
  "checkin_received", "lab_uploaded",
  "start_reminder_7", "start_reminder_1", "start_reminder_0", "ghl_intake",
  "meta_ads",
  "huddle_invite", "huddle_ping",
];
const RINGS = new Set(["huddle_invite", "huddle_ping"]);
for (const t of PRODUCED_TYPES) {
  check(`produced type '${t}' is explicitly owned (mapped or ring)`, RINGS.has(t) || t in TYPE_CATEGORY);
}

// 5. Mapping integrity
for (const [type, cat] of Object.entries(TYPE_CATEGORY)) {
  check(`'${type}' maps to a real category (${cat})`, catIds.has(cat));
}
// Every category exposed in the UI owns at least one type
for (const c of catIds) {
  check(`category '${c}' owns at least one type`, Object.values(TYPE_CATEGORY).includes(c));
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
