// clientNotes.test.ts — unit tests for the client supplement / Rx notes routes.
//
// Verifies:
//   • validateNote clamps and coerces input
//   • key builders produce the right strings
//   • requireClient rejects missing / anon / non-client callers
//   • upsertNote writes to the correct key; surfaces a failure on a 500
//   • interleaved coach-plan save never touches the client-note key
// Run with:  pnpm --filter @workspace/api-server run test

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  validateNote,
  buildSuppNoteKey,
  buildRxNoteKey,
  upsertNote,
  processSuppNotesSave,
  processRxNotesSave,
  parseThread,
  appendThreadEntry,
  fetchLegacyRxEntry,
  type NoteEntry,
  type Profile,
} from "../clientNotes";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const COACH_ID  = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

// ── Supabase mock ──────────────────────────────────────────────
let adminSettings: Array<{ company_id: string; key: string; value: string }> = [];
let simulateDbFailure = false;
let simulateAuthFailure = false;

// Profile rows served to requireClient
const profiles: Record<string, Profile> = {
  "client@example.com": { id: CLIENT_ID, role: "client",  company_id: ORG },
  "coach@example.com":  { id: COACH_ID,  role: "coach",   company_id: ORG },
};

const realFetch = globalThis.fetch;

before(() => {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    const method = String(init.method || "GET").toUpperCase();
    const q = u.searchParams;

    // Auth/v1/user — token determines caller identity
    if (u.pathname === "/auth/v1/user") {
      if (simulateAuthFailure) return json({ message: "error" }, 401);
      const auth = String((init.headers as any)?.Authorization || "");
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (token === "client-token") return json({ email: "client@example.com" });
      if (token === "coach-token")  return json({ email: "coach@example.com" });
      return json({ message: "invalid" }, 401);
    }

    // user_profiles
    if (u.pathname === "/rest/v1/user_profiles") {
      const emailQ = q.get("email") || "";
      const email = emailQ.startsWith("eq.") ? decodeURIComponent(emailQ.slice(3)) : "";
      const profile = profiles[email];
      return json(profile ? [profile] : []);
    }

    // admin_settings
    if (u.pathname === "/rest/v1/admin_settings") {
      if (simulateDbFailure) return json({ message: "db error" }, 500);
      if (method === "POST") {
        const body = JSON.parse(String(init.body || "{}"));
        const i = adminSettings.findIndex(r => r.company_id === body.company_id && r.key === body.key);
        if (i >= 0) adminSettings[i] = { ...adminSettings[i], ...body };
        else adminSettings.push(body);
        return json({}, 201);
      }
      if (method === "PATCH") {
        const body = JSON.parse(String(init.body || "{}"));
        const keyQP = q.get("key") || "";
        const k = keyQP.startsWith("eq.") ? decodeURIComponent(keyQP.slice(3)) : "";
        const updGuard = q.get("updated_at"); // eq.<ts> or is.null
        const hits = adminSettings.filter((r: any) => r.key === k && (
          !updGuard || (updGuard === "is.null" ? !r.updated_at : r.updated_at === decodeURIComponent(updGuard.slice(3)))
        ));
        hits.forEach((r: any) => Object.assign(r, body));
        return json(hits, 200);
      }
      // GET — filter by key if provided
      const keyQ = q.get("key") || "";
      if (keyQ.startsWith("eq.")) {
        const k = decodeURIComponent(keyQ.slice(3));
        return json(adminSettings.filter(r => r.key === k));
      }
      return json(adminSettings);
    }

    return json([], 200);
  }) as typeof fetch;
});

after(() => { globalThis.fetch = realFetch; });

beforeEach(() => {
  adminSettings = [];
  simulateDbFailure = false;
  simulateAuthFailure = false;
});

// ── Pure helpers ────────────────────────────────────────────────

test("validateNote coerces non-string to empty string", () => {
  assert.equal(validateNote(null),      "");
  assert.equal(validateNote(undefined), "");
  assert.equal(validateNote(42),        "");
  assert.equal(validateNote([]),        "");
  assert.equal(validateNote({}),        "");
});

test("validateNote passes through a normal string unchanged", () => {
  assert.equal(validateNote("hello"), "hello");
  assert.equal(validateNote(""),      "");
});

test("validateNote clips strings longer than 5000 characters", () => {
  const big = "x".repeat(6000);
  const result = validateNote(big);
  assert.equal(result.length, 5000);
  assert.equal(result, "x".repeat(5000));
});

test("buildSuppNoteKey returns the expected admin_settings key", () => {
  assert.equal(buildSuppNoteKey(CLIENT_ID), `supp_client_notes:${CLIENT_ID}`);
});

test("buildRxNoteKey returns the expected admin_settings key", () => {
  assert.equal(buildRxNoteKey(CLIENT_ID), `rx_client_notes:${CLIENT_ID}`);
});

test("supp and rx keys are distinct for the same client", () => {
  assert.notEqual(buildSuppNoteKey(CLIENT_ID), buildRxNoteKey(CLIENT_ID));
});

// ── upsertNote ────────────────────────────────────────────────

test("upsertNote writes the note under the given key", async () => {
  const ok = await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "feeling good");
  assert.ok(ok);
  const row = adminSettings.find(r => r.key === `supp_client_notes:${CLIENT_ID}`);
  assert.ok(row, "row should exist after save");
  assert.equal(JSON.parse(row!.value).notes, "feeling good");
});

test("upsertNote overwrites only the client-note key — coach plan row untouched", async () => {
  // Simulate a pre-existing coach supp_plan row
  adminSettings.push({ company_id: ORG, key: `supp_plan:${CLIENT_ID}`, value: JSON.stringify({ supps: [], custom: "", notes: "coach plan" }) });

  await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "my note");

  // supp_plan must be unchanged
  const plan = adminSettings.find(r => r.key === `supp_plan:${CLIENT_ID}`);
  assert.equal(JSON.parse(plan!.value).notes, "coach plan", "coach plan must not be altered");

  // client note is in its own row
  const note = adminSettings.find(r => r.key === `supp_client_notes:${CLIENT_ID}`);
  assert.equal(JSON.parse(note!.value).notes, "my note");
});

test("upsertNote returns false when Supabase returns a 500", async () => {
  simulateDbFailure = true;
  const ok = await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "hello");
  assert.equal(ok, false);
});

test("upsertNote persists across multiple calls — last write wins", async () => {
  await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "first note");
  await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "second note");
  const row = adminSettings.find(r => r.key === `supp_client_notes:${CLIENT_ID}`);
  assert.equal(JSON.parse(row!.value).notes, "second note");
});

test("interleaved supp and rx saves go to separate rows, neither clobbers the other", async () => {
  await upsertNote(ORG, buildSuppNoteKey(CLIENT_ID), "supp note");
  await upsertNote(ORG, buildRxNoteKey(CLIENT_ID),   "rx note");

  const suppRow = adminSettings.find(r => r.key === `supp_client_notes:${CLIENT_ID}`);
  const rxRow   = adminSettings.find(r => r.key === `rx_client_notes:${CLIENT_ID}`);
  assert.equal(JSON.parse(suppRow!.value).notes, "supp note");
  assert.equal(JSON.parse(rxRow!.value).notes,   "rx note");
  assert.equal(adminSettings.filter(r => r.company_id === ORG).length, 2);
});

// ── processSuppNotesSave — auth / ownership ────────────────────

test("unauthenticated caller gets 401", async () => {
  const result = await processSuppNotesSave(null, "hello");
  assert.equal(result.status, 401);
  assert.ok(String(result.body.error).toLowerCase().includes("authorized"));
});

test("coach caller gets 403 for supp notes (clients only)", async () => {
  const coach: Profile = { id: COACH_ID, role: "coach", company_id: ORG };
  const result = await processSuppNotesSave(coach, "hello");
  assert.equal(result.status, 403);
  assert.ok(String(result.body.error).toLowerCase().includes("clients"));
});

test("staff roles (head_coach, super_admin) also get 403", async () => {
  for (const role of ["head_coach", "super_admin", "va", "staff", "company_admin"]) {
    const result = await processSuppNotesSave({ id: COACH_ID, role, company_id: ORG }, "x");
    assert.equal(result.status, 403, `${role} should be rejected`);
  }
});

test("authenticated client gets 200 and note is persisted", async () => {
  const client: Profile = { id: CLIENT_ID, role: "client", company_id: ORG };
  const result = await processSuppNotesSave(client, "feeling great");
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  const row = adminSettings.find(r => r.key === `supp_client_notes:${CLIENT_ID}`);
  assert.ok(row, "note row must be written");
  // Legacy endpoint now appends a dated entry (thread format)
  const entries = JSON.parse(row!.value).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "feeling great");
  assert.equal(entries[0].role, "client");
});

test("processSuppNotesSave returns 500 on DB failure", async () => {
  simulateDbFailure = true;
  const client: Profile = { id: CLIENT_ID, role: "client", company_id: ORG };
  const result = await processSuppNotesSave(client, "hello");
  assert.equal(result.status, 500);
});

test("processRxNotesSave rejects unauthenticated with 401", async () => {
  const result = await processRxNotesSave(null, "hello");
  assert.equal(result.status, 401);
});

test("processRxNotesSave rejects non-client with 403", async () => {
  const coach: Profile = { id: COACH_ID, role: "coach", company_id: ORG };
  const result = await processRxNotesSave(coach, "hello");
  assert.equal(result.status, 403);
});

test("processRxNotesSave persists to rx_client_notes key for authenticated client", async () => {
  const client: Profile = { id: CLIENT_ID, role: "client", company_id: ORG };
  const result = await processRxNotesSave(client, "Metformin causing nausea");
  assert.equal(result.status, 200);
  const row = adminSettings.find(r => r.key === `rx_client_notes:${CLIENT_ID}`);
  assert.ok(row, "rx note row must be written");
  const entries = JSON.parse(row!.value).entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "Metformin causing nausea");
});

// ── Note threads ──────────────────────────────────────────────

const mkEntry = (over: Partial<NoteEntry> = {}): NoteEntry => ({
  id: "e1", author_id: CLIENT_ID, author_name: "Cammy Client",
  role: "client", text: "hello", at: "2026-08-17T12:00:00.000Z", ...over,
});

test("parseThread migrates legacy {notes} into one dated client entry", () => {
  const entries = parseThread(JSON.stringify({ notes: "old notepad text" }), "2026-01-02T03:04:05Z");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, "old notepad text");
  assert.equal(entries[0].role, "client");
  assert.equal(entries[0].at, "2026-01-02T03:04:05Z");
});

test("parseThread reads the new {entries} format and drops blank entries", () => {
  const entries = parseThread(JSON.stringify({ entries: [mkEntry(), mkEntry({ id: "e2", text: "  " })] }));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "e1");
});

test("appendThreadEntry keeps existing entries and appends the new one", async () => {
  const key = buildSuppNoteKey(CLIENT_ID);
  await appendThreadEntry(ORG, key, mkEntry());
  const after = await appendThreadEntry(ORG, key, mkEntry({ id: "e2", role: "coach", author_id: COACH_ID, text: "coach reply" }));
  assert.equal(after!.length, 2);
  assert.equal(after![1].role, "coach");
  const row = adminSettings.find(r => r.key === key);
  assert.equal(JSON.parse(row!.value).entries.length, 2);
});

test("appendThreadEntry dedupes an identical resubmit by the same author", async () => {
  const key = buildSuppNoteKey(CLIENT_ID);
  await appendThreadEntry(ORG, key, mkEntry());
  const after = await appendThreadEntry(ORG, key, mkEntry({ id: "e2" }));
  assert.equal(after!.length, 1);
});

test("first append folds in the legacy rx_plan.rxNotes seed so it never disappears", async () => {
  adminSettings.push({
    company_id: ORG, key: `rx_plan:${CLIENT_ID}`,
    value: JSON.stringify({ rxList: [], rxNotes: "old rx note" }),
  } as any);
  const legacy = await fetchLegacyRxEntry(ORG, CLIENT_ID);
  assert.ok(legacy, "legacy entry must be found");
  assert.equal(legacy!.text, "old rx note");
  const key = buildRxNoteKey(CLIENT_ID);
  const after = await appendThreadEntry(ORG, key, mkEntry({ id: "new1", text: "fresh note" }), [legacy!]);
  assert.equal(after!.length, 2);
  assert.equal(after![0].text, "old rx note");
  assert.equal(after![1].text, "fresh note");
  // Seed only applies to the FIRST entry — later appends don't duplicate it
  const again = await appendThreadEntry(ORG, key, mkEntry({ id: "new2", text: "another" }), [legacy!]);
  assert.equal(again!.filter(e => e.text === "old rx note").length, 1);
});

// ── Legacy Rx migration regression ────────────────────────────
// Before the separate-key migration, Rx notes were embedded in rx_plan as rxNotes.
// The frontend now reads rx_client_notes first (override) and falls back to
// rx_plan.rxNotes for existing clients.  This test verifies the coach-plan save
// path (upsertNote with rxNotes in rx_plan) does NOT clobber the legacy field.

test("client rx_client_notes save never touches the legacy rx_plan row", async () => {
  // Seed a legacy rx_plan row that embeds rxNotes (written by the old saveClientRxNotes)
  adminSettings.push({
    company_id: ORG,
    key: `rx_plan:${CLIENT_ID}`,
    value: JSON.stringify({ rxList: [{ id: "rx1", name: "Lisinopril" }], rxNotes: "legacy note" }),
  });

  // Client saves a new note via the API route — writes to rx_client_notes:<id>
  const client: Profile = { id: CLIENT_ID, role: "client", company_id: ORG };
  const result = await processRxNotesSave(client, "new note from client");
  assert.equal(result.status, 200);

  // The rx_plan row must be completely untouched
  const plan = adminSettings.find(r => r.key === `rx_plan:${CLIENT_ID}`);
  assert.ok(plan, "rx_plan row must still exist");
  const v = JSON.parse(plan!.value);
  assert.equal(v.rxNotes, "legacy note", "legacy rxNotes in rx_plan must not be erased");
  assert.ok(Array.isArray(v.rxList), "rxList must still be present");

  // The new note is in the separate key
  const noteRow = adminSettings.find(r => r.key === `rx_client_notes:${CLIENT_ID}`);
  assert.ok(noteRow, "rx_client_notes row must exist");
  assert.equal(JSON.parse(noteRow!.value).entries[0].text, "new note from client");
});
