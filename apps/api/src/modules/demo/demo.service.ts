import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEMO_CLERK_ID, DEMO_EMAIL, DEMO_NAME } from './demo.constants';
import { DEMO_CV_PROFILE, buildDemoJobs, buildDemoApplications } from './demo-seed-data';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resets the shared demo account back to a clean, canned state and returns
   * its DB id. Called every time someone clicks "Demo" on the landing page —
   * cheap (a handful of deletes/inserts, no Anthropic/Adzuna/Gmail calls) so
   * it's safe to run on every visit and gives each visitor a fresh-looking
   * dashboard regardless of what a previous visitor did to it.
   */
  async resetAndSeed(): Promise<{ success: true }> {
    const user = await this.prisma.user.upsert({
      where: { clerkId: DEMO_CLERK_ID },
      update: {},
      create: { clerkId: DEMO_CLERK_ID, email: DEMO_EMAIL, name: DEMO_NAME },
    });
    const userId = user.id;

    // Clear out anything a previous visitor did — applications they
    // dismissed, jobs they saved/dismissed, interaction history, etc.
    await Promise.all([
      this.prisma.application.deleteMany({ where: { userId } }),
      this.prisma.savedJob.deleteMany({ where: { userId } }),
      this.prisma.dismissedJob.deleteMany({ where: { userId } }),
      this.prisma.jobInteraction.deleteMany({ where: { userId } }),
      this.prisma.recLab2Interaction.deleteMany({ where: { userId } }),
    ]);

    // The CV profile is expensive to (re)produce and never mutated by normal
    // demo interactions, so it's idempotent rather than reset every time —
    // it only changes if a visitor uploads their own resume mid-session,
    // which the next reset will overwrite anyway.
    const profile = DEMO_CV_PROFILE;
    await this.prisma.cvProfile.upsert({
      where: { userId },
      update: {
        name: profile.name,
        email: profile.email,
        rawText: profile.rawText,
        roles: profile.roles as any,
        skills: profile.skills as any,
        practices: profile.practices as any,
        projects: (profile.projects ?? []) as any,
        education: (profile.education ?? []) as any,
        gapQuestions: profile.gapQuestions as any,
        isComplete: profile.isComplete,
      },
      create: {
        userId,
        name: profile.name,
        email: profile.email,
        rawText: profile.rawText,
        roles: profile.roles as any,
        skills: profile.skills as any,
        practices: profile.practices as any,
        projects: (profile.projects ?? []) as any,
        education: (profile.education ?? []) as any,
        gapQuestions: profile.gapQuestions as any,
        isComplete: profile.isComplete,
      },
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ONE_YEAR_MS);

    const jobs = buildDemoJobs(now);
    await this.prisma.savedJob.createMany({
      data: jobs.map(job => ({
        userId,
        externalId: job.externalId,
        source: 'manual',
        jobData: job as any,
        fetchedAt: now,
        expiresAt,
      })),
    });

    const applications = buildDemoApplications(now);
    await this.prisma.application.createMany({
      data: applications.map(app => ({ userId, ...app })),
    });

    this.logger.log('Demo account reset and reseeded');
    return { success: true };
  }
}
