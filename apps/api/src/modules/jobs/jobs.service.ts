import { Injectable, Logger } from '@nestjs/common';
import { Job, DismissedJob, JobFeedWeights } from '@apcomp/types';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { JobCacheService } from './job-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CvProfile } from '@apcomp/types';

const DEV_USER_ID = 'dev-user';

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
  ) {}

  private async ensureDevUser() {
    return this.prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {},
      create: {
        id: DEV_USER_ID,
        email: process.env.DEV_USER_EMAIL ?? 'dev@apcomp.local',
        name: 'Dev User',
      },
    });
  }

  private async getCvProfile(): Promise<CvProfile | null> {
    try {
      const row = await this.prisma.cvProfile.findUnique({
        where: { userId: DEV_USER_ID },
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

    // Use most recent job titles
    const recentTitles = profile.roles
      .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
      .slice(0, 2)
      .map(r => r.title.toLowerCase());

    queries.push(...recentTitles);

    // Add skill-based queries from top skills
    const topSkills = profile.skills
      ?.sort((a, b) => b.monthsExperience - a.monthsExperience)
      .slice(0, 3)
      .map(s => s.name);

    if (topSkills?.length) {
      queries.push(`${topSkills[0]} developer`);
    }

    // Deduplicate and limit
    return [...new Set(queries)].slice(0, 3);
  }

  async getRecommendedJobs(): Promise<Job[]> {
    await this.ensureDevUser();

    // Return cached DB jobs if still fresh
    const saved = await this.prisma.savedJob.findMany({
      where: { userId: DEV_USER_ID, expiresAt: { gt: new Date() } },
    });

    if (saved.length > 0) {
      this.logger.log(`Returning ${saved.length} cached jobs from DB`);
      return saved.map(s => s.jobData as unknown as Job);
    }

    // Check disk cache fallback
    const diskCached = this.jobCache.loadRawJobs();
    if (diskCached) {
      this.logger.log(`Returning ${diskCached.length} jobs from disk cache`);
      await this.saveJobsToDB(diskCached).catch(err =>
        this.logger.warn('Could not save disk cache to DB:', err)
      );
      return diskCached;
    }

    return this.fetchAndProcess();
  }

  private async fetchAndProcess(): Promise<Job[]> {
    const profile = await this.getCvProfile();
    const weights = await this.getWeights();
    const queries = this.buildSearchQueries(profile);

    this.logger.log(`Using search queries: ${queries.join(', ')}`);

    const adzunaCount = Math.round(20 * weights.adzuna * 2);
    const jsearchCount = Math.round(2 * weights.jsearch * 2);

    // Fetch using profile-derived queries
    const [adzunaJobs, jsearchJobs] = await Promise.all([
      this.adzuna.fetchJobs(queries[0], adzunaCount),
      this.jsearch.fetchJobs(queries[0], jsearchCount),
    ]);

    this.logger.log(`Fetched ${adzunaJobs.length} Adzuna + ${jsearchJobs.length} JSearch jobs`);

    const combined = this.deduplicate([...adzunaJobs, ...jsearchJobs]);

    // Save raw to disk immediately
    this.jobCache.saveRawJobs(combined);

    const enriched = await this.enrichment.enrichJobs(combined);
    this.jobCache.saveRawJobs(enriched);

    const dismissals = await this.getDismissals();

    // Pass real profile to AI filter
    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals, profile);
    this.logger.log(`${filtered.length} jobs after AI filtering`);

    this.jobCache.saveRawJobs(filtered);
    await this.saveJobsToDB(filtered);
    this.jobCache.clearCache();

    return filtered;
  }

  private async saveJobsToDB(jobs: Job[]): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(
      jobs.map(job =>
        this.prisma.savedJob.upsert({
          where: {
            userId_externalId_source: {
              userId: DEV_USER_ID,
              externalId: job.externalId,
              source: job.source,
            },
          },
          update: { jobData: job as any, expiresAt, fetchedAt: new Date() },
          create: {
            userId: DEV_USER_ID,
            externalId: job.externalId,
            source: job.source,
            jobData: job as any,
            expiresAt,
          },
        })
      )
    );
    this.logger.log(`Saved ${jobs.length} jobs to DB`);
  }

  async dismissJob(jobId: string, source: string, company: string, title: string, reason?: string) {
    await this.ensureDevUser();

    await this.prisma.dismissedJob.create({
      data: { userId: DEV_USER_ID, jobId, source, company, title, reason },
    });

    await this.prisma.savedJob.deleteMany({
      where: { userId: DEV_USER_ID, externalId: jobId, source },
    });

    await this.recalculateWeights();
    return { success: true, weights: await this.getWeights() };
  }

  async getWeights(): Promise<JobFeedWeights> {
    await this.ensureDevUser();
    const weights = await this.prisma.jobFeedWeights.findUnique({
      where: { userId: DEV_USER_ID },
    });
    return weights ?? { adzuna: 0.5, jsearch: 0.5 };
  }

  async refreshJobs(): Promise<Job[]> {
    await this.prisma.savedJob.deleteMany({ where: { userId: DEV_USER_ID } });
    this.jobCache.clearCache();
    return this.fetchAndProcess();
  }

  getCacheInfo() {
    return this.jobCache.getCacheInfo();
  }

  private async getDismissals(): Promise<DismissedJob[]> {
    const rows = await this.prisma.dismissedJob.findMany({
      where: { userId: DEV_USER_ID },
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

  private async recalculateWeights() {
    const recent = await this.prisma.dismissedJob.findMany({
      where: { userId: DEV_USER_ID },
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
      where: { userId: DEV_USER_ID },
      update: {
        adzuna: parseFloat((adzunaScore / sum).toFixed(2)),
        jsearch: parseFloat((jsearchScore / sum).toFixed(2)),
      },
      create: {
        userId: DEV_USER_ID,
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
