import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPayoutDate, isRoyaltyOverdue } from "./payout";

const iso = (d: Date) => d.toISOString().slice(0, 10);

test("inside the 45-day window: payout for the quarter that just ended", () => {
  // Q3 ends 30 Sep, +45 days = 14 Nov
  assert.equal(iso(nextPayoutDate(new Date("2026-10-29T10:00:00Z"))), "2026-11-14");
});

test("window passed: payout for the current quarter", () => {
  // Q4 2026 window closed 14 Feb; Q1 2027 ends 31 Mar, +45 = 15 May
  assert.equal(iso(nextPayoutDate(new Date("2027-02-20T00:00:00Z"))), "2027-05-15");
});

test("year rollover: January points at Q4 of the previous year", () => {
  assert.equal(iso(nextPayoutDate(new Date("2027-01-10T00:00:00Z"))), "2027-02-14");
});

test("overdue: above threshold and never paid for a book live > 6 months", () => {
  const today = new Date("2026-10-29T00:00:00Z");
  const base = { publicationDate: new Date("2024-03-01"), lastRoyaltyPayoutDate: null };
  assert.equal(isRoyaltyOverdue({ ...base, royaltyPending: 2546 }, today), true);
  assert.equal(isRoyaltyOverdue({ ...base, royaltyPending: 850 }, today), false); // below ₹1,000 rolls over
  assert.equal(
    isRoyaltyOverdue({ ...base, royaltyPending: 3570, lastRoyaltyPayoutDate: new Date("2026-08-15") }, today),
    false,
  );
});
