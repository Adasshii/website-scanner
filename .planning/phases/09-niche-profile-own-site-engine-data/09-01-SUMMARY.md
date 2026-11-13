---
phase: 09-niche-profile-own-site-engine-data
plan: 01
subsystem: testing
tags: [eng-07, google-maps-terms, static-guard, vitest, supabase-local]
requires: []
provides:
  - "ENG-07 enforcement test: a Google Places field name in a write path or schema column fails the build"
  - "toStorableGooglePlace runtime allowlist (place_id only) for Phase 12's single Google client"
  - "Wave 0 baseline recorded green: 629 tests, tsc, lint, scanner build; local Supabase at migration 020"
affects: [09-02, 09-03, 09-04, 09-05, 09-06, 09-07, 09-08, 09-09, phase-12]
tech-stack:
  added: []
  patterns:
    - "Third member of the source-assertion test family (after lib/outreach-isolation.test.ts and the retention-table allowlist)"
    - "Roots-exist assertion runs first so a renamed root fails loudly instead of scanning nothing"
    - "Both-direction canaries so a detector that flags everything or nothing cannot pass"
key-files:
  created:
    - lib/google-content-guard.ts
    - lib/google-content-guard.test.ts
  modified: []
key-decisions:
  - "Ban list carries distinctive Places names and Google endpoint tokens only; name, address, rating, reviews, latitude, longitude and displayName stay legal as free-standing source tokens"
  - "Column ban list does include the bare names rating, reviews, google_rating, place_rating, matched as whole identifiers, because a prospects column named rating would be Google-derived data"
  - "Endpoint allowlist (ALLOWED_GOOGLE_CLIENT_FILES) is empty today; Phase 12 adds exactly one entry"
requirements-completed: [ENG-07]
duration: "about 1 h across two dispatches (first dispatch halted before its first commit on the protected-branch assertion)"
completed: 2026-11-13
status: complete
actuals:
  tokens: 3981
  tasks: 3
  commits: 2
plan_head_before: 1516ebe8db95605e4dd548c3bf12fec549f4bb5a
plan_head_after: 5692c246f9e2b9794a5016f7759fc35b945a6a4e
---

# Phase 9 Plan 01: Google content guard Summary

ENG-07 is now enforced by a failing build: a static test fails if any field Google Places returns is named in source under five roots or declared as a column in any migration or `schema.sql`, and `toStorableGooglePlace` keeps only `place_id` at runtime.

## Accomplishments

- `lib/google-content-guard.ts`: constants (`GOOGLE_STORABLE_FIELDS`, `GOOGLE_BANNED_FIELD_TOKENS`, `GOOGLE_BANNED_COLUMN_TOKENS`, `GOOGLE_ENDPOINT_TOKENS`, `ALLOWED_GOOGLE_CLIENT_FILES`, `GUARDED_SOURCE_ROOTS`), the detectors `findGoogleFieldViolations` and `findGoogleColumnViolations`, and `toStorableGooglePlace`, which builds its result field by field and never spreads the raw object (T-9-01).
- `lib/google-content-guard.test.ts`: roots-exist first (T-9-02), banned field tokens over `lib`, `app`, `scanner-service/src`, `scripts`, `types`, endpoint allowlist, migration plus `schema.sql` column assertion, six canaries covering both directions for each detector, and the runtime allowlist assertion. 12 cases, all green.
- Toolchain verified installed from lockfiles (no package added), local Supabase confirmed up at migration 020, Wave 0 baseline recorded below.

## Wave 0 baseline (measured on this branch after Tasks 1 and 2)

| Check | Result |
|-------|--------|
| `npx vitest run` | exit 0, 56 files, 629 tests passed, 0 failed |
| `npx tsc --noEmit` | exit 0, 0 `error TS` lines |
| `npm run lint` | exit 0, "No ESLint warnings or errors" |
| `npm --prefix scanner-service run build` | exit 0, 0 `error TS` lines |

Local Supabase: API `http://127.0.0.1:54321` answers 200 (`supabase status` reports it). `supabase migration up` returned `applied: []`; `migration list` shows 001 to 020 on both sides. No reset was run. The stack was already running from earlier in the day, so `supabase start --ignore-health-check` was a no-op.

## Task 3 human-check evidence: throwaway canary

- Created `lib/zz-google-canary.ts` carrying the banned token `formattedAddress` (as a string constant and as an object key).
- Command: `npx vitest run --project unit lib/google-content-guard.test.ts`
- Result: exit 1, `Tests 1 failed | 11 passed (12)`. Failure message:
  `AssertionError: lib/zz-google-canary.ts names a Google Places field: formattedAddress: export const ZZ_GOOGLE_CANARY = "formattedAddress";`
  raised in the case "no source file under the guarded roots names a field Google returns".
- Deleted the file. `git status --porcelain lib/zz-google-canary.ts` prints nothing and `git status --short` shows no trace. The same command then returned 12/12 green.
- The file was never committed, as the plan requires.

## Task Commits

1. Task 1 (tracer): `8256162` feat(09-01): ENG-07 Google content guard tracer (test, module, runtime allowlist)
2. Task 2: `5692c24` feat(09-01): widen Google guard to five roots, endpoint allowlist and SQL schema
3. Task 3: no commit. It produces no committed file by design (throwaway canary, local DB state, baseline measurement); its evidence is this SUMMARY.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `matchAll` over an ES5 target**
- **Found during:** Task 1 (previous dispatch)
- **Issue:** `TS2802`, because the tsconfig target is ES5 and `RegExp.matchAll` is not iterable there.
- **Fix:** wrapped each `matchAll` call in `Array.from(...)`.
- **Files modified:** `lib/google-content-guard.ts`
- **Commit:** `8256162`

### Additions beyond the declared exports

**2. [Plan addition] `findGoogleEndpointViolations` exported**
- Added deliberately so Task 2's endpoint-allowlist assertion reuses the same comment-stripping as the field detector instead of duplicating it. It is used by the test and covered by two canaries. The plan's declared exports are all present; this one is extra.

**3. [Sequencing] Task 1's commit already contained Task 2's module surface**
- The previous dispatch wrote the full module (column detector, `GOOGLE_BANNED_COLUMN_TOKENS`, `ALLOWED_GOOGLE_CLIENT_FILES`, endpoint detector) before the first commit, so commit `8256162` carries more module code than the tracer strictly needed. Task 1's test file in that commit held only the three tracer cases; Task 2's commit added the remaining test groups. Behaviour is unaffected; only commit granularity differs from the plan's intent.

### Process notes (not deviations in code)

- The first dispatch halted before any commit because the pre-commit assertion refused `main`. This dispatch ran on `gsd/phase-09-niche-profile`; the assertion passed with no config change.
- `npx supabase status` prints the local stack's well-known demo keys (publishable, secret, JWT, anon, service role, S3) as one JSON line, and that output reached the transcript. These are the fixed Supabase local-dev defaults, not project credentials, so no rotation applies. Use `grep` for `API_URL` only on later plans (`.claude/rules/secrets.md`).

**Total deviations:** 1 auto-fixed (Rule 3), 2 additions, 0 architectural. **Impact:** none on behaviour; one commit-granularity difference recorded for honesty.

## Authentication Gates

None.

## Known Stubs

None. `ALLOWED_GOOGLE_CLIENT_FILES` is empty on purpose (no Google call exists in this phase); Phase 12 adds exactly one entry.

## Residual gap (carried from the plan, unchanged)

A future write inside the one allowlisted file that spreads a raw Google response object is not caught by any static token ban. Controls: assertion (c) confines the Google call to one file, and `toStorableGooglePlace` is the runtime allowlist that file must call.

## Threat Flags

None. No new endpoint, auth path or schema change; the plan adds a test and a pure helper.

## Next Phase Readiness

Baseline is green and attributable. Ready for 09-02.

## Self-Check: PASSED

- FOUND: `lib/google-content-guard.ts`, `lib/google-content-guard.test.ts`
- FOUND commits `8256162`, `5692c24` (both ancestors of HEAD, 2 measured via the plan-head ledger)
- Acceptance re-run: roots-exist, field, endpoint and schema assertions pass; canaries pass both directions; `ALLOWED_GOOGLE_CLIENT_FILES` is `[]`; `lib/zz-google-canary.ts` absent.
