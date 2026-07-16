# External Integrations

**Analysis Date:** 2026-07-16

## APIs & External Services

**Generative AI:**
- Google Generative AI (Gemini) - AI-driven website design and content analysis
  - SDK: `@google/generative-ai` v0.24.1
  - Auth: `GOOGLE_API_KEY` environment variable
  - Used in: `scanner-service/src/ai/` for design analysis and sales brief generation
  - Async processing: Design analysis runs in background after initial scan completes

**Form Submission Tracking:**
- Fillout - External form and appointment booking service
  - Webhook endpoint: `POST /api/webhooks/fillout` (query parameter secret)
  - Auth mechanism: Secret token via `FILLOUT_WEBHOOK_SECRET`
  - Function: Marks leads as "booked" when appointment form submitted to prevent follow-up emails
  - Payload structure: `{ formId, submissionId, questions: [{ id, name, type, value }, ...] }`

**Email & Events:**
- Resend - Transactional email API with event webhooks
  - SDK: `resend` v6.9.4
  - Auth: `RESEND_API_KEY` environment variable
  - From address: `RESEND_FROM_EMAIL` (defaults to `scan@adashi.io`)
  - Webhook endpoint: `POST /api/webhooks/resend`
  - Webhook auth: Svix signature verification (`svix-id`, `svix-timestamp`, `svix-signature` headers)
  - Events tracked: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.delivery_delayed`
  - Email types sent: confirmation, report_ready, follow_up, admin_notification
  - Implementation: `lib/email.ts`, `app/api/webhooks/resend/route.ts`

**Website Analysis Tools:**
- Lighthouse - Performance, accessibility, and best practices auditing
  - Library: `lighthouse` v13.1.0
  - Used in: `scanner-service/src/scanner/` for page scoring
  - Purpose: Generates performance metrics, accessibility scores, SEO checks

- axe-core - WCAG accessibility testing engine
  - Libraries: `axe-core` v4.10.0, `@axe-core/playwright` v4.10.0
  - Used in: `scanner-service/src/scanner/` for accessibility issue detection
  - Scope: Identifies WCAG 2.1 violations and accessibility issues

**Browser Control:**
- Playwright - Headless browser automation
  - Version: 1.58.2
  - Used in: `scanner-service/src/scanner/` for page traversal and screenshot capture
  - Base image: `mcr.microsoft.com/playwright:v1.58.2-noble` (pre-includes Chromium)
  - Capabilities: Multi-page crawling, DOM inspection, screenshot capture

## Data Storage

**Databases:**
- Supabase PostgreSQL
  - Connection: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role for admin operations)
  - Client: `@supabase/supabase-js` v2.99.3 (in both root and scanner-service)
  - Tables:
    - `scans`: id, url, domain, type, status, scores (JSONB), summary (JSONB), pages (JSONB), screenshots (JSONB), cost_estimate (JSONB), quick_wins (JSONB), website_personality, sales_brief, visitor_experience, ai_content_alt (JSONB), issues_alt (JSONB), locale, started_at, completed_at, ip_hash, created_at, design_analysis_cached (JSONB)
    - `leads`: id, email, domain, scan_id, source, gdpr_consent, consent_timestamp, booked_at, created_at
    - `email_events`: id, scan_id, email, email_type, resend_email_id, status, metadata (JSONB), created_at, updated_at
  - Indexes: Domain, status, created_at, ip_hash, email, email_type, resend_email_id for query optimization
  - Security: Row-Level Security (RLS) enabled; anon users can read scans by ID only; service role handles all lead/event operations

**File Storage:**
- Supabase Storage - Homepage screenshots uploaded to Supabase bucket
  - Used in: `scanner-service/src/screenshots.ts`
  - Purpose: Store website homepage screenshots for design analysis

## Authentication & Identity

**Auth Pattern:**
- API Key-based (service-to-service) - No user login system
- Scanner service ↔ Next.js app: Bearer token via `SCANNER_API_KEY`
  - Used in: `lib/scanner-client.ts` (app calling scanner), `app/api/internal/scan-complete/route.ts` (scanner calling app)
- Cron jobs: Bearer token via `CRON_SECRET` header
- Webhook verification: Fillout secret via query parameter; Resend via Svix signature verification

## Monitoring & Observability

**Error Tracking:**
- Console logging (stderr) - Basic error logging throughout codebase
- No external error tracking service configured

**Logs:**
- Console output captured by Railway (scanner-service) and Vercel (Next.js app)
- Cron job status logged to console (Vercel Function logs)

## CI/CD & Deployment

**Hosting:**
- Vercel - Next.js app and cron jobs
  - Framework: Next.js 14
  - Environment: Node.js serverless functions
  - Health endpoint: `GET /api/health` (internal check)
  - Cron jobs defined in `vercel.json` with CRON schedule syntax

- Railway - Express scanner-service backend
  - Docker-based deployment from `scanner-service/Dockerfile`
  - Health check: `GET /health` (300s timeout)
  - Port: 3001
  - Restart policy: ON_FAILURE (max 3 retries)

**CI Pipeline:**
- Git-based deployments (no explicit CI config files for GitHub Actions/CI visible)
- Next.js build: `next build` produces optimized output
- Scanner-service build: `tsc` compiles TypeScript to JavaScript

## Environment Configuration

**Required env vars (Next.js app):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Public anon key (client-side)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role for admin operations (server-side)
- `SCANNER_SERVICE_URL` - Express scanner-service base URL (internal endpoint)
- `SCANNER_API_KEY` - API key for scanner-service auth
- `RESEND_API_KEY` - Resend email API key
- `RESEND_FROM_EMAIL` - Sender email address (defaults to scan@adashi.io)
- `RESEND_WEBHOOK_SECRET` - Webhook signature secret
- `FILLOUT_WEBHOOK_SECRET` - Fillout webhook secret
- `CRON_SECRET` - Bearer token for cron job authentication
- `NEXT_PUBLIC_SITE_URL` - Public site URL (e.g., https://scan.adashi.io)
- `ADMIN_EMAIL` - Admin notification recipient email (optional)

**Required env vars (Scanner-service):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `GOOGLE_API_KEY` - Google Generative AI API key
- `SCANNER_API_KEY` - API key for auth from Next.js app
- `PORT` - Listen port (defaults to 3001)
- `ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)

**Secrets location:**
- Local: `.env`, `.env.local` (development)
- Production: Vercel Secrets (Next.js), Railway Environment Variables (scanner-service)

## Webhooks & Callbacks

**Incoming (Next.js app receives):**

1. **Fillout Webhook:**
   - Endpoint: `POST /api/webhooks/fillout?secret=<FILLOUT_WEBHOOK_SECRET>`
   - Trigger: User submits appointment booking form on Fillout
   - Payload: Form submission with email address
   - Action: Updates `leads.booked_at` timestamp to prevent follow-up emails
   - Source file: `app/api/webhooks/fillout/route.ts`

2. **Resend Webhook:**
   - Endpoint: `POST /api/webhooks/resend`
   - Trigger: Email events (sent, delivered, opened, clicked, bounced, complained)
   - Payload: Signed via Svix (`svix-id`, `svix-timestamp`, `svix-signature`)
   - Action: Updates `email_events.status` with delivery/engagement tracking
   - Source file: `app/api/webhooks/resend/route.ts`

3. **Scanner-Service Completion Callback:**
   - Endpoint: `POST /api/internal/scan-complete`
   - Trigger: Scanner-service finishes full scan and design analysis
   - Auth: Bearer token (`SCANNER_API_KEY`)
   - Payload: `{ scanId: string }`
   - Action: Sends "report ready" email to user and admin notification email
   - Source file: `app/api/internal/scan-complete/route.ts`

**Outgoing (Next.js app initiates):**

1. **Scanner-Service Request:**
   - Service: Express scanner-service on Railway
   - Endpoints: `/api/scan/quick` (single page), `/api/scan/full` (multi-page), `/api/scan/full-async` (async with callback)
   - Auth: Bearer token via `Authorization: Bearer <SCANNER_API_KEY>`
   - Payload: `{ url, maxPages?, scanId?, locale? }`
   - Response: Scan results with scores, issues, screenshots, AI analysis
   - Client: `lib/scanner-client.ts` (ScannerClient class)
   - Used in: `app/api/scan/route.ts` (user initiates scan)

2. **Resend Email Send:**
   - Service: Resend API
   - Operations: Send confirmation, report_ready, follow_up, admin_notification emails
   - Auth: API key via `RESEND_API_KEY`
   - Response: Email ID for tracking via webhook events
   - Implementation: `lib/email.ts` (sendConfirmationEmail, sendReportReadyEmail, sendFollowUpEmail, sendAdminNotificationEmail)

## Cron Jobs & Scheduled Tasks

**Defined in `vercel.json`:**

1. **Keepalive (`/api/cron/keepalive`)**
   - Schedule: `0 9 * * 1` (Monday, 09:00 UTC)
   - Purpose: Prevent Supabase free-tier auto-pause by pinging database
   - Auth: `CRON_SECRET` via Authorization header
   - Implementation: `app/api/cron/keepalive/route.ts`
   - Max duration: 30s

2. **Follow-Up Email (`/api/cron/follow-up`)**
   - Schedule: `0 10 * * *` (Daily, 10:00 UTC)
   - Purpose: Send follow-up emails 3+ days after report delivery
   - Guardrails: Max 1 per lead, skip booked leads, max 20 per run
   - Auth: `CRON_SECRET` via Authorization header
   - Implementation: `app/api/cron/follow-up/route.ts`
   - Max duration: 60s

3. **Send Pending Reports (`/api/cron/send-pending-reports`)**
   - Schedule: `0 * * * *` (Hourly at top of hour)
   - Purpose: Retry sending report emails for completed scans (fallback if callback fails)
   - Guardrails: Only processes scans completed in last 24 hours, max 10 per run
   - Auth: `CRON_SECRET` via Authorization header
   - Implementation: `app/api/cron/send-pending-reports/route.ts`
   - Max duration: 60s

---

*Integration audit: 2026-07-16*
