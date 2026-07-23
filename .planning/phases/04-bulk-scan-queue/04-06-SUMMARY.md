---
phase: 04-bulk-scan-queue
plan: 06
subsystem: infra
tags: [supabase, migrations, health-check, verification, cutover]

# Dependency graph
requires:
  - phase: 04-bulk-scan-queue (plans 01-05)
    provides: migration 017 file (with 04-03 MATERIALIZED CTE fix), capacity gate, scan-queue libraries, drain cron + admin routes, Shortlist UI with RunBatchButton
provides:
  - scripts/check-public-scanner-health.ts — SCAN-06 rolling success-rate measurement with --save/--compare modes
  - npm script scanner-health
  - Migration 017 applied to the LIVE Supabase project (columns, index, claim_next_scan_batch)
  - End-to-end verified bulk batch path in production (scan.adashi.io)
affects: [05, 06, 07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Health metric discriminates on scans.prospect_id IS NULL in both numerator and denominator, so bulk results can never contaminate the public scanner's measured rate"
    - "Tolerance (PUBLIC_SCANNER_TOLERANCE_PP) and window (PUBLIC_SCANNER_BASELINE_DAYS) live in lib/bulk-scan-constants.ts; the script inlines neither"

key-files:
  created:
    - scripts/check-public-scanner-health.ts
  modified:
    - package.json

key-decisions:
  - "Migration 017 applied via the Supabase dashboard SQL Editor (convention held from migrations 010-016), BEFORE the code deploy — additive schema under old code is the safe order."
  - "Live cutover: production was 142 commits behind; deployed 2026-07-22 via git push origin main + npx vercel --prod (alias scan.adashi.io). Post-deploy spot checks: /api/cron/drain-scan-queue 401 unauthenticated, /api/admin/shortlist 401, /admin 200."
  - "mollerino.nl (carrying an 'Unreachable' triage signal) was deliberately included in the batch to exercise the FAILED path."

patterns-established: []

requirements-completed: [SCAN-01, SCAN-02, SCAN-03, SCAN-06, SCAN-07, CMP-17]

# Metrics
duration: 2 days (Task 1 on 2026-07-21; checkpoints approved 2026-07-22)
completed: 2026-07-22
status: complete
---

# Phase 4 Plan 06: Live Cutover and End-to-End Verification Summary

**One-liner:** SCAN-06 health-check script shipped, migration 017 pushed live, and a real 4-prospect batch drained end to end on production with the public scanner's success rate holding at exactly 92.9% before and after (delta 0.0pp).

## What was done

**Task 1 (auto, commit 0e994c3, 2026-07-21):** `scripts/check-public-scanner-health.ts` computes the public scanner's rolling success rate over the trailing `PUBLIC_SCANNER_BASELINE_DAYS` window, counting only `scans` rows where `prospect_id IS NULL` in both numerator and denominator. Supports `--save <label>` (writes a JSON reading under `.planning/phases/04-bulk-scan-queue/scan-health/`) and `--compare <label>` (recomputes, prints delta in pp, exits 1 only when the rate drops more than `PUBLIC_SCANNER_TOLERANCE_PP` below the saved reading). Wired as npm script `scanner-health`.

**Task 2 (checkpoint:human-verify, approved by Joshua 2026-07-22):** Migration 017 applied to the live Supabase project via the dashboard SQL Editor ("Success. No rows returned"). The applied file carries the 04-03 MATERIALIZED CTE fix. Columns (`scan_status`, `scan_attempts`, `scan_status_reason`), index (`idx_prospects_scan_status_queued`), and function (`claim_next_scan_batch`) confirmed present.

**Task 3 (checkpoint:human-verify, approved by Joshua 2026-07-22):** Full end-to-end batch on production. Baseline captured (`npm run scanner-health -- --save phase04-baseline`), 4 released prospects armed via "Run batch" (mollerino.nl, gasterijleyduin.nl, paal69.nl, sanpedrofoods.com), drained at 2 per 10-minute cron tick. Joshua verified the full checklist: statuses, hosted report at /report/[id], signed-out access, UUID ids, CMP-17 no-profiling. Comparison passed: `npm run scanner-health -- --compare phase04-baseline` exited 0.

## Observed results per requirement

| Requirement | Observed result |
|---|---|
| SCAN-01 | Batch of 4 armed from the Shortlist; each row moved through queued → scanning → done/failed. Verified by Joshua at the 2026-07-22 checkpoint. |
| SCAN-02 | Capacity gate live in production; drain claimed no more than the batch size per tick (2 per 10-min tick observed). Over-capacity 503 refusal implemented and unit-tested in 04-02; drain-path claim bounding observed live. |
| SCAN-03 | Shortlist rows surfaced live status per prospect throughout the run; no row showed an attempt count above 1. Human-verified at checkpoint. |
| SCAN-04 | mollerino.nl (carrying an "Unreachable" triage signal, expected to fail) exercised the FAILED path: marked failed with a reason, not retried indefinitely. Human-verified at checkpoint. |
| SCAN-05 | Bulk identification (BULK_USER_AGENT), robots.txt pre-flight, and paced dispatch (built in 04-02/04-03) ran unchanged on the live batch; drain response reported counts only, no domains. |
| SCAN-06 | **Baseline 92.9% before the batch, 92.9% after — delta 0.0pp.** `npm run scanner-health -- --compare phase04-baseline` exited 0. The public scanner's success rate held exactly; the blast-radius constraint is verified with a number, not a feeling. |
| SCAN-07 | A done prospect's report rendered at /report/[id] with the same components and form as a public-scanner report. Human-verified at checkpoint. |
| CMP-17 | Design-analysis output on real batch reports described layout, colour, typography and CTAs only — no individual named or described. Signed-out report access confirmed (no email gate, no login, no expiry), ids are UUIDs (D-12). Human-verified at checkpoint. |

**CMP-17 scope note (plan Task 3 step 9):** the CMP-17 prompt change also affects the public scanner's design analysis. That is intentional and reviewed, not a scope leak.

## Live cutover context

Production was 142 commits behind at cutover. Deployed 2026-07-22 via `git push origin main` + `npx vercel --prod` (production alias scan.adashi.io). Post-deploy verification by the orchestrator: `/api/cron/drain-scan-queue` returns 401 unauthenticated (route live), `/api/admin/shortlist` 401, `/admin` 200. Migration 017 was applied BEFORE the deploy — additive schema under old code, the safe order.

## Deviations from Plan

**1. [Rule 2 - follow-up capture] Two todos captured during the checkpoint (commit ce6f409)**
- **Found during:** Task 3 batch review
- **Items:** (a) food-service category exclusion at ingestion/triage; (b) D-01 revision — unreachable prospects not releasable, no-HTTPS stays prioritized, rename the GATED label
- **Impact:** Neither blocks this phase; both filed as pending todos in `.planning/todos/`.

**2. [Rule 1 - infra deviation, disclosed post-verification] Vercel Hobby plan forced all sub-daily crons to daily (commit 96296d9)**
- **Found during:** Phase verification (the deploy rejected sub-daily schedules; the fix commit was undocumented)
- **What changed:** drain-scan-queue `*/10 * * * *` → `0 7 * * *` (once daily); send-pending-reports safety net `0 * * * *` → `0 8 * * *` (once daily). A 20-prospect batch at BULK_BATCH_SIZE=2 therefore drains in 10 days, not under two hours as plan 04-04's arithmetic implies.
- **Resolution (Joshua, 2026-07-23):** (a) stay on Hobby; raise `BULK_BATCH_SIZE` from 2 to 10 (the server-side claim clamp) so one daily tick scans 10 prospects — 70/week, above the 10–50/week target; SCAN-06 measured 0.0pp public-scanner impact at the current settings. Filed as a pending todo, ships with the prospect-quality mini-phase (needs redeploy). (b) The daily email safety net is accepted — it only catches missed report emails; the primary send path is unaffected.

No other deviations — tasks executed as planned.

## Self-Check: PASSED

- scripts/check-public-scanner-health.ts — FOUND
- npm script scanner-health in package.json — FOUND
- Commit 0e994c3 (Task 1) — FOUND
- Commit ce6f409 (checkpoint todos) — FOUND
