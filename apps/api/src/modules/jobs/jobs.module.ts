import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { AdzunaProvider } from './providers/adzuna.provider';
import { JSearchProvider } from './providers/jsearch.provider';
import { AiFilterService } from './ai-filter.service';

@Module({
  controllers: [JobsController],
  providers: [JobsService, AdzunaProvider, JSearchProvider, AiFilterService],
  exports: [JobsService],
})
export class JobsModule {}
