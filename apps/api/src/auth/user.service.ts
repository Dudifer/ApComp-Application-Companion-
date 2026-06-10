import { Injectable } from '@nestjs/common';
import { PrismaService } from '../modules/prisma/prisma.service';
import { createClerkClient } from '@clerk/backend';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUser(clerkId: string): Promise<string> {
    const existing = await this.prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });

    if (existing) return existing.id;

    // First time — fetch user info from Clerk and create in DB
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');

    const user = await this.prisma.user.create({
      data: {
        clerkId,
        email,
        name,
      },
    });

    return user.id;
  }
}
