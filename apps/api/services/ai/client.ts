import { OpenRouter } from "@openrouter/sdk";

export const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 30000
): Promise<T | null> {
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
  }, ms);
  const result = await promise
    .then((data) => data)
    .catch((err) => {
      console.error("AI service error:", err.message || err);
      return null;
    });

  clearTimeout(timeoutId);
  if (timedOut) {
    console.error("AI service timeout exceeded");
    return null;
  }
  return result;
}

function nextPayoutHint() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const endMonth = (q + 1) * 3; // exclusive end of quarter
  const quarterEnd = new Date(now.getFullYear(), endMonth, 0);
  const payout = new Date(quarterEnd);
  payout.setDate(payout.getDate() + 45);
  return payout.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Policy/RAG draft used when OpenRouter is down */
export function buildPolicyDraft(input: {
  authorName: string;
  subject: string;
  description: string;
  category: string;
  bookTitle?: string | null;
  isbn?: string | null;
  status?: string | null;
  royaltyEarned?: number | null;
  royaltyPending?: number | null;
  lastPayout?: Date | string | null;
  chunks?: { title: string; content: string }[];
}): string {
  const name = input.authorName || "there";
  const bookLine = input.bookTitle
    ? ` regarding *${input.bookTitle}*${input.isbn ? ` (ISBN ${input.isbn})` : ""}`
    : "";
  const kbBits = (input.chunks || [])
    .slice(0, 3)
    .map((c) => c.content.split(".")[0])
    .filter(Boolean);

  const pending =
    input.royaltyPending != null
      ? `₹${Number(input.royaltyPending).toLocaleString("en-IN")}`
      : null;
  const earned =
    input.royaltyEarned != null
      ? `₹${Number(input.royaltyEarned).toLocaleString("en-IN")}`
      : null;
  const lastPay = input.lastPayout
    ? new Date(input.lastPayout).toLocaleDateString("en-IN")
    : null;

  let body = "";

  switch (input.category) {
    case "Royalty & Payments":
      body = `Thank you for writing in about royalties${bookLine}. I understand how frustrating delayed or unclear payouts can feel, and I'm sorry for the stress this has caused.

On our side, royalties are calculated quarterly (80% of net profit to the author) and paid within 45 days of quarter-end, with a ₹1,000 minimum threshold. For your account${earned ? `, we currently show ${earned} earned` : ""}${pending ? ` and ${pending} pending` : ""}${lastPay ? `. The last payout on record was ${lastPay}` : pending === "₹0" ? "" : ""}. The next expected payout window lands around ${nextPayoutHint()}, provided the threshold is met and bank details are linked.

I'll have our payments team double-check your ledger and bank linkage and get back to you within 48 hours with a clear status. If anything looks overdue beyond the 45-day window, we'll escalate immediately.`;
      break;
    case "ISBN & Metadata Issues":
      body = `Thank you for flagging this ISBN/metadata concern${bookLine}. You're right to treat this as urgent — mismatched ISBNs can affect listings and reader trust.

I've escalated this to our production team as a high-priority data issue. We'll verify the imprint record against the physical copy and correct the platform metadata. You can expect an update within 48 hours with either a confirmation of the fix or the next corrective step.`;
      break;
    case "Printing & Quality":
      body = `I'm truly sorry about the print quality issue you received${bookLine}. That falls short of the standard we owe you as a partner.

Please reply with clear photos of the defective copies (cover, interior pages, binding). Once verified, BookLeaf will arrange a free reprint. Typical turnaround after verification is 5–7 business days. We'll confirm as soon as the reprint is queued.`;
      break;
    case "Distribution & Availability":
      body = `Thanks for letting us know about the availability issue${bookLine}. "Currently Unavailable" on Amazon/Flipkart is usually a stock sync problem rather than a delisting.

I've asked distribution to trigger a re-sync. Please allow 24–48 hours for the listing to show as available again. If it hasn't recovered after that window, reply on this ticket and we'll escalate with the retailer.`;
      break;
    case "Book Status & Production Updates":
      body = `Thank you for checking in on production${bookLine}. ${input.status ? `Our records currently show status: ${input.status}.` : "I'm reviewing the live production stage now."}

Delays most often happen while we wait on cover approval or proofreading rounds. I'll confirm the exact bottleneck with production and share a specific updated timeline within 48 hours — we'll keep this collaborative and transparent every step of the way.`;
      break;
    default:
      body = `Thank you for reaching out${bookLine}. I've read your note carefully and want to make sure we help you quickly.

Metadata or account updates submitted through support typically reflect on platforms within 3–5 business days. I'll route this to the right team and confirm the next step on this thread within 48 hours.`;
  }

  if (kbBits.length) {
    body += `\n\nFor reference from our policies: ${kbBits.join(". ")}.`;
  }

  body += `\n\nWarm regards,\nBookLeaf Author Support`;
  return body;
}

export function classifyLocally(
  subject: string,
  description: string
): { category: string; priority: string; rationale: string } {
  const text = `${subject} ${description}`.toLowerCase();
  let category = "General Inquiry";
  let priority = "Medium";

  if (/royalt|payout|payment|bank|₹|rs\.?|earned|pending/.test(text)) {
    category = "Royalty & Payments";
    priority = /month|overdue|haven't|have not|not received|6 month|delay/.test(text)
      ? "Critical"
      : "High";
  } else if (/isbn|metadata|wrong title|duplicate/.test(text)) {
    category = "ISBN & Metadata Issues";
    priority = "High";
  } else if (/print|blurry|binding|misprint|quality|defect/.test(text)) {
    category = "Printing & Quality";
    priority = "High";
  } else if (/unavailable|amazon|flipkart|distribution|stock|listing/.test(text)) {
    category = "Distribution & Availability";
    priority = "Medium";
  } else if (/typeset|cover design|production|editing|proof|status|when will/.test(text)) {
    category = "Book Status & Production Updates";
    priority = "Medium";
  } else if (/bio|description|update|general/.test(text)) {
    category = "General Inquiry";
    priority = "Low";
  }

  return {
    category,
    priority,
    rationale: "Local keyword classifier (HF unavailable)",
  };
}

async function chatCompletion(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: { temperature?: number; max_tokens?: number } = {}
) {
  let lastError: unknown = null;
  for (const model of MODEL_CANDIDATES) {
    try {
      const completion = await openrouter.chat.send({
        httpReferer: "http://localhost",
        appTitle: "BookLeaf",
        chatRequest: {
          model,
          messages,
          temperature: opts.temperature ?? 0.4,
          maxTokens: opts.max_tokens ?? 500,
        },
      });
      const raw = completion.choices[0]?.message?.content;
      const content = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join(". ") : String(raw);
      if (content) return { content, model, source: "llm" as const };
    } catch (err: any) {
      lastError = err;
      console.warn(`OpenRouter model failed (${model}):`, err?.status || err?.message);
    }
  }
  throw lastError || new Error("All OpenRouter models failed");
}

/** Prefer free/cheap router models */
export const MODEL_CANDIDATES = [
  "nvidia/nemotron-3.5-70b:free",
  "nvidia/nemotron-3.5-8b:free",
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3-haiku",
  "openai/gpt-4o-mini",
].filter(Boolean);

export async function classifyTicket(
  subject: string,
  description: string
): Promise<{
  category: string | null;
  priority: string | null;
  rationale: string | null;
}> {
  try {
    const completion = await chatCompletion(
      [
        {
          role: "system",
          content:
            'You are a strict JSON ticket classifier. Return only valid JSON with keys: category, priority, rationale. Categories: "Royalty & Payments", "ISBN & Metadata Issues", "Printing & Quality", "Distribution & Availability", "Book Status & Production Updates", "General Inquiry". Priority: Critical|High|Medium|Low.',
        },
        {
          role: "user",
          content: `Subject: ${subject}\nDescription: ${description}\nReturn JSON only.`,
        },
      ],
      { temperature: 0, max_tokens: 200 }
    );

    const content = completion.content.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(content);
    return {
      category: parsed.category || null,
      priority: parsed.priority || null,
      rationale: parsed.rationale || null,
    };
  } catch (err) {
    console.error("Classification falling back to local:", err);
    const local = classifyLocally(subject, description);
    return local;
  }
}

export async function generateDraft(input: {
  authorName: string;
  subject: string;
  description: string;
  category: string;
  bookTitle?: string | null;
  isbn?: string | null;
  status?: string | null;
  royaltyEarned?: number | null;
  royaltyPending?: number | null;
  lastPayout?: Date | string | null;
  chunks?: { title: string; content: string }[];
}): Promise<{ draft: string; source: "llm" | "policy"; model?: string }> {
  const kb =
    (input.chunks || [])
      .map((c, i) => `${i + 1}. ${c.title}: ${c.content}`)
      .join("\n") || "No KB chunks";

  try {
    const completion = await chatCompletion(
      [
        {
          role: "system",
          content: `You are a BookLeaf support representative. Empathize first, use specific numbers, own BookLeaf faults when true, give a clear next step/timeline. Max 200 words. Tone: professional, warm, partner-focused.`,
        },
        {
          role: "user",
          content: `Author: ${input.authorName}
Book: ${input.bookTitle || "N/A"} (${input.isbn || "N/A"})
Status: ${input.status || "N/A"}
Royalty earned: ₹${input.royaltyEarned ?? "N/A"}
Royalty pending: ₹${input.royaltyPending ?? "N/A"}
Last payout: ${input.lastPayout || "N/A"}
Category: ${input.category}

Subject: ${input.subject}
Query: ${input.description}

Knowledge Base:
${kb}

Write the draft only.`,
        },
      ],
      { temperature: 0.6, max_tokens: 450 }
    );

    return {
      draft: completion.content,
      source: "llm",
      model: completion.model,
    };
  } catch (err) {
    console.error("Draft LLM failed; using policy/RAG fallback:", err);
    return {
      draft: buildPolicyDraft(input),
      source: "policy",
    };
  }
}