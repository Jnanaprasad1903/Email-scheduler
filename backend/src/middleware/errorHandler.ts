import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/AppError.js';

/**
 * Central Express error handler.
 *
 * All errors — Zod validation, AppError, Prisma, unexpected — flow here
 * via next(err) or asyncHandler. This ensures every error response has the
 * same JSON shape and the correct HTTP status code.
 *
 * Must be registered AFTER all routes (app.use(errorHandler) at the end).
 * Must have exactly 4 parameters so Express recognises it as an error handler.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Zod validation errors → 400 with field-level detail
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      issues: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // Application errors with explicit status codes
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Unexpected errors — log internally, return generic message
  console.error('[UnhandledError]', err);
  res.status(500).json({ error: 'Internal server error' });
};
