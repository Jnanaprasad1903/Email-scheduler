import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db/prisma.js';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';

export const slackRouter = Router();

// 1. Initiate Slack OAuth
slackRouter.get('/connect', requireAuth, (req, res) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('SLACK_CLIENT_ID is not configured');
  }

  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const redirectUri = `${backendUrl}/api/slack/callback`;
  
  // Use state to pass the user ID so we know who to update
  const state = res.locals.user.id;

  const slackAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
  slackAuthUrl.searchParams.append('client_id', clientId);
  slackAuthUrl.searchParams.append('scope', 'incoming-webhook');
  slackAuthUrl.searchParams.append('redirect_uri', redirectUri);
  slackAuthUrl.searchParams.append('state', state);

  res.redirect(slackAuthUrl.toString());
});

// 2. Slack OAuth Callback
slackRouter.get('/callback', asyncHandler(async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // This is the user ID

  if (!code || !state) {
    res.status(400).send('Missing code or state');
    return;
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const redirectUri = `${backendUrl}/api/slack/callback`;

  // Exchange code for webhook URL
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId || '',
      client_secret: clientSecret || '',
      code,
      redirect_uri: redirectUri,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error('Slack OAuth Error:', data);
    res.status(400).send(`Slack OAuth Error: ${data.error}`);
    return;
  }

  // data.incoming_webhook.url contains the webhook URL
  const webhookUrl = data.incoming_webhook?.url;
  const teamName = data.team?.name;

  if (webhookUrl) {
    // Update the user using a raw query to bypass any Prisma client type issues
    await prisma.$executeRaw`
      UPDATE users 
      SET "slackWebhookUrl" = ${webhookUrl}, "slackTeamName" = ${teamName}
      WHERE id = ${state}::uuid
    `;
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  res.redirect(`${frontendUrl}/dashboard?slack=connected`);
}));

// 3. Disconnect Slack
slackRouter.post('/disconnect', requireAuth, asyncHandler(async (req, res) => {
  const userId = res.locals.user.id;

  await prisma.$executeRaw`
    UPDATE users 
    SET "slackWebhookUrl" = null, "slackTeamName" = null
    WHERE id = ${userId}::uuid
  `;

  res.json({ success: true });
}));
