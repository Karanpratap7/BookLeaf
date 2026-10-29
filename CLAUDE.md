# BookLeaf Author Support Portal

Take-home assignment (BookLeaf Publishing, Assignment 1 of 2). The brief is `BookLeaf_Technical_Assignment_1.pdf`.
**Confidential: private repo only.** The Knowledge Base section of the PDF is the source of truth for every policy
statement the AI makes (royalties, ISBN, printing, distribution, production, tone).

Scoring weights: AI integration 25%, architecture/code 25%, API design 15%, functionality 15%, product 10%, docs 10%.

## Layout

- `apps/api`: Express + Prisma + zod (TypeScript, run with `tsx`). `app.ts` exports the app, and `index.ts` only calls `listen` for local dev.
- `apps/web`: Vue 3 + Pinia + vue-router (plain JS). `src/api.js` is the only HTTP client; every path is relative (`/api/...`).
- `api/[...path].ts`: the single Vercel function. It only re-exports the Express app.
- `bookleaf_sample_data.json`: the seed source. Reviewers test with these exact records.

## Deployment

- Vercel serves the static Vue build plus one serverless function for all `/api/*`.
- Neon is Postgres only. Use the pooled `DATABASE_URL` in prod.
- Env (server only): `DATABASE_URL`, `JWT_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`).

## Commands

```bash
npm run setup          # install api + web deps, prisma generate
npm run dev            # API :4000 (tsx watch) + Vite :5173 (proxies /api)
npm run db:migrate     # prisma migrate deploy (new migrations: write SQL via `prisma migrate diff`, or `migrate dev` on a Neon DEV branch)
npm run db:seed        # DESTRUCTIVE: wipes and reseeds. Never run against prod without asking
npm test               # node:test unit tests (services/ai/*.test.ts)
npm run typecheck      # strict tsc. Treat as the lint gate
npm run format         # prettier (configs: .prettierrc, apps/web/.prettierrc)
```

Env loading: `apps/api/.env` first, then the repo-root `.env`. On Vercel, env vars come from the project settings.

## Rules

- **One backend.** All `/api/*` routes live in the Express app. Don't add files under `api/` (Hobby function limit; same origin means no CORS). Don't reintroduce a second API base URL.
- **Secrets.** Secrets live in env only: never in `apps/web`, never committed, no fallback values (`|| 'secret'`). The app throws at boot if `JWT_SECRET` is missing.
- **Serverless.**
  - Do no work after `res.json()` (no `setImmediate`/fire-and-forget).
  - No SSE or WebSockets. "Real-time" means polling: 4–5s on author views, 10s on the admin queue, skipped while `document.hidden`.
- **RBAC.**
  - Auth: `authenticateJWT` + `authorizeRoles('AUTHOR' | 'ADMIN')` on every route except login and health.
  - Author queries always filter by `req.user.id`. Another author's ticket returns **404**, not 403.
  - Roles are only `AUTHOR` and `ADMIN`.
- **Internal notes** go in `internal_notes` only, never in `ticket_messages` (authors can read messages).
- **AI vs human.** `category`/`priority` hold the AI values; admin edits go to `categoryOverride`/`priorityOverride`. The effective value is `override ?? ai`. Filter and sort on the effective value. Never overwrite the AI value.
- **Errors.**
  - Shape: `{ error, details? }`.
  - Validate input with `validate(zodSchema)`, using `z.enum` for categories, priorities and statuses.
  - Express 5 forwards async errors to `errorHandler`, which maps Prisma `P2025` to 404 and `P2023` to 400. No generic 500s for bad input.

## AI integration (`apps/api/services/ai/client.ts`)

- **One pinned model** via OpenRouter, called with plain `fetch` (no SDK). The single `chat()` helper enforces `AbortSignal.timeout` (8s for classify, 20s for draft) and logs `usage` tokens.
- **Graceful degradation is mandatory.**
  - Classify failure or invalid JSON → `classifyLocally` (keyword rules). Ticket creation never fails because of AI.
  - Draft failure → `buildPolicyDraft` (KB-based template) with `source: 'policy'`. The UI shows a notice and the admin edits or writes manually.
- **Classify** (awaited in `POST /api/tickets`):
  - Input: subject + description only. Settings: temperature 0, ~150 max tokens.
  - Output is zod-validated `{ category, priority, rationale }`. The rationale is stored as `aiRationale`.
- **Draft** (`POST /api/admin/tickets/:id/ai-draft`). Cost-aware retrieval sends only:
  - tone guidelines (system prompt),
  - the KB chunk(s) and sample Q→A row for the ticket's effective category,
  - the author/book facts, computed **in code**: royalty earned/paid/pending, last payout, production status, and the next payout date (`nextPayoutDate`) and the overdue flag (`isRoyaltyOverdue`), both in `services/ai/payout.ts` and both tested. With no book selected, send a one-line summary per book.
  - **Never** the full KB or the full thread.
- **Draft caching.** The result is cached on the ticket (`aiDraft`, `aiDraftSource`). It regenerates only with `?regenerate=1` (the admin's "Regenerate" button).

## Domain enums (exact strings)

- Categories: `Royalty & Payments`, `ISBN & Metadata Issues`, `Printing & Quality`, `Distribution & Availability`, `Book Status & Production Updates`, `General Inquiry`
- Priorities: `Critical`, `High`, `Medium`, `Low`
- Statuses: `Open`, `In Progress`, `Resolved`, `Closed`

## Data edge cases (must render cleanly)

Books can be in production (null ISBN/MRP/publication date) or have zero royalties or a null payout date. Show `—` or "In production", never `null`/`NaN`. Show empty states for authors with no tickets and for an empty queue.

## Demo credentials

- Authors: any email in `bookleaf_sample_data.json`, password `Author@123`
- Admins: `admin@bookleaf.com`, `support@bookleaf.com`, password `Admin@123`

## Status (2026-10-29)

Done:
- Single Express app on Vercel.
- Strict TS.
- AI client (classify, draft, fallbacks, caching).
- Verbatim KB seed with demo tickets.
- Frontend wired to same-origin `/api`, with polling and urgent/aging queue highlights.
- README and write-up.

Pending:
- Apply the migration `20261029120000_ai_fields_and_indexes` to prod and reseed prod.
- Deploy, then fill in `<LIVE_URL>` in the README.
- Delete the old Neon Function deploy.

Pre-ship smoke test:
- Author flow works end to end, and admin replies show up within about 5s.
- Notes stay hidden from authors.
- RBAC: 401 without a token, 403 for an author on an admin route, 404 for another author's ticket, 400 with `details` on a bad body.
- With a bad `OPENROUTER_API_KEY`, the fallbacks kick in.
