import { test } from "node:test";
import assert from "node:assert/strict";
import { rankChunks, type KbDoc } from "./retrieval";

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

test("rankChunks with minScore 0.45 refuses irrelevant query (weather in Delhi)", () => {
  const chunks = rankChunks("what is the weather in Delhi today", KB, { limit: 3, minScore: 0.45 });
  assert.deepEqual(chunks, []);
});

test("rankChunks with minScore 0.45 accepts royalty query", () => {
  const chunks = rankChunks("my royalties still haven't been paid, when do I get my money?", KB, {
    limit: 3,
    minScore: 0.45,
  });
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, "Royalty Policy");
  assert.ok(chunks[0].score >= 0.45, `score should be >= 0.45, got ${chunks[0].score}`);
});

test("rankChunks with minScore 0.45 accepts ISBN query", () => {
  const chunks = rankChunks("the ISBN on my Amazon listing is different from the printed book", KB, {
    limit: 3,
    minScore: 0.45,
  });
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, "ISBN Policy");
  assert.ok(chunks[0].score >= 0.45, `score should be >= 0.45, got ${chunks[0].score}`);
});

test("rankChunks with minScore 0.45 accepts print quality query", () => {
  const chunks = rankChunks("pages are blurry and the binding is coming apart", KB, {
    limit: 3,
    minScore: 0.45,
  });
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, "Print Quality Policy");
  assert.ok(chunks[0].score >= 0.45, `score should be >= 0.45, got ${chunks[0].score}`);
});

test("rankChunks with minScore 0.45 accepts distribution query", () => {
  const chunks = rankChunks("my book shows out of stock on Flipkart", KB, { limit: 3, minScore: 0.45 });
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, "Distribution Policy");
  assert.ok(chunks[0].score >= 0.45, `score should be >= 0.45, got ${chunks[0].score}`);
});

test("rankChunks with minScore 0.45 accepts production status query", () => {
  const chunks = rankChunks("when will my book be ready, what is the production status", KB, {
    limit: 3,
    minScore: 0.45,
  });
  assert.ok(chunks.length > 0);
  assert.equal(chunks[0].title, "Production Timeline");
  assert.ok(chunks[0].score >= 0.45, `score should be >= 0.45, got ${chunks[0].score}`);
});

test("rankChunks returns normalised scores 0..1 sorted descending", () => {
  const chunks = rankChunks("royalty payment schedule", KB, { limit: 3, minScore: 0 });
  for (const c of chunks) assert.ok(c.score >= 0 && c.score <= 1, `score out of range: ${c.score}`);
  const scores = chunks.map((c) => c.score);
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
  );
});
