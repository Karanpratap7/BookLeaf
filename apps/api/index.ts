import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { authenticateJWT, authorizeRoles, errorHandler } from "./middleware";
import { validate } from "./middleware/validate.middleware";

dotenv.config();

const app = express();
app.use(express.json());

const prisma = new PrismaClient();

// === AUTH ROUTES ===
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  // Simple password check - in prod use bcrypt
  if (password !== "Author@123" && !(user.email === "admin@bookleaf.com" && password === "Admin@123")) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: "24h" }
  );

  res.json({ token, role: user.role });
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

// === TICKETS (Author) ===
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

    // Enqueue async AI classify+priority (Phase 2) - non-blocking
    // TODO: trigger AI job

    res.status(201).json(ticket);
  }
);

// === TICKETS (Author - detail + messages) ===
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

// === SSE STREAM ===
app.get(
  "/api/tickets/mine/stream",
  authenticateJWT,
  authorizeRoles("AUTHOR"),
  (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Keep connection alive; in prod use proper SSE hub
    res.write("data: {\"status\":\"connected\"}\n\n");
  }
);

// === ERROR HANDLER ===
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 BookLeaf API running on port ${PORT}`);
});

export { prisma };