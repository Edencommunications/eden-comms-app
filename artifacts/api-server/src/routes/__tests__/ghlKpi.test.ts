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
  cashCommissionByCloser,
  buildContactCloserMap,
  parseGhlKpiSettingsBody,
  type Deal,
  type WeeklyPayload,
  type GhlTransaction,
  type CashCloserRow,
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

test("weekly marker key (weekStart) is stable across UTC midnight during one Central day", () => {
  // Mon Aug 10 2026, 11:00 UTC (6am CT) vs Tue Aug 11, 02:00 UTC (still Mon 9pm CT)
  const morning = computeWindows(new Date(Date.UTC(2026, 7, 10, 11)));
  const lateNight = computeWindows(new Date(Date.UTC(2026, 7, 11, 2)));
  assert.equal(morning.weekStart, "2026-08-03");
  assert.equal(lateNight.weekStart, "2026-08-03"); // same key → no duplicate post
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

// ── Helpers ──────────────────────────────────────────────────────

const deal = (value: number, closer: string, whenMs: number, contactId = ""): Deal =>
  ({ id: String(Math.random()), name: "Client", value, closer, whenMs, contactId });

const tx = (
  contactId: string,
  amount: number,
  status: GhlTransaction["status"],
  createdAt: string,
  updatedAt?: string,
  amountRefunded = 0,
): GhlTransaction => ({
  id: String(Math.random()),
  contactId,
  amount,
  amountRefunded,
  status,
  createdAt,
  updatedAt: updatedAt ?? createdAt,
});

const emptyCash: CashCloserRow[] = [];

const makePayload = (overrides: Partial<WeeklyPayload> = {}): WeeklyPayload => ({
  week_start: "2026-08-03", week_end: "2026-08-09",
  leads: 0,
  setter_calls_booked: 0, setter_calls_showed: 0,
  closing_calls_booked: 0, closing_calls_showed: 0,
  closed_deals: 0, total_amount: 0,
  commissions_by_closer: [], total_commissions: 0,
  cash_by_closer: emptyCash, total_cash_commissions: 0, total_cash_collected: 0,
  mtd: {
    start: "2026-08-01", closed_deals: 0, total_amount: 0,
    commissions_by_closer: [], total_commissions: 0,
    cash_by_closer: emptyCash, total_cash_commissions: 0, total_cash_collected: 0,
  },
  ...overrides,
});

// ── Deal-value commission helpers ────────────────────────────────

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

// ── Weekly message builder ───────────────────────────────────────

test("buildWeeklyMessage includes every KPI section and dollar amounts", () => {
  const cashRows: CashCloserRow[] = [{ name: "Lauren", collected: 8000, commission: 1200, txCount: 2 }];
  const p = makePayload({
    leads: 42,
    setter_calls_booked: 10, setter_calls_showed: 7,
    closing_calls_booked: 5, closing_calls_showed: 4,
    closed_deals: 2, total_amount: 10000,
    commissions_by_closer: [{ name: "Lauren", sales: 10000, commission: 1500, deals: 2 }],
    total_commissions: 1500,
    cash_by_closer: cashRows, total_cash_commissions: 1200, total_cash_collected: 8000,
    mtd: {
      start: "2026-08-01", closed_deals: 3, total_amount: 15000,
      commissions_by_closer: [{ name: "Lauren", sales: 15000, commission: 2250, deals: 3 }],
      total_commissions: 2250,
      cash_by_closer: cashRows, total_cash_commissions: 1200, total_cash_collected: 8000,
    },
  });
  const msg = buildWeeklyMessage(p);
  assert.match(msg, /WEEKLY KPI REPORT/);
  assert.match(msg, /New leads: 42/);
  assert.match(msg, /Booked: 10/);
  assert.match(msg, /Showed: 7/);
  assert.match(msg, /Deals closed: 2/);
  assert.match(msg, /CONTRACTED COMMISSIONS/);
  assert.match(msg, /COLLECTED COMMISSIONS/);
  assert.match(msg, /Lauren: \$1,500\.00 \(2 deals, \$10,000\.00 contracted\)/);
  assert.match(msg, /Lauren: \$1,200\.00 \(2 payments, \$8,000\.00 collected\)/);
  assert.match(msg, /MONTH TO DATE/);
  assert.match(msg, /\$2,250\.00/);
  assert.ok(!msg.includes("**"), "must be plain text, no markdown");
});

test("buildWeeklyMessage says so when nothing closed", () => {
  const p = makePayload();
  assert.match(buildWeeklyMessage(p), /No closed deals this week/);
  assert.match(buildWeeklyMessage(p), /No attributed payments received this week/);
});

// ── Payout message builder ───────────────────────────────────────

test("buildPayoutMessage totals cash commissions and shows contracted as reference", () => {
  const t = Date.UTC(2026, 7, 20);
  const cashRows: CashCloserRow[] = [
    { name: "Martin", collected: 9000, commission: 1350, txCount: 1 },
    { name: "Lauren", collected: 5000, commission: 750, txCount: 1 },
  ];
  const msg = buildPayoutMessage(
    "August 2026",
    [deal(10000, "Martin", t), deal(6000, "Lauren", t)],
    cashRows,
    14000,
  );
  assert.match(msg, /COMMISSION PAYOUT REPORT/);
  assert.match(msg, /August 2026/);
  assert.match(msg, /COLLECTED CASH/);
  assert.match(msg, /Martin: \$1,350\.00/);
  assert.match(msg, /Lauren: \$750\.00/);
  assert.match(msg, /Team total to pay: \$2,100\.00 on \$14,000\.00 collected/);
  assert.match(msg, /CONTRACTED REVENUE/);
  assert.match(msg, /Martin: \$10,000\.00 contracted/);
});

test("buildPayoutMessage respects configurable payout day with ordinal suffix", () => {
  const msg = buildPayoutMessage("August 2026", [], [], 0, 1);
  assert.match(msg, /payable on the 1st/);
  const msg22 = buildPayoutMessage("August 2026", [], [], 0, 22);
  assert.match(msg22, /payable on the 22nd/);
});

test("buildPayoutMessage handles an empty month", () => {
  const msg = buildPayoutMessage("July 2026", [], [], 0);
  assert.match(msg, /No attributed payments received in July 2026/);
});

// ── Settings body parser ─────────────────────────────────────────

test("parseGhlKpiSettingsBody: weekly toggle is independently persisted", () => {
  // Bug regression: the settings handler had `payout` duplicated where
  // `weekly` should be — enabling/disabling the weekly report was silently lost.
  let cfg: any = { weekly: false, payout: true };
  const { setters, error } = parseGhlKpiSettingsBody({ weekly: true });
  assert.ok(!error, "weekly-only body should not produce a validation error");
  assert.equal(setters.length, 1, "exactly one setter for weekly");
  for (const s of setters) s(cfg);
  assert.equal(cfg.weekly, true, "weekly must be flipped to true");
  assert.equal(cfg.payout, true, "payout must be untouched");
});

test("parseGhlKpiSettingsBody: weeklyDow and payoutDay update independently", () => {
  // Bug regression: the weeklyDow branch was reading req.body.payoutDay instead
  // of req.body.weeklyDow, so weeklyDow updates always failed or used payout value.
  let cfg: any = { weekly_dow: 1, payout_day: 15 };

  // weeklyDow-only update
  const r1 = parseGhlKpiSettingsBody({ weeklyDow: 3 });
  assert.ok(!r1.error);
  for (const s of r1.setters) s(cfg);
  assert.equal(cfg.weekly_dow, 3, "weekly_dow must be set to 3 (Wednesday)");
  assert.equal(cfg.payout_day, 15, "payout_day must be unchanged");

  // payoutDay-only update
  const r2 = parseGhlKpiSettingsBody({ payoutDay: 20 });
  assert.ok(!r2.error);
  for (const s of r2.setters) s(cfg);
  assert.equal(cfg.payout_day, 20, "payout_day must be updated to 20");
  assert.equal(cfg.weekly_dow, 3, "weekly_dow must still be 3");
});

test("parseGhlKpiSettingsBody: invalid weeklyDow (not 0-6) returns an error", () => {
  const r = parseGhlKpiSettingsBody({ weeklyDow: 7 });
  assert.ok(r.error, "weeklyDow=7 must be rejected");
  assert.match(r.error!, /0.*6|Sunday.*Saturday/i);
});

test("parseGhlKpiSettingsBody: invalid hourLocal returns an error", () => {
  assert.ok(parseGhlKpiSettingsBody({ hourLocal: 24 }).error, "hourLocal=24 must be rejected");
  assert.ok(parseGhlKpiSettingsBody({ hourLocal: -1 }).error, "hourLocal=-1 must be rejected");
  assert.ok(!parseGhlKpiSettingsBody({ hourLocal: 0 }).error, "hourLocal=0 is valid");
  assert.ok(!parseGhlKpiSettingsBody({ hourLocal: 23 }).error, "hourLocal=23 is valid");
});

test("parseGhlKpiSettingsBody: empty body produces no setters and no error", () => {
  const r = parseGhlKpiSettingsBody({});
  assert.equal(r.setters.length, 0);
  assert.ok(!r.error);
});

// ── Cash commission helper ────────────────────────────────────────

test("cashCommissionByCloser attributes succeeded transactions and subtracts refunds", () => {
  const startMs = Date.UTC(2026, 7, 1);  // Aug 1
  const endMs   = Date.UTC(2026, 8, 1);  // Sep 1
  const deals = [
    deal(5000, "Lauren", Date.UTC(2026, 6, 1), "cLauren"),
    deal(8000, "Martin", Date.UTC(2026, 6, 1), "cMartin"),
  ];
  const contactMap = buildContactCloserMap(deals);
  const txs: GhlTransaction[] = [
    // Lauren: two payments, one with an in-period partial refund already applied
    tx("cLauren", 2000, "succeeded", "2026-08-10T10:00:00Z", undefined, 500),
    tx("cLauren", 1000, "succeeded", "2026-08-20T10:00:00Z"),
    // Martin: payment in period
    tx("cMartin", 3000, "succeeded", "2026-08-15T10:00:00Z"),
    // Martin: prior-month payment, fully refunded this month (status=refunded)
    tx("cMartin", 500, "refunded", "2026-07-01T10:00:00Z", "2026-08-25T10:00:00Z"),
    // Unattributed: no deal for this contact
    tx("cNobody", 9999, "succeeded", "2026-08-05T10:00:00Z"),
    // Failed — should be ignored
    tx("cLauren", 9999, "failed", "2026-08-12T10:00:00Z"),
  ];
  const rows = cashCommissionByCloser(txs, contactMap, startMs, endMs);
  const lauren = rows.find((r) => r.name === "Lauren")!;
  const martin = rows.find((r) => r.name === "Martin")!;
  assert.ok(lauren, "Lauren should appear");
  assert.equal(lauren.collected, 2500); // (2000 - 500) + 1000
  assert.equal(lauren.commission, 375); // 15% of 2500
  assert.equal(lauren.txCount, 2);
  assert.ok(martin, "Martin should appear");
  assert.equal(martin.collected, 2500); // 3000 - 500 (full refund from prior month)
  assert.equal(martin.commission, 375); // 15% of 2500
  // Unattributed contact should NOT appear
  assert.ok(!rows.find((r) => r.name === "cNobody"), "unattributed should be excluded");
});

test("cashCommissionByCloser: prior-period payment with no refund is excluded from current period", () => {
  // A succeeded tx from a prior month with no amountRefunded must NOT produce
  // any positive or negative entry in the current period.
  const startMs = Date.UTC(2026, 7, 1);
  const endMs   = Date.UTC(2026, 8, 1);
  const deals = [deal(5000, "Lauren", Date.UTC(2026, 6, 1), "cLauren")];
  const contactMap = buildContactCloserMap(deals);
  const txs: GhlTransaction[] = [
    tx("cLauren", 2000, "succeeded", "2026-07-01T10:00:00Z", "2026-08-15T10:00:00Z", 0),
    tx("cLauren", 3000, "succeeded", "2026-07-10T10:00:00Z"),
  ];
  const rows = cashCommissionByCloser(txs, contactMap, startMs, endMs);
  assert.equal(rows.length, 0, "prior-period payments with no refund must produce no in-period entry");
});

test("cashCommissionByCloser: partial refund on prior-period succeeded tx — known limitation (task #293)", () => {
  // A succeeded tx from July; in August the client receives a $400 partial
  // refund (amountRefunded=400, updatedAt moves to August, status stays
  // "succeeded").  GHL always shows the CURRENT net state of the transaction.
  //
  // Known limitation: we cannot distinguish a partial refund that occurred
  // after the July payout was already calculated.  The GHL API shows the
  // current amountRefunded value regardless of when it was applied.
  //
  // Behavior:
  //   • July window: the tx appears in July at its current net value ($1600).
  //   • August window: tx is excluded (createdAt is in July, status="succeeded").
  const augStart = Date.UTC(2026, 7, 1);
  const augEnd   = Date.UTC(2026, 8, 1);
  const julStart = Date.UTC(2026, 6, 1);
  const julEnd   = Date.UTC(2026, 7, 1);
  const deals = [deal(5000, "Martin", Date.UTC(2026, 5, 1), "cMartin")];
  const contactMap = buildContactCloserMap(deals);
  const txs: GhlTransaction[] = [
    // July payment, partial refund issued in August (status stays succeeded)
    tx("cMartin", 2000, "succeeded", "2026-07-15T10:00:00Z", "2026-08-10T10:00:00Z", 400),
  ];

  // July: GHL shows the current net state — $2000 - $400 = $1600.
  const julRows = cashCommissionByCloser(txs, contactMap, julStart, julEnd);
  const martinJul = julRows.find((r) => r.name === "Martin")!;
  assert.ok(martinJul, "Martin should appear in July — createdAt is in July");
  assert.equal(martinJul.collected, 1600, "July shows current net (2000 - 400 partial refund)");
  assert.equal(martinJul.commission, 240); // 15% of 1600

  // August: the tx is excluded — createdAt is July, status is still "succeeded".
  // No negative adjustment for the partial refund (known limitation / task #293).
  const augRows = cashCommissionByCloser(txs, contactMap, augStart, augEnd);
  assert.equal(augRows.length, 0, "prior-period succeeded tx (status stays succeeded) produces no August entry");
});

test("cashCommissionByCloser: same-period full refund (status=refunded, createdAt in period) → zero", () => {
  const startMs = Date.UTC(2026, 7, 1);
  const endMs   = Date.UTC(2026, 8, 1);
  const deals = [deal(5000, "Lauren", Date.UTC(2026, 6, 1), "cLauren")];
  const contactMap = buildContactCloserMap(deals);
  const txs: GhlTransaction[] = [
    // Payment and refund both in August — should net to zero (skipped)
    tx("cLauren", 1500, "refunded", "2026-08-05T10:00:00Z", "2026-08-20T10:00:00Z", 1500),
  ];
  const rows = cashCommissionByCloser(txs, contactMap, startMs, endMs);
  assert.equal(rows.length, 0, "same-period payment + full refund should produce no net entry");
});
