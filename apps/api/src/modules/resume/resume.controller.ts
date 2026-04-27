import {
  Controller,
  Post,
  Get,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResumeService } from './resume.service';
import { GapAnswerPayload } from '@pkg-types/resume';

@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadCv(@UploadedFile() file: Express.Multer.File) {
    return this.resumeService.processUpload(file);
  }

  @Post('gap-answers')
  async submitGapAnswers(@Body() body: { answers: GapAnswerPayload[] }) {
    return this.resumeService.submitGapAnswers(body.answers);
  }

  @Get('profile')
  getProfile() {
    return this.resumeService.getProfile();
  }
}
