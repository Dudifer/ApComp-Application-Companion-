import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { detectStatus, extractCompany, extractPosition } from './email-parser';
import * as fs from 'fs';
import * as path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

// Keywords to filter emails to only job-related ones
export const JOB_EMAIL_FILTERS = [
  'application',
  'applied',
  'applying',
  'your cv',
  'your cover letter',
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
  'the profile you submitted',
  'thank you for your interest',
  'you for expressing interest',
  'your resume',
  'we have received',
  'thank you for applying',
  'your submission',
  'your interest in joining',
  'next steps',
  'move forward',
  'review your',
];

const excludeSubjects = [
  'jobs you might like',
  'new jobs for you',
  'recommended jobs',
  'job alert',
  'you should apply to',
  'apply now',
  'jobs in',
].map(s => `-subject:"${s}"`).join(' ');

const excludeSenders = [
  'lensa',
  'glassdoor',
  'jobleads',
  'indeed',
  'ziprecruiter',
  'linkedin',
].map(s => `-from:${s}`).join(' ');

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
  id: string;
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

  getAuthUrl(state: string): string {
    const oauth2Client = this.createOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent', // always get a refresh_token
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

    google.options({ auth: oauth2Client });
    const gmail = google.gmail('v1');

    // Build query — last 6 months, job-related keywords
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const afterDate = sixMonthsAgo.toISOString().slice(0, 10).replace(/-/g, '/'); // YYYY/MM/DD

    const filterQuery = filters.map(k => `"${k}"`).join(' OR ');
    const query = `after:${afterDate} (${filterQuery}) ${excludeSenders} ${excludeSubjects}`;

    this.logger.log(`Gmail query: ${query}`);

    // Fetch message IDs
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 300,
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
        format: 'full',  // ← change from 'metadata' to 'full' to get body
        metadataHeaders: ['From', 'Subject', 'Date'],
      });

      const headers = msg.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

      const from = getHeader('From');
      const subject = getHeader('Subject');
      const dateStr = getHeader('Date');

      if (!subject) return null;

      const body = this.extractBody(msg.data.payload);

      const { status, keyword } = detectStatus(subject, body); // ← pass body
      const logLine = `[${status}] keyword="${keyword ?? 'none'}" subject="${subject}"\n`;
      fs.appendFileSync(
        path.join(process.cwd(), 'email-parse-log.txt'),
        logLine,
        'utf-8',
      );
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
        id: messageId,
        matchedKeyword: keyword,
      };
    } catch (err) {
      this.logger.warn(`Failed to parse message ${messageId}:`, err);
      return null;
    }
  }

  private extractBody(payload: any): string {
    if (!payload) return '';

    // Direct body data
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }

    // Multipart — look for text/plain first, then text/html
    if (payload.parts) {
      const textPart = payload.parts.find((p: any) => p.mimeType === 'text/plain');
      if (textPart?.body?.data) {
        return Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
      const htmlPart = payload.parts.find((p: any) => p.mimeType === 'text/html');
      if (htmlPart?.body?.data) {
        // Strip HTML tags for plain text
        return Buffer.from(htmlPart.body.data, 'base64')
          .toString('utf-8')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      // Nested multipart
      for (const part of payload.parts) {
        const nested = this.extractBody(part);
        if (nested) return nested;
      }
    }

    return '';
  }
}
