import { Router } from 'express';
import { campaignRouter } from './campaigns.js';
import { senderRouter } from './senders.js';
import { emailRouter } from './emails.js';

export const router = Router();

// Health check — useful for Docker/load balancer probes
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/campaigns', campaignRouter);
router.use('/senders', senderRouter);
router.use('/emails', emailRouter);
