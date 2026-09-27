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
  delayMs: number,
) {
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
        delayMs: data.delayMs,
        hourlyLimit: data.hourlyLimit,
        status: 'SCHEDULED',
      },
    });

    const emailRecords = buildEmailRecords(
      campaign.id,
      data.senderId,
      uniqueRecipients,
      data.subject,
      data.body,
      data.startAt,
      data.delayMs,
    );

    await tx.email.createMany({ data: emailRecords });

    // Issue #5 will add outbox events here in the same transaction block:
    // await tx.outboxEvent.createMany({ data: outboxRecords })

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
