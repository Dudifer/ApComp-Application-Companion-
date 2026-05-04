import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { GmailService } from './gmail.service';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService, GmailService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
