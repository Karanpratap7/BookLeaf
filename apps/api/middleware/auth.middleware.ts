import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: "AUTHOR" | "ADMIN" };
    }
  }
}

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as Request["user"];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token. Please log in again." });
  }
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have access to this resource" });
    }
    next();
  };
};

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return res.status(404).json({ error: "Resource not found" });
    if (err.code === "P2023" || err.code === "P2003")
      return res.status(400).json({ error: "Invalid reference" });
  }
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body" });
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on our side. Please try again." });
};
