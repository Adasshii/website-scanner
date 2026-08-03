---
phase: 07-lifecycle-reporting-retention
verified: 2026-08-03T16:20:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Criterion 2 (TRK-05): `getReportingData()` no longer truncates at PostgREST's 1000-row cap. A file-local `fetchAllPages()` `.range()` loop backs all three reads (lib/reporting-aggregates.ts:81-99, applied at :117, :133, :150). Verified fail-first by this verifier, not taken on faith: restoring the pre-fix file (`git show abf2b15:lib/reporting-aggregates.ts`) makes the boundary test fail with `expected false to be true` on `sentGateOpen`; restoring the fixed file makes it pass. The pre-fix file was then reverted and the tree confirmed clean."
    - "Criterion 3 booked-tally half (TRK-04): same root cause, same fix. `sentGateOpen` and the `booked`/`bookedByDomain` tallies now read complete arrays. The boundary test asserts exactly this — the decisive newest `sent` row (the row an ascending capped read drops) still flips the gate and lands the prospect in Contacted."
  gaps_remaining: []
  regressions: []
gaps: []
deferred:
  - truth: "`sourcesAnonymized` stays 0 after a delete-mode run even though source rows cascade-delete (GC-01, lib/retention.ts)"
    addressed_in: "Deliberate deferral, not a later phase"
    evidence: "Unreachable while RETENTION_MODE is unset; a cosmetic counter, not a data-handling defect. Carried forward from the prior report; not reopened."
  - truth: "`chunkIds()` infinite-loops for size <= 0 (GC-02, lib/chunk-ids.ts)"
    addressed_in: "Deliberate deferral, not a later phase"
    evidence: "Both original call sites pass a hardcoded 150. Note: 54223a1 added a THIRD caller (lib/outreach-queue.integration.test.ts), which also passes the hardcoded constant — the degenerate input is still unreachable."
  - truth: "The test meant to prove the Shortlist global re-sort matters cannot fail (GC-03)"
    addressed_in: "Deliberate deferral, not a later phase"
    evidence: "Code correct, proof weak. Recorded, not reopened."
  - truth: "Dry-run retention results report only to unread Vercel logs (WINDOWS.md #3)"
    addressed_in: "WINDOWS.md entry #3"
    evidence: "Logged as a follow-up in 07-DEPLOY-EVIDENCE.md."
  - truth: "The retention clock is unproven against production data"
    addressed_in: "Trigger-based, deferred by design"
    evidence: "The route returns 0 candidates today, so D-7-15's three-source clock cannot be exercised in production. Trigger to redo it (first non-zero `expiring`, ~July 2027) named in 07-DEPLOY-EVIDENCE.md."
  - truth: "CMP-13 remains Partial: the retention job ships in non-writing dry-run mode, and the 12-month window is a placeholder"
    addressed_in: "Deliberate standing decision, pending the Legitimate Interest Assessment"
    evidence: "REQUIREMENTS.md:87 and :209 record it as Partial with rationale. Explicitly out of scope for this phase's pass/fail per the re-verification brief. Both write modes are covered by integration tests against real Postgres (lib/retention.integration.test.ts green)."
human_verification: []
human_verification_resolved:
  - test: "Redeploy production (`npx vercel --prod`) so the paginated `getReportingData()` ships, before prospect/outreach/scan volume crosses 1000 rows."
    expected: "A production deployment newer than 7710a57 (2026-08-03 15:47), aliased to scan.adashi.io."
    outcome: "DONE 2026-08-03. Joshua authorised the deploy in-session; run from the repo root. Deployment dpl_Hj47paoR7pLYNS2jxgvNjuYtxEzT, readyState READY, target production, aliased to scan.adashi.io. Live surfaces re-checked after the deploy: /api/cron/retention 401, /api/admin/reporting 401, /admin 200. Cron registration NOT independently re-read (no Vercel CLI token on disk this session) — vercel.json still declares all five crons and carries no day-of-month expression, the condition that caused the earlier silent drop, and the config is unchanged from the deploy that registered five successfully. Inherited evidence, not fresh."
  - test: "Decide, with the LIA answer in hand, whether `RETENTION_MONTHS = 12` is the right window and whether to set `RETENTION_MODE` to a writing value in the Vercel project environment."
    expected: "Either an env-var change (no code change — the config surface is complete and type-guarded) or a documented decision to keep dry-run for another interval."
    outcome: "RECLASSIFIED to a carried-forward caveat, not an open item for this phase. It duplicates the CMP-13 entry already under `deferred` above. The LIA is blocked on external counsel with no near-term answer, so leaving it as an open human item would hold phase 07 out of `passed` indefinitely for a dependency that is external, standing, and explicitly out of this phase's scope. Reclassified by Joshua's decision in-session, 2026-08-03. The requirement stays Partial in REQUIREMENTS.md; the natural trigger to revisit is the first non-zero `expiring` (~July 2027)."
---

# Phase 7: Lifecycle, Reporting & Retention Verification Report

**Phase Goal:** Joshua sees what the funnel actually did, and data that has outlived its basis expires without him thinking about it
**Verified:** 2026-08-03T16:20:00Z
**Status:** passed (5/5 truths verified, no gaps). The redeploy human item was completed in-session (dpl_Hj47paoR7pLYNS2jxgvNjuYtxEzT, aliased to scan.adashi.io); the LIA item was reclassified as a carried-forward caveat duplicating the CMP-13 deferral, since it is blocked on external counsel and out of this phase's scope.
**Re-verification:** Yes — third pass, after quick task 260803-lh0 (abf2b15, 7710a57) and the fixture-leak fix (54223a1)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every prospect shows a lifecycle state of new/qualified/contacted/replied/booked, advancing off real events rather than manual bookkeeping (TRK-01, TRK-02) | ✓ VERIFIED | `deriveLifecycleState()` (lib/lifecycle.ts:48) is a pure total predicate with two non-test callers: `lib/triage-candidates.ts:146` (feeds `ShortlistRow.stage`, rendered by `StagePill` in components/admin/shortlist-table.tsx) and `lib/reporting-aggregates.ts:198`. `lib/lifecycle.test.ts` green in this run. Prior evidence re-checked and stands. |
| 2 | Joshua sees how many prospects were imported, triaged, scanned, and contacted per run (TRK-05) | ✓ VERIFIED | **Gap closed and independently proven.** All three reads in `getReportingData()` now page through `fetchAllPages()` (lib/reporting-aggregates.ts:81-99): `prospects` ordered by `id` (:123), `outreach_messages` by `created_at, id` (:137-138), `scans` by `id` (:156). Every order key is a unique PK — confirmed against migrations 010, 012 and 001, all `id uuid primary key` — so no page boundary can skip or duplicate a row. Fail-first proven here, not read from the SUMMARY: swapping in the pre-fix file makes `keeps the newest outreach row winning past the PostgREST 1000-row cap` fail with `expected false to be true`; the fixed file makes it pass. Read surface unchanged and still wired: `getReportingData` imported at app/api/admin/reporting/route.ts:3, called at :39 behind an `x-admin-secret` gate; 14 `reporting` references in app/admin/page.tsx; `PerDayTable` rendered at components/admin/reporting-tab.tsx:84. Live: `/api/admin/reporting` → 401, `/admin` → 200. |
| 3 | Joshua sees reply rate across contacted prospects and booked calls attributable to outreach, from the existing Fillout `booked_at` signal (TRK-03, TRK-04) | ✓ VERIFIED | Reply-rate half unchanged and sound: `REPLY_SIGNAL_AVAILABLE = false` (lib/lifecycle.ts:119) makes the numerator structurally unreachable, and three independent guards keep `replyRate` null (lib/reporting-aggregates.ts:259-264). Booked half **now closed**: `sentGateOpen` (:165-172) and the `booked`/`bookedByDomain` tallies (:223-234) read the fully paged `outreachRows`/`prospectRows`. The boundary test pins exactly the corrupting case — the newest `sent` row sorts last in ASC order and is what a capped read drops — and asserts the gate opens and the funnel moves. Write path re-checked, unchanged: `attributeBookingToProspect` imported at app/api/webhooks/fillout/route.ts:3, called at :69. Gate tests present and green (`sentGateOpen is false with no sent row and flips true once one exists`; `booked and bookedByDomain are null on every day while sentGateOpen is false`). |
| 4 | Prospect, scan, and outreach data past the retention window expires on a schedule, deleting or anonymising by config rather than by hardcoding (CMP-13, CMP-14) | ✓ VERIFIED (caveated) | Re-confirmed live by this verifier: `npx vercel inspect https://scan.adashi.io` returns dpl_DNNMtUqWo3Ku5T9QSoBKVjt8oW95, target `production`, status `Ready`, aliased to scan.adashi.io. `vercel.json` carries `/api/cron/retention` at `0 3 * * *` alongside the four pre-existing crons. Unauthenticated `GET https://scan.adashi.io/api/cron/retention` → 401, proving the route serves in production behind its own auth gate. Config is env-driven and type-guarded; nothing hardcoded. `lib/retention.integration.test.ts` green against real Postgres. **Caveat, not a gap:** ships in non-writing dry-run mode pending the LIA (CMP-13 Partial by design). |
| 5 | Suppression records survive the retention job and are flagged in code as permanently exempt (CMP-15) | ✓ VERIFIED | `RETENTION_TABLE_ALLOWLIST` (lib/retention-constants.ts:86-91) contains exactly `prospects`, `outreach_messages`, `scans`, `prospect_sources`. `suppressions` and `leads` are structurally absent, with a comment naming the rule; `retentionFrom()` throws at runtime on an out-of-list table and the derived union makes it a compile error. The local DB still holds its `suppressions` row (count 1) after a full suite run that exercises both retention write modes. `npx tsc --noEmit` clean. |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `sourcesAnonymized` stays 0 after delete-mode (GC-01) | Deliberate deferral | Unreachable while RETENTION_MODE is unset; cosmetic counter |
| 2 | `chunkIds()` infinite-loops for size <= 0 (GC-02) | Deliberate deferral | All three call sites (now including the fixed outreach-queue cleanup) pass a hardcoded 150 |
| 3 | Shortlist re-sort test cannot fail (GC-03) | Deliberate deferral | Code correct, proof weak |
| 4 | Dry-run reports only to unread Vercel logs | WINDOWS.md #3 | Logged in 07-DEPLOY-EVIDENCE.md |
| 5 | Retention clock unproven against production data | Trigger-based (first non-zero `expiring`) | Self-limitation stated in the evidence file |
| 6 | CMP-13 Partial — dry-run mode, 12-month placeholder | Pending LIA | REQUIREMENTS.md:87, :209 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Boundary test FAILS without the fix (fail-first proof) | pre-fix file swapped in, `npx vitest run lib/reporting-aggregates.integration.test.ts -t "past the PostgREST 1000-row cap"` | `× ... AssertionError: expected false to be true`, 1 failed | ✓ PASS (fails as required) |
| Boundary test PASSES with the fix | `npx vitest run lib/reporting-aggregates.integration.test.ts` | 13 passed, 1 file | ✓ PASS |
| Full suite green | `npx vitest run` (run once) | 42 files, 475 passed, exit 0 | ✓ PASS |
| Typecheck clean | `npx tsc --noEmit` | no output | ✓ PASS |
| Retention + lifecycle behaviour | `npx vitest run lib/retention.integration.test.ts lib/lifecycle.test.ts` | 2 files, 52 passed | ✓ PASS |
| Retention cron serves in production | `curl -o /dev/null -w "%{http_code}" https://scan.adashi.io/api/cron/retention` | 401 | ✓ PASS |
| Reporting route serves and is guarded | `curl` on `/api/admin/reporting`, `/admin` | 401 / 200 | ✓ PASS |
| Production deployment is the aliased prod build | `npx vercel inspect https://scan.adashi.io` | dpl_DNNMtUqWo3Ku5T9QSoBKVjt8oW95, production, Ready | ✓ PASS |
| Fixture leak actually purged (prior run's confounder) | direct PostgREST counts, local stack | prospects 5, outreach_messages 5, scans 63, suppressions 1 | ✓ PASS |
| Production volume vs the 1000-row cap | direct PostgREST counts, production | prospects 67, outreach_messages 1, scans 42 | ✓ PASS (deployed build's numbers correct today) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD / FIXME / XXX / HACK / PLACEHOLDER in any phase-touched file (`lib/reporting-aggregates.ts`, `lib/retention.ts`, `lib/lifecycle.ts`, `lib/chunk-ids.ts`, `lib/booking-attribution.ts`, `app/api/cron/retention/route.ts`, `components/admin/reporting-tab.tsx`) | — | Debt-marker gate does not fire |

### Note on the prior run's evidence

The prior report cited "1006 prospects and 1055 scans" in the shared local Postgres as evidence of real scale. That figure was mostly test pollution: `lib/outreach-queue.integration.test.ts` discarded every cleanup error and built an unchunked 1000-UUID `.in()`, leaking 1121 `test-outreach-queue-%` prospects against 5 real ones. 54223a1 purges them and fixes the cleanup (releases `latest_scan_id` first, FK-safe delete order, chunks every `.in()`, throws on any error so a leak fails the run that caused it). Current counts confirm the purge held. **The pagination fix is still correct and still required** — PostgREST fails silently at HTTP 200 when a table crosses the cap, and production will get there — but those old row counts are not evidence about production data volume. Production today: 67 / 1 / 42.

### Residual risks (caveats, not gaps)

1. `fetchAllPages()` terminates on `page.length < REPORTING_PAGE_SIZE` (1000). If a PostgREST instance were ever configured with `max-rows` BELOW 1000, the loop would stop after one short page and silently undercount again — the same failure class one level down. Supabase's default is 1000 and the local stack confirms it (the pre-fix run truncated at exactly 1000), so this is theoretical today. Comparing rows returned against `to - from + 1` would close it permanently.
2. Pagination is behaviourally proven for `outreach_messages` only. `prospects` and `scans` use the same helper with unique-PK ordering, so the mechanism is shared and their wiring is verified by inspection — but no test seeds past 1000 prospects. Acceptable: one boundary test per helper, not per caller.
3. The deployed production build predates the fix. Harmless at current volume, but criteria 2 and 3 are proven in the codebase and true-by-volume rather than true-by-code in production until the next deploy.

### Gaps Summary

None. Both criteria that failed the prior run traced to one defect in `getReportingData()`. That defect is fixed, the fix was proven fail-first by this verifier rather than accepted from the SUMMARY, and the full suite, typecheck, and live production surfaces all confirm. The remaining items are a compliance decision blocked on external counsel and a routine redeploy — neither is a gap, neither blocks `phase.complete`.

---

_Verified: 2026-08-03T16:20:00Z_
_Verifier: Claude (gsd-verifier)_
