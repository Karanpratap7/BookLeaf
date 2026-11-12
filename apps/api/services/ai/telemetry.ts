import { tokenize } from "./retrieval";

export type DraftOutcome = "accepted" | "edited" | "discarded";

/** Sent with only cosmetic changes (greeting, formatting): no added or removed content. */
export const ACCEPTED_AT = 0.95;
/** At least this much of the draft survives: the admin rewrote parts of it. */
export const EDITED_AT = 0.3;

/**
 * Jaccard overlap over content words (stopwords removed, light stemming). Cheap, deterministic
 * and stable across whitespace/formatting changes, which is what "did the admin use the draft?"
 * actually needs to survive.
 */
export function draftSimilarity(draft: string, sent: string): number {
  const a = new Set(tokenize(draft));
  const b = new Set(tokenize(sent));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * How the admin treated a generated draft, recorded when the reply is sent. This is the only
 * signal that says whether the AI draft was actually useful.
 */
export function classifyDraftUse(draft: string, sent: string): { outcome: DraftOutcome; similarity: number } {
  const similarity = Math.round(draftSimilarity(draft, sent) * 1000) / 1000;
  const outcome: DraftOutcome =
    similarity >= ACCEPTED_AT ? "accepted" : similarity >= EDITED_AT ? "edited" : "discarded";
  return { outcome, similarity };
}

export type DraftQualityRow = {
  category: string | null;
  categoryOverride: string | null;
  aiDraftSource: string | null;
  aiDraftOutcome: string | null;
  aiDraftSimilarity: number | null;
};

export type QualityBucket = {
  category: string;
  generated: number;
  fallbacks: number;
  evaluated: number;
  accepted: number;
  edited: number;
  discarded: number;
};

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0);

/**
 * Admin-facing AI quality summary. `accepted` means the draft was sent essentially as generated,
 * so accept rate is the closest thing to a usefulness metric without a human labelling pass.
 */
export function summariseDraftQuality(rows: DraftQualityRow[]) {
  const empty = () => ({ generated: 0, fallbacks: 0, evaluated: 0, accepted: 0, edited: 0, discarded: 0 });
  const totals = empty();
  const byCategory = new Map<string, QualityBucket>();
  let similaritySum = 0;
  let similarityCount = 0;

  for (const row of rows) {
    const category = row.categoryOverride || row.category || "Uncategorised";
    const bucket = byCategory.get(category) ?? { category, ...empty() };
    const generated = row.aiDraftSource != null;
    const fallback = row.aiDraftSource === "policy";
    const outcome = row.aiDraftOutcome;

    if (generated) {
      totals.generated += 1;
      bucket.generated += 1;
    }
    if (fallback) {
      totals.fallbacks += 1;
      bucket.fallbacks += 1;
    }
    if (outcome === "accepted" || outcome === "edited" || outcome === "discarded") {
      totals.evaluated += 1;
      bucket.evaluated += 1;
      totals[outcome] += 1;
      bucket[outcome] += 1;
      if (row.aiDraftSimilarity != null) {
        similaritySum += row.aiDraftSimilarity;
        similarityCount += 1;
      }
    }
    byCategory.set(category, bucket);
  }

  return {
    ...totals,
    acceptRate: rate(totals.accepted, totals.evaluated),
    editRate: rate(totals.edited, totals.evaluated),
    discardRate: rate(totals.discarded, totals.evaluated),
    fallbackRate: rate(totals.fallbacks, totals.generated),
    avgSimilarity: similarityCount > 0 ? Math.round((similaritySum / similarityCount) * 1000) / 1000 : 0,
    byCategory: [...byCategory.values()].sort(
      (a, b) => b.generated - a.generated || a.category.localeCompare(b.category),
    ),
    thresholds: { accepted: ACCEPTED_AT, edited: EDITED_AT },
  };
}
