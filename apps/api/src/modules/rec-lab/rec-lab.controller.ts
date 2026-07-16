import { Controller, Get, Post, Patch, Delete, Body, Query, Param, Req, UseGuards } from '@nestjs/common';
import type { Job, LogInteractionInput, UpdateInteractionInput } from '@apcomp/types';
import { RecLabService } from './rec-lab.service';
import { JobsService } from '../jobs/jobs.service';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';

/**
 * Rec Lab — the sandbox for testing embedding-based job matching and
 * interaction-driven scoring before either lands in the live recommendation
 * feed. See apps/web RecLabPage.tsx for the UI this backs.
 */
@Controller('rec-lab')
@UseGuards(ClerkAuthGuard)
export class RecLabController extends AuthenticatedController {
  constructor(
    private readonly recLab: RecLabService,
    private readonly jobsService: JobsService,
  ) {
    super();
  }

  /**
   * Ranks a set of jobs by CV similarity + similarity to previously-liked
   * jobs + interaction score, with a novelty slice mixed in. Candidate
   * source, in priority order:
   *   1. an explicit `jobs` list
   *   2. a manual test set of `catalogJobIds` (job_catalog.id values — see
   *      RecLabService.resolveCatalogJobs)
   *   3. real nearest-neighbor retrieval — embed the CV, pull the closest
   *      `nnPoolSize` jobs across the full embedded catalog via the pgvector
   *      index (RecLabService.findNearestJobs)
   *   4. the old non-embedding recommended-jobs feed, as a last-resort
   *      fallback for users with no CV profile yet / before any backfill has
   *      populated compositeVector, so the lab still works with zero setup.
   */
  @Post('rank')
  async rank(
    @Req() req: any,
    @Body() body: {
      jobs?: Job[]; catalogJobIds?: string[]; nnPoolSize?: number;
      limit?: number; noveltyRate?: number; decay?: boolean;
    },
  ) {
    let jobs: Job[];
    if (body.jobs?.length) {
      jobs = body.jobs;
    } else if (body.catalogJobIds?.length) {
      jobs = await this.recLab.resolveCatalogJobs(body.catalogJobIds);
    } else {
      jobs = await this.recLab.findNearestJobs(req.userId, body.nnPoolSize ?? 100);
      if (!jobs.length) jobs = await this.jobsService.getRecommendedJobs(req.userId);
    }
    return this.recLab.rank(req.userId, jobs, {
      limit: body.limit,
      noveltyRate: body.noveltyRate,
      decay: body.decay,
    });
  }

  /**
   * Ranks the hardcoded software+retail test dataset (test-dataset.ts)
   * instead of pulling from the live pgvector index — for iterating on
   * ranking behavior without depending on the DB-side ANN index. Also
   * builds and applies the CV weight vector from this user's full
   * interaction history (see RecLabService.rankTestDataset), returning a
   * summary of it alongside the ranked jobs.
   */
  @Post('test-dataset/rank')
  rankTestDataset(
    @Req() req: any,
    @Body() body: { limit?: number; noveltyRate?: number; decay?: boolean },
  ) {
    return this.recLab.rankTestDataset(req.userId, body);
  }

  @Post('interactions')
  logInteraction(@Req() req: any, @Body() body: LogInteractionInput) {
    return this.recLab.logInteraction(req.userId, body);
  }

  @Get('interactions')
  listInteractions(@Req() req: any, @Query('jobId') jobId?: string) {
    return this.recLab.listInteractions(req.userId, jobId);
  }

  /** "Replay" — go back and change how you interacted with a job. */
  @Patch('interactions/:id')
  updateInteraction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateInteractionInput,
  ) {
    return this.recLab.updateInteraction(req.userId, id, body);
  }

  @Delete('interactions/:id')
  deleteInteraction(@Req() req: any, @Param('id') id: string) {
    return this.recLab.deleteInteraction(req.userId, id);
  }

  /** Saved/applied/liked jobs over time, for the Rec Lab timeline plot. */
  @Get('timeline')
  timeline(@Req() req: any) {
    return this.recLab.timeline(req.userId);
  }
}
