import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Job, DismissedJob, JobFeedWeights, CapturedJobInput } from '@apcomp/types';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { JobCacheService } from './job-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CvProfile } from '@apcomp/types';
import { UserService } from '../../auth/user.service';

// const DEV_USER_ID = 'dev-user';

// Fallback queries if no CV profile exists yet
const FALLBACK_QUERIES = ['software engineer', 'software developer', 'full stack developer'];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly adzuna: AdzunaProvider,
    private readonly jsearch: JSearchProvider,
    private readonly aiFilter: AiFilterService,
    private readonly enrichment: CompanyEnrichmentService,
    private readonly jobCache: JobCacheService,
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  // private async ensureDevUser() {
  //   return this.prisma.user.upsert({
  //     where: { id: DEV_USER_ID },
  //     update: {},
  //     create: {
  //       id: DEV_USER_ID,
  //       email: process.env.DEV_USER_EMAIL ?? 'dev@apcomp.local',
  //       name: 'Dev User',
  //     },
  //   });
  // }

  private async getCvProfile(userId: string): Promise<CvProfile | null> {
    userId = await this.userService.ensureUser(userId);
    try {
      const row = await this.prisma.cvProfile.findUnique({
        where: { userId },
      });
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

    const queries: string[] = [];

    const recentTitles = profile.roles
      .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
      .slice(0, 2)
      .map(r => r.title.toLowerCase());

    queries.push(...recentTitles);

    const topSkills = profile.skills
      ?.sort((a, b) => b.monthsExperience - a.monthsExperience)
      .slice(0, 3)
      .map(s => s.name);

    if (topSkills?.length) {
      queries.push(`${topSkills[0]} developer`);
    }

    return [...new Set(queries)].slice(0, 3);
  }

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
        this.logger.warn('Could not save disk cache to DB:', err)
      );
      return diskCached;
    }

    return this.fetchAndProcess(userId);
  }

  async searchJobs(userId: string, params: {
    title: string;
    skills?: string;
    location?: string;
    remote?: boolean;
  }): Promise<Job[]> {
    // await this.ensureDevUser();
    userId = await this.userService.ensureUser(userId);

    const skillsPart = params.skills ? ` ${params.skills.split(',')[0].trim()}` : '';
    const query = `${params.title}${skillsPart}`;
    const locationSuffix = params.location ? ` in ${params.location}` : ' in United States';

    this.logger.log(`Searching: "${query}"${locationSuffix}`);

    const profile = await this.getCvProfile(userId);
    const weights = await this.getWeights(userId);
    const adzunaCount = Math.round(20 * weights.adzuna * 2);
    const jsearchCount = Math.round(2 * weights.jsearch * 2);

    const [adzunaJobs, jsearchJobs] = await Promise.all([
      this.adzuna.fetchJobs(query, adzunaCount),
      this.jsearch.fetchJobs(query + locationSuffix, jsearchCount),
    ]);

    this.logger.log(`Fetched ${adzunaJobs.length} Adzuna + ${jsearchJobs.length} JSearch`);

    const combined = this.deduplicate([...adzunaJobs, ...jsearchJobs]);
    this.jobCache.saveRawJobs(userId, combined);

    const enriched = await this.enrichment.enrichJobs(combined);
    this.jobCache.saveRawJobs(userId, enriched);

    const dismissals = await this.getDismissals(userId);
    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals, profile);

    this.logger.log(`${filtered.length} jobs after filtering`);

    this.jobCache.saveRawJobs(userId, filtered);

    await this.saveJobsToDB(userId, filtered);
    this.jobCache.clearCache(userId);

    return filtered;
  }

  /**
   * Capture a job from the Chrome extension. Normalizes the payload into a Job
   * and saves it as a SavedJob so it shows up in /jobs/recommended.
   */
  async captureJob(userId: string, input: CapturedJobInput): Promise<Job> {
    userId = await this.userService.ensureUser(userId);
    if (!input?.title?.trim() || !input?.company?.trim() || !input?.url?.trim()) {
      throw new BadRequestException('title, company, and url are required');
    }

    // Stable id from the URL so re-capturing the same page is idempotent.
    const externalId = createHash('sha1').update(input.url).digest('hex').slice(0, 16);

    const now = new Date();
    const isRemote = input.remote ?? /remote/i.test((input.location ?? '') + ' ' + (input.title ?? ''));

    // Derive a candidate companyWebsite from the captured URL so the "Find
    // Contacts" flow has something to work with. ContactFinder normalizes
    // before calling Hunter (strips careers./jobs./etc.).
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
      applyOptions: [{
        publisher: input.sourceHost ?? 'Captured',
        url: input.url,
        isDirect: true,
      }],
      applyIsDirect: true,

      contractTime: 'unknown',
      contractType: 'unknown',
      employmentType: input.employmentType,
      publisher: input.sourceHost ?? 'manual',

      salary: (input.salaryMin || input.salaryMax) ? {
        min: input.salaryMin,
        max: input.salaryMax,
        currency: input.salaryCurrency ?? 'USD',
        period: input.salaryPeriod,
      } : undefined,

      postedAt: input.postedAt ?? now.toISOString(),

      relevanceScore: 100,
      status: 'saved',
    };

    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await this.prisma.savedJob.upsert({
      where: {
        userId_externalId_source: {
          userId,
          externalId,
          source: 'manual',
        },
      },
      update: { jobData: job as any, fetchedAt: now, expiresAt },
      create: {
        userId,
        externalId,
        source: 'manual',
        jobData: job as any,
        expiresAt,
      },
    });

    this.logger.log(`Captured "${job.title}" @ ${job.company} from ${input.sourceHost ?? 'unknown'}`);
    return job;
  }

  private async fetchAndProcess(userId: string): Promise<Job[]> {
    userId = await this.userService.ensureUser(userId);
    const profile = await this.getCvProfile(userId);
    const weights = await this.getWeights(userId);
    const queries = this.buildSearchQueries(profile);

    this.logger.log(`Using search queries: ${queries.join(', ')}`);

    const adzunaCount = Math.round(20 * weights.adzuna * 2);
    const jsearchCount = Math.round(2 * weights.jsearch * 2);

    const [adzunaJobs, jsearchJobs] = await Promise.all([
      this.adzuna.fetchJobs(queries[0], adzunaCount),
      this.jsearch.fetchJobs(queries[0], jsearchCount),
    ]);

    this.logger.log(`Fetched ${adzunaJobs.length} Adzuna + ${jsearchJobs.length} JSearch jobs`);

    const combined = this.deduplicate([...adzunaJobs, ...jsearchJobs]);
    this.jobCache.saveRawJobs(userId, combined);

    const enriched = await this.enrichment.enrichJobs(combined);
    this.jobCache.saveRawJobs(userId, enriched);

    const dismissals = await this.getDismissals(userId);

    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals, profile);
    this.logger.log(`${filtered.length} jobs after AI filtering`);

    this.jobCache.saveRawJobs(userId, filtered);
    await this.saveJobsToDB(userId, filtered);
    this.jobCache.clearCache(userId);

    return filtered;
  }

  private async saveJobsToDB(userId: string, userjobs: Job[]): Promise<void> {
    userId = await this.userService.ensureUser(userId);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(
      userjobs.map((job) =>
        this.prisma.savedJob.upsert({
          where: {
            userId_externalId_source: {
              userId,
              externalId: job.externalId,
              source: job.source,
            },
          },
          update: { jobData: job as any, expiresAt, fetchedAt: new Date() },
          create: {
            userId,
            externalId: job.externalId,
            source: job.source,
            jobData: job as any,
            expiresAt,
          },
        }),
      ),
    );
    this.logger.log(`Saved ${userjobs.length} jobs to DB`);
  }

  async dismissJob(userId: string, jobId: string, source: string, company: string, title: string, reason?: string) {
    // await this.ensureDevUser();
    userId = await this.userService.ensureUser(userId);

    await this.prisma.dismissedJob.create({
      data: { userId, jobId, source, company, title, reason },
    });

    await this.prisma.savedJob.deleteMany({
      where: { userId, externalId: jobId, source },
    });

    await this.recalculateWeights(userId);
    return { success: true, weights: await this.getWeights(userId) };
  }

  async getWeights(userId: string): Promise<JobFeedWeights> {
    // await this.ensureDevUser();
    userId = await this.userService.ensureUser(userId);
    const weights = await this.prisma.jobFeedWeights.findUnique({
      where: { userId },
    });
    return weights ?? { adzuna: 0.5, jsearch: 0.5 };
  }

  async refreshJobs(userId: string): Promise<Job[]> {
    userId = await this.userService.ensureUser(userId);
    await this.prisma.savedJob.deleteMany({ where: { userId } });
    this.jobCache.clearCache(userId);
    return this.fetchAndProcess(userId);
  }

  async getCacheInfo(userId: string) {
    userId = await this.userService.ensureUser(userId);
    return this.jobCache.getCacheInfo(userId);
  }

  private async getDismissals(userId: string): Promise<DismissedJob[]> {
    userId = await this.userService.ensureUser(userId);
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

  private async recalculateWeights(userId: string) {
    userId = await this.userService.ensureUser(userId);
    const recent = await this.prisma.dismissedJob.findMany({
      where: { userId },
      orderBy: { dismissedAt: 'desc' },
      take: 20,
    });

    const adzunaDismissals = recent.filter(d => d.source === 'adzuna').length;
    const jsearchDismissals = recent.filter(d => d.source === 'jsearch').length;
    const total = adzunaDismissals + jsearchDismissals;
    if (total === 0) return;

    const adzunaScore = 1 - (adzunaDismissals / total);
    const jsearchScore = 1 - (jsearchDismissals / total);
    const sum = adzunaScore + jsearchScore;

    await this.prisma.jobFeedWeights.upsert({
      where: { userId },
      update: {
        adzuna: parseFloat((adzunaScore / sum).toFixed(2)),
        jsearch: parseFloat((jsearchScore / sum).toFixed(2)),
      },
      create: {
        userId,
        adzuna: parseFloat((adzunaScore / sum).toFixed(2)),
        jsearch: parseFloat((jsearchScore / sum).toFixed(2)),
      },
    });
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
