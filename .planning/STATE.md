---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 5
current_phase_name: Contact Extraction & Classification
status: verifying
stopped_at: Completed 04.1-02-PLAN.md
last_updated: "2026-07-23T22:46:39.916Z"
last_activity: 2026-07-23
last_activity_desc: Phase 04.1 complete, transitioned to Phase 5
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 25
  completed_plans: 25
  percent: 56
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-17)

**Core value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the proof already written, so that outreach costs him minutes instead of hours.
**Current focus:** Phase 04.1 — prospect-quality

## Current Position

Phase: 5 — Contact Extraction & Classification
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-07-23 — Phase 04.1 complete, transitioned to Phase 5

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 25
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

### Roadmap Evolution

- Phase 4.1 inserted after Phase 4: Prospect Quality — category exclusion, gate split, batch size (URGENT)

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-23T22:46:39.898Z
Stopped at: Completed 04.1-02-PLAN.md
Resume file: None
