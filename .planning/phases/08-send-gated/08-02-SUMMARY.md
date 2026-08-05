---
phase: 08-send-gated
plan: 02
subsystem: compliance
tags: [supabase, postgres, next.js, admin-api, gdpr, cmp-02, cmp-09, cmp-11]

# Dependency graph
requires:
  - phase: 08-send-gated
    provides: "send_records table + immutability trigger, legal_regimes.legal_basis/.article_14_notice_approved, outreach_messages.prepared_at (migration 020); lib/send-gate.ts's evaluateSendGates()/prepareSend()/computePreparedHash(); lib/opt-out-link.ts's renderSendableBody(); POST /api/admin/outreach/send action prepare; the Prepare send button (08-01)"
  - phase: 06-draft-generation-approval-queue
    provides: "outreach_messages, lib/outreach-queue.ts, the Outreach admin tab (OutreachTable/OutreachRowPanel), the 06-07 window.confirm/window.alert ban"
  - phase: 07-lifecycle-reporting
    provides: "lib/lifecycle.ts's deriveLifecycleState()/REPLY_SIGNAL_AVAILABLE, lib/reporting-aggregates.ts's sentGateOpen"
provides:
  - "lib/send-record.ts — markAsSent(), the second and final step of the D-03 two-step send flow: re-runs every gate, recomposes the message server-side, writes one immutable send_records row, advances outreach_messages.status to sent"
  - "lib/send-gate.ts — isPreparedFresh(preparedAt, now?), the single PREPARED_TTL_MINUTES freshness check"
  - "lib/send-gate-constants.ts — PREPARED_TTL_MINUTES split into a zero-dependency module so client code can read it without pulling node:crypto into the browser bundle"
  - "POST /api/admin/outreach/send action mark-sent — parses only id/action/preparedHash, resolves no record field itself"
  - "components/admin/outreach-row-panel.tsx — Ready to send block: read-only subject/body previews, Copy subject / Copy body controls, PREPARED_TTL_MINUTES expiry line, Mark as sent button"
  - "lib/outreach-queue.ts — OutreachFilter sent member, OutreachQueueRow.preparedAt"
  - "components/admin/outreach-table.tsx — sent status pill, fourth Sent filter/stat card, PREPARED, NOT SENT amber marker with elapsed time"
  - "app/admin/page.tsx — fourth outreach filter wired into the parallel count fetch"
  - "lib/lifecycle.ts — REPLY_SIGNAL_AVAILABLE's settled-false rationale recorded (D-01 manual send has no delivery event stream)"
affects: [08-send-gated (plan 03: isolation gate, SND-03/04 verification), any future automated-dispatch milestone, phase-8-completion]

actuals:
  tokens: 17366
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Re-run the whole gate at the second step rather than trusting the first: markAsSent() calls evaluateSendGates() fresh, so suppression/legal state that changed between Prepare and Mark still refuses at Mark (CMP-02)"
    - "Server-side recomposition + hash pinning: the record's subject/body are recomposed from the fresh gate context and compared by hash to what Prepare rendered, so a request body can never assert text the operator never saw"
    - "23505-to-refusal translation: a Postgres unique-violation on the immutable table's own index is caught and returned as a typed refusal (already-sent) rather than a 500, making a double click a clean no-op"
    - "Two-tier freshness comparison (isPreparedFresh) shared between a server module and, indirectly, a client component via a constants-only sibling module — the pattern for any future TTL a client needs to display without importing the server module that enforces it"

key-files:
  created:
    - lib/send-record.ts
    - lib/send-record.integration.test.ts
    - lib/send-gate-constants.ts
  modified:
    - lib/send-gate.ts
    - app/api/admin/outreach/send/route.ts
    - components/admin/outreach-row-panel.tsx
    - lib/outreach-queue.ts
    - components/admin/outreach-table.tsx
    - app/admin/page.tsx
    - lib/lifecycle.ts
    - lib/lifecycle.test.ts
    - app/api/admin/outreach/route.ts
    - lib/reporting-aggregates.integration.test.ts

key-decisions:
  - "D-03/D-05 implemented literally: Prepare and Mark stay two distinct actions with two distinct client handlers and two distinct route branches; Mark re-runs evaluateSendGates() in full rather than trusting anything Prepare returned"
  - "Every send_records field is read from the fresh SendGateContext or recomposed server-side (renderSendableBody over the fresh draft_body); the route parses only id/action/preparedHash, enforced by acceptance-criteria greps that fail if a record field name appears in the route file"
  - "PREPARED_TTL_MINUTES moved to a new zero-dependency lib/send-gate-constants.ts (re-exported from lib/send-gate.ts for every existing server import) after importing it into the client row-panel component broke the Next.js webpack build on lib/send-gate.ts's node:crypto import"
  - "The already-sent refusal-through-markAsSent test is built from a permanent, idempotent fixture that inserts a send_records row directly (status left approved) rather than two real calls to markAsSent() — a first fully successful call flips status to sent, which trips evaluateSendGates' status check (not-approved) before its already-sent check, so a literal second call cannot exercise that path; mirrors 08-01's own already-sent permanent-fixture pattern"

patterns-established:
  - "Immutable-audit-table test fixtures are permanent, idempotent (check-then-reuse), and documented as accepted residue in the suite's file header — never fought with DELETE, which the table's own trigger blocks by design"

requirements-completed: [CMP-02, CMP-09, CMP-11]

coverage:
  - id: D1
    description: "markAsSent() re-runs every send gate, recomposes the message server-side, and writes exactly one immutable send_records row on success — refusing (and writing nothing) on not-prepared, prepare-stale, a late suppression hit, a changed draft (prepared-content-changed), or an existing record (already-sent); a written row rejects UPDATE and DELETE"
    requirement: "CMP-02, CMP-09, CMP-11"
    verification:
      - kind: integration
        ref: "lib/send-record.integration.test.ts — 9 tests against real local Postgres: not-prepared, prepare-stale, suppressed (post-Prepare suppression write), prepared-content-changed, successful mark field-by-field (14 columns), already-sent, UPDATE+DELETE immutability, tw_exemption_claimed passthrough for both true/false, suppression_checked_at later than prepared_at"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit across lib/send-record.ts, lib/send-gate.ts, lib/send-gate-constants.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "POST /api/admin/outreach/send action mark-sent resolves no record field itself (id/action/preparedHash only, 400 on missing preparedHash, 409 with {refusal, detail} on any gate refusal); the row panel reveals read-only subject/body previews plus separate Copy subject / Copy body / Mark as sent controls only after a successful Prepare, never combining copy and mark into one action"
    requirement: CMP-11
    verification:
      - kind: integration
        ref: "curl -X POST .../api/admin/outreach/send with action mark-sent and no preparedHash -> 400 (verified against a locally-started next dev server); curl with a random UUID and a placeholder hash -> 409 {refusal: not-prepared} (real read against local-pointed and, separately, production Supabase — read-only, no write on this path)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit and npm run build across app/api/admin/outreach/send/route.ts and components/admin/outreach-row-panel.tsx"
        status: pass
    human_judgment: true
    rationale: "The rendered Ready to send block (read-only previews, Copy subject/Copy body clipboard behavior including the manual-copy fallback, and the Mark as sent button) was proven at the function/route level and by a real dev-server 400/409 check, but never driven through a real browser session — the legal gate stays shut under the shipped configuration (legal_basis NULL), so no live Prepare can succeed to actually render this block today. Needs a human or browser-automation pass once counsel supplies legal_basis, matching 08-01's same open item for its own UI."
  - id: D3
    description: "A prepared-but-unsent message carries a PREPARED, NOT SENT amber marker with elapsed time in the Outreach queue; a fourth Sent filter/stat card exists; REPLY_SIGNAL_AVAILABLE stays false with the settled D-01 rationale recorded; no new lifecycle writer was added (outreachStatus === sent already routes to contacted, sentGateOpen already reads the same status)"
    requirement: CMP-11
    verification:
      - kind: integration
        ref: "npx vitest run lib/lifecycle.test.ts lib/outreach-queue.integration.test.ts — 31 tests, including the new sent->contacted case and the REPLY_SIGNAL_AVAILABLE pin"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit and npm run build across lib/outreach-queue.ts, components/admin/outreach-table.tsx, app/admin/page.tsx, lib/lifecycle.ts"
        status: pass
    human_judgment: true
    rationale: "The plan's own <human-check> for this task (open the Outreach tab, confirm the fourth filter button and the absence of any PREPARED, NOT SENT row) was not driven through a real browser session in this run. The fourth filter's server round-trip was proven read-only via the shared vitest suite and tsc/build; the amber marker's actual rendering, and the never-yet-testable case where a real Prepare has succeeded, still need a human or browser-automation pass — no live Prepare can succeed while the legal gate stays shut."

duration: ~13min (commit span; excludes upfront context-reading)
completed: 2026-08-05
status: complete
---

# Phase 8 Plan 2: Mark As Sent Summary

**`lib/send-record.ts`'s `markAsSent()` writes the immutable per-send audit record on an explicit second action, re-running every gate fresh; the admin panel gained a copy-then-mark flow and the Outreach queue now surfaces prepared-but-unsent messages instead of losing them.**

## Performance

- **Duration:** ~13 min (commit span, `c8a0f9a` to `3d295b6`)
- **Started:** 2026-08-05T12:00:25+02:00 (first commit)
- **Completed:** 2026-08-05T12:13:15+02:00
- **Tasks:** 3 completed
- **Files modified:** 13 (3 created, 10 modified)

## Accomplishments

- `markAsSent()` implements the full D-03/D-05 sequence — not-prepared, prepare-stale (`isPreparedFresh()` against `PREPARED_TTL_MINUTES`), a fresh `evaluateSendGates()` call (CMP-02's live re-check), server-side recomposition + hash comparison (`prepared-content-changed`), a single immutable insert with 23505-to-`already-sent` translation, then the status advance — proved by 9 integration tests against real local Postgres, re-run idempotently with zero growth on a second pass.
- `POST /api/admin/outreach/send` resolves no record field itself under `action: "mark-sent"` — grep-gated at zero occurrences of `bodySent`/`resolvedEmail`/`liaVersion`/`approvedBy` in the route file — and a missing `preparedHash` is a clean 400.
- The admin row panel's "Ready to send" block shows the exact text that will be recorded (opt-out line included), with independent Copy subject / Copy body controls (each its own `navigator.clipboard.writeText` call site, with a text-selection fallback when the Clipboard API is unavailable — never a silent no-op, per the 06-07 ban on `window.alert`/`window.confirm`) and a distinct Mark as sent action that states plainly it cannot be undone.
- The Outreach queue gained a fourth `sent` filter and a `PREPARED, NOT SENT` amber marker with elapsed time on any approved-and-prepared row — the D-04 resurfacing requirement, and the visible recovery path for Task 1's one documented failure mode (record written, status update didn't land).
- `lib/lifecycle.ts`'s `REPLY_SIGNAL_AVAILABLE` stays `false` with the settled reason now on record (manual send has no delivery event stream to hang a reply marker on), and both `deriveLifecycleState()`'s `sent -> contacted` rung and `lib/reporting-aggregates.ts`'s `sentGateOpen` were confirmed to need zero changes (0-line diff, grep-gated) to pick up a real send.
- With `legal_regimes.legal_basis` still `NULL` for the real `NL` row, no `send_records` row can be written by any real path — confirmed directly against local Postgres (`legal_basis` empty, `article_14_notice_approved` false) after every fixture in this plan ran.

## Task Commits

Each task was committed atomically, following TDD for Task 1:

1. **Task 1: markAsSent writes the immutable record, or refuses** — `c8a0f9a` (test, RED) → `e0b8d2f` (feat, GREEN)
2. **Task 2: The mark-sent route action and the copy handoff** — `11170ba` (feat)
3. **Task 3: Prepared-but-unsent resurfaces, and sent messages stay visible** — `3d295b6` (feat)

## Files Created/Modified

- `lib/send-record.ts` — `markAsSent()`, `MarkRefusal`, `MarkAsSentResult`
- `lib/send-record.integration.test.ts` — 9 integration tests against real local Postgres
- `lib/send-gate-constants.ts` — `PREPARED_TTL_MINUTES`, split out for client-safe import
- `lib/send-gate.ts` — `isPreparedFresh(preparedAt, now?)`, re-exports `PREPARED_TTL_MINUTES`
- `app/api/admin/outreach/send/route.ts` — `action: "mark-sent"` branch
- `components/admin/outreach-row-panel.tsx` — Ready to send block, copy/mark handlers
- `lib/outreach-queue.ts` — `OutreachFilter` `sent` member, `OutreachQueueRow.preparedAt`
- `components/admin/outreach-table.tsx` — `sent` pill, fourth filter/stat card, `PreparedNotSentPill`
- `app/admin/page.tsx` — fourth filter wired into `OUTREACH_FILTERS` and the count fetch
- `lib/lifecycle.ts` — `REPLY_SIGNAL_AVAILABLE` comment rewritten to the settled rationale
- `lib/lifecycle.test.ts` — `sent -> contacted` case, `REPLY_SIGNAL_AVAILABLE` pin
- `app/api/admin/outreach/route.ts` — `KNOWN_FILTERS` gains `"sent"` (deviation, see below)
- `lib/reporting-aggregates.integration.test.ts` — `sentGateOpen` test revisited (deviation, see below)

## Decisions Made

- Kept the plan's exact refusal sequence in `markAsSent()` (not-prepared → prepare-stale → full gate re-run → content-hash check → insert → status update), matching T-08-02-01/02/03's threat mitigations.
- Wrote two separate `handleCopySubject`/`handleCopyBody` functions rather than one shared helper, so each copy control has its own literal `navigator.clipboard.writeText` call site — matches the plan's own acceptance criterion ("at least 2, one per copy control") and keeps the two actions independently traceable.
- Built the `already-sent`-via-`markAsSent()` test from a permanent fixture that inserts a `send_records` row directly rather than two real `markAsSent()` calls — see Deviations, this is a test-construction decision forced by `evaluateSendGates()`'s existing (unchanged, 08-01-locked) check order, not a change to that order.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node:crypto` broke the Next.js client build when `PREPARED_TTL_MINUTES` was imported from `lib/send-gate.ts` into a client component**
- **Found during:** Task 2, `npm run build`
- **Issue:** `components/admin/outreach-row-panel.tsx` is `"use client"`. `lib/send-gate.ts` imports `node:crypto` (via `computePreparedHash`'s `createHash`), and Next.js's webpack build fails outright on any `node:` scheme import reaching client code ("Reading from node:crypto is not handled by plugins").
- **Fix:** Created `lib/send-gate-constants.ts`, a zero-dependency module holding only `PREPARED_TTL_MINUTES`. `lib/send-gate.ts` re-exports it (every existing server-side import site — `lib/send-record.ts`, the route, both integration test suites — is unchanged); the row panel imports the constant from the new module instead.
- **Files modified:** `lib/send-gate-constants.ts` (new), `lib/send-gate.ts`, `components/admin/outreach-row-panel.tsx`
- **Verification:** `npx tsc --noEmit` and `npm run build` both pass; `grep -c "isPreparedFresh" lib/send-gate.ts` still returns 2 (the plan's own acceptance criterion).
- **Committed in:** `11170ba` (Task 2 commit)

**2. [Rule 3 - Blocking] `app/api/admin/outreach/route.ts`'s `KNOWN_FILTERS` whitelist did not include the new `sent` value**
- **Found during:** Task 3, after extending `OutreachFilter` and `app/admin/page.tsx`'s `OUTREACH_FILTERS`
- **Issue:** This route file is not in this plan's `files_modified`, but its `GET` handler validates `?status=` against a hardcoded three-value list and silently falls back to `"pending"` on anything unrecognised. Without this fix, the new fourth filter button would 200 successfully while silently returning pending rows instead of sent rows — worse than an error, since it reads as working.
- **Fix:** Added `"sent"` to `KNOWN_FILTERS`.
- **Files modified:** `app/api/admin/outreach/route.ts`
- **Verification:** `npx tsc --noEmit`, `npm run build`, and `npx vitest run lib/outreach-queue.integration.test.ts` all pass.
- **Committed in:** `3d295b6` (Task 3 commit)

**3. [Rule 1 - Bug, test revisited per its own instruction] `lib/reporting-aggregates.integration.test.ts`'s `sentGateOpen` test asserted a global absence of `sent` rows that this plan's own permanent fixtures now break**
- **Found during:** Task 3, `npx vitest run` (full suite)
- **Issue:** The test asserted `sentGateOpen` is `false` before seeding any row, with its own comment stating: "Phase 8 (the send channel) has not shipped in this codebase yet... If this ever fails because a real sent row exists, that assumption no longer holds and the test needs revisiting, not silencing." `lib/send-record.integration.test.ts`'s permanent successful-mark fixtures (Task 1) are exactly that real `sent` row, by design and permanently (the immutability trigger forbids deleting them).
- **Fix:** Revisited per the test's own instruction: dropped the "starts false" half (which can never hold again on this shared local database) and kept the "flips true given a real sent row" half, the actual behavior under test. `lib/reporting-aggregates.ts` itself is unchanged (`git diff --numstat` reports 0 lines, matching this plan's own acceptance criterion for that file).
- **Files modified:** `lib/reporting-aggregates.integration.test.ts`
- **Verification:** `npx vitest run` — 551/551 passing across the whole suite.
- **Committed in:** `3d295b6` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking issues, 1 Rule 1 test revision explicitly invited by the prior test's own comment)
**Impact on plan:** All three were necessary for correctness (client build, correct filter behavior) or to keep the full suite honestly green without silencing a test that had already named this exact scenario. No scope creep — no legal value was set, no new package installed, no architectural change.

## Issues Encountered

None beyond the deviations above.

## User Setup Required

None for local development or this plan's own verification. Production DDL for migration 020 remains Joshua's own deliberate manual step (08-01's user-setup note, unchanged by this plan).

## Next Phase Readiness

`markAsSent()`, the mark-sent route action, the copy-then-mark UI, and the queue's unresolved-marker/sent-filter visibility are all in place and proven against real local Postgres and a real dev server, with the legal gate still shut under the shipped configuration (`legal_basis` NULL for the real `NL` row — confirmed directly after every fixture in this plan ran). Plan 08-03 (isolation gate, SND-03/04 verification) can build on this without further mechanism changes. Two coverage entries (D2, D3) are marked `human_judgment: true` pending a live-browser or browser-automation pass — consistent with 08-01's own open item, and blocked on the same thing: no live Prepare can succeed until counsel supplies `legal_basis`.

---
*Phase: 08-send-gated*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 13 created/modified files plus the SUMMARY itself confirmed present on disk; all 4 task commit hashes (`c8a0f9a`, `e0b8d2f`, `11170ba`, `3d295b6`) confirmed in `git log --oneline --all`.
