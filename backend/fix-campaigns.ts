import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ['SCHEDULED', 'PROCESSING'] } },
    include: { emails: true }
  });

  let fixed = 0;
  for (const c of campaigns) {
    if (c.emails.length > 0 && c.emails.every(e => e.status === 'SENT' || e.status === 'FAILED')) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: 'COMPLETED' }
      });
      fixed++;
    }
  }
  console.log(`Fixed ${fixed} stuck campaigns`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
