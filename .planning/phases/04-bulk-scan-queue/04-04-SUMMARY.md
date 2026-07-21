---
phase: 04-bulk-scan-queue
plan: 04
subsystem: api
tags: [nextjs, vercel-cron, admin-routes, supabase, bulk-scan-queue]

requires:
  - phase: 04-bulk-scan-queue
    provides: "lib/scan-queue.ts (armBatch, claimNextScanBatch, markScanFailed, requeueToQueued, requeueProspect, reconcileInFlightScans) and lib/bulk-scan-dispatch.ts (dispatchClaimedProspects) from plan 04-03"
provides:
  - "GET /api/cron/drain-scan-queue — the paced, cron-secret-gated drain tick"
  - "POST /api/admin/run-batch — the human-gated arming action (D-07)"
  - "POST /api/admin/requeue-scan — the human-gated failed-to-queued re-queue action (D-05)"
  - "Fourth vercel.json cron entry (*/10 * * * *) pacing the drain"
affects: [04-05-admin-shortlist-ui, 04-06-live-cutover]

tech-stack:
  added: []
  patterns:
    - "Cron routes: Bearer CRON_SECRET checked against authorization header before any Supabase client is created, fail closed on unset env var (matches app/api/cron/follow-up, send-pending-reports)"
    - "Admin routes: x-admin-secret header checked against ADMIN_SECRET before any Supabase client is created, fail closed on unset env var (matches app/api/admin/release-prospects, shortlist)"
    - "Server owns every ceiling/batch-size constant; a client-supplied value may only clamp downward, never upward, and invalid values are rejected with 400 before any DB call"
    - "Route bodies are a gate plus one library call — no queue logic (claim/dispatch/reconcile/arm) lives inline in a route handler"

key-files:
  created:
    - app/api/cron/drain-scan-queue/route.ts
    - app/api/admin/run-batch/route.ts
    - app/api/admin/requeue-scan/route.ts
  modified:
    - vercel.json

key-decisions:
  - "Drain route response is aggregate counts only (reconciled/claimed/dispatched/refused/skipped) — no prospect ids, domains, or URLs, and no raw Postgres errors (T-04-15)"
  - "run-batch accepts an optional ceiling in the body but only as a downward clamp on BULK_ARM_CEILING (1..BULK_ARM_CEILING); anything outside that range is a 400, never silently clamped upward"
  - "requeue-scan validates id as a UUID-shaped string before any database call; the actual re-queue guard (scan_status = 'failed') lives in lib/scan-queue.ts's requeueProspect, not duplicated in the route"

requirements-completed: [SCAN-01, SCAN-02, SCAN-03, SCAN-04]

coverage:
  - id: D1
    description: "Drain cron route reconciles in-flight scans, claims a bounded batch via BULK_BATCH_SIZE, and dispatches without awaiting scan completion, gated by Bearer CRON_SECRET"
    requirement: SCAN-01
    verification:
      - kind: other
        ref: "curl -X GET localhost:3000/api/cron/drain-scan-queue (no header) -> 401; npx tsc --noEmit -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "run-batch admin route arms up to BULK_ARM_CEILING released-but-unarmed prospects via armBatch, gated by x-admin-secret, ceiling server-owned"
    requirement: SCAN-02
    verification:
      - kind: other
        ref: "curl -X POST localhost:3000/api/admin/run-batch (no header) -> 401; npx tsc --noEmit -> 0; npx next lint -> clean"
        status: pass
    human_judgment: true
    rationale: "Authenticated 200/armed-count path and the correct-header+malformed-id 400 path require the real ADMIN_SECRET value, which is not readable in this sandbox (secrets.md); unauthenticated 401 paths, source-order assertions, tsc, and lint were verified directly. A human with the real secret should confirm the authenticated round trip once against a disposable prospect row."
  - id: D3
    description: "requeue-scan admin route validates id as a UUID before any DB call and delegates the failed-only guard to requeueProspect, gated by x-admin-secret"
    requirement: SCAN-04
    verification:
      - kind: other
        ref: "curl -X POST localhost:3000/api/admin/requeue-scan (no header) -> 401; npx tsc --noEmit -> 0; npx next lint -> clean"
        status: pass
    human_judgment: true
    rationale: "Same ADMIN_SECRET sandbox limitation as D2 — the correct-header+malformed-id 400 and the correct-header+valid-id happy path were not exercised live."

duration: 25min
completed: 2026-07-21
status: complete
---

# Phase 04 Plan 04: Bulk Scan Queue Routes Summary

**Three thin routes wiring plan 04-03's scan-queue and bulk-dispatch libraries into a cron-paced drain and two human-gated admin actions, plus the fourth vercel.json cron entry.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-21T18:05:00Z
- **Completed:** 2026-07-21T18:30:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- `GET /api/cron/drain-scan-queue` — reconciles in-flight scans, claims a `BULK_BATCH_SIZE` batch, dispatches it via `dispatchClaimedProspects` without awaiting scan completion, returns aggregate counts only
- `vercel.json` gained a fourth cron entry (`*/10 * * * *`) pointed at the drain route; the three pre-existing entries are untouched
- `POST /api/admin/run-batch` — the sole caller of `armBatch`, the human gate between Phase 3's release and the drain's spend (D-07)
- `POST /api/admin/requeue-scan` — the sole human-triggered path from `failed` back to `queued`, delegating the `scan_status = 'failed'` guard to `requeueProspect` (D-05, SCAN-04)

## Task Commits

Each task was committed atomically:

1. **Task 1: drain-scan-queue cron route and the vercel.json schedule** - `df57647` (feat)
2. **Task 2: run-batch and requeue-scan admin routes** - `ebe65b4` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE.md/ROADMAP.md, made by the orchestrator per objective — this executor was told not to update STATE.md/ROADMAP.md)

## Files Created/Modified
- `app/api/cron/drain-scan-queue/route.ts` - GET handler: Bearer CRON_SECRET gate, reconcile → claim → dispatch, aggregate-count response
- `app/api/admin/run-batch/route.ts` - POST handler: x-admin-secret gate, optional downward-only ceiling clamp, calls `armBatch`
- `app/api/admin/requeue-scan/route.ts` - POST handler: x-admin-secret gate, UUID-validated `id`, calls `requeueProspect`
- `vercel.json` - fourth cron entry for the drain route

## Decisions Made
- Followed the plan's instruction to accept an optional `ceiling` in `run-batch`'s body as a downward clamp only (1..`BULK_ARM_CEILING`), rejecting out-of-range values with 400 rather than silently clamping upward — same shape as `release-prospects`'s `cutoff` handling.
- `requeue-scan`'s UUID validation is a plain regex (`/^[0-9a-f]{8}-[0-9a-f]{4}-...$/i`) since no existing UUID-validation utility exists in the codebase (checked `lib/` and `app/api/` — none found); this keeps the validation local to the one route that needs it rather than introducing a new shared helper for a single call site.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **Sandbox secrets restriction:** this environment denies reading `.env.local` (per the repo's `secrets.md` rule against printing credentials), so the authenticated 200/`armed` path on `run-batch` and the authenticated malformed-`id` 400 path on `requeue-scan` could not be exercised against a live dev server with the real `ADMIN_SECRET`. All three routes' unauthenticated 401 paths were verified live against `npm run dev`; `npx tsc --noEmit` and `npx next lint` both pass clean; every acceptance-criteria grep/source-order assertion (secret-before-client-creation, library-call presence, constants-not-literals) was checked directly against the file contents. Recommend a human with the real `ADMIN_SECRET` runs the two remaining authenticated curl checks once before shipping plan 04-06's live cutover.

## User Setup Required

None - no external service configuration required. (`CRON_SECRET` and `ADMIN_SECRET` already exist as required env vars per the project's `.claude/CLAUDE.md` tech-stack docs; no new env var was introduced.)

## Next Phase Readiness

Plan 04-05 (admin Shortlist UI surface) can now call:

- **`POST /api/admin/run-batch`** — header `x-admin-secret: <ADMIN_SECRET>`, optional JSON body `{ "ceiling"?: number }` (1..`BULK_ARM_CEILING`, omit to use the full ceiling). Response `200 { "armed": number }`; `401` if the secret is missing/wrong; `400` if `ceiling` is out of range.
- **`POST /api/admin/requeue-scan`** — header `x-admin-secret: <ADMIN_SECRET>`, JSON body `{ "id": string }` (must be a UUID). Response `200 { "requeued": true }`; `401` if the secret is missing/wrong; `400` if `id` is missing/malformed. No-ops silently (still `200`) if the prospect isn't currently `failed` — `requeueProspect`'s `.eq("scan_status", "failed")` filter means zero rows are updated but no error is thrown, so the UI should refresh the shortlist afterward rather than assume the row changed.
- The drain route (`GET /api/cron/drain-scan-queue`) is cron-only (`Bearer CRON_SECRET`) and not meant to be called from the admin UI directly — the UI's job is arming and requeueing; draining happens on its own 10-minute schedule.

No blockers. The one open item is the human-run authenticated curl spot-check noted above under Issues Encountered, which does not block 04-05's UI work (it calls the same routes the same way regardless).

---
*Phase: 04-bulk-scan-queue*
*Completed: 2026-07-21*

## Self-Check: PASSED
All created files verified present; both task commits (df57647, ebe65b4) verified in git log.
