---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 06
current_phase_name: draft-generation-approval-queue
status: verifying
stopped_at: Completed 06-07-PLAN.md
last_updated: "2026-07-30T14:08:42.308Z"
last_activity: 2026-07-28
last_activity_desc: Phase 06 execution started
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 37
  completed_plans: 37
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the proof already written, so that outreach costs him minutes instead of hours.
**Current focus:** Phase 06 — draft-generation-approval-queue

## Current Position

Phase: 06 (draft-generation-approval-queue) — EXECUTING
Plan: 8 of 8
Status: Phase complete — ready for verification
Last activity: 2026-07-28 — Phase 06 execution started

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 29
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

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Prospect Quality — category exclusion, gate split, batch size (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-30T14:08:24.917Z
Stopped at: Completed 06-07-PLAN.md
Resume file: None
