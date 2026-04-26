import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Job, ContractTime, ContractType } from '@pkg-types/job';
import { AdzunaSearchResponse, AdzunaJob } from '@pkg-types/adzuna.types';

const BASE_URL = 'https://api.adzuna.com/v1/api/jobs/us/search/1';

function mapContractTime(val?: string): ContractTime {
  if (val === 'full_time') return 'full_time';
  if (val === 'part_time') return 'part_time';
  return 'unknown';
}

function mapContractType(val?: string): ContractType {
  if (val === 'permanent') return 'permanent';
  if (val === 'contract') return 'contract';
  return 'unknown';
}

export function mapAdzunaJob(r: AdzunaJob): Job {
  const isRemote = /remote/i.test(r.title + r.description);

  return {
    id: `adzuna-${r.id}`,
    externalId: r.id,
    source: 'adzuna',

    title: r.title,
    company: r.company?.display_name ?? 'Unknown',

    location: {
      displayName: r.location?.display_name ?? 'Unknown',
      area: r.location?.area ?? [],
      country: r.location?.area?.[0],
    },
    remote: isRemote,

    description: r.description ?? '',
    tags: [],

    url: r.redirect_url,
    applyOptions: [{
      publisher: 'Adzuna',
      url: r.redirect_url,
      isDirect: false,
    }],

    contractTime: mapContractTime(r.contract_time),
    contractType: mapContractType(r.contract_type),
    employmentType: r.contract_time,
    publisher: 'Adzuna',

    salary: (r.salary_min || r.salary_max) ? {
      min: r.salary_min,
      max: r.salary_max,
      currency: 'USD',
      isPredicted: r.salary_is_predicted === 1,
    } : undefined,

    category: r.category?.label,
    postedAt: r.created,
    relevanceScore: 0,
    status: 'new',
  };
}

@Injectable()
export class AdzunaProvider {
  private readonly logger = new Logger(AdzunaProvider.name);

  async fetchJobs(query: string, resultsPerPage = 20): Promise<Job[]> {
    try {
      const { data } = await axios.get<AdzunaSearchResponse>(BASE_URL, {
        params: {
          app_id: process.env.ADZUNA_APP_ID,
          app_key: process.env.ADZUNA_APP_KEY,
          what: query,
          where: 'united states',
          results_per_page: resultsPerPage,
          content_type: 'application/json',
          what_exclude: 'nursing,nurse,healthcare,medical,dental,sales',
        },
      });

      return (data.results ?? []).map(mapAdzunaJob);
    } catch (err) {
      this.logger.error('Adzuna fetch failed', err);
      return [];
    }
  }
}
