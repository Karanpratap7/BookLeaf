import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import swaggerOptions from "./swagger";
import { PrismaClient } from "@prisma/client";
import {
  authenticateJWT,
  authorizeRoles,
  errorHandler,
} from "./middleware/auth.middleware";
import { validate } from "./middleware/validate.middleware";
import { classifyTicket, generateDraft } from "./services/ai/client";
import { z } from "zod";

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerOptions));

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

const ticketCreateSchema = z.object({
  body: z.object({
    subject: z.string().min(1),
    description: z.string().min(1),
    bookId: z.string().optional().nullable(),
  }),
});

const ticketPatchSchema = z.object({
  body: z.object({
    status: z.string().optional(),
    categoryOverride: z.string().optional(),
    priorityOverride: z.string().optional(),
    assignSelf: z.boolean().optional(),
  }),
});

const noteSchema = z.object({
  body: z.object({
    body: z.string().min(1),
  }),
});

const responseSchema = z.object({
  body: z.object({
    body: z.string().min(1),
  }),
});

const PRIORITY_RANK: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

app.post(
  "/api/auth/login",
  validate(loginSchema),
  async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isAdmin =
      user.role === "ADMIN" && password === "Admin@123";
    const isAuthor =
      user.role === "AUTHOR" && password === "Author@123";

    if (!isAdmin && !isAuthor) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      role: user.role,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }
);

app.get(
  "/api/auth/me",
  authenticateJWT,
  async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        city: true,
        joinedDate: true,
      },
    });
    res.json(user);
  }
);

app.get(
  "/api/authors/me/books",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const books = await prisma.book.findMany({
      where: { authorId: req.user!.id },
      orderBy: { title: "asc" },
    });
    res.json(books);
  }
);

app.post(
  "/api/tickets",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate(ticketCreateSchema),
  async (req: Request, res: Response) => {
    const authorId = req.user!.id;
    const { subject, description, bookId } = req.body;

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        authorId,
        ...(bookId ? { bookId } : {}),
        status: "Open",
        category: "General Inquiry",
        priority: "Medium",
        messages: {
          create: {
            senderRole: "AUTHOR",
            body: description,
          },
        },
      },
      include: { messages: true },
    });

    // Non-blocking AI classify — never fail ticket creation
    setImmediate(async () => {
      try {
        const result = await classifyTicket(subject, description);
        if (result?.category || result?.priority) {
          await prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              ...(result.category ? { category: result.category } : {}),
              ...(result.priority ? { priority: result.priority } : {}),
            },
          });
        }
      } catch (err) {
        console.error("Async AI classify failed (non-blocking):", err);
      }
    });

    res.status(201).json(ticket);
  }
);

app.get(
  "/api/tickets/mine",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const tickets = await prisma.ticket.findMany({
      where: { authorId: req.user!.id },
      include: { messages: { orderBy: { createdAt: "asc" } }, book: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(tickets);
  }
);

app.get(
  "/api/tickets/:id",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: "asc" } }, book: true },
    });

    if (!ticket || ticket.authorId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json(ticket);
  }
);

const authorReplySchema = z.object({
  body: z.object({
    body: z.string().min(1),
  }),
});

// Author follow-up message on an open ticket
app.post(
  "/api/tickets/:id/messages",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  validate(authorReplySchema),
  async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
    });

    if (!ticket || ticket.authorId !== req.user!.id) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    if (ticket.status === "Closed") {
      return res
        .status(400)
        .json({ error: "This ticket is closed. Please open a new query." });
    }

    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderRole: "AUTHOR",
        body: req.body.body,
      },
    });

    if (ticket.status === "Resolved") {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: "Open" },
      });
    }

    res.status(201).json(message);
  }
);

app.get(
  "/api/tickets/mine/stream",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ status: "connected" })}\n\n`);

    const interval = setInterval(async () => {
      try {
        const tickets = await prisma.ticket.findMany({
          where: { authorId: req.user!.id },
          select: { id: true, status: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take: 20,
        });
        res.write(`data: ${JSON.stringify({ tickets })}\n\n`);
      } catch {
        /* client may have disconnected */
      }
    }, 5000);

    req.on("close", () => {
      clearInterval(interval);
    });
  }
);

app.get(
  "/api/admin/tickets",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  async (req: Request, res: Response) => {
    const { status, category, priority, startDate, endDate } = req.query;
    const where: Record<string, unknown> = {};

    if (status) where.status = String(status);
    if (category) where.category = String(category);
    if (priority) where.priority = String(priority);
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(String(startDate)) } : {}),
        ...(endDate ? { lte: new Date(String(endDate)) } : {}),
      };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        book: { select: { id: true, title: true, isbn: true } },
        messages: { orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
    });

    tickets.sort((a, b) => {
      const pa = PRIORITY_RANK[a.priorityOverride || a.priority] || 0;
      const pb = PRIORITY_RANK[b.priorityOverride || b.priority] || 0;
      if (pb !== pa) return pb - pa;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    res.json(tickets);
  }
);

app.get(
  "/api/admin/tickets/:id",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
        book: true,
        messages: { orderBy: { createdAt: "asc" } },
        internalNotes: {
          orderBy: { createdAt: "asc" },
          include: { admin: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  }
);

app.patch(
  "/api/admin/tickets/:id",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate(ticketPatchSchema),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, categoryOverride, priorityOverride, assignSelf } = req.body;

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const updated = await prisma.ticket.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(categoryOverride !== undefined ? { categoryOverride } : {}),
        ...(priorityOverride !== undefined ? { priorityOverride } : {}),
        ...(assignSelf ? { assignedAdminId: req.user!.id } : {}),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        assignedAdmin: { select: { id: true, name: true, email: true } },
      },
    });

    res.json(updated);
  }
);

app.post(
  "/api/admin/tickets/:id/notes",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate(noteSchema),
  async (req: Request, res: Response) => {
    const note = await prisma.internalNote.create({
      data: {
        ticketId: req.params.id,
        adminId: req.user!.id,
        body: req.body.body,
      },
      include: {
        admin: { select: { id: true, name: true, email: true } },
      },
    });
    res.status(201).json(note);
  }
);

app.post(
  "/api/admin/tickets/:id/responses",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  validate(responseSchema),
  async (req: Request, res: Response) => {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: req.params.id,
        senderRole: "ADMIN",
        body: req.body.body,
      },
    });

    await prisma.ticket.update({
      where: { id: req.params.id },
      data: { status: "In Progress" },
    });

    res.status(201).json(message);
  }
);

app.post(
  "/api/admin/tickets/:id/ai-draft",
  authenticateJWT,
  authorizeRoles("ADMIN"),
  async (req: Request, res: Response) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        author: true,
        book: true,
      },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const category =
      ticket.categoryOverride || ticket.category || "General Inquiry";
    const chunks = await prisma.kbChunk.findMany({
      where: { category },
      take: 5,
    });

    const book = ticket.book;
    const result = await generateDraft({
      authorName: ticket.author.name || "Author",
      subject: ticket.subject,
      description: ticket.description,
      category,
      bookTitle: book?.title,
      isbn: book?.isbn,
      status: book?.status,
      royaltyEarned: book?.totalRoyaltyEarned,
      royaltyPending: book?.royaltyPending,
      lastPayout: book?.lastRoyaltyPayoutDate,
      chunks,
    });

    res.json({
      draft: result.draft,
      source: result.source,
      model: result.model || null,
      notice:
        result.source === "policy"
          ? "Hugging Face unavailable (credits/rate limit). Used BookLeaf policy + RAG fallback draft — edit before sending."
          : `Generated with ${result.model}`,
    });
  }
);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`BookLeaf API running on http://localhost:${PORT}`);
  console.log(`Swagger docs: http://localhost:${PORT}/api-docs`);
});

export { prisma };
