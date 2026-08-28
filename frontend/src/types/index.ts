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

export type LeadType = 'REDESIGN' | 'NEW_SITE';
export type LeadStatus = 'NEW' | 'POTENTIAL' | 'IN_PROGRESS' | 'PROCESSED' | 'REJECT' | 'JUNK' | 'CHAIN';
export type ProviderSource = 'yandex' | '2gis';

export interface LeadSource {
  source: ProviderSource | string;
  source_org_id?: string;
  source_url: string;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface Lead {
  id: string;
  lead_type: LeadType;
  lead_status: LeadStatus;
  contact_status: string;
  priority: number;
  score: number;
  reason: string | null;
  viewed_at?: string | null;
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
  sources?: LeadSource[];
  data_folder: string | null;
  photos?: (LeadPhoto | string)[];
  region?: string;
}

export interface ProviderPreferences {
  provider_priority: ProviderSource | null;
  enabled_providers: ProviderSource[];
  max_scan_multiplier: number;
  twogis_mode: 'browser' | string;
  twogis_browser:
    | 'auto'
    | 'chrome'
    | 'edge'
    | 'yandex'
    | 'opera'
    | 'opera_gx'
    | 'brave'
    | 'vivaldi'
    | 'firefox'
    | 'safari'
    | 'custom'
    | string;
  twogis_browser_path: string;
  twogis_quiet_mode: boolean;
}

export interface RunConfig {
  queries: string;
  runName: string;
  maxQueries: number;
  maxPerQuery: number;
  requestDelaySeconds: number;
  minReviews: number;
  outputDir: string;
  excludeChains: string;
  skipWithSite: boolean;
  keepSitesForRedesign: boolean;
  refreshKnown: boolean;
  requirePhotos: boolean;
  downloadPhotos: boolean;
  fields_to_parse?: string[];
  providerPriority?: ProviderSource;
  enabledProviders?: ProviderSource[];
  maxScanPerQuery?: number;
  max_scan_multiplier?: number;
}

export interface RunResult {
  saved: unknown[];
  skipped: unknown[];
  output: string;
  error?: string;
  blocked_source?: ProviderSource | string;
  stats?: {
    saved_count?: number;
    skipped_count?: number;
    duplicate_count?: number;
    error_count?: number;
    scan_count?: number;
    created_count?: number;
    enriched_count?: number;
    existing_count?: number;
    skip_reasons?: Record<string, number>;
  };
  yandex_guard?: {
    date: string;
    search_requests: number;
    daily_limit: number;
    remaining: number;
    cooldown_until: string;
  };
}

export type RunJobStatusName =
  | 'IDLE'
  | 'RUNNING'
  | 'CANCEL_REQUESTED'
  | 'FINISHED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RATE_LIMITED';

export interface RunJobStatus {
  id?: string;
  status: RunJobStatusName | string;
  started_at?: string | null;
  finished_at?: string | null;
  current_query?: string;
  query_index?: number;
  query_total?: number;
  saved_count?: number;
  skipped_count?: number;
  duplicate_count?: number;
  error_count?: number;
  current_provider?: ProviderSource | string;
  provider_index?: number;
  provider_total?: number;
  scan_count?: number;
  created_count?: number;
  enriched_count?: number;
  existing_count?: number;
  skip_reasons?: Record<string, number>;
  blocked_source?: ProviderSource | string;
  result?: RunResult | null;
  error?: string | null;
}
