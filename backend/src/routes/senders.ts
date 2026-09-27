import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { createSenderSchema } from '../lib/validators.js';
import { getSenders, createSender } from '../services/senderService.js';

export const senderRouter = Router();

/**
 * GET /api/senders
 * List all senders belonging to the authenticated user.
 */
senderRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const userId = res.locals['userId'] as string;
    const senders = await getSenders(userId);
    res.json(senders);
  }),
);

/**
 * POST /api/senders
 * Create a new sender identity for the authenticated user.
 * Body: { email: string, name?: string }
 */
senderRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = res.locals['userId'] as string;
    const body = createSenderSchema.parse(req.body);
    const sender = await createSender(userId, body);
    res.status(201).json(sender);
  }),
);
