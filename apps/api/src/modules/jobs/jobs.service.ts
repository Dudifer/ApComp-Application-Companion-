import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Job, DismissedJob, CvProfile, CapturedJobInput } from '@apcomp/types';
import { OpenJobDataProvider } from './providers/openjobdata.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { JobCacheService } from './job-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../../auth/user.service';

// Fallback title keywords when no CV profile exists
const FALLBACK_QUERIES = ['software engineer', 'software developer', 'full stack developer'];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly openJobData: OpenJobDataProvider,
    private readonly aiFilter: AiFilterService,
    private readonly enrichment: CompanyEnrichmentService,
    private readonly jobCache: JobCacheService,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  // ── Recommended jobs (served from cache) ────────────────────────────────

  async getRecommendedJobs(userId: string): Promise<Job[]> {
    userId = await this.userService.ensureUser(userId);

    const saved = await this.prisma.savedJob.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
    });

    if (saved.length > 0) {
      this.logger.log(`Returning ${saved.length} cached jobs from DB`);
      return saved.map(s => s.jobData as unknown as Job);
    }

    const diskCached = this.jobCache.loadRawJobs(userId);
    if (diskCached) {
      this.logger.log(`Returning ${diskCached.length} jobs from disk cache`);
      await this.saveJobsToDB(userId, diskCached).catch(err =>
        this.logger.warn('Could not save disk cache to DB:', err),
      );
      return diskCached;
    }

    // No cache — jobs are populated on CV upload or manual refresh.
    return [];
  }

  // ── Manual search ────────────────────────────────────────────────────────

  async searchJobs(
    userId: string,
    params: { title: string; skills?: string; location?: string; remote?: boolean },
  ): Promise<Job[]> {
    userId = await this.userService.ensureUser(userId);

    const skillsPart = params.skills ? ` ${params.skills.split(',')[0].trim()}` : '';
    const query = `${params.title}${skillsPart}`;

    this.logger.log(`Manual search: "${query}"`);

    const profile = await this.getCvProfile(userId);
    const raw = await this.openJobData.fetchJobs([query], 7);

    this.logger.log(`OpenJobData returned ${raw.length} jobs`);
    this.jobCache.saveRawJobs(userId, raw);

    const enriched = await this.enrichment.enrichJobs(raw);
    const dismissals = await this.getDismissals(userId);
    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals, profile);

    this.logger.log(`${filtered.length} jobs after filtering`);
    this.jobCache.saveRawJobs(userId, filtered);
    await this.saveJobsToDB(userId, filtered);
    this.jobCache.clearCache(userId);

    return filtered;
  }

  // ── Initial fetch (CV upload or explicit refresh) ────────────────────────

  async refreshJobs(userId: string): Promise<Job[]> {
    userId = await this.userService.ensureUser(userId);
    await this.prisma.savedJob.deleteMany({ where: { userId, source: 'openjobdata' } });
    this.jobCache.clearCache(userId);
    return this.fetchAndProcess(userId, 7);
  }

  // ── Daily delta cron — midnight every day ────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async dailyDeltaRefresh() {
    this.logger.log('Daily delta refresh started');

    // Find all users with a CV profile (they've onboarded and want recommendations)
    const profiles = await this.prisma.cvProfile.findMany({
      where: { isComplete: true },
      select: { userId: true },
    });

    this.logger.log(`Running daily refresh for ${profiles.length} users`);

    for (const { userId } of profiles) {
      try {
        await this.fetchAndProcess(userId, 1);
      } catch (err) {
        this.logger.warn(`Daily refresh failed for user ${userId}:`, err);
      }
    }
  }

  // ── Job capture (Chrome extension) ──────────────────────────────────────

  async captureJob(userId: string, input: CapturedJobInput): Promise<Job> {
    userId = await this.userService.ensureUser(userId);
    if (!input?.title?.trim() || !input?.company?.trim() || !input?.url?.trim()) {
      throw new BadRequestException('title, company, and url are required');
    }

    const externalId = createHash('sha1').update(input.url).digest('hex').slice(0, 16);
    const now = new Date();
    const isRemote =
      input.remote ?? /remote/i.test((input.location ?? '') + ' ' + (input.title ?? ''));

    let companyWebsite: string | undefined;
    try {
      const u = new URL(input.url);
      companyWebsite = `${u.protocol}//${u.hostname}`;
    } catch {
      companyWebsite = undefined;
    }

    const job: Job = {
      id: `manual-${externalId}`,
      externalId,
      source: 'manual',
      title: input.title.trim(),
      company: input.company.trim(),
      companyLogo: input.companyLogo,
      companyWebsite,
      location: {
        displayName: input.location?.trim() || (isRemote ? 'Remote' : 'Unknown'),
      },
      remote: isRemote,
      description: input.description?.trim() ?? '',
      tags: input.tags?.filter(Boolean) ?? [],
      url: input.url,
      applyOptions: [{ publisher: input.sourceHost ?? 'Captured', url: input.url, isDirect: true }],
      applyIsDirect: true,
      contractTime: 'unknown',
      contractType: 'unknown',
      employmentType: input.employmentType,
      publisher: input.sourceHost ?? 'manual',
      salary: input.salaryMin || input.salaryMax
        ? {
            min: input.salaryMin,
            max: input.salaryMax,
            currency: input.salaryCurrency ?? 'USD',
            period: input.salaryPeriod,
          }
        : undefined,
      postedAt: input.postedAt ?? now.toISOString(),
      relevanceScore: 100,
      status: 'saved',
    };

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await this.prisma.savedJob.upsert({
      where: { userId_externalId_source: { userId, externalId, source: 'manual' } },
      update: { jobData: job as any, fetchedAt: now, expiresAt },
      create: { userId, externalId, source: 'manual', jobData: job as any, expiresAt },
    });

    this.logger.log(`Captured "${job.title}" @ ${job.company} from ${input.sourceHost ?? 'unknown'}`);
    return job;
  }

  // ── Dismiss / weights ────────────────────────────────────────────────────

  async dismissJob(
    userId: string,
    jobId: string,
    source: string,
    company: string,
    title: string,
    reason?: string,
  ) {
    userId = await this.userService.ensureUser(userId);
    await this.prisma.dismissedJob.create({
      data: { userId, jobId, source, company, title, reason },
    });
    await this.prisma.savedJob.deleteMany({ where: { userId, externalId: jobId, source } });
    return { success: true };
  }

  // Kept for API compatibility — with a single source weights are always equal
  async getWeights(userId: string) {
    return { adzuna: 0.5, jsearch: 0.5 };
  }

  async getCacheInfo(userId: string) {
    userId = await this.userService.ensureUser(userId);
    return this.jobCache.getCacheInfo(userId);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private async fetchAndProcess(userId: string, daysBack: number): Promise<Job[]> {
    const profile = await this.getCvProfile(userId);
    const queries = this.buildSearchQueries(profile);

    this.logger.log(`Fetching OpenJobData for "${queries.join(', ')}" (${daysBack} day delta)`);

    const raw = await this.openJobData.fetchJobs(queries, daysBack);
    this.logger.log(`OpenJobData returned ${raw.length} jobs`);

    if (!raw.length) return [];

    this.jobCache.saveRawJobs(userId, raw);

    const enriched = await this.enrichment.enrichJobs(raw);
    this.jobCache.saveRawJobs(userId, enriched);

    const dismissals = await this.getDismissals(userId);
    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals, profile);

    this.logger.log(`${filtered.length} jobs after AI filtering`);
    this.jobCache.saveRawJobs(userId, filtered);
    await this.saveJobsToDB(userId, filtered);
    this.jobCache.clearCache(userId);

    return filtered;
  }

  private async saveJobsToDB(userId: string, jobs: Job[]): Promise<void> {
    if (!jobs.length) return;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(
      jobs.map(job =>
        this.prisma.savedJob.upsert({
          where: { userId_externalId_source: { userId, externalId: job.externalId, source: job.source } },
          update: { jobData: job as any, expiresAt, fetchedAt: new Date() },
          create: { userId, externalId: job.externalId, source: job.source, jobData: job as any, expiresAt },
        }),
      ),
    );
    this.logger.log(`Saved ${jobs.length} jobs to DB`);
  }

  private async getCvProfile(userId: string): Promise<CvProfile | null> {
    try {
      const row = await this.prisma.cvProfile.findUnique({ where: { userId } });
      if (!row) return null;
      return {
        name: row.name ?? undefined,
        email: row.email ?? undefined,
        rawText: row.rawText ?? undefined,
        roles: row.roles as CvProfile['roles'],
        skills: row.skills as CvProfile['skills'],
        practices: row.practices as string[],
        gapQuestions: row.gapQuestions as CvProfile['gapQuestions'],
        isComplete: row.isComplete,
      };
    } catch {
      return null;
    }
  }

  private buildSearchQueries(profile: CvProfile | null): string[] {
    if (!profile?.roles?.length) return FALLBACK_QUERIES;

    const recentTitles = profile.roles
      .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
      .slice(0, 2)
      .map(r => r.title.toLowerCase());

    const topSkill = profile.skills
      ?.sort((a, b) => b.monthsExperience - a.monthsExperience)
      .slice(0, 1)
      .map(s => `${s.name} developer`);

    return [...new Set([...recentTitles, ...(topSkill ?? [])])].slice(0, 3);
  }

  private async getDismissals(userId: string): Promise<DismissedJob[]> {
    const rows = await this.prisma.dismissedJob.findMany({
      where: { userId },
      orderBy: { dismissedAt: 'desc' },
      take: 50,
    });
    return rows.map(r => ({
      jobId: r.jobId,
      source: r.source as DismissedJob['source'],
      company: r.company,
      title: r.title,
      reason: r.reason ?? undefined,
      dismissedAt: r.dismissedAt.toISOString(),
    }));
  }

  private deduplicate(jobs: Job[]): Job[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      const key = `${job.company?.toLowerCase()}-${job.title?.toLowerCase().slice(0, 20)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
