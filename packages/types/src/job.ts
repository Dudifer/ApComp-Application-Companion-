export type JobSource = 'adzuna' | 'jsearch' | 'manual' | 'openjobdata';
export type JobStatus = 'new' | 'saved' | 'dismissed' | 'applied';
export type ContractTime = 'full_time' | 'part_time' | 'contractor' | 'intern' | 'unknown';
export type ContractType = 'permanent' | 'contract' | 'unknown';

export interface JobSalary {
  min?: number;
  max?: number;
  currency: string;
  period?: string;
  isPredicted?: boolean;
}

export interface JobLocation {
  displayName: string;
  city?: string;
  state?: string;
  country?: string;
  area?: string[];
  lat?: number;
  lng?: number;
}

export interface JobEducation {
  bachelorsRequired?: boolean;
  postgraduateRequired?: boolean;
  certificationRequired?: boolean;
  degreePreferred?: boolean;
}

export interface JobExperience {
  noExperienceRequired?: boolean;
  requiredMonths?: number;
  experienceMentioned?: boolean;
}

export interface JobApplyOption {
  publisher: string;
  url: string;
  isDirect: boolean;
}

export interface JobHighlights {
  qualifications?: string[];
  responsibilities?: string[];
  benefits?: string[];
}

export interface Job {
  id: string;
  externalId: string;
  source: JobSource;

  title: string;
  company: string;
  companyLogo?: string;
  companyWebsite?: string;
  companyType?: string;

  location: JobLocation;
  remote: boolean;

  description: string;
  highlights?: JobHighlights;
  tags: string[];

  url: string;
  applyOptions?: JobApplyOption[];
  applyIsDirect?: boolean;
  applyQualityScore?: number;
  googleJobLink?: string;

  contractTime: ContractTime;
  contractType: ContractType;
  employmentType?: string;
  publisher?: string;

  salary?: JobSalary;

  experience?: JobExperience;
  education?: JobEducation;

  postedAt: string;
  expiresAt?: string;

  category?: string;

  relevanceScore: number;
  status: JobStatus;
}

export interface DismissedJob {
  jobId: string;
  source: JobSource;
  company: string;
  title: string;
  reason?: string;
  dismissedAt: string;
}

export interface JobFeedWeights {
  adzuna: number;
  jsearch: number;
}

export interface CapturedJobInput {
  title: string;
  company: string;
  url: string;

  description?: string;
  location?: string;
  remote?: boolean;

  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;

  employmentType?: string;
  postedAt?: string;
  companyLogo?: string;

  tags?: string[];

  rawHtml?: string;

  sourceHost?: string;

  extractor?: string;
}
