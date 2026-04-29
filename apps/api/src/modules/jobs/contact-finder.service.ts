import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

const HUNTER_BASE = 'https://api.hunter.io/v2';

export interface HunterContact {
  firstName?: string;
  lastName?: string;
  email: string;
  position?: string;
  confidence: number; // 0-100
  linkedin?: string;
}

export interface ContactResult {
  company: string;
  domain: string;
  emailPattern?: string;  // e.g. "{first}.{last}@stripe.com"
  contacts: HunterContact[];
  patternExample?: string; // e.g. "john.doe@stripe.com"
  fromCache: boolean;
}

@Injectable()
export class ContactFinderService {
  private readonly logger = new Logger(ContactFinderService.name);
  private readonly cache = new Map<string, ContactResult>();

  async findContacts(company: string, domain: string): Promise<ContactResult> {
    const cacheKey = domain.toLowerCase();

    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      this.logger.log(`Cache hit for ${domain}`);
      return { ...this.cache.get(cacheKey)!, fromCache: true };
    }

    try {
      const { data } = await axios.get(`${HUNTER_BASE}/domain-search`, {
        params: {
          domain,
          api_key: process.env.HUNTER_API_KEY,
          limit: 5,           // only fetch 5 contacts max to save credits
          type: 'personal',   // personal emails only, not generic info@ etc
        },
        timeout: 5000,
      });

      const raw = data?.data;
      if (!raw) throw new Error('No data returned from Hunter');

      // Extract email pattern
      const pattern = raw.pattern
        ? `${raw.pattern}@${domain}`
        : undefined;

      // Map contacts, sorted by confidence
      const contacts: HunterContact[] = (raw.emails ?? [])
        .map((e: any) => ({
          firstName: e.first_name ?? undefined,
          lastName: e.last_name ?? undefined,
          email: e.value,
          position: e.position ?? undefined,
          confidence: e.confidence ?? 0,
          linkedin: e.linkedin ?? undefined,
        }))
        .sort((a: HunterContact, b: HunterContact) => b.confidence - a.confidence);

      // Build a pattern example if we have a pattern and a contact name
      const patternExample = pattern && contacts[0]?.firstName && contacts[0]?.lastName
        ? pattern
            .replace('{first}', contacts[0].firstName.toLowerCase())
            .replace('{last}', contacts[0].lastName.toLowerCase())
            .replace('{f}', contacts[0].firstName[0].toLowerCase())
            .replace('{l}', contacts[0].lastName[0].toLowerCase())
        : undefined;

      const result: ContactResult = {
        company,
        domain,
        emailPattern: pattern,
        patternExample,
        contacts,
        fromCache: false,
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      this.logger.error(`Hunter lookup failed for ${domain}:`, err.message);
      
      // Return empty result rather than throwing — don't break the UI
      const empty: ContactResult = {
        company,
        domain,
        contacts: [],
        fromCache: false,
      };
      return empty;
    }
  }
}
