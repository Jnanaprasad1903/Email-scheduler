import { prisma } from '../db/prisma.js';
import { emailQueue, EmailJobData } from '../lib/queue.js';

const POLL_INTERVAL_MS = 5_000; // poll every 5 seconds
const BATCH_SIZE = 50;           // claim up to 50 events per poll

/**
 * Raw row returned by the SELECT FOR UPDATE SKIP LOCKED query.
 * We only need the IDs here — the email's scheduledAt is fetched separately.
 */
interface OutboxRow {
  id: string;
  emailId: string;
}

/**
 * Claim a batch of PENDING outbox events and enqueue them to BullMQ.
 *
 * Locking strategy:
 *   SELECT ... FOR UPDATE SKIP LOCKED
 *
 * This is a PostgreSQL row-level lock. If two dispatcher instances run
 * concurrently, each one sees a different set of rows — they never process
 * the same event twice. Rows already held by another transaction are
 * skipped, not blocked.
 *
 * After claiming, we:
 *   1. Enqueue a BullMQ delayed job (delay = scheduledAt - now())
 *   2. Mark the event as PROCESSED
 *
 * If step 2 fails, the event stays in PROCESSING and is picked up by the
 * restart recovery on the next process start.
 */
async function dispatchBatch(): Promise<void> {
  const claimed = await prisma.$transaction(async (tx) => {
    // Claim events with a row-level lock — SKIP LOCKED means concurrent
    // dispatchers get different rows rather than waiting for each other.
    const rows = await tx.$queryRaw<OutboxRow[]>`
      SELECT id, "emailId"
      FROM outbox_events
      WHERE status = 'PENDING'
        AND "availableAt" <= now()
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    if (rows.length === 0) return [];

    // Move claimed rows to PROCESSING so other dispatchers skip them
    await tx.outboxEvent.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'PROCESSING' },
    });

    return rows;
  });

  if (claimed.length === 0) return;

  console.log(`[outbox] Claimed ${claimed.length} event(s)`);

  for (const event of claimed) {
    try {
      // Fetch the email's scheduledAt to compute the BullMQ job delay
      const email = await prisma.email.findUnique({
        where: { id: event.emailId },
        select: { scheduledAt: true },
      });

      if (!email) {
        // Email was deleted — mark the outbox event as FAILED and continue
        await prisma.outboxEvent.update({
          where: { id: event.id },
          data: { status: 'FAILED', lastError: 'Email record not found' },
        });
        continue;
      }

      // delay = how many ms until the email's scheduled send time
      // Math.max(0) → if the scheduled time is in the past, send immediately
      const delay = Math.max(0, email.scheduledAt.getTime() - Date.now());

      const jobData: EmailJobData = {
        emailId: event.emailId,
        outboxEventId: event.id,
      };

      // jobId = emailId deduplicates jobs so re-dispatching the same outbox
      // event doesn't create multiple BullMQ jobs for the same email
      await emailQueue.add('send-email', jobData, {
        delay,
        jobId: event.emailId,
      });

      // Mark as PROCESSED — the BullMQ job now owns the delivery
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });

      console.log(
        `[outbox] Enqueued emailId=${event.emailId} delay=${delay}ms`,
      );
    } catch (err) {
      // Record the error but continue processing other events in the batch
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[outbox] Failed to enqueue emailId=${event.emailId}:`, message);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', lastError: message },
      }).catch(() => {/* ignore secondary error */});
    }
  }
}

/**
 * Recover events that were left in PROCESSING state by a previous
 * dispatcher crash. We reset them to PENDING so the next poll picks them up.
 *
 * This is safe because the BullMQ worker checks email status before sending
 * and skips emails that are already in SENT state (idempotency).
 */
async function recoverStuckEvents(): Promise<void> {
  const { count } = await prisma.outboxEvent.updateMany({
    where: { status: 'PROCESSING' },
    data: { status: 'PENDING' },
  });

  if (count > 0) {
    console.log(`[outbox] Recovered ${count} stuck PROCESSING event(s)`);
  }
}

/**
 * Polling loop — runs continuously until the process exits.
 *
 * Uses recursive setTimeout (not setInterval) so a slow poll cycle doesn't
 * overlap with the next one. The interval starts after the previous poll
 * completes, not at a fixed wall-clock interval.
 */
function scheduleNextPoll(): void {
  setTimeout(async () => {
    try {
      await dispatchBatch();
    } catch (err) {
      console.error('[outbox] Unexpected poll error:', err);
    } finally {
      scheduleNextPoll();
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Start the outbox dispatcher.
 * Call once at application startup (server.ts).
 */
export async function startOutboxDispatcher(): Promise<void> {
  console.log('[outbox] Starting dispatcher...');
  await recoverStuckEvents();
  // Run first poll immediately, then continue on interval
  await dispatchBatch().catch((err) =>
    console.error('[outbox] Initial poll error:', err),
  );
  scheduleNextPoll();
  console.log(`[outbox] Dispatcher running (poll interval: ${POLL_INTERVAL_MS}ms)`);
}
