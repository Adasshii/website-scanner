# Codebase Concerns

**Analysis Date:** 2026-07-16

## Auth/Exposure Surface

**Admin panel lacks robust authentication for private prospect list.**

- **Current mechanism:** Shared secret (`ADMIN_SECRET` env var) passed via `x-admin-secret` header. Checked in every admin route (`app/api/admin/*/route.ts`).
- **Storage:** Secret stored in browser `sessionStorage` (`app/admin/page.tsx:65`), shared across all admin pages.
- **Problem:** This is an opaque credential with no expiration, per-user tracking, rate-limiting, or audit logging. If `ADMIN_SECRET` is compromised, all admin data is exposed with no way to detect or revoke.
- **Risk with private prospects:** A bulk-import or list-management feature would give access to hundreds/thousands of business records. Shared-secret auth cannot distinguish between authorized users, log who viewed what, or isolate damage if the secret leaks.
- **Files:**
  - `app/admin/page.tsx` (sessionStorage auth)
  - `app/api/admin/stats/route.ts` (secret check, line 7–10)
  - `app/api/admin/lead/[id]/route.ts` (secret check, line 10–12)
  - `app/api/admin/delete/route.ts`
  - `app/api/admin/trigger-keepalive/route.ts`
  - `app/api/admin/test-email/route.ts`

**Recommendation:** Before shipping private prospect features, migrate to:
- Session-based auth (e.g., NextAuth.js or Supabase Auth with cookie + httpOnly)
- Per-user role/permission model (admin vs. read-only, audit trails)
- Rate-limiting and 2FA for admin endpoints

---

## Secrets/Config Hygiene

**Local env files exist but are not tracked; however, risk remains if committed by accident.**

- **Status:** `.env.local` (1.6KB, dated Mar 25) and `scanner-service/.env` (794B, dated Jun 15) both exist on disk but are **not** in `git ls-files`.
- **Gitignore:** Both are properly excluded (`.gitignore` lines 30–31: `.env` and `.env*.local`).
- **Risk:** Files are on the developer's machine; if accidentally committed or uploaded to shared storage, secrets leak. No CI/CD enforcement (e.g., git hooks or pre-commit checks) to prevent accidental commits.
- **Critical env vars at risk (noted in health check, `app/api/health/route.ts`):**
  - `SUPABASE_SERVICE_ROLE_KEY` (super-user access to DB)
  - `ADMIN_SECRET` (admin panel bypass)
  - `SCANNER_API_KEY` (scanner service auth)
  - `RESEND_API_KEY` (email sending)
  - `CRON_SECRET` (cron job auth via Vercel)
- **Files:**
  - `app/api/health/route.ts` (lines 6–14: lists required vars)
  - `.gitignore` (properly configured)

**Recommendation:** Set up pre-commit hooks (husky + lint-staged) to reject commits containing `SUPABASE_SERVICE_ROLE_KEY=`, `ADMIN_SECRET=`, etc. Use GitHub secrets for CI/CD, never inline.

---

## Scan Throughput Limits

**Single Railway instance with sequential page processing and no queue system — cannot handle bulk scans.**

### Browser concurrency

- **Architecture:** One global Playwright `Browser` instance (`scanner-service/src/index.ts:11`).
- **Problem:** Scans are sequential per request. When a scan request arrives, it discovers pages then scans them one at a time (`scanner-service/src/index.ts:429–433`). Multiple concurrent scan requests will queue up at the OS level, but only one page loads in the browser at a time.
- **Timeout:** 15-minute hard ceiling per scan (`scanner-service/src/index.ts:414–420`). If a domain has 7 pages and each takes 2 minutes, the scan completes in ~14 minutes, leaving almost no buffer.

### Per-request limits

- **Max pages per scan:** 7 (hard-coded, `scanner-service/src/index.ts:407`)
- **Internal link checks:** 5 concurrent, max 15 links (`scanner-service/src/scanner.ts:73–74`)
- **Lighthouse timeout:** 45 seconds per page (`scanner-service/src/lighthouse.ts:10`)
- **Mobile usability check timeout:** 20 seconds per page (`scanner-service/src/mobile.ts:24`)
- **Design AI timeout:** 60 seconds with fallback to HTML-only (`scanner-service/src/index.ts:128–132`)

### Infrastructure

- **Single container:** Railway deployment uses one instance (no horizontal scaling, no worker pool).
- **Resource limits:** `railway.toml` specifies only health check path and restart policy (`railway.toml:5–9`). No explicit CPU or memory limits; Railway defaults apply (typically 512MB–2GB).
- **Dockerfile:** Starts Playwright container from Microsoft image, runs `npm run build` then `node dist/scanner-service/src/index.js` (`scanner-service/Dockerfile`).

### What breaks with bulk scans

- **100 scan requests:** If prospect feature queues 100 scans and the API accepts all, the service will accept requests faster than it can process them. Pages will back up in the browser queue, timeouts will fire, and scans will fail with "timed out after 15 minutes."
- **Memory leak risk:** Each failed scan leaves browser resources; no cleanup mechanism for orphaned pages or browser contexts if a crash occurs mid-scan.

**Files:**
- `scanner-service/src/index.ts` (lines 390–420: async scan handler, 15-min timeout)
- `scanner-service/src/scanner.ts` (line 11: global browser, line 429–433: sequential page scan loop)
- `scanner-service/src/lighthouse.ts` (line 10: 45s timeout)
- `scanner-service/src/mobile.ts` (line 24: 20s timeout)
- `scanner-service/railway.toml` (no resource constraints)
- `scanner-service/Dockerfile` (single-process container)

**Recommendation:** Before bulk scanning:
1. Implement a scan queue (e.g., Bull on Redis, or Supabase job queue) to throttle requests and retry failed scans.
2. Add concurrency limits to the Playwright instance (e.g., max 2–3 pages in flight).
3. Set Railway resource limits (CPU/memory) and enable horizontal scaling.
4. Add per-scan resource cleanup (page close, browser context teardown on timeout).
5. Implement backpressure: reject new scan requests if queue exceeds a threshold.

---

## Duplicated Scoring Logic

**Two independent scoring implementations; they differ in approach and could diverge.**

### Files

- **`lib/scoring.ts`** (78 lines): Used by Next.js API routes to aggregate multi-page scans.
  - Function `aggregateScores(pages: PageResult[])`: averages per-page scores, weights them (perf 25%, SEO 25%, accessibility 15%, content 15%, security 10%, design 10%).
  - Function `buildSummary(pages: PageResult[])`: deduplicates issues, picks top 10 by impact, generates a human-readable verdict.
  - **No per-page individual scoring logic here.**

- **`scanner-service/src/scoring.ts`** (71 lines): Used by scanner service to score individual pages.
  - Function `scorePage(issues, data, loadTimeMs, aiDesignScore?)`: per-page scorer that subtracts issue deductions from a base of 100, applies performance penalties/bonuses based on load time, blends HTML and AI design scores.
  - **No aggregation logic here.**

### Problem

- **Not identical, but parallel:** They implement similar weighting (same overall formula) but at different layers. If the weighting needs to change (e.g., "performance should be 30%, not 25%"), the change must be made in two places.
- **Risk:** Changes to one might not propagate to the other. Already seen: `lib/scoring.ts` has `buildSummary()` with a verdict generator, but `scanner-service/src/index.ts` (line 713) has its own `generateVerdict()` function with slightly different thresholds (90 vs 95 for "excellent").

### Example divergence

- **`lib/scoring.ts:56–67`:** Verdict thresholds are 95 (excellent), 85 (good), 70 (solid), 50 (room to grow), else (significant).
- **`scanner-service/src/index.ts:713–725`:** Verdict thresholds are 90 (great), 70 (decent), 50 (several areas), else (significant).

This inconsistency means the admin dashboard and the scan report could show different verdicts for the same score.

**Recommendation:** 
1. Consolidate scoring to a single module (e.g., `lib/scoring.ts` with both `scorePage()` and `aggregateScores()`). Export from there.
2. Import from the single source in both `scanner-service/src/index.ts` and any Next.js routes.
3. Add a test that verifies scoring round-trip consistency: score a page, aggregate it, and check the result matches a direct multi-page aggregate.

---

## Cron Reliability

**Keepalive cron exists to prevent Supabase free-tier auto-pause — reveals infrastructure fragility.**

### Current setup

- **Keepalive cron:** Runs weekly, Monday 09:00 UTC (`vercel.json:6–7`). Route: `app/api/cron/keepalive/route.ts`.
- **Mechanism:** Pings Supabase with a dummy `SELECT COUNT(*)` query to keep the free-tier database active (Supabase auto-pauses after 1 week of inactivity).
- **Manual override:** Admin can trigger `app/api/admin/trigger-keepalive/route.ts` to manually ping.
- **Protection:** Vercel checks `CRON_SECRET` header; scanner service checks `SCANNER_API_KEY`.

### Implications

- **Cold starts:** The keepalive existence implies Supabase was auto-pausing due to inactivity. This suggests the app has periods with zero traffic (likely expected for a prospecting tool pre-launch).
- **Service resumption delay:** When Supabase resumes after pause, queries block until the database wakes (typically 10–30 seconds). A scan initiated immediately after a long pause could timeout.
- **Vercel function limits:** Cron jobs on Vercel have a max 60-second execution time (Vercel limits); the health check is simple, so unlikely to hit, but design analysis or background scans might.

**Files:**
- `app/api/cron/keepalive/route.ts` (maxDuration: 30 seconds)
- `app/api/admin/trigger-keepalive/route.ts` (manual trigger)
- `vercel.json` (cron schedule)

**Recommendation:** 
1. Consider Supabase Pro tier if the prospecting feature is production-critical (removes auto-pause).
2. Add a health check before accepting scan requests: if Supabase is just waking, queue the request or reject with a retry-after header.
3. Log cron executions; monitor for missed runs or slow Supabase wake times.

---

## Scanner Backlog — Missing Checks

**`docs/scanner-backlog.md` documents known gaps that extend risk with any public/private feature.**

### Performance (biggest gap)

- **Core Web Vitals:** No LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift), or INP (Interaction to Next Paint) — yet Google ranks on these.
- **Image format:** Not flagging old JPEG/PNG when WebP/AVIF is available.
- **Render-blocking:** No detection of synchronous `<script>` or `<link>` in `<head>`.
- **Caching headers:** Not checking `Cache-Control` or `Expires` on static assets.

### Security (critical gap)

- **HTTPS/SSL:** No check for HTTPS enforcement or certificate validity.
- **Security headers:** No CSP, HSTS, X-Frame-Options, X-Content-Type-Options detection.
- **Mixed content:** Not flagging HTTP assets on HTTPS pages.

### SEO/Technical

- **Broken links:** Crawler detects redirects but not 404s from internal links comprehensively.
- **robots.txt & sitemap:** Checked for presence, not validity.
- **Open Graph / Twitter cards:** Missing.
- **Structured data:** Not detected.

**Files:**
- `docs/scanner-backlog.md` (comprehensive feature gap list)

**Risk:** If prospect reports are shared, clients may expect industry-standard checks (Core Web Vitals, HTTPS, security headers). Absence of these could reduce credibility and make reports look incomplete.

---

## Fragile Areas

### Admin dashboard — No rate-limiting

**Files:** `app/api/admin/stats/route.ts`, `app/api/admin/delete/route.ts`, `app/api/admin/lead/[id]/route.ts`

- **Problem:** Any endpoint checking `x-admin-secret` accepts unlimited requests. An attacker with the secret can brute-force large data exports or DDoS the database.
- **No pagination enforcement:** Stats endpoint returns up to 20 rows per page, but a loop could pull all leads/scans.

**Fix:** Add rate-limiting middleware (e.g., Vercel's `rateLimit` helper, or implement token bucket).

### Design AI fallback chain

**Files:** `scanner-service/src/index.ts:128–132`, `scanner-service/src/index.ts:473–493`

- **Problem:** If design AI times out or fails, the scan still succeeds with an HTML-only design score. The frontend shows no indication that AI analysis was skipped. Clients may assume full analysis was done.
- **No explicit logging:** Timeouts are logged, but not surfaced in the scan result's `design_ai_analysis` field (would be `null`).

**Fix:** Add a `design_ai_skipped` boolean to the scan result so the frontend can show "Design analysis timed out; showing HTML-based score only."

### Scoring includes AI design but aggregation does not

**Files:** `scanner-service/src/index.ts:495–535` (merges AI design issues into first page), `scanner-service/src/index.ts:656–681` (aggregateScores does not re-apply AI blend to multi-page)

- **Problem:** When a multi-page scan's first page is scored with AI design input (40% HTML + 60% AI), but pages 2+ are HTML-only, the aggregate score can underweight the AI insight. If page 1 has an exceptional AI design finding, pages 2–7's HTML-only scores drag down the overall.
- **Not a bug, but asymmetric:** The design token is applied inconsistently.

**Fix:** Document this asymmetry in comments, or apply AI-blended design score to all pages (if cache hit, use cached AI score for all).

---

## Test Coverage Gaps

**No end-to-end or integration tests for the full scan pipeline.**

- **Problem:** Playwright integration, Lighthouse, AI design analysis, and Supabase updates are not tested. Changes to the scanner service are validated only manually or in production.
- **Risk with bulk scans:** If a subtle bug appears under high concurrency (e.g., race condition in screenshot upload, or browser context leak), it would surface in production with real prospect data.

**Recommendation:** Add integration tests covering:
1. Single-page scan: full pipeline with mocked Supabase.
2. Multi-page scan with discovery.
3. Timeout handling and recovery.
4. Screenshot upload and error cases.
5. Concurrent scan requests (stress test).

**Files:**
- `scanner-service/src/` (all modules lack `.test.ts` files)

---

## Missing Critical Features (for Prospect Feature)

### Bulk import and queueing

- **Not in codebase:** No bulk CSV/JSON import, no scan queue, no batch status tracking.
- **Blocking:** Prospect feature requires this to queue hundreds of scans without overloading the single Railway instance.

### User/team management

- **Not in codebase:** No concept of users, teams, or per-user leads lists. Everything is global (admin or public).
- **Blocking:** Private prospect lists need per-user access control, audit logging, and potential team-based sharing.

### Prospect lifecycle tracking

- **Not in codebase:** No "lead status" beyond scan result (no "contacted," "interested," "deal closed").
- **Blocking:** A prospecting tool should track outreach history and outcomes.

---

## Summary for Bulk-Scan Prospecting Feature

Before shipping, address in priority order:

1. **Authentication (CRITICAL):** Replace shared-secret with session-based auth + audit logging.
2. **Throughput (CRITICAL):** Add a scan queue, concurrency control, and resource cleanup.
3. **Secrets (HIGH):** Add pre-commit hooks to block accidental env var commits.
4. **Scoring consistency (MEDIUM):** Consolidate scoring logic to a single source.
5. **Backlog (MEDIUM):** Document which checks are intentionally missing; prioritize Core Web Vitals and security headers if reports will be shared.
6. **Tests (MEDIUM):** Add integration tests for scanner-service before bulk scans hit production.

---

*Concerns audit: 2026-07-16*
