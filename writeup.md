# BookLeaf Support Portal: Write-up

**What I prioritised.** I put the core ticket loop and the AI first, because that's what BookLeaf's ops team actually feels. An author raises a query, it arrives already classified and prioritised, the admin opens it to find a draft that already knows the author's numbers, edits it, and sends it, and the author sees the reply within seconds. Everything else is in service of that loop.

**AI that's grounded and honest.** The biggest risk with AI-drafted support replies is confident, wrong policy. So:
1. The Knowledge Base is stored verbatim, one chunk per section, tagged by category.
2. The drafter must use only the supplied policy and account facts.
3. Anything that needs arithmetic is computed in code and handed to the model as a fact: the next payout date, pending vs threshold, and whether a payout is overdue.

That last point is what lets a draft say "this is on us, we'll resolve it within 48 hours" when BookLeaf really did miss a payout, instead of reciting the payout cycle. That is exactly what the tone guide asks for.

**Degrade, don't fail.** Every LLM call has a hard timeout.
- If classification fails, a deterministic keyword classifier takes over, so tickets are always created.
- If drafting fails, a KB-accurate template takes over, filled with the author's real figures, and the admin is told AI was unavailable.
- The AI's category and priority are stored separately from admin overrides, so the team can see how often the AI is corrected.

**Cost.**
- Classification sees only the ticket text (about 400 tokens).
- Drafts get only their category's KB chunks and the latest message, not the full KB or thread.
- Drafts are cached per ticket, so reopening a ticket costs nothing.
- Token usage is logged per call. A typical ticket costs well under a tenth of a cent on gpt-4o-mini.

**Trade-offs.**
- *Single serverless function on Vercel, rather than a separate API host.* One origin, one deploy, no CORS. It costs long-lived connections, so "real-time" is 4–10s polling that pauses in background tabs. For a support desk that's responsive enough, and far simpler to operate.
- *Category-based retrieval, not embeddings.* The KB is about 2k tokens across six well-separated topics, so category tags retrieve precisely. Embeddings would add a model and an index for no accuracy gain at this size.
- *Synchronous classification.* The ticket response waits for the AI (capped at 8s, usually about 1s). The alternative, background work, isn't reliable on serverless without a queue.
- *Attachments are UI-only,* as the brief allows.

**Taking it to production.**
1. Move AI work onto a queue (classify on create, pre-generate drafts), with retries and a dead-letter view.
2. Add an eval set of labelled historical tickets so prompt or model changes are measured, and track the AI-vs-override rate as a live accuracy metric.
3. Replace polling with push (Neon Realtime or pub-sub), and add email notifications to authors.
4. Add a per-quarter royalty ledger so overdue detection and royalty breakdowns are exact.
5. Harden auth: password reset, rate-limited login, refresh tokens, audit log of admin actions.
6. Add SLA timers and auto-escalation in the queue, plus macros for the most common replies.
