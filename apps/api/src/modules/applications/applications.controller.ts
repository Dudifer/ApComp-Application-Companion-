import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  Patch,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApplicationsService } from './applications.service';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';
import { Public } from '../../auth/public.decorator';

@Controller('applications')
export class ApplicationsController extends AuthenticatedController {
  constructor(private readonly applicationsService: ApplicationsService) {
    super();
  }

  @Get()
  @UseGuards(ClerkAuthGuard)
  getAll(@Req() req: any) {
    return this.applicationsService.getApplications(req.userId);
  }

  @Get('dashboard')
  @UseGuards(ClerkAuthGuard)
  getDashboard(@Req() req: any) {
    return this.applicationsService.getDashboardApplications(req.userId);
  }

  // Auth guard required — we need req.userId to encode into OAuth state
  @Get('gmail/auth')
  @UseGuards(ClerkAuthGuard)
  getGmailAuthUrl(@Req() req: any) {
    return { url: this.applicationsService.getGmailAuthUrl(req.userId) };
  }

  @Get('gmail/status')
  @UseGuards(ClerkAuthGuard)
  getGmailStatus(@Req() req: any) {
    return { connected: this.applicationsService.isGmailConnected(req.userId) };
  }

  // Public — Google's redirect carries no Authorization header.
  // The user is identified by decoding the state param we encoded in getGmailAuthUrl.
  @Get('gmail/callback')
  @Public()
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const clerkId = Buffer.from(state, 'base64url').toString('utf-8');
    await this.applicationsService.handleOAuthCallback(clerkId, code);
    res.redirect(process.env.FRONTEND_URL ?? 'http://localhost:5173');
  }

  @Post('scrape')
  @UseGuards(ClerkAuthGuard)
  async scrape(@Req() req: any) {
    return this.applicationsService.forceScrape(req.userId);
  }

  @Patch(':id/dismiss')
  @UseGuards(ClerkAuthGuard)
  async dismissApplication(@Req() req: any, @Param('id') id: string) {
    return this.applicationsService.dismissApplication(req.userId, id);
  }
}
