export type LeadPhoto = {
  url?: string;
  src?: string;
  path?: string;
  template?: string;
  alt?: string;
};

export interface LeadEvent {
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  lead_type: 'REDESIGN' | 'NEW_SITE' | string;
  lead_status: 'NEW' | 'PROCESSED' | 'JUNK' | 'CHAIN' | string;
  contact_status: string;
  priority: number;
  score: number;
  reason: string | null;
  source_org_id: string;
  name: string;
  category: string;
  address: string;
  city: string;
  rating: number | null;
  review_count: number | null;
  websites: string[];
  phones: { number: string; info: string }[];
  social_links: string[];
  source_url: string;
  data_folder: string;
  photos?: (LeadPhoto | string)[];
  region?: string;
}

export interface RunConfig {
  queries: string;
  runName: string;
  maxPerQuery: number;
  minReviews: number;
  outputDir: string;
  excludeChains: string;
  skipWithSite: boolean;
  keepSitesForRedesign: boolean;
  requirePhotos: boolean;
  downloadPhotos: boolean;
}

export interface RunResult {
  saved: unknown[];
  skipped: unknown[];
  output: string;
  error?: string;
}
