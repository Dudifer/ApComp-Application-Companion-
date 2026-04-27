import { Injectable, Logger } from '@nestjs/common';
import { Job, DismissedJob, JobFeedWeights } from '@pkg-types/job';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';

const DEFAULT_WEIGHTS: JobFeedWeights = { adzuna: 0.5, jsearch: 0.5 };
const SEARCH_QUERIES = [
  'software engineer',
  'software developer',
  'full stack developer',
  'backend engineer',
  'frontend engineer',
];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  // In-memory store until DB is wired up
  private dismissals: DismissedJob[] = [];
  private weights: JobFeedWeights = { ...DEFAULT_WEIGHTS };

  constructor(
    private readonly adzuna: AdzunaProvider,
    private readonly jsearch: JSearchProvider,
    private readonly aiFilter: AiFilterService,
  ) {}

  async getRecommendedJobs(): Promise<Partial<Job>[]> {
    const query = SEARCH_QUERIES[0];

    // Fetch from both sources in parallel
    const adzunaCount = Math.round(20 * this.weights.adzuna * 2);
    const jsearchCount = Math.round(2 * this.weights.jsearch * 2);

    const [adzunaJobs, jsearchJobs] = await Promise.all([
      this.adzuna.fetchJobs(query, adzunaCount),
      this.jsearch.fetchJobs(query, jsearchCount),
    ]);

    this.logger.log(`Fetched ${adzunaJobs.length} Adzuna + ${jsearchJobs.length} JSearch jobs`);

    // Deduplicate by company + similar title
    const combined = this.deduplicate([...adzunaJobs, ...jsearchJobs]);

    // Run through AI filter
    const filtered = await this.aiFilter.scoreAndFilter(combined, this.dismissals);

    this.logger.log(`${filtered.length} jobs after AI filtering`);
    return filtered;
  }

  dismissJob(jobId: string, source: string, company: string, title: string, reason?: string) {
    const dismissal: DismissedJob = {
      jobId,
      source: source as DismissedJob['source'],
      company,
      title,
      reason,
      dismissedAt: new Date().toISOString(),
    };

    this.dismissals.push(dismissal);
    this.updateWeights(source as DismissedJob['source']);

    return { success: true, weights: this.weights };
  }

  getWeights(): JobFeedWeights {
    return this.weights;
  }

  private updateWeights(dismissedSource: 'adzuna' | 'jsearch') {
    // Count recent dismissals per source (last 20)
    const recent = this.dismissals.slice(-20);
    const adzunaDismissals = recent.filter(d => d.source === 'adzuna').length;
    const jsearchDismissals = recent.filter(d => d.source === 'jsearch').length;
    const total = adzunaDismissals + jsearchDismissals;

    if (total === 0) return;

    // More dismissals from a source → lower its weight
    const adzunaScore = 1 - (adzunaDismissals / total);
    const jsearchScore = 1 - (jsearchDismissals / total);
    const sum = adzunaScore + jsearchScore;

    this.weights = {
      adzuna: parseFloat((adzunaScore / sum).toFixed(2)),
      jsearch: parseFloat((jsearchScore / sum).toFixed(2)),
    };

    this.logger.log(`Updated weights: Adzuna=${this.weights.adzuna} JSearch=${this.weights.jsearch}`);
  }

  private deduplicate(jobs: Partial<Job>[]): Partial<Job>[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      const key = `${job.company?.toLowerCase()}-${job.title?.toLowerCase().slice(0, 20)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
