---
phase: 07-lifecycle-reporting-retention
plan: 05
subsystem: outreach-attribution
tags: [supabase, webhook, fillout, booking-attribution, integration-test, vitest]

requires: ["07-01"]
provides:
  - "prospects.booked_at / booked_match_method are now written — the only producer of the marker deriveLifecycleState() reads for its 'booked' rung"
  - "POST /api/webhooks/fillout response gains prospectAttribution"
affects: []

tech-stack:
  added: []
  patterns:
    - "guarded post-step: leads update runs first unchanged, attribution runs after inside try/catch, failure never turns 200 into 500 (D-7-09, mirrors lib/draft-on-scan-complete.ts's shape)"
    - "bounded array queries (.limit(2)) instead of Supabase single-row terminators, so a multi-row result degrades to an ambiguous outcome instead of throwing (closes FA-TRK-04)"
    - "vi.mock with importOriginal to wrap one exported function while every other test in the file keeps exercising the real implementation by default"

key-files:
  created:
    - lib/booking-attribution.ts
    - app/api/webhooks/fillout/route.integration.test.ts
  modified:
    - app/api/webhooks/fillout/route.ts

key-decisions:
  - "Both candidate lookups (email-exact, domain-fallback) are bounded .limit(2) array queries, never .single()/.maybeSingle() — contact_email carries no unique index at all, so a shared mailbox across two prospects is an ordinary data state, not an anomaly a terminator can safely assume away"
  - "A found-but-not-attributable candidate set from the email-exact step never falls through to the domain step, even when the D-7-08 sent-gate later rejects it — falling through would hand the booking to an unrelated prospect that merely shares a domain"
  - "The email-exact and domain-fallback lookups and the D-7-08 sent-gate share exactly one outreach_messages query — it serves both the contact gate and the disambiguator, since a candidate set narrowed without the sent-gate would need some other (dishonest) basis to pick a row"
  - "An ambiguous surviving candidate set (2+ prospects both mailed, both matched) is dropped rather than guessed — recording it as booked_match_method='email' would be indistinguishable from a certainty"
  - "Cleaned up 14 stray fixture rows in lib/reporting-aggregates.integration.test.ts's namespace (left by an earlier interrupted run, per this project's known shared-local-Supabase contention pattern) — data cleanup only, no test or code touched, needed to get a clean `npx vitest run`"

patterns-established:
  - "A domain-inferred booking is always recorded as booked_match_method='domain'; the DB-level prospects_booked_match_method_check CHECK constraint (migration 019) is a backstop, not the control"

requirements-completed: [TRK-04]

coverage:
  - id: D1
    description: "A booking whose email exactly matches a sent-gated prospect's contact_email attributes with matchMethod 'email', case-insensitively"
    requirement: "TRK-04"
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — 'email-exact' and 'case' tests"
        status: pass
    human_judgment: false
  - id: D2
    description: "A booking with no contact_email match but a matching domain attributes via matchMethod 'domain', screened by isAggregatorDomain() so no directory/social domain is ever credited"
    requirement: "TRK-04"
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — 'domain fallback' and 'aggregator screen' tests"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-7-08's sent-gate both blocks un-mailed prospects and resolves ambiguity; a surviving multi-candidate set is dropped, never guessed"
    requirement: "TRK-04"
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — 'D-7-08 contact gate', both 'ambiguous*' tests, first-write-wins test"
        status: pass
    human_judgment: false
  - id: D4
    description: "FA-TRK-04 closed: neither candidate lookup can throw on a multi-row Supabase result (both bounded .limit(2) array queries, zero .single()/.maybeSingle() calls)"
    requirement: "TRK-04"
    verification:
      - kind: unit
        ref: "grep -v '^\\s*[/*]' lib/booking-attribution.ts | grep -c '.single(' -> 0; grep -c 'maybeSingle' -> 0; grep -c 'limit(2)' -> 2"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-7-09: an attribution failure of any kind (async rejection or synchronous throw) is logged and swallowed — the handler still returns 200 with the leads result intact"
    requirement: "TRK-04"
    verification:
      - kind: integration
        ref: "app/api/webhooks/fillout/route.integration.test.ts — D-7-09 describe, 3 tests (async rejection, sync throw, unmocked regression guard)"
        status: pass
      - kind: unit
        ref: "npx vitest run (all three projects) — 421 tests; npx tsc --noEmit clean; npm run build succeeds"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-08-02
status: complete
---

# Phase 07 Plan 05: Booking Attribution Summary

**`lib/booking-attribution.ts` writes `prospects.booked_at`/`booked_match_method` from a real Fillout booking, resolved through bounded two-row queries and the D-7-08 sent-gate, as a guarded post-step that can never turn the webhook's 200 into a 500**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-02
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 1 new lib module, 1 new integration test file, 1 route extended

## Accomplishments
- Wrote `lib/booking-attribution.ts`: `attributeBookingToProspect()` resolves a booking email to at most one prospect via email-exact then domain-fallback candidate lookups, both bounded `.limit(2)` array queries — closing FA-TRK-04, since `prospects.contact_email` carries no unique index and a Supabase single-row terminator would throw on a shared mailbox
- The D-7-08 sent-gate and the ambiguity disambiguator share one `outreach_messages` query: zero surviving candidates is `no_sent_outreach`, two or more is `ambiguous` (dropped, never guessed), exactly one writes `booked_at`/`booked_match_method` under the same first-write-wins `.is("booked_at", null)` idiom the leads update already uses
- Extended `POST /api/webhooks/fillout` with the attribution call as a guarded post-step after the existing (byte-identical) leads update — wrapped in try/catch, never able to change the response status, response gains one field: `prospectAttribution`
- Wrote `app/api/webhooks/fillout/route.integration.test.ts` (13 tests, real local Postgres): the full match matrix (email-exact, case-insensitivity, domain fallback, aggregator screen, no-match, D-7-08 gate, first-write-wins, both ambiguity cases, leads-untouched) plus a held-out D-7-09 describe that mocks the attribution call to inject an async rejection and a synchronous throw, proving the webhook still returns 200 with the lead's `booked_at` written either way

## Task Commits

1. **Task 1: `lib/booking-attribution.ts` and the guarded post-step in the Fillout webhook** — `b7f68c7` (feat)
2. **Task 2: Held-out test for the D-7-09 fire-and-forget guarantee** — `d9acd9f` (test)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified
- `lib/booking-attribution.ts` (new) — `BookingAttribution`, `BookingAttributionOutcome`, `attributeBookingToProspect(sb, email, now)`. The only writer of `prospects.booked_at`/`booked_match_method` in the codebase.
- `app/api/webhooks/fillout/route.ts` — extended. Leads update (lines 46-56 in the original file) untouched byte-for-byte; import added, guarded post-step added between the existing log line and the response, response gains `prospectAttribution`.
- `app/api/webhooks/fillout/route.integration.test.ts` (new) — 13 tests across two describes: the match matrix (Task 1) and the D-7-09 failure-injection guarantee (Task 2).

## Decisions Made
- Both candidate lookups are bounded `.limit(2)` array queries, never `.single()`/`.maybeSingle()` — the sharper half of FA-TRK-04 this plan closes is that `prospects.contact_email` has no unique index at all, making a shared mailbox an ordinary data state rather than an anomaly.
- A found-but-not-attributable candidate set from the email-exact step never falls through to the domain step, even when the D-7-08 sent-gate later rejects every candidate in it — falling through would silently hand the booking to a different prospect that merely shares a domain.
- The contact gate and the disambiguator share one `outreach_messages` query by design (D-7-08): a candidate set narrowed without the sent-gate would need some other basis to pick a row, and there is no honest basis available.
- An ambiguous surviving candidate set is dropped, not guessed — recording it as `booked_match_method = 'email'` would be indistinguishable from a real certainty, which is exactly the confusion D-7-07 added the column to prevent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `Array.from(gatedIds)[0]` instead of spread syntax on a `Set`**
- **Found during:** Task 1 (`npx tsc --noEmit`)
- **Issue:** `[...gatedIds][0]` on a `Set<string>` produced `TS2802: Type 'Set<string>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher` under this repo's `tsconfig.json` target.
- **Fix:** `Array.from(gatedIds)[0]` — same result, no target/flag change to a shared config file.
- **Files modified:** `lib/booking-attribution.ts`
- **Verification:** `npx tsc --noEmit` clean.
- **Committed in:** `b7f68c7` (Task 1 commit)

**2. [Rule 3 - Blocking] Cleaned 14 stray fixture rows blocking `npx vitest run`**
- **Found during:** Task 2 (`npx vitest run`, full suite)
- **Issue:** `lib/reporting-aggregates.integration.test.ts` failed 3 tests with `duplicate key value violates unique constraint "prospects_domain_unique_idx"`. Investigation found 14 prospect rows under that test's `test-reporting-agg-` fixture prefix already present in the local database, dated both from an earlier interrupted run's real timestamp and from hand-seeded historical dates the test itself sets — leftovers this project's `07-VALIDATION.md` and prior phase SUMMARYs (07-04) already document as a known hazard of the shared local Supabase instance.
- **Fix:** Data cleanup only, no code or test file touched. Deleted the stray rows via the same prefix-scoped, children-before-parents delete that test's own `afterEach` performs (`outreach_messages` then `prospects` by `id`), plus one additional `scans` delete by `prospect_id` that the owning test's `afterEach` does not itself cover (a foreign-key constraint blocked the prospect delete until this was added) — this is an observation about that other plan's test, not a fix applied to it, since it is out of this plan's scope.
- **Verification:** `npx vitest run` — 421/421 tests passing across all three projects.
- **Not committed:** database-only cleanup, no file changes.

---

**Total deviations:** 2 auto-fixed (1 blocking TS target issue, 1 blocking stray-fixture cleanup)
**Impact on plan:** Neither touched this plan's scope files beyond the one-line TS fix in `lib/booking-attribution.ts`; no scope creep.

## Known Verification-Criterion Discrepancy

The plan's acceptance criteria include `grep -c 'isAggregatorDomain' lib/booking-attribution.ts` returning `1`. As written this is unattainable with a working named import: the file necessarily contains the identifier on both its `import { ..., isAggregatorDomain } from "@/lib/domain-normalize"` line and its single call site, so the actual count is `2`. All comment-level mentions of the identifier were removed to get as close as possible. The substantive intent — screening through the existing helper with exactly one call site and zero local reimplementation of a denylist — is met and independently verified (`grep -c 'AGGREGATOR_DOMAINS' lib/booking-attribution.ts` is `0`; `git diff --stat lib/domain-normalize.ts` is empty). Not treated as a Rule 4 architectural question — it is a plan-authoring imprecision in a verification script, not a behavior gap.

## Issues Encountered
- The stray-fixture contention documented above (`lib/reporting-aggregates.integration.test.ts`) — resolved as data cleanup, not a code defect. No new issue introduced by this plan; the shared local Supabase instance across sibling projects on this machine remains a standing operational note (see `MEMORY.md` reference `reference_shared_local_supabase_across_projects.md`).

## User Setup Required
None. This plan requires no migration (019 was applied to both databases in plan 07-01), no environment variable, and no manual step. `FILLOUT_WEBHOOK_SECRET` was already required and configured before this plan.

## Next Phase Readiness
- A real booking through the live Fillout form now writes `prospects.booked_at`/`booked_match_method`, which `deriveLifecycleState()` already reads (`lib/lifecycle.ts:55`) — the Reporting Booked card (plan 07-02) and the Shortlist `Stage` pill (plan 07-04) will show a real booked prospect with no further wiring, the moment Phase 8 sends the first `sent` outreach message and a real booking lands.
- Until Phase 8 sends anything, the D-7-08 sent-gate keeps the Booked figure an honest zero rather than crediting outreach for the public scanner's own inbound bookings — this is the intended behavior, not a gap.
- `FA-TRK-04`'s residual (documented in the plan's `<flagged_assumptions>`): an ambiguous booking is dropped and visible only as a `console.warn` in the Vercel logs. Whether that should also surface on the admin UI is unresolved by CONTEXT.md/ROADMAP/REQUIREMENTS.md and is not addressed by this plan.

---
*Phase: 07-lifecycle-reporting-retention*
*Completed: 2026-08-02*

## Self-Check: PASSED

All created files and commit hashes verified present on disk / in git log.
