import { Controller, Get, Post, Body } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get('recommended')
  getRecommended() {
    return this.jobsService.getRecommendedJobs();
  }

  @Get('weights')
  getWeights() {
    return this.jobsService.getWeights();
  }

  @Post('dismiss')
  dismissJob(
    @Body() body: {
      jobId: string;
      source: string;
      company: string;
      title: string;
      reason?: string;
    },
  ) {
    return this.jobsService.dismissJob(
      body.jobId,
      body.source,
      body.company,
      body.title,
      body.reason,
    );
  }
}
