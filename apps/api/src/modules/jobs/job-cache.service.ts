import { Injectable, Logger } from '@nestjs/common';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Job } from '@apcomp/types';

const CACHE_DIR = join(process.cwd(), '.job-cache');
// const CACHE_FILE = join(CACHE_DIR, 'raw-jobs.json');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface JobCacheFile {
  savedAt: string;
  jobs: Job[];
}


@Injectable()
export class JobCacheService {
  private readonly logger = new Logger(JobCacheService.name);

  constructor() {
    // Ensure cache directory exists
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
  }

  private getCachePath(userId: string): string {
    return join(CACHE_DIR, `raw-jobs-${userId}.json`);
  }

  /**
   * Save raw jobs to disk immediately after fetching.
   * Call this before any processing that could fail.
   */
  saveRawJobs(userId: string, jobs: Job[]): void {
    try {
      const data: JobCacheFile = {
        savedAt: new Date().toISOString(),
        jobs,
      };
      writeFileSync(this.getCachePath(userId), JSON.stringify(data, null, 2), 'utf-8');
      this.logger.log(`Saved ${jobs.length} raw jobs to disk cache`);
    } catch (err) {
      this.logger.warn('Could not save job cache to disk:', err);
    }
  }

  /**
   * Load raw jobs from disk if they exist and aren't too old.
   * Returns null if no valid cache exists.
   */
  loadRawJobs(userId: string): Job[] | null {
    try {
      if (!existsSync(this.getCachePath(userId))) return null;

      const raw = readFileSync(this.getCachePath(userId), 'utf-8');
      const data: JobCacheFile = JSON.parse(raw);

      const age = Date.now() - new Date(data.savedAt).getTime();
      if (age > MAX_AGE_MS) {
        this.logger.log('Disk cache expired, ignoring');
        return null;
      }

      this.logger.log(`Loaded ${data.jobs.length} jobs from disk cache (saved ${data.savedAt})`);
      return data.jobs;
    } catch (err) {
      this.logger.warn('Could not read job cache from disk:', err);
      return null;
    }
  }

  /**
   * Check if a valid disk cache exists without loading it.
   */
  hasCachedJobs(userId: string): boolean {
    try {
      if (!existsSync(this.getCachePath(userId))) return false;
      const raw = readFileSync(this.getCachePath(userId), 'utf-8');
      const data: JobCacheFile = JSON.parse(raw);
      const age = Date.now() - new Date(data.savedAt).getTime();
      return age <= MAX_AGE_MS;
    } catch {
      return false;
    }
  }

  /**
   * Clear the disk cache.
   */
  clearCache(userId: string): void {
    try {
      if (existsSync(this.getCachePath(userId))) {
        writeFileSync(this.getCachePath(userId), JSON.stringify({ savedAt: null, jobs: [] }), 'utf-8');
        this.logger.log('Disk cache cleared');
      }
    } catch (err) {
      this.logger.warn('Could not clear disk cache:', err);
    }
  }

  getCacheInfo(userId: string): { exists: boolean; savedAt?: string; jobCount?: number; ageHours?: number } {
    try {
      if (!existsSync(this.getCachePath(userId))) return { exists: false };
      const raw = readFileSync(this.getCachePath(userId), 'utf-8');
      const data: JobCacheFile = JSON.parse(raw);
      const ageMs = Date.now() - new Date(data.savedAt).getTime();
      return {
        exists: true,
        savedAt: data.savedAt,
        jobCount: data.jobs.length,
        ageHours: Math.round(ageMs / (1000 * 60 * 60)),
      };
    } catch {
      return { exists: false };
    }
  }
}
