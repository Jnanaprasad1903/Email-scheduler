import { prisma } from './src/db/prisma.js';

async function main() {
  const users = await prisma.user.findMany({ include: { senders: true } });
  for (const user of users) {
    if (user.senders.length === 0) {
      await prisma.sender.create({ data: { userId: user.id, email: user.email, name: user.name } });
      console.log(`Created sender for ${user.email}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
