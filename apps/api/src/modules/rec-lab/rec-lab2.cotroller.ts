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
}