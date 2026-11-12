import { test } from "node:test";
import assert from "node:assert/strict";
import { rankChunks, retrieveForDraft, type KbDoc } from "./retrieval";

// Excerpts shaped like the real seeded KB (one section per policy area).
const KB: KbDoc[] = [
  {
    category: "Royalty & Payments",
    title: "Royalty Policy",
    content:
      "BookLeaf follows an 80/20 royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf. Net profit = MRP minus printing cost, platform commission and shipping charges. Royalties are calculated quarterly and paid within 45 days of the quarter ending. Minimum payout threshold: ₹1,000. If accumulated royalties are below this, they roll over to the next quarter. Payouts are made via bank transfer.",
  },
  {
    category: "ISBN & Metadata Issues",
    title: "ISBN Policy",
    content:
      "Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf. ISBNs are registered under BookLeaf's publisher imprint. If an author reports an ISBN error (duplicate, wrong book linked), it is treated as a high-priority issue and escalated to the production team.",
  },
  {
    category: "ISBN & Metadata Issues",
    title: "Metadata Updates",
    content:
      "Metadata updates such as the book description can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.",
  },
  {
    category: "Printing & Quality",
    title: "Print Quality Policy",
    content:
      "If a printed copy arrives with a misprint, blurry pages, binding defects or cover damage, authors should share photos. BookLeaf arranges a free reprint, which typically takes 5–7 business days.",
  },
  {
    category: "Distribution & Availability",
    title: "Distribution Policy",
    content:
      "Books are distributed to Amazon, Flipkart and other platforms. If a listing shows unavailable or out of stock, the warehouse triggers a stock re-sync, usually live again within 24–48 hours.",
  },
  {
    category: "Book Status & Production Updates",
    title: "Production Timeline",
    content:
      "Production covers cover design, typesetting, proofreading and printing. Delays most often happen at cover design approval and proofreading revision rounds. The current stage is visible in the dashboard.",
  },
];

const top = (query: string, docs: KbDoc[] = KB) => rankChunks(query, docs, { limit: 3 });

test("a royalty question outranks every other section", () => {
  const [first] = top("my royalties still haven't been paid, when do I get my money?");
  assert.equal(first.title, "Royalty Policy");
});

test("an ISBN mismatch finds the ISBN section", () => {
  const [first] = top("the ISBN on my Amazon listing is different from the printed book");
  assert.equal(first.title, "ISBN Policy");
});

test("a print defect finds the printing section", () => {
  const [first] = top("pages are blurry and the binding is coming apart");
  assert.equal(first.title, "Print Quality Policy");
});

test("an out-of-stock listing finds distribution, not printing", () => {
  const [first] = top("my book shows out of stock on Flipkart");
  assert.equal(first.title, "Distribution Policy");
});

test("a typo still retrieves the right section (trigram component)", () => {
  const [first] = top("royality paymnt is late");
  assert.equal(first.title, "Royalty Policy");
});

test("stemming matches royalties/royalty and paid/pay", () => {
  const [first] = top("royalty payout schedule");
  assert.equal(first.title, "Royalty Policy");
});

test("retrieval spans the whole KB, not just the ticket's category", () => {
  // A ticket filed under General Inquiry whose text is really about ISBNs.
  const chunks = retrieveForDraft("my ISBN is wrong on Amazon", KB, "General Inquiry", { limit: 3 });
  assert.ok(
    chunks.some((c) => c.title === "ISBN Policy"),
    "should have pulled the ISBN section",
  );
});

test("the assigned category is always represented, even when it ranks last", () => {
  // Text is entirely about royalties, but the admin re-categorised it to Printing & Quality —
  // the old exact-match behaviour must not regress to "no policy available".
  const chunks = retrieveForDraft("quarterly royalty payout bank transfer", KB, "Printing & Quality", {
    limit: 3,
  });
  assert.ok(chunks.length <= 3);
  assert.ok(
    chunks.some((c) => c.title === "Print Quality Policy"),
    "assigned category must be present",
  );
  assert.equal(chunks[0].title, "Royalty Policy");
});

test("scores are normalised to 0..1 and sorted descending", () => {
  const chunks = top("royalty payment");
  for (const c of chunks) assert.ok(c.score >= 0 && c.score <= 1, `score out of range: ${c.score}`);
  const scores = chunks.map((c) => c.score);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
});

test("an irrelevant query scores below a relevance floor, enabling refusal", () => {
  const [best] = rankChunks("what is the weather in Delhi today", KB, { limit: 1 });
  assert.ok(best, "still returns a candidate");
  assert.ok(best.score < 0.35, `expected a weak match, got ${best.score} for ${best.title}`);
  assert.deepEqual(rankChunks("what is the weather in Delhi today", KB, { minScore: 0.35 }), []);
});

test("an on-topic query clears the same floor", () => {
  const [best] = top("when is my royalty payout due");
  assert.ok(best.score >= 0.35, `expected a strong match, got ${best.score}`);
});

test("weak, unrelated sections are kept out of the draft prompt", () => {
  // Regression: this query used to drag in Distribution Policy at ~0.3, which is not about payouts.
  const chunks = retrieveForDraft("when will I receive my royalty payment", KB, "Royalty & Payments");
  assert.ok(chunks.some((c) => c.title === "Royalty Policy"));
  assert.ok(!chunks.some((c) => c.title === "Distribution Policy"), "irrelevant chunk leaked in");
  for (const c of chunks) assert.ok(c.score >= 0.35 || c.category === "Royalty & Payments");
});

test("a query with no lexical overlap still gets the assigned category's policy", () => {
  // Regression: "jioj" scored zero against every chunk, which dropped the whole ranked list and
  // left the draft with no POLICY CONTEXT at all.
  const chunks = retrieveForDraft("jioj", KB, "Royalty & Payments");
  assert.deepEqual(
    chunks.map((c) => c.title),
    ["Royalty Policy"],
  );
});

test("empty inputs are handled without throwing", () => {
  assert.deepEqual(rankChunks("royalty", [], {}), []);
  assert.deepEqual(retrieveForDraft("royalty", [], "Royalty & Payments"), []);
});

test("a single-chunk KB still ranks it", () => {
  const [only] = rankChunks("royalty", [KB[0]]);
  assert.equal(only.title, "Royalty Policy");
});
