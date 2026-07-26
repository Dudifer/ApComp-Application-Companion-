import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { InteractionType } from '@apcomp/types';
import { RecLab2Service } from './rec-lab2.service';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';

/**
 * Rec Lab 2 — clean rebuild of the Rec Lab sandbox. See apps/web
 * RecLab2.tsx for the UI this backs. Routed under 'rec-lab2' so it doesn't
 * collide with the original 'rec-lab' controller/service while both exist
 * side by side.
 */
@Controller('rec-lab2')
@UseGuards(ClerkAuthGuard)
export class RecLab2Controller extends AuthenticatedController {
  constructor(private readonly recLab2: RecLab2Service) {
    super();
  }

  /** The test-dataset.ts jobs, scored (and once-per-CV-upload sorted) by similarity to the caller's CV — for the Recommended Jobs box. */
  @Get('recommended')
  getRecommended(@Req() req: any) {
    return this.recLab2.getRecommendedJobs(req.userId);
  }

  /** Compare tool: cosine similarity between two jobs directly (not against the CV). Job ids can contain '/' and ':', hence POST body over query params. */
  @Post('compare')
  compareJobs(@Body() body: { jobIdA: string; jobIdB: string }) {
    return this.recLab2.compareJobs(body.jobIdA, body.jobIdB);
  }

  /** Every embedded job (plus the CV, if any) reduced to 2-d via PCA/UMAP/t-SNE, for the "embeddings plot" screen. */
  @Get('embeddings-plot')
  getEmbeddingsPlot(@Req() req: any) {
    return this.recLab2.getEmbeddingsPlot(req.userId);
  }

  /** Logs a Rec Lab 2-only interaction — tracked and scored, but not (yet) read by getRecommended's ranking. */
  @Post('interactions')
  logInteraction(
    @Req() req: any,
    @Body() body: { jobId: string; jobTitle: string; jobCompany?: string; type: InteractionType },
  ) {
    return this.recLab2.logInteraction(req.userId, body);
  }

  /** Toggle-off for the row buttons — deletes the interaction created by the matching toggle-on click. Also used to delete a row from the "view interaction history" screen. */
  @Delete('interactions/:id')
  deleteInteraction(@Req() req: any, @Param('id') id: string) {
    return this.recLab2.deleteInteraction(req.userId, id);
  }

  /** Re-classify a logged interaction from the history screen (e.g. Dismissed -> Saved). Recomputes weight from the new type, so the job's score changes accordingly next time it's read. */
  @Patch('interactions/:id')
  updateInteraction(@Req() req: any, @Param('id') id: string, @Body() body: { type: InteractionType }) {
    return this.recLab2.updateInteraction(req.userId, id, body.type);
  }

  /** Per-job interaction history + score, for the "view interaction history" screen. */
  @Get('interactions/history')
  getInteractionHistory(@Req() req: any) {
    return this.recLab2.getInteractionHistory(req.userId);
  }

  /** Wipes all of the caller's Rec Lab 2 interactions — the "reset scores" button. */
  @Post('interactions/reset')
  resetInteractions(@Req() req: any) {
    return this.recLab2.resetInteractions(req.userId);
  }
}
