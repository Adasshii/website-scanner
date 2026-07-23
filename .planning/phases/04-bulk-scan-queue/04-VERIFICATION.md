---
phase: 04-bulk-scan-queue
verified: 2026-07-23T23:25:00Z
status: passed
score: 8/8 must-haves verified (roadmap success criteria); 0 present-but-behavior-unverified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Confirm the production drain cadence (vercel.json: `0 7 * * *`, once daily) is the accepted operating mode for Phase 4, not an unnoticed regression from the plan's designed `*/10 * * * *` schedule."
    expected: "Either (a) Joshua explicitly accepts the once-daily cadence (Vercel Hobby plan constraint, commit 96296d9) as sufficient for 10-50 prospects/week scale, or (b) upgrades to Vercel Pro to restore the sub-daily schedule the plan and every Phase 4 SUMMARY describe."
    why_human: "This is a deliberate infra trade-off made outside any Phase 4 plan's file_modified list, undocumented in every Phase 4 SUMMARY (04-04-SUMMARY and 04-06-SUMMARY both state/imply a 10-minute tick), and changes the observable drain latency for a full 20-prospect armed batch from 'under two hours' (plan 04-04's own arithmetic) to over a week. It doesn't violate the letter of any ROADMAP success criterion, but it is a real gap between documented and live behavior that only Joshua can resolve — cost/plan trade-offs are not something to autonomously accept or reject."
    resolution: "Resolved by Joshua 2026-07-23: daily cadence accepted (stay on Vercel Hobby); BULK_BATCH_SIZE will be raised 2→10 so one daily tick scans 10 prospects (todo 2026-07-23-raise-bulk-batch-size-for-daily-cron.md, ships with the prospect-quality mini-phase). Daily send-pending-reports safety net also accepted (primary email path unaffected). Disclosure added to 04-06-SUMMARY.md Deviations."
---

# Phase 4: Bulk Scan Queue Verification Report

**Phase Goal:** Shortlisted prospects get real scan reports without harming the live public scanner.
**Verified:** 2026-07-23
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Joshua queues a batch of shortlisted prospects and each one ends showing queued, scanning, done, or failed (SCAN-01, SCAN-03) | ✓ VERIFIED | `lib/scan-queue.ts` (`armBatch`, `claimNextScanBatch`, `reconcileInFlightScans`), migration 017's CHECK constraint restricts `scan_status` to exactly these four values; `components/admin/shortlist-table.tsx` renders a pill for each. Human-verified end-to-end on a real 4-prospect production batch (04-06-SUMMARY.md) — mollerino.nl exercised the failed path, the other three completed. |
| 2 | The scanner service refuses requests over its capacity instead of accepting them and timing out (SCAN-02) | ✓ VERIFIED | `scanner-service/src/index.ts:414-418` — `isAtCapacity(activeFullScans.size, source)` gates before `activeFullScans.set()` (line 428) and before the sole `res.json({accepted:true})` call, returning a generic 503 with `retryAfterSeconds` and no internal counts. Unit-tested (`lib/scanner-capacity.test.ts`, 5/5 passing). |
| 3 | The live public scanner holds its normal success rate throughout a bulk run (SCAN-06) | ✓ VERIFIED | `scripts/check-public-scanner-health.ts` discriminates on `prospect_id is null` in both numerator and denominator so bulk results can never contaminate the metric. Per the established checkpoint record (04-06-SUMMARY.md, human-verified 2026-07-22): baseline 92.9% before, 92.9% after a real 4-prospect batch, delta 0.0pp, `--compare` exited 0. |
| 4 | A prospect whose scan fails is skipped rather than retried indefinitely, and bulk scanning identifies itself honestly, respects robots.txt, and is rate-limited (SCAN-04, SCAN-05) | ✓ VERIFIED | `lib/bulk-scan-dispatch.ts` pre-flights `isHomepageDisallowed()` before any scanner-service call (never re-implements the parser); `requeueProspect()` in `lib/scan-queue.ts` only reactivates a row via an explicit human click and is a no-op on non-`failed` rows (`.eq("scan_status","failed")` guard). `BULK_USER_AGENT` names Adashi with a contact URL and differs from both the public UA and `TRIAGE_USER_AGENT`. `BULK_DISPATCH_CONCURRENCY`/`BULK_DISPATCH_SPACING_MS` bound and pace dispatch via `p-limit`. All covered by `lib/bulk-scan-dispatch.test.ts` (7/7) and `lib/scan-queue.test.ts` (10/10). |
| 5 | Each scanned prospect has a report at a hosted URL identical in form to the public scanner's, and personal data caught incidentally in screenshots is not separately indexed, profiled, or reused (SCAN-07, CMP-17) | ✓ VERIFIED | `app/report/[id]/page.tsx` contains zero prospect-aware branches (grep confirms no `prospect`/`email-gate` reference) — the same component renders both paths (D-11). `buildDesignAnalysisPrompt()` (`scanner-service/src/design-prompt.ts`) carries an explicit no-profiling instruction, tested by `lib/scanner-design-prompt.test.ts` (4/4 passing) and recorded in `docs/legal/lia/LIA-v1.md`'s CMP-17 addendum. Human-verified on real production output (04-06-SUMMARY.md). |

**Score:** 8/8 ROADMAP success-criteria requirement IDs (SCAN-01 through SCAN-07, CMP-17) have supporting evidence in the codebase. 0 present-but-behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/017_add_scan_status.sql` | Status columns + `claim_next_scan_batch` RPC | ✓ VERIFIED | Exact 3 columns, CHECK constraint, partial index, RPC with `MATERIALIZED` CTE clamp fix (found and fixed by 04-03's own integration test — a real bug caught before it shipped). Applied to live Supabase per human checkpoint (04-06). |
| `lib/bulk-scan-constants.ts` | Single tunable block, 9 exports | ✓ VERIFIED | All 9 constants present, `BULK_USER_AGENT` distinct from `AdashiScanner`/`TRIAGE_USER_AGENT`, no `BATCH_SIZE` name collision. |
| `scanner-service/src/capacity.ts` | Pure, dependency-free capacity gate | ✓ VERIFIED | Zero imports; `isAtCapacity()` matches spec exactly; `RESERVED_FOR_PUBLIC(1) < MAX_TOTAL_FULL_SCANS(3)`. |
| `scanner-service/src/design-prompt.ts` | Extracted, tested prompt builder with CMP-17 instruction | ✓ VERIFIED | Dependency-free; instruction sits between dimension list and "Also identify" sentence, matching the plan's ordering requirement. |
| `docs/legal/lia/LIA-v1.md` | CMP-17 control recorded as implemented | ✓ VERIFIED | Addendum names its own implementation file and test; body of v1 unchanged (append-only), versioning ambiguity explicitly flagged rather than silently resolved. |
| `lib/scan-queue.ts` | Every prospects state transition | ✓ VERIFIED | 6 functions + `ClaimedProspect` interface, no `.upsert()`, D-06 invariant documented. 10/10 unit tests. |
| `lib/bulk-scan-dispatch.ts` | Validate → robots → scans-row → paced dispatch | ✓ VERIFIED | SSRF re-validation before robots check before client call (line order confirmed); concurrency bound via `p-limit`; every outcome mapped to the correct `scan-queue.ts` transition. 7/7 unit tests. |
| `lib/scan-drain.integration.test.ts` | SKIP LOCKED disjointness proof | ✓ VERIFIED | 6/6 passing against local Supabase (re-run live during this verification). |
| `app/api/cron/drain-scan-queue/route.ts` | Auth-gated paced drain tick | ✓ VERIFIED | `CRON_SECRET` check precedes any Supabase client; reconcile→claim→dispatch order confirmed; aggregate-count-only response body. Live 401 confirmed against production during this verification. |
| `app/api/admin/run-batch/route.ts` | Human-gated arming action | ✓ VERIFIED | `x-admin-secret` gate precedes DB work; ceiling is server-owned, client value only clamps downward. Live 401 confirmed against production. |
| `app/api/admin/requeue-scan/route.ts` | Human-gated failed→queued re-queue | ✓ VERIFIED | UUID-validated before DB call; delegates the `scan_status='failed'` guard to the library. Live 401 confirmed against production. |
| `vercel.json` | Fourth cron entry for the drain | ⚠️ DEVIATION | Entry exists (`/api/cron/drain-scan-queue`), but schedule is `0 7 * * *` (once daily), not the `*/10 * * * *` the plan specifies and every Phase 4 SUMMARY describes. See Gaps below. |
| `components/admin/shortlist-table.tsx` | Status pill, report link, re-queue, non-collapsing empty state | ✓ VERIFIED | All four state pills render; done-row link guarded on `latest_scan_id`; failed-row shows reason + Re-queue; empty-state guard widened to check `scan_status`/`scan_released_at` as the plan requires. Checkpoint-approved by Joshua (04-05). |
| `components/admin/run-batch-button.tsx` | Confirm-before-spend arming button | ✓ VERIFIED | Confirms count + ceiling before POST; `BULK_ARM_CEILING` sourced from constants, no numeric literal. |
| `scripts/check-public-scanner-health.ts` | SCAN-06 measurement, `--save`/`--compare` | ✓ VERIFIED | Query restricted to `prospect_id is null`; tolerance/window sourced from constants; exit-code contract matches spec. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `full-async` handler | `scanner-service/src/capacity.ts` | `isAtCapacity` import | ✓ WIRED | Confirmed at `scanner-service/src/index.ts:20,414`. |
| `full-async` request body `userAgent` | `discoverPages()`/`scanPage()` → `browser.newContext()` | optional passthrough | ✓ WIRED | `discovery.ts`/`scanner.ts` both use `options.userAgent ?? <existing literal>`. |
| `ai.ts` `generateDesignAnalysis()` | `buildDesignAnalysisPrompt()` | function call | ✓ WIRED | Confirmed import + call site. |
| `claim_next_scan_batch` RPC | `lib/scan-queue.ts` `claimNextScanBatch()` | `sb.rpc(...)` | ✓ WIRED | Sole caller confirmed. |
| `dispatchClaimedProspects()` | scans row + `latest_scan_id` write | insert-then-update sequence | ✓ WIRED | Confirmed in `lib/bulk-scan-dispatch.ts`. |
| `reconcileInFlightScans()` | `prospects.latest_scan_id` ↔ `scans.status` | join + grouped/per-row update | ✓ WIRED | Confirmed; only write-back path (scanner service never touches `prospects`, confirmed by zero `from("prospects")` references in `scanner-service/src/index.ts`). |
| `run-batch` route | `armBatch()` | sole caller | ✓ WIRED | Confirmed. |
| `getShortlist()` | Shortlist UI | select-list widening | ✓ WIRED | `lib/triage-candidates.ts` select includes all 4 new columns; `app/admin/page.tsx` computes `armableCount` from the same `rows`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Root vitest suite is green (Phase 4 files) | `npx vitest run lib/scanner-capacity.test.ts lib/scanner-design-prompt.test.ts lib/scan-queue.test.ts lib/bulk-scan-dispatch.test.ts lib/scan-drain.integration.test.ts` | 32/32 passing | ✓ PASS |
| Full workspace suite | `npx vitest run` (once) | 197/198 passing, 1 failure in `lib/triage-release.integration.test.ts` (Phase 3, pre-existing) | ✓ PASS (known transient flake — reran isolated, 6/6 passed; matches verification_context) |
| Root tsconfig type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| scanner-service tsconfig type-check | `npx tsc --noEmit -p scanner-service/tsconfig.json` | exit 0 | ✓ PASS |
| Production auth gates | `curl` against `scan.adashi.io` — drain cron, shortlist, run-batch, requeue-scan (no header), `/admin` (page) | 401, 401, 401, 401, 200 | ✓ PASS — matches 04-06-SUMMARY's post-deploy claims exactly |
| `/report/[id]` has no prospect-aware branch | `grep -n "prospect" "app/report/[id]/page.tsx"` | no matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SCAN-01 | 04-01, 04-03, 04-04 | Queued without exhausting concurrency | ✓ SATISFIED | `claim_next_scan_batch` SKIP LOCKED, integration-proven disjoint; drain route claims a bounded batch per tick. |
| SCAN-02 | 04-01, 04-02 | Scanner refuses over-capacity requests | ✓ SATISFIED | `isAtCapacity()` gate, 503 refusal before registration. |
| SCAN-03 | 04-01, 04-05 | Visible scan status per prospect | ✓ SATISFIED | Status pill in Shortlist table; CHECK-constrained vocabulary. |
| SCAN-04 | 04-01, 04-03, 04-04 | Failed scan skipped, not retried indefinitely | ✓ SATISFIED | `requeueProspect()`'s `failed`-only guard; human-gated re-queue route. |
| SCAN-05 | 04-02, 04-03 | Honest UA + robots.txt respected | ✓ SATISFIED | `BULK_USER_AGENT`, robots pre-flight via `isHomepageDisallowed()`. |
| SCAN-06 | 04-06 | Rate-limited; public scanner protected | ✓ SATISFIED | `p-limit` + spacing constants; measured 92.9%→92.9% delta 0.0pp on a real batch. Note: production drain cadence is currently once-daily rather than every-10-minutes — see human_verification item; this makes the measured protection *more* conservative, not less. |
| SCAN-07 | 04-05, 04-06 | Same hosted report artefact | ✓ SATISFIED | `/report/[id]` reused verbatim, no prospect-aware branch; human-verified on real output. |
| CMP-17 | 04-02 | No profiling of incidental personal data | ✓ SATISFIED | `buildDesignAnalysisPrompt()` no-profiling instruction, tested, recorded in LIA-v1.md, human-verified on real screenshots. |

No orphaned requirements — all 8 IDs from ROADMAP.md's Phase 4 row appear in at least one plan's `requirements` frontmatter and are covered above.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any Phase 4 file. No stub returns, no empty handlers, no hardcoded-empty data flowing to render.

### Deviation: Production Cron Cadence vs. Plan/SUMMARY Claims

`vercel.json`'s `drain-scan-queue` entry currently reads `"schedule": "0 7 * * *"` (once daily), not the `"*/10 * * * *"` (every 10 minutes) specified in 04-04-PLAN.md's action text and asserted in both 04-04-SUMMARY.md ("vercel.json gained a fourth cron entry (`*/10 * * * *`)") and 04-06-SUMMARY.md ("drained at 2 per 10-minute cron tick"). Git history shows this was changed by commit `96296d9` ("chore(vercel): downgrade sub-daily crons to daily for Hobby plan") on 2026-07-21 — before the 04-06 checkpoints were approved on 2026-07-22 — because Vercel's Hobby plan blocks any cron running more than once per day. The commit message documents the trade-off explicitly (drain latency goes from 10 min to 24h) but no Phase 4 SUMMARY mentions it, so a reader of the SUMMARIES alone would believe the live schedule matches the plan's arithmetic ("drains a full 20-prospect armed batch in under two hours"). It in fact does not — an armed 20-prospect batch at `BULK_BATCH_SIZE=2`/tick now takes up to 10 days to fully drain automatically.

This does not violate the letter of any ROADMAP success criterion (each tick still correctly reconciles/claims/dispatches a bounded batch; the slower cadence is, if anything, more protective of SCAN-06's blast-radius constraint, not less). It is flagged because it is an undisclosed gap between documented and live behavior, and because "10-50 prospects a week" at a once-daily 2-per-tick cadence changes the practical usability of the feature Joshua asked for — this is a cost/plan trade-off only he can decide (accept the slower cadence, or upgrade to Vercel Pro).

### Human Verification Required

### 1. Accept or correct the production drain cadence

**Test:** Review `vercel.json`'s current `drain-scan-queue` schedule (`0 7 * * *`, once daily) against the throughput you actually need at 10-50 prospects/week.
**Expected:** Either explicit acceptance of the once-daily cadence, or an upgrade to Vercel Pro to restore the `*/10 * * * *` schedule the phase was designed and documented around.
**Why human:** This is a real infrastructure cost/plan decision (Vercel Hobby vs. Pro), not a code defect — no amount of grepping resolves whether the slower cadence is acceptable for your workflow.

---

*Verified: 2026-07-23*
*Verifier: Claude (gsd-verifier)*
