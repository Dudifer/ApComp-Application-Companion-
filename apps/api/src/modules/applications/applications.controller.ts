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
import { ClerkAuthGuard } from '../../auth/clerk.guard';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

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

  // Requires auth so we can encode req.userId into the OAuth state param
  @Get('gmail/auth')
  @UseGuards(ClerkAuthGuard)
  getGmailAuthUrl(@Req() req: any) {
    return { url: this.applicationsService.getGmailAuthUrl(req.userId) };
  }

  @Get('gmail/status')
  @UseGuards(ClerkAuthGuard)
  async getGmailStatus(@Req() req: any) {
    return { connected: await this.applicationsService.isGmailConnected(req.userId) };
  }

  // No auth guard — Google's redirect carries no Authorization header.
  // The user is identified by decoding the state param we encoded in getGmailAuthUrl.
  @Get('gmail/callback')
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
