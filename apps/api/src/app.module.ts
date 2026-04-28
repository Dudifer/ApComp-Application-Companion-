import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule } from './modules/jobs/jobs.module';
import { ResumeModule } from './modules/resume/resume.module';

@Module({
  imports: [JobsModule, ResumeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
