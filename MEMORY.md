# Website Scanner Memory

## Status

_Current state of the scanner: what it does, where it runs, and what's in progress._

**What it is.** Two things in one repo. The public website scanner is live and earning: someone enters a URL, gets a scored report on performance, SEO, accessibility, content, security and design. Prospect Radar is the private prospecting layer built on top of it. It pulls businesses from open map data, triages their sites cheaply, runs full scans on the ones worth pitching, and drafts a cold email for Joshua to approve.

**Where it runs.**

- Next.js app on Vercel, at scan.adashi.io. Not git-connected, so a push ships nothing. Production only moves via `npx vercel --prod` from the repo root.
- Express scanner-service on Railway. It has to be always-on because scans take 3 to 15 minutes and Vercel functions time out well before that.
- Supabase Postgres, remote. Migrations are applied through the dashboard SQL Editor, not `supabase db push`.
- Five Vercel crons: keepalive, follow-up, send-pending-reports, drain-scan-queue, retention.

**Milestone v1.0, as of 2026-08-04.** Phases 1 through 7 are complete, 47 plans. Phase 07 (lifecycle, reporting, retention) closed at 5 of 5 success criteria with no gaps. Phase 8 (Send) is planned but blocked, and cannot start until the outreach channel is chosen.

**Live deployment:** `dpl_3K3VFkBmzgQjFy8GouMf6QQ7LMMx`, aliased to scan.adashi.io. It is the first deployment to carry `middleware.ts` and the locale resolution, both verified in production on 2026-08-04.

**Retention runs but does not delete.** The cron fires daily at 03:00 and reports what would expire. `RETENTION_MODE` is deliberately unset, so nothing is written. It stays that way until the Legitimate Interest Assessment comes back.

**In progress:** nothing is mid-flight. The next action is choosing an outreach provider, which unblocks Phase 8.

## Key Decisions

_Tool choices, scope decisions, and architectural notes._

**Resend is ruled out for outreach.** Its acceptable use policy prohibits cold outreach in as many words. No replacement has been picked, and that decision gates the whole send phase. Check any candidate channel against its AUP before building against it, not after.

**Retention ships in dry-run, by design.** CMP-13 stays Partial until the LIA lands. The 12-month window is a placeholder, not a legal fact. The natural trigger to revisit is the first non-zero `expiring` figure, around July 2027.

**The retention cron is daily, not monthly.** The original `0 3 1 * *` looked correct and silently never registered: Vercel Hobby drops day-of-month expressions without an error, and only 4 of 5 crons appeared. Now `0 3 * * *`. Supersedes D-7-20. Any future cron on this plan should avoid day-of-month entirely.

**Report locale comes from the prospect's country, not the visitor's browser.** A report for an NL prospect renders Dutch even when the visitor sends `Accept-Language: en`. This is right for cold outreach: you mail a Dutch business, they should read a Dutch report. Public scanner reports have no prospect attached, so those still negotiate from the header, by q-value.

**Reporting reads are paginated, retention refuses instead.** PostgREST caps any unbounded `.select()` at 1000 rows and returns HTTP 200 with no error. The two modules answer this differently on purpose. `lib/retention.ts` throws, because a partial expiry run must fail loudly. `lib/reporting-aggregates.ts` pages through with `fetchAllPages()`, because the Reporting tab has to keep working past 1000 rows rather than go dark. Pagination orders by a unique primary key, since a non-unique sort key lets rows skip or duplicate across page boundaries.

This cap has now bitten the project four times, in retention, `getShortlist`, `getReportingData`, and test cleanup. When it turns up again, sweep for unbounded `.select()` and unchunked `.in()` across the repo rather than patching the one caller that was reported. Twice the reported caller was fixed while an identical sibling was left broken.

**`prospect_sources` rows are deleted, not blanked.** Blanking the `raw_*` columns undoes itself: `upsertOverturePlace` rewrites them on every re-import that matches a surviving `overture_gers_id`. Deleting costs some duplicate prospects, which CMP-15 bounds.

**Executors run one at a time.** `use_worktrees` is false. One local Supabase Postgres is shared with oro-app, so parallel executors race on the same database instead of isolating anything.

**Local database row counts prove nothing about production scale.** In August 2026 the local DB held 1126 prospects, of which 1121 were leaked test fixtures and 5 were real. A verifier read that as evidence the project had outgrown an assumption. Filter out `test-%` prefixes before drawing any conclusion from a local count.

**Integration test cleanup must throw.** An `afterEach` that ignores delete errors leaks permanently here, because `prospects.latest_scan_id` and `scans.prospect_id` reference each other and both are `ON DELETE NO ACTION`. One rejected delete strands the whole fixture set, the survivors are prefix-matched again next run, and past 1000 survivors the unchunked `.in()` also exceeds the gateway URL limit, so cleanup can never recover. Release `latest_scan_id` first, delete in FK-safe order, chunk with `chunkIds()`, and throw on any error.
