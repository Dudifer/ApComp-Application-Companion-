import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ContactFinderService } from './contact-finder.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly contactFinder: ContactFinderService,
  ) {}

  @Get('recommended')
  getRecommended() {
    return this.jobsService.getRecommendedJobs();
  }

  @Post('refresh')
  refreshJobs() {
    return this.jobsService.refreshJobs();
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

  @Get('contacts')
  findContacts(
    @Query('company') company: string,
    @Query('domain') domain: string,
  ) {
    return this.contactFinder.findContacts(company, domain);
  }
}
