export enum SeverityLevel {
  CRITICAL = 'Critical',
  HIGH = 'High',
  ELEVATED = 'Elevated',
  INFORMATIONAL = 'Informational',
}

export enum DispatchCategory {
  ZERO_DAY = 'Zero-Day & Exploits',
  RANSOMWARE = 'Ransomware & Extortion',
  CLOUD_INFRA = 'Cloud & Infrastructure',
  ADVISORY = 'CISA & Vendor Advisories',
  THREAT_INTEL = 'APT & Threat Research',
  POLICY = 'Regulation & Policy',
}

export interface IndicatorOfCompromise {
  type: 'SHA-256' | 'IPv4' | 'Domain' | 'CVE' | 'YARA Rule';
  value: string;
  context: string;
}

export interface AffectedProduct {
  vendor: string;
  product: string;
  versionsAffected: string;
  fixedVersion: string;
}

export interface JargonTerm {
  term: string;
  definition: string;
}

export interface BeginnerQuiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface BeginnerThreatGuide {
  plainEnglishSummary: string;
  realWorldAnalogy: string;
  attackSteps: string[];
  whyItMatters: string;
  personalProtectionTip: string;
  jargonDecoder: JargonTerm[];
  quiz: BeginnerQuiz;
}

export interface CyberDispatch {
  id: string;
  title: string;
  summary: string;
  leadBody: string[];
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  author: string;
  publishedAt: string; // ISO string
  readingTimeMinutes: number;
  category: DispatchCategory;
  severity: SeverityLevel;
  cveId?: string;
  cvssScore?: number;
  activelyExploited?: boolean;
  imageUrl?: string;
  imageCaption?: string;
  affectedProducts?: AffectedProduct[];
  iocs?: IndicatorOfCompromise[];
  remediationSteps?: string[];
  beginnerGuide?: BeginnerThreatGuide;
  isLiveRss?: boolean;
}

export interface NewsSourceConfig {
  id: string;
  name: string;
  publisherType: 'Government Advisory' | 'Independent Journalism' | 'Threat Intelligence Lab' | 'Community Feed';
  feedUrl: string;
  siteUrl: string;
  enabled: boolean;
  articleCount: number;
  lastSyncedAt: string;
  status: 'Active' | 'Synced' | 'Custom';
}
