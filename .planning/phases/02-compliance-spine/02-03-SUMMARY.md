---
phase: 02-compliance-spine
plan: 03
subsystem: security
tags: [crypto, hmac, unsubscribe, gdpr, vitest, node-crypto]

# Dependency graph
requires:
  - phase: 02-compliance-spine (plan 01)
    provides: suppressions table + writeSuppression() this token's verified prospectId will feed into (Plan 04's route)
provides:
  - lib/unsubscribe-token.ts — signUnsubscribeToken(prospectId) / verifyUnsubscribeToken(token), HMAC-SHA256 over node:crypto, no expiry, fail-closed on missing secret
  - unit suite proving round-trip, tamper rejection, malformed rejection, and missing-secret throw
affects: [02-04 (unsubscribe route calls verifyUnsubscribeToken before writing suppression), phase-8 (send layer mints tokens via signUnsubscribeToken)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Signed non-PII reference token: HMAC-SHA256 (node:crypto createHmac) over a base64url JSON payload containing only a UUID reference, no JWT library, no expiry field, verified with crypto.timingSafeEqual on equal-length buffers"

key-files:
  created:
    - lib/unsubscribe-token.ts
    - lib/unsubscribe-token.test.ts
  modified: []

key-decisions:
  - "Followed RESEARCH.md Pattern 3 verbatim (stdlib crypto, no jose/jsonwebtoken) rather than introducing a JWT dependency for a single UUID claim"
  - "getSecret() is a small internal helper shared by both sign and verify so the fail-closed 'Missing UNSUBSCRIBE_TOKEN_SECRET' check and error message can't drift between the two functions"
  - "Test suite covers a fifth case beyond the plan's four (payload-not-JSON with a correctly re-derived signature) to prove the JSON.parse catch path is exercised independently of the timingSafeEqual rejection path"

patterns-established:
  - "Pattern: Signed non-PII reference token (HMAC-SHA256 + timingSafeEqual + no expiry) — reusable for any future short-lived-claim-free token that must stay valid indefinitely without leaking PII into a URL"

requirements-completed: [CMP-04, CMP-05]

coverage:
  - id: D1
    description: "signUnsubscribeToken(prospectId) mints an HMAC-SHA256 token that verifyUnsubscribeToken round-trips back to the same prospectId, with a payload carrying only pid (no email, no exp)"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#round-trips a prospect UUID through sign then verify"
        status: pass
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#produces a <payload>.<sig> token with a payload carrying no email or exp"
        status: pass
    human_judgment: false
  - id: D2
    description: "verifyUnsubscribeToken rejects a tampered signature and a malformed/non-JSON token via constant-time comparison, returning null and never throwing"
    requirement: "CMP-04"
    verification:
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#rejects a token with a tampered signature"
        status: pass
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#rejects a malformed token without throwing"
        status: pass
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#rejects a token whose payload is not valid JSON after a valid signature swap"
        status: pass
    human_judgment: false
  - id: D3
    description: "The token has no expiry field and both functions fail closed (throw) when UNSUBSCRIBE_TOKEN_SECRET is unset — an unsubscribe link stays valid permanently but cannot be minted/verified without the server secret"
    requirement: "CMP-05"
    verification:
      - kind: unit
        ref: "lib/unsubscribe-token.test.ts#throws a clear error from both functions when the secret is unset"
        status: pass
      - kind: unit
        ref: "source assertion — grep -q timingSafeEqual lib/unsubscribe-token.ts; grep -Ei jsonwebtoken|jose lib/unsubscribe-token.ts (no match)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 2 Plan 3: Unsubscribe Token Summary

**Tamper-proof, permanent, PII-free unsubscribe token — HMAC-SHA256 over a UUID via node:crypto, no JWT dependency, timing-safe verification**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-20T00:11:00+02:00 (approx)
- **Completed:** 2026-07-20T00:13:38+02:00
- **Tasks:** 1/1 completed
- **Files modified:** 2 (both new)

## Accomplishments
- Shipped `lib/unsubscribe-token.ts` implementing RESEARCH.md Pattern 3 exactly: `createHmac`/`timingSafeEqual` from `node:crypto`, a base64url helper, and a payload that encodes only `pid` (a UUID) — no email, no expiry.
- `verifyUnsubscribeToken` fails closed to `null` on any tampered signature or malformed/non-JSON token, never throws on attacker-controlled input, and both functions throw a clear "Missing UNSUBSCRIBE_TOKEN_SECRET" error if the secret is unset in the environment.
- 6-test unit suite (pure function, no DB, no mocks) proves round-trip, payload shape, tamper rejection, malformed-token rejection (including a case that isolates the `JSON.parse` catch from the signature-check path), and the fail-closed missing-secret throw.

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/unsubscribe-token.ts — HMAC sign/verify (stdlib crypto) + unit tests** - `cb1f818` (feat)

**Plan metadata:** (this commit) `docs: complete unsubscribe-token plan`

_Note: single-task plan; TDD frontmatter (`tdd="true"`) was honored by writing behavior-driven tests alongside the implementation in one commit rather than a separate RED/GREEN split, since the plan's own `<action>` describes implementation and test file together as one deliverable and the plan does not gate on separate test/feat commits._

## Files Created/Modified
- `lib/unsubscribe-token.ts` - `signUnsubscribeToken(prospectId)` / `verifyUnsubscribeToken(token)`, HMAC-SHA256 over `node:crypto`, no expiry, fail-closed
- `lib/unsubscribe-token.test.ts` - 6-test pure-function unit suite (round-trip, payload shape, tamper, malformed, JSON-parse-catch isolation, missing-secret throw)

## Decisions Made
- Followed RESEARCH.md Pattern 3 verbatim rather than adapting it — the plan's `<action>` block already specifies the exact implementation, and no in-repo analog exists to reconcile it against (per 02-PATTERNS.md).
- Added a `getSecret()` internal helper (not in the RESEARCH snippet, which repeats the same three lines in both functions) so the fail-closed check and error message live in one place — Rule 1/scope-preserving cleanup, not a behavior change.
- Extended the test suite beyond the plan's four named behaviors with a fifth test that re-derives a valid signature over a non-JSON payload, isolating the `JSON.parse` catch path from the `timingSafeEqual` rejection path — both are "malformed → null" but exercise different lines.

## Deviations from Plan

None - plan executed exactly as written (one internal `getSecret()` refactor for DRY, no behavior or interface change from the plan's specified `signUnsubscribeToken`/`verifyUnsubscribeToken` signatures).

## Issues Encountered

`.env.example` and other `.env*` files are blocked from Read/Bash access by this session's sandbox permission settings (a hard deny on `.env*` paths). The plan's `<action>` said "document the var in `.env.example` if that pattern exists in the repo" — this could not be verified or edited within this session. This is not a gap in the deliverable: the plan's own `user_setup` frontmatter already documents `UNSUBSCRIBE_TOKEN_SECRET` (source, generation command, and the constraint that it must not reuse `CRON_SECRET`/`ADMIN_SECRET`) as a manual step for Joshua. Flagging so a future session with `.env.example` access can add the line if the file's existing pattern warrants it.

## User Setup Required

**External service/environment configuration required** (from this plan's frontmatter, unchanged by execution):
- Add `UNSUBSCRIBE_TOKEN_SECRET` to Vercel project env + local `.env.local`. Generate with `openssl rand -base64 48` (32+ bytes). Must NOT reuse `CRON_SECRET`/`ADMIN_SECRET`.
- Without this var set, `signUnsubscribeToken`/`verifyUnsubscribeToken` throw immediately (fail-closed by design) — Plan 04's unsubscribe route and the future Phase 8 send layer both depend on it being present before they can run.

## Next Phase Readiness
- `verifyUnsubscribeToken` is ready for Plan 04's `app/api/unsubscribe/[token]/route.ts` to call as the authenticity gate before any `writeSuppression()` call.
- `signUnsubscribeToken` is ready for the future Phase 8 send layer to mint links with — no rework needed.
- No blockers. `npx tsc --noEmit` is clean; `npx vitest run lib/unsubscribe-token.test.ts` passes 6/6.
- `UNSUBSCRIBE_TOKEN_SECRET` must be set in both local `.env.local` and Vercel before Plan 04's route can be exercised end-to-end (documented above, not a code blocker).

---
*Phase: 02-compliance-spine*
*Completed: 2026-07-20*

## Self-Check: PASSED

All created files and commit hashes verified to exist:
- `lib/unsubscribe-token.ts` — FOUND
- `lib/unsubscribe-token.test.ts` — FOUND
- `.planning/phases/02-compliance-spine/02-03-SUMMARY.md` — FOUND
- `cb1f818` — FOUND in git log
