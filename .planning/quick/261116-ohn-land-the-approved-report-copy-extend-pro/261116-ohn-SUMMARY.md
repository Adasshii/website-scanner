---
phase: quick
plan: 261116-ohn
subsystem: niche-profile
tags: [report-copy, ProfileCopy, installers, T-9-03]
requires: []
provides:
  - docs/report-copy.md as the approved, in-repo source of the report copy
  - ProfileCopy with one typed field per report section, both locales filled
affects: [phase-12-report]
tech-stack:
  added: []
  patterns: [required-keys-on-typed-interface, ts-expect-error negative test, key-set intersection gate]
key-files:
  created: [docs/report-copy.md]
  modified:
    - lib/niche-profile/types.ts
    - lib/niche-profile/installers/copy.ts
    - lib/niche-profile/profile.test.ts
decisions:
  - "Locale-asymmetric placeholders transcribed as the document writes them: NL {bedrijf}/{plaats}, EN {business}/{city}"
  - "tips ships empty in both locales by decision (D-9-24 precedent), not by omission"
  - "The file's bytes win for the five pre-existing values, including the English tap-to-call hyphenation"
status: complete
commits: 3
plan_head_before: dd24b892e5822f70009d67b202218f5f95ceb476
plan_head_after: 303092a09e960edb35882b8330419a5f4512263b
actuals:
  tokens: 34000
  tasks: 3
  commits: 3
completed: 2026-11-16
---

# Phase quick Plan 261116-ohn: Land the approved report copy Summary

The approved 2026-11-16 report copy now lives in the repo as `docs/report-copy.md` and as a typed, bilingual `ProfileCopy` with one field per report section; a missing social-proof state or a missing fifth fix line is a build error.

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 | c43073d | docs(quick-261116-ohn): land the approved prospect-report copy |
| 2 | cbbbdba | feat(quick-261116-ohn): type the four social-proof states on ProfileCopy |
| 3 | 303092a | feat(quick-261116-ohn): carry every approved report section in ProfileCopy |

All three on `gsd/phase-09-niche-profile`, from base `dd24b89`. Not pushed.

## Final ProfileCopy field list

`header` (eyebrow, heading, scoreLine, intro), `whyYouGotThis` (heading, body: readonly two-string tuple), `businessFacts` (heading, frame, foundLabel, notFoundLabel), `socialProof` (heading, frame, noneHereOthersDo, noneHereNoneThere, visibleNotReadable, visibleAndReadable), `competitors` (heading, frame, standing), `websiteOnPhone` (heading, frame, loadTimeLine, citationLine), `quoteRequest` (heading, frame, checklist: quoteForm, clickToCall, projectPhotos, certifications), `aiVisibility` (heading, frame, perQuestionLine, othersNamedLine), `moneyLine` (line, provenance, followUp), `todo` (heading, ordering), `ask` (heading, body, buttonLabel), `footer` (provenance, optOut, optOutLinkLabel, article14), `adashiFixes` (businessFacts, socialProof, websiteOnPhone, quoteRequest, aiVisibility; five required keys via the `AdashiFixSection` union), `tips` (partial record over the same union, empty).

Twelve section fields plus `adashiFixes` and `tips`. Nothing optional except the `tips` record's keys.

## Things Phase 12 must handle

- **Locale-asymmetric placeholders.** Dutch uses `{bedrijf}` and `{plaats}`; English uses `{business}` and `{city}`. Transcribed as the document gives them and not normalised. Phase 12 fills placeholders per locale, or normalises them as part of its reshape. The placeholder-set test pins both sets literally, so a normalisation there must update the test on purpose.
- **Hyphenation call.** `adashiFixes.quoteRequest` in English keeps `tap-to-call` as it stood in `copy.ts`. The document writes `tap to call`. The file's bytes won, per the plan. The English quote-request checklist label from the document ("Tap to call number") is unhyphenated, as the document has it. The two English phrasings therefore differ in hyphenation by design of the plan, not by accident.
- **Phase 12 owns the report** and is expected to reshape these fields. The names follow the document's section order so the mapping stays readable.
- **Article 14 slot.** `footer.article14` renders as a label plus `{counsel_wording}`. Phase 12 must not print an empty slot; that is a render-time decision it owns.
- **Money line.** `MoneyLineCopy` carries no heading and no price. Whether it prints is the trade's `showMoneyLine`, not the copy's.

## The two gaps still open

1. **The five to-do item texts.** The document gives the heading and the ordering line only. `tips` ships as `{}` in both locales, empty by decision (D-9-10 asks for the field, D-9-24 is the precedent for honest emptiness). Phase 12, or a copy pass before it, writes them with Joshua.
2. **Counsel's Article 14 wording.** No legal sentence exists. The field keeps `{counsel_wording}` and nothing else. Counsel closes this.

## T-9-03: the scan request is unchanged

- `lib/niche-profile/index.ts`, `types/niche-scan-slice.ts`, `lib/bulk-scan-dispatch.test.ts` and `lib/niche-profile/isolation.test.ts`: `git diff --exit-code` clean after every task, and `git diff --stat dd24b89 HEAD` over those four paths is empty.
- `lib/bulk-scan-dispatch.test.ts` (16 tests, asserts the sent slice equals `toScannerSlice(INSTALLERS_PROFILE)`) passes unedited. `lib/niche-profile/isolation.test.ts` (12 tests) passes unedited.
- New gate in `profile.test.ts`: the key set of the serialised slice and the key set of each locale's `ProfileCopy` do not intersect. The existing banned-token assertions are kept as a second net.

## Negative type test, both directions

The `@ts-expect-error` test on a `ProfileCopy["socialProof"]` literal missing `visibleAndReadable`:

- Directive removed: `tsc` fails with TS2741 "Property 'visibleAndReadable' is missing in type ... but required in type 'SocialProofCopy'". A missing state is a build error.
- Missing state added back with the directive kept: `tsc` fails with TS2578 "Unused '@ts-expect-error' directive". Loosening the type cannot rot silently.
- Restored: `tsc --noEmit` clean.

## Verification

- `profile.test.ts` 46 passed, `isolation.test.ts` 12 passed, `bulk-scan-dispatch.test.ts` 16 passed. Full suite not run, by instruction.
- `npx tsc --noEmit` clean. `npx eslint` clean on the three touched files.
- Plan grep gates all pass. No em-dash in any added line.
- Pre-existing bytes: the twelve values that predate the document (two money lines, two social-proof first states, and eight fix lines, four per locale) are byte-identical to `dd24b89`; the `copy.ts` diff removes only comments and the old flat fields.

## Deviations from Plan

**1. [Rule 3 - Blocking] Executed in a separate worktree, by the orchestrator's instruction.** The shared checkout had been switched to `fix/footer-boilerplate` by another session, which was also mid-edit on `scanner-service/src/trade-detection.ts`. Work ran at `/Users/annan/Developer/Claude code/projects/website-scanner-copy` on `gsd/phase-09-niche-profile`. The destination branch is unchanged.

**2. [Rule 3 - Blocking] Dependencies installed in the worktree.** `node_modules` was absent in the new worktree, so `npm ci` ran at the root and in `scanner-service/` from the existing lockfiles, with no new package names. Both directories are gitignored. Without the second, `tsc` reported two unrelated missing-`playwright` errors in `scanner-service/src`.

**3. SUMMARY location.** Written inside the worktree's copy of the quick directory, not the main checkout, because the orchestrator forbade touching the main checkout. It needs moving or copying to `.planning/quick/261116-ohn-land-the-approved-report-copy-extend-pro/` in the main checkout. STATE.md and ROADMAP.md were not touched, and no docs artifact was committed.

## Known Stubs

None. `tips: {}` is intentional and named above; it is a typed empty field, not a stub wired to the UI.

## Threat Flags

None. No new endpoint, input, stored field or dependency.

## Self-Check: PASSED

- docs/report-copy.md, types.ts, copy.ts, profile.test.ts: present.
- c43073d, cbbbdba, 303092a: ancestors of HEAD.
- `git rev-list --count dd24b89..HEAD` = 3, matches `commits: 3`.
