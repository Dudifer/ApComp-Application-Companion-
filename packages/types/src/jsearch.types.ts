export interface JSearchApplyOption {
  publisher: string;
  apply_link: string;
  is_direct: boolean;
}

export interface JSearchRequiredExperience {
  no_experience_required: boolean;
  required_experience_in_months: number | null;
  experience_mentioned: boolean;
  experience_preferred: boolean;
}

export interface JSearchRequiredEducation {
  postgraduate_degree: boolean;
  professional_certification: boolean;
  high_school: boolean;
  associates_degree: boolean;
  bachelors_degree: boolean;
  degree_mentioned: boolean;
  degree_preferred: boolean;
  professional_certification_mentioned: boolean;
}

export interface JSearchHighlights {
  Qualifications?: string[];
  Responsibilities?: string[];
  Benefits?: string[];
}

export interface JSearchJob {
  job_id: string;
  employer_name: string;
  employer_logo: string | null;
  employer_website: string | null;
  employer_company_type: string | null;
  job_publisher: string;
  job_employment_type: 'FULLTIME' | 'PARTTIME' | 'CONTRACTOR' | 'INTERN' | string;
  job_title: string;
  job_apply_link: string;
  job_apply_is_direct: boolean;
  job_apply_quality_score: number;
  apply_options: JSearchApplyOption[];
  job_description: string;
  job_is_remote: boolean;
  job_posted_at_timestamp: number;
  job_posted_at_datetime_utc: string;
  job_city: string | null;
  job_state: string | null;
  job_country: string | null;
  job_latitude: number | null;
  job_longitude: number | null;
  job_benefits: string | null;
  job_google_link: string;
  job_offer_expiration_datetime_utc: string | null;
  job_offer_expiration_timestamp: number | null;
  job_required_experience: JSearchRequiredExperience | null;
  job_required_skills: string[] | null;
  job_required_education: JSearchRequiredEducation | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_highlights: JSearchHighlights | null;
  job_job_title: string | null;
  job_posting_language: string;
  job_onet_soc: string | null;
  job_onet_job_zone: string | null;
  job_occupational_categories: string[] | null;
  job_naics_code: string | null;
  job_naics_name: string | null;
}

export interface JSearchResponse {
  status: string;
  request_id: string;
  parameters: Record<string, unknown>;
  data: JSearchJob[];
}
