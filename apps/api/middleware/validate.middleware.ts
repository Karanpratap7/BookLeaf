import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";

export const validate = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
    } catch (err: any) {
      const errors = (err.errors || []).map((e: any) => ({
        path: (e.path || []).join("."),
        message: e.message,
      }));
      return res
        .status(400)
        .json({ error: "Validation failed", details: errors });
    }
  };
};
