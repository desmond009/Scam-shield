import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Please sign in") => new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this") => new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

export const notFoundHandler: RequestHandler = (req, _res, next) => next(notFound(`No route for ${req.method} ${req.path}`));

/** Name check as well as instanceof: schemas from the shared package may come from another Zod module instance. */
const isZodError = (err: unknown): err is ZodError => err instanceof ZodError || (err as Error)?.name === "ZodError";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (isZodError(err)) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "BAD_JSON", message: "Malformed JSON body" } });
    return;
  }
  (req.log ?? logger).error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};
