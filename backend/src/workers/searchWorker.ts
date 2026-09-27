import { Worker, Job } from 'bullmq';
import { redisConnection } from '../lib/redis.js';
import { SearchJobData } from '../lib/queue.js';
import { prisma } from '../db/prisma.js';
import { esClient } from '../lib/elasticsearch.js';

export const searchWorker = new Worker<SearchJobData>(
  'search',
  async (job: Job<SearchJobData>) => {
    const { emailId } = job.data;

    // Fetch the email to index
    const email = await prisma.email.findUnique({
      where: { id: emailId },
    });

    if (!email) {
      console.warn(`[search-worker] Email ${emailId} not found, skipping index.`);
      return;
    }

    try {
      await esClient.index({
        index: 'emails',
        id: emailId, // Use the postgres ID as the Elasticsearch document ID
        document: {
          id: email.id,
          campaignId: email.campaignId,
          senderId: email.senderId,
          recipient: email.recipient,
          subject: email.subject,
          body: email.body,
          status: email.status,
          scheduledAt: email.scheduledAt.toISOString(),
          sentAt: email.sentAt ? email.sentAt.toISOString() : null,
        },
      });

      console.log(`[elasticsearch] Indexed email ${emailId}`);
    } catch (err) {
      console.error(`[search-worker] Failed to index emailId=${emailId}:`, err);
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

searchWorker.on('failed', (job, err) => {
  if (job) {
    console.error(`[search-worker] Job ${job.id} failed: ${err.message}`);
  }
});
