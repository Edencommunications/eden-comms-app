// Headless verification that org & package edits arrive INSTANTLY via
// Supabase Realtime — i.e. that `organizations`, `packages`, and
// `client_documents` are in the `supabase_realtime` publication.
//
// For each table: subscribe via supabase-js (postgres_changes), PATCH an
// existing row via the REST API (a no-op write: a column set to its current
// value still emits an UPDATE event), and assert the event arrives within
// ~3s. If it doesn't, the table is almost certainly missing from the
// publication — a channel happily reports SUBSCRIBED even when the table
// isn't published, and delivers nothing.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (RLS would otherwise both block the
// PATCH and filter the realtime rows).
//
//   node --test tests/realtime-publication.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TABLES = ["organizations", "packages", "client_documents"];
const EVENT_TIMEOUT_MS = Number(process.env.REALTIME_EVENT_TIMEOUT_MS || 3000);

const FIX_HINT =
  `Realtime event did NOT arrive — the table is likely missing from the ` +
  `supabase_realtime publication. Fix in the Supabase SQL editor:\n` +
  `  ALTER PUBLICATION supabase_realtime ADD TABLE organizations, packages, client_documents;\n` +
  `(Until then, admins fall back to the ~10s poll.)`;

const REST = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function fetchOneRow(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, { headers: REST });
  if (!r.ok) assert.fail(`Could not read a row from ${table}: HTTP ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

// Pick a harmless scalar column to re-write with its current value.
function pickColumn(row) {
  for (const [k, v] of Object.entries(row)) {
    if (k === "id" || k.endsWith("_id")) continue;
    if (typeof v === "string") return k;
  }
  // fall back to any non-id column
  return Object.keys(row).find((k) => k !== "id") || null;
}

test("realtime publication delivers UPDATE events for admin tables", { timeout: 60000 }, async () => {
  assert.ok(
    SERVICE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY is not set — this check needs it to PATCH rows and receive unfiltered realtime events.",
  );

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  sb.realtime.setAuth(SERVICE_KEY);

  const received = new Map(); // table -> resolve fn
  const waiters = {};
  for (const t of TABLES) {
    waiters[t] = new Promise((resolve) => received.set(t, resolve));
  }

  let channel = sb.channel("realtime-publication-check");
  for (const t of TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: t },
      () => received.get(t)?.(true),
    );
  }

  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("Realtime channel did not reach SUBSCRIBED within 10s")), 10000);
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") { clearTimeout(to); resolve(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(to);
        reject(new Error(`Realtime channel failed to subscribe: ${status} ${err || ""}`));
      }
    });
  });

  const failures = [];
  try {
    for (const table of TABLES) {
      const row = await fetchOneRow(table);
      if (!row) {
        // No rows to touch — can't verify delivery without inventing schema-
        // dependent inserts. Surface loudly rather than pass silently.
        failures.push(`${table}: table has no rows, so delivery could not be verified. Add a row and re-run.`);
        continue;
      }
      const col = pickColumn(row);
      assert.ok(col, `${table}: no updatable column found on the sample row`);

      const patch = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(row.id)}`,
        { method: "PATCH", headers: REST, body: JSON.stringify({ [col]: row[col] }) },
      );
      if (!patch.ok) assert.fail(`${table}: PATCH failed: HTTP ${patch.status} ${await patch.text()}`);

      const got = await Promise.race([
        waiters[table],
        new Promise((resolve) => setTimeout(() => resolve(false), EVENT_TIMEOUT_MS)),
      ]);
      if (!got) failures.push(`${table}: ${FIX_HINT}`);
      else console.log(`✓ ${table}: realtime UPDATE arrived`);
    }
  } finally {
    await sb.removeChannel(channel);
    sb.realtime.disconnect();
  }

  assert.deepEqual(failures, [], `Instant delivery is broken for:\n\n${failures.join("\n\n")}`);
});
