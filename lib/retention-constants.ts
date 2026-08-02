// Single tunable constants block for the prospect data retention job
// (Phase 7, D-7-17). Every value below is read once at module scope, and no
// second copy of any of them exists anywhere in this phase. Mirrors
// lib/triage-constants.ts and lib/bulk-scan-constants.ts.

/**
 * The three modes the retention job (lib/retention.ts) can run in.
 * `dry-run` is the only mode this plan implements; `anonymize` and `delete`
 * are wired through runRetention()'s branch but throw until plan 07-07.
 */
export type RetentionMode = "anonymize" | "delete" | "dry-run";

const VALID_RETENTION_MODES: readonly RetentionMode[] = ["anonymize", "delete", "dry-run"];

/** Type guard, not a cast — narrows a raw string to RetentionMode only after
 * checking membership in the closed enum. Never a bare `process.env...
 * as RetentionMode` cast (07-RESEARCH.md's sketch uses one; this
 * deliberately does not, per the Security Domain's V5 row: a cast would
 * pass any string through unchecked). */
function isRetentionMode(value: string): value is RetentionMode {
  return (VALID_RETENTION_MODES as readonly string[]).includes(value);
}

/**
 * Resolved from `process.env.RETENTION_MODE` against the closed three-value
 * enum above — validated at read time via the type guard, never a cast. An
 * unset or unrecognised value falls back to "dry-run" with a warning. The
 * fallback direction is deliberate and one-way: an unreadable value must
 * resolve to the mode that writes nothing, never to one that writes.
 */
function resolveRetentionMode(): RetentionMode {
  const raw = process.env.RETENTION_MODE;
  if (raw === undefined) return "dry-run";
  if (isRetentionMode(raw)) return raw;
  console.warn(`[retention-constants] Unrecognised RETENTION_MODE "${raw}" — falling back to "dry-run"`);
  return "dry-run";
}

export const RETENTION_MODE: RetentionMode = resolveRetentionMode();

/**
 * The retention window in months. CMP-13's 12-month default is a
 * placeholder pending the LIA and not a legal fact (D-7-R3) — it is config
 * precisely so counsel's answer changes this value and no code. D-7-15's
 * deferred second window for never-contacted prospects would arrive as a
 * sibling constant here rather than as a redesign.
 */
function resolveRetentionMonths(): number {
  const raw = process.env.RETENTION_MONTHS;
  if (raw === undefined) return 12;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  console.warn(`[retention-constants] Invalid RETENTION_MONTHS "${raw}" — falling back to 12`);
  return 12;
}

export const RETENTION_MONTHS: number = resolveRetentionMonths();

/**
 * Every table lib/retention.ts is allowed to open, and no other. Every
 * query in that module goes through the one guarded accessor keyed on this
 * list (retentionFrom()) — an out-of-list table is a compile error via the
 * derived RetentionTable union, and a runtime check catches a value cast
 * past the compiler (D-7-19).
 *
 * `suppressions` is deliberately absent and can never be added: suppression
 * rows key on email independently of any prospect row and must survive
 * every retention pass permanently (CMP-15). Removing one recreates exactly
 * the re-contact risk suppression exists to prevent. This comment documents
 * the rule; the integration test in lib/retention.integration.test.ts
 * (Task 2) is what enforces it (D-7-19).
 *
 * `leads` is absent for the same class of reason: it belongs to the public
 * scanner, which D-7-R5 puts outside this job's blast radius.
 *
 * `prospect_sources` was added by this plan (FA-CMP-13-SOURCES, closing
 * 07-REVIEW.md WR-03): migration 011's raw_name/raw_address/raw_website_url
 * columns sat one join away from an anonymised prospect, undetected by
 * either writing mode. anonymizeProspects() deletes this table's rows
 * outright rather than nulling them — see the call site in lib/retention.ts
 * for why. The decision, its rationale, and the accepted cost (a later
 * regional re-import creates a second prospect row rather than matching the
 * anonymised one) are recorded in
 * .planning/phases/07-lifecycle-reporting-retention/07-DECISION-RECORD.md.
 */
export const RETENTION_TABLE_ALLOWLIST = [
  "prospects",
  "outreach_messages",
  "scans",
  "prospect_sources",
] as const;

export type RetentionTable = (typeof RETENTION_TABLE_ALLOWLIST)[number];

/**
 * Hard cap on one candidate select. PostgREST caps an unbounded select at
 * its own default page size, so a run that silently processed only the
 * first page would expire a partial set and report a number that looked
 * complete. selectExpiringProspects() asserts against this cap instead of
 * paging. At 10-50 prospects per week (D-7-R4) a single monthly run
 * reaching 1000 expiring prospects is not reachable; if it ever is, someone
 * must look, and the upgrade path is to page the candidate query rather
 * than to raise this number.
 */
export const RETENTION_MAX_BATCH = 1000;

/**
 * Max ids per `.in("prospect_id", ids)` call in lib/retention.ts's contact
 * and scan lookups. PostgREST URL-encodes an `.in()` filter into the GET
 * request's query string, so a candidate set anywhere near
 * RETENTION_MAX_BATCH overflows the gateway's URL length limit in one
 * call — confirmed by a real `{ months: 0 }` run against this project's
 * local dev prospects table (711 rows, "URI too long"). 150 UUIDs is
 * comfortably under any gateway's URL limit; raise only if profiling shows
 * it costs meaningfully more round trips than it saves.
 */
export const RETENTION_ID_CHUNK_SIZE = 150;

// ── Anonymise mode field lists (D-7-17, Task 1) ─────────────────────
//
// Each list below is a Record of column name to replacement value, not a
// bare array of names — two of the three tables carry not-null columns
// (scans.url, scans.domain) and one not-null jsonb-default column
// (scans.pages) that a bare name list cannot express a replacement for.
// Every object here is spread straight into the matching `.update()`
// payload in lib/retention.ts's anonymizeProspects().

/**
 * prospects columns anonymise clears. `name`, `domain`, `website_url` and
 * `contact_email` are the four identifiers D-7-17 names by hand.
 * `website_url_pending` and `address` are the precise field list beyond
 * those identifiers that D-7-17 explicitly delegates to this plan's
 * discretion: a pending website URL is the same identifier held in a
 * second column (migration 010's website_url_pending / D-05 pattern), and
 * a street address identifies the business as squarely as its domain
 * does.
 *
 * Kept, deliberately: `country`, `region`, `category`, `campaign_tag`,
 * `triage_score`, every timestamp (`created_at`, `updated_at`,
 * `triage_checked_at`, `scan_released_at`, `booked_at`,
 * `website_url_changed_at`, `country_pending`, `country_changed_at`), and
 * the stored `lifecycle_state`. D-7-17 chose anonymise over delete
 * precisely so the funnel history this same phase (TRK-05) reports on
 * survives the identifiers' expiry — nulling any of these would quietly
 * break that reporting surface a few months in.
 */
export const ANONYMIZED_PROSPECT_FIELDS: Record<string, null> = {
  name: null,
  domain: null,
  website_url: null,
  contact_email: null,
  website_url_pending: null,
  address: null,
};

/**
 * outreach_messages columns anonymise clears. `draft_subject` is included
 * alongside D-7-17's "draft body" because a cold-outreach subject line
 * names the business it was written for just as plainly as the body does.
 *
 * Kept: `status`, `approved_by`, `approved_at`, `sent_at`, `created_at` —
 * the markers deriveLifecycleState() and the reporting counters
 * (lib/reporting-aggregates.ts) read.
 */
export const ANONYMIZED_OUTREACH_FIELDS: Record<string, null> = {
  draft_subject: null,
  draft_body: null,
};

/**
 * The reserved TLD from RFC 2606 — guaranteed to never resolve. The scans
 * table's `url`/`domain` columns are not null (migration 001), so a
 * sentinel is the only in-place option; nulling them is not available.
 * The public scanner's one-hour domain cache only ever looks at scans
 * from the last hour, so a twelve-month-old sentinel row can never be
 * served to a visitor. `scans.domain` carries a non-unique index (unlike
 * prospects.domain's partial-unique index), so many anonymised rows
 * sharing this value is fine.
 */
export const ANONYMIZED_SCAN_SENTINEL_URL = "https://anonymized.invalid";
export const ANONYMIZED_SCAN_SENTINEL_DOMAIN = "anonymized.invalid";

/**
 * scans columns anonymise clears, for a prospect-owned scan only
 * (`prospect_id` not null — see lib/retention.ts's `.not()` filter).
 *
 * A prospect's scan row holds the site's URL and its crawled page
 * content, and `prospects.latest_scan_id` points straight at it — D-7-17's
 * own sentence lists only prospect fields and the draft body, but leaving
 * a scan's URL live while the owning prospect's is cleared would make the
 * anonymisation reversible by a one-line join. D-7-16 already puts
 * prospect-owned scans in scope; this is that scope applied consistently.
 *
 * `pages` is set to `[]` (not null — the column is not null with a `'[]'`
 * jsonb default) since it holds full per-page crawl content. `url` and
 * `domain` go to the two sentinels above, both not-null columns. Every
 * other content column — `summary`, `screenshots`,
 * `homepage_screenshot_url`, `email`, `error_message`, `cost_estimate`,
 * `quick_wins`, `website_personality`, `sales_brief`, `design_ai_analysis`,
 * `visitor_experience`, `ai_content_alt`, `issues_alt` — goes to null.
 *
 * Kept: `scores`, `type`, `status`, `locale`, `ip_hash`, `prospect_id`,
 * `design_ai_analyzed_at`, and every timestamp (`started_at`,
 * `completed_at`, `created_at`) — the reporting surface reads these, and
 * D-7-17 only asks for content and identifiers to go.
 */
export const ANONYMIZED_SCAN_FIELDS: Record<string, unknown> = {
  pages: [],
  url: ANONYMIZED_SCAN_SENTINEL_URL,
  domain: ANONYMIZED_SCAN_SENTINEL_DOMAIN,
  summary: null,
  screenshots: null,
  homepage_screenshot_url: null,
  email: null,
  error_message: null,
  cost_estimate: null,
  quick_wins: null,
  website_personality: null,
  sales_brief: null,
  design_ai_analysis: null,
  visitor_experience: null,
  ai_content_alt: null,
  issues_alt: null,
};
