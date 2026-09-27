import { redisConnection } from '../lib/redis.js';

export async function notifyRateLimitReached(
  slackWebhookUrl: string | null | undefined,
  senderEmail: string,
  campaignSubject: string,
  limit: number
) {
  if (!slackWebhookUrl) return;

  const cacheKey = `sender:${senderEmail}:slack_notified`;
  const alreadyNotified = await redisConnection.get(cacheKey);

  if (alreadyNotified) {
    return; // Prevent spamming Slack for every single rejected email
  }

  // Set flag to prevent further notifications for 1 hour
  await redisConnection.set(cacheKey, 'true', 'EX', 3600);

  const payload = {
    text: `⚠️ *Rate Limit Reached*\nSender *${senderEmail}* has hit the configured hourly limit of *${limit} emails* while sending campaign "${campaignSubject}".\n\nSubsequent emails have been automatically delayed and will resume when the next hour rolls over.`,
  };

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log(`[slack] Sent rate limit notification to Slack for sender ${senderEmail}`);
  } catch (err) {
    console.error(`[slack] Failed to send Slack notification for sender ${senderEmail}:`, err);
  }
}

export async function notifyCampaignCompleted(
  slackWebhookUrl: string | null | undefined,
  campaignId: string,
  campaignSubject: string
) {
  if (!slackWebhookUrl) return;

  const payload = {
    text: `✅ *Campaign Completed*\nYour campaign *"${campaignSubject}"* has finished sending all emails successfully!`,
  };

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log(`[slack] Sent completion notification to Slack for campaign ${campaignId}`);
  } catch (err) {
    console.error(`[slack] Failed to send Slack notification for campaign ${campaignId}:`, err);
  }
}
