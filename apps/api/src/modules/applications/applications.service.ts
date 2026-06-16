import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService, GmailTokens, JOB_EMAIL_FILTERS } from './gmail.service';
import { ApplicationStatus } from '../../../generated/prisma';
import { BadRequestException } from '@nestjs/common/exceptions/bad-request.exception';
import { UserService } from '../../auth/user.service';

// const DEV_USER_ID = 'dev-user';
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
  private isScraping = false;
  
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
    private readonly userService: UserService,
  ) {}

  setGmailTokens(tokens: GmailTokens) {
    this.gmailTokens = tokens;
  }

  getGmailAuthUrl(clerkId: string): string {
    // Encode the Clerk ID in OAuth state so the callback can identify the user
    // without needing an auth header (Google's redirect carries none).
    const state = Buffer.from(clerkId).toString('base64url');
    return this.gmail.getAuthUrl(state);
  }

  async handleOAuthCallback(clerkId: string, code: string): Promise<void> {
    const dbUserId = await this.userService.ensureUser(clerkId);
    const tokens = await this.gmail.exchangeCode(code);
    this.gmailTokens = tokens;
    this.logger.log('Gmail OAuth tokens stored');
    await this.scrapeEmails(dbUserId);
  }

  /** Resolves a Clerk ID to the internal DB user ID, creating the user if needed. */
  private async resolveUserId(clerkId: string): Promise<string> {
    return this.userService.ensureUser(clerkId);
  }

  isGmailConnected(userId: string): boolean {
    return !!this.gmailTokens?.access_token;
  }

  async getApplications(clerkId: string): Promise<ApplicationDto[]> {
    const userId = await this.resolveUserId(clerkId);

    // Scrape if connected, not already running, and due
    if (!this.isScraping && this.isGmailConnected(clerkId) && (await this.shouldScrape(userId))) {
      this.isScraping = true;
      this.scrapeEmails(userId)
        .catch(err => this.logger.warn('Background scrape failed:', err))
        .finally(() => { this.isScraping = false; });
    }

    // Auto-reject stale applications
    await this.autoRejectStale(userId);

    const apps = await this.prisma.application.findMany({
      where: {
        userId,
        status: { not: ApplicationStatus.DISMISSED },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return apps.map(a => this.mapToDto(a));
  }

  async getDashboardApplications(userId: string): Promise<ApplicationDto[]> {
    const all = await this.getApplications(userId);
    // Dashboard shows only active (non-rejected, non-withdrawn) applications
    return all.filter(a => !['REJECTED', 'WITHDRAWN'].includes(a.status));
  }

  private async shouldScrape(userId: string): Promise<boolean> {
    const lastScrapedAt = await this.getLastScrapedAt(userId);
    if (!lastScrapedAt) return true;
    const hoursSince = (Date.now() - lastScrapedAt.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  }

  async scrapeEmails(userId: string): Promise<void> {
    if (!this.gmailTokens) return;

    this.logger.log('Starting Gmail scrape...');
    this.lastScrapeTime = new Date();

    // Always fetch last 12 months — no date cutoff so we never miss emails
    const scraped = await this.gmail.scrapeApplicationEmails(
      this.gmailTokens,
      JOB_EMAIL_FILTERS,  // pass filters so gmail.service uses them in the query
    );

    this.logger.log(`Gmail returned ${scraped.length} matching emails`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const email of scraped) {
      const existing = await this.prisma.application.findFirst({
        where: {
          userId,
          company: { equals: email.company, mode: 'insensitive' },
        },
        orderBy: { appliedAt: 'desc' },
      });

      if (existing) {
        const emailIsNewer = email.emailDate > existing.updatedAt;
        const isProgression = this.isStatusProgression(existing.status, email.status);

        if (existing.status === ApplicationStatus.DISMISSED) {
          skipped++;
          continue;
        }

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
        await this.prisma.application.create({
          data: {
            userId,
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

      if (email.id) {
        await this.prisma.processedEmail.upsert({
          where: { id: email.id },
          update: {},
          create: { id: email.id, userId },
        });
      }
    }

    this.logger.log(`Scrape complete: ${created} created, ${updated} updated, ${skipped} skipped`);
    await this.setLastScrapedAt(userId);
  }

  private async autoRejectStale(userId: string): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_REJECT_DAYS);

    const result = await this.prisma.application.updateMany({
      where: {
        userId,
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

  async dismissApplication(clerkId: string, id: string): Promise<{ success: boolean }> {
    const userId = await this.resolveUserId(clerkId);
    await this.prisma.application.update({
      where: { id, userId },
      data: { status: ApplicationStatus.DISMISSED },
    });
    return { success: true };
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

  // private async ensureDevUser() {
  //   return this.prisma.user.upsert({
  //     where: { userId },
  //     update: {},
  //     create: {
  //       userId,
  //       email: process.env.DEV_USER_EMAIL ?? 'dev@apcomp.local',
  //       name: 'Dev User',
  //     },
  //   });
  // }

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

  async forceScrape(clerkId: string): Promise<{ success: boolean } | { busy: boolean }> {
    if (this.isScraping) {
      this.logger.warn('Scrape already in progress, ignoring request');
      return { busy: true };
    }

    if (!this.gmailTokens) {
      throw new BadRequestException('Gmail not connected');
    }

    const userId = await this.resolveUserId(clerkId);
    this.isScraping = true;
    try {
      await this.scrapeEmails(userId);
      return { success: true };
    } finally {
      this.isScraping = false;
    }
  }

  private async getLastScrapedAt(userId: string): Promise<Date | null> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    return settings?.lastScrapedAt ?? null;
  }

  private async setLastScrapedAt(userId: string): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: { lastScrapedAt: new Date() },
      create: { userId, lastScrapedAt: new Date() },
    });
  }
}
