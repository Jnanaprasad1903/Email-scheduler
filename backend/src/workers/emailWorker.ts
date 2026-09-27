import { Worker, Job, DelayedError } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { EmailJobData, searchQueue } from '../lib/queue.js';
import { prisma } from '../db/prisma.js';
import { sendEmail } from '../lib/mailer.js';
import { checkRateLimit } from '../services/rateLimiter.js';

export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    const { emailId } = job.data;
    
    // 1. Idempotent Atomic Lock: Transition from SCHEDULED to PROCESSING.
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
    const rateLimit = await checkRateLimit(email.campaignId, email.id, email.campaign.hourlyLimit);
    if (!rateLimit.allowed) {
      // Revert to SCHEDULED since we haven't sent it yet
      await prisma.email.update({
        where: { id: emailId },
        data: { status: 'SCHEDULED' },
      });
      
      console.log(`[worker] Rate limit hit for campaign ${email.campaignId}. Rescheduling to ${new Date(rateLimit.nextAvailableTime).toISOString()}`);
      
      // Move the job to the delayed queue exactly until the next slot opens up
      await job.moveToDelayed(rateLimit.nextAvailableTime, job.token as string);
      
      // Tell BullMQ to halt processing for this job without failing it
      throw new DelayedError();
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

      await searchQueue.add('index-email', { emailId }, { jobId: `search-sent-${emailId}` });

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

