<!-- refreshed: 2026-07-16 -->
# Architecture

**Analysis Date:** 2026-07-16

## System Overview

Website Scanner is a two-deployable system: a Next.js 14 App Router frontend (`app/`) that orchestrates scan requests, and a separate Express + Playwright service (`scanner-service/`) that performs the actual page analysis. The frontend polls status and handles reporting; the service performs CPU/memory-intensive scanning, issue detection, and AI analysis.

```text
┌────────────────────────────────────────────────────────────────┐
│                   Next.js Frontend App                         │
│  ┌──────────────────┬──────────────┬─────────────────────────┐ │
│  │ Public Routes    │ Admin Panel  │ Report & Status Pages   │ │
│  │ /start /scan/:id │ /admin/      │ /report/:id /scan/:id   │ │
│  │ /embed/:domain   │              │                         │ │
│  └────────┬─────────┴──────┬───────┴────────┬────────────────┘ │
│           │                │                │                  │
│  ┌────────▼────────────────▼────────────────▼─────────────────┐ │
│  │ API Routes (`/app/api/`)                                    │ │
│  │ ┌─────────────────┬──────────────┬──────────────────────┐  │ │
│  │ │ POST /scan      │ GET /scan/id │ POST /internal/      │  │ │
│  │ │ (orchestrates)  │ /status      │ scan-complete        │  │ │
│  │ │                 │ (polls)      │ (callback webhook)   │  │ │
│  │ └─────────────────┴──────────────┴──────────────────────┘  │ │
│  │ ┌─────────────────┬──────────────┬──────────────────────┐  │ │
│  │ │ Cron routes     │ Admin routes │ Email & webhook      │  │ │
│  │ │ /cron/*         │ /admin/*     │ handlers             │  │ │
│  │ └─────────────────┴──────────────┴──────────────────────┘  │ │
│  └────────┬────────────────────────────────────────────────────┘ │
│           │ HTTP POST                                            │
│           │ ScannerClient (`lib/scanner-client.ts`)              │
│           ▼                                                      │
├────────────────────────────────────────────────────────────────┤
│                   Supabase (PostgreSQL)                         │
│  ├─ scans (with scores, status, ai_content_alt, issues_alt)   │
│  └─ leads (email captures + scan associations)                │
└────────────────────────────────────────────────────────────────┘
           ▲
           │ Service role key (server-to-server)
           │
           ▼
┌────────────────────────────────────────────────────────────────┐
│          Express Scanner Service (Separate Deployment)         │
│  ┌──────────────────┬──────────────┬─────────────────────────┐ │
│  │ POST /api/       │ POST /api/   │ POST /api/scan/full-   │ │
│  │ scan/quick       │ scan/full    │ async (fire-and-forget)│ │
│  │ (sync, <3 min)   │ (sync, <5min)│ (async, <15 min)       │ │
│  └────────┬─────────┴──────┬───────┴────────┬────────────────┘ │
│           │                │                │                  │
│  ┌────────▼────────────────▼────────────────▼─────────────────┐ │
│  │ Scanning Pipeline (`scanner.ts`)                            │ │
│  │ ┌─────────────────────────────────────────────────────────┐ │
│  │ │ 1. Load page (Playwright)                               │ │
│  │ │ 2. Run axe-core (accessibility)                         │ │
│  │ │ 3. Extract page data (links, images, metadata, SEO)    │ │
│  │ │ 4. Check robots.txt, sitemap, internal link health     │ │
│  │ │ 5. Run Lighthouse (Core Web Vitals)                    │ │
│  │ │ 6. Mobile usability pass (separate viewport)           │ │
│  │ │ 7. Take screenshots (full-page + viewport-only)        │ │
│  │ │ 8. Analyze issues (`analyzer.ts`)                      │ │
│  │ │ 9. Compute per-page scores (`scoring.ts`)              │ │
│  │ └─────────────────────────────────────────────────────────┘ │
│  └────────┬────────────────────────────────────────────────────┘ │
│           │                                                      │
│  ┌────────▼────────────────────────────────────────────────────┐ │
│  │ AI Pipeline (`ai.ts`)                                        │ │
│  │ ┌──────────────────┬──────────────┬──────────────────────┐  │ │
│  │ │ Primary locale   │ Alt locale   │ Design analysis      │  │ │
│  │ │ AI pipeline      │ (bilingual)  │ (async, 24h cache)   │  │ │
│  │ │ (parallel run)   │ (parallel)   │                      │  │ │
│  │ │                  │              │ Sales brief          │  │ │
│  │ └──────────────────┴──────────────┴──────────────────────┘  │ │
│  └────────┬───────────────────────────────────────────────────┘ │
│           │ Results JSON + screenshot URLs                      │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Supabase Callback (full-async only)                          │ │
│  │ → Updates DB with final scores, design analysis, status     │ │
│  │ → Triggers Next.js webhook at /internal/scan-complete       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Scan Orchestrator** | Receives requests, validates URL, rate-limits, returns results | `app/api/scan/route.ts` |
| **Scanner Client** | HTTP client that calls scanner service endpoints | `lib/scanner-client.ts` |
| **Scanner Service** | Loads pages, runs audits (axe, Lighthouse, mobile), extracts data | `scanner-service/src/scanner.ts` |
| **Issue Analyzer** | Converts axe violations + page data into categorized issues | `scanner-service/src/analyzer.ts` |
| **Page Scorer** | Computes per-page scores (0–100) from issues and performance data | `scanner-service/src/scoring.ts` |
| **Design Analyzer** | Runs Claude vision on screenshots to detect design issues (async, 24h cache) | `scanner-service/src/ai.ts` |
| **AI Pipeline** | Generates executive summaries, issue overrides, cost estimates, quick wins (bilingual) | `scanner-service/src/ai.ts` |
| **Page Discoverer** | Crawls internal links from homepage for full-scan multi-page discovery | `scanner-service/src/discovery.ts` |
| **Screenshot Capturer** | Takes full-page and viewport-only screenshots, uploads to Supabase storage | `scanner-service/src/screenshots.ts` |
| **Lighthouse Runner** | Runs Lighthouse audit for Core Web Vitals (LCP, CLS, FCP, TBT) | `scanner-service/src/lighthouse.ts` |
| **Mobile Checker** | Runs mobile usability pass in separate browser context | `scanner-service/src/mobile.ts` |
| **Status Poller** | Endpoint for frontend to poll scan progress and design-ready state | `app/api/scan/[id]/status/route.ts` |
| **Scan-Complete Webhook** | Receives callback from scanner service, sends report-ready emails | `app/api/internal/scan-complete/route.ts` |
| **Admin Dashboard** | Lists leads, views scan details, filters by score/domain | `app/admin/page.tsx` |
| **Report Page** | Displays scan results, issue cards, scores, screenshots, bilingual toggle | `app/report/[id]/page.tsx` |
| **Cron: Follow-up** | Sends follow-up emails to leads with incomplete conversions | `app/api/cron/follow-up/route.ts` |
| **Cron: Keepalive** | Prevents scanner service from idling on Railway | `app/api/cron/keepalive/route.ts` |
| **Cron: Send Pending Reports** | Batch-sends queued report emails | `app/api/cron/send-pending-reports/route.ts` |

## Pattern Overview

**Overall:** Async HTTP pipeline with short-lived quick-scans and longer full-scans that update the database via webhook callback.

**Key Characteristics:**
- **Separation of concerns:** Frontend orchestrates, service performs, database is source of truth
- **Bilingual:** All user-facing content (verdicts, issue overrides, cost estimates) generated in two locales in parallel
- **Two scan modes:** Quick (single page, synchronous, <3 min) and Full (multi-page discovery, async, <15 min)
- **Two-phase scoring:** HTML-based (immediate) + async AI design analysis (runs in background, can take 30-60s)
- **24h caching:** Design AI analysis cached per domain to avoid redundant API calls
- **Stateful polling:** Frontend polls `/api/scan/[id]/status` to check progress and design-ready state
- **Fire-and-forget async:** Full scans return immediately, update DB directly via service, notify app via webhook

## Layers

**Presentation Layer:**
- Purpose: Handle HTTP requests from users and the scanner service
- Location: `app/` (Next.js routes)
- Contains: Public pages (start, scan, report, embed), admin dashboard, API handlers
- Depends on: Supabase client, ScannerClient, email service
- Used by: Browsers, scanner service (via callbacks)

**Orchestration Layer:**
- Purpose: Manage the scan lifecycle (create, poll status, handle callbacks)
- Location: `app/api/` (route handlers)
- Contains: `/scan` (POST — create and run), `/scan/[id]/status` (GET — poll), `/internal/scan-complete` (POST — callback)
- Depends on: Supabase, ScannerClient, email
- Used by: Frontend routes, scanner service

**Scanning & Analysis Layer:**
- Purpose: Perform the actual page audits and issue detection
- Location: `scanner-service/src/` (service-side modules)
- Contains: `scanner.ts` (orchestration), `analyzer.ts` (issues), `extractor.ts` (data), `lighthouse.ts` (CWV), `mobile.ts` (mobile), `ai.ts` (Claude), `discovery.ts` (crawling), `screenshots.ts` (capture)
- Depends on: Playwright, axe-core, Lighthouse, Claude API, Supabase
- Used by: Express route handlers

**Scoring Layer:**
- Purpose: Convert issues and metrics into numerical scores
- Location: `scanner-service/src/scoring.ts` (service-side, per-page), `lib/scoring.ts` (app-side, aggregation)
- Contains: `scorePage()` (single page), `aggregateScores()` (multi-page), `buildSummary()` (human-readable)
- Depends on: Issue types, page data
- Used by: Scanning layer, app routes

**Data Layer:**
- Purpose: Persist scans, leads, and email events
- Location: Supabase PostgreSQL (remote), migrations in `supabase/migrations/`
- Contains: `scans`, `leads` tables, RLS policies
- Depends on: Nothing (is the source of truth)
- Used by: All layers

## Data Flow

### Primary Request Path: Quick Scan (Synchronous)

```
1. Browser POST /api/scan
   ├─ validate URL (SSRF checks)
   ├─ check rate limit (5 scans/hour/IP hash)
   ├─ check 1-hour domain cache → return cached if hit
   ├─ create scan row (status="scanning")
   │
   ├─ Call ScannerClient.quickScan(url, scanId, locale)
   │  └─ HTTP POST to scanner service:/api/scan/quick
   │     ├─ scanPage() in scanner.ts
   │     │  ├─ Load page (Playwright, domcontentloaded)
   │     │  ├─ Run axe-core (30s timeout cap)
   │     │  ├─ Extract page data via extractor.ts
   │     │  ├─ Check robots.txt, sitemap, internal links
   │     │  ├─ Run Lighthouse CWV audit
   │     │  ├─ Run mobile usability pass
   │     │  ├─ Dismiss cookie banners
   │     │  ├─ Take full-page + viewport screenshots
   │     │  └─ Return PageResult with issues
   │     │
   │     ├─ analyzeIssues() to convert axe results → Issue[]
   │     ├─ scorePage() → compute per-page scores
   │     │
   │     ├─ Upload screenshots to Supabase storage
   │     │
   │     ├─ Run bilingual AI pipeline (parallel):
   │     │  ├─ runLocaleAiPipeline(primary locale, 30s timeout)
   │     │  │  ├─ Call Claude to generate executive summary
   │     │  │  ├─ Generate issue overrides (title, description, recommendation)
   │     │  │  ├─ Generate cost estimate
   │     │  │  ├─ Generate quick wins
   │     │  │  ├─ Generate website personality
   │     │  │  └─ Generate visitor experience
   │     │  │
   │     │  └─ runLocaleAiPipeline(alt locale, 30s timeout) → same for bilingual
   │     │
   │     ├─ If scanId provided: setImmediate → runDesignAnalysisBackground()
   │     │  ├─ Check 24h cache for design_ai_analysis
   │     │  ├─ If miss: call generateDesignAnalysis() via Claude vision
   │     │  ├─ Merge AI design issues into first page
   │     │  ├─ Recompute design score (40% HTML + 60% AI)
   │     │  └─ Update DB with design_ai_analysis, design_ai_analyzed_at
   │     │
   │     └─ Return ScannerResponse (pages[], scores, summary, aiContentAlt, issuesAlt)
   │
   ├─ Update scan row (status="quick_done", scores, summary, pages, screenshots, ai_content_alt, issues_alt)
   └─ Return results to browser
```

### Secondary Flow: Full Scan (Asynchronous, Fire-and-Forget)

```
1. Browser POST /api/scan (same as quick, but type="full")
   ├─ Create scan row (status="scanning")
   ├─ Immediately return scanId to browser
   └─ (Browser should poll /api/scan/[id]/status)

2. Scanner service: POST /api/scan/full-async (triggered by app or separate flow)
   ├─ Accept immediately (status 202), return { accepted: true, scanId }
   ├─ In background:
   │  ├─ Register scanId in activeFullScans map (for crash recovery)
   │  ├─ Set 15-minute timeout
   │  │
   │  ├─ discoverPages() → find internal links from homepage
   │  │
   │  ├─ For each page URL (up to 7 pages):
   │  │  └─ scanPage() (same as quick)
   │  │
   │  ├─ aggregateScores() from all pages
   │  ├─ buildSummary() from all pages
   │  │
   │  ├─ Design AI analysis (24h cache, uses first page's screenshot)
   │  ├─ Run bilingual AI pipeline (parallel, 45s timeout each)
   │  ├─ Merge AI design issues, recompute design score
   │  ├─ Generate sales brief
   │  │
   │  ├─ Update Supabase directly:
   │  │  └─ status="completed", pages, scores, summary, design_ai_analysis, etc.
   │  │
   │  ├─ POST /internal/scan-complete webhook to Next.js
   │  │  └─ Next.js sends report-ready email
   │  │
   │  └─ Clean up activeFullScans map, clear timeout
```

### Status Polling Flow

```
Browser polls GET /api/scan/[id]/status
├─ Query Supabase: status, error_message, updated_at, design_ai_analyzed_at, scores
└─ Return { status, error_message, updated_at, designReady, scores }

designReady = true when design_ai_analyzed_at is NOT NULL
(Frontend uses this to show "design analysis complete" badge)
```

### Callback Webhook Flow (Full Scan Only)

```
Scanner service fires: POST /internal/scan-complete (with Bearer auth)
├─ Verify Authorization header
├─ Fetch scan from DB (must be status="completed")
├─ Send report-ready email to user (in their locale)
├─ Send admin notification email (to ADMIN_EMAIL env var)
└─ Return { sent: true }
```

### State Management

**In Supabase:**
- `scans.status`: "pending" → "scanning" → "quick_done" | "processing" → "completed" | "failed"
- `scans.scores`: Computed once and persisted; design score updated async if available
- `scans.pages`: Array of PageResult; grows as full scan pages complete
- `scans.design_ai_analyzed_at`: NULL until async design analysis completes (marks when design-ready)
- `scans.ai_content_alt`: Alt-locale AI output (verdicts, summaries, cost estimates, quick wins)
- `scans.issues_alt`: Alt-locale overrides for individual issue text
- `leads.scan_id`: Foreign key to scans table (one-to-many: scan can have multiple leads if re-sent)

**Transient (In Memory):**
- `activeFullScans`: Map<scanId, SupabaseClient> — tracks in-flight full scans for crash recovery
- `scanId` in URL and local storage — frontend uses to poll and navigate

## Key Abstractions

**PageResult:**
- Purpose: A single page's scan output (URL, status code, load time, extracted data, issues, scores)
- Examples: `app/report/[id]/page.tsx` maps PageResult → UI cards, `scanner-service/src/index.ts` aggregates multiple PageResults
- Pattern: Immutable once created by `scanPage()`; never mutated post-creation

**Issue:**
- Purpose: A problem found on the page (ID, category, severity, title, description, recommendation, impact score)
- Examples: "missing-h1", "low-performance", "design-cookie-banner-blocking"
- Pattern: Returned by `analyzeIssues()`, enhanced by AI via `issueOverrides`, displayed in reports

**ScanScores:**
- Purpose: A numeric breakdown (0–100) per category and overall
- Structure: `{ overall, accessibility, content, seo, performance, security, design }`
- Weights: performance 25%, seo 25%, a11y 15%, content 15%, security 10%, design 10%
- Pattern: Computed once by `scorePage()`, then blended with AI design score in background

**PageData:**
- Purpose: Raw extracted information from a page (title, headings, links, images, word count, metadata, etc.)
- Examples: `data.wordCount`, `data.h1`, `data.hasViewport`, `data.brokenLinks`, `data.coreWebVitals`
- Pattern: Extracted by `extractPageData()`, used to detect issues and compute scores

**DesignAnalysis:**
- Purpose: Claude vision output on a screenshot (overallScore, issues sentences, detected CTA patterns)
- Pattern: Cached per domain for 24 hours; merged into first page's design score (40% HTML + 60% AI)
- Note: Async, runs only if scanId provided and screenshot available

**AiContentAlt:**
- Purpose: Bilingual mirror of AI-generated content (alt locale's verdict, cost estimate, quick wins, personality, visitor experience)
- Pattern: Persisted alongside primary content in `ai_content_alt` JSONB column; used by frontend's language toggle

## Entry Points

**Public Scan Initiation:**
- Location: `app/api/scan/route.ts` (POST)
- Triggers: Browser form submission or embed script
- Responsibilities: URL validation, rate limiting, cache check, DB creation, scanner service call
- Returns: ScanResponse with ID and initial results

**Status Polling:**
- Location: `app/api/scan/[id]/status/route.ts` (GET)
- Triggers: Frontend polling loop (every 2-5s)
- Responsibilities: Query DB, return status + design-ready flag
- Returns: { status, designReady, error_message, scores }

**Scan-Complete Callback:**
- Location: `app/api/internal/scan-complete/route.ts` (POST)
- Triggers: Scanner service after full-async completes
- Responsibilities: Verify auth, fetch scan, send emails
- Returns: { sent: true }

**Admin Dashboard:**
- Location: `app/admin/page.tsx` (GET) + `app/api/admin/*` (GET/POST/DELETE)
- Triggers: Admin login
- Responsibilities: List leads, view scan details, filter, delete, trigger keepalive
- Returns: HTML page + JSON responses

**Cron: Follow-up Emails:**
- Location: `app/api/cron/follow-up/route.ts` (POST, triggered by Vercel cron)
- Triggers: Every hour
- Responsibilities: Find leads without booked_at, send follow-up email
- Returns: { sent: number }

**Cron: Keepalive:**
- Location: `app/api/cron/keepalive/route.ts` (POST, triggered by Vercel cron)
- Triggers: Every 10 minutes
- Responsibilities: Hit scanner service health check to prevent sleep
- Returns: { healthy: boolean }

**Cron: Send Pending Reports:**
- Location: `app/api/cron/send-pending-reports/route.ts` (POST, triggered by Vercel cron)
- Triggers: Every 5 minutes
- Responsibilities: Find completed scans without sent email, send report
- Returns: { sent: number }

## Architectural Constraints

- **Service separation:** The scanner service MUST run on Railway (or similar always-on platform). Vercel functions timeout at 10–15 min; scanning needs 3–15 min. Frontend runs on Vercel.
- **Two-phase scoring:** Design score starts as HTML-only, then updates asynchronously. Reports must display what's available immediately; design updates are a background enhancement.
- **Bilingual content generation:** Both locales run in parallel during AI phase to avoid doubling user wait time. Alt content is optional (if AI times out, primary content is sufficient).
- **Browser pooling:** Playwright browser stays open across multiple scan requests (lazy initialization, shared singleton). Graceful shutdown on SIGTERM.
- **Rate limiting:** IP-based (5 scans/hour), cached to avoid DB queries on every request. Hashed to protect privacy.
- **Domain caching:** 1-hour quick-scan cache per domain; 24-hour design analysis cache per domain.
- **Circular dependency prevention:** App calls scanner service (HTTP); scanner calls app only via webhook callback. No direct service → app imports.
- **Stateful recovery:** Active full-scan map (`activeFullScans`) allows crash recovery; scans marked "failed" if service dies mid-scan.
- **Async design analysis:** Must not block quick-scan response. Runs in background via `setImmediate` after response sent. Updates DB directly.
- **No job queue:** No Bull, Sidekiq, or message queue. Simpler for small scale. Full-async runs in service memory; if server crashes, scan is marked failed by timeout handler.

## Anti-Patterns

### Inline AI Calls in Synchronous Path

**What happens:** AI generation (Claude API calls) runs inline during quick-scan, blocking response for 30–60 seconds.
**Why it's wrong:** User sees a stuck request; timeout risk increases; queue buildup under load.
**Do this instead:** Run AI parallel to scanning in the scanner service, return AI results immediately with the page analysis. For design-specific analysis, fire it async after returning the response via `setImmediate()`.

### Duplicate Scoring Logic

**What happens:** `scoring.ts` exists in both `lib/` and `scanner-service/src/` with similar code.
**Why it's wrong:** Maintenance burden; changes to one don't sync to the other; risk of score drift between service and app.
**Do this instead:** Keep them separate but document why: service-side `scorePage()` is per-page, immediate (HTML only); app-side `aggregateScores()` is multi-page, applied after service returns. They are not duplicates — they serve different purposes.

### Blocking on Screenshot Upload

**What happens:** Screenshot upload to Supabase storage happens synchronously within the scan response path, adding 2–5 seconds.
**Why it's wrong:** Extends total scan time; failures cascade.
**Do this instead:** Upload screenshots in parallel with AI generation; if upload fails, log and continue. Screenshots are optional enhancement; don't block the critical path.

### Storing Raw IP Addresses

**What happens:** Raw IP stored in `scans.ip` for rate limiting.
**Why it's wrong:** GDPR violation; tracks users.
**Do this instead:** Hash IP with SHA256 before storing; use hash for rate-limit checks. This is already implemented (`ip_hash`).

## Error Handling

**Strategy:** Fail gracefully; never crash the scan process. Return a ScanPageResult with error issues rather than throwing.

**Patterns:**
- **Network errors (page timeout, Lighthouse hang):** Add a "scan-error" issue, mark page as failed, return results with 0 design score (bypass AI).
- **axe-core timeout:** Skip axe results, continue with other checks. Page still scans.
- **Lighthouse failure:** Return null CWV; continue scan; performance checks use fallback values.
- **AI timeout:** Return null for that AI call; use primary locale only if alt times out; continue.
- **Screenshot failure:** Continue scan without screenshots; frontend displays placeholder.
- **Design analysis failure:** Mark async complete anyway; keep HTML design score.
- **Full-scan timeout (15 min):** Mark scan as "failed" with "Service timeout" message.
- **Service crash mid-scan:** `activeFullScans` map detects on-restart; scan marked "failed" by crash handler.

## Cross-Cutting Concerns

**Logging:** Console.log with prefixes: `[quick-scan]`, `[full-scan-async]`, `[design-bg]`, `[scanner]`, etc. All logs flow to Rails logs and Supabase.

**Validation:**
- URL: Format (http/https) + SSRF checks (`validateUrlSafe()`) + redirect-chain detection (fail if cross-domain redirect).
- Locale: Must be "en" or "nl" (checked via `isLocale()` in app; passed to service).
- Rate limit: 5 scans per IP hash per hour (checked at route time).

**Authentication:**
- Public routes (scan, report, start): No auth required.
- Admin routes: Session-based (check `process.env.ADMIN_PASSWORD` or Vercel password protection).
- Scanner service endpoints: Bearer token (`Authorization: Bearer ${SCANNER_API_KEY}`) required on all `/api/*` routes.
- Webhook callback: Bearer token verification required.

**Observability:**
- Errors logged to console (Rails captures).
- Scan timing tracked: `Date.now() - startTime` logged at key checkpoints.
- Scores logged for every page: `overall=${scores.overall}`.
- Design analysis status logged: cache hit/miss, timeout fallback, final score.
