import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis('redis://:reachinbox@localhost:6379');
const q = new Queue('email', { connection });

async function main() {
  const delayed = await q.getDelayed();
  console.log('Delayed jobs:', delayed.length);
  const active = await q.getActive();
  console.log('Active jobs:', active.length);
  const waiting = await q.getWaiting();
  console.log('Waiting jobs:', waiting.length);

  if (delayed.length > 0) {
    console.log('Sample delayed job:', delayed[0].id, new Date(delayed[0].timestamp + delayed[0].delay));
  }
}

main().finally(() => process.exit(0));
