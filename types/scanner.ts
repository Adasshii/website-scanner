// Shared types used by both the Next.js frontend and the scanner-service

// ── Scan request / response ────────────────────────────────────────

export type ScanType = "quick" | "full";

export interface ScanRequest {
  url: string;
  type: ScanType;
  /** For full scans — max pages to crawl (default 10) */
  maxPages?: number;
}

export interface ScanResponse {
  id: string;
  url: string;
  domain: string;
  type: ScanType;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  scores?: ScanScores;
  pages: PageResult[];
  summary?: ScanSummary;
}

export type ScanStatus = "pending" | "scanning" | "quick_done" | "processing" | "completed" | "failed";

// ── Scores ─────────────────────────────────────────────────────────

export interface ScanScores {
  overall: number; // 0-100
  accessibility: number;
  content: number;
  seo: number;
  performance: number;
  security?: number; // optional — absent on scans before Phase 2
  design?: number; // optional — absent on scans before Design category
}

/** Weights must add up to 1.0 */
export const SCORE_WEIGHTS = {
  performance: 0.25,
  seo: 0.25,
  accessibility: 0.15,
  content: 0.15,
  security: 0.10,
  design: 0.10,
} as const;

// ── Per-page results ───────────────────────────────────────────────

export interface PageResult {
  url: string;
  statusCode: number;
  loadTimeMs: number;
  /** Raw extracted data from the page */
  data: PageData;
  /** Issues found on this page */
  issues: Issue[];
  /** Per-page scores */
  scores: ScanScores;
}

export interface PageData {
  title: string;
  description: string;
  h1: string[];
  headings: HeadingNode[];
  links: LinkInfo[];
  images: ImageInfo[];
  wordCount: number;
  language: string;
  canonical: string;
  ogTags: Record<string, string>;
  twitterTags: Record<string, string>;
  hasViewport: boolean;
  hasFavicon: boolean;
  hasStructuredData: boolean;
  hasSkipLink: boolean;
  vagueLinkCount: number;
  videosWithoutCaptions: number;
  audioElements: number;
  inputsMissingAutocomplete: number;
  iframesWithoutTitle: number;
  tablesWithoutHeaders: number;
  emptyButtons: number;
  renderBlockingScripts: number;
  /** Whether the page has a <nav> or [role="navigation"] element */
  hasNav: boolean;
  /** Number of user-fillable fields in the largest form on the page (0 if no form) */
  formFieldCount: number;
  /** Whether a phone number or email is present anywhere on the page (tel:/mailto: link or text pattern) */
  hasContactInfo: boolean;
  /** Whether an action-oriented CTA (link or button) exists anywhere on the page */
  hasCta: boolean;
  /** Whether an action-oriented CTA is visible above the fold (top < viewport height) */
  hasCtaAboveFold: boolean;
  /** Whether any trust signal was detected (testimonials, reviews/ratings, client logos, Review/Rating schema) */
  hasTrustSignals: boolean;
  /** Whether a cookie-consent banner is present (known CMP or common banner text) */
  hasCookieBanner: boolean;
  /** Whether the detected cookie banner overlaps the fold as a fixed/sticky overlay */
  cookieBannerBlocksFold: boolean;
  /** HTTP response headers from the main document request */
  responseHeaders: Record<string, string>;
  /** Page size in bytes */
  pageSize: number;
  /** Whether /robots.txt returns 200 */
  hasRobotsTxt: boolean;
  /** Whether /sitemap.xml returns 200 or robots.txt has a Sitemap: directive */
  hasSitemap: boolean;
  /** Internal links returning 4xx */
  brokenLinks: Array<{ href: string; statusCode: number }>;
  /** Internal links that pass through 2+ redirects */
  redirectChains: Array<{ href: string; hops: number; finalUrl: string }>;
  /** Core Web Vitals from Lighthouse — absent if Lighthouse failed */
  coreWebVitals?: CoreWebVitals;
  /** Schema.org @type values detected via JSON-LD or microdata — absent on scans before schema detection */
  schemaTypes?: string[];
  /** Number of JSON-LD script blocks that failed to parse */
  schemaInvalidCount?: number;
}

export interface CoreWebVitals {
  /** Largest Contentful Paint (ms) */
  lcp: number;
  /** Cumulative Layout Shift score */
  cls: number;
  /** First Contentful Paint (ms) */
  fcp: number;
  /** Total Blocking Time (ms) */
  tbt: number;
  /** Speed Index (ms) */
  si: number;
}

export interface HeadingNode {
  level: number; // 1-6
  text: string;
}

export interface LinkInfo {
  href: string;
  text: string;
  isInternal: boolean;
  isExternal: boolean;
  /** rel="nofollow" etc. */
  rel: string;
}

export interface ImageInfo {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  hasAlt: boolean;
  /** Whether dimensions are explicitly set */
  hasDimensions: boolean;
  /** Whether loading="lazy" is set */
  isLazy: boolean;
}

// ── Issues ─────────────────────────────────────────────────────────

export type IssueSeverity = "critical" | "major" | "minor" | "info";
export type IssueCategory = "accessibility" | "content" | "seo" | "performance" | "security" | "design";

export interface Issue {
  id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  /** Short human-readable title */
  title: string;
  /** Plain-language description of the problem */
  description: string;
  /** What to do about it */
  recommendation: string;
  /** CSS selector or element description where the issue was found */
  selector?: string;
  /** axe-core rule ID if applicable */
  axeRuleId?: string;
  /** Impact score deduction for this issue */
  impact: number;
  /** AI-generated one-sentence business impact explanation */
  whyItMatters?: string;
  /** Estimated fix difficulty */
  difficulty?: "easy" | "medium" | "hard";
}

// ── Summary (aggregated across all pages) ──────────────────────────

export interface ScanSummary {
  totalPages: number;
  totalIssues: number;
  criticalIssues: number;
  majorIssues: number;
  /** Top issues across all pages, deduplicated */
  topIssues: Issue[];
  /** One-liner plain-language verdict */
  verdict: string;
}

// ── Cost Estimate ─────────────────────────────────────────────────

export interface CostFactor {
  name: string;
  percentImpact: number;
  explanation: string;
}

export interface CostEstimate {
  totalLostPercent: number;
  factors: CostFactor[];
}

// ── Quick Wins ────────────────────────────────────────────────────

export interface QuickWin {
  title: string;
  description: string;
  estimatedTime: string;
  needsDeveloper: boolean;
  expectedImpact: string;
}

// ── Screenshots ───────────────────────────────────────────────────

export interface IssueOverlay {
  issueId: string;
  issueTitle: string;
  category: IssueCategory;
  severity: IssueSeverity;
  rect: { x: number; y: number; width: number; height: number };
  pageWidth: number;
  pageHeight: number;
}

export interface ScreenshotInfo {
  path: string;
  url: string;
  overlays: IssueOverlay[];
}

// ── Email Events ──────────────────────────────────────────────────

export type EmailType = "confirmation" | "report_ready" | "follow_up" | "admin_notification";
export type EmailStatus = "sent" | "delivered" | "opened" | "clicked" | "bounced" | "complained" | "failed";

export interface EmailEventRow {
  id: string;
  scan_id: string | null;
  email: string;
  email_type: EmailType;
  resend_email_id: string | null;
  status: EmailStatus;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Supabase row shapes ────────────────────────────────────────────

export interface ScanRow {
  id: string;
  url: string;
  domain: string;
  type: ScanType;
  status: ScanStatus;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: PageResult[];
  started_at: string;
  completed_at: string | null;
  created_at: string;
  /** IP hash for rate limiting — never exposed to frontend */
  ip_hash: string;
  /** Email provided by user for full report (nullable) */
  email: string | null;
  /** Error message if scan failed */
  error_message: string | null;
  /** Last modification timestamp */
  updated_at: string;
  /** Screenshot URLs and overlay data per page */
  screenshots: Record<string, ScreenshotInfo> | null;
  /** AI-generated business impact estimate */
  cost_estimate: CostEstimate | null;
  /** AI-selected top 3 quick wins */
  quick_wins: QuickWin[] | null;
  /** AI-generated website personality read */
  website_personality: string | null;
  /** AI-generated visitor experience briefing for business owners */
  visitor_experience: string | null;
  /** AI-generated sales brief for admin use */
  sales_brief: string | null;
  /** Cached Gemini Vision design analysis result */
  design_ai_analysis: { overallScore: number; issues: string[] } | null;
  /** When the design AI analysis was last generated */
  design_ai_analyzed_at: string | null;
  /** Public URL of the scanned homepage screenshot for display */
  homepage_screenshot_url: string | null;
  /** Visitor's UI locale at scan submission ('en' | 'nl'). Drives AI output language and email language. */
  locale: string;
  /** Other-language version of executive summary / visitor experience / cost estimate / quick wins / personality. Null on legacy scans. */
  ai_content_alt: AiContentAlt | null;
  /** Other-language overrides for issue title/description/recommendation/whyItMatters, keyed by issue id. Null on legacy scans. */
  issues_alt: IssuesAlt | null;
}

export interface AiContentAlt {
  locale: string;
  executiveSummary: string;
  visitorExperience: string;
  costEstimate: CostEstimate | null;
  quickWins: QuickWin[] | null;
  websitePersonality: string;
}

export interface IssuesAlt {
  locale: string;
  byId: Record<string, {
    title?: string;
    description?: string;
    recommendation?: string;
    whyItMatters?: string;
  }>;
}

export interface LeadRow {
  id: string;
  scan_id: string;
  email: string;
  domain: string;
  source: string;
  gdpr_consent: boolean;
  consent_timestamp: string;
  created_at: string;
  /** Set when lead books an appointment via Fillout */
  booked_at: string | null;
  /** Locale used for emails sent to this lead */
  locale: string;
}

// ── Prospect Radar (Phase 1) ───────────────────────────────────────

/**
 * A single Overture Maps "place" record, already reduced to the fields
 * Prospect Radar needs (websiteUrl is websites[0], not the raw array).
 * Not a DB row — this is the shape read from the Overture DuckDB query,
 * before it is branched into a prospects/prospect_sources write
 * (see lib/prospect-upsert.ts, RESEARCH.md Pattern 1).
 */
export interface OverturePlaceRow {
  /** Overture's Global Entity Reference System ID — the idempotency key for re-imports (IMP-03) */
  gersId: string;
  name: string | null;
  address: string | null;
  category: string | null;
  region: string | null;
  country: string;
  /** Already reduced from the raw Overture websites[0] array */
  websiteUrl: string | null;
  confidence: number | null;
}

/** prospects.lifecycle_state — see supabase/migrations/010_create_prospects.sql */
export type ProspectLifecycleState =
  | "new"
  | "no_website"
  | "triaged"
  | "qualified"
  | "scan_queued"
  | "scanned"
  | "drafted"
  | "approved"
  | "contacted"
  | "replied"
  | "booked"
  | "rejected"
  | "suppressed";

export interface ProspectRow {
  id: string;
  /** Normalised registrable domain; null = no-website prospect (D-06/D-07) */
  domain: string | null;
  name: string | null;
  address: string | null;
  category: string | null;
  region: string | null;
  /** Required (IMP-06); frozen after first import (D-13) */
  country: string;
  website_url: string | null;
  /** D-05: a re-import's differing website_url, held for review, never auto-applied */
  website_url_pending: string | null;
  website_url_changed_at: string | null;
  /** D-13: a re-import's differing country, held for review, never auto-applied */
  country_pending: string | null;
  country_changed_at: string | null;
  campaign_tag: string | null;
  lifecycle_state: ProspectLifecycleState;
  triage_score: Record<string, unknown> | null;
  triage_checked_at: string | null;
  latest_scan_id: string | null;
  contact_email: string | null;
  contact_email_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectSourceRow {
  id: string;
  prospect_id: string;
  /** The idempotency key for re-imports (IMP-03) */
  overture_gers_id: string;
  overture_release: string | null;
  raw_name: string | null;
  raw_address: string | null;
  raw_category: string | null;
  raw_region: string | null;
  raw_country: string | null;
  raw_website_url: string | null;
  raw_confidence: number | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}
