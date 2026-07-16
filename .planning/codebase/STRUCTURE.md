# Codebase Structure

**Analysis Date:** 2026-07-16

## Directory Layout

```
website-scanner/ (root)
├── app/                         # Next.js 14 App Router frontend (Vercel)
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Homepage / entry point
│   ├── start/                   # Scan form page (URL input)
│   ├── scan/[id]/
│   │   └── page.tsx             # Scan progress page (polls status)
│   ├── report/[id]/
│   │   └── page.tsx             # Final report page (displays results)
│   ├── embed/[domain]/
│   │   └── page.tsx             # Embeddable widget (for client sites)
│   ├── admin/                   # Admin dashboard (password protected)
│   │   ├── page.tsx             # Lead list + filters
│   │   └── lead/[id]/
│   │       └── page.tsx         # Individual lead detail page
│   ├── actions/
│   │   └── locale.ts            # Server action for language toggle
│   └── api/                     # Next.js API routes
│       ├── scan/
│       │   ├── route.ts         # POST /api/scan (orchestrates quick scan)
│       │   └── [id]/
│       │       ├── status/
│       │       │   └── route.ts # GET /api/scan/[id]/status (poll progress)
│       │       └── email/
│       │           └── route.ts # POST /api/scan/[id]/email (email subscription)
│       ├── internal/
│       │   └── scan-complete/
│       │       └── route.ts     # POST /internal/scan-complete (webhook from scanner service)
│       ├── admin/               # Admin API endpoints
│       │   ├── delete/
│       │   │   └── route.ts     # DELETE scan/lead
│       │   ├── stats/
│       │   │   └── route.ts     # GET dashboard stats
│       │   ├── lead/[id]/
│       │   │   └── route.ts     # GET/PUT lead details
│       │   ├── test-email/
│       │   │   └── route.ts     # POST test email
│       │   └── trigger-keepalive/
│       │       └── route.ts     # POST poke scanner service
│       ├── cron/                # Cron job endpoints (Vercel cron or external trigger)
│       │   ├── follow-up/
│       │   │   └── route.ts     # POST send follow-up emails
│       │   ├── keepalive/
│       │   │   └── route.ts     # POST prevent service sleep
│       │   └── send-pending-reports/
│       │       └── route.ts     # POST send queued report emails
│       ├── health/
│       │   └── route.ts         # GET health check
│       └── webhooks/
│           ├── fillout/
│           │   └── route.ts     # POST Fillout form webhook
│           └── resend/
│               └── route.ts     # POST Resend email webhook
│
├── lib/                         # Shared logic (app-side)
│   ├── scanner-client.ts        # HTTP client for scanner service
│   ├── supabase.ts              # Supabase client factory
│   ├── email.ts                 # Email template + send logic
│   ├── url-validation.ts        # URL validation (client + server)
│   ├── url-validation.server.ts # Server-only URL validation (SSRF checks)
│   ├── scoring.ts               # Score aggregation + summary building (app-side)
│   └── i18n-helpers.ts          # i18n utilities (locale detection)
│
├── scanner-service/             # Express scanning service (Railway)
│   ├── src/
│   │   ├── index.ts             # Express app + route handlers
│   │   ├── scanner.ts           # Main scanning orchestrator (Playwright, axe, etc.)
│   │   ├── analyzer.ts          # Convert axe results → Issue[]
│   │   ├── extractor.ts         # Extract page data (links, images, metadata)
│   │   ├── scoring.ts           # Compute per-page scores (service-side)
│   │   ├── lighthouse.ts        # Core Web Vitals audit runner
│   │   ├── mobile.ts            # Mobile usability pass
│   │   ├── ai.ts                # Claude API calls (summaries, overrides, cost estimates)
│   │   ├── discovery.ts         # Crawl internal links for full scans
│   │   ├── screenshots.ts       # Capture + upload screenshots
│   │   ├── issue-difficulty.ts  # Compute fix complexity
│   │   └── middleware/
│   │       └── auth.ts          # Bearer token verification
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── types/
│   └── scanner.ts               # Shared types (request/response, Issue, ScanScores, etc.)
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_create_scans_and_leads.sql
│   │   ├── 002_add_two_phase_columns.sql
│   │   └── ...
│   └── config.toml
│
├── i18n/
│   ├── config.ts                # Locale definitions
│   ├── en.json                  # English strings
│   └── nl.json                  # Dutch strings
│
├── templates/                   # Email templates (HTML)
│   ├── confirmation.html
│   ├── report-ready.html
│   └── follow-up.html
│
├── public/
│   ├── favicon.ico
│   ├── logo.svg
│   └── ...
│
├── .planning/
│   └── codebase/               # ← YOU ARE HERE
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
│
├── .vercel/                     # Vercel deployment metadata (generated)
├── .next/                       # Next.js build output (generated)
├── .git/                        # Git repository
│
├── package.json                 # App dependencies
├── tsconfig.json                # TypeScript config (app)
├── next.config.js               # Next.js config
├── tailwind.config.ts           # Tailwind CSS config
├── .eslintrc.json               # ESLint config
└── vercel.json                  # Vercel deployment config
```

## Directory Purposes

**`app/`:**
- Purpose: Next.js 14 App Router frontend; contains all UI pages and API routes
- Contains: Pages (JSX/TSX), API route handlers, server actions
- Key files: `page.tsx` (homepage), `scan/[id]/page.tsx` (status page), `report/[id]/page.tsx` (results)
- Deployed to: Vercel (on every git push)

**`lib/`:**
- Purpose: Shared utilities used by multiple API routes
- Contains: HTTP client (scanner-client), Supabase wrapper, email templates, validation logic
- Key responsibility: Convert between request/response formats, talk to external services
- Never used by: Scanner service (separate deployable)

**`scanner-service/`:**
- Purpose: Express service running continuously on Railway; performs CPU-intensive scanning
- Contains: Playwright automation, axe-core, Lighthouse runner, Claude API calls
- Key files: `src/scanner.ts` (main), `src/index.ts` (routes)
- Deployed to: Railway (manual deployment or git push + deploy hook)
- Environment: Isolated from app; uses only Supabase + external APIs

**`types/`:**
- Purpose: Shared TypeScript types used by both app and scanner-service
- Contains: `ScanResponse`, `Issue`, `PageResult`, `ScanScores`, `PageData`, etc.
- Key principle: Single source of truth; both deployables must import from here
- Never modify without: Checking both app and service still compile

**`supabase/`:**
- Purpose: Database schema and migrations
- Contains: SQL migration files numbered sequentially
- Never manually edit: Always create new migration file for schema changes
- Apply locally: `supabase migration up` (development), Supabase platform handles production

**`i18n/`:**
- Purpose: Locale configuration and translation strings
- Contains: `config.ts` (locales array), `en.json`, `nl.json` (translations)
- Used by: Email templates, report pages, admin dashboard
- Add new locale: Create new language folder, update config, run build

**`templates/`:**
- Purpose: Email HTML templates (plain HTML, not JSX)
- Contains: `confirmation.html`, `report-ready.html`, `follow-up.html`
- Used by: `lib/email.ts` (loads + renders with Handlebars or similar)
- Modify: Update HTML; re-deploy app

## Key File Locations

**Entry Points:**
- `app/api/scan/route.ts`: POST endpoint that initiates scans (quick + full paths)
- `scanner-service/src/index.ts`: Express app definition; route handlers for `/api/scan/quick`, `/api/scan/full`, `/api/scan/full-async`
- `app/page.tsx`: Homepage (usually redirects to `/start`)

**Configuration:**
- `.env.local` / `.env`: API keys, Supabase URL, scanner service URL (never committed)
- `vercel.json`: Vercel deployment config (cron jobs, environment variables)
- `scanner-service/.env.example`: Example env vars for scanner service

**Core Logic:**
- `scanner-service/src/scanner.ts`: Loads page, runs axe-core, extracts data, computes initial scores
- `scanner-service/src/analyzer.ts`: Converts axe violations + page data → Issue[]
- `scanner-service/src/scoring.ts`: Computes per-page scores (deductions based on issue impact + load time)
- `scanner-service/src/ai.ts`: Claude API calls for summaries, issue overrides, cost estimates
- `lib/scanner-client.ts`: HTTP client that calls scanner service from Next.js

**Testing:**
- No test directory currently; tests would go in `__tests__/` or alongside source files with `.test.ts`
- `scanner-service/` has no test infrastructure; consider adding Jest if adding unit tests

**Database:**
- `supabase/migrations/`: SQL migration files (versioned, immutable once committed)
- Schema changes: Create new migration, never edit existing ones

## Naming Conventions

**Files:**
- Component pages: `[id]/page.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention for app directory)
- Utils: `camelCase.ts` (e.g., `scanner-client.ts`, `url-validation.ts`)
- Services: `camelCase.ts` (e.g., `analyzer.ts`, `extractor.ts`)
- Migrations: `{sequence}_{description}.sql` (e.g., `001_create_scans_and_leads.sql`)

**Directories:**
- Route segments: `[paramName]` for dynamic routes (Next.js convention)
- Logical grouping: Lowercase, dash-separated (e.g., `scanner-service/`, `api/`)
- Features: Grouped by route path (e.g., `admin/`, `cron/`)

**Functions & Exports:**
- Async functions: `camelCase` (e.g., `quickScan()`, `scanPage()`, `buildSummary()`)
- Classes: `PascalCase` (e.g., `ScannerClient`, `AxeBuilder`)
- Types/Interfaces: `PascalCase` (e.g., `ScanResponse`, `Issue`, `PageResult`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `SCORE_WEIGHTS`, `ALLOWED_ORIGINS`)

**Environment Variables:**
- All uppercase, snake-case (e.g., `SCANNER_SERVICE_URL`, `SCANNER_API_KEY`, `SUPABASE_URL`)
- Sensitive: Never committed; set in `.env.local` (app) and Railway dashboard (service)

## Where to Add New Code

**New Feature (Multi-page Reporting Enhancement):**
- Primary code: `scanner-service/src/` (new analyzer for multi-page patterns) + `lib/` (new UI helper)
- Tests: Create `scanner-service/__tests__/newAnalyzer.test.ts`
- DB changes: Create `supabase/migrations/010_add_feature.sql` if needed
- Types: Update `types/scanner.ts` with new fields
- Routes: Likely no new routes (existing `/api/scan/*` endpoints scale)

**New Component/Module (E.g., OAuth Integration):**
- Implementation: `lib/auth-provider.ts` (if app-side) or `scanner-service/src/auth.ts` (if service-side)
- Config: Add to `.env.example` and document in README
- Tests: `__tests__/auth-provider.test.ts`
- Routes: If needed, add to `app/api/auth/*` or `scanner-service/src/index.ts`

**Utilities (Shared Helpers):**
- Shared by both app and service: `types/` (if types) or `scanner-service/src/` with app importing via HTTP
- App-only (used in routes only): `lib/`
- Service-only: `scanner-service/src/`
- Rule of thumb: Minimize direct imports between deployables; use HTTP APIs

**Email Template (New Campaign):**
- Add: `templates/new-campaign.html`
- Reference in: `lib/email.ts` (add new function that loads + renders template)
- Add translations: Update `i18n/en.json` and `i18n/nl.json`
- Test: Use `/api/admin/test-email` to send test

**Database Migration (New Field):**
- Create: `supabase/migrations/{nextSequence}_{description}.sql`
- Never edit: Existing migration files (they're immutable once committed)
- Test locally: `supabase migration up`
- Deploy: Supabase platform runs automatically on git push
- Update types: Add field to `ScanRow` in `types/scanner.ts`

**Cron Job (Scheduled Task):**
- Create: `app/api/cron/{name}/route.ts`
- Trigger: Add to `vercel.json` under `crons`, OR use external scheduler (e.g., EasyCron) to POST to the route
- Example: `app/api/cron/follow-up/route.ts` sends emails every hour
- Never call directly: Use Vercel's cron feature or manual trigger; no infinite loops

**Analyzer Extension (New Issue Type):**
- Add detection: `scanner-service/src/analyzer.ts` (add function that checks page data for condition)
- Add to issues: Push to Issue[] array with proper category + severity
- Update scoring: If new category, add to `scanner-service/src/scoring.ts` (deduction logic)
- Document: Add test case in `__tests__/analyzer.test.ts` (if tests exist)
- Report: Issue card displays in `app/report/[id]/page.tsx` automatically

**New API Endpoint (Example: Batch Scan):**
- Add route: `app/api/scan/batch/route.ts`
- Update types: Add `BatchScanRequest` to `types/scanner.ts`
- Call scanner service: Use `lib/scanner-client.ts` (loop over URLs)
- Return: `ScanResponse[]` or job ID for async
- Rate limit: Apply to each scan in batch (reuse existing logic)
- Handle errors: Fail individual scans gracefully; return partial results

## Special Directories

**`node_modules/`:**
- Purpose: NPM packages (generated)
- Committed: NO (in `.gitignore`)
- Update: `npm install` or `npm update`

**`.next/`:**
- Purpose: Next.js build output (generated)
- Committed: NO (in `.gitignore`)
- Regenerate: Runs automatically on `npm run dev` and `npm run build`

**`.vercel/`:**
- Purpose: Vercel deployment metadata (generated)
- Committed: NO (ignored by default)
- Manage: Via Vercel CLI (`vercel` command) or dashboard

**`.planning/`:**
- Purpose: Planning documents (this file, ARCHITECTURE.md, etc.)
- Committed: YES (source control for planning)
- Update: Run `/gsd-map-codebase` when architecture changes significantly

## How to Run Locally

### Next.js App (Port 3000)
```bash
cd /project/root
npm install
npm run dev
```
Runs on `http://localhost:3000`. Hot-reload enabled.

### Scanner Service (Port 3001)
```bash
cd /project/root/scanner-service
npm install
npm run dev
```
Runs on `http://localhost:3001`. Must set `.env` vars:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SCANNER_API_KEY=...
ALLOWED_ORIGINS=http://localhost:3000
```

### Database (Supabase)
```bash
supabase start  # Runs locally in Docker
supabase migration up  # Applies migrations
```

### Both Together
```bash
npm run dev:all  # If package.json has this script (check first)
# Otherwise run both terminals separately
```

## Deployment

**Frontend (Vercel):**
- On git push to main: Automatic build + deploy
- Environment variables: Set in Vercel dashboard
- Cron jobs: Defined in `vercel.json`
- Logs: View in Vercel dashboard

**Scanner Service (Railway):**
- Manual deploy: `railway up` or link GitHub for auto-deploy
- Environment variables: Set in Railway dashboard
- Logs: View in Railway dashboard
- Restart: `railway restart` or via dashboard

**Database (Supabase):**
- Migrations: Auto-applied when schema changes are pushed to main
- Schema changes: Only via migrations; never direct SQL edits

## Common Patterns

**Adding a New Score Category:**
1. Add to `ScanScores` interface in `types/scanner.ts`
2. Add deduction logic to `scanner-service/src/scoring.ts` (scorePage)
3. Update weight calculation (ensure weights sum to 1.0)
4. Add check in `scanner-service/src/analyzer.ts` or `scanner.ts` to detect issues for this category
5. Update report UI: `app/report/[id]/page.tsx` (add score card)
6. Test: Run quick scan, verify new score appears

**Adding a New AI-Generated Field:**
1. Add to response type in `lib/scanner-client.ts` → `ScannerResponse`
2. Add computation in `scanner-service/src/ai.ts` → `runLocaleAiPipeline()` or similar
3. Add to bilingual (alt) response in `scanner-service/src/index.ts` (parallel call)
4. Persist to DB: Update `app/api/scan/route.ts` (add to update payload)
5. Display in UI: Update `app/report/[id]/page.tsx` or relevant page
6. Test: Verify field appears in report after scan

**Adding a New Database Column:**
1. Create migration: `supabase/migrations/{seq}_{name}.sql` (ALTER TABLE scans ADD COLUMN ...)
2. Update type: `ScanRow` interface in `types/scanner.ts`
3. Populate: Add default/computed value in migration or data migration script
4. Use in app: Reference field in API routes, update queries
5. Test: Local run, verify migration applies and data is accessible
