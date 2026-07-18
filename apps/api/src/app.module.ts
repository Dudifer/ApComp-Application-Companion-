import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JobsModule } from './modules/jobs/jobs.module';
import { ResumeModule } from './modules/resume/resume.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { RecLabModule } from './modules/rec-lab/rec-lab.module';
import { RecLab2Module } from './modules/rec-lab/rec-lab2.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule, PrismaModule, JobsModule, ResumeModule, ApplicationsModule, RecLabModule, RecLab2Module],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
