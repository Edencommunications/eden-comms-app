// Unit tests for the pure GHL KPI helpers: reporting windows, commission
// math, and the posted message formats.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  centralMidnightMs,
  computeWindows,
  payoutWindow,
  dealsInRange,
  commissionByCloser,
  buildWeeklyMessage,
  buildPayoutMessage,
  type Deal,
  type WeeklyPayload,
} from "../ghlKpi";

test("computeWindows on a Monday covers the previous Mon–Sun", () => {
  // Monday Aug 10 2026 11:00 UTC
  const w = computeWindows(new Date(Date.UTC(2026, 7, 10, 11)));
  assert.equal(w.weekStart, "2026-08-03");
  assert.equal(w.weekEnd, "2026-08-09");
  assert.equal(w.weekEndMs - w.weekStartMs, 7 * 86400_000);
  assert.equal(w.mtdStart, "2026-08-01");
});

test("computeWindows mid-week still reports the last FULL Mon–Sun", () => {
  // Thursday Aug 13 2026
  const w = computeWindows(new Date(Date.UTC(2026, 7, 13, 15)));
  assert.equal(w.weekStart, "2026-08-03");
  assert.equal(w.weekEnd, "2026-08-09");
});

test("computeWindows handles month boundaries", () => {
  // Monday Sep 7 2026 → previous week Aug 31–Sep 6, MTD starts Sep 1
  const w = computeWindows(new Date(Date.UTC(2026, 8, 7, 12)));
  assert.equal(w.weekStart, "2026-08-31");
  assert.equal(w.weekEnd, "2026-09-06");
  assert.equal(w.mtdStart, "2026-09-01");
});

test("week boundaries are US Central midnights, not UTC", () => {
  const w = computeWindows(new Date(Date.UTC(2026, 7, 10, 11))); // Aug = CDT (UTC-5)
  assert.equal(new Date(w.weekStartMs).toISOString(), "2026-08-03T05:00:00.000Z");
  assert.equal(new Date(w.weekEndMs).toISOString(), "2026-08-10T05:00:00.000Z");
});

test("centralMidnightMs handles CST vs CDT", () => {
  assert.equal(new Date(centralMidnightMs(2026, 0, 15)).toISOString(), "2026-01-15T06:00:00.000Z"); // CST
  assert.equal(new Date(centralMidnightMs(2026, 6, 15)).toISOString(), "2026-07-15T05:00:00.000Z"); // CDT
});

test("the week containing the fall DST change is an hour longer", () => {
  // DST ends Sun Nov 1 2026 in Chicago → Mon Nov 2 reports Oct 26–Nov 1
  const w = computeWindows(new Date(Date.UTC(2026, 10, 2, 12)));
  assert.equal(w.weekStart, "2026-10-26");
  assert.equal(w.weekEnd, "2026-11-01");
  assert.equal(w.weekEndMs - w.weekStartMs, 7 * 86400_000 + 3600_000);
});

test("payoutWindow on the 15th covers the previous calendar month", () => {
  const p = payoutWindow(new Date(Date.UTC(2026, 8, 15, 12))); // Sep 15
  assert.equal(p.label, "August 2026");
  assert.equal(new Date(p.startMs).toISOString().slice(0, 10), "2026-08-01");
  assert.equal(new Date(p.endMs).toISOString().slice(0, 10), "2026-09-01");
});

test("payoutWindow in January reaches back to December of last year", () => {
  const p = payoutWindow(new Date(Date.UTC(2027, 0, 15, 12)));
  assert.equal(p.label, "December 2026");
});

const deal = (value: number, closer: string, whenMs: number): Deal =>
  ({ id: String(Math.random()), name: "Client", value, closer, whenMs });

test("dealsInRange is inclusive of start, exclusive of end", () => {
  const start = Date.UTC(2026, 7, 3), end = Date.UTC(2026, 7, 10);
  const deals = [deal(100, "A", start), deal(200, "A", end - 1), deal(300, "A", end), deal(400, "A", start - 1)];
  const inRange = dealsInRange(deals, start, end);
  assert.equal(inRange.length, 2);
  assert.equal(inRange.reduce((s, d) => s + d.value, 0), 300);
});

test("commissionByCloser applies 15% per closer and sorts by sales", () => {
  const t = Date.UTC(2026, 7, 5);
  const rows = commissionByCloser([
    deal(1000, "Lauren", t), deal(3000, "Martin", t), deal(2000, "Lauren", t),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.name, "Lauren");        // 3000 in sales
  assert.equal(rows[0]!.commission, 450);       // 15% of 3000
  assert.equal(rows[0]!.deals, 2);
  assert.equal(rows[1]!.name, "Martin");
  assert.equal(rows[1]!.commission, 450);
});

test("buildWeeklyMessage includes every KPI section and dollar amounts", () => {
  const p: WeeklyPayload = {
    week_start: "2026-08-03", week_end: "2026-08-09",
    leads: 42,
    setter_calls_booked: 10, setter_calls_showed: 7,
    closing_calls_booked: 5, closing_calls_showed: 4,
    closed_deals: 2, total_amount: 10000,
    commissions_by_closer: [{ name: "Lauren", sales: 10000, commission: 1500, deals: 2 }],
    total_commissions: 1500,
    mtd: { start: "2026-08-01", closed_deals: 3, total_amount: 15000,
      commissions_by_closer: [{ name: "Lauren", sales: 15000, commission: 2250, deals: 3 }],
      total_commissions: 2250 },
  };
  const msg = buildWeeklyMessage(p);
  assert.match(msg, /WEEKLY KPI REPORT/);
  assert.match(msg, /New leads: 42/);
  assert.match(msg, /Booked: 10/);
  assert.match(msg, /Showed: 7/);
  assert.match(msg, /Deals closed: 2/);
  assert.match(msg, /\$10,000\.00/);
  assert.match(msg, /Lauren: \$1,500\.00 \(2 deals, \$10,000\.00 in sales\)/);
  assert.match(msg, /MONTH TO DATE/);
  assert.match(msg, /\$2,250\.00/);
  assert.ok(!msg.includes("**"), "must be plain text, no markdown");
});

test("buildWeeklyMessage says so when nothing closed", () => {
  const p: WeeklyPayload = {
    week_start: "2026-08-03", week_end: "2026-08-09",
    leads: 0, setter_calls_booked: 0, setter_calls_showed: 0,
    closing_calls_booked: 0, closing_calls_showed: 0,
    closed_deals: 0, total_amount: 0,
    commissions_by_closer: [], total_commissions: 0,
    mtd: { start: "2026-08-01", closed_deals: 0, total_amount: 0, commissions_by_closer: [], total_commissions: 0 },
  };
  assert.match(buildWeeklyMessage(p), /No closed deals this week/);
});

test("buildPayoutMessage totals commissions for the month", () => {
  const t = Date.UTC(2026, 7, 20);
  const msg = buildPayoutMessage("August 2026", [deal(10000, "Martin", t), deal(6000, "Lauren", t)]);
  assert.match(msg, /COMMISSION PAYOUT REPORT/);
  assert.match(msg, /August 2026/);
  assert.match(msg, /Martin: \$1,500\.00/);
  assert.match(msg, /Lauren: \$900\.00/);
  assert.match(msg, /Team total: \$2,400\.00 on \$16,000\.00/);
});

test("buildPayoutMessage handles an empty month", () => {
  assert.match(buildPayoutMessage("July 2026", []), /No deals were closed in July 2026/);
});
