import { z } from "zod";
import { CATEGORIES, PRIORITIES } from "../../domain";
import { nextPayoutDate, formatDate, isRoyaltyOverdue } from "./payout";

// OpenRouter speaks the OpenAI chat-completions format; plain fetch keeps us dependency-free
// and lets AbortSignal.timeout enforce a hard deadline.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

type ChatMessage = { role: "system" | "user"; content: string };

async function chat(
  messages: ChatMessage[],
  opts: { temperature: number; maxTokens: number; timeoutMs: number; json?: boolean; tag: string },
): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "BookLeaf Support Portal",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      ...(opts.json && { response_format: { type: "json_object" } }),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("OpenRouter returned an empty completion");

  // Token usage per call, for cost tracking.
  console.log(
    `[ai] ${opts.tag} model=${MODEL} prompt_tokens=${data.usage?.prompt_tokens} completion_tokens=${data.usage?.completion_tokens}`,
  );
  return content;
}

// ---------- Classification ----------

export type Classification = {
  category: (typeof CATEGORIES)[number];
  priority: (typeof PRIORITIES)[number];
  rationale: string;
};

const classificationSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  rationale: z.string().max(300),
});

const CLASSIFY_SYSTEM = `You triage author support tickets for BookLeaf Publishing, a self-publishing company in India and the US.

Pick exactly one category:
- "Royalty & Payments": royalty amounts, payouts, bank details, sales figures, royalty breakdowns.
- "ISBN & Metadata Issues": wrong/duplicate ISBN, title, author name, description or other listing data errors.
- "Printing & Quality": misprints, binding defects, blurry images, colour problems, print turnaround.
- "Distribution & Availability": book missing or "Currently Unavailable" on Amazon/Flipkart/BookLeaf Store, new listings.
- "Book Status & Production Updates": where a book is in production (editing, cover design, typesetting, proofreading, printing) or delays.
- "General Inquiry": anything else (account, bio updates, packages, how-to questions).

Pick exactly one priority:
- "Critical": money owed and clearly overdue (e.g. no royalty for several months), or a live error actively harming sales (wrong ISBN live on a platform). Author is likely to churn.
- "High": ISBN/metadata errors (BookLeaf policy treats these as high priority), print quality defects, a published book unavailable for sale, royalty amount disputes.
- "Medium": production status questions, delays without financial loss, listing timing questions.
- "Low": informational or cosmetic requests (update bio or description, general how-to).
Escalate one level if the author reports the issue has persisted for weeks or they have already followed up.

Respond with JSON only: {"category": "...", "priority": "...", "rationale": "<one short sentence>"}`;

export async function classifyTicket(subject: string, description: string): Promise<Classification> {
  try {
    const raw = await chat(
      [
        { role: "system", content: CLASSIFY_SYSTEM },
        // Only the ticket text: no KB, no author data. Keeps this call ~500 tokens.
        { role: "user", content: `Subject: ${subject}\n\n${description.slice(0, 2000)}` },
      ],
      { temperature: 0, maxTokens: 120, timeoutMs: 8000, json: true, tag: "classify" },
    );
    return classificationSchema.parse(JSON.parse(raw.replace(/```(json)?/g, "")));
  } catch (err: any) {
    console.warn("[ai] classify failed, using keyword fallback:", err?.message || err);
    return classifyLocally(subject, description);
  }
}

/** Deterministic fallback when the LLM is down, slow, or returns invalid JSON. */
export function classifyLocally(subject: string, description: string): Classification {
  const text = `${subject} ${description}`.toLowerCase();
  const rules: [RegExp, Classification["category"], Classification["priority"]][] = [
    [/isbn|metadata|wrong (title|author)|duplicate/, "ISBN & Metadata Issues", "High"],
    [/royalt|payout|payment|bank|₹|earned|paid/, "Royalty & Payments", "High"],
    [/print|blurry|binding|misprint|misalign|quality|defect/, "Printing & Quality", "High"],
    [
      /unavailable|out of stock|not (showing|listed)|listing|distribution/,
      "Distribution & Availability",
      "Medium",
    ],
    [
      /typeset|cover design|production|editing|proof|when will|status/,
      "Book Status & Production Updates",
      "Medium",
    ],
  ];
  const hit = rules.find(([re]) => re.test(text));
  let category: Classification["category"] = hit?.[1] ?? "General Inquiry";
  let priority: Classification["priority"] = hit?.[2] ?? "Low";
  if (
    category === "Royalty & Payments" &&
    /(\d+|several|many) months|haven'?t received|not received|overdue/.test(text)
  ) {
    priority = "Critical";
  }
  return { category, priority, rationale: "Keyword rules (AI classifier unavailable)" };
}

// ---------- Draft response ----------

type BookFacts = {
  title: string;
  isbn: string | null;
  status: string | null;
  mrp: number | null;
  publicationDate: Date | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: Date | null;
  printPartner: string | null;
  availableOn: unknown;
};

export type DraftInput = {
  authorName: string;
  subject: string;
  description: string;
  latestMessage: string | null;
  category: string;
  book: BookFacts | null;
  otherBooks: BookFacts[];
  chunks: { title: string; content: string }[];
};

export type DraftResult = { draft: string; source: "llm" | "policy"; model?: string; notice: string };

const inr = (n: number | null | undefined) => (n == null ? "not available" : `₹${n.toLocaleString("en-IN")}`);

function bookFacts(b: BookFacts): string {
  const platforms =
    Array.isArray(b.availableOn) && b.availableOn.length ? b.availableOn.join(", ") : "none yet";
  return [
    `Title: ${b.title}`,
    `ISBN: ${b.isbn ?? "not yet assigned"}`,
    `Status: ${b.status ?? "unknown"}`,
    `Publication date: ${formatDate(b.publicationDate)}`,
    `MRP: ${inr(b.mrp)}`,
    `Copies sold: ${b.totalCopiesSold}`,
    `Royalty earned: ${inr(b.totalRoyaltyEarned)}, paid: ${inr(b.royaltyPaid)}, pending: ${inr(b.royaltyPending)}`,
    `Last royalty payout: ${formatDate(b.lastRoyaltyPayoutDate)}`,
    `Royalty payout overdue: ${
      isRoyaltyOverdue(b)
        ? "YES. Pending is above the ₹1,000 threshold and no payout in over two quarterly cycles. This is on BookLeaf: own it, apologise, and commit to resolution within 48 hours."
        : "no"
    }`,
    `Print partner: ${b.printPartner ?? "not assigned"}`,
    `Available on: ${platforms}`,
  ].join("\n");
}

// Tone rules come straight from the BookLeaf KB "Communication Tone Guidelines".
const DRAFT_SYSTEM = `You are a member of the BookLeaf Publishing author support team, writing a reply that a colleague will review before sending.

How BookLeaf writes to authors:
- Authors are partners, not customers to be managed. Be empathetic and professional.
- Acknowledge the author's concern before moving to solutions.
- Be specific: use the actual numbers, dates and statuses from ACCOUNT FACTS. No vague reassurances.
- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.
- If escalation or investigation is needed, give a clear timeline (e.g. "within 48 hours"), never open-ended promises.
- Never blame the author, even if a delay is on their side; frame it collaboratively.
- Always end with a clear next step for the author and/or the BookLeaf team.

Hard rules:
- State only policies found in POLICY CONTEXT and facts found in ACCOUNT FACTS. Never invent amounts, dates, tracking numbers or policies.
- If a needed fact is missing, say the team will check it and give a timeline.
- Plain text, no markdown, no headings. 120–220 words.
- Start with "Hi <first name>," and sign off with "Warm regards,\\nBookLeaf Author Support".`;

export async function generateDraft(input: DraftInput): Promise<DraftResult> {
  const firstName = input.authorName.split(" ")[0];
  const facts = input.book
    ? bookFacts(input.book)
    : input.otherBooks.length
      ? "No specific book selected. Author's books:\n" +
        input.otherBooks
          .map((b) => `- ${b.title} (${b.status ?? "unknown"}), royalty pending ${inr(b.royaltyPending)}`)
          .join("\n")
      : "No books on this account yet.";

  // Cost: only the KB sections for this ticket's category (~300 tokens) are sent, not the whole KB,
  // and only the original query plus the latest author follow-up, not the full thread.
  const user = `POLICY CONTEXT (${input.category}):
${input.chunks.map((c) => `[${c.title}] ${c.content}`).join("\n") || "No category-specific policy available."}

ACCOUNT FACTS:
Author: ${input.authorName}
Today: ${formatDate(new Date())}
Next scheduled royalty payout date: ${formatDate(nextPayoutDate())}
${facts}

TICKET (${input.category}):
Subject: ${input.subject}
Message: ${input.description.slice(0, 2000)}${input.latestMessage ? `\nLatest follow-up from author: ${input.latestMessage.slice(0, 1000)}` : ""}

Write the reply to ${firstName}.`;

  try {
    const draft = await chat(
      [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: user },
      ],
      { temperature: 0.4, maxTokens: 450, timeoutMs: 20000, tag: "draft" },
    );
    return { draft, source: "llm", model: MODEL, notice: "AI draft. Review and edit before sending." };
  } catch (err: any) {
    console.warn("[ai] draft failed, using policy template:", err?.message || err);
    return {
      draft: buildPolicyDraft(input),
      source: "policy",
      notice:
        "AI is unavailable right now. This is a policy template with the author's data filled in; review it or write your own reply.",
    };
  }
}

/** Deterministic, KB-accurate template used when the LLM is unavailable. */
export function buildPolicyDraft(input: DraftInput): string {
  const firstName = input.authorName.split(" ")[0];
  const b = input.book;
  const about = b ? ` about "${b.title}"` : "";
  let body: string;

  switch (input.category) {
    case "Royalty & Payments":
      body = `Thank you for writing to us${about}, and I'm sorry for any worry this has caused. Royalties are calculated quarterly and paid within 45 days of the quarter ending, by bank transfer to the account linked in your dashboard. Your share is 80% of the net profit per copy (MRP minus printing cost, platform commission and shipping), and payouts are made once the accumulated amount crosses ₹1,000; smaller amounts roll over to the next quarter.${
        b
          ? ` For this title we show ${b.totalCopiesSold} copies sold, ${inr(b.totalRoyaltyEarned)} earned, ${inr(b.royaltyPaid)} paid and ${inr(b.royaltyPending)} pending. ${b.lastRoyaltyPayoutDate ? `The last payout was on ${formatDate(b.lastRoyaltyPayoutDate)}.` : "No payout has been made on this title yet."}`
          : ""
      } The next payout is scheduled for ${formatDate(nextPayoutDate())}.\n\nOur payments team will verify your royalty ledger and bank details and get back to you within 48 hours with a line-by-line breakdown. If anything is overdue, we will escalate it immediately.`;
      break;
    case "ISBN & Metadata Issues":
      body = `Thank you for flagging this${about}. An ISBN or metadata mismatch is a serious data issue, and we're treating it as high priority.${b?.isbn ? ` Our records show ISBN ${b.isbn} for this title.` : ""}\n\nI have escalated this to our production team, who will verify the record and correct it across platforms. You will hear back from us within 48 hours.`;
      break;
    case "Printing & Quality":
      body = `I'm sorry about the print quality issue${about}. That is not the standard we hold ourselves to.\n\nCould you reply with clear photos of the defective copies (cover, affected pages and binding)? Once we verify them, BookLeaf will arrange a free reprint, which typically takes 5–7 business days.`;
      break;
    case "Distribution & Availability":
      body = `Thank you for letting us know${about}. When a published book shows as unavailable, it is usually a stock sync issue between our warehouse and the platform.${
        b && Array.isArray(b.availableOn) && b.availableOn.length
          ? ` This title is listed on ${b.availableOn.join(", ")}.`
          : ""
      }\n\nI am asking our distribution team to trigger a re-sync now. The listing should be live again within 24–48 hours, and we will confirm here once it is.`;
      break;
    case "Book Status & Production Updates":
      body = `Thank you for checking in${about}. I understand waiting on production can be frustrating.${b?.status ? ` Our records show the current stage as "${b.status}".` : ""} Delays most often happen at cover design approval and proofreading revision rounds.\n\nI will confirm the exact status with our production team and share a specific updated timeline within 48 hours.`;
      break;
    default:
      body = `Thank you for reaching out${about}. I have read your message and want to make sure it gets to the right team quickly.\n\nWe will look into this and get back to you on this ticket within 48 hours with a clear next step.`;
  }

  return `Hi ${firstName},\n\n${body}\n\nWarm regards,\nBookLeaf Author Support`;
}
