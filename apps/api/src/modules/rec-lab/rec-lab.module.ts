import { Module } from '@nestjs/common';
import { RecLabController } from './rec-lab.controller';
import { RecLabService } from './rec-lab.service';
import { EmbeddingService } from './embedding.service';
import { AuthModule } from '../../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [AuthModule, JobsModule],
  controllers: [RecLabController],
  providers: [RecLabService, EmbeddingService],
  exports: [RecLabService, EmbeddingService],
})
export class RecLabModule {}
