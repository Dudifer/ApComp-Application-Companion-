import { Injectable, Logger } from '@nestjs/common';
import { Job } from '@apcomp/types';

/**
 * OpenJobDataProvider — HTTP client for the laptop jobs-server.
 *
 * On laptop (dev):  JOB_SERVICE_URL=http://localhost:3002
 * On EC2 (prod):    JOB_SERVICE_URL=https://jobs.apcomp.us
 *
 * The actual job search logic lives in apps/api/src/jobs-server.ts,
 * which runs on the laptop and queries the local job_catalog table.
 */
@Injectable()
export class OpenJobDataProvider {
  private readonly logger = new Logger(OpenJobDataProvider.name);
  private readonly serviceUrl =
    (process.env.JOB_SERVICE_URL ?? 'http://localhost:3002').replace(/\/$/, '');

  async fetchJobs(
    queries: string[],
    _daysBack = 7,
    postedDays?: number,
    experienceLevel: 'entry' | 'junior' | 'mid' | 'any' = 'any',
  ): Promise<Job[]> {
    if (!queries.length) return [];

    this.logger.log(`Searching job catalog: [${queries.join(', ')}]`);

    try {
      const res = await fetch(`${this.serviceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titles: queries,
          postedDays,
          experienceLevel,
          limit: 150,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        this.logger.warn(`Job service returned HTTP ${res.status}`);
        return [];
      }

      const jobs: Job[] = await res.json();
      this.logger.log(`Job service returned ${jobs.length} jobs`);
      return jobs;
    } catch (err: any) {
      if (err?.name === 'TimeoutError') {
        this.logger.warn('Job service timed out after 15 s');
      } else {
        this.logger.warn(`Job service unreachable: ${err?.message}`);
      }
      return [];
    }
  }
}
