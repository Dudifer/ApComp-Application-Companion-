import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ContactFinderService } from './contact-finder.service';
import { CapturedJobInput } from '@apcomp/types';

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

  @Post('capture')
  captureJob(@Body() body: CapturedJobInput) {
    return this.jobsService.captureJob(body);
  }

  @Post('search')
  searchJobs(
    @Body() body: {
      title: string;
      skills?: string;
      location?: string;
      remote?: boolean;
    },
  ) {
    return this.jobsService.searchJobs(body);
  }

  @Post('refresh')
  refreshJobs() {
    return this.jobsService.refreshJobs();
  }

  @Get('weights')
  getWeights() {
    return this.jobsService.getWeights();
  }

  @Get('cache-info')
  getCacheInfo() {
    return this.jobsService.getCacheInfo();
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
