import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDraftUse,
  draftSimilarity,
  summariseDraftQuality,
  ACCEPTED_AT,
  EDITED_AT,
} from "./telemetry";

const DRAFT = `Hi Priya,

Royalties are calculated quarterly and paid within 45 days of the quarter ending. Your share is 80% of the net profit per copy, and payouts are made once the accumulated amount crosses ₹1,000.

For this title we show 342 copies sold, ₹19,908 earned and ₹3,570 pending. The next payout is scheduled for 14 November 2026.

Our payments team will verify your royalty ledger and get back to you within 48 hours.

Warm regards,
BookLeaf Author Support`;

test("a draft sent untouched counts as accepted", () => {
  const { outcome, similarity } = classifyDraftUse(DRAFT, DRAFT);
  assert.equal(similarity, 1);
  assert.equal(outcome, "accepted");
});

test("whitespace and greeting tweaks still count as accepted", () => {
  const sent = DRAFT.replace("Hi Priya,", "Hello Priya,").replace(/\n\n/g, "\n");
  const { outcome } = classifyDraftUse(DRAFT, sent);
  assert.equal(outcome, "accepted");
});

test("inserting a sentence into the draft counts as edited, not accepted", () => {
  const sent = DRAFT.replace(
    "Our payments team will verify",
    "I have also flagged this to our finance lead personally. Our payments team will verify",
  );
  const { outcome, similarity } = classifyDraftUse(DRAFT, sent);
  assert.ok(similarity < ACCEPTED_AT, `similarity ${similarity} should be below ${ACCEPTED_AT}`);
  assert.equal(outcome, "edited");
});

test("a reply that ignores the draft counts as discarded", () => {
  const sent = `Hi Priya,

Unfortunately we cannot help with this request, as it falls outside our support scope. Please contact your distributor directly.

Warm regards,
BookLeaf Author Support`;
  const { outcome, similarity } = classifyDraftUse(DRAFT, sent);
  assert.ok(similarity < EDITED_AT, `similarity ${similarity} should be below ${EDITED_AT}`);
  assert.equal(outcome, "discarded");
});

test("reformatting numbers or line breaks does not tank similarity", () => {
  const sent = DRAFT.replace("₹3,570", "Rs. 3,570").replace(/\n/g, "\n\n");
  assert.ok(draftSimilarity(DRAFT, sent) >= ACCEPTED_AT);
});

test("similarity is symmetric and bounded", () => {
  const other = "Royalties are paid quarterly within 45 days.";
  assert.equal(draftSimilarity(DRAFT, other), draftSimilarity(other, DRAFT));
  const s = draftSimilarity(DRAFT, other);
  assert.ok(s > 0 && s < 1);
});

test("empty drafts or replies score zero rather than NaN", () => {
  assert.equal(draftSimilarity("", DRAFT), 0);
  assert.equal(draftSimilarity(DRAFT, "   "), 0);
  assert.equal(classifyDraftUse("", "").outcome, "discarded");
  assert.ok(!Number.isNaN(classifyDraftUse("", DRAFT).similarity));
});

test("similarity is rounded to three decimals for stable storage", () => {
  const { similarity } = classifyDraftUse(DRAFT, "Royalties are paid quarterly within 45 days.");
  assert.equal(similarity, Math.round(similarity * 1000) / 1000);
});

// ---------- Admin quality summary ----------

const row = (over: Partial<Parameters<typeof summariseDraftQuality>[0][number]> = {}) => ({
  category: "Royalty & Payments",
  categoryOverride: null,
  aiDraftSource: "llm" as string | null,
  aiDraftOutcome: null as string | null,
  aiDraftSimilarity: null as number | null,
  ...over,
});

test("quality: an empty history reports zeroes, not NaN", () => {
  const s = summariseDraftQuality([]);
  assert.equal(s.generated, 0);
  assert.equal(s.acceptRate, 0);
  assert.equal(s.avgSimilarity, 0);
  assert.deepEqual(s.byCategory, []);
  assert.ok(!JSON.stringify(s).includes("null"));
});

test("quality: accept/edit/discard counts and rates", () => {
  const s = summariseDraftQuality([
    row({ aiDraftOutcome: "accepted", aiDraftSimilarity: 1 }),
    row({ aiDraftOutcome: "accepted", aiDraftSimilarity: 0.97 }),
    row({ aiDraftOutcome: "edited", aiDraftSimilarity: 0.6 }),
    row({ aiDraftOutcome: "discarded", aiDraftSimilarity: 0.1 }),
  ]);
  assert.equal(s.generated, 4);
  assert.equal(s.evaluated, 4);
  assert.deepEqual([s.accepted, s.edited, s.discarded], [2, 1, 1]);
  assert.equal(s.acceptRate, 0.5);
  assert.equal(s.avgSimilarity, 0.668); // (1 + 0.97 + 0.6 + 0.1) / 4
});

test("quality: templates count as generated drafts and drive the fallback rate", () => {
  const s = summariseDraftQuality([
    row({ aiDraftSource: "policy", aiDraftOutcome: "accepted", aiDraftSimilarity: 1 }),
    row(),
    row({ aiDraftSource: null, aiDraftOutcome: null }), // never drafted
  ]);
  assert.equal(s.generated, 2);
  assert.equal(s.fallbacks, 1);
  assert.equal(s.fallbackRate, 0.5);
  assert.equal(s.evaluated, 1);
  assert.equal(s.accepted, 1);
});

test("quality: replies sent without a draft are not evaluated", () => {
  const s = summariseDraftQuality([row({ aiDraftSource: null, aiDraftOutcome: null })]);
  assert.equal(s.generated, 0);
  assert.equal(s.evaluated, 0);
  assert.equal(s.acceptRate, 0);
});

test("quality: buckets use the effective category and sort by volume", () => {
  const s = summariseDraftQuality([
    row({ categoryOverride: "Printing & Quality" }),
    row({ categoryOverride: "Printing & Quality", aiDraftOutcome: "accepted", aiDraftSimilarity: 1 }),
    row({ category: "ISBN & Metadata Issues" }),
    row({ category: null }),
  ]);
  assert.deepEqual(
    s.byCategory.map((b) => [b.category, b.generated]),
    [
      ["Printing & Quality", 2],
      ["ISBN & Metadata Issues", 1],
      ["Uncategorised", 1],
    ],
  );
  assert.equal(s.byCategory[0].accepted, 1);
});
