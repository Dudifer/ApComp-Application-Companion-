import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { OpenJobDataProvider } from './providers/openjobdata.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { ContactFinderService } from './contact-finder.service';
import { JobCacheService } from './job-cache.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule, ScheduleModule.forRoot()],
  controllers: [JobsController],
  providers: [
    JobsService,
    OpenJobDataProvider,
    AiFilterService,
    CompanyEnrichmentService,
    ContactFinderService,
    JobCacheService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
