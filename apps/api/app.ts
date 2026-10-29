import path from "path";
import dotenv from "dotenv";
// Local dev: apps/api/.env (also read by the Prisma CLI), then the repo-root .env. No-op on Vercel.
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { authenticateJWT, authorizeRoles, errorHandler } from "./middleware/auth.middleware";
import { validate } from "./middleware/validate.middleware";
import { classifyTicket, generateDraft } from "./services/ai/client";
import { CATEGORIES, PRIORITIES, STATUSES, PRIORITY_RANK } from "./domain";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");

const app = express();
export const prisma = new PrismaClient();

app.use(express.json({ limit: "100kb" }));

const userSummary = { select: { id: true, name: true, email: true } };

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------- Auth ----------

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1),
  }),
});

app.post("/api/auth/login", validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for unknown email and wrong password, so emails can't be enumerated.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET!, {
    expiresIn: "24h",
  });
  res.json({
    token,
    role: user.role,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

app.get("/api/auth/me", authenticateJWT, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, phone: true, city: true, joinedDate: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// ---------- Author ----------

app.get("/api/authors/me/books", authenticateJWT, authorizeRoles("AUTHOR"), async (req, res) => {
  const books = await prisma.book.findMany({
    where: { authorId: req.user!.id },
    orderBy: { title: "asc" },
  });
  res.json(books);
});

const ticketCreateSchema = z.object({
  body: z.object({
    subject: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(5000),
    bookId: z.string().uuid().nullish(),
  }),
});

app.post(
  "/api/tickets",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate(ticketCreateSchema),
  async (req, res) => {
    const authorId = req.user!.id;
    const { subject, description, bookId } = req.body;

    if (bookId) {
      const book = await prisma.book.findFirst({ where: { id: bookId, authorId } });
      if (!book) {
        return res.status(400).json({
          error: "Validation failed",
          details: [{ path: "body.bookId", message: "Book not found on your account" }],
        });
      }
    }

    // Awaited, not fire-and-forget: serverless functions freeze after the response.
    // classifyTicket is time-bounded and never throws (falls back to keyword rules).
    const ai = await classifyTicket(subject, description);

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        authorId,
        bookId: bookId || null,
        status: "Open",
        category: ai.category,
        priority: ai.priority,
        aiRationale: ai.rationale,
        messages: { create: { senderRole: "AUTHOR", body: description } },
      },
      include: { messages: true, book: true },
    });

    res.status(201).json(ticket);
  },
);

// Author-facing ticket shape: never includes internal notes or AI internals.
const authorTicketSelect = {
  id: true,
  subject: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  book: { select: { id: true, title: true, isbn: true } },
  messages: { orderBy: { createdAt: "asc" as const } },
};

app.get("/api/tickets/mine", authenticateJWT, authorizeRoles("AUTHOR"), async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { authorId: req.user!.id },
    select: authorTicketSelect,
    orderBy: { updatedAt: "desc" },
  });
  res.json(tickets);
});

const idParam = z.object({ params: z.object({ id: z.string().uuid() }) });

app.get(
  "/api/tickets/:id",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate(idParam),
  async (req, res) => {
    // Scoping by authorId means another author's ticket is a 404, not a 403 (no existence leak).
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id as string, authorId: req.user!.id },
      select: authorTicketSelect,
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  },
);

const messageSchema = idParam.extend({
  body: z.object({ body: z.string().trim().min(1).max(5000) }),
});

app.post(
  "/api/tickets/:id/messages",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate(messageSchema),
  async (req, res) => {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id as string, authorId: req.user!.id },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (ticket.status === "Closed") {
      return res.status(409).json({ error: "This ticket is closed. Please raise a new query." });
    }

    const [message] = await prisma.$transaction([
      prisma.ticketMessage.create({
        data: { ticketId: ticket.id, senderRole: "AUTHOR", body: req.body.body },
      }),
      // A follow-up on a resolved ticket reopens it; also invalidates the cached draft.
      prisma.ticket.update({
        where: { id: ticket.id },
        data: { aiDraft: null, ...(ticket.status === "Resolved" ? { status: "Open" } : {}) },
      }),
    ]);
    res.status(201).json(message);
  },
);

// ---------- Admin ----------

const admin = [authenticateJWT, authorizeRoles("ADMIN")];

const queueSchema = z.object({
  query: z.object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

app.get("/api/admin/tickets", ...admin, validate(queueSchema), async (req, res) => {
  const { status, category, priority, from, to } = res.locals.query as z.infer<typeof queueSchema>["query"];

  // Filters use the effective value: admin override if set, otherwise the AI value.
  const and: Prisma.TicketWhereInput[] = [];
  if (status) and.push({ status });
  if (category) and.push({ OR: [{ categoryOverride: category }, { categoryOverride: null, category }] });
  if (priority) and.push({ OR: [{ priorityOverride: priority }, { priorityOverride: null, priority }] });
  if (from || to) and.push({ createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } });

  const tickets = await prisma.ticket.findMany({
    where: { AND: and },
    include: {
      author: userSummary,
      assignedAdmin: userSummary,
      book: { select: { id: true, title: true, isbn: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Unresolved first, then most urgent, then oldest. ponytail: in-memory sort, move to SQL if the queue grows past a few thousand rows.
  const done = (s: string) => (s === "Resolved" || s === "Closed" ? 1 : 0);
  tickets.sort(
    (a, b) =>
      done(a.status) - done(b.status) ||
      (PRIORITY_RANK[b.priorityOverride || b.priority] || 0) -
        (PRIORITY_RANK[a.priorityOverride || a.priority] || 0) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  res.json(tickets);
});

app.get("/api/admin/tickets/:id", ...admin, validate(idParam), async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.id as string },
    include: {
      author: userSummary,
      assignedAdmin: userSummary,
      book: true,
      messages: { orderBy: { createdAt: "asc" } },
      internalNotes: { orderBy: { createdAt: "asc" }, include: { admin: userSummary } },
    },
  });
  if (!ticket) return res.status(404).json({ error: "Ticket not found" });
  res.json(ticket);
});

const patchSchema = idParam.extend({
  body: z
    .object({
      status: z.enum(STATUSES).optional(),
      // null clears the override and falls back to the AI value
      categoryOverride: z.enum(CATEGORIES).nullable().optional(),
      priorityOverride: z.enum(PRIORITIES).nullable().optional(),
      assignSelf: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, { message: "Nothing to update" }),
});

app.patch("/api/admin/tickets/:id", ...admin, validate(patchSchema), async (req, res) => {
  const { status, categoryOverride, priorityOverride, assignSelf } = req.body;
  const updated = await prisma.ticket.update({
    where: { id: req.params.id as string },
    data: {
      status,
      categoryOverride,
      priorityOverride,
      ...(assignSelf && { assignedAdminId: req.user!.id }),
    },
    include: { author: userSummary, assignedAdmin: userSummary },
  });
  res.json(updated);
});

app.post("/api/admin/tickets/:id/notes", ...admin, validate(messageSchema), async (req, res) => {
  await prisma.ticket.findUniqueOrThrow({ where: { id: req.params.id as string } });
  const note = await prisma.internalNote.create({
    data: { ticketId: req.params.id as string, adminId: req.user!.id, body: req.body.body },
    include: { admin: userSummary },
  });
  res.status(201).json(note);
});

app.post("/api/admin/tickets/:id/responses", ...admin, validate(messageSchema), async (req, res) => {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: req.params.id as string } });
  const [message] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: { ticketId: ticket.id, senderRole: "ADMIN", body: req.body.body },
    }),
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        aiDraft: null, // the draft was for the previous turn
        ...(ticket.status === "Open" && { status: "In Progress" }),
        ...(!ticket.assignedAdminId && { assignedAdminId: req.user!.id }),
      },
    }),
  ]);
  res.status(201).json(message);
});

const draftSchema = idParam.extend({
  query: z.object({ regenerate: z.enum(["0", "1"]).optional() }),
});

app.post("/api/admin/tickets/:id/ai-draft", ...admin, validate(draftSchema), async (req, res) => {
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { id: req.params.id as string },
    include: {
      author: { include: { books: true } },
      book: true,
      messages: { where: { senderRole: "AUTHOR" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Cost: drafts are cached per ticket and only regenerated on explicit request.
  if (ticket.aiDraft && res.locals.query.regenerate !== "1") {
    return res.json({ draft: ticket.aiDraft, source: ticket.aiDraftSource, cached: true });
  }

  const category = ticket.categoryOverride || ticket.category;
  const chunks = await prisma.kbChunk.findMany({
    where: { category },
    select: { title: true, content: true },
  });

  const latest = ticket.messages[0]?.body;
  const result = await generateDraft({
    authorName: ticket.author.name || "there",
    subject: ticket.subject,
    description: ticket.description,
    latestMessage: latest && latest !== ticket.description ? latest : null,
    category,
    book: ticket.book,
    otherBooks: ticket.book ? [] : ticket.author.books,
    chunks,
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { aiDraft: result.draft, aiDraftSource: result.source },
  });
  res.json({ ...result, cached: false });
});

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});
app.use(errorHandler);

export default app;
