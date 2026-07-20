import { Controller, Get, Req, UseGuards } from '@nestjs/common';
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
}
