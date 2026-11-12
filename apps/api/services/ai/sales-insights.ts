export type SalesBook = {
  title: string;
  genre: string | null;
  totalCopiesSold: number | null;
  totalRoyaltyEarned: number | null;
};

export type GenreStat = { copies: number; royalty: number; titles: string[] };

/** Cap on the per-book detail sent to the model. Aggregates are never capped. */
export const INSIGHT_SAMPLE_SIZE = 10;

/** Best sellers first, capped so the AI payload stays small. */
export function topSellersByCopies<T extends SalesBook>(books: T[], limit = INSIGHT_SAMPLE_SIZE): T[] {
  return [...books]
    .sort((a, b) => (b.totalCopiesSold ?? 0) - (a.totalCopiesSold ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Aggregates over the author's whole catalogue rather than the top-N sample, so a genre
 * carried by a low-selling title still shows up and the per-copy average isn't skewed
 * towards best sellers.
 */
export function summariseSales(books: SalesBook[]) {
  const genreStats: Record<string, GenreStat> = {};
  for (const book of books) {
    const genre = book.genre || "Unknown";
    const stat = (genreStats[genre] ??= { copies: 0, royalty: 0, titles: [] });
    stat.copies += book.totalCopiesSold ?? 0;
    stat.royalty += book.totalRoyaltyEarned ?? 0;
    stat.titles.push(book.title);
  }

  let bestGenre = "None";
  let bestGenreCopies = 0;
  for (const [genre, stat] of Object.entries(genreStats)) {
    if (stat.copies > bestGenreCopies) {
      bestGenre = genre;
      bestGenreCopies = stat.copies;
    }
  }

  let bestTitle = "None";
  let bestTitleCopies = 0;
  for (const book of books) {
    const copies = book.totalCopiesSold ?? 0;
    if (copies > bestTitleCopies) {
      bestTitle = book.title;
      bestTitleCopies = copies;
    }
  }

  const totalCopiesSold = books.reduce((sum, b) => sum + (b.totalCopiesSold ?? 0), 0);
  const totalRoyaltyEarned = books.reduce((sum, b) => sum + (b.totalRoyaltyEarned ?? 0), 0);

  return {
    totalBooks: books.length,
    totalCopiesSold,
    totalRoyaltyEarned,
    // No copies sold means no meaningful average; keep the "0.00" string the UI already expects.
    avgRoyaltyPerCopy: totalCopiesSold > 0 ? (totalRoyaltyEarned / totalCopiesSold).toFixed(2) : "0.00",
    bestSellingTitle: { title: bestTitle, copies: bestTitleCopies },
    bestSellingGenre: {
      genre: bestGenre,
      totalCopies: bestGenreCopies,
      titles: genreStats[bestGenre]?.titles ?? [],
    },
    genreStats,
  };
}
