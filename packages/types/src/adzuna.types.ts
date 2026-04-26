export interface AdzunaLocation {
  __CLASS__: string;
  area: string[];
  display_name: string;
}

export interface AdzunaCompany {
  __CLASS__: string;
  display_name: string;
}

export interface AdzunaCategory {
  __CLASS__: string;
  label: string;
  tag: string;
}

export interface AdzunaJob {
  __CLASS__: string;
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  created: string;
  contract_time?: 'full_time' | 'part_time';
  contract_type?: 'permanent' | 'contract';
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: 0 | 1;
  location: AdzunaLocation;
  company: AdzunaCompany;
  category: AdzunaCategory;
}

export interface AdzunaSearchResponse {
  __CLASS__: string;
  results: AdzunaJob[];
  count?: number;
  mean?: number;
}
