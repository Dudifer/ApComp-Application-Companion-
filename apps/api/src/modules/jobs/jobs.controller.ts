import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ContactFinderService } from './contact-finder.service';
import { CapturedJobInput } from '@apcomp/types';
import { Request } from 'express';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';

@Controller('jobs')
@UseGuards(ClerkAuthGuard)
export class JobsController extends AuthenticatedController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly contactFinder: ContactFinderService,
    ) { super(); }

  @Get('recommended')
  getRecommended(@Req() req: any) {
    return this.jobsService.getRecommendedJobs(req.userId);
  }

  @Post('capture')
  captureJob(@Req() req: any, @Body() body: CapturedJobInput) {
    return this.jobsService.captureJob(req.userId, body);
  }

  @Post('search')
  searchJobs(
    @Req() req: any,
    @Body() body: {
      title: string;
      skills?: string;
      location?: string;
      remote?: boolean;
    },
  ) {
    return this.jobsService.searchJobs(req.userId, body);
  }

  @Post('refresh')
  refreshJobs(@Req() req: any) {
    return this.jobsService.refreshJobs(req.userId);
  }

  @Get('weights')
  getWeights(@Req() req: any) {
    return this.jobsService.getWeights(req.userId);
  }

  @Get('cache-info')
  getCacheInfo(@Req() req: any) {
    return this.jobsService.getCacheInfo(req.userId);
  }

  @Post('dismiss')
  dismissJob(
    @Req() req: any,
    @Body() body: {
      jobId: string;
      source: string;
      company: string;
      title: string;
      reason?: string;
    },
  ) {
    return this.jobsService.dismissJob(
      req.userId,
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
