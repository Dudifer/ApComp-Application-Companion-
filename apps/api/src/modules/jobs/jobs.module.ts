import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';
import { CompanyEnrichmentService } from './company-enrichment.service';
import { ContactFinderService } from './contact-finder.service';
import { JobCacheService } from './job-cache.service';

@Module({
  controllers: [JobsController],
  providers: [
    JobsService,
    AdzunaProvider,
    JSearchProvider,
    AiFilterService,
    CompanyEnrichmentService,
    ContactFinderService,
    JobCacheService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
 