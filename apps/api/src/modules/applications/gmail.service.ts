import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { detectStatus, extractCompany, extractPosition } from './email-parser';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Keywords to filter emails to only job-related ones
export const JOB_EMAIL_FILTERS = [
  'application',
  'applied',
  'applying',
  'position',
  'role',
  'opportunity',
  'interview',
  'offer',
  'candidate',
  'hiring',
  'recruiter',
  'job',
  'career',
  'assessment',
  'unfortunately',
  'thank you for your interest',
  'received your application',
  'we have received',
  'thank you for applying',
  'your submission',
  'your interest in joining',
  'next steps',
  'move forward',
  'review your',
];

export interface GmailTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

export interface ScrapedApplication {
  company: string;
  position?: string;
  status: string;
  emailDate: Date;
  subject: string;
  gmailMessageId: string;
  matchedKeyword?: string;
}

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  private createOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,//await this.isGmailConnected()
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(): string {
    const oauth2Client = this.createOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
  }

  async exchangeCode(code: string): Promise<GmailTokens> {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  }

  async scrapeApplicationEmails(tokens: GmailTokens, filters: string[]): Promise<ScrapedApplication[]> {
    const oauth2Client = this.createOAuthClient();
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build query — last 12 months, job-related keywords
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const filterQuery = filters.map(k => `"${k}"`).join(' OR ');
    const query = `(${filterQuery})`;

    this.logger.log(`Gmail query: ${query}`);

    // Fetch message IDs
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 200,
    });

    const messages = listRes.data.messages ?? [];
    this.logger.log(`Found ${messages.length} candidate emails`);

    const applications: ScrapedApplication[] = [];

    // Fetch each message in batches of 10
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(msg => this.parseMessage(gmail, msg.id!))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          applications.push(result.value);
        }
      }
    }

    // Filter out UNKNOWN status emails
    const filtered = applications.filter(a => a.status !== 'UNKNOWN');
    this.logger.log(`Parsed ${filtered.length} job-related emails`);

    return filtered;
  }

  private async parseMessage(
    gmail: any,
    messageId: string,
  ): Promise<ScrapedApplication | null> {
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = msg.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const from = getHeader('From');
      const subject = getHeader('Subject');
      const dateStr = getHeader('Date');

      if (!subject) return null;

      const { status, keyword } = detectStatus(subject, '');
      if (status === 'UNKNOWN') return null;

      const emailDate = dateStr ? new Date(dateStr) : new Date();
      const company = extractCompany(from, subject);
      const position = extractPosition(subject);

      return {
        company,
        position,
        status,
        emailDate,
        subject,
        gmailMessageId: messageId,
        matchedKeyword: keyword,
      };
    } catch (err) {
      this.logger.warn(`Failed to parse message ${messageId}:`, err);
      return null;
    }
  }
}
