---
phase: 07-lifecycle-reporting-retention
verified: 2026-08-02T17:40:00Z
status: gaps_found
score: 3/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Prospect, scan, and outreach data past the retention window expires on a schedule, deleting or anonymising by config rather than by hardcoding (CMP-13, CMP-14)"
    status: partial
    reason: "The retention job's code is complete, correctly config-driven, and passing its own integration suite (36/36, including 5 suppression-survival tests and 11 FK-order tests re-run live during this verification). But the observable claim in the phase goal — data 'expires without him thinking about it' — is not yet true: (1) the vercel.json cron entry is committed but has never been deployed, so /api/cron/retention has never fired against production and RETENTION_MODE has never been exercised outside dry-run against real data; (2) anonymise mode — the D-7-17 default once switched on — never touches prospect_sources (migration 011), whose raw_name/raw_address/raw_website_url columns are joinable back to the anonymised prospect by prospect_id, so anonymise does not actually make a prospect's identity expire. Delete mode is unaffected (ON DELETE CASCADE clears prospect_sources correctly)."
    artifacts:
      - path: "lib/retention.ts"
        issue: "anonymizeProspects() has no prospect_sources handling; RETENTION_TABLE_ALLOWLIST (lib/retention-constants.ts) does not include it"
      - path: "vercel.json"
        issue: "Cron entry for /api/cron/retention is present in the committed file but not deployed — confirmed by 07-07-SUMMARY.md's own 'Task 3 Resolution' section and WINDOWS.md entries #1/#2"
    missing:
      - "A production deploy, Vercel dashboard cron confirmation, an authenticated dry-run read against production, and a matching Supabase SQL cross-check — the four evidence steps 07-07-PLAN.md's own Task 3 and success_criteria require before the phase can claim the schedule is live (this verifier did not perform these either, per its own no-deploy instruction — they remain genuinely unrun, not merely unobserved)"
      - "Either (a) prospect_sources added to a dedicated allowlist entry with its own anonymise field list, or (b) an explicit, LIA-backed decision that prospect_sources is permanently out of scope — self-flagged in-repo as FA-CMP-13-SOURCES (07-06-PLAN.md, 07-07-PLAN.md, 07-REVIEW.md WR-03) but not yet resolved either way"
deferred: []
human_verification:
  - test: "Deploy to production, confirm the /api/cron/retention entry in the Vercel dashboard, make one authenticated GET against the deployed route, and cross-check the returned 'expiring' count against a hand-run SQL query in the Supabase SQL Editor."
    expected: "The dashboard shows the 0 3 1 * * schedule registered; the authenticated call returns mode=dry-run and a candidates/expiring count that matches the SQL cross-check within the retention clock's documented month-arithmetic tolerance."
    why_human: "Requires a production deploy and an authenticated call against live infrastructure — both explicitly out of scope for this verifier (no-deploy instruction) and, per 07-07-SUMMARY.md, never performed by the executor either. This is the same gap WINDOWS.md entry #2 tracks."
  - test: "Decide, with legal input (the pending LIA), whether prospect_sources needs its own anonymise field list before RETENTION_MODE is ever set to anonymize in production."
    expected: "Either a code change adding prospect_sources to a dedicated allowlist entry with a field list, or a documented, deliberate decision that leaving it untouched is acceptable, recorded somewhere durable (not just a self-flag comment)."
    why_human: "This is a legal/compliance judgment call (what GDPR-style anonymisation requires of a joinable child table), not something a grep or a test can resolve on its own."
---

# Phase 7: Lifecycle, Reporting & Retention Verification Report

**Phase Goal:** Joshua sees what the funnel actually did, and data that has outlived its basis expires without him thinking about it
**Verified:** 2026-08-02T17:40:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every prospect shows a lifecycle state of new/qualified/contacted/replied/booked, advancing off real events rather than manual bookkeeping (TRK-01, TRK-02) | ✓ VERIFIED | `lib/lifecycle.ts`'s `deriveLifecycleState()` is a pure, total predicate (floor `new`, checked top-down); wired into both `lib/reporting-aggregates.ts` (funnel cards) and `lib/triage-candidates.ts`'s `getShortlist()` → `ShortlistRow.stage` → `StagePill` (`components/admin/shortlist-table.tsx:330`). No manual state field is ever written by this phase — confirmed via `lib/lifecycle.test.ts` and the grep-gated prohibition that only `lib/outreach-queue.ts:274` and `lib/prospect-upsert.ts:127` write `lifecycle_state`. |
| 2 | Joshua sees how many prospects were imported, triaged, scanned, and contacted per run (TRK-05) | ✓ VERIFIED | `lib/reporting-aggregates.ts`'s `getReportingData()` builds a fixed 30-row UTC-bucketed table (`utcDay()` single bucketing function, all 5 source timestamps routed through it) rendered by `PerDayTable` in `components/admin/reporting-tab.tsx`, reachable via the 5th admin tab wired into `app/admin/page.tsx` (Tab union, TabButton, fetch effect, panel ternary, pagination guard all present — `grep -n "reporting" app/admin/page.tsx` confirms all four sites). |
| 3 | Joshua sees reply rate across contacted prospects and booked calls attributable to outreach, from the existing Fillout `booked_at` signal (TRK-03, TRK-04) | ✓ VERIFIED | Reply rate is honestly and structurally gated: `REPLY_SIGNAL_AVAILABLE = false` (no `replied_at` column, no reply webhook, no event log exists anywhere in this codebase — confirmed by search) makes the numerator provably unreachable rather than a plausible zero; `formatReplyRate()` and the E2 backstop test (`app/admin/reporting-gate.test.tsx`, 10/10 passing on re-run) prove the awaiting-state rendering. `lib/booking-attribution.ts` is wired end-to-end from `POST /api/webhooks/fillout` through to `prospects.booked_at`/`booked_match_method`, guarded by a sent-outreach gate, first-write-wins, and failure-swallowing (D-7-09) — all covered by `app/api/webhooks/fillout/route.integration.test.ts`. **Caveat (WR-01, non-blocking):** both candidate lookups cap at `.limit(2)`, so a booking email/domain shared by 3+ prospects can silently under-attribute or return `no_sent_outreach` instead of the correct match or `ambiguous` — untested above 2 candidates. Low-probability at this project's 10-50/week scale but a real, not hypothetical, gap in the code review. |
| 4 | Prospect, scan, and outreach data past the retention window expires on a schedule, deleting or anonymising by config rather than by hardcoding (CMP-13, CMP-14) | ✗ FAILED | See Gaps below. The retention job itself (`lib/retention.ts`) is well-built and its own integration suite is green (36/36 total per 07-07-SUMMARY.md; this verifier independently re-ran the suppression-survival subset (5/5 pass) and the FK-order subset (11/11 pass) live). But the schedule is not live (cron committed, never deployed — confirmed by `07-07-SUMMARY.md`'s own "Task 3 Resolution" section and both open `WINDOWS.md` entries), `RETENTION_MODE` is deliberately unset everywhere, and anonymise mode never clears `prospect_sources` (self-flagged `FA-CMP-13-SOURCES`, confirmed by direct inspection — `grep -c prospect_sources lib/retention.ts lib/retention-constants.ts` returns 0 in both files). "Expires without him thinking about it" is not yet an observable behavior in this codebase; it is a well-tested, not-yet-activated capability with one known completeness gap. |
| 5 | Suppression records survive the retention job and are flagged in code as permanently exempt (CMP-15) | ✓ VERIFIED | `RETENTION_TABLE_ALLOWLIST = ["prospects", "outreach_messages", "scans"] as const` structurally excludes `suppressions`; `retentionFrom()` throws at runtime on any out-of-list table, and the union type makes it a compile error too. Explicit code comment names the rule and why it must never change. This verifier re-ran the suppression-survival subset of `lib/retention.integration.test.ts` live: 5/5 pass across dry-run/anonymize/delete modes. |

**Score:** 3/5 truths verified (1 with a non-blocking caveat, 1 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/lifecycle.ts` | Pure lifecycle derivation ladder | ✓ VERIFIED | 12-state total predicate, wired to 2 callers, tested |
| `lib/reporting-aggregates.ts` | Funnel + 30-day payload builder | ✓ VERIFIED | `getReportingData()` builds funnel + days array, wired to route and UI |
| `app/api/admin/reporting/route.ts` | Authenticated reporting endpoint | ✓ VERIFIED | Present, auth-guarded, wired to `ReportingTab` |
| `components/admin/reporting-tab.tsx` | Funnel cards + per-day table UI | ✓ VERIFIED | 5 funnel cards + `PerDayTable`, gated states tested |
| `lib/booking-attribution.ts` | Fillout → prospect attribution | ✓ VERIFIED (caveat WR-01) | Wired into `app/api/webhooks/fillout/route.ts`, tested for 1-2 candidate cases |
| `lib/retention-constants.ts` | Config surface (mode, months, allowlist, field lists) | ✓ VERIFIED | Env-driven, type-guarded (no cast), allowlist correctly excludes `suppressions`/`leads` |
| `lib/retention.ts` | Retention job (dry-run/anonymize/delete) | ⚠️ INCOMPLETE | Correct FK-safe delete ordering (tested), correct allowlist enforcement (tested); anonymise mode omits `prospect_sources` (WR-03) |
| `app/api/cron/retention/route.ts` | Scheduled entry point | ✓ VERIFIED (not live) | Bearer-auth-gated, aggregate-only logging, wired to `runRetention()`; **not deployed** |
| `vercel.json` | 5th cron entry | ⚠️ ORPHANED (undeployed) | Entry present (`0 3 1 * *`), committed, but confirmed not live in production per 07-07-SUMMARY.md |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `prospects.booked_at` (written by `lib/booking-attribution.ts`) | `deriveLifecycleState()`'s `booked` rung | `LifecycleInputs.booked_at` | WIRED | Confirmed by direct read of `lib/lifecycle.ts:55` and `lib/reporting-aggregates.ts:150` |
| `outreach_messages.status = 'sent'` (any row) | Reporting sent-gate treatment | `ReportingPayload.sentGateOpen` | WIRED | `getReportingData()` sets the gate from a real query, both funnel and per-day cells respect it (E1/E2 backstop tests, 10/10 pass) |
| `deriveLifecycleState()` | `ShortlistRow.stage` | `getShortlist()` in `lib/triage-candidates.ts` | WIRED | `lib/triage-candidates.ts:128` calls it directly, `components/admin/shortlist-table.tsx:330` renders `row.stage` |
| `RETENTION_TABLE_ALLOWLIST` | Every query in `lib/retention.ts` | `retentionFrom()` guard | WIRED | Single accessor, compile-time union + runtime membership check, confirmed by direct read |
| `RETENTION_MODE` (Vercel env) | `runRetention()`'s branch | `lib/retention-constants.ts` → `lib/retention.ts` | **NOT LIVE** | Code path correct and tested; the env value has never been set in a deployed environment because the job has never been deployed |
| `anonymizeProspects()` | `prospect_sources` | (none) | **NOT WIRED** | No query, allowlist entry, or field list references this table — confirmed by direct grep of both `lib/retention.ts` and `lib/retention-constants.ts` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Suppression rows survive every retention mode | `npx vitest run lib/retention.integration.test.ts -t "suppression"` | 5 passed | ✓ PASS |
| Delete-mode FK ordering is load-bearing (naive order fails) | `npx vitest run lib/retention.integration.test.ts -t "FK order"` | 11 passed | ✓ PASS |
| Reporting sent-gate backstop (E1/E2) renders awaiting treatment honestly | `npx vitest run app/admin/reporting-gate.test.tsx` | 10 passed | ✓ PASS |
| Full TypeScript project compiles clean | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |

No probes (`scripts/*/tests/probe-*.sh`) exist in this project — Step 7c is not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TRK-01 | 07-02, 07-04 | Every prospect carries a lifecycle state | ✓ SATISFIED | `lib/lifecycle.ts`, wired to Reporting + Shortlist |
| TRK-02 | 07-02, 07-04 | State advances off real events, not manual bookkeeping | ✓ SATISFIED | Derivation reads only timestamp/status markers; grep-gated no manual writer added |
| TRK-03 | 07-01, 07-02, 07-03 | Reply rate across contacted prospects | ✓ SATISFIED (structurally gated, honest) | `REPLY_SIGNAL_AVAILABLE` flip point, tested awaiting-state rendering |
| TRK-04 | 07-01, 07-05 | Booked calls attributable to outreach | ✓ SATISFIED (WR-01 caveat) | `lib/booking-attribution.ts`, wired, tested for ≤2 candidates |
| TRK-05 | 07-03 | Imported/triaged/scanned/contacted per run | ✓ SATISFIED | `PerDayTable`, 30-row fixed window |
| CMP-13 | 07-06, 07-07 | Scheduled retention job expires data | ✗ NOT SATISFIED | Job code complete and tested; schedule not live, `prospect_sources` gap open |
| CMP-14 | 07-06, 07-07 | Delete or anonymise by config | ⚠️ PARTIALLY SATISFIED | Config branch is correct and tested; anonymise's completeness gap (`prospect_sources`) means "anonymising" does not yet fully anonymise |
| CMP-15 | 07-06, 07-07 | Suppression records exempt, flagged in code | ✓ SATISFIED | Allowlist + tests |

**Note on REQUIREMENTS.md accuracy:** `.planning/REQUIREMENTS.md` currently marks CMP-13/CMP-14/CMP-15 as `[x]` Complete and "Complete" in its coverage table. Git history shows this checkbox flip was committed as part of `c99e14c` ("docs(07-06): complete retention config, clock and dry-run cron route plan") — i.e. **before plan 07-07 (the plan that implements the actual anonymise/delete write paths) had even started.** Plan 07-07's own `SUMMARY.md` frontmatter deliberately sets `requirements-completed: []` for exactly these three IDs, with an explicit inline comment explaining why they should not be marked closed. REQUIREMENTS.md was not corrected to match. This is a documentation-accuracy defect independent of the code gaps above — it should be fixed (reverted to unchecked, or to a "Partial" state) as part of closing this phase's gaps, so a future reader does not trust a checkbox that the plan authors themselves say is premature.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/booking-attribution.ts` | 61-65, 83-87 | `.limit(2)` candidate cap can silently miss the correct match at 3+ shared emails/domains (WR-01) | ⚠️ Warning | Non-blocking at current scale; untested above 2 candidates |
| `lib/triage-candidates.ts` | 104-112 | Unchunked `.in()` reproduces the exact PostgREST "URI too long" failure `lib/retention.ts` already found and fixed elsewhere in this same phase (WR-02) | ⚠️ Warning | Not yet triggered at current row counts; will break the Shortlist tab (and the Stage pill that rides with it, Truth 1) once triaged-prospect count crosses ~700 |
| `lib/retention.ts` / `lib/retention-constants.ts` | (absence) | Anonymise mode never reaches `prospect_sources` (WR-03) | 🛑 Blocker (for Truth 4 / CMP-13-14) | Anonymisation is reversible by a one-line join until resolved; self-flagged in-repo but not yet closed either way |
| `.planning/REQUIREMENTS.md` | 87-89, 209-211 | CMP-13/14/15 marked `[x]` Complete before the plan that implements them (07-07) started | ⚠️ Warning | Documentation trust issue, not a code defect |
| N/A | N/A | No `TBD`/`FIXME`/`XXX` markers found in any file modified by this phase | — | Clean |

### Human Verification Required

1. **Production deploy + live cron confirmation + authenticated dry-run read + SQL cross-check**
   - **Test:** Run 07-07-PLAN.md Task 3's own four evidence steps: `npx vercel --prod`, confirm `/api/cron/retention` at `0 3 1 * *` in the Vercel Cron Jobs dashboard, make one authenticated `GET` to the deployed route, and cross-check the returned `expiring` count against a hand-run SQL query in the Supabase SQL Editor.
   - **Expected:** The dashboard shows the schedule registered; the authenticated call and the SQL count agree (within the documented month-arithmetic tolerance in `retentionCutoff()`).
   - **Why human:** Requires a production deploy and a call against live infrastructure — outside this verifier's no-deploy instruction, and per 07-07-SUMMARY.md, never performed by any prior executor either.

2. **`prospect_sources` anonymisation decision**
   - **Test:** Decide, with the pending LIA's input, whether `prospect_sources` needs its own anonymise field list before `RETENTION_MODE` is ever set to `anonymize` in production.
   - **Expected:** Either a code change (new allowlist entry + field list) or an explicit, durable decision record that leaving it untouched is acceptable.
   - **Why human:** Legal/compliance judgment on what counts as sufficient anonymisation of a joinable child table — not resolvable by grep or test.

### Gaps Summary

The lifecycle/reporting half of this phase (success criteria 1-3, 5) is solid: `deriveLifecycleState()` is a genuinely single, total, tested derivation ladder reused by both the Reporting funnel and the Shortlist Stage column with no drift risk; the 30-day per-day table and the honestly-gated reply-rate/booked cells are wired end-to-end and covered by real render-output tests (not just presence checks); the booking-attribution webhook path is wired and tested for the common case, with one documented edge-case gap (WR-01) at 3+ shared candidates.

The retention half (success criterion 4, CMP-13/14) is where the phase falls short of its own stated goal. The code is well-designed — FK-safe delete ordering, an allowlist that structurally protects `suppressions` and `leads`, idempotent writes, chunked queries avoiding a PostgREST failure mode the phase itself discovered — and its test suite is green, independently re-confirmed here. But two concrete things stand between the current codebase and "data expires without him thinking about it": the cron has never been deployed (so nothing runs on a schedule yet, by design pending Joshua's own decision), and anonymise mode leaves `prospect_sources` un-cleared, so even once deployed the default anonymise path would not fully do what CMP-13/14 promise. Both gaps are already self-flagged in the plan documents and `WINDOWS.md` — this verification confirms they are real and still open, not resolved by any work this verifier could find.

---

_Verified: 2026-08-02T17:40:00Z_
_Verifier: Claude (gsd-verifier)_
