<!-- GSD:project-start source:PROJECT.md -->

## Project

**Prospect Radar**

A private prospecting layer built on top of the existing Website Scanner. It pulls
businesses from open map data, cheaply triages their websites, runs a full scan on the
ones that look bad enough to be worth pitching, and hands Joshua a drafted cold email
plus a hosted scan report to approve and send.

It exists to fill Adashi's own sales pipeline. It is a single-tenant internal tool, not
a product. If it demonstrably works for Joshua, productising it becomes a separate
milestone with its own decision.

**Core Value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the proof
already written, so that outreach costs him minutes instead of hours.

If everything else fails, this must work: a qualified prospect, a real scan report, and
a drafted message he is willing to send.

### Constraints

- **Tech stack**: Vercel, Railway, Supabase, Resend, Gemini, Playwright only — no new
  infrastructure. Everything is already paid for and already understood.

- **Budget**: costs stay near zero. This is what rules out Places at scale, and what makes
  the triage stage load-bearing rather than optional.

- **Performance**: bulk scanning must respect scanner-service browser concurrency. The
  codebase audit says the current limits break under bulk load; the design must not
  pretend otherwise.

- **Scale**: 10–50 prospects per week. Deliberately small. Solutions sized for thousands
  are over-built and should be rejected on sight.

- **Legal**: every send passes a human gate, carries `List-Unsubscribe`, and is checked
  against the suppression list first. Non-negotiable.

- **Provider policy**: the outreach channel must permit outreach under its own terms.
  Resend does not. Any candidate channel is checked against its AUP before it is built
  against, not after.

- **Blast radius**: nothing in this milestone may put the existing public scanner's email
  or scanning at risk. It works and it earns. Outreach failures must stay contained.

- **Geography**: country and locale are parameters, never hardcoded. NL is the first
  target, not the only one.

- **Tenancy**: single-tenant. No users, no teams, no billing.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.x - Frontend (Next.js), backend (Express scanner-service), and shared types
- JavaScript - Configuration files and build scripts
- SQL - Database migrations and Supabase schema (`supabase/migrations/`, `supabase/schema.sql`)

## Runtime

- Node.js 18+ - For Next.js server and Express scanner-service
- npm (package-lock.json present for both root and `scanner-service/`)

## Frameworks

- Next.js 14.2.35 - App Router, server-side rendering, API routes (`package.json`, `next.config.mjs`)
- Express 4.21.0 - REST API server for scanner-service (`scanner-service/package.json`)
- React 18 - UI components
- TypeScript 5.x - Type checking and compilation
- PostCSS 8 - CSS processing (`postcss.config.mjs`)
- Tailwind CSS 3.4.1 - Utility-first styling (`tailwind.config.ts`)
- ESLint 8.x - Linting with Next.js config (`eslint-config-next 14.2.35`)

## Key Dependencies

- @supabase/supabase-js 2.99.3 - PostgreSQL client and real-time subscriptions (both root and scanner-service)
- resend 6.9.4 - Transactional email API with webhook events (`lib/email.ts`, `app/api/webhooks/resend/route.ts`)
- svix 1.89.0 - Webhook signature verification for Resend events (`app/api/webhooks/resend/route.ts`)
- next-intl 4.13.0 - Multi-language support (EN, NL) for UI and email
- lighthouse 13.1.0 - Performance, accessibility, best practices auditing (scanner-service)
- axe-core 4.10.0 - WCAG accessibility testing (scanner-service)
- @axe-core/playwright 4.10.0 - Playwright integration for axe (scanner-service)
- playwright 1.58.2 - Headless browser control for website scanning (scanner-service)
- chrome-launcher 1.2.1 - Chrome browser launch utility (scanner-service)
- @google/generative-ai 0.24.1 - Google Gemini API for AI-driven design and content analysis (scanner-service)
- helmet 8.0.0 - HTTP headers security (scanner-service)
- cors 2.8.5 - Cross-Origin Resource Sharing (scanner-service)
- dotenv 17.3.1 - Environment variable loading (scanner-service)
- tsx 4.19.0 - TypeScript execution for development (`scanner-service/package.json` dev script)

## Configuration

- Environment variables defined in `.env`, `.env.local` (not readable due to permissions, but referenced throughout codebase)
- Required vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `FILLOUT_WEBHOOK_SECRET`, `SCANNER_SERVICE_URL`, `SCANNER_API_KEY`, `CRON_SECRET`, `GOOGLE_API_KEY`
- `vercel.json` - Vercel deployment config with cron jobs (three scheduled tasks)
- `next.config.mjs` - Next.js configuration
- `tailwind.config.ts` - Tailwind CSS customization
- `tsconfig.json` - TypeScript compiler options (strict mode, path aliases `@/*`)
- `scanner-service/railway.toml` - Railway deployment config, Docker build setup, health check configuration
- Supabase PostgreSQL backend
- Migrations stored in `supabase/migrations/` (9 files from Mar–Jun 2026)
- Schema covers: `scans`, `leads`, `email_events` tables with indexes and RLS policies
- `scanner-service/Dockerfile` - Multi-layer build using `mcr.microsoft.com/playwright:v1.58.2-noble` base image

## Platform Requirements

- Node.js 18+ required
- Docker (for local scanner-service testing)
- Vercel - Next.js app hosting (cron jobs via Vercel Cron)
- Railway - Express scanner-service hosting
- Supabase - PostgreSQL database hosting
- Resend - Email delivery service
- Google Generative AI API - Gemini access for analysis

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- React components: kebab-case (`components/ui/url-input.tsx`, `components/report/quick-wins.tsx`)
- Utilities and libraries: camelCase (`lib/i18n-helpers.ts`, `lib/supabase.ts`)
- API routes: route.ts files in `app/api/[path]/` (e.g., `app/api/scan/route.ts`)
- Page components: page.tsx in `app/[path]/` (e.g., `app/scan/[id]/page.tsx`)
- Server-only utilities: `.server.ts` suffix (e.g., `lib/url-validation.server.ts`)
- Exported functions: camelCase (`validateUrlFormat`, `extractDomain`, `pickLocalizedScan`)
- React components: PascalCase (`Button`, `ScanResults`, `LanguageToggle`)
- Helper/utility functions: camelCase (`withTimeout`, `failScan`, `dedupeCookieAiIssues`)
- Constants: UPPER_SNAKE_CASE (`REQUIRED_VARS`, `BLOCKED_IP_RANGES`, `PORT`)
- Local variables: camelCase (`domain`, `locale`, `ipHash`)
- Event handlers: `on[Event]` pattern (implicit in props)
- Interfaces: PascalCase with I prefix for function parameters (`ButtonProps`, `ScanLike`, `LocalizedScanContent`)
- Type aliases: PascalCase (`ButtonVariant`, `ButtonSize`)
- Record types: `Record<string, Type>` pattern used throughout

## Code Style

- ESLint: Next.js core-web-vitals + TypeScript recommended config (`@next/core-web-vitals`, `next/typescript`)
- No Prettier config; relies on Next.js ESLint defaults
- Line length: 80–100 characters typical
- Indentation: 2 spaces (TypeScript files)
- Config: `.eslintrc.json` extends `next/core-web-vitals` and `next/typescript`
- Enforcement: `npm run lint` via Next.js CLI
- No custom rules beyond Next.js recommended set

## Import Organization

- `@/*` → root directory (configured in `tsconfig.json` and `scanner-service/tsconfig.json`)
- `@shared/*` → `../types/*` (scanner-service only)

## Error Handling

- Catches and re-throws validation errors
- Performs DNS resolution and IP validation
- Throws `UrlValidationError` for security violations
- Returns normalized URL on success

## Logging

- Log level indicators in brackets: `[scan]`, `[design-bg]`, `[scan-recovery]`
- Include relevant context: domain, locale, scan ID, user action
- Examples from `app/api/scan/route.ts`:
- Error logging: `console.error()` with context

## Comments

- Complex business logic (e.g., bilingual cache strategy in `app/api/scan/route.ts` lines 78–80)
- Non-obvious security decisions (SSRF protection in `lib/url-validation.server.ts`)
- Rate limiting and cache semantics
- Async patterns and timeout behavior

## Function Design

- Explicit parameters over config objects where arity is ≤ 3
- Type-annotated in TypeScript
- Optional params use `?` and default values
- Example: `pickLocalizedScan(scan: ScanLike, currentLocale: string): LocalizedScanContent`
- Explicit return type annotations on all exported functions
- Error cases throw custom error types or return error objects in API responses
- Async functions return `Promise<T>`
- Example: `validateUrlFormat(input: string): string` (throws on error)

## Module Design

- Named exports for utilities and functions
- Default export for React components (implicit via file name)
- Type exports marked with `export type`
- Not used; imports are direct (`import { Button } from "@/components/ui/button"`)
- Utility libraries in `lib/` (supabase, validation, i18n, email, scoring)
- React components in `components/[category]/` (ui, layout, report, scan, admin)
- Pages in `app/[path]/page.tsx`
- API routes in `app/api/[path]/route.ts`
- Server actions in `app/actions/`
- Types in `types/` (shared with scanner-service via `@shared/*`)

## Supabase Client Access

- API routes: always use `createServerClient()`
- Client components: use `createBrowserClient()` (not yet implemented; RLS policies enforce access)

## i18n Conventions

- Hook-based translation: `useTranslations()` returns `t` function
- Namespace-based keys: `common.grade`, `common.locale`
- Helper functions for domain-specific logic: `lib/i18n-helpers.ts`
- Primary locale stored in `scan.locale`
- Alt-locale content in `scan.ai_content_alt` and `scan.issues_alt`
- Helper: `pickLocalizedScan()` resolves which content to display based on visitor locale
- Per-issue overrides: `applyIssuesAlt()` swaps specific fields (title, description, etc.)

## TypeScript Specifics

- `@/*` resolves to project root
- Used throughout for clean imports
- `satisfies` keyword used for inline type checking: `satisfies Omit<ScanRow, "created_at">`
- Prevents over-typing while catching errors early
- Custom types in `types/scanner.ts` shared with scanner-service
- Type guards (instanceof checks) for error handling

## Git Commit Style

- `feat`: New feature
- `fix`: Bug fix
- `style`: Formatting only (not code style, but visual/UI)
- `refactor`: Code restructuring
- `scanner` – Scanner service changes
- `email` – Email functionality
- `voice` – Copy/messaging
- `i18n` – Internationalization
- No scope – General or multi-scope changes

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- **Separation of concerns:** Frontend orchestrates, service performs, database is source of truth
- **Bilingual:** All user-facing content (verdicts, issue overrides, cost estimates) generated in two locales in parallel
- **Two scan modes:** Quick (single page, synchronous, <3 min) and Full (multi-page discovery, async, <15 min)
- **Two-phase scoring:** HTML-based (immediate) + async AI design analysis (runs in background, can take 30-60s)
- **24h caching:** Design AI analysis cached per domain to avoid redundant API calls
- **Stateful polling:** Frontend polls `/api/scan/[id]/status` to check progress and design-ready state
- **Fire-and-forget async:** Full scans return immediately, update DB directly via service, notify app via webhook

## Layers

- Purpose: Handle HTTP requests from users and the scanner service
- Location: `app/` (Next.js routes)
- Contains: Public pages (start, scan, report, embed), admin dashboard, API handlers
- Depends on: Supabase client, ScannerClient, email service
- Used by: Browsers, scanner service (via callbacks)
- Purpose: Manage the scan lifecycle (create, poll status, handle callbacks)
- Location: `app/api/` (route handlers)
- Contains: `/scan` (POST — create and run), `/scan/[id]/status` (GET — poll), `/internal/scan-complete` (POST — callback)
- Depends on: Supabase, ScannerClient, email
- Used by: Frontend routes, scanner service
- Purpose: Perform the actual page audits and issue detection
- Location: `scanner-service/src/` (service-side modules)
- Contains: `scanner.ts` (orchestration), `analyzer.ts` (issues), `extractor.ts` (data), `lighthouse.ts` (CWV), `mobile.ts` (mobile), `ai.ts` (Claude), `discovery.ts` (crawling), `screenshots.ts` (capture)
- Depends on: Playwright, axe-core, Lighthouse, Claude API, Supabase
- Used by: Express route handlers
- Purpose: Convert issues and metrics into numerical scores
- Location: `scanner-service/src/scoring.ts` (service-side, per-page), `lib/scoring.ts` (app-side, aggregation)
- Contains: `scorePage()` (single page), `aggregateScores()` (multi-page), `buildSummary()` (human-readable)
- Depends on: Issue types, page data
- Used by: Scanning layer, app routes
- Purpose: Persist scans, leads, and email events
- Location: Supabase PostgreSQL (remote), migrations in `supabase/migrations/`
- Contains: `scans`, `leads` tables, RLS policies
- Depends on: Nothing (is the source of truth)
- Used by: All layers

## Data Flow

### Primary Request Path: Quick Scan (Synchronous)

```

```

### Secondary Flow: Full Scan (Asynchronous, Fire-and-Forget)

```

```

### Status Polling Flow

```

```

### Callback Webhook Flow (Full Scan Only)

```

```

### State Management

- `scans.status`: "pending" → "scanning" → "quick_done" | "processing" → "completed" | "failed"
- `scans.scores`: Computed once and persisted; design score updated async if available
- `scans.pages`: Array of PageResult; grows as full scan pages complete
- `scans.design_ai_analyzed_at`: NULL until async design analysis completes (marks when design-ready)
- `scans.ai_content_alt`: Alt-locale AI output (verdicts, summaries, cost estimates, quick wins)
- `scans.issues_alt`: Alt-locale overrides for individual issue text
- `leads.scan_id`: Foreign key to scans table (one-to-many: scan can have multiple leads if re-sent)
- `activeFullScans`: Map<scanId, SupabaseClient> — tracks in-flight full scans for crash recovery
- `scanId` in URL and local storage — frontend uses to poll and navigate

## Key Abstractions

- Purpose: A single page's scan output (URL, status code, load time, extracted data, issues, scores)
- Examples: `app/report/[id]/page.tsx` maps PageResult → UI cards, `scanner-service/src/index.ts` aggregates multiple PageResults
- Pattern: Immutable once created by `scanPage()`; never mutated post-creation
- Purpose: A problem found on the page (ID, category, severity, title, description, recommendation, impact score)
- Examples: "missing-h1", "low-performance", "design-cookie-banner-blocking"
- Pattern: Returned by `analyzeIssues()`, enhanced by AI via `issueOverrides`, displayed in reports
- Purpose: A numeric breakdown (0–100) per category and overall
- Structure: `{ overall, accessibility, content, seo, performance, security, design }`
- Weights: performance 25%, seo 25%, a11y 15%, content 15%, security 10%, design 10%
- Pattern: Computed once by `scorePage()`, then blended with AI design score in background
- Purpose: Raw extracted information from a page (title, headings, links, images, word count, metadata, etc.)
- Examples: `data.wordCount`, `data.h1`, `data.hasViewport`, `data.brokenLinks`, `data.coreWebVitals`
- Pattern: Extracted by `extractPageData()`, used to detect issues and compute scores
- Purpose: Claude vision output on a screenshot (overallScore, issues sentences, detected CTA patterns)
- Pattern: Cached per domain for 24 hours; merged into first page's design score (40% HTML + 60% AI)
- Note: Async, runs only if scanId provided and screenshot available
- Purpose: Bilingual mirror of AI-generated content (alt locale's verdict, cost estimate, quick wins, personality, visitor experience)
- Pattern: Persisted alongside primary content in `ai_content_alt` JSONB column; used by frontend's language toggle

## Entry Points

- Location: `app/api/scan/route.ts` (POST)
- Triggers: Browser form submission or embed script
- Responsibilities: URL validation, rate limiting, cache check, DB creation, scanner service call
- Returns: ScanResponse with ID and initial results
- Location: `app/api/scan/[id]/status/route.ts` (GET)
- Triggers: Frontend polling loop (every 2-5s)
- Responsibilities: Query DB, return status + design-ready flag
- Returns: { status, designReady, error_message, scores }
- Location: `app/api/internal/scan-complete/route.ts` (POST)
- Triggers: Scanner service after full-async completes
- Responsibilities: Verify auth, fetch scan, send emails
- Returns: { sent: true }
- Location: `app/admin/page.tsx` (GET) + `app/api/admin/*` (GET/POST/DELETE)
- Triggers: Admin login
- Responsibilities: List leads, view scan details, filter, delete, trigger keepalive
- Returns: HTML page + JSON responses
- Location: `app/api/cron/follow-up/route.ts` (POST, triggered by Vercel cron)
- Triggers: Every hour
- Responsibilities: Find leads without booked_at, send follow-up email
- Returns: { sent: number }
- Location: `app/api/cron/keepalive/route.ts` (POST, triggered by Vercel cron)
- Triggers: Every 10 minutes
- Responsibilities: Hit scanner service health check to prevent sleep
- Returns: { healthy: boolean }
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

### Duplicate Scoring Logic

### Blocking on Screenshot Upload

### Storing Raw IP Addresses

## Error Handling

- **Network errors (page timeout, Lighthouse hang):** Add a "scan-error" issue, mark page as failed, return results with 0 design score (bypass AI).
- **axe-core timeout:** Skip axe results, continue with other checks. Page still scans.
- **Lighthouse failure:** Return null CWV; continue scan; performance checks use fallback values.
- **AI timeout:** Return null for that AI call; use primary locale only if alt times out; continue.
- **Screenshot failure:** Continue scan without screenshots; frontend displays placeholder.
- **Design analysis failure:** Mark async complete anyway; keep HTML design score.
- **Full-scan timeout (15 min):** Mark scan as "failed" with "Service timeout" message.
- **Service crash mid-scan:** `activeFullScans` map detects on-restart; scan marked "failed" by crash handler.

## Cross-Cutting Concerns

- URL: Format (http/https) + SSRF checks (`validateUrlSafe()`) + redirect-chain detection (fail if cross-domain redirect).
- Locale: Must be "en" or "nl" (checked via `isLocale()` in app; passed to service).
- Rate limit: 5 scans per IP hash per hour (checked at route time).
- Public routes (scan, report, start): No auth required.
- Admin routes: Session-based (check `process.env.ADMIN_PASSWORD` or Vercel password protection).
- Scanner service endpoints: Bearer token (`Authorization: Bearer ${SCANNER_API_KEY}`) required on all `/api/*` routes.
- Webhook callback: Bearer token verification required.
- Errors logged to console (Rails captures).
- Scan timing tracked: `Date.now() - startTime` logged at key checkpoints.
- Scores logged for every page: `overall=${scores.overall}`.
- Design analysis status logged: cache hit/miss, timeout fallback, final score.

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
