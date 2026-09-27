import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const connection = new IORedis('redis://:reachinbox@localhost:6379');
const emailQueue = new Queue('email', { connection });
const searchQueue = new Queue('search', { connection });

async function reset() {
  console.log('Clearing BullMQ queues...');
  await emailQueue.obliterate({ force: true });
  await searchQueue.obliterate({ force: true });
  console.log('Queues cleared.');

  console.log('Clearing database records...');
  // Delete all campaigns, emails, and outbox events
  await prisma.outboxEvent.deleteMany({});
  await prisma.email.deleteMany({});
  await prisma.campaign.deleteMany({});
  console.log('Database cleared.');
}

reset()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
