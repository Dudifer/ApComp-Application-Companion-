import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  Job, ContractTime, ContractType,
  JobHighlights, JobApplyOption,
} from '@apcomp/types';
import { JSearchResponse, JSearchJob } from '../types/jsearch.types';

const BASE_URL = 'https://jsearch.p.rapidapi.com/search';

function mapEmploymentType(val?: string): ContractTime {
  if (!val) return 'unknown';
  const v = val.toUpperCase();
  if (v === 'FULLTIME') return 'full_time';
  if (v === 'PARTTIME') return 'part_time';
  if (v === 'CONTRACTOR') return 'contractor';
  if (v === 'INTERN') return 'intern';
  return 'unknown';
}

export function mapJSearchJob(r: JSearchJob): Job {
  const highlights: JobHighlights = {
    qualifications: r.job_highlights?.Qualifications ?? [],
    responsibilities: r.job_highlights?.Responsibilities ?? [],
    benefits: r.job_highlights?.Benefits ?? [],
  };

  const applyOptions: JobApplyOption[] = (r.apply_options ?? []).map(o => ({
    publisher: o.publisher,
    url: o.apply_link,
    isDirect: o.is_direct,
  }));

  const locationParts = [r.job_city, r.job_state].filter(Boolean);
  const displayName = locationParts.length > 0
    ? locationParts.join(', ')
    : r.job_country ?? 'Unknown';

  // Extract tags from required skills + qualifications headlines
  const tags = [
    ...(r.job_required_skills ?? []),
    ...(r.job_highlights?.Qualifications ?? [])
      .filter(q => q.length < 40) // short lines are likely skill names
      .slice(0, 4),
  ].slice(0, 8);

  return {
    id: `jsearch-${r.job_id}`,
    externalId: r.job_id,
    source: 'jsearch',

    title: r.job_title,
    company: r.employer_name ?? 'Unknown',
    companyLogo: r.employer_logo ?? undefined,
    companyWebsite: r.employer_website ?? undefined,
    companyType: r.employer_company_type ?? undefined,

    location: {
      displayName,
      city: r.job_city ?? undefined,
      state: r.job_state ?? undefined,
      country: r.job_country ?? undefined,
      lat: r.job_latitude ?? undefined,
      lng: r.job_longitude ?? undefined,
    },
    remote: r.job_is_remote ?? false,

    description: r.job_description ?? '',
    highlights,
    tags,

    url: r.job_apply_link ?? r.job_google_link,
    applyOptions,
    applyIsDirect: r.job_apply_is_direct,
    applyQualityScore: r.job_apply_quality_score,
    googleJobLink: r.job_google_link,

    contractTime: mapEmploymentType(r.job_employment_type),
    contractType: 'unknown',
    employmentType: r.job_employment_type,
    publisher: r.job_publisher,

    salary: (r.job_min_salary || r.job_max_salary) ? {
      min: r.job_min_salary ?? undefined,
      max: r.job_max_salary ?? undefined,
      currency: r.job_salary_currency ?? 'USD',
      period: r.job_salary_period ?? undefined,
    } : undefined,

    experience: r.job_required_experience ? {
      noExperienceRequired: r.job_required_experience.no_experience_required,
      requiredMonths: r.job_required_experience.required_experience_in_months ?? undefined,
      experienceMentioned: r.job_required_experience.experience_mentioned,
    } : undefined,

    education: r.job_required_education ? {
      bachelorsRequired: r.job_required_education.bachelors_degree,
      postgraduateRequired: r.job_required_education.postgraduate_degree,
      certificationRequired: r.job_required_education.professional_certification,
      degreePreferred: r.job_required_education.degree_preferred,
    } : undefined,

    postedAt: r.job_posted_at_datetime_utc,
    expiresAt: r.job_offer_expiration_datetime_utc ?? undefined,

    relevanceScore: 0,
    status: 'new',
  };
}

@Injectable()
export class JSearchProvider {
  private readonly logger = new Logger(JSearchProvider.name);

  async fetchJobs(query: string, numPages = 1): Promise<Job[]> {
    try {
      const { data } = await axios.get<JSearchResponse>(BASE_URL, {
        headers: {
          'X-RapidAPI-Key': process.env.JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
        params: {
          query: `${query} in United States`,
          page: '1',
          num_pages: String(numPages),
          remote_jobs_only: 'false',
        },
      });

      return (data.data ?? []).map(mapJSearchJob);
    } catch (err) {
      this.logger.error('JSearch fetch failed', err);
      return [];
    }
  }
}
