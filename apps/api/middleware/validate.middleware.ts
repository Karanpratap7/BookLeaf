import { Request, Response, NextFunction } from "express";
import { ZodTypeAny } from "zod";

/** Validates { body, params, query }. Parsed (trimmed/coerced) body goes back on req.body, query on res.locals.query. */
export const validate = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
    }
    if (result.data.body !== undefined) req.body = result.data.body;
    res.locals.query = result.data.query;
    next();
  };
};
