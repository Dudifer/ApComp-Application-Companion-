import { Controller, Get, Post, Query, Res, Body, Patch, Param, Req, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApplicationsService } from './applications.service';
import { Request } from 'express';
import { AuthenticatedController } from '../../auth/authenticated.controller';
import { ClerkAuthGuard } from '../../auth/clerk.guard';

@Controller('applications')
export class ApplicationsController extends AuthenticatedController {
  constructor(private readonly applicationsService: ApplicationsService) { super(); }

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

  @Get('gmail/auth')
  getGmailAuthUrl(@Req() req: any) {
    return { url: this.applicationsService.getGmailAuthUrl() };
  }

  @Get('gmail/status')
  getGmailStatus(@Req() req: any) {
    return { connected: this.applicationsService.isGmailConnected(req.userId) };
  }

  @Get('gmail/callback')
  async handleCallback(@Req() req: any, @Query('code') code: string, @Res() res: Response) {
    await this.applicationsService.handleOAuthCallback(req.userId, code);
    // Redirect back to the frontend dashboard
    res.redirect('http://localhost:5173');
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
