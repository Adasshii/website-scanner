---
phase: 02-compliance-spine
plan: 04
subsystem: api
tags: [nextjs, supabase, hmac, unsubscribe, rfc8058, compliance]

# Dependency graph
requires:
  - phase: 02-compliance-spine
    provides: "writeSuppression (02-01), verifyUnsubscribeToken (02-03), migrations 014/015"
provides:
  - "GET/POST /api/unsubscribe/[token] — the public-facing half of CMP-04/CMP-05"
  - "Integration-tested write-before-success, idempotent double-unsubscribe, RFC 8058 one-click, and fail-closed forged-token rejection"
affects: [02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared resolveAndSuppress(token) helper: verify -> resolve prospect email server-side -> writeSuppression, awaited before any success response"
    - "Bilingual inline-HTML confirmation page (no next-intl, no separate page.tsx), language order driven by prospect.country"

key-files:
  created:
    - app/api/unsubscribe/[token]/route.ts
    - app/api/unsubscribe/[token]/route.integration.test.ts
  modified: []

key-decisions:
  - "Prospect lookup queries only contact_email + country — no lifecycle_state read or write, keeping D-07 (suppression is a pure lookup) intact"
  - "A verified token whose prospect has no contact_email fails closed (ok: false) rather than writing a suppression with no email, since writeSuppression requires an email"
  - "500 responses (missing secret, unexpected DB error) return NextResponse.json to mirror the existing webhook route convention; only the 200/400 user-facing paths render HTML"

patterns-established:
  - "Route-handler integration tests call GET/POST directly with NextRequest + Promise-wrapped params, no dev server needed"

requirements-completed: [CMP-04, CMP-05]

coverage:
  - id: D1
    description: "GET verifies the token, writes the suppression synchronously, then renders a bilingual confirmation — success only after the write"
    requirement: "CMP-04"
    verification:
      - kind: integration
        ref: "app/api/unsubscribe/[token]/route.integration.test.ts#CMP-04: GET verifies, writes the suppression, and returns 200 only after the write"
        status: pass
    human_judgment: false
  - id: D2
    description: "Clicking the unsubscribe link twice succeeds both times, leaving exactly one active suppression row"
    requirement: "CMP-04"
    verification:
      - kind: integration
        ref: "app/api/unsubscribe/[token]/route.integration.test.ts#CMP-04: clicking the link twice succeeds both times and leaves exactly one active suppression row"
        status: pass
    human_judgment: false
  - id: D3
    description: "POST is the RFC 8058 one-click List-Unsubscribe-Post path — bare 2xx, no redirect"
    requirement: "CMP-04"
    verification:
      - kind: integration
        ref: "app/api/unsubscribe/[token]/route.integration.test.ts#Pitfall 4: POST one-click returns a non-redirect 2xx and writes the suppression"
        status: pass
    human_judgment: false
  - id: D4
    description: "A tampered/forged token is rejected (400) with zero suppression writes — fail closed"
    requirement: "CMP-04"
    verification:
      - kind: integration
        ref: "app/api/unsubscribe/[token]/route.integration.test.ts#fails closed: a tampered token returns 400 and writes nothing"
        status: pass
    human_judgment: false
  - id: D5
    description: "Confirmation copy states the unsubscribe is effective with no delay/processing-window language, bilingual, ordered by prospect country"
    requirement: "CMP-05"
    verification:
      - kind: other
        ref: "Source review of renderConfirmationHtml/unsubscribeCopy in app/api/unsubscribe/[token]/route.ts — no CTA, no resubscribe, no tracking, no delay wording"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 2 Plan 4: Unsubscribe Endpoint Summary

**GET/POST `/api/unsubscribe/[token]` — synchronous verify-then-suppress with a bilingual confirmation page and an RFC 8058 one-click POST path**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-20T00:00:00Z
- **Completed:** 2026-07-20T00:20:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `app/api/unsubscribe/[token]/route.ts` — GET verifies the HMAC token via `verifyUnsubscribeToken`, resolves the prospect's `contact_email`/`country` server-side, awaits `writeSuppression` before responding, then renders a minimal bilingual (NL/EN, ordered by country) confirmation page with no CTA/resubscribe/tracking/delay language
- POST implements the RFC 8058 one-click `List-Unsubscribe-Post` path: same verify-and-write helper, returns a bare `NextResponse(null, { status: 200|400 })` with no redirect
- Fail-closed on every rejection path: missing `UNSUBSCRIBE_TOKEN_SECRET` (500), invalid/tampered/malformed token (400), unknown prospect or missing `contact_email` (400) — none of these write a suppression row
- Integration test proves write-before-success, idempotent double-click (one active row after two GETs), non-redirect 2xx on POST, and zero writes on a tampered token — all green against local Supabase with migrations 001-015 applied

## Task Commits

Each task was committed atomically:

1. **Task 1: app/api/unsubscribe/[token]/route.ts — GET (verify, write, confirm) + POST (one-click)** - `a7e9227` (feat)
2. **Task 2: route integration test — write-before-success, idempotent double-click, one-click POST 2xx** - `05a3de6` (test)

## Files Created/Modified
- `app/api/unsubscribe/[token]/route.ts` - GET/POST handlers, `resolveAndSuppress` shared helper, bilingual HTML renderers
- `app/api/unsubscribe/[token]/route.integration.test.ts` - 4-test integration suite against local Supabase

## Decisions Made
- Query only `contact_email` and `country` from `prospects` — never `lifecycle_state`, keeping this route read-only with respect to prospect state (D-07)
- A verified token whose prospect has no `contact_email` fails closed rather than attempting a suppression write with an empty email
- 500-path responses use `NextResponse.json` (mirroring the existing webhook route's error convention); the 200/400 user-facing paths render HTML

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `supabase db reset` applied migrations 001-015 cleanly on the first attempt (no transient error, no retry needed).

## User Setup Required

None for this plan specifically. `UNSUBSCRIBE_TOKEN_SECRET` was already required by Plan 03 and must be present in Vercel env and local `.env.local` for the route to function in any non-test environment (the integration test sets its own test secret in-process).

## Next Phase Readiness
- The unsubscribe endpoint is live and verified; Plan 05 (Resend webhook auto-suppression extension) and later plans can build on `writeSuppression`/this route with no further changes needed here
- Full project test suite green: `npx tsc --noEmit` clean, `npx vitest run` — 9 files, 71 tests passed

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

- FOUND: app/api/unsubscribe/[token]/route.ts
- FOUND: app/api/unsubscribe/[token]/route.integration.test.ts
- FOUND: .planning/phases/02-compliance-spine/02-04-SUMMARY.md
- FOUND commit: a7e9227
- FOUND commit: 05a3de6
