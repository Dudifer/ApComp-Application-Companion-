import { Injectable, Logger } from '@nestjs/common';
import type { Job } from '@apcomp/types';
import { TEST_DATASET } from './test-dataset';
import { catalogRowToJob } from './catalog-embedding';

/**
 * Rec Lab 2 — clean rebuild, starting from scratch.
 */
@Injectable()
export class RecLab2Service {
  private readonly logger = new Logger(RecLab2Service.name);

  /**
   * Process 1: pulls the jobs described in test-dataset.ts (50 software +
   * 50 retail, real job_catalog ids — see that file's header comment) and
   * maps each row into a Job via the same catalogRowToJob() mapping
   * RecLabService uses. No DB or embedding work — just the raw dataset.
   */
  getTestDatasetJobs(): Job[] {
    return TEST_DATASET.map(row => catalogRowToJob(row));
  }
}
