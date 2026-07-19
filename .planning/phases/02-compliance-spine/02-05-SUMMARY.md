---
phase: 02-compliance-spine
plan: 05
subsystem: api
tags: [resend, svix, webhook, supabase, compliance, cli-script]

# Dependency graph
requires:
  - phase: 02-compliance-spine
    provides: "writeSuppression (02-01), normalizeDomain (lib/domain-normalize.ts), migrations 014/015"
provides:
  - "Auto-suppression wired to the live Resend webhook — CMP-07/D-05"
  - "scripts/backfill-suppressions.ts — D-06 one-time historical backfill"
affects: [02-06, 02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Extend-in-place on an existing live route: .select('email').maybeSingle() added to the existing .update() call to read back the recipient (payload only carries email_id)"
    - "Suppression write wrapped in its own try/catch so a failure never changes the webhook's existing 200 acknowledgement (T-02-19)"
    - "Backfill dedupes email_events rows by normalised email in JS before writing, one writeSuppression call per distinct email"

key-files:
  created:
    - app/api/webhooks/resend/route.integration.test.ts
    - scripts/backfill-suppressions.ts
    - scripts/backfill-suppressions.test.ts
  modified:
    - app/api/webhooks/resend/route.ts

key-decisions:
  - "Svix verification, RESEND_EVENT_MAP, and every existing event branch (sent/delivered/opened/clicked/delivery_delayed) left untouched — suppression logic runs strictly after the existing update, never reorders or replaces it"
  - "No second webhook route created — the plan's explicit prohibition honored by extending app/api/webhooks/resend/route.ts in place"
  - "Backfill dedupes by normalised email before writing (first bounced/complained status wins the reason); writeSuppression's own idempotency makes exact ordering harmless either way"
  - "Backfill query filters ONLY on status IN (bounced, complained) — no email_type predicate (Pitfall 5), proven by a stub-builder test asserting .eq() is never called"

patterns-established:
  - "Route-handler integration tests build a real Svix signature via `new Webhook(secret).sign(msgId, timestamp, body)` and feed it back through the same headers the route verifies — no dev server needed"

requirements-completed: [CMP-07]

coverage:
  - id: D1
    description: "A Svix-verified email.bounced event writes an active domain-wide suppression row with no human action"
    requirement: "CMP-07"
    verification:
      - kind: integration
        ref: "app/api/webhooks/resend/route.integration.test.ts#POST /api/webhooks/resend — auto-suppress > CMP-07/D-05: a Svix-verified email.bounced event writes an active domain-wide suppression"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Svix-verified email.complained event writes an active domain-wide suppression row with no human action"
    requirement: "CMP-07"
    verification:
      - kind: integration
        ref: "app/api/webhooks/resend/route.integration.test.ts#POST /api/webhooks/resend — auto-suppress > CMP-07/D-05: a Svix-verified email.complained event writes an active domain-wide suppression"
        status: pass
    human_judgment: false
  - id: D3
    description: "Non-bounce/complaint events (e.g. email.opened) never trigger a suppression write"
    requirement: "CMP-07"
    verification:
      - kind: integration
        ref: "app/api/webhooks/resend/route.integration.test.ts#POST /api/webhooks/resend — auto-suppress > does not suppress on a non-bounce/complaint event (e.g. email.opened)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Svix verification is unchanged and still fail-closed — a forged/unsigned event is rejected (400) and writes nothing"
    requirement: "CMP-07"
    verification:
      - kind: integration
        ref: "app/api/webhooks/resend/route.integration.test.ts#POST /api/webhooks/resend — auto-suppress > fails closed: an unsigned/invalid request is rejected and writes nothing"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every historical bounced/complained email_events row is backfilled once, regardless of email_type, one active suppression per distinct email"
    requirement: "CMP-07"
    verification:
      - kind: unit
        ref: "scripts/backfill-suppressions.test.ts#runBackfill > writes one suppression per distinct bounced/complained email across mixed email_types, with normalised domain"
        status: pass
      - kind: unit
        ref: "scripts/backfill-suppressions.test.ts#runBackfill > Pitfall 5: applies no email_type filter — only status IN (bounced, complained)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Backfill supports --dry-run (zero writes) and is idempotent/DI-seam testable"
    requirement: "CMP-07"
    verification:
      - kind: unit
        ref: "scripts/backfill-suppressions.test.ts#runBackfill > --dry-run scans and reports but performs zero writes"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-07-20
status: complete
---

# Phase 2 Plan 5: Resend Webhook Auto-Suppression + Backfill Summary

**CMP-07 auto-suppression on the existing Svix-verified Resend webhook (hard bounce + spam complaint, domain-wide) plus a D-06 one-time backfill script that seeds the table from history**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-20T00:20:00Z
- **Completed:** 2026-07-20T00:50:00Z
- **Tasks:** 2 completed
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- `app/api/webhooks/resend/route.ts` extended in place: the existing `email_events` `.update()` call now also `.select("email").maybeSingle()`, reading the recipient back since the webhook payload only ever carries `data.email_id` (Pitfall 2, confirmed at the exact lines RESEARCH.md cited)
- On `bounced` or `complained`, `normalizeDomain()` + `writeSuppression()` fire domain-wide (D-05, one rule one code path), wrapped in its own try/catch so a suppression-write failure never changes the webhook's existing 200 acknowledgement (T-02-19)
- Svix verification, `RESEND_EVENT_MAP`, and every other existing event branch (sent/delivered/opened/clicked/delivery_delayed) are byte-for-byte unchanged — no second route, no reordering of verification, no prospects table write
- Integration test constructs a real Svix signature in-process (`new Webhook(secret).sign(msgId, timestamp, body)`) and proves: bounce → suppression, complaint → suppression, non-suppressing event → no write, forged signature → 400 + no write
- `scripts/backfill-suppressions.ts` follows the `import-prospects.ts` CLI shape exactly (usage header, `parseArgs`, DI-seam `BackfillDeps`, `runCli`): queries `email_events` for `status IN ('bounced','complained')` with **no** `email_type` filter (Pitfall 5), dedupes to one write per distinct normalised email, supports `--dry-run`, and is idempotent via `writeSuppression`'s own check-then-write
- Unit test proves the dedupe/case-collapse, the created-vs-already-active counting, `--dry-run` zero-writes, and — via a stub query builder whose `.eq()` is asserted never called — that no `email_type` predicate is ever applied

## Task Commits

Each task was committed atomically:

1. **Task 1: extend app/api/webhooks/resend/route.ts + integration test** - `c7dc81c` (feat)
2. **Task 2: scripts/backfill-suppressions.ts + DI-seam test** - `ce8cc4c` (feat)

## Files Created/Modified
- `app/api/webhooks/resend/route.ts` - extended: recipient read-back + auto-suppression on bounce/complaint
- `app/api/webhooks/resend/route.integration.test.ts` - 4-test integration suite, real Svix signatures, against local Supabase
- `scripts/backfill-suppressions.ts` - D-06 one-time backfill CLI, DI-seam, `--dry-run`
- `scripts/backfill-suppressions.test.ts` - 9-test unit suite (dedupe, dry-run, no-email_type-filter proof)

## Decisions Made
- Suppression write wrapped in its own try/catch, separate from the existing `email_events` update error log — a suppression-write failure is logged (`[webhook/resend] auto-suppress failed`) but never changes the webhook's response, preserving the live transactional integration's behavior
- Backfill collapses duplicate rows for the same email (case-insensitive) to a single `writeSuppression` call, using whichever bounced/complained status is encountered first — `writeSuppression`'s idempotency makes the exact tie-break harmless
- Backfill's "no email_type filter" guarantee is enforced by test, not just by code review: the stubbed query builder exposes `.eq` as a spy and the test asserts it is never called

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `supabase db reset` applied migrations 001-015 cleanly on the first attempt (no transient error, no retry needed). One pre-existing, out-of-scope stray file was noticed during the reset (`supabase/migrations/015_create_legal_basis.integration.test.ts` — a misplaced test file from Plan 02 sitting in `supabase/migrations/`, harmlessly skipped by the Supabase CLI since it doesn't match the migration filename pattern). Not touched here per the scope-boundary rule; logged below for visibility.

## Deferred Issues

- `supabase/migrations/015_create_legal_basis.integration.test.ts` should live under `lib/` or a test directory, not `supabase/migrations/` — pre-existing from Plan 02, out of scope for this plan, does not block anything (Supabase CLI already skips it gracefully on `db reset`).

## User Setup Required

None for this plan specifically. `RESEND_WEBHOOK_SECRET` was already required by the existing live webhook and must remain present in Vercel env; the integration test sets its own in-process test secret and never touches production.

## Next Phase Readiness
- CMP-07 is fully satisfied: the live webhook auto-suppresses domain-wide on hard bounce/spam complaint, and the backfill script is ready to run once (by the operator, from the deploy shell — not run against production here per the local-only guardrail) to seed history
- Full project test suite green: `npx tsc --noEmit` clean, `npx vitest run` — 11 files, 84 tests passed

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: app/api/webhooks/resend/route.ts
- FOUND: app/api/webhooks/resend/route.integration.test.ts
- FOUND: scripts/backfill-suppressions.ts
- FOUND: scripts/backfill-suppressions.test.ts
- FOUND: .planning/phases/02-compliance-spine/02-05-SUMMARY.md
- FOUND commit: c7dc81c
- FOUND commit: ce8cc4c
