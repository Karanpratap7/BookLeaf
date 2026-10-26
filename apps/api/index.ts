import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { authenticateJWT, authorizeRoles, errorHandler } from "./middleware";
import { validate, classifyTicket } from "./middleware/validate.middleware";
import { withTimeout } from "./services/ai/client";

dotenv.config();

const app = express();
app.use(express.json());

const prisma = new PrismaClient();

// === AUTH ROUTES ===
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const demoPassword = "Author@123";
  const isAdmin = user.email === "admin@bookleaf.com" && password === "Admin@123";
  const isAuthor = password === demoPassword;

  if (!isAuthor && !isAdmin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const role = user.email === "admin@bookleaf.com" ? "ADMIN" : "AUTHOR";

  const token = jwt.sign(
    { id: user.id, email: user.email, role },
    process.env.JWT_SECRET!,
    { expiresIn: "24h" }
  );

  res.json({ token, role });
});

app.get("/api/auth/me", authenticateJWT, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { books: true },
  });
  res.json(user);
});

// === AUTHOR BOOKS ===
app.get(
  "/api/authors/me/books",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const authorId = req.user!.id;
    const books = await prisma.book.findMany({ where: { authorId } });
    res.json(books);
  }
);

// === SUBMIT SUPPORT QUERY ===
app.post(
  "/api/tickets",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate({
    body: {
      subject: { string: true },
      description: { string: true },
      bookId: { string: true optional: true },
    },
  }),
  async (req: Request, res: Response) => {
    const authorId = req.user!.id;
    const { subject, description, bookId } = req.body;

    // Create ticket first (must succeed even if AI fails)
    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        authorId,
        ...(bookId && { bookId }),
        status: "Open",
        category: "General Inquiry",
        priority: "Medium",
      },
    });

    // Async AI classify+priority (Phase 2) - non-blocking, don't wait for result
    // TODO: trigger AI job via queue Process in background
    try {
      const result = await withTimeout(
        classifyTicket(subject, description),
        10000
      );
      if (result.category || result.priority) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            category: result.category,
            priority: result.priority,
          },
        });
      }
    } catch (err) {
      // AI failure should not block ticket creation
      console.error("Async AI classify failed (non-blocking):", err);
    }

    res.status(201).json(ticket);
  }
);

// === MY TICKETS ===
app.get(
  "/api/tickets/mine",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const authorId = req.user!.id;
    const tickets = await prisma.ticket.findMany({
      where: { authorId },
      include: { messages: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  }
);

// === TICKET DETAIL ===
app.get(
  "/api/tickets/:id",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { messages: true },
    });

    if (!ticket || ticket.authorId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json(ticket);
  }
);

// === SSE STREAM for My Tickets ===
app.get(
  "/api/tickets/mine/stream",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write("data: {\"status\":\"connected\"}\n\n");
  }
);

// === ADMIN ROUTES ===

// 2.1 Ticket Queue - with filters and sorting
app.get(
  "/api/admin/tickets",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  async (req: Request, res: Response) => {
    const {
      status,
      category,
      priority,
      startDate,
      endDate,
    } = req.query;

    const where: any = {};

    if (status) where.status = String(status);
    if (category) where.category = String(category);
    if (priority) where.priority = String(priority);
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(String(startDate));
      if (endDate) where.created_at.lte = new Date(String(endDate));
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: {
        // Sort urgent+oldest first: Critical/High first, then created_at ASC
        priority: {
          string: {
            sort: "desc",
            nulls: "last",
          },
        },
        createdAt: "asc",
      },
    });

    res.json(tickets);
  }
);

// PATCH /api/admin/tickets/:id - status, category/priority override, assign-self
app.patch(
  "/api/admin/tickets/:id",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate({
    body: {
      status: { string: true optional: true },
      categoryOverride: { string: true optional: true },
      priorityOverride: { string: true optional: true },
      assignSelf: { boolean: true optional: true },
    },
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, categoryOverride, priorityOverride, assignSelf } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Assign to current admin if assignSelf
    let adminId = ticket.assignedAdminId;
    if (assignSelf) {
      const currentAdmin = await prisma.user.findFirst({
        where: { role: "ADMIN" },
      });
      if (currentAdmin) adminId = currentAdmin.id;
    }

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        status,
        categoryOverride,
        priorityOverride,
        assignedAdmin: adminId ? { connect: { id: adminId } } : undefined,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    // SSE: push update to author
    // TODO: trigger SSE hub

    res.json(updated);
  }
);

// POST /api/admin/tickets/:id/notes - internal notes (author never sees)
app.post(
  "/api/admin/tickets/:id/notes",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate({
    body: {
      body: { string: true },
    },
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { body } = req.body;

    const note = await prisma.internal_notes.create({
      data: {
        ticketId: id,
        adminId: req.user!.id,
        body,
      },
      include: {
        admin: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json(note);
  }
);

// POST /api/admin/tickets/:id/responses - send edited reply → ticket_messages + SSE to author
app.post(
  "/api/admin/tickets/:id/responses",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate({
    body: {
      body: { string: true },
    },
  }),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { body } = req.body;

    const message = await prisma.ticket_messages.create({
      data: {
        ticketId: id,
        senderRole: "ADMIN",
        body,
      },
      include: {
        ticket: { select: { id: true, subject: true } },
      },
    });

    // SSE: push reply to author
    // TODO: trigger SSE hub

    res.status(201).json(message);
  }
);

// 2.5 AI-drafted response (on admin open ticket)
app.post(
  "/api/admin/tickets/:id/ai-draft",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Fetch ticket with author and book data
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        author: {
          include: { books: true },
        },
        book: true,
      },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // RAG: retrieve KB chunks relevant to this ticket
    const category = ticket.category || "General Inquiry";
    const chunks = await prisma.kbChunk.findMany({
      where: { category },
      take: 5,
      orderBy: {
        // Simple priority: chunks with title matching ticket subject keywords
        _raw: "random", // placeholder; in prod use tsvector similarity
      },
    });

    // Build author context
    const book = ticket.book || ticket.author?.books[0];
    const authorContext = book
      ? {
          name: ticket.author.name,
          bookTitle: book.title,
          isbn: book.isbn,
          status: book.status,
          mrp: book.mrp,
          royaltyEarned: book.totalRoyaltyEarned,
          royaltyPending: book.royaltyPending,
          lastPayout: book.lastRoyaltyPayoutDate,
        }
      : { name: ticket.author.name };

    // Generate AI draft using HF Qwen
    try {
      const systemPrompt = `You are a BookLeaf support assistant. Write an empathetic, helpful response to the author's query. Follow these guidelines:
- Empathize with the author's situation
- Reference specific numbers when available (royalty earned, copies sold, etc.)
- If the issue is BookLeaf's fault, acknowledge it clearly
- Provide a specific next step or timeline
- Use the tone: professional, warm, solution-focused
- Keep the response concise (max 200 words)`;

      const userPrompt = `Author: ${authorContext.name}
Book: ${authorContext.bookTitle} (${authorContext.isbn})
Status: ${authorContext.status}
Royalty earned: $${authorContext.royaltyEarned}
Royalty pending: $${authorContext.royaltyPending}

Original query: ${ticket.subject}

${chunks.length > 0 ? "Relevant Knowledge Base chunks:\n" + chunks.map((c, i) => `${i + 1}. ${c.title}: ${c.content.substring(0, 200)}`).join("\n") : "No KB chunks retrieved.

}Write a draft response to the author's query above. Include specific details from the knowledge base if relevant. Keep it concise and professional.`;

      const completion = await hf.chat.completions.create({
        model: "Qwen/Qwen2.5-7B-Instruct:featherless-ai",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const draft = completion.choices[0]?.message?.content || "Draft unavailable - write manually";

      res.json({ draft });
    } catch (err) {
      console.error("AI draft error:", err);
      res.status(500).json({ error: "Draft unavailable - write manually" });
    }
  }
);

// === ERROR HANDLER ===
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 BookLeaf API running on port ${PORT}`);
});

export { prisma };