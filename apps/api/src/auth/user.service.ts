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
    else { // check if we were sent id instead of clerkID (this doesn't happen so far as i can tell)
      const exists = await this.prisma.user.findUnique({
        where: { id: clerkId },
        select: { id: true },
      });

      if (exists) return exists.id;
    }

    // fetch user info from Clerk and create in DB if info doesn't already exist.
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
    const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');

    const user = await this.prisma.user.upsert({
      where: { email },
      update: { clerkId },
      create: { clerkId, email, name },
    });

    return user.id;
  }
}
