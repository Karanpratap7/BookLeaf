# BookLeaf — 1-Page Write-Up

## Project Priorities
1. **Author Portal first** — login, My Books, submit ticket, My Tickets + SSE. Authors can immediately submit queries and track responses without page refresh.
2. **AI on admin side only** — HF Qwen classification+priority + RAG-drafts. No AI on author-facing UI (explicit non-goal).
3. **Graceful degradation** — AI failures must not block ticket creation or force empty admin UI. Classification/draft returns null → safe fallbacks.
4. **Data edge cases from day 1** — null MRP/publication_date, "In Production" statuses, zero royalties, null payout dates. Schema and UI handle these without crashes.
5. **RBAC from Day 1** — authors 403 on /admin/*; authors cannot read others' tickets. Secure by default.

## Trade-offs Made

| Decision | Rationale |
|----------|-----------|
| **Category + FTS RAG (no embeddings)** | Avoids requiring a second model (cost/complexity). Category match + keyword similarity covers all six ticket categories effectively. Swappable for embeddings later. |
| **SSE stubbed (not Redis-backed)** | Gets real-time connection working fast. Production can swap in Redis/PubSub hub without API changes. |
| **File attach: UI-only** | Eliminates storage backend (S3, etc.) complexity for this assignment. Meets the "no upload storage" requirement. |
| **Shared demo password (Author@123 / Admin@123)** | Enables immediate testing without OTP/social login flow. Meets assignment auth requirement while keeping scope bounded. |
| **Express + Prisma (not tRPC/GraphQL)** | Simplest full-stack path. All endpoints explicit REST; can be replaced later. |
| **Monorepo (Vue + Express separate apps)** | Clear separation of concerns. Vue app can be served static or proxied to Express in prod. |

## Production Evolution Roadmap

| Phase | Item | Effort |
|-------|------|--------|
| **P0 (post-assignment)** | Replace plain-text password compare with bcrypt | 1 day |
| **P1** | Redis-backed SSE hub (push events on ticket updates) | 2–3 days |
| **P2** | Add HF embeddings for semantic KB search (optional) | 3–5 days |
| **P3** | Migrate to tRPC or GraphQL for end-to-end types | 1–2 weeks |
| **P4** | Replace demo passwords with email/password flow + OTP | 1 week |
| **P5** | Add file upload (S3) with virus scanning + virus scanning | 1 week |

## Cost & Token Awareness

- **HF Qwen pricing:** Featherless AI router — pay per token. RAG limits to 3–5 KB chunks max per call. Classification prompt ~150 tokens. Draft prompt ~400 tokens. Total per ticket < 600 tokens.
- **Fallback cost:** On AI failure, zero cost. Empty editor + manual write.
- **Monitoring:** Log every HF call success/failure + token count. Alert if avg. latency > 20s or error rate > 5%.
- **Token budget in draft prompt:** System prompt + 1 book's fields + RAG chunks (3 max) + original query. Never dumps full ticket history.

## AI Degradation ( documented in README )

Every AI call is wrapped with:
1. `withTimeout()` — 30s max, return null on timeout
2. try/catch — log error, return null
3. Classification: if null → `{ category: "General Inquiry", priority: "Medium" }`
4. Draft: if null → show empty editor + toast "Draft unavailable — write manually"

Ticket creation **always** succeeds. Admin UI never blocks on AI.

## Test Credentials

### Authors (10 — any email from sample data + password `Author@123`)
- `priya.sharma@email.com` (Priya Sharma)
- `rohit.kapoor@email.com` (Rohit Kapoor)
- `ananya.reddy@email.com` (Ananya Reddy)
- `vikram.joshi@email.com` (Vikram Joshi)
- `meera.nair@email.com` (Meera Nair)
- `arjun.malhotra@email.com` (Arjun Malhotra)
- `sneha.kulkarni@email.com` (Sneha Kulkarni)
- `farhan.sheikh@email.com` (Farhan Sheikh)
- `kavita.deshmukh@email.com` (Kavita Deshmukh)
- `diya.chatterjee@email.com` (Diya Chatterjee)

### Admins
- `admin@bookleaf.com` / `Admin@123` — full admin access
- `support@bookleaf.com` / `Admin@123` — support staff access

## Deployment Checklist

- [ ] Set up PostgreSQL (Railway or Render managed DB)
- [ ] Add `DATABASE_URL` to environment
- [ ] Add `HF_TOKEN` to environment (never commit; rotate after shared exposure)
- [ ] Add `JWT_SECRET` (32+ chars random)
- [ ] Run `prisma migrate deploy` to apply schema
- [ ] Run `node scripts/seed.js` to populate DB with 10 authors + 2 admins + 18 books + 12 KB chunks
- [ ] Build Vue: `cd apps/web && npm run build`
- [ ] Configure CORS: `CORS_ORIGIN="https://your-domain.com"` (or `*` for dev)
- [ ] Start API: `cd apps/api && node dist/index.js`
- [ ] Serve Vue static either from Express `apps/web/dist/` or separate host with matching CORS
- [ ] Verify /api-docs Swagger UI loads correctly
- [ ] Test all 10 author logins + 2 admin logins
- [ ] Test ticket create → SSE receives update (stubbed)
- [ ] Test AI draft generation (may fail → verify fallback)
- [ ] Verify RBAC: authors 403 on /admin/* routes

## Requirement Traceability

| Brief Requirement | Plan Step |
|-------------------|-----------|
| Email/password auth; own data only | Phase 1.1 + RBAC |
| My Books fields + statuses | Phase 1.2 + seed edge cases |
| Submit query form + UI-only attach | Phase 1.3 |
| My Tickets statuses + admin replies | Phase 1.4 |
| Real-time / near-real-time | SSE Phase 1.4 |
| Queue + filters + urgency | Phase 2.1 |
| AI auto-classification + override | Phase 2.4 |
| AI priority + override | Phase 2.4 |
| AI draft from query + KB + edit/send | Phase 2.5 + RAG 2.3 + author inject |
| Status, internal notes, assign self | Phase 2.1 |
| Swagger / Postman + README endpoint docs | Phase 3 |
| Deploy live demo, README + 1-page write-up | Phase 4 |