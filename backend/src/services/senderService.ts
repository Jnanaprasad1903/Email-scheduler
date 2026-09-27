import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { AppError } from '../lib/AppError.js';
import { CreateSenderRequest } from '../lib/validators.js';

export async function getSenders(userId: string) {
  return prisma.sender.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createSender(userId: string, data: CreateSenderRequest) {
  try {
    return await prisma.sender.create({
      data: {
        userId,
        email: data.email,
        name: data.name,
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation → (userId, email) already exists
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new AppError(
        'A sender with this email already exists for your account',
        409,
      );
    }
    throw err;
  }
}
