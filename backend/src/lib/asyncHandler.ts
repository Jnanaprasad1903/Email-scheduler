import { RequestHandler } from 'express';

type AsyncRequestHandler = (...args: Parameters<RequestHandler>) => Promise<void>;

/**
 * Wraps an async route handler so that any rejected promise is passed to
 * Express's next() error pipeline instead of causing an unhandled rejection.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
