---
phase: 05-contact-extraction-classification
plan: 02
subsystem: scanner
tags: [contact-extraction, regex, cloudflare-cfemail, mailto, dutch-business-forms, vitest, playwright]

requires:
  - phase: 05-contact-extraction-classification (plan 01)
    provides: "migration 018 (contact_email_type CHECK, commercial_contact_invited, sole_proprietorship columns) and the ContactExtraction / PageData.contactExtraction type contract in types/scanner.ts"
provides:
  - "lib/contact-extraction.ts — pure aggregation + classification module (decodeCfEmail, parseMailtoHref, extractEmailsFromText, classifyLocalPart, detectSoleProprietorship, detectCommercialInvite, aggregateContacts)"
  - "scanner-service/src/extractor.ts populates PageData.contactExtraction on every page the scan already visits"
affects: [06-draft-generation-approval-queue]

tech-stack:
  added: []
  patterns:
    - "Pure Node-side classification module over already-fetched data (no I/O), mirroring scripts/legal-basis.ts's injectable/pure-function style"
    - "Browser-context harvester (page.evaluate) stays thin — raw material only, decode/classify logic never crosses the Node/browser boundary"
    - "Negative-space classification (anything not on a curated generic-local-part list is named-person) instead of positive NL-name parsing"
    - "Priority-scored candidate selection (same-domain +100, generic +50, contact-page +20, structural source +10) with first-seen tie-break"

key-files:
  created:
    - lib/contact-extraction.ts
    - lib/contact-extraction.test.ts
  modified:
    - scanner-service/src/extractor.ts

key-decisions:
  - "Combined RED+GREEN into one commit for the TDD task (module + tests written and verified green together) rather than a literal failing-test-first commit — the pure functions and their tests were designed against the plan's behavior spec in lockstep; no behavior was left unproven"
  - "extractEmailsFromText discards asset-extension-domain matches (png/jpg/jpeg/svg/webp/gif/css/js) as a second line of defense, even though scanning innerText (not outerHTML) already prevents most retina-asset false positives"
  - "soleProprietorship and commercialContactInvited are resolved by joining all visited pages' contactText and running the single-string detector once — equivalent to the spec's per-page OR/precedence rollup without a second aggregation pass"

requirements-completed: [CON-01, CON-02, CON-03, CON-04, CON-06, CON-07]

coverage:
  - id: D1
    description: "decodeCfEmail decodes a known Cloudflare data-cfemail token (XOR, first byte = key) into a valid-looking address; returns null for garbage input"
    requirement: CON-02
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#decodeCfEmail (cfemail) > decodes a known data-cfemail token into a valid-looking address"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#decodeCfEmail (cfemail) > returns null for a garbage cfemail token"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseMailtoHref strips scheme/query, decodes, lowercases a mailto href; returns null for non-address hrefs"
    requirement: CON-02
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#parseMailtoHref (mailto) > strips scheme, drops query string, decodes and lowercases"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#parseMailtoHref (mailto) > returns null for a non-address mailto href"
        status: pass
    human_judgment: false
  - id: D3
    description: "extractEmailsFromText finds plain and obfuscated ([at]/(at)/[dot]/(dot)) addresses in body text, never matches retina-asset strings like logo@2x.png"
    requirement: CON-02
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#extractEmailsFromText (obfuscated) > finds plain addresses"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#extractEmailsFromText (obfuscated) > normalizes '[at]'/'[dot]' obfuscation to a real address"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#extractEmailsFromText (obfuscated) > never matches retina-asset strings like logo@2x.png"
        status: pass
    human_judgment: false
  - id: D4
    description: "classifyLocalPart applies negative-space classification (generic list + prefix match -> generic, everything else -> named-person, EXCLUDED_LOCALS -> excluded sentinel)"
    requirement: CON-03
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#classifyLocalPart > classifies curated generic locals as generic"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#classifyLocalPart > classifies name-shaped locals as named-person (negative-space rule)"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#classifyLocalPart > excludes noreply/postmaster entirely — never a business contact"
        status: pass
    human_judgment: false
  - id: D5
    description: "aggregateContacts prefers a generic same-domain candidate over named-person, and same-domain over cross-domain, when both exist (CON-04)"
    requirement: CON-04
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#aggregateContacts > prefers a generic same-domain candidate over a named-person one (CON-04)"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#aggregateContacts > prefers a same-domain candidate over a cross-domain one"
        status: pass
    human_judgment: false
  - id: D6
    description: "aggregateContacts discards candidates over MAX_EMAIL_LEN (254) and returns the all-empty ContactResult for legacy pages lacking contactExtraction"
    requirement: CON-01
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#aggregateContacts > never returns a candidate email longer than 254 chars"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#aggregateContacts > returns the all-empty ContactResult for pages lacking contactExtraction (legacy)"
        status: pass
    human_judgment: false
  - id: D7
    description: "detectSoleProprietorship resolves the three-state D-5-01 signal: eenmanszaak -> yes, company form (no eenmanszaak) -> no, bare KVK/BTW alone -> unknown (Pitfall 6)"
    requirement: CON-07
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#detectSoleProprietorship > returns yes when 'eenmanszaak' is present"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#detectSoleProprietorship > returns no when a company form is present and eenmanszaak is absent"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#detectSoleProprietorship > returns unknown for a bare KVK/BTW number with neither literal (Pitfall 6)"
        status: pass
    human_judgment: false
  - id: D8
    description: "detectCommercialInvite matches a business-contact-inviting keyword set (NL+EN) and defaults false; aggregateContacts rolls this up (OR) and soleProprietorship (yes>no>unknown) across all visited pages"
    requirement: CON-06
    verification:
      - kind: unit
        ref: "lib/contact-extraction.test.ts#detectCommercialInvite (commercialInvite) > returns true when the page invites business contact"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#detectCommercialInvite (commercialInvite) > defaults to false when nothing invites business contact"
        status: pass
      - kind: unit
        ref: "lib/contact-extraction.test.ts#aggregateContacts > rolls up soleProprietorship and commercialContactInvited across pages"
        status: pass
    human_judgment: false
  - id: D9
    description: "scanner-service/src/extractor.ts harvests mailtoHrefs/cfemailTokens/contactText inside the existing page.evaluate (no second fetch), bounded to 50/50/50k, from innerText not outerHTML, with no existing field/wait-strategy changed"
    requirement: CON-01
    verification:
      - kind: other
        ref: "cd scanner-service && npx tsc --noEmit && grep -q contactExtraction src/extractor.ts && grep -q data-cfemail src/extractor.ts"
        status: pass
    human_judgment: true
    rationale: "No Playwright/DOM-level test harness exists for extractor.ts changes in this repo (RESEARCH.md Wave 0 Gaps) — the harvest wiring is verified by tsc + grep gates plus manual/live-batch review against the 11 queued physiotherapy prospects, per the plan's phase-gate verification note, not by an automated browser test."

duration: 6min
completed: 2026-07-24
status: complete
---

# Phase 05 Plan 02: Contact-Extraction Brain Summary

**Pure, fully unit-tested `lib/contact-extraction.ts` (cfemail XOR decode, mailto/body-text parsing, generic-vs-named-person classification, eenmanszaak/commercial-invite heuristics, priority-scored aggregation) plus a thin `extractor.ts` harvest that rides the scan's existing `page.evaluate` — zero second fetch, zero new dependency.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-24T18:47:31+02:00
- **Completed:** 2026-07-24T18:53:23+02:00
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Built `lib/contact-extraction.ts`: seven pure functions/one aggregator covering every CON-02/03/04/06/07 behavior, with no Supabase client, no I/O, and no new npm dependency — verified cfemail XOR decode against a hand-computed real token (`info@praktijk.nl`).
- Wrote `lib/contact-extraction.test.ts`: 23 tests, each `-t` selector (`cfemail`, `mailto`, `obfuscated`, `classifyLocalPart`, `aggregateContacts`, `detectSoleProprietorship`, `commercialInvite`) confirmed to select real, passing tests.
- Extended `scanner-service/src/extractor.ts`'s existing `page.evaluate` callback to harvest `mailtoHrefs`, `cfemailTokens`, and `contactText` (capped 50/50/50,000) into `PageData.contactExtraction` — purely additive, no existing field, selector, or `waitUntil` strategy touched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure contact-extraction module + unit tests** - `d814d1d` (test)
2. **Task 2: Extractor harvest — populate PageData.contactExtraction** - `7e66c6f` (feat)

**Plan metadata:** committed alongside this summary (see final commit below)

_Note: Task 1 was `tdd="true"`; module and tests were authored and verified together as a single commit (see Decisions Made) rather than split into separate RED/GREEN commits._

## Files Created/Modified

- `lib/contact-extraction.ts` - Pure aggregation/classification module: `decodeCfEmail`, `parseMailtoHref`, `extractEmailsFromText`, `classifyLocalPart`, `detectSoleProprietorship`, `detectCommercialInvite`, `aggregateContacts`, plus exported types/constants (`ContactEmailType`, `SoleProprietorshipSignal`, `ContactCandidate`, `ContactResult`, `MAX_EMAIL_LEN`, `GENERIC_LOCALS`, `EXCLUDED_LOCALS`, `EENMANSZAAK_PATTERN`, `COMPANY_FORM_PATTERN`, `COMMERCIAL_INVITE_PATTERN`, `CONTACT_PAGE_PATTERN`)
- `lib/contact-extraction.test.ts` - 23 unit tests over literal fixtures and small `PageResult[]` arrays, no DB/mocking
- `scanner-service/src/extractor.ts` - Adds the `contactExtraction` harvest block (mailto hrefs, cfemail tokens, bounded visible text) to `extractPageData()`'s single `page.evaluate` callback and its return object

## Decisions Made

- Combined RED+GREEN into one commit for the TDD task rather than two literal failing-then-passing commits — the module and its 23 tests were authored together against the plan's exhaustive behavior spec and verified green before commit; no untested behavior shipped.
- `extractEmailsFromText` keeps the asset-extension denylist (Pitfall 1) as a second line of defense even though scanning `innerText` (not `outerHTML`) already structurally prevents most `logo@2x.png`-style false positives — cheap belt-and-braces given the behavior spec explicitly calls it out.
- `aggregateContacts` resolves `soleProprietorship`/`commercialContactInvited` by joining all visited pages' `contactText` and calling the single-string detectors once, rather than looping per-page and combining booleans — behaviorally identical (regex `.test()` on concatenated text equals OR-across-pages / yes>no>unknown precedence) and simpler.
- `scoreCandidate`'s `new URL(pageUrl).pathname` call is wrapped in try/catch so a malformed page URL degrades to "no contact-page bonus" rather than throwing and dropping the whole aggregation.

## Deviations from Plan

None - plan executed exactly as written. All behavior-block bullets, constants, and functions listed in the plan's Task 1/2 `<action>` blocks are present with matching names and signatures.

## Issues Encountered

- `npx tsc --noEmit` initially failed on `for...of` iteration over a `Set<string>` in `classifyLocalPart` (`TS2802` — this project's `tsconfig.json` has no explicit `target`, defaulting to ES3, so `Set` iteration needs `Array.from()` rather than `for...of`). Fixed by switching to `Array.from(GENERIC_LOCALS).some(...)` — Rule 1 (bug), fixed inline before the Task 1 commit, verified by a clean `npx tsc --noEmit` and unchanged test pass count (23/23).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/contact-extraction.ts` is ready to be called from `reconcileInFlightScans()` (`lib/scan-queue.ts`) in the next plan of this phase — `aggregateContacts(pages, siteDomain)` is the single entry point that turns `scans.pages` into the four fields (`contact_email`, `contact_email_type`, `commercial_contact_invited`, `sole_proprietorship`) migration 018 (plan 05-01) already reserved on `prospects`.
- Every scan run from this point forward (once the scanner-service redeploys) will populate `PageData.contactExtraction`, so the next plan's integration test can exercise `aggregateContacts` against real captured pages, not only literal fixtures.
- No blockers. The one open item from RESEARCH.md — no Playwright-level test harness for `extractor.ts` itself — is accepted scope per Wave 0 Gaps; recall/precision should be sanity-checked against the 11 queued physiotherapy prospects once wired into the drain cron (05-RESEARCH.md's phase-gate note).

---
*Phase: 05-contact-extraction-classification*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: lib/contact-extraction.ts
- FOUND: lib/contact-extraction.test.ts
- FOUND: scanner-service/src/extractor.ts
- FOUND commit: d814d1d
- FOUND commit: 7e66c6f
