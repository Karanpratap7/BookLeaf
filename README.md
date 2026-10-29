# BookLeaf Author Support & Communication Portal

An author portal and an admin support desk, with AI-assisted ticket triage and AI-drafted replies grounded in the BookLeaf Knowledge Base.

**Live demo:** `<LIVE_URL>`

| Role   | Email                                                                     | Password     |
| ------ | ------------------------------------------------------------------------- | ------------ |
| Author | `priya.sharma@email.com` (or any author email in `bookleaf_sample_data.json`) | `Author@123` |
| Admin  | `admin@bookleaf.com`, `support@bookleaf.com`                              | `Admin@123`  |

Good accounts for edge cases:
- `sneha.kulkarni@email.com`: a book still in cover design.
- `kavita.deshmukh@email.com`: a book in typesetting, plus a pending royalty below the ₹1,000 threshold.
- `ananya.reddy@email.com`: never paid, so the royalty is overdue.

## Run locally

Requires Node 20+ and a Postgres database (a Neon dev branch works).

```bash
npm run setup                                  # install api + web deps, prisma generate
cp apps/api/.env.example apps/api/.env         # fill in DATABASE_URL, JWT_SECRET, OPENROUTER_API_KEY
npm run db:migrate                             # prisma migrate deploy
npm run db:seed                                # 2 admins, 10 authors, 18 books, KB, 5 demo tickets (idempotent)
npm run dev                                    # API :4000 + Vite :5173 (proxies /api)
npm test && npm run typecheck                  # unit tests + strict TS check
```

| Env var              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`       | Postgres connection (use the Neon **pooled** URL in production)        |
| `JWT_SECRET`         | Signs session tokens. The API refuses to start without it              |
| `OPENROUTER_API_KEY` | LLM access. Server-side only, never sent to the browser                |
| `OPENROUTER_MODEL`   | Optional. Defaults to `openai/gpt-4o-mini`                             |

## Architecture

```
Vue 3 SPA (apps/web) ──fetch /api/*──▶ Express app (apps/api/app.ts) ──Prisma──▶ Neon Postgres
                                           │
                                           └─▶ services/ai/client.ts ──HTTPS──▶ OpenRouter (gpt-4o-mini)
```

- **One backend, one origin.** On Vercel the whole Express app runs as a single function (`api/[...path].ts`), and the SPA is served from the same domain. That means:
  - no CORS,
  - no per-route function sprawl (it stays under the Hobby plan limit),
  - the same code runs locally (`index.ts` just calls `listen`).
- **Layers.**
  - Routes in `app.ts`.
  - Cross-cutting concerns in `middleware/`: JWT auth, role guard, zod validation, error mapping.
  - AI in `services/ai/` (prompts, fallbacks, payout-date logic).
  - Domain enums in `domain.ts`.
- **Schema** (`prisma/schema.prisma`):
  - `users` (authors and admins, with a role).
  - `books`: nullable ISBN/MRP/dates for in-production titles.
  - `tickets`: stores the AI `category`/`priority`/`aiRationale` *and* separate admin `categoryOverride`/`priorityOverride`, so AI vs human decisions stay auditable. Also holds the cached `aiDraft`.
  - `ticket_messages`: visible to the author.
  - `internal_notes`: admins only, kept in a separate table so they can't leak through a message query.
  - `kb_chunks`.
- **Real-time:** polling. Ticket views poll every 4–5s and the admin queue every 10s; polling pauses while the tab is hidden. Serverless functions can't hold SSE or WebSocket connections, and at this scale polling is cheap and reliable. Upgrade path: Neon Realtime / a pub-sub channel.
- **Security.**
  - Passwords are bcrypt-hashed.
  - JWTs expire after 24h; the client clears the session on a 401.
  - Every author query is scoped by `authorId` from the token. Another author's ticket returns 404, so its existence isn't revealed.
  - `/api/admin/*` requires the `ADMIN` role.

## AI integration

| Feature  | When                                                      | Input sent                                                  | Output                                        |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Classify | On ticket creation (awaited, 8s cap)                      | Subject + description only (~360 prompt tokens)              | `{category, priority, rationale}`, zod-validated |
| Draft    | When an admin opens a ticket (20s cap); cached per ticket | Tone rules + **only this category's** KB chunks + account facts + query (~500 tokens) | Plain-text reply for the admin to edit |

**Prompt strategy**

- **Classifier:**
  - Precise definitions for all 6 categories.
  - A priority rubric taken from KB policy. For example, ISBN errors are high priority by policy, and money that's clearly overdue is Critical.
  - Temperature 0, JSON mode, schema-validated.
- **Drafter:**
  - The system prompt encodes BookLeaf's tone guidelines verbatim: acknowledge first, be specific, own BookLeaf's faults, give timelines, end with a next step.
  - It also sets hard rules: use only the supplied policy and account facts, never invent amounts or dates, and keep it to 120–220 words.
  - The KB is stored as one chunk per section, plus the brief's sample Q→A guidance as calibration examples, all tagged by category.
- **Facts are computed in code, not by the LLM:** royalty figures, the **next payout date** (quarterly cycle + 45 days), and an **overdue flag** (pending above ₹1,000 with no payout in two cycles). LLMs are unreliable at date arithmetic, and these facts are what make a reply specific and honest. When a ticket isn't tied to a book, the drafter gets a one-line summary of each of the author's books.

**Graceful degradation**

Every call goes through one `chat()` helper with a hard `AbortSignal.timeout`.
- **Classify failure** (down, 429, timeout, or invalid JSON): a deterministic keyword classifier takes over. The ticket is always created.
- **Draft failure:** a KB-accurate policy template filled with the author's real numbers takes over. The admin sees an "AI unavailable" notice and can edit it or write their own reply.

**Cost**

- The KB is retrieved by category (about 20% of the KB per call), and drafts send only the original query plus the latest follow-up, not the whole thread.
- Drafts are cached per ticket and regenerated only when the admin clicks "Regenerate" or the conversation moves on.
- Token usage is logged per call (`[ai] draft prompt_tokens=… completion_tokens=…`).
- Typical ticket: one classify (about 400 tokens) plus one draft (about 700 tokens), under $0.001 on gpt-4o-mini.

**Model choice:** `gpt-4o-mini` via OpenRouter. It's cheap, fast (under 3s) and reliable at JSON mode, and the quality is more than enough for short, policy-grounded replies. Going through OpenRouter means switching to Claude Haiku or another model only takes changing `OPENROUTER_MODEL`.

## API

All responses are JSON. Errors use the shape `{ "error": string, "details"?: [{ path, message }] }`:
- 400: validation error or malformed JSON.
- 401: missing or expired token.
- 403: wrong role.
- 404: not found, or not yours.
- 409: conflict, such as replying to a closed ticket.

Authenticated routes need `Authorization: Bearer <token>`.

| Method | Path                               | Role   | Body / query                                                                 | Notes |
| ------ | ---------------------------------- | ------ | ---------------------------------------------------------------------------- | ----- |
| GET    | `/api/health`                      | none   |                                                                              | Liveness |
| POST   | `/api/auth/login`                  | none   | `{ email, password }`                                                        | Returns `{ token, role, user }` |
| GET    | `/api/auth/me`                     | any    |                                                                              | Current user profile |
| GET    | `/api/authors/me/books`            | AUTHOR |                                                                              | Author's books with royalty fields |
| POST   | `/api/tickets`                     | AUTHOR | `{ subject (3–200), description (10–5000), bookId? }`                        | 201. AI-classified before returning |
| GET    | `/api/tickets/mine`                | AUTHOR |                                                                              | Own tickets + messages (no notes or AI fields) |
| GET    | `/api/tickets/:id`                 | AUTHOR |                                                                              | 404 if not the author's ticket |
| POST   | `/api/tickets/:id/messages`        | AUTHOR | `{ body }`                                                                   | Follow-up; reopens a Resolved ticket; 409 if Closed |
| GET    | `/api/admin/tickets`               | ADMIN  | `?status=&category=&priority=&from=&to=` (ISO dates)                          | Filters use the effective (override ?? AI) value. Sorted unresolved → priority → oldest |
| GET    | `/api/admin/tickets/:id`           | ADMIN  |                                                                              | Includes messages, internal notes, author, book |
| PATCH  | `/api/admin/tickets/:id`           | ADMIN  | `{ status?, categoryOverride?, priorityOverride?, assignSelf? }`              | `null` clears an override |
| POST   | `/api/admin/tickets/:id/notes`     | ADMIN  | `{ body }`                                                                   | Internal note, never shown to the author |
| POST   | `/api/admin/tickets/:id/responses` | ADMIN  | `{ body }`                                                                   | Reply to the author; Open → In Progress; auto-assigns |
| POST   | `/api/admin/tickets/:id/ai-draft`  | ADMIN  | `?regenerate=1` to bypass the cache                                           | `{ draft, source: "llm" \| "policy", notice, cached }` |

## Known limitations / next steps

- **Attachments are UI-only.** Next step: presigned uploads to object storage, with the file linked on the message.
- **Real-time is polling.** Next step: push via Neon Realtime or a pub-sub channel once traffic justifies it.
- **The overdue check is a heuristic** over aggregate royalty fields. Next step: a per-quarter royalty ledger table.
- **KB retrieval is category-based.** With a larger KB, add embeddings (pgvector) for semantic retrieval.
- **Demo passwords are shared.** Production would need password reset, rate-limited login and refresh tokens.
- **AI calls are synchronous.** At volume, move classification to a queue, and add evals over a labelled ticket set to track classifier accuracy.
