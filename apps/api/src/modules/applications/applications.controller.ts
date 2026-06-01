import { Controller, Get, Post, Query, Res, Body, Patch, Param } from '@nestjs/common';
import { Response } from 'express';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get()
  getAll() {
    return this.applicationsService.getApplications();
  }

  @Get('dashboard')
  getDashboard() {
    return this.applicationsService.getDashboardApplications();
  }

  @Get('gmail/auth')
  getGmailAuthUrl() {
    return { url: this.applicationsService.getGmailAuthUrl() };
  }

  @Get('gmail/status')
  getGmailStatus() {
    return { connected: this.applicationsService.isGmailConnected() };
  }

  @Get('gmail/callback')
  async handleCallback(@Query('code') code: string, @Res() res: Response) {
    await this.applicationsService.handleOAuthCallback(code);
    // Redirect back to the frontend dashboard
    res.redirect('http://localhost:5173');
  }
  @Post('scrape')
  async scrape() {
    return this.applicationsService.forceScrape();
  }

  @Patch(':id/dismiss')
  async dismissApplication(@Param('id') id: string) {
    return this.applicationsService.dismissApplication(id);
  }
}
