import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService, GmailTokens } from './gmail.service';
import { ApplicationStatus } from '../../../generated/prisma';
import { BadRequestException } from '@nestjs/common/exceptions/bad-request.exception';

const DEV_USER_ID = 'dev-user';
const SCRAPE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const AUTO_REJECT_DAYS = 60;

export interface ApplicationDto {
  id: string;
  company: string;
  position?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  lastEmailSubject?: string;
  lastEmailDate?: string;
  isAutoRejected: boolean;
}

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);
  private lastScrapeTime: Date | null = null;
  private gmailTokens: GmailTokens | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
  ) {}

  setGmailTokens(tokens: GmailTokens) {
    this.gmailTokens = tokens;
  }

  getGmailAuthUrl(): string {
    return this.gmail.getAuthUrl();
  }

  async handleOAuthCallback(code: string): Promise<void> {
    const tokens = await this.gmail.exchangeCode(code);
    this.gmailTokens = tokens;
    this.logger.log('Gmail OAuth tokens stored');
    // Trigger immediate scrape
    await this.scrapeEmails();
  }

  isGmailConnected(): boolean {
    return !!this.gmailTokens?.access_token;
  }

  async getApplications(): Promise<ApplicationDto[]> {
    await this.ensureDevUser();

    // Scrape if connected and due
    if (this.isGmailConnected() && this.shouldScrape()) {
      await this.scrapeEmails().catch(err =>
        this.logger.warn('Scrape failed, returning cached data:', err)
      );
    }

    // Auto-reject stale applications
    await this.autoRejectStale();

    const apps = await this.prisma.application.findMany({
      where: { userId: DEV_USER_ID },
      orderBy: { updatedAt: 'desc' },
    });

    return apps.map(a => this.mapToDto(a));
  }

  async getDashboardApplications(): Promise<ApplicationDto[]> {
    const all = await this.getApplications();
    // Dashboard shows only active (non-rejected, non-withdrawn) applications
    return all.filter(a => !['REJECTED', 'WITHDRAWN'].includes(a.status));
  }

  private shouldScrape(): boolean {
    if (!this.lastScrapeTime) return true;
    return Date.now() - this.lastScrapeTime.getTime() > SCRAPE_INTERVAL_MS;
  }

  private async scrapeEmails(): Promise<void> {
    if (!this.gmailTokens) return;

    this.logger.log('Starting Gmail scrape...');
    this.lastScrapeTime = new Date();

    const scraped = await this.gmail.scrapeApplicationEmails(this.gmailTokens);

    let created = 0;
    let updated = 0;

    for (const email of scraped) {
      // Try to find existing application for this company
      const existing = await this.prisma.application.findFirst({
        where: {
          userId: DEV_USER_ID,
          company: { equals: email.company, mode: 'insensitive' },
        },
        orderBy: { appliedAt: 'desc' },
      });

      if (existing) {
        // Only update if this email is newer and status is a progression
        const emailIsNewer = email.emailDate > existing.updatedAt;
        const isProgression = this.isStatusProgression(existing.status, email.status);

        if (emailIsNewer && isProgression) {
          await this.prisma.application.update({
            where: { id: existing.id },
            data: {
              status: ApplicationStatus[email.status as keyof typeof ApplicationStatus] ?? ApplicationStatus.UNKNOWN,
              lastEmailSubject: email.subject,
              lastEmailDate: email.emailDate,
              updatedAt: email.emailDate,
            },
          });
          updated++;
        }
      } else {
        // Create new application
        await this.prisma.application.create({
          data: {
            userId: DEV_USER_ID,
            company: email.company,
            role: email.position ?? 'Unknown Position',
            status: ApplicationStatus[email.status as keyof typeof ApplicationStatus] ?? ApplicationStatus.UNKNOWN,
            lastEmailSubject: email.subject,
            lastEmailDate: email.emailDate,
            appliedAt: email.emailDate,
            updatedAt: email.emailDate,
          },
        });
        created++;
      }
    }

    this.logger.log(`Scrape complete: ${created} created, ${updated} updated`);
  }
  
  async forceScrape(): Promise<{ scraped: number }> {
    const tokens = await this.loadTokens();
    if (!tokens) throw new BadRequestException('Gmail not connected');
    const scraped = await this.scrapeEmails(tokens);
    return { scraped };
  }
  private async autoRejectStale(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_REJECT_DAYS);

    const result = await this.prisma.application.updateMany({
      where: {
        userId: DEV_USER_ID,
        status: {
          in: [
            ApplicationStatus.APPLIED,
            ApplicationStatus.SUBMITTED,
            ApplicationStatus.VIEWED,
            ApplicationStatus.ASSESSMENT,
          ],
        },
        updatedAt: { lt: cutoff },
      },
      data: { status: ApplicationStatus.REJECTED },
    });

    if (result.count > 0) {
      this.logger.log(`Auto-rejected ${result.count} stale applications`);
    }
  }

  private isStatusProgression(current: string, next: string): boolean {
    const order: Record<string, number> = {
      UNKNOWN: 0,
      SUBMITTED: 1,
      APPLIED: 1,
      VIEWED: 2,
      ASSESSMENT: 3,
      INTERVIEW: 4,
      OFFER: 5,
      REJECTED: 6,
      WITHDRAWN: 6,
    };
    return (order[next] ?? 0) >= (order[current] ?? 0);
  }

  private async ensureDevUser() {
    return this.prisma.user.upsert({
      where: { id: DEV_USER_ID },
      update: {},
      create: {
        id: DEV_USER_ID,
        email: process.env.DEV_USER_EMAIL ?? 'dev@apcomp.local',
        name: 'Dev User',
      },
    });
  }

  private mapToDto(a: any): ApplicationDto {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_REJECT_DAYS);

    return {
      id: a.id,
      company: a.company,
      position: a.role !== 'Unknown Position' ? a.role : undefined,
      status: a.status,
      appliedAt: a.appliedAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      lastEmailSubject: a.lastEmailSubject ?? undefined,
      lastEmailDate: a.lastEmailDate?.toISOString() ?? undefined,
      isAutoRejected: a.status === 'REJECTED' && a.updatedAt < cutoff,
    };
  }
}
