import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseSales, topSellersByCopies, type SalesBook } from "./sales-insights";

const book = (
  title: string,
  genre: string | null,
  copies: number | null,
  royalty: number | null,
): SalesBook => ({
  title,
  genre,
  totalCopiesSold: copies,
  totalRoyaltyEarned: royalty,
});

// Twelve books: the sample cap keeps 10, so #11 and #12 must still count in the aggregates.
const catalogue: SalesBook[] = [
  book("Bestseller One", "Literary Fiction", 342, 12800),
  book("Bestseller Two", "Literary Fiction", 90, 3300),
  book("Bestseller Three", "Poetry", 45, 1600),
  book("Bestseller Four", "Poetry", 30, 1100),
  book("Bestseller Five", "Thriller", 20, 700),
  book("Bestseller Six", "Thriller", 18, 640),
  book("Bestseller Seven", "History", 15, 520),
  book("Bestseller Eight", "History", 12, 410),
  book("Bestseller Nine", "Memoir", 9, 300),
  book("Bestseller Ten", "Memoir", 8, 260),
  book("Quiet Essay Collection", "Essays", 2, 80),
  book("Quiet Cookbook", "Essays", 1, 40),
];

test("the per-book sample is capped at the top 10 by copies sold", () => {
  const sample = topSellersByCopies(catalogue);
  assert.equal(sample.length, 10);
  assert.equal(sample[0].title, "Bestseller One");
  assert.equal(sample.at(-1)!.title, "Bestseller Ten");
  // The two lowest sellers are deliberately excluded from the sample...
  assert.deepEqual(
    sample.map((b) => b.title),
    catalogue.map((b) => b.title).slice(0, 10),
  );
});

test("a genre carried only by out-of-sample titles still appears and ranks", () => {
  const { genreStats, bestSellingGenre } = summariseSales(catalogue);
  // "Essays" exists only in #11 and #12, which the top-10 cap drops.
  assert.deepEqual(genreStats.Essays, {
    copies: 3,
    royalty: 120,
    titles: ["Quiet Essay Collection", "Quiet Cookbook"],
  });
  assert.equal(bestSellingGenre.genre, "Literary Fiction");
  assert.equal(bestSellingGenre.totalCopies, 432);
  assert.deepEqual(bestSellingGenre.titles, ["Bestseller One", "Bestseller Two"]);
});

test("average royalty per copy and totals cover the whole catalogue", () => {
  const s = summariseSales(catalogue);
  assert.equal(s.totalBooks, 12);
  assert.equal(s.totalCopiesSold, 592);
  assert.equal(s.totalRoyaltyEarned, 21_750);
  // 21750 / 592 = 36.74; the top-10-only average would have been 36.72.
  assert.equal(s.avgRoyaltyPerCopy, "36.74");
  assert.notEqual(s.avgRoyaltyPerCopy, "36.72");
});

test("best-selling title and genre come from the full catalogue", () => {
  const s = summariseSales(catalogue);
  assert.deepEqual(s.bestSellingTitle, { title: "Bestseller One", copies: 342 });
  assert.equal(s.bestSellingGenre.genre, "Literary Fiction");
});

test("empty catalogue renders zeroes and placeholder labels, never NaN", () => {
  const s = summariseSales([]);
  assert.equal(s.totalBooks, 0);
  assert.equal(s.totalCopiesSold, 0);
  assert.equal(s.avgRoyaltyPerCopy, "0.00");
  assert.deepEqual(s.bestSellingTitle, { title: "None", copies: 0 });
  assert.deepEqual(s.bestSellingGenre, { genre: "None", totalCopies: 0, titles: [] });
  assert.deepEqual(s.genreStats, {});
  assert.deepEqual(topSellersByCopies([]), []);
});

test("books in production (null genre, copies, royalty) count as zero, not NaN", () => {
  const s = summariseSales([
    book("Unpublished", null, null as unknown as number, null as unknown as number),
    book("Live", "Poetry", 10, 350),
  ]);
  assert.deepEqual(s.genreStats.Unknown, { copies: 0, royalty: 0, titles: ["Unpublished"] });
  assert.equal(s.totalCopiesSold, 10);
  assert.equal(s.totalRoyaltyEarned, 350);
  assert.equal(s.avgRoyaltyPerCopy, "35.00");
  assert.equal(s.bestSellingGenre.genre, "Poetry");
});

test("a single book is its own best seller and genre", () => {
  const s = summariseSales([book("Only One", "Fantasy", 7, 260)]);
  assert.deepEqual(s.bestSellingTitle, { title: "Only One", copies: 7 });
  assert.equal(s.bestSellingGenre.genre, "Fantasy");
  assert.equal(s.bestSellingGenre.totalCopies, 7);
});
