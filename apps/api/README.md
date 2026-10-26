# BookLeaf Author Portal API

## Overview

The BookLeaf Author Portal is a Vue 3 + Node.js (Express) + PostgreSQL support portal for authors and administrators. Authors can submit support queries, track ticket status via SSE, view their books and royalty earnings. Administrators can manage a ticket queue, auto-classify tickets using Hugging Face Qwen, and generate AI-drafted responses with Knowledge Base context.

## Tech Stack

- **Framework:** Node.js (Express), Vue 3 (Vite)
- **Database:** PostgreSQL (via Prisma ORM)
- **AI:** Hugging Face Router - `Qwen/Qwen2.5-7B-Instruct:featherless-ai`
- **Auth:** JWT + Role-based access control (RBAC): `author` | `admin`
- **RAG:** Category-matched full-text search over KB chunks (no embeddings required)
- **Deployment:** Railway or Render (API + PostgreSQL + static Vue)

## Environment Variables

Create `.env` in `apps/api/` from `.env.example`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bookleaf"
JWT_SECRET="your-32-plus-char-secret"
HF_TOKEN="your-hf-token-here"   # <- Never commit this. Rotate after shared exposure.
PORT=4000
CORS_ORIGIN="http://localhost:5173"
BCRYPT_SALT_ROUNDS=10
```

**Security note:** The `HF_TOKEN` was pasted in chat. Do not commit it. Put it only in `.env` (gitignored). Rotate the token on Hugging Face after this assignment if the chat/repo may be shared.

## API Surface

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Email/password → JWT + role |
| GET | `/api/auth/me` | Current user info |

### Author

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/authors/me/books` | List author's books (includes edge cases: null MRP, In Production statuses) |
| POST | `/api/tickets` | Submit support query (form: book dropdown + subject + description, UI-only file input) |
| GET | `/api/tickets/mine` | List author's tickets with status, subject, timestamps |
| GET | `/api/tickets/:id` | Ticket detail + messages (no internal notes) |
| GET | `/api/tickets/mine/stream` | SSE stream for near-real-time admin replies/status changes |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/tickets` | Ticket queue with filters: status, category, priority, date range. Sorted urgent+oldest first (Critical/High first, then `created_at` ASC) |
| PATCH | `/api/admin/tickets/:id` | Status, category override, priority override, assign-to-self |
| POST | `/api/admin/tickets/:id/notes` | Internal notes (author never sees) |
| POST | `/api/admin/tickets/:id/responses` | Send edited reply → ticket_messages + SSE to author |
| POST | `/api/admin/tickets/:id/ai-draft` | AI-drafted response with RAG + author book/royalty context |

**RBAC:** Authors receive `403` on all `/api/admin/*` routes. Authors cannot read others' tickets (enforced via `author_id` in JWT + database queries).

## AI Features

### Auto-classification + Priority (on ticket create)

- Async job after `POST /api/tickets`
- Prompt: system role as BookLeaf classifier; user message = subject + description; ask for JSON `{ category, priority, rationale }`
- Categories exactly: Royalty & Payments \| ISBN & Metadata Issues \| Printing & Quality \| Distribution & Availability \| Book Status & Production Updates \| General Inquiry
- Priority: Critical \| High \| Medium \| Low
- Persisted to DB; admin overrides stored separately so "AI vs human" is auditable
- If HF down/rate-limited: leave category/priority null or `General Inquiry` / `Medium` fallback; ticket still Open

### AI-drafted Response (on admin open ticket)

- `POST /api/admin/tickets/:id/ai-draft`
- RAG retrieve KB chunks (category match + keyword/trigram similarity on subject+description)
- **Also inject author context:** name, book title/ISBN/status, royalty earned/paid/pending, last payout date, production stage if in-production
- Prompt includes: tone guidelines + retrieved KB + sample response patterns + author data + original query
- Return draft text; admin edits in textarea; send via responses endpoint
- If AI fails: show empty editor + toast "Draft unavailable — write manually"

**Token discipline:** RAG subset (3–5 chunks max) + one book's fields, not full ticket history dump.

### Degradation Strategy

- Every AI call wrapped with `withTimeout()` (30s max) and try/catch
- On failure: return `null`/empty editor, log error, continue flow
- Ticket creation succeeds even if AI fails
- Fallback: `General Inquiry` / `Medium` for classification; empty draft editor

## Knowledge Base (RAG)

The KB is chunked from the assignment Knowledge Base sections, stored in `kb_chunks` table with `category` tags matching the six ticket categories:

| Category | Sections |
|-----------|----------|
| Royalty & Payments | Royalty Basics, Payout Threshold, Royalty Discrepancy |
| ISBN & Metadata Issues | ISBN Validation, Title/Author Update |
| Printing & Quality | Print Defects, Out of Print |
| Distribution & Availability | Platform Availability, Regional Restrictions |
| Book Status & Production Updates | In Production Workflow, Delay Escalation |
| General Inquiry | General Submissions, FAQ |

**Retrieval:** For a ticket, pull top 3–5 chunks by:
- Category match (if known) + keyword/tsvector similarity on subject+description
- Keep token budget tight: never the full KB every time (cost awareness)

If HF embeddings become available later, they can be added as an optional step without changing the API.

## Test Credentials

### Author (any of 10)

- Email: `priya.sharma@email.com` (or any author email from sample data)
- Password: `Author@123`
- Role: `AUTHOR`

### Admin

- Email: `admin@bookleaf.com`
- Password: `Admin@123`
- Role: `ADMIN`

## Known Limits & Trade-offs

- **No real file uploads:** File input in UI only; bytes are ignored (no storage backend)
- **No OTP/social login:** Email/password only with shared demo password
- **SSE is stubbed:** Connection kept alive; in production use Redis/SSE hub for push events
- **AI degradation:** Classification/draft may fail silently; ticket creation is never blocked
- **No embeddings:** R uses category + full-text search; semantic search requires a second model (stretch goal)
- **Monorepo structure:** Vue app in `apps/web/`, API in `apps/api/`, Prisma schema in `apps/api/prisma/`

## Deployment

1. Set up PostgreSQL (Railway or Render managed)
2. Set `HF_TOKEN` in environment (never in code)
3. Run `prisma migrate deploy` to apply schema
4. Run `node scripts/seed.js` to populate DB with sample data
5. Build Vue: `cd apps/web && npm run build`
6. Serve static files from Express or deploy Vue separately + API CORS
7. Start API: `cd apps/api && node dist/index.js`

## Roadmap (Post-Assignment)

- Add bcrypt password hashing (replace plain-text compare)
- Implement Redis-backed SSE hub for real-time pushes
- Add HF embeddings for semantic KB search (optional stretch)
- Write Vue components: Login, My Books, Submit Ticket, My Tickets with SSE, Admin Queue, AI Draft Editor
- Add Swagger/OpenAPI generation from JSDoc annotations