import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/AppError.js';
import { ScheduleRequest } from '../lib/validators.js';

// ---------------------------------------------------------------------------
// scheduledAt calculation
//
// Strategy: startAt + (index × delayMs)
//
//   email[0] → startAt + 0ms   (first send)
//   email[1] → startAt + 1×delayMs
//   email[2] → startAt + 2×delayMs
//   ...
//
// This is the INTENDED schedule. The worker + Redis rate-limiter is the
// final authority and will reschedule a job into the next available window
// when the hourly limit is reached. We do not try to account for the
// hourly limit here because:
//   1. The worker enforces it atomically across all concurrent workers.
//   2. Calculating it here would duplicate that logic and be inaccurate
//      when multiple processes are running simultaneously.
// ---------------------------------------------------------------------------
function buildEmailRecords(
  campaignId: string,
  senderId: string,
  recipients: string[],
  subject: string,
  body: string,
  startAt: Date,
  _ignoredDelayMs: number,
) {
  const delayMs = Number(process.env['EMAIL_DELAY_SECONDS'] ?? 10) * 1000;
  return recipients.map((recipient, index) => ({
    campaignId,
    senderId,
    recipient,
    subject,
    body,
    sequence: index + 1,
    scheduledAt: new Date(startAt.getTime() + index * delayMs),
  }));
}

// ---------------------------------------------------------------------------
// Create campaign + email records in one atomic transaction.
//
// Issue #5 will extend this same transaction to also insert OutboxEvent rows
// so the outbox bridge is written atomically with the emails.
// ---------------------------------------------------------------------------
export async function scheduleCampaign(userId: string, data: ScheduleRequest) {
  // Verify sender belongs to this user before creating anything
  const sender = await prisma.sender.findUnique({
    where: { id: data.senderId },
    select: { id: true, userId: true },
  });

  if (!sender || sender.userId !== userId) {
    throw new AppError('Sender not found', 404);
  }

  // Deduplicate recipients — silently remove duplicates
  const uniqueRecipients = [...new Set(data.recipients)];

  const result = await prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        userId,
        senderId: data.senderId,
        subject: data.subject,
        body: data.body,
        startAt: data.startAt,
        delayMs: Number(process.env['EMAIL_DELAY_SECONDS'] ?? 10) * 1000,
        hourlyLimit: Number(process.env['MAX_EMAILS_PER_HOUR'] ?? 50),
        attachments: data.attachments ? (data.attachments as any) : null,
        status: 'SCHEDULED',
      } as any,
    });

    const emailRecords = buildEmailRecords(
      campaign.id,
      data.senderId,
      uniqueRecipients,
      data.subject,
      data.body,
      data.startAt,
      data.delayMs ?? (Number(process.env['EMAIL_DELAY_SECONDS'] ?? 5) * 1000)
    );

    // Pre-assign UUIDs to email records so outbox events can reference
    // the email IDs within the same transaction. createMany() does not
    // return the created rows, so we must generate IDs before inserting.
    const emailsWithIds = emailRecords.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
    }));

    await tx.email.createMany({ data: emailsWithIds });

    // Write one OutboxEvent per email in the SAME transaction.
    // If this transaction commits, both the emails and their outbox events
    // exist. If it rolls back, neither exists. This is the transactional
    // outbox guarantee — no email can be scheduled without a corresponding
    // event for the dispatcher to pick up.
    await tx.outboxEvent.createMany({
      data: emailsWithIds.map((email) => ({
        emailId: email.id,
        eventType: 'EMAIL_SCHEDULED' as const,
        payload: {},
        status: 'PENDING' as const,
      })),
    });

    return {
      campaignId: campaign.id,
      emailCount: emailRecords.length,
      status: campaign.status,
      firstScheduledAt: emailRecords[0]?.scheduledAt,
      lastScheduledAt: emailRecords[emailRecords.length - 1]?.scheduledAt,
    };
  });

  return result;
}

export async function getCampaigns(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { email: true, name: true } },
      _count: { select: { emails: true } },
    },
  });
}

export async function getCampaign(userId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      sender: { select: { email: true, name: true } },
      emails: { orderBy: { sequence: 'asc' } },
    },
  });

  if (!campaign) {
    throw new AppError('Campaign not found', 404);
  }

  return campaign;
}
