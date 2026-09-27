import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis('redis://:reachinbox@localhost:6379');
const q = new Queue('email', { connection });

async function clean() {
  console.log('Cleaning stuck jobs...');
  try {
    const activeJobs = await q.getActive();
    console.log(`Found ${activeJobs.length} active jobs.`);
    let cleared = 0;
    for (const job of activeJobs) {
      try {
        await job.moveToFailed(new Error('Manually clearing stuck ghost job'), 'maintenance');
        cleared++;
      } catch (e) {
        console.error('Failed to move job:', job.id, e.message);
      }
    }
    console.log(`Cleared ${cleared} active jobs.`);
  } catch (e) {
    console.error('Error:', e);
  }
}

clean().finally(() => process.exit(0));
