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
  /** Non-fatal note (e.g. "couldn't normalize a job-board URL"). */
  warning?: string;
}

// ATS / job-board hosts that should never be passed to Hunter as the
// candidate's company. If the caller gave us one of these we surface a
// warning and skip the API call rather than wasting credits.
const JOB_BOARD_HOSTS = [
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workday.com',
  'myworkdayjobs.com',
  'workable.com',
  'jobvite.com',
  'smartrecruiters.com',
  'recruitee.com',
  'breezy.hr',
  'bamboohr.com',
  'icims.com',
  'taleo.net',
  'successfactors.com',
  'indeed.com',
  'linkedin.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'dice.com',
];

// Subdomain prefixes that companies commonly use for their careers site
// (`careers.netapp.com`, `jobs.stripe.com`, etc.). These are stripped before
// we send the domain to Hunter.
const CAREER_SUBDOMAINS = [
  'careers', 'career',
  'jobs', 'job',
  'apply', 'application', 'applications',
  'hire', 'hiring',
  'talent',
  'recruiting', 'recruit', 'recruitment',
  'work', 'workforus',
  'join', 'joinus',
  'people',
];

// Country-code second-level TLDs we need to keep so we don't reduce
// "company.co.uk" to "co.uk".
const TWO_PART_TLDS = [
  'co.uk', 'co.jp', 'co.kr', 'co.in', 'co.nz', 'co.za',
  'com.au', 'com.br', 'com.mx', 'com.ar', 'com.sg', 'com.hk',
  'org.uk', 'ac.uk', 'gov.uk',
];

@Injectable()
export class ContactFinderService {
  private readonly logger = new Logger(ContactFinderService.name);
  private readonly cache = new Map<string, ContactResult>();

  /**
   * Reduce an arbitrary input (full URL, subdomained host, bare host) to the
   * registrable domain we want to send to Hunter.
   *
   * Examples:
   *   "https://careers.netapp.com/job/..."  -> "netapp.com"
   *   "job-boards.greenhouse.io"            -> null  (job-board, see warning)
   *   "boards.greenhouse.io/alarmcom/jobs"  -> null
   *   "company.co.uk"                       -> "company.co.uk"
   *   "jobs.company.co.uk"                  -> "company.co.uk"
   */
  normalizeDomain(input: string): { domain: string | null; warning?: string } {
    if (!input) return { domain: null, warning: 'empty domain' };

    // Strip protocol, path, query, and any port.
    let host = input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');

    if (!host) return { domain: null, warning: 'empty after normalization' };

    // Refuse to look up generic job-board hosts.
    if (JOB_BOARD_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
      return {
        domain: null,
        warning: `${host} is an ATS/job-board host — can't look up contacts there. Use the hiring company's own domain.`,
      };
    }

    const labels = host.split('.');

    // Keep two-part TLDs intact: "jobs.company.co.uk" -> "company.co.uk"
    const lastTwo = labels.slice(-2).join('.');
    const lastThree = labels.length >= 3 ? labels.slice(-3).join('.') : null;
    const isTwoPartTld = TWO_PART_TLDS.includes(lastTwo);
    let base = isTwoPartTld ? (lastThree ?? lastTwo) : lastTwo;

    // If there's a careers-style prefix and we still have more than two labels
    // (i.e. a real subdomain), drop the prefix and re-reduce.
    if (labels.length > (isTwoPartTld ? 3 : 2)) {
      const prefix = labels[0];
      if (CAREER_SUBDOMAINS.includes(prefix)) {
        base = isTwoPartTld
          ? labels.slice(-3).join('.')
          : labels.slice(-2).join('.');
      } else {
        // Unknown subdomain (e.g. "engineering.company.com"). Still reduce to
        // the registrable domain so Hunter gets the right thing.
        base = isTwoPartTld
          ? labels.slice(-3).join('.')
          : labels.slice(-2).join('.');
      }
    }

    return { domain: base };
  }

  async findContacts(company: string, domain: string): Promise<ContactResult> {
    const { domain: normalized, warning } = this.normalizeDomain(domain);
    if (!normalized) {
      this.logger.warn(`Skipping Hunter lookup for "${domain}": ${warning}`);
      return {
        company,
        domain,
        contacts: [],
        fromCache: false,
        warning: warning ?? `Couldn't derive a company domain from "${domain}".`,
      };
    }

    if (normalized !== domain.toLowerCase()) {
      this.logger.log(`Normalized domain "${domain}" -> "${normalized}" for Hunter`);
    }

    const cacheKey = normalized;
    if (this.cache.has(cacheKey)) {
      this.logger.log(`Cache hit for ${normalized}`);
      return { ...this.cache.get(cacheKey)!, fromCache: true };
    }

    try {
      const { data } = await axios.get(`${HUNTER_BASE}/domain-search`, {
        params: {
          domain: normalized,
          api_key: process.env.HUNTER_API_KEY,
          limit: 5,
          type: 'personal',
        },
        timeout: 5000,
      });

      const raw = data?.data;
      if (!raw) throw new Error('No data returned from Hunter');

      const pattern = raw.pattern ? `${raw.pattern}@${normalized}` : undefined;

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

      const patternExample = pattern && contacts[0]?.firstName && contacts[0]?.lastName
        ? pattern
            .replace('{first}', contacts[0].firstName.toLowerCase())
            .replace('{last}', contacts[0].lastName.toLowerCase())
            .replace('{f}', contacts[0].firstName[0].toLowerCase())
            .replace('{l}', contacts[0].lastName[0].toLowerCase())
        : undefined;

      const result: ContactResult = {
        company,
        domain: normalized,
        emailPattern: pattern,
        patternExample,
        contacts,
        fromCache: false,
      };

      this.cache.set(cacheKey, result);
      return result;
    } catch (err: any) {
      this.logger.error(`Hunter lookup failed for ${normalized}: ${err.message}`);
      return {
        company,
        domain: normalized,
        contacts: [],
        fromCache: false,
        warning: 'Hunter lookup failed; try again later.',
      };
    }
  }
}
