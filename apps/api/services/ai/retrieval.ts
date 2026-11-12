export type KbDoc = { title: string; content: string; category?: string | null };
export type ScoredChunk = KbDoc & { score: number };

const STOPWORDS = new Set(
  (
    "a about after again all also am an and any are as at be because been before being both but by can could did do does " +
    "doing for from had has have having he her here hers him his how i if in into is it its just me more my no nor not now " +
    "of off on once only or other our out over own same she should so some such than that the their them then there these " +
    "they this those through to too under until up very was we were what when where which while who whom why will with " +
    "would you your"
  ).split(" "),
);

/** Crude suffix stripping so "royalties"/"royalty" and "printed"/"printing" collide. */
function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .map(stem);
}

/** Character trigrams: catches typos and near-misses ("royality") that exact tokens miss. */
function trigrams(text: string): Set<string> {
  const clean = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  const out = new Set<string>();
  for (let i = 0; i < clean.length - 2; i++) out.add(clean.slice(i, i + 3));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

const K1 = 1.2;
const B = 0.75;
const BM25_WEIGHT = 0.8;
const FUZZY_WEIGHT = 0.2;
/** A section's title is its topic label, so matches there count for more than body matches. */
const TITLE_WEIGHT = 3;
/** Extra credit when a query term is literally in a section title: "ISBN ..." should pick "ISBN Policy". */
const TITLE_MATCH_BOOST = 0.15;
const MAX_TITLE_MATCH_BOOST = 0.3;
/** Small prior for the ticket's assigned category, not a filter: cross-category retrieval is the point. */
const CATEGORY_BOOST = 0.15;
/** Drafts ignore chunks below this relevance, so an unrelated policy cannot steer the prompt. */
export const DRAFT_MIN_SCORE = 0.35;

/**
 * Hybrid lexical ranking over KB chunks: BM25 for term importance, character-trigram Dice for
 * typo tolerance. Deterministic, no embedding call, so it works with an empty `KbChunk.embedding`.
 */
export function rankChunks(
  query: string,
  docs: KbDoc[],
  { limit = 3, minScore = 0 }: { limit?: number; minScore?: number } = {},
): ScoredChunk[] {
  if (!docs.length) return [];

  const qTokens = tokenize(query);
  const docTokens = docs.map((d) => ({
    title: tokenize(d.title),
    body: tokenize(d.content),
  }));
  const docLengths = docTokens.map((d) => d.title.length + d.body.length);
  const avgLen = docLengths.reduce((sum, n) => sum + n, 0) / docs.length || 1;

  const docFreq = new Map<string, number>();
  for (const { title, body } of docTokens) {
    for (const t of new Set([...title, ...body])) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  const idf = (t: string) =>
    Math.log(1 + (docs.length - (docFreq.get(t) ?? 0) + 0.5) / ((docFreq.get(t) ?? 0) + 0.5));

  const qTrigrams = trigrams(query);
  const scored = docs.map((doc, i) => {
    const { title, body } = docTokens[i];
    const len = docLengths[i] || 1;
    const termFreq = new Map<string, number>();
    for (const t of body) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    for (const t of title) termFreq.set(t, (termFreq.get(t) ?? 0) + TITLE_WEIGHT);

    let bm25 = 0;
    for (const t of new Set(qTokens)) {
      const f = termFreq.get(t) ?? 0;
      if (!f) continue;
      bm25 += idf(t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * (len / avgLen))));
    }
    const titleHits = new Set(tokenize(doc.title).filter((t) => qTokens.includes(t))).size;
    return {
      doc,
      bm25,
      fuzzy: dice(qTrigrams, trigrams(`${doc.title} ${doc.content}`)),
      titleBoost: Math.min(MAX_TITLE_MATCH_BOOST, titleHits * TITLE_MATCH_BOOST),
    };
  });

  const maxBm25 = Math.max(...scored.map((s) => s.bm25), 0);
  return scored
    .map(({ doc, bm25, fuzzy, titleBoost }) => ({
      ...doc,
      // With no keyword overlap at all, the trigram score alone decides — this is what lets a
      // caller apply a relevance floor and refuse instead of answering from an unrelated section.
      score: Math.min(
        1,
        (maxBm25 > 0 ? BM25_WEIGHT * (bm25 / maxBm25) + FUZZY_WEIGHT * fuzzy : fuzzy) + titleBoost,
      ),
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Chunks for a draft: ranked across the whole KB (so a re-categorised ticket still finds the right
 * policy), then guaranteed to contain the assigned category's best chunk so grounding never
 * regresses to "no policy available".
 */
export function retrieveForDraft(
  query: string,
  docs: KbDoc[],
  category: string,
  { limit = 3, minScore = DRAFT_MIN_SCORE }: { limit?: number; minScore?: number } = {},
): ScoredChunk[] {
  // minScore -1 keeps zero-relevance chunks in play so the category fallback below always has one
  // to find, even for a query with no lexical overlap at all ("jioj").
  const ranked = rankChunks(query, docs, { limit: docs.length, minScore: -1 }).map((c) => ({
    ...c,
    score: c.category === category ? Math.min(1, c.score + CATEGORY_BOOST) : c.score,
  }));
  ranked.sort((a, b) => b.score - a.score);

  const selected = ranked.filter((c) => c.score >= minScore).slice(0, limit);
  const categoryDoc = ranked.find((c) => c.category === category);
  if (categoryDoc && !selected.some((c) => c.title === categoryDoc.title)) {
    if (selected.length < limit) selected.push(categoryDoc);
    else selected[selected.length - 1] = categoryDoc;
  }
  return selected;
}
