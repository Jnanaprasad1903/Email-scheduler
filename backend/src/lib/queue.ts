import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

/**
 * The single BullMQ queue used for all email delivery jobs.
 *
 * One queue, one responsibility — each job carries an emailId and
 * outboxEventId so the worker can look up state and update the outbox
 * after delivery.
 */
export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5_000, // 5s → 10s → 20s
    },
    removeOnComplete: { count: 1000 }, // keep last 1000 completed jobs for inspection
    removeOnFail: { count: 500 },
  },
});

/** Shape of data carried by every email delivery job. */
export interface EmailJobData {
  emailId: string;
  outboxEventId: string;
}

/** Queue for background Elasticsearch indexing */
export const searchQueue = new Queue('search', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export interface SearchJobData {
  emailId: string;
}
