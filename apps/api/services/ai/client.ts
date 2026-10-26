import { OpenAI } from "openai";

export const hf = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN,
});

export const MODEL = "Qwen/Qwen2.5-7B-Instruct:featherless-ai";

// Wrap every call with timeout, try/catch, on failure return null
export async function withTimeout<T>(promise: Promise<T>, ms: number = 30000): Promise<T | null> {
  let timedOut = false;
  const timeoutId = setTimeout(() => { timedOut = true; }, ms);
  const result = await promise.then((data) => data).catch((err) => {
    console.error("AI service error:", err.message);
    return null;
  });

  clearTimeout(timeoutId);
  if (timedOut) {
    console.error("AI service timeout exceeded");
    return null;
  }
  return result;
}

// Auto-classification + priority on ticket create
export async function classifyTicket(subject: string, description: string): Promise<{ category: string | null; priority: string | null; rationale: string | null }> {
  const prompt = `
You are a BookLeaf support ticket classifier. Classify the following ticket into exactly one category and one priority level.

Categories (must be exactly one):
- Royalty & Payments
- ISBN & Metadata Issues
- Printing & Quality
- Distribution & Availability
- Book Status & Production Updates
- General Inquiry

Priority levels (must be exactly one):
- Critical
- High
- Medium
- Low

Ticket subject: "${subject}"
Ticket description: "${description}"

Return JSON only with keys: category, priority, rationale. No prose, no markdown, no extra text. If unsure, use "General Inquiry" / "Medium" as fallback.
`;

  try {
    const completion = await withTimeout(
      hf.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a strict JSON ticket classifier. Return only valid JSON with keys: category, priority, rationale. No prose, no markdown, no extra text." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
      15000
    );

    if (!completion?.choices?.[0]?.message?.content) {
      return { category: null, priority: null, rationale: null };
    }

    const content = completion.choices[0].message.content.trim();
    try {
      const parsed = JSON.parse(content);
      return {
        category: parsed.category || null,
        priority: parsed.priority || null,
        rationale: parsed.rationale || null,
      };
    } catch {
      // Fallback if JSON parsing fails
      return { category: "General Inquiry", priority: "Medium", rationale: content.substring(0, 100) };
    }
  } catch (err) {
    console.error("Classification error:", err);
    return { category: null, priority: null, rationale: null };
  }
}

// AI-drafted response with RAG + author context
export async function generateDraft(ticketId: string, subject: string, description: string, authorName: string, bookTitle: string, isbn: string, status: string, royaltyEarned: number, royaltyPending: number): Promise<string | null> {
  const prompt = `You are a BookLeaf support assistant. Write an empathetic, helpful response to the author's query.

Guidelines:
- Empathize with the author's situation
- Reference specific numbers when available (royalty earned, copies sold, etc.)
- If the issue is BookLeaf's fault, acknowledge it clearly
- Provide a specific next step or timeline
- Use the tone: professional, warm, solution-focused
- Keep the response concise (max 200 words)

Author: ${authorName}
Book: ${bookTitle} (${isbn})
Status: ${status}
Royalty earned: $${royaltyEarned}
Royalty pending: $${royaltyPending}

Original query subject: "${subject}"
Original query description: "${description}"

Write the draft response:`;

  try {
    const completion = await withTimeout(
      hf.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a BookLeaf support assistant. Write concise, empathetic, professional responses. Acknowledge BookLeaf faults when applicable. Provide clear next steps. Max 200 words." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      15000
    );

    if (!completion?.choices?.[0]?.message?.content) {
      return null;
    }

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("Draft generation error:", err);
    return null;
  }
}