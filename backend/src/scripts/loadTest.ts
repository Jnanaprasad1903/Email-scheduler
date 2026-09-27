import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting BullMQ & Dispatcher Load Test...');
  
  // 1. Create a dummy user and sender if they don't exist
  const user = await prisma.user.upsert({
    where: { email: 'loadtester@example.com' },
    update: {},
    create: {
      email: 'loadtester@example.com',
      name: 'Load Tester',
      password: 'password123',
    }
  });

  const sender = await prisma.sender.upsert({
    where: { 
      userId_email: { userId: user.id, email: 'noreply@loadtester.com' } 
    },
    update: {},
    create: {
      userId: user.id,
      email: 'noreply@loadtester.com',
      name: 'Load Test Sender'
    }
  });

  // 2. Setup load test parameters
  const TOTAL_EMAILS = 500;
  const BATCH_SIZE = 100;
  
  console.log(`📦 Generating a campaign with ${TOTAL_EMAILS} emails...`);

  // Create Campaign
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      senderId: sender.id,
      subject: `Load Test Campaign ${new Date().toISOString()}`,
      body: 'This is a load testing email injected directly to stress test the Outbox Dispatcher and BullMQ rate limiting.',
      startAt: new Date(),
      delayMs: 10, // Very small delay to stress queue
      hourlyLimit: 5000, // High limit so it doesn't block
      status: 'SCHEDULED'
    }
  });

  // 3. Batch insert the emails and outbox events
  let inserted = 0;
  for (let i = 0; i < TOTAL_EMAILS; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_EMAILS - i);
    
    await prisma.$transaction(async (tx) => {
      for (let j = 0; j < batchSize; j++) {
        const idx = i + j;
        const emailId = crypto.randomUUID();
        
        await tx.email.create({
          data: {
            id: emailId,
            campaignId: campaign.id,
            senderId: sender.id,
            recipient: `testuser${idx}@example.com`,
            subject: campaign.subject,
            body: campaign.body,
            scheduledAt: new Date(Date.now() + (idx * campaign.delayMs)),
            sequence: idx + 1,
            status: 'SCHEDULED'
          }
        });

        await tx.outboxEvent.create({
          data: {
            eventType: 'EMAIL_SCHEDULED',
            emailId: emailId,
            payload: {}, // Missing Json field
            status: 'PENDING',
            availableAt: new Date()
          }
        });
      }
    });

    inserted += batchSize;
    console.log(`✅ Inserted ${inserted} / ${TOTAL_EMAILS} emails and outbox events...`);
  }

  console.log('\n🔥 Load Test Setup Complete!');
  console.log('Check your backend console running `npm run dev`.');
  console.log('You should see the Outbox Dispatcher grabbing batches of 100 events, pushing them to BullMQ, and the Email Worker crunching through them!');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
