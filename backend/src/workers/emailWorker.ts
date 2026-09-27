import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { EmailJobData } from '../lib/queue.js';
import { prisma } from '../db/prisma.js';
import { sendEmail } from '../lib/mailer.js';
import { checkRateLimit } from '../services/rateLimiter.js';

export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    const { emailId } = job.data;
    
    // 1. Idempotent Atomic Lock: Transition from SCHEDULED to PROCESSING.
    // If the email is already in SENT, FAILED, CANCELLED, or PROCESSING,
    // this updateMany will affect 0 rows, and we can safely skip.
    const lockResult = await prisma.email.updateMany({
      where: { id: emailId, status: 'SCHEDULED' },
      data: { status: 'PROCESSING' },
    });

    if (lockResult.count === 0) {
      console.log(`[worker] Email ${emailId} is not SCHEDULED, skipping.`);
      return;
    }

    // 2. Fetch full email details for sending
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: { 
        campaign: { select: { hourlyLimit: true } },
        sender: { select: { email: true, name: true } }
      },
    });

    if (!email) {
      console.warn(`[worker] Email ${emailId} record deleted after lock.`);
      return;
    }

    // 3. Rate Limit Check (Issue #9)
    const allowed = await checkRateLimit(email.campaignId, email.id, email.campaign.hourlyLimit);
    if (!allowed) {
      // Revert to SCHEDULED and throw to retry later
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'SCHEDULED' },
      });
      // Throwing triggers BullMQ's exponential backoff, delaying the retry.
      throw new Error(`Rate limit exceeded for campaign ${email.campaignId}`);
    }

    // 4. Attempt Ethereal SMTP Delivery
    try {
      await sendEmail(
        email.recipient, 
        email.subject, 
        email.body, 
        email.sender.email, 
        email.sender.name || ''
      );

      // 5. Update status to SENT
      await prisma.email.update({
        where: { id: emailId },
        data: { 
          status: 'SENT', 
          sentAt: new Date(),
          attemptCount: { increment: 1 } 
        },
      });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] Delivery failed for emailId=${emailId}: ${errorMsg}`);

      // Revert to SCHEDULED so it can be picked up by the next retry,
      // and log the error and attempt count.
      await prisma.email.update({
        where: { id: emailId },
        data: { 
          status: 'SCHEDULED', 
          lastError: errorMsg, 
          attemptCount: { increment: 1 } 
        },
      });

      // Re-throw so BullMQ registers a job failure and triggers retry backoff
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: Number(process.env['WORKER_CONCURRENCY'] ?? 5),
  }
);

emailWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`[worker] Job ${job.id} failed: ${err.message}`);
  }
});

