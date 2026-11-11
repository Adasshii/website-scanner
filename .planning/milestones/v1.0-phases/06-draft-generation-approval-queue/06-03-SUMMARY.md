---
phase: 06-draft-generation-approval-queue
plan: 03
subsystem: api
tags: [gemini, prompt-engineering, gdpr, i18n, vitest]

requires:
  - phase: 06-draft-generation-approval-queue
    provides: "computeVerdict()/getWeakestCategory() from lib/scoring.ts (06-01), imported here as the DraftPromptInput.verdict source"
provides:
  - "lib/draft-metric-selector.ts — selectCitableMetric(): the code-chosen DRA-02 evidence number"
  - "lib/draft-prompt.ts — buildDraftPrompt/buildDraftSubject/appendArticle14Notice/localeForCountry: the versioned D-6-10 pitch file"
affects: [06-04-draft-generator, 06-05-scan-complete-hook]

tech-stack:
  added: []
  patterns:
    - "Pure fixture-tested modules (lib/contact-extraction.ts style): no Supabase client, no fetch, no process.env — grep-gated in acceptance criteria"
    - "Locale literal maps (en/nl) keyed by branch, not next-intl, for a two-output lookup"

key-files:
  created:
    - lib/draft-metric-selector.ts
    - lib/draft-metric-selector.test.ts
    - lib/draft-prompt.ts
    - lib/draft-prompt.test.ts
  modified: []

key-decisions:
  - "selectCitableMetric only compares category scores actually present (security/design are optional per types/scanner.ts) rather than defaulting an absent score to 0, which would falsely flag legacy scans as their own worst category"
  - "TONE_BRIEF duplicates the banned-word list from scanner-service/src/ai.ts's VOICE_DIRECTIVE as a literal (VOICE_DIRECTIVE is not exported and lives in a separate deployable), rather than reaching across the Vercel/Railway boundary"
  - "CONTROLLER_CONTACT_EMAIL duplicates lib/email.ts's FROM_EMAIL default as a literal for the same reason, and because this module must stay a pure function of its inputs with zero process.env reads"
  - "Both Article 14 notices point the reader at the controller contact address rather than a hosted LIA/privacy URL — no such URL exists yet (open Phase 8 dependency, noted in lib/draft-prompt.ts's header comment)"

patterns-established:
  - "D-6-10 versioned prompt file: tone brief + DRA-04 guardrails + legal notice text live in one file so git history is the pitch's record"

requirements-completed: [DRA-02, DRA-04, DRA-05]

coverage:
  - id: D1
    description: "selectCitableMetric() picks LCP (>=2500ms, locale-formatted), else critical issue count, else lowest present category score, else null"
    requirement: "DRA-02"
    verification:
      - kind: unit
        ref: "lib/draft-metric-selector.test.ts#selectCitableMetric"
        status: pass
    human_judgment: false
  - id: D2
    description: "TONE_BRIEF encodes the DRA-04 helpful-not-insulting guardrails (no judgment of the business, no threat framing, word-count/style limits, banned-word list)"
    requirement: "DRA-04"
    verification: []
    human_judgment: true
    rationale: "Tone quality is a subjective judgment that unit tests cannot verify beyond string presence; Joshua reads the first real drafts before trusting the pattern, per 06-CONTEXT.md Pitfall 5 note"
  - id: D3
    description: "ARTICLE_14_NOTICE_EN/NL cover all eight LIA-v1 Sec4 elements and are appended by code (appendArticle14Notice), never requested from the model or paraphrasable by it"
    requirement: "DRA-05"
    verification:
      - kind: unit
        ref: "lib/draft-prompt.test.ts#ARTICLE_14_NOTICE_EN / ARTICLE_14_NOTICE_NL"
        status: pass
      - kind: unit
        ref: "lib/draft-prompt.test.ts#appendArticle14Notice"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-28
status: complete
---

# Phase 6 Plan 3: Draft Prompt & Citable-Metric Selector Summary

**Two pure, fully-unit-tested modules: `selectCitableMetric()` picks a real number from a scan's own scores/summary/CWV data, and `lib/draft-prompt.ts` composes the cold-outreach prompt with a code-appended, bilingual Article 14 notice the model never sees or writes.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-28T09:13:07Z
- **Completed:** 2026-07-28T09:21:16Z
- **Tasks:** 2 completed
- **Files modified:** 4 (all new)

## Accomplishments
- `lib/draft-metric-selector.ts` deterministically picks the DRA-02 evidence number in priority order (degraded LCP > critical issue count > lowest category score > null), with locale-correct decimal formatting via `Intl.NumberFormat`
- `lib/draft-prompt.ts` is the single versioned file holding the D-6-10 tone brief, the D-6-09 country-locale map, and both bilingual, LIA-v1-derived Article 14 notices (D-6-12/DRA-05)
- `buildDraftPrompt()` requires the model to reproduce `metric.displayValue` verbatim and explicitly forbids the model from writing its own legal/privacy text, closing off the T-06-A14/T-06-PI threat paths at the prompt level

## Task Commits

Each task followed RED -> GREEN (TDD):

1. **Task 1: Citable-metric selector**
   - `a46954b` test(06-03): add failing test for citable-metric selector
   - `af0d564` feat(06-03): add code-side citable-metric selector
2. **Task 2: Versioned prompt file**
   - `8dc26ec` test(06-03): add failing test for the versioned draft-prompt file
   - `2b6a2a6` feat(06-03): add versioned draft-prompt file

**Plan metadata:** (this commit) docs(06-03): complete plan

_Both tasks used the plan's exact TDD flow: RED confirmed via `Cannot find package` module-resolution failure, then GREEN confirmed via a full passing `npx vitest run`._

## Files Created/Modified
- `lib/draft-metric-selector.ts` - `CitableMetric` type + `selectCitableMetric()`, pure priority-ordered selector
- `lib/draft-metric-selector.test.ts` - 8 tests covering all four branches, locale formatting, purity, and null-on-no-scores
- `lib/draft-prompt.ts` - `COUNTRY_LOCALE_MAP`, `localeForCountry()`, `TONE_BRIEF`, `ARTICLE_14_NOTICE_EN/NL`, `appendArticle14Notice()`, `buildDraftPrompt()`, `buildDraftSubject()`
- `lib/draft-prompt.test.ts` - 13 tests covering locale mapping, both notices' required elements, idempotent append, prompt composition/ordering, notice non-leakage, and subject templating

## Decisions Made
- Category-score fallback only compares categories actually present in `ScanScores` (security/design are optional per `types/scanner.ts`) instead of defaulting an absent value to 0 — defaulting to 0 would make a legacy scan's absent security/design score always "win" as the fake worst category
- `TONE_BRIEF`'s banned-word list is a literal copy of `scanner-service/src/ai.ts`'s `VOICE_DIRECTIVE` list, not an import — that constant isn't exported and lives in the separate Railway deployable, so copying keeps `lib/draft-prompt.ts` a zero-dependency pure module while staying wording-consistent with the existing brand voice
- The Article 14 notices reference the controller contact address (mirroring `lib/email.ts`'s `FROM_EMAIL` default, duplicated as a literal since that module reads `process.env` and isn't exported) rather than a hosted LIA/privacy URL — no such URL exists in this app yet; this is an explicit open Phase 8 dependency, recorded in the module's header comment

## Deviations from Plan

None - plan executed exactly as written. Both tasks' behavior specs, artifact lists, and acceptance-criteria grep gates were implemented and verified as specified.

### Post-Completion Revision (2026-07-28)

After this plan shipped, Joshua reviewed the first real generated drafts and judged the pitch weak. The problem was the prompt itself, not the plumbing around it: `TONE_BRIEF` was prohibition-heavy (a banned-word list and a rough word ceiling) with no stated goal for the email, no worked example of what a good one looks like, and no explained business consequence for the reader (why should they care that their site is slow?). A model given only "don't do X, Y, Z" has no positive target to aim at, so it drifted into a generic, listy pitch.

Two follow-up changes, executed TDD (RED then GREEN), amend this plan directly rather than opening a new one, since both touch the exact files this plan created:

- **Rewrote `buildDraftPrompt()`/`TONE_BRIEF`** into a ROLE / STRUCTURE / TONE / HARD LIMITS / BUSINESS CONTEXT / REQUIRED FIGURE / REPORT LINK / EXAMPLE / OUTPUT CONTRACT shape: an explicit goal ("earn a reply or a short call, never close the sale"), a four-sentence structure, and a locale-selected worked example rendered with real values. `feat(06-03): rewrite the cold-outreach pitch prompt`.
- **Narrowed the prompt to one finding** instead of joining `topIssueTitles` with `; `: a laundry-list of issues was part of what made the pitch read weak and generic instead of specific. `DraftPromptInput.topIssueTitles` stays `string[]` and every caller is unchanged — `buildDraftPrompt` just uses `topIssueTitles[0]`, omitting the sentence entirely when the array is empty. `feat(06-03): give the prompt one finding instead of a list`.

The DRA-02 verbatim-figure instruction and the DRA-05 privacy/legal/unsubscribe prohibition both survived the rewrite unchanged in substance (still present in HARD LIMITS and REQUIRED FIGURE). All prior tests plus new tests for the rewritten shape and the single-finding line pass; `lib/draft-prompt.ts` stays a pure module (no Supabase, no fetch, no `process.env` reads).

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required. Both modules are pure (no Supabase client, no `fetch`, no `process.env` reads — grep-verified per acceptance criteria).

## Next Phase Readiness

- `lib/draft-generator.ts` (06-04) can now import `selectCitableMetric()` and `buildDraftPrompt()`/`buildDraftSubject()`/`appendArticle14Notice()` directly; `metric.displayValue` is the exact token 06-04's verbatim-check will guard on.
- Open dependency carried forward to Phase 8: no hosted LIA/privacy URL exists yet, so the Article 14 notices point at the controller contact address instead of a link. This should be revisited once a `/privacy` or `/legal` route exists.
- `GEMINI_API_KEY` provisioning (06-02, in parallel) is not required for this plan — both modules are pure and never call Gemini.

---
*Phase: 06-draft-generation-approval-queue*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 4 created files and all 4 task commit hashes (`a46954b`, `af0d564`, `8dc26ec`, `2b6a2a6`) verified present on disk / in git history.
