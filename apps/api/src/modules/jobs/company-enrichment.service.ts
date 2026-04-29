import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Job } from '@apcomp/types';

const CLEARBIT_AUTOCOMPLETE = 'https://autocomplete.clearbit.com/v1/companies/suggest';
const CAREERS_PATHS = ['/careers', '/jobs', '/work-with-us', '/join-us', '/about/careers'];

// Known company domains to skip API calls for common companies
const KNOWN_DOMAINS: Record<string, string> = {
  'google': 'google.com',
  'meta': 'meta.com',
  'facebook': 'meta.com',
  'apple': 'apple.com',
  'amazon': 'amazon.com',
  'microsoft': 'microsoft.com',
  'netflix': 'netflix.com',
  'stripe': 'stripe.com',
  'airbnb': 'airbnb.com',
  'uber': 'uber.com',
  'lyft': 'lyft.com',
  'twitter': 'x.com',
  'x': 'x.com',
  'linkedin': 'linkedin.com',
  'github': 'github.com',
  'gitlab': 'gitlab.com',
  'shopify': 'shopify.com',
  'slack': 'slack.com',
  'notion': 'notion.so',
  'figma': 'figma.com',
  'vercel': 'vercel.com',
  'supabase': 'supabase.com',
  'cloudflare': 'cloudflare.com',
  'datadog': 'datadoghq.com',
  'twilio': 'twilio.com',
  'snowflake': 'snowflake.com',
  'databricks': 'databricks.com',
  'palantir': 'palantir.com',
  'openai': 'openai.com',
  'anthropic': 'anthropic.com',
};

@Injectable()
export class CompanyEnrichmentService {
  private readonly logger = new Logger(CompanyEnrichmentService.name);
  private readonly domainCache = new Map<string, string | null>();

  async enrichJobs(jobs: Job[]): Promise<Job[]> {
    return Promise.all(jobs.map(job => this.enrichJob(job)));
  }

  private async enrichJob(job: Job): Promise<Job> {
    // Already has a direct apply URL — keep it but also try to find company website
    const companyWebsite = job.companyWebsite ?? await this.findCompanyWebsite(job.company);

    return {
      ...job,
      companyWebsite: companyWebsite ?? undefined,
      // If no apply URL at all, use Google Jobs as fallback
      url: job.url ?? this.googleJobsFallback(job.company, job.title),
    };
  }

  async findCompanyWebsite(companyName: string): Promise<string | null> {
    const normalizedName = companyName.toLowerCase().trim();

    // Check cache first
    if (this.domainCache.has(normalizedName)) {
      return this.domainCache.get(normalizedName) ?? null;
    }

    // Check known domains
    const knownKey = Object.keys(KNOWN_DOMAINS).find(k =>
      normalizedName.includes(k)
    );
    if (knownKey) {
      const domain = `https://${KNOWN_DOMAINS[knownKey]}`;
      this.domainCache.set(normalizedName, domain);
      return domain;
    }

    // Try Clearbit autocomplete
    const clearbitResult = await this.queryClearbit(companyName);
    if (clearbitResult) {
      this.domainCache.set(normalizedName, clearbitResult);
      return clearbitResult;
    }

    // Cache the miss so we don't keep retrying
    this.domainCache.set(normalizedName, null);
    return null;
  }

  private async queryClearbit(companyName: string): Promise<string | null> {
    try {
      const { data } = await axios.get<{ name: string; domain: string }[]>(
        CLEARBIT_AUTOCOMPLETE,
        {
          params: { query: companyName },
          timeout: 3000,
        }
      );

      if (!data?.length) return null;

      // Find the best match — prefer exact name match
      const exact = data.find(
        c => c.name.toLowerCase() === companyName.toLowerCase()
      );
      const best = exact ?? data[0];

      if (!best?.domain) return null;

      return `https://${best.domain}`;
    } catch (err) {
      this.logger.warn(`Clearbit lookup failed for "${companyName}": ${(err as Error).message}`);
      return null;
    }
  }

  buildCareersUrl(domain: string): string {
    // Return the careers page URL — we just append /careers as the most common path
    // The frontend can display this as a fallback link
    const base = domain.replace(/\/$/, '');
    return `${base}/careers`;
  }

  googleJobsFallback(company: string, title: string): string {
    const query = encodeURIComponent(`${company} ${title} jobs`);
    return `https://www.google.com/search?q=${query}&ibp=htl;jobs`;
  }
}
