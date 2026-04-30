import { Injectable, Logger } from '@nestjs/common';
import { Job, DismissedJob, JobFeedWeights } from '@apcomp/types';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { PrismaService } from '../prisma/prisma.service';

const SEARCH_QUERIES = [
  'software engineer',
  'software developer',
  'full stack developer',
  'backend engineer',
  'frontend engineer',
];

// Temporary dev user ID until auth is implemented
const DEV_USER_ID = 'dev-user';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly adzuna: AdzunaProvider,
    private readonly jsearch: JSearchProvider,
    private readonly aiFilter: AiFilterService,
    private readonly enrichment: CompanyEnrichmentService,
    private readonly prisma: PrismaService,
  ) {}

  private async ensureDevUser() {
    return this.prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {},
      create: {
        id: DEV_USER_ID,
        email: 'dev@apcomp.local',
        name: 'Dev User',
      },
    });
  }

  async getRecommendedJobs(): Promise<Job[]> {
    await this.ensureDevUser();

    // Check for non-expired saved jobs first
    const saved = await this.prisma.savedJob.findMany({
      where: {
        userId: DEV_USER_ID,
        expiresAt: { gt: new Date() },
      },
    });

    if (saved.length > 0) {
      this.logger.log(`Returning ${saved.length} cached jobs from DB`);
      return saved.map(s => s.jobData as unknown as Job);
    }

    // Fetch fresh jobs
    const query = SEARCH_QUERIES[0];
    const weights = await this.getWeights();
    const adzunaCount = Math.round(20 * weights.adzuna * 2);
    const jsearchCount = Math.round(2 * weights.jsearch * 2);

    const [adzunaJobs, jsearchJobs] = await Promise.all([
      this.adzuna.fetchJobs(query, adzunaCount),
      this.jsearch.fetchJobs(query, jsearchCount),
    ]);

    this.logger.log(`Fetched ${adzunaJobs.length} Adzuna + ${jsearchJobs.length} JSearch jobs`);

    const combined = this.deduplicate([...adzunaJobs, ...jsearchJobs]);
    const enriched = await this.enrichment.enrichJobs(combined);
    const dismissals = await this.getDismissals();
    const filtered = await this.aiFilter.scoreAndFilter(enriched, dismissals);

    this.logger.log(`${filtered.length} jobs after AI filtering`);

    // Save to DB with 7 day expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(
      filtered.map(job =>
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

    return filtered;
  }

  async dismissJob(jobId: string, source: string, company: string, title: string, reason?: string) {
    await this.ensureDevUser();

    await this.prisma.dismissedJob.create({
      data: {
        userId: DEV_USER_ID,
        jobId,
        source,
        company,
        title,
        reason,
      },
    });

    // Remove from saved jobs
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
    // Delete cached jobs and re-fetch
    await this.prisma.savedJob.deleteMany({ where: { userId: DEV_USER_ID } });
    return this.getRecommendedJobs();
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

    const adzuna = parseFloat((adzunaScore / sum).toFixed(2));
    const jsearch = parseFloat((jsearchScore / sum).toFixed(2));

    await this.prisma.jobFeedWeights.upsert({
      where: { userId: DEV_USER_ID },
      update: { adzuna, jsearch },
      create: { userId: DEV_USER_ID, adzuna, jsearch },
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
