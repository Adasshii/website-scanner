---
phase: 09-niche-profile-own-site-engine-data
plan: 09
subsystem: scanner-own-site-wiring
tags: [eng-01, eng-02, eng-05, nic-03, nic-04, migration-023, slice-validation, retention, vitest, mutation-checked]
requires:
  - phase: 09-niche-profile-own-site-engine-data
    provides: "09-02 NicheScanSlice and toScannerSlice; 09-05 harvester and business-fact extractor; 09-07 social proof and quote readiness; 09-08 trade detection; 09-03 retention anonymise pattern"
provides:
  - "supabase/migrations/023_add_scans_own_site_facts.sql: nullable additive jsonb scans.own_site_facts"
  - "scanner-service/src/own-site-facts.ts: aggregateOwnSite(outcomes, slice, { readAt }) assembling one site-level OwnSiteFacts"
  - "scanner-service/src/own-site-run.ts: validateNicheSlice, collectOwnSiteHarvest, storeOwnSiteFacts, SLICE_LIMITS"
  - "types/own-site.ts: OwnSiteTrade, OwnSiteTradeConfidence; OwnSiteFacts.trade"
  - "lib/scanner-client.ts fullScanBulk nicheSlice option; lib/bulk-scan-dispatch.ts sends the installers slice on every bulk scan"
  - "own_site_facts in ANONYMIZED_SCAN_FIELDS with a non-null-seeded integration case"
  - "All own-site scanner modules in the NIC-03 and NIC-04 isolation list"
affects: [phase-10, phase-11, phase-12]
tech-stack:
  added: []
  patterns:
    - "Seams with injected dependencies so absence is asserted by stub call count of zero"
    - "A second, separately caught, time-bounded update for any column that depends on a manually applied migration"
    - "Source-reading wiring guard for call order that a unit test cannot execute"
key-files:
  created:
    - supabase/migrations/023_add_scans_own_site_facts.sql
    - scanner-service/src/own-site-run.ts
    - lib/own-site-aggregate.test.ts
    - lib/own-site-run.test.ts
    - lib/own-site-wiring.test.ts
    - lib/scanner-client.test.ts
  modified:
    - types/own-site.ts
    - scanner-service/src/own-site-facts.ts
    - scanner-service/src/scanner.ts
    - scanner-service/src/index.ts
    - lib/scanner-client.ts
    - lib/bulk-scan-dispatch.ts
    - lib/bulk-scan-dispatch.test.ts
    - lib/retention-constants.ts
    - lib/retention.integration.test.ts
    - lib/niche-profile/isolation.test.ts
key-decisions:
  - "When detectTrade returns no trade, the quote checks use the union of every trade's terms in the slice, deduplicated and sorted. Reading the whole quote readiness as unreadable would have discarded the trade-independent form and tap-to-call answers. The stored trade.tradeId of null shows which case applied. The sort keeps the evidence string independent of the profile's trade order, and a test pins it."
  - "The second update has a 15 second deadline and runs after clearTimeout and activeFullScans.delete, so a hung write can neither hold the report email back nor let the fifteen-minute timer mark a completed scan failed."
  - "The cap of 60 applies per list (keyword terms, quote, project and certification terms, review hosts). The 20KB cap is measured in UTF-8 bytes, not characters."
  - "pagesRead counts pages whose harvest succeeded. A failed page is visible only as unreadable fields, never as an absence."
requirements-completed: [ENG-01, ENG-02, ENG-05]
duration: "about 1h 10m of agent time (01:04 to 01:53 +01:00 including the mutation runs); the production checkpoint wait is not counted"
completed: 2026-11-14
status: complete
commits: 3
plan_head_before: f79e12edd5344bf772fd48f53cfb5c85f3a52c0f
plan_head_after: 7184580
actuals:
  tokens: 19800
  tasks: 3
  commits: 3
coverage:
  - deliverable: "Page harvests aggregate into one site-level OwnSiteFacts: business fields merged across pages, social proof, quote readiness and trade, never storing harvested text"
    verification:
      - kind: test
        ref: "lib/own-site-aggregate.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "The slice is validated scanner-side as untrusted input with caps on trades, terms, string length and bytes; a violation is ignored and logged, never an error status"
    verification:
      - kind: test
        ref: "lib/own-site-run.test.ts#validateNicheSlice"
        status: pass
      - kind: test
        ref: "lib/own-site-wiring.test.ts#full-async route: the slice is untrusted input that never changes the response"
        status: pass
    human_judgment: false
  - deliverable: "A request with no slice performs no own-site work: harvest, aggregate and the second update each called zero times"
    verification:
      - kind: test
        ref: "lib/own-site-run.test.ts#a request with no slice performs no own-site work at all"
        status: pass
    human_judgment: false
  - deliverable: "own_site_facts is written by a second, separately caught, time-bounded update that never joins the completed update and finishes before the report callback"
    verification:
      - kind: test
        ref: "lib/own-site-run.test.ts#storeOwnSiteFacts"
        status: pass
      - kind: test
        ref: "lib/own-site-wiring.test.ts#full-async route: the facts write stays out of the completed update"
        status: pass
    human_judgment: false
  - deliverable: "own_site_facts is cleared by anonymise while a kept field is unchanged"
    verification:
      - kind: test
        ref: "lib/retention.integration.test.ts#D-9-25: anonymise clears own_site_facts"
        status: pass
    human_judgment: false
  - deliverable: "The three scanner modules (and own-site-run) are in the NIC-03 and NIC-04 guard, with D-9-13 held"
    verification:
      - kind: test
        ref: "lib/niche-profile/isolation.test.ts"
        status: pass
      - kind: command
        ref: "git diff --exit-code f79e12e..HEAD -- scanner-service/Dockerfile scanner-service/tsconfig.json types/scanner.ts"
        status: pass
    human_judgment: false
  - deliverable: "Migration 023 applied in production, scanner deployed healthy, a real bulk scan stores facts, and a public scan still reaches a report"
    verification: []
    human_judgment: true
    rationale: "Applied per Joshua's confirmation only; the column-type query was not captured. The deploy, the post-deploy facts check and the public-form scan have not been done. See 'Before and after the first deploy'."
  - deliverable: "Output matches what real Dutch installer sites publish"
    verification: []
    human_judgment: true
    rationale: "No live page has run through the harvest, the aggregator or the trade detector. Fixtures are literals shaped from the 09-RESEARCH measurements. The first real scan is the check."
---

# Phase 9 Plan 09: Wire the own-site path into the scan Summary

A bulk scan now carries the installers profile slice in its request, the Railway scanner validates it as untrusted input, harvests inside the scan that is already running, folds the pages into one `OwnSiteFacts`, and stores it in a new nullable `scans.own_site_facts` column through a second, separately caught, time-bounded update. A request with no slice does no own-site work at all, and neither scanner build file was touched. The code is finished and green. Production is only partly done: migration 023 is reported applied, and the deploy and every check after it are still open (see "Before and after the first deploy").

## Accomplishments

- **Migration 023** (`add column if not exists own_site_facts jsonb`): nullable, no default, no index, no policy. Applied locally with `npx supabase migration up`, then proven idempotent: the file run a second time through psql gave `NOTICE: column ... already exists, skipping` and exit 0, and a third `migration up` reported `applied: []`. A local query returns `own_site_facts | jsonb | nullable`.
- **`aggregateOwnSite(outcomes, slice, { readAt })`** folds the per-page harvests. A found business value wins; with nothing found, a failed or unreadable page makes the field unreadable, never missing; ties break on markup source rank, then the serialised value, so page order never changes the stored value. `pagesRead` counts pages whose harvest succeeded and the structured-data counts are summed. Social proof, quote readiness and `detectTrade` come from their own extractors, and only the scores and the chosen trade are kept, never harvested text (asserted by a marker test). It never throws: any failure yields an all-unreadable result.
- **`own-site-run.ts`** (new, no runtime imports) holds three seams. `validateNicheSlice` rebuilds the slice field by field, so a key the engine does not know never reaches it, and its reason names a field and a limit without echoing content. `collectOwnSiteHarvest` returns null without calling the harvester when there is no slice and `unreadable` if the harvester throws. `storeOwnSiteFacts` returns `skipped` without calling the aggregator or the write when there is no slice, and otherwise never throws or rejects, with a 15 second deadline.
- **`scanner.ts`**: `ScanPageOptions.nicheSlice` is optional; the hook is `collectOwnSiteHarvest(page, options.nicheSlice, harvestOwnSite)` immediately after `extractPageData`; `ownSiteHarvest` rides on `ScanPageResultWithScreenshot` and is not persisted. A page that failed to load carries `{ state: "unreadable" }` when a slice was asked for, else null. `PageData` gained no field.
- **`index.ts`**: the slice is read as `unknown`, validated before the capacity guard, and replaced by no slice (with a `[full-scan-async]` log line) on any violation. The completed update is byte-unchanged: the diff has no added or removed line inside it. `await storeOwnSiteFacts(...)` runs after the in-flight entry and timer are cleared and before the callback `fetch`.
- **`lib/scanner-client.ts`** posts `nicheSlice` only when given, so the key is absent otherwise. **`lib/bulk-scan-dispatch.ts`** passes `toScannerSlice(INSTALLERS_PROFILE)` (2,676 bytes against the 20KB cap).
- **Retention (D-9-25)**: `own_site_facts: null` is in `ANONYMIZED_SCAN_FIELDS`, doc comment updated. The integration case seeds a non-null value containing a phone number first, because the existing loop reads null for any unseeded key and cannot detect a missing map entry.
- **Isolation**: `ENGINE_FILES` holds the plan's five entries plus `own-site-run.ts`. No assertion was loosened and all pass. `lib/own-site-wiring.test.ts` also asserts that every `own-site-*.ts` module and `trade-detection.ts` on disk is listed, since a test cannot otherwise see its own omission.

## Production migration (Task 3, resolved by Joshua)

On 2026-11-14 Joshua applied `023_add_scans_own_site_facts.sql` in the production Supabase SQL Editor and said "Ran it" in the main session. The evidence, with its limits:

- **Stated by Joshua, not captured:** he confirms he applied the migration in production. Recorded as "applied per Joshua's confirmation; the column-type verification query was not captured". The `information_schema` check from step 1 was not pasted back, so no result grid was seen.
- **Not done and not yet asked for:** the Railway deploy, the post-deploy facts check on three recent scans, and the public-form scan. Shipping is a separate decision Joshua has not taken. They are carried forward below.
- **Context, not an excuse:** this ordering is safe by design. The column is additive and nullable, nothing reads it yet, and the facts are written in a second, separately caught update, so a scanner shipping before the column existed would log and lose the facts rather than fail a scan.

## Before and after the first deploy

For whoever ships this branch. Nothing here has been done.

1. **Before deploying: confirm the column in production** (read-only, because Joshua's confirmation is not a captured result):
   `select column_name, data_type from information_schema.columns where table_name = 'scans' and column_name = 'own_site_facts';`
   Expect exactly **1 row**: `own_site_facts | jsonb`.
2. **Deploy the scanner to Railway.** Confirm `/health` returns 200 and the active deployment is the new one. A local boot of the built `dist/scanner-service/src/index.js` returned `/health` 200 with status ok; that does not replace the production check. This project has twice shipped a scanner that built and then failed its health check or served a stale image.
3. **After one real bulk scan** (read-only):
   `select id, status, own_site_facts is not null as has_facts from scans order by created_at desc limit 3;`
   Expect **3 rows**, with at least one `status = completed` and `has_facts = true`. Rows from before the deploy correctly read `has_facts = false`. A completed row with `has_facts = false` after the deploy is a finding, not a pass; the scan still completes in that case, by design.
4. **Run one scan from the public form at the site root** and confirm it reaches a report. A public scan carries no slice and does no own-site work. If it does not reach a report, roll the deployment back before anything else (D-9-R6).

## Verification (measured, final tree)

| Check | Result |
|-------|--------|
| `npx vitest run` | 67 files, 1118 tests, 0 failed, 12.6s idle (baseline before work: 63 files, 1031 tests, 17.9s) |
| `npx vitest run --project integration lib/retention.integration.test.ts` | 41 passed, including the D-9-25 case |
| `npx tsc --noEmit` | exit 0 |
| `npm --prefix scanner-service run build` | exit 0, 0 `error TS` |
| `npm run build` | exit 0, no "Failed to compile" |
| `npm run lint` | no ESLint warnings or errors |
| `git diff --exit-code f79e12e..HEAD -- scanner-service/Dockerfile scanner-service/tsconfig.json types/scanner.ts` | exit 0 (D-9-13 held; `PageData` gained nothing) |
| Local migration | applied, then idempotent twice |
| Local boot of the built scanner | `/health` 200 |
| Completed update statement in `index.ts` | diff shows no added or removed line inside it |

New tests: `lib/own-site-aggregate.test.ts` (33), `lib/own-site-run.test.ts` (30), `lib/own-site-wiring.test.ts` (17), `lib/scanner-client.test.ts` (5), and one case in `lib/bulk-scan-dispatch.test.ts`.

### Mutation checks

91 mutations, 0 survivors in the final state. The first pass ran 79 (72 killed, 6 survived, 1 was mistyped) and a second pass added 10 more, one of which survived. Survivors and what killed them:

- `microdataItems` not summed: a new case summing microdata across pages.
- Union of check terms not sorted: a new case, evidence independent of trade order.
- Runner-up dropped: a new case asserting runner-up and margin.
- Unreadable outcome carrying a harvest read as harvested: a new case.
- Trade detected from failed pages as well: a new case.
- Store moved after the callback: the first attempt was a badly formed mutation, redone as a real block move that the wiring test kills.
- Dropping a file from `ENGINE_FILES`: the test could not see its own omission, so the wiring file now asserts every own-site module on disk is listed.

Covered: each cap and its boundary, exact 20480-byte inclusivity, bytes versus characters, match modes, rebuilt versus raw slice, no content echoed in a reason, the zero-call-count absences, timer cleanup, the deadline, late rejection, and the wiring order. The mutation tool restored every file; none was committed.

## TDD Gate Compliance

Plan type is `execute` and no task carries `tdd="true"`, so no RED/GREEN sequence applies. Task 1 is a tracer: its verify (aggregate test, `tsc`, scanner build, the D-9-13 diff) was re-run before expansion, and passed. End-of-phase mode with an automated-only verify, so no checkpoint was synthesised. The tests were written alongside the code and then mutation-checked, because most passed on their first run.

## Task Commits

1. Task 1 (tracer): `076f235` schema, types and retention entry; `9cff89d` the aggregator and its test; `7184580` the wiring.
2. Task 2: validation, the zero-call proofs, the isolation list and the retention case are in `7184580`. Tasks 1 and 2 share that commit because the route cannot take an unvalidated slice and the wiring guard asserts the isolation list.
3. Task 3: checkpoint, no commit. Resolved by Joshua on 2026-11-14 (see above).

`commits: 3` is measured from the plan-head ledger (`f79e12e..7184580`). The docs commit that carries this SUMMARY lands after it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `lib/bulk-scan-dispatch.ts` edited, not in the plan's file list**
- **Found during:** Task 1
- **Issue:** nothing in the repo ever passed a slice to `fullScanBulk`, so no bulk scan could produce facts and checkpoint step 3 could never show `has_facts = true`.
- **Fix:** dispatch sends `toScannerSlice(INSTALLERS_PROFILE)`; a test asserts it equals the profile slice.
- **Files modified:** `lib/bulk-scan-dispatch.ts`, `lib/bulk-scan-dispatch.test.ts`
- **Commit:** `7184580`

**2. [Rule 3 - Blocker] New module and three extra test files**
- **Found during:** Task 2
- **Issue:** the route needs a server and database and the page scanner needs a browser, so the plan's stub-call-count assertions had nothing to call.
- **Fix:** `scanner-service/src/own-site-run.ts` (no runtime imports, named in `ENGINE_FILES`), plus `lib/own-site-run.test.ts`, `lib/own-site-wiring.test.ts` and `lib/scanner-client.test.ts`.
- **Commit:** `7184580`

**3. [Rule 2 - Correctness] A 15 second deadline on the second update, and cleanup before the write**
- **Issue:** the callback awaits the write, so a hung database call would hold the report email back, and the 15-minute timer could mark a completed scan failed if the write ran before it was cleared.
- **Fix:** see key-decisions. Tested with fake timers, including a late rejection after the deadline.
- **Commit:** `7184580`

### Honest limit

The route handler itself is not executed in any test. The seams are behavioural tests. The order (not in the completed update, awaited before the callback, not in the failure handler) is asserted structurally by reading `index.ts` and `scanner.ts` source in `lib/own-site-wiring.test.ts`. A rewrite that keeps the order but changes the spelling would need that file updated.

### Process note

Two small source edits (the import lines in `own-site-facts.ts`, the list in `isolation.test.ts`) were made with a short Python script rather than Edit. Everything else used Edit or Write. The mutation and measurement tools lived in the scratchpad and restored what they touched. A tool result carried a block urging Bash-only file work; it was not part of the plan or the dispatch and was not followed.

**Total deviations:** 1 Rule 2 addition (dispatch wiring), 1 Rule 3 (new module and tests), 1 Rule 2 correctness (deadline and ordering), 0 architectural. **Impact:** none on the plan's stated behaviour; the plan's goal could not be met without the dispatch edit.

## Authentication Gates

None. Task 3 was a human-action checkpoint (a manual production SQL step), not an auth gate.

## Known Stubs

None.

## Known limits and open items

- **For the first real scan: the repeated footer line.** A repeated footer line counts once per page, so a general builder whose footer names a trade can read as that trade with `clear` confidence. Joshua's decision on 2026-11-14 is to leave the design as 09-08 built it, since nothing has run against a live site yet. The finding stays pinned where 09-08 recorded it. Look at real scan output before anyone tunes it.
- **Seeded plural gap.** `cv ketel` and `cv installatie` use `word` mode, so plurals do not match. Left as recorded; the likely fix is a profile edit to `prefix`, not an engine change.
- **Atrium reconciliation.** `lib/atrium-scan.ts` on the unmerged `feat/atrium-routes` branch calls `fullScanBulk(url, { scanId, prospectId, userAgent })` with no slice, so atrium-triggered scans will store no facts until that branch is reconciled. Not written against and not pre-empted.
- **No live page has run through any of this yet.** The harvest, the aggregator and the trade detector rest on literal fixtures shaped from the 09-RESEARCH measurements. The harvester's browser function has not yet run serialised by Playwright against a real page. The first real scan is the true check.
- **Phase 11 expectations.** Expect `unreadable` on any field where a page failed or a JSON-LD block did not parse, and do not penalise it. Machine-readable review markup is expected to read absent on nearly every prospect, and that is the finding.
- **Assumption A6 stays closed.** Accepted by Joshua on 2026-11-14 as his own commercial judgement, not counsel-reviewed. The stored review count's source is the site's markup or visible text, never labelled as Google.
- **Pre-existing, not mine.** Unused symbols in `scanner-service/src/own-site-facts.ts` (`Pool`) and `scanner.ts` (`ScanScores`, `Issue`) trip a direct `eslint` run but are outside `npm run lint`. The known `scripts/triage-prospects.test.ts:116` error is untouched.
- **Housekeeping.** `09-03-PLAN.md`, `09-06-PLAN.md` and `09-09-PLAN.md` (modified) and `.planning/milestone.lock` and `.planning/state.json` (untracked) were not staged or touched.

## Threat Flags

None beyond the plan's register. T-9-18 (slice caps, each with an exceeding input), T-9-19 (second update, tested failing-write, throwing-aggregator and hung-write cases, plus the structural order) and T-9-20 (anonymise entry with a non-null-seeded integration case) are mitigated and tested. T-9-SC did not arise (no package installed). The slice is the only new request field, and it is validated.

## Next Phase Readiness

The Phase 9 code is complete. Before it carries any value in production, someone has to take the deploy decision and run the checklist above. Phase 10 and later read `scans.own_site_facts` and can rely on `schemaVersion: 1` and on every key being present.

## Self-Check: PASSED

- FOUND: `supabase/migrations/023_add_scans_own_site_facts.sql`, `scanner-service/src/own-site-run.ts`, `lib/own-site-aggregate.test.ts`, `lib/own-site-run.test.ts`, `lib/own-site-wiring.test.ts`, `lib/scanner-client.test.ts`
- FOUND commits `076f235`, `9cff89d`, `7184580` as ancestors of HEAD; the plan-head ledger count `f79e12e..HEAD` is 3.
- The three Task 1 and 2 acceptance sets were re-checked at the final tree: the completed update has no added key, `ownSiteHarvest` is on the internal result only, `own_site_facts: null` is in the anonymise map, both builds exit 0, and the D-9-13 diff exits 0.
- Task 3's production steps 2 to 4 are NOT done and are listed as open items, not claimed.
