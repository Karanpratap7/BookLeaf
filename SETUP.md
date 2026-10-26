# BookLeaf Author Portal — Setup & Run

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (local or managed like Railway/Render)
- Git

## 1. Clone & Install

```bash
git clone https://github.com/Karanpratap7/BookLeaf.git
cd bookleaf
npm install  # installs deps for apps/web and apps/api
```

## 2. Environment

Copy the `.env.example` and adjust values:

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bookleaf"
JWT_SECRET="replace-with-32-char-secret"
HF_TOKEN="your-hf-token-here"    # Get from https://huggingface.co/settings/tokens
PORT=4000
CORS_ORIGIN="http://localhost:5173"
```

**Important:** `.env` is gitignored. Never commit secrets.

## 3. Database & Prisma

```bash
# Install Prisma CLI if needed
npm install -g prisma

# Generate Prisma client
cd apps/api
npx prisma generate

# Apply migrations
npx prisma migrate dev --name init

# Seed the database with sample data (10 authors + 2 admins + 18 books + KB chunks)
node scripts/seed.js
```

## 4. Vue Frontend

```bash
# Build the Vue 3 Vite app
cd apps/web
npm run build
```

## 5. Start the API Server

```bash
# From apps/api directory
npm run dev   # or: node dist/index.js
```

The API will run on `http://localhost:4000`

## 6. Access the App

- **API:** http://localhost:4000
- **API Docs (Swagger):** http://localhost:4000/api-docs
- **Health Check:** http://localhost:4000/api/health

## Test Credentials

### Authors (any of 10, password: `Author@123`)

| Email | Name |
|-------|------|
| priya.sharma@email.com | Priya Sharma |
| rohit.kapoor@email.com | Rohit Kapoor |
| ananya.reddy@email.com | Ananya Reddy |
| vikram.joshi@email.com | Vikram Joshi |
| meera.nair@email.com | Meera Nair |
| arjun.malhotra@email.com | Arjun Malhotra |
| sneha.kulkarni@email.com | Sneha Kulkarni |
| farhan.sheikh@email.com | Farhan Sheikh |
| kavita.deshmukh@email.com | Kavita Deshmukh |
| diya.chatterjee@email.com | Diya Chatterjee |

### Admins

| Email | Password | Role |
|-------|----------|------|
| admin@bookleaf.com | Admin@123 | ADMIN |
| support@bookleaf.com | Admin@123 | ADMIN |

## Project Structure

```
bookleaf/
├── apps/web/       # Vue 3 + Vite + Vue Router + Pinia
├── apps/api/       # Express + Prisma + TypeScript
│   ├── prisma/     # Schema + migrations
│   ├── scripts/    # seed.js (loads bookleaf_sample_data.json)
│   ├── services/ai/  # HF Qwen client with timeout/degradation
│   ├── middleware/ # auth guard, Zod validation, error handler
│   ├── swagger.js  # OpenAPI 3.0 config
│   ├── README.md   # Full API docs + RBAC + AI features + deployment
│   └── index.ts    # All route handlers (Auth, Author, Admin, Tickets, SSE)
├── packages/shared/  # (thin, optional shared types)
├── bookleaf_sample_data.json  # 10 authors, 18 books, edge cases
├── bookleaf_author_portal_ae2ed9aa.plan.md  # Implementation plan
├── .env              # Do NOT commit (gitignored)
├── .gitignore
└── writeup.md        # 1-page priorities, trade-offs, roadmap
```

## Development Workflows

```bash
# Watch Vue dev server
cd apps/web && npm run dev   # Vite dev server at http://localhost:5173

# Watch API with nodemon
cd apps/api && npx nodemon dist/index.ts

# OR use npm scripts from root (if defined in package.json)
```

## Deployment Checklist

- [ ] Set up PostgreSQL (Railway or Render managed DB recommended)
- [ ] Add `DATABASE_URL`, `JWT_SECRET`, `HF_TOKEN` to environment
- [ ] Run `prisma migrate deploy` to apply schema
- [ ] Run `node scripts/seed.js` to populate DB
- [ ] Build Vue: `cd apps/web && npm run build`
- [ ] Set `CORS_ORIGIN` to production domain
- [ ] Start: `cd apps/api && node dist/index.js`
- [ ] Verify `/api-docs` Swagger UI loads
- [ ] Test all 10 author logins + 2 admin logins
- [ ] Test ticket create → verify AI classify runs (may fallback gracefully)
- [ ] Test AI draft generation (may fail → verify empty editor fallback)