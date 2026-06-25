import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService, GmailTokens, JOB_EMAIL_FILTERS } from './gmail.service';
import { ApplicationStatus } from '../../../generated/prisma';
import { BadRequestException } from '@nestjs/common/exceptions/bad-request.exception';
import { UserService } from '../../auth/user.service';

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

  /** Set of DB user IDs that are currently being scraped — one entry per user. */
  private readonly scrapingUsers = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailService,
    private readonly userService: UserService,
  ) {}

  // ---------------------------------------------------------------------------
  // Per-user Gmail token storage (DB-backed)
  // ---------------------------------------------------------------------------

  private async loadGmailTokens(dbUserId: string): Promise<GmailTokens | null> {
    const row = await this.prisma.gmailToken.findUnique({ where: { userId: dbUserId } });
    if (!row) return null;
    return {
      access_token: row.accessToken,
      refresh_token: row.refreshToken ?? undefined,
      expiry_date: row.expiryDate ? row.expiryDate.getTime() : undefined,
    };
  }

  private async saveGmailTokens(dbUserId: string, tokens: GmailTokens): Promise<void> {
    await this.prisma.gmailToken.upsert({
      where: { userId: dbUserId },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        userId: dbUserId,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token ?? null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  getGmailAuthUrl(clerkId: string): string {
    // Encode the Clerk ID in OAuth state so the callback can identify the user
    // without needing an auth header (Google's redirect carries none).
    const state = Buffer.from(clerkId).toString('base64url');
    return this.gmail.getAuthUrl(state);
  }

  async handleOAuthCallback(clerkId: string, code: string): Promise<void> {
    const dbUserId = await this.userService.ensureUser(clerkId);
    const tokens = await this.gmail.exchangeCode(code);
    await this.saveGmailTokens(dbUserId, tokens);
    this.logger.log(`Gmail tokens saved for user ${dbUserId}`);
    await this.scrapeEmails(dbUserId);
  }

  async isGmailConnected(clerkId: string): Promise<boolean> {
    const dbUserId = await this.resolveUserId(clerkId);
    const row = await this.prisma.gmailToken.findUnique({ where: { userId: dbUserId } });
    return !!row?.accessToken;
  }

  async getApplications(clerkId: string): Promise<ApplicationDto[]> {
    const userId = await this.resolveUserId(clerkId);

    // Background auto-scrape: per-user, non-blocking
    if (!this.scrapingUsers.has(userId) && (await this.isGmailConnected(clerkId)) && (await this.shouldScrape(userId))) {
      this.scrapingUsers.add(userId);
      this.scrapeEmails(userId)
        .catch(err => this.logger.warn('Background scrape failed:', err))
        .finally(() => { this.scrapingUsers.delete(userId); });
    }

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

  async getDashboardApplications(clerkId: string): Promise<ApplicationDto[]> {
    // Pass clerkId directly — getApplications handles resolution
    const all = await this.getApplications(clerkId);
    return all.filter(a => !['REJECTED', 'WITHDRAWN'].includes(a.status));
  }

  async forceScrape(clerkId: string): Promise<{ success: boolean } | { busy: boolean }> {
    const userId = await this.resolveUserId(clerkId);

    if (this.scrapingUsers.has(userId)) {
      return { busy: true };
    }

    const tokens = await this.loadGmailTokens(userId);
    if (!tokens) {
      throw new BadRequestException('Gmail not connected');
    }

    this.scrapingUsers.add(userId);
    try {
      await this.scrapeEmails(userId);
      return { success: true };
    } finally {
      this.scrapingUsers.delete(userId);
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

  // ---------------------------------------------------------------------------
  // Internal helpers (all take DB user IDs, not Clerk IDs)
  // ---------------------------------------------------------------------------

  /** Resolves a Clerk ID → internal DB user ID. */
  private async resolveUserId(clerkId: string): Promise<string> {
    return this.userService.ensureUser(clerkId);
  }

  private async shouldScrape(dbUserId: string): Promise<boolean> {
    const lastScrapedAt = await this.getLastScrapedAt(dbUserId);
    if (!lastScrapedAt) return true;
    const hoursSince = (Date.now() - lastScrapedAt.getTime()) / (1000 * 60 * 60);
    return hoursSince >= 24;
  }

  async scrapeEmails(dbUserId: string): Promise<void> {
    const tokens = await this.loadGmailTokens(dbUserId);
    if (!tokens) return;

    this.logger.log(`Starting Gmail scrape for user ${dbUserId}...`);

    const scraped = await this.gmail.scrapeApplicationEmails(
      tokens,
      JOB_EMAIL_FILTERS,
    );

    this.logger.log(`Gmail returned ${scraped.length} matching emails`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const email of scraped) {
      const existing = await this.prisma.application.findFirst({
        where: {
          userId: dbUserId,
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
            userId: dbUserId,
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
          create: { id: email.id, userId: dbUserId },
        });
      }
    }

    this.logger.log(`Scrape complete: ${created} created, ${updated} updated, ${skipped} skipped`);
    await this.setLastScrapedAt(dbUserId);
  }

  private async autoRejectStale(dbUserId: string): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - AUTO_REJECT_DAYS);

    const result = await this.prisma.application.updateMany({
      where: {
        userId: dbUserId,
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

  private async getLastScrapedAt(dbUserId: string): Promise<Date | null> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: dbUserId },
    });
    return settings?.lastScrapedAt ?? null;
  }

  private async setLastScrapedAt(dbUserId: string): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId: dbUserId },
      update: { lastScrapedAt: new Date() },
      create: { userId: dbUserId, lastScrapedAt: new Date() },
    });
  }
}
