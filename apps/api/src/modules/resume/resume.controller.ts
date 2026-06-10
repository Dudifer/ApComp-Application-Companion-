import {
  Controller,
  Post,
  Get,
  Body,
  Delete,
  UploadedFile,
  UseInterceptors,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResumeService } from './resume.service';
import { GapAnswerPayload } from '@apcomp/types';
import { Request } from 'express';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';

@Controller('resume')
@UseGuards(ClerkAuthGuard)
export class ResumeController extends AuthenticatedController {
  constructor(private readonly resumeService: ResumeService) { super(); }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadCv(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.resumeService.processUpload(req.userId, file);
  }

  @Post('gap-answers')
  async submitGapAnswers(@Req() req: any, @Body() body: { answers: GapAnswerPayload[] }) {
    return this.resumeService.submitGapAnswers(req.userId, body.answers);
  }

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.resumeService.getProfile(req.userId);
  }

  @Delete('profile')
  async deleteProfile(@Req() req: any) {
    await this.resumeService.deleteProfile(req.userId);
    return { success: true };
}
}
