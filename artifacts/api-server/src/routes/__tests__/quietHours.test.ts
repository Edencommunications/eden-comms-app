// quietHours.test.ts — unit tests for the quiet-hours window logic in
// src/routes/push.ts (inQuietHours). Covers midnight-wrapping windows,
// non-wrap windows, boundary minutes (start inclusive, end exclusive),
// start==end (off), the off flag, invalid HH:MM inputs, and invalid or
// missing timezones falling back to UTC.
// Run with:  pnpm --filter @workspace/api-server run test

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test } from "node:test";
import assert from "node:assert/strict";
import { inQuietHours } from "../push";

type Quiet = { on: boolean; start: string; end: string; tz?: string };
const q = (start: string, end: string, extra: Partial<Quiet> = {}): Quiet => ({
  on: true, start, end, ...extra,
});
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// ── Wrap-around window (22:00–07:00) ───────────────────────────
test("wrap window: inside late-night portion (23:30)", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("23:30")), true);
});
test("wrap window: inside early-morning portion (03:00)", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("03:00")), true);
});
test("wrap window: midnight itself is inside", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), 0), true);
});
test("wrap window: daytime is outside (12:00)", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("12:00")), false);
});
test("wrap window: just before start is outside (21:59)", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("21:59")), false);
});

// ── Non-wrap window (09:00–17:00) ──────────────────────────────
test("non-wrap window: inside (12:00)", () => {
  assert.equal(inQuietHours(q("09:00", "17:00"), mins("12:00")), true);
});
test("non-wrap window: before start is outside (08:59)", () => {
  assert.equal(inQuietHours(q("09:00", "17:00"), mins("08:59")), false);
});
test("non-wrap window: after end is outside (17:01)", () => {
  assert.equal(inQuietHours(q("09:00", "17:00"), mins("17:01")), false);
});

// ── Boundary minutes: start inclusive, end exclusive ───────────
test("start minute is inside (inclusive), non-wrap", () => {
  assert.equal(inQuietHours(q("09:00", "17:00"), mins("09:00")), true);
});
test("end minute is outside (exclusive), non-wrap", () => {
  assert.equal(inQuietHours(q("09:00", "17:00"), mins("17:00")), false);
});
test("start minute is inside (inclusive), wrap", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("22:00")), true);
});
test("end minute is outside (exclusive), wrap", () => {
  assert.equal(inQuietHours(q("22:00", "07:00"), mins("07:00")), false);
});

// ── start == end ⇒ zero-length window ⇒ off ────────────────────
test("start == end is treated as off, even at that exact minute", () => {
  assert.equal(inQuietHours(q("10:00", "10:00"), mins("10:00")), false);
  assert.equal(inQuietHours(q("10:00", "10:00"), mins("03:00")), false);
});

// ── Off flag / missing config ──────────────────────────────────
test("on:false disables the window even when inside it", () => {
  assert.equal(inQuietHours({ on: false, start: "22:00", end: "07:00" }, mins("23:00")), false);
});
test("undefined quiet config is never quiet", () => {
  assert.equal(inQuietHours(undefined, mins("23:00")), false);
});

// ── Invalid HH:MM ⇒ treated as off ─────────────────────────────
test("invalid start (25:00) disables", () => {
  assert.equal(inQuietHours(q("25:00", "07:00"), mins("03:00")), false);
});
test("invalid end (07:60) disables", () => {
  assert.equal(inQuietHours(q("22:00", "07:60"), mins("23:00")), false);
});
test("non-time garbage disables", () => {
  assert.equal(inQuietHours(q("night", "morning"), mins("23:00")), false);
});
test("empty strings disable", () => {
  assert.equal(inQuietHours(q("", ""), mins("23:00")), false);
});

// ── Timezone handling ──────────────────────────────────────────
// When `now` is omitted, the current wall-clock minutes are computed in the
// window's timezone; an invalid/missing tz must fall back to UTC. We compute
// the expected answer with the same Intl conversion the implementation uses.
function utcMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return (h % 24) * 60 + m;
}
// Build a window guaranteed to contain (or exclude) the current UTC minute.
const pad = (n: number) => String(n).padStart(2, "0");
const hhmmOf = (total: number) => {
  const t = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

test("invalid tz falls back to UTC (window around current UTC minute)", () => {
  const cur = utcMinutesNow();
  const inside = q(hhmmOf(cur - 60), hhmmOf(cur + 60), { tz: "Not/AZone" });
  const outside = q(hhmmOf(cur + 60), hhmmOf(cur + 120), { tz: "Not/AZone" });
  assert.equal(inQuietHours(inside), true);
  assert.equal(inQuietHours(outside), false);
});

test("missing tz falls back to UTC", () => {
  const cur = utcMinutesNow();
  const inside = q(hhmmOf(cur - 60), hhmmOf(cur + 60));
  assert.equal(inQuietHours(inside), true);
});

test("valid non-UTC tz is honored (America/New_York offset window)", () => {
  // New York is 4–5 hours behind UTC; build a window centered on NY's
  // current minute and confirm it reads as inside with the NY tz.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const nyCur =
    (Number(parts.find((p) => p.type === "hour")?.value || 0) % 24) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value || 0);
  const inside = q(hhmmOf(nyCur - 60), hhmmOf(nyCur + 60), { tz: "America/New_York" });
  assert.equal(inQuietHours(inside), true);
});
