---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 8
current_phase_name: Send — GATED
status: planning
stopped_at: Completed quick task 260803-lh0 (fix silent 1000-row PostgREST truncation)
last_updated: "2026-08-03T14:15:34.541Z"
last_activity: 2026-08-03
last_activity_desc: Phase 07 complete, transitioned to Phase 8
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 47
  completed_plans: 47
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the proof already written, so that outreach costs him minutes instead of hours.
**Current focus:** Phase 8 — Send (GATED)

## Current Position

Phase: 8 — Send — GATED
Plan: Not started
Status: Ready to plan
Last activity: 2026-08-03 — Phase 07 complete, transitioned to Phase 8

Progress: [██████████] 100%

Phase 07 closed 2026-08-03 at 5/5 must-haves, zero gaps (07-VERIFICATION.md, third pass).
All 10 plans executed, including gap plans 07-08/09/10 and quick task 260803-lh0.

What closed the last two failing criteria: `getReportingData()` was reading `prospects` and
`outreach_messages` with unbounded `.select()`. PostgREST caps at 1000 rows and returns 200 with
no error, so the funnel counts (TRK-05) and booked tally (TRK-04) were silently truncated. The
outreach case was worse than an undercount, since `created_at` ASC plus a newest-wins Map meant
truncation dropped the *newest* rows. All three reads now page through `fetchAllPages()` with
unique-PK tiebreakers. Proven fail-first by the verifier against the pre-fix file, not accepted
from the summary.

The confounder, worth remembering: the "1006 prospects" that made this visible was almost entirely
test pollution. `lib/outreach-queue.integration.test.ts` discarded every cleanup error and built an
unchunked 1000-UUID `.in()`, so it leaked permanently and self-amplified to 1121 leaked prospects
against 5 real ones. Purged, and the cleanup now releases `latest_scan_id` first, deletes in FK-safe
order, chunks via `chunkIds()`, and throws (54223a1). Do not cite the old row counts as evidence
about production volume.

Production is current: dpl_Hj47paoR7pLYNS2jxgvNjuYtxEzT, aliased to scan.adashi.io, shipped after
the fix. Full suite 475 passed / 42 files, `tsc` clean, `npm run build` compiles.

Carried forward, not gaps: CMP-13 stays Partial by design pending the Legitimate Interest
Assessment (blocked on external counsel; `RETENTION_MODE` stays unset, the 12-month window is a
placeholder). GC-01/02/03 and WINDOWS.md #3 remain deferred with rationale in 07-VERIFICATION.md.

Next: `/gsd-plan-phase 8` — Send (GATED). Note the standing roadmap decision that the
provider/legal-basis track gates this phase specifically.

## Performance Metrics

**Velocity:**

- Total plans completed: 47
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | - | - |
| 02 | 7 | - | - |
| 3 | 6 | - | - |
| 04 | 6 | - | - |
| 04.1 | 2 | - | - |
| 05 | 4 | - | - |
| 6 | 8 | - | - |
| 07 | 10 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 5min | 3 tasks | 4 files |
| Phase 01 P02 | 12min | 3 tasks | 5 files |
| Phase 01 P03 | 20min | 3 tasks | 5 files |
| Phase 01 P04 | 50min | 4 tasks | 8 files |
| Phase 02-compliance-spine P01 | 12min | 3 tasks | 5 files |
| Phase 02 P02 | 12min | 3 tasks | 3 files |
| Phase 02-compliance-spine P03 | 20min | 1 tasks | 2 files |
| Phase 02 P04 | 20min | 2 tasks | 2 files |
| Phase 02 P05 | 30min | 2 tasks | 4 files |
| Phase 02 P06 | 15min | 2 tasks | 4 files |
| Phase 03 P01 | 15min | 3 tasks | 5 files |
| Phase 03 P03 | 15min | 2 tasks | 3 files |
| Phase 03 P04 | 10min | 2 tasks | 5 files |
| Phase 03 P05 | 20min | 3 tasks | 6 files |
| Phase 04.1 P01 | 15min | 3 tasks | 7 files |
| Phase 04.1 P02 | 15min | 2 tasks | 2 files |
| Phase 05 P01 | 15min | 2 tasks | 2 files |
| Phase 05 P02 | 6min | 2 tasks | 3 files |
| Phase 05 P03 | 25min | 2 tasks | 3 files |
| Phase 05 P04 | ~2 days (checkpoint-gated) | 2 tasks | 2 files |
| Phase 06 P01 | 15min | 3 tasks | 4 files |
| Phase 06-draft-generation-approval-queue P03 | 25min | 2 tasks | 4 files |
| Phase 06 P04 | 8min | 2 tasks | 4 files |
| Phase 06 P05 | 7min | 2 tasks | 3 files |
| Phase 06 P06 | 15min | 2 tasks | 3 files |
| Phase 06 P08 | 20min | 2 tasks | 3 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 06 P02 | 12min | 2 tasks | 1 files |
| Phase 06 P07 | ~2h | 3 tasks | 3 files |
| Phase 07 P01 | 40min | 4 tasks | 5 files |
| Phase 07 P02 | 35min | 2 tasks | 10 files |
| Phase 07 P03 | 50min | 3 tasks | 7 files |
| Phase 07 P04 | ~30min | 2 tasks | 4 files |
| Phase 07 P05 | ~45min | 2 tasks | 3 files |
| Phase 07 P06 | ~1h10min | 2 tasks | 5 files |
| Phase 07 P07 | ~40min | 3 tasks | 3 files |
| Phase 07 P08 | 20min | 2 tasks | 4 files |
| Phase 07 P09 | ~45min | 2 tasks | 8 files |
| Phase 07 P10 | ~15min | 3 tasks | 3 files |
| Phase quick P260803-lh0 | ~45min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: No blocking Phase 0. The provider/legal-basis decision is a parallel track gating Phase 8 only — user override of the research recommendation.
- [Roadmap]: Compliance spine (Phase 2) is a co-requisite of the data model, not the last phase. It has no dependencies and may run parallel with Phase 1.
- [Roadmap]: Triage (Phase 3) must ship before or with the scan queue (Phase 4). Load-bearing sequencing decision — queueing every import reintroduces the concurrency/budget failure CONCERNS.md flags.
- [Roadmap]: Phase 7 (lifecycle/reporting) placed before the gated send phase so it ships; ARCHITECTURE.md's "reporting last" ordering assumed send was not gated.
- [Research]: Resend ruled out for outreach (AUP prohibits cold outreach verbatim). Channel deliberately undecided.
- [Research]: Tw art. 11.7 lid 2(a) does not cover scraped `info@`. Default posture is legitimate interest + Article 14 notice.
- [Phase 01-01]: Live push (migrations 010-013) applied via Supabase dashboard SQL Editor, not supabase db push CLI — Matches convention used for migrations 001-009 on this project; all DDL is IF NOT EXISTS/idempotent so a future CLI push stays safe
- [Phase 01-02]: Human approved @duckdb/node-api and tldts as legitimate (official org repos, high download counts, too-new-publish false positive) before install
- [Phase 01-02]: Added vitest passWithNoTests:true so npx vitest run exits 0 before 01-03/01-04 add test files
- [Phase 01-03]: D-14 (no_website gains website) required no special-case code — the existing D-05 else-branch (website_url_pending) already applies since no_website prospects are never lifecycle_state='new'
- [Phase 01-03]: Added supabase/seed.sql (local-dev-only grants) to unblock local integration testing — repo had no prior supabase/config.toml/local-dev history, causing "permission denied" on all tables including pre-existing ones
- [Phase 01-04]: Region matching via addresses[1].region is impossible on real NL data; region scoping uses a bbox pre-filter for pruning plus an exact ST_Within polygon check against the Overture divisions theme (class=land to exclude maritime duplicates) as the true boundary
- [Phase 01-04]: Aggregator/directory domains (tripadvisor.com, facebook.com, etc.) are never valid prospect identity - resolved to no-website (null domain/website_url, lifecycle_state=no_website) inside upsertOverturePlace, while prospect_sources.raw_website_url preserves the original URL (D-11 human-approval condition)
- [Phase ?]: isSuppressed matches active rows via a single .or(email.eq.X,domain.eq.Y) query, proving both exact-match and domain-wide match
- [Phase ?]: lib/suppression.ts never references prospects or lifecycle_state (D-07 pure lookup), verified by grep gate
- [Phase ?]: supabase/.branches/ added to .gitignore rather than committed (Supabase CLI local artifact)
- [Phase 02]: legal_regimes.current_lia_version is a hard FK to lia_versions(version), enforced at the DB level
- [Phase 02]: lia_versions immutability enforced via a BEFORE UPDATE OR DELETE trigger (Pitfall 6), not app-level convention
- [Phase ?]: Unsubscribe token follows RESEARCH Pattern 3 verbatim: HMAC-SHA256 over node:crypto, UUID-only payload, no JWT dependency, no expiry
- [Phase ?]: Added internal getSecret() helper shared by sign/verify for the fail-closed missing-secret check, avoiding drift between the two functions
- [Phase ?]: Unsubscribe route queries only contact_email + country from prospects, never lifecycle_state, keeping suppression a pure lookup (D-07)
- [Phase 02]: CMP-07 auto-suppression extended in place on the live Resend webhook (no second route); D-06 backfill dedupes by normalised email with no email_type filter
- [Phase ?]: legal-basis.ts exposes lookupProspect/lookupLegalRegime/lookupLiaVersion as injectable functions for DI-seam testability, mirroring import-prospects.ts's upsertOverturePlace convention
- [Phase ?]: Domain-only legal-basis lookups pass the domain string to isSuppressed() — its existing OR clause already matches on domain, no second suppression-lookup path needed
- [Phase 03]: TRIAGE_USER_AGENT is a distinct honest UA string, never equal to the full scanner's UA — D-12 requires an honest, identifiable, non-spoofed UA distinct from the existing scanner tool
- [Phase 03]: Weighted-band thresholds/deductions exported as named constants in lib/triage-constants.ts, matching RESEARCH.md's proposed defaults — Single tunable source per D-03/D-04 so the later scorer plan has no inline magic numbers to invent or drift from
- [Phase ?]: Release ceiling enforced with a JS .slice(0, ceiling) over real-number-sorted rows, not a Postgres jsonb ->> text-comparison filter/order/limit (Pitfall 5)
- [Phase ?]: releaseWorstN is a thin two-step select-then-update wrapper (no new Postgres RPC) — correct at this project's human-triggered, single-tenant concurrency profile
- [Phase 03]: getTriageCandidates()/getShortlist() are pure reads (D-07); the release manual smoke-test ran against local Supabase since production still lacks migration 016 (Plan 06's job)
- [Phase 03]: Shortlist tab: server-side gated/score sort in the shortlist route, ReleaseButton takes secret as a prop, no next-intl on the admin surface (matches existing zero-i18n admin convention)
- [Phase 04.1-01]: EXCLUDED_CATEGORIES is a configurable readonly string[] in triage-constants.ts, seeded with the Overture eat-and-drink family, matched case-insensitively
- [Phase 04.1-01]: isReleasable short-circuits unreachable rows to false; among reachable rows gated=true means no-HTTPS and is the fast-track (D-4.1-03/04)
- [Phase 04.1-01]: Read-time filtering, no backfill/re-triage: excluded/unreachable rows stay visible in the shortlist, only barred from release; lib/triage-scorer.ts deliberately left unchanged
- [Phase ?]: D-4.1-05: split conflated GATED pill into CRITICAL (reachable no-HTTPS) and UNREACHABLE (not reachable); admin eligible/critical counts wired to isReleasable, no divergent UI copy
- [Phase 04.1]: 04.1 phase shipped to production (npx vercel --prod, 2026-07-24); no missing category strings found against real production data, EXCLUDED_CATEGORIES stands as committed
- [Phase 05]: CHECK constraint on contact_email_type added via guarded do $$ / pg_constraint existence check (no ADD CONSTRAINT IF NOT EXISTS in Postgres); verified idempotent by re-running the file twice
- [Phase 05]: ContactExtraction holds only raw material (mailtoHrefs, cfemailTokens, contactText) — no parsing/classification fields, keeping the browser extractor a thin harvester
- [Phase ?]: [Phase 05-02]: lib/contact-extraction.ts is a pure module (no I/O) exposing aggregateContacts(pages, siteDomain) as the single entry point for the next plan's reconcileInFlightScans() integration
- [Phase ?]: Contact derivation runs per-prospect inside reconcileInFlightScans done loop
- [Phase ?]: lib/scan-queue.test.ts updated alongside Task 1 (Rule 1) since it asserted the pre-change update payload
- [Phase 05-04]: CON-05 delivered as visibility-only (pill); outreach-flow enforcement deferred to Phase 6 since no automated outreach flow exists yet
- [Phase 05-04]: Migration 018 applied via Supabase Dashboard SQL Editor (not supabase db push), matching existing project convention
- [Phase ?]: [Phase 06-01]: Ported scanner service's live 90/70/50 verdict bands into lib/scoring.ts (not the reverse) since lib/scoring.ts was confirmed dead code; production report copy unchanged (DRA-06/D-6-R4)
- [Phase ?]: [Phase 06-01]: Added @/* -> ../* path alias to scanner-service/tsconfig.json (Rule 3 auto-fix) so lib/scoring.ts's own @/types/scanner import resolves under the service's tsconfig build
- [Phase 06-03]: selectCitableMetric only compares category scores actually present (security/design optional) rather than defaulting an absent score to 0
- [Phase 06-03]: TONE_BRIEF and CONTROLLER_CONTACT_EMAIL literal-copy VOICE_DIRECTIVE and FROM_EMAIL rather than importing across the Vercel/Railway boundary or reading process.env
- [Phase 06-03]: Article 14 notices reference the controller contact address, not a hosted LIA/privacy URL (open Phase 8 dependency)
- [Phase 06-04]: buildReportUrl() hardcodes lib/email.ts's fallback host as a literal instead of reading NEXT_PUBLIC_SITE_URL, so the module keeps zero client-exposed env-var-name references (its own acceptance grep gate required this)
- [Phase 06-04]: Locale resolved from prospect.country only, never scan.locale -- bulk scans default locale to en and put the true target language in issues_alt (RESEARCH Pitfall 4)
- [Phase 06-04]: Top issue titles localized via lib/i18n-helpers.ts's applyIssuesAlt() before reaching the prompt builder (RESEARCH Pitfall 7)
- [Phase 06]: 06-05: integration test renamed to lib/draft-on-scan-complete.integration.test.ts (thin-route-over-tested-lib convention), per the plan's own explicit direction
- [Phase 06]: 06-05: eligibility gates 1-7 all resolve to 'skipped'; only a null generateDraft() result (or an unexpected insert throw) resolves to 'failed'
- [Phase ?]: [Phase 06-06]: rejectDraft reuses prospects.lifecycle_state='rejected' (migration 010, unused until now); approveDraft writes status/approved_by/approved_at only, never touching lifecycle_state
- [Phase ?]: [Phase 06-06]: admin route auth check (x-admin-secret/ADMIN_SECRET) kept literal per-handler, not factored into a shared helper, matching the grep-gated shortlist-route convention
- [Phase 06-08]: app/api/admin/shortlist/route.ts needed no change since it spreads ShortlistRow straight through; verified rather than assumed
- [Phase 06-08]: No backfill script for pre-phase prospects -- the manual Generate draft button (required anyway by D-6-06) doubles as the backfill mechanism
- [Phase 06-02]: D-6-15 reuses prospects.lifecycle_state = 'rejected'; Phase 7 (TRK-01/02) owns the lifecycle state machine and must not reintroduce a parallel reject flag or overwrite this value in a generic status-advance sweep.
- [Phase 06-02]: GEMINI_API_KEY provisioned server-side in .env.local (dev) and Vercel Production+Preview (prod) by Joshua; documented by name only (empty value) in .env.example.
- [Phase ?]: [Phase 06-07]: expandedId kept a single nullable string with no second collection-typed expansion state (QUE-05, T-06-BULK), grep-gated at zero new Set / zero checkbox occurrences
- [Phase ?]: [Phase 06-07]: window.confirm()/window.alert() replaced with in-DOM role=alertdialog/role=alert — both are per-origin suppressible in Chrome and silently no-op, which made Regenerate/Reject/Save/Approve look dead and made required confirmation copy uninspectable
- [Phase ?]: [Phase 06-07]: Task 3 live verification found GEMINI_API_KEY had never been in the health check REQUIRED_VARS (06-02) and buildReportUrl hardcoded the production host (06-04) -- draft generation had silently never run end to end before this pass; both fixed and amended into 06-02/06-04
- [Phase ?]: [Phase 06-07]: DRA-04 tone check failed on first read; 06-03 pitch prompt rewritten (code-owned [RAPPORT] token, informal je-register, model subject with code fallback, real singular/plural) -- subject fallback rate 3/6 to 0/6 measured before/after
- [Phase ?]: Three dev-only test deps (jsdom, @testing-library/react, @testing-library/dom) added under explicit human npm-legitimacy approval gate — 07-RESEARCH.md's zero-new-package claim was stale
- [Phase ?]: Local migration 019 applied via 'supabase migration up' (not 'db reset') to preserve 407 existing prospect rows; local Supabase requires --ignore-health-check to start on this machine
- [Phase ?]: [Phase 07-02]: StatCard extracted to components/admin/stat-card.tsx instead of exported from app/admin/page.tsx — Next.js App Router route-type validation rejects arbitrary named exports from page.tsx
- [Phase ?]: [Phase 07-02]: vitest.config.ts oxc.jsx changed from bare "automatic" string to { runtime: "automatic" } object — installed rolldown's JsxOptions type dropped the string shorthand since 07-01, was blocking tsc/build
- [Phase ?]: [Phase 07-03]: Booked cell gates on payload.sentGateOpen directly (not day.booked's own nullability); Reply rate gates on day.replyRate === null alone, ignoring sentGateOpen, so it stays awaiting past the gate flip while REPLY_SIGNAL_AVAILABLE is false
- [Phase ?]: [Phase 07-03]: replyRate's theoretically-true branch computes a literal 0, not a real numerator — no replied marker/count exists anywhere in this codebase; Phase 8 must supply the real per-day replied count in the same change that flips REPLY_SIGNAL_AVAILABLE
- [Phase ?]: [Phase 07-04]: getShortlist() attaches stage: FineLifecycleState via a single-pass reuse of the existing outreach_messages query (widened to status/created_at, ordered ascending) -- no third round trip, and has_outreach_draft/stage can never describe different rows for the same prospect (Pitfall 4)
- [Phase ?]: [Phase 07-04]: Cleaned up 14 stray local-Supabase fixture rows left by an earlier interrupted 07-03 test run (duplicate-key blocking npx vitest run) via the same prefix-scoped delete the test's own afterEach uses -- data cleanup only, no test/code touched
- [Phase ?]: [Phase 07-05]: Both booking-attribution candidate lookups (email-exact, domain-fallback) are bounded .limit(2) array queries, never .single()/.maybeSingle() -- contact_email carries no unique index at all, closing the sharper half of FA-TRK-04
- [Phase ?]: [Phase 07-05]: D-7-08 sent-gate and ambiguity disambiguation share one outreach_messages query; an ambiguous surviving candidate set is dropped, never guessed, since booked_match_method='email' would be indistinguishable from a certainty
- [Phase ?]: [Phase 07-06]: retentionFrom() is the single guarded table accessor keyed on RETENTION_TABLE_ALLOWLIST (3 entries); suppressions and leads deliberately absent, enforced by compile-time union + runtime check + integration test, not just a comment
- [Phase ?]: [Phase 07-06]: chunked .in() lookups (RETENTION_ID_CHUNK_SIZE=150) added as a Rule 1 fix after a real {months:0} run against the 711-row local dev prospects table produced URI-too-long — RETENTION_MAX_BATCH(1000) permits a candidate set the un-chunked query could not survive
- [Phase ?]: 07-07 Task 2: kept the uncommitted RETENTION_ID_CHUNK_SIZE chunking on anonymizeProspects()/deleteProspects() — matches the read-side pattern and closes a URI-too-long hazard at RETENTION_MAX_BATCH scale
- [Phase ?]: 07-07 Task 2: .env.example left untouched — global permission settings deny all tool access to .env.* paths; RETENTION_MODE/RETENTION_MONTHS need a manual 2-line add before Task 3's deploy
- [Phase ?]: [Phase 07-07] Task 3 resolved as stay-dry-run — RETENTION_MODE left unset per D-7-18's default, decided directly by Joshua without running the deploy/dashboard/dry-run/SQL evidence steps the task itself specifies; carried forward as WINDOWS.md #2
- [Phase ?]: FA-CMP-13-SOURCES resolved as B-delete-source-rows: prospect_sources rows deleted outright during anonymise (not field-list-cleared) because overture_gers_id is not-null/unique and upsertOverturePlace's re-import match on it would silently undo an in-place clear; accepted cost is a duplicate prospect row on the next regional import
- [Phase ?]: [Phase 07-09]: chunkIds() moved to a new dependency-free lib/chunk-ids.ts (not exported from lib/retention.ts) so getShortlist()'s admin read path never imports RETENTION_MODE's module-scope config resolution
- [Phase ?]: [Phase 07-09]: getShortlist()'s chunked outreach rows are accumulated across all chunks and globally re-sorted by created_at before the last-write-wins draftedIds/latestOutreachStatus pass, never built incrementally inside the chunk loop
- [Phase ?]: [Phase 07-09]: attributeBookingToProspect()'s two candidate queries dropped their .limit(2) cap entirely rather than raising it -- ambiguity is decided by the post-sent-gate set size (gatedIds.size), and the now-uncapped query's own DoS exposure is accepted (T-07-09-03), not chunked, since it is bounded in practice by one mailbox's shared prospect count
- [Phase ?]: RETENTION_MODE stays unset (dry-run) deliberately: 12-month window is a placeholder pending the LIA, candidates is currently 0 so there is nothing to prove by arming the writing path, and 39 integration tests already cover the write path. Daily job's first non-zero expiring figure is the trigger to revisit.
- [Phase ?]: D-7-20 superseded (recorded, not made, by this task): retention cron moved from monthly (0 3 1 * *) to daily (0 3 * * *) after Vercel Hobby silently dropped the day-of-month cron entry on first deploy.
- [Phase ?]: [Quick 260803-lh0]: Paginated getReportingData()'s scans read too (beyond plan's locked scope) after live local DB (1045 scans in 30-day window) reproduced the identical PostgREST 1000-row cap on a third read the plan assumed was already safe

### Pending Todos

1 pending:

- Add random import mode: `--category=random` from TARGET_CATEGORIES AND `--region=random` from TARGET_REGIONS — revises D-10, keeps imports bounded (`2026-07-24-random-import-from-target-categories.md`). Joshua confirms both seed lists before they lock.

The three prospect-quality todos were resolved by Phase 4.1 (moved to `.planning/todos/completed/`, 2026-07-24).

**Open follow-up (not a todo):** SCAN-06 monitoring is currently data-starved — the public scanner's 14-day window holds ~1 scan, no `pre-04.1` baseline was ever captured (unrecoverable), and the 2026-07-23 "92.9%" checkpoint figures cannot have come from this window. Anchor reading committed: `scan-health/post-04.1.json` (0/1, 2026-07-24). Once real public traffic returns to the window, compare against the anchor; a >5pp drop during bulk activity means lowering capacity constants. The enforced guardrails (capacity ceiling + reserved public headroom, 503 refusal, single-attempt cap) protect the public scanner regardless of the metric.

### Blockers/Concerns

- **Phase 8 blocked** on the Parallel Track: send channel chosen + AUP verified in writing, counsel on LIA/Art. 14 wording, separate warmed outreach domain. Phases 1-7 proceed regardless.
- **Scoring verdict-threshold divergence** (`lib/scoring.ts` vs `scanner-service/src/index.ts`, 95/85/70/50 vs 90/70/50) is scheduled as the first plan of Phase 6 but is not a numbered v1 requirement. REQUIREMENTS.md may need an addition — see ROADMAP Coverage Notes.
- **Blast radius:** nothing in this milestone may risk the existing scanner's email or scanning. It works and it earns. Phase 4 verification watches the public scanner's success rate during bulk runs.
- **Overture data quality** is a proven risk here, not theoretical — prior research produced a 98% false-positive read before correction. Manual sample audit required in Phase 1.
- Open follow-up: cited-number-vs-report locale match verified only against seeded fixture scans (report rendered English against a Dutch draft); confirm against a real NL crawl the first time this surface handles genuine production data
- 07-07 Task 3 (checkpoint:decision, gate=blocking): production deploy + dashboard cron confirmation + live dry-run JSON + SQL count needed before RETENTION_MODE can be chosen (stay-dry-run / anonymize / delete)

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Prospect Quality — category exclusion, gate split, batch size (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Quick Tasks Completed

| Date | Slug | Outcome |
|------|------|---------|
| 2026-08-02 | reporting-agg-cleanup-leak | `reporting-aggregates.integration.test.ts` `afterEach` swallowed a `scans_prospect_id_fkey` violation (migration 013 is `ON DELETE NO ACTION`), so one blocked row aborted the whole prospects delete and every fixture row survived, cumulatively, across runs. Cleanup now deletes in FK-safe order and throws on any error. |
| 2026-08-03 | fix-silent-1000-row-postgrest-truncation | `getReportingData()` read `prospects` and `outreach_messages` with unbounded `.select()`; PostgREST caps at 1000 rows and returns 200 with no error, so the Reporting tab's funnel counts (TRK-05) and booked tally (TRK-04) were silently wrong. Outreach was worse than an undercount: `created_at` ASC + newest-wins Map meant truncation dropped the *newest* rows, corrupting resolved status and letting `sentGateOpen` read false while sends existed. Now paginated via a file-local `fetchAllPages()` `.range()` loop with unique-id tiebreakers; `scans` paginated too (deviation — live data showed 1045 rows already past the cap in the 30-day window). Commits `abf2b15`, `7710a57`. |

## Session Continuity

Last session: 2026-08-03T13:53:38.730Z
Stopped at: Completed quick task 260803-lh0 (fix silent 1000-row PostgREST truncation)
Resume file: None
