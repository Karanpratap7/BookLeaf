const DAY = 86_400_000;

/** Last day (UTC) of the quarter that contains `d`, offset by `quarterShift` quarters. */
function quarterEnd(d: Date, quarterShift = 0): Date {
  const q = Math.floor(d.getUTCMonth() / 3) + quarterShift;
  return new Date(Date.UTC(d.getUTCFullYear(), (q + 1) * 3, 0));
}

/**
 * KB policy: royalties are calculated quarterly and paid within 45 days of quarter end.
 * The next payout is the just-ended quarter's deadline if it hasn't passed yet,
 * otherwise the current quarter's.
 */
export function nextPayoutDate(today: Date = new Date()): Date {
  const lastDue = new Date(quarterEnd(today, -1).getTime() + 45 * DAY);
  if (today.getTime() <= lastDue.getTime()) return lastDue;
  return new Date(quarterEnd(today).getTime() + 45 * DAY);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "not available";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Pending royalty above the ₹1,000 threshold with no payout in ~2 quarterly cycles (or never,
 * for a book published that long ago) means BookLeaf missed a payout.
 * ponytail: heuristic from aggregate fields; a per-quarter royalty ledger would make this exact.
 */
export function isRoyaltyOverdue(
  b: { royaltyPending: number; lastRoyaltyPayoutDate: Date | null; publicationDate: Date | null },
  today: Date = new Date(),
): boolean {
  if (b.royaltyPending < 1000) return false;
  const since = b.lastRoyaltyPayoutDate ?? b.publicationDate;
  return !!since && today.getTime() - new Date(since).getTime() > 182 * DAY;
}
