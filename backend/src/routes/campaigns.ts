import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { scheduleRequestSchema } from '../lib/validators.js';
import {
  scheduleCampaign,
  getCampaigns,
  getCampaign,
} from '../services/campaignService.js';

export const campaignRouter = Router();

/**
 * POST /api/campaigns/schedule
 *
 * Create a campaign and its individual email records in one transaction.
 *
 * Body:
 *   senderId    — UUID of the sender identity to use
 *   recipients  — array of email addresses (max 10,000)
 *   subject     — email subject line
 *   body        — email body (plain text or HTML)
 *   startAt     — ISO 8601 datetime for the first send
 *   delayMs     — milliseconds between consecutive sends (0 = no delay)
 *   hourlyLimit — max emails per hour (enforced by the rate-limiter worker)
 *
 * Response 201:
 *   campaignId, emailCount, status, firstScheduledAt, lastScheduledAt
 */
campaignRouter.post(
  '/schedule',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = res.locals['userId'] as string;
    const body = scheduleRequestSchema.parse(req.body);
    const result = await scheduleCampaign(userId, body);
    res.status(201).json(result);
  }),
);

/**
 * GET /api/campaigns
 * List all campaigns for the authenticated user (newest first).
 * Includes sender info and email count.
 */
campaignRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const userId = res.locals['userId'] as string;
    const campaigns = await getCampaigns(userId);
    res.json(campaigns);
  }),
);

/**
 * GET /api/campaigns/:id
 * Get a single campaign with all its email records (ordered by sequence).
 */
campaignRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = res.locals['userId'] as string;
    const campaign = await getCampaign(userId, req.params['id'] as string);
    res.json(campaign);
  }),
);
