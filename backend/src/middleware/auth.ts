import { RequestHandler } from 'express';
import { AppError } from '../lib/AppError.js';

/**
 * Authentication stub — Issue #9 will replace this body with real
 * Google OAuth session validation.
 *
 * For testing (before Issue #9):
 *   Send header:  x-user-id: <valid-user-uuid>
 *
 * The resolved userId is stored in res.locals.userId so every route
 * handler can read it without touching req.headers directly.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  // TODO Issue #9: validate session cookie / JWT from Google OAuth
  const userId = req.headers['x-user-id'];

  if (!userId || typeof userId !== 'string') {
    return next(new AppError('Unauthorized — provide x-user-id header (replaced by OAuth in Issue #9)', 401));
  }

  res.locals['userId'] = userId;
  next();
};
