---
phase: quick
plan: 261116-ohn
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/report-copy.md
  - lib/niche-profile/types.ts
  - lib/niche-profile/installers/copy.ts
  - lib/niche-profile/profile.test.ts
autonomous: true
requirements: [NIC-01, REP-01, REP-05, REP-07, AIV-04, QT-261116-ohn]

estimate:
  tokens: 34000
  raw_tokens: 34000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "The approved copy lives in the repo at docs/report-copy.md, with its reasoning, its four settled decisions and its placeholder notes intact, framed as approved on 2026-11-16 with no open decisions. A scratchpad cleanup can no longer destroy it."
    - "ProfileCopy carries one field per report section, named after that section, filled for both locales from the approved document and nothing else (D-9-10)."
    - "A ProfileCopy literal that omits one of the four social-proof states does not compile. The four states are required keys on a typed interface, the same way showMoneyLine is required on a trade (D-9-21) and a citation is required on a JobValue."
    - "adashiFixes requires exactly five keys, the fifth being the AI-visibility line, so a missing one is a build error rather than a blank in front of a prospect."
    - "tips exists on ProfileCopy (D-9-10) and is empty in both locales, because the approved document gives the to-do heading and its ordering line and not the five item texts. Empty is honest, the same call D-9-24 made for aiQuestions."
    - "Every brace placeholder in the copy comes from the approved document: a test pins the exact placeholder set per locale, so neither an invented placeholder nor a dropped one survives."
    - "No copy field holds a competitor or installer name. The competitors section states the no-names rule and the AI-visibility section prints a count (REP-05, settled decision 2)."
    - "NicheScanSlice and toScannerSlice are byte-identical to HEAD, and the slice a scan request carries is byte-identical to HEAD. Growing ProfileCopy sent nothing new to Railway (T-9-03)."
    - "lib/niche-profile/isolation.test.ts and lib/bulk-scan-dispatch.test.ts are untouched and green."
    - "Three commits land in order, each green on its own verification before the next begins."
  artifacts:
    - "docs/report-copy.md: the approved copy, at least 295 lines, twelve numbered sections, the settled-decisions section, no em-dash anywhere"
    - "lib/niche-profile/types.ts: ProfileCopy with twelve section fields plus adashiFixes and tips; one small interface per section; AdashiFixSection as a five-member union; no optional field except the tips record's Partial keys"
    - "lib/niche-profile/installers/copy.ts: both locales filled from docs/report-copy.md, Dutch and English, verbatim where the document gives a sentence; the four existing adashiFixes values and the money line keep their current bytes"
    - "lib/niche-profile/profile.test.ts: the four-state presence test, the negative type test proving a missing state is a build error, the deep locale key-parity test, the placeholder-set test, and the T-9-03 key-intersection gate between the slice and ProfileCopy"
  key_links:
    - "T-9-03 is the load-bearing constraint. toScannerSlice builds the slice field by field from an explicit list, never by spreading, precisely so a new copy field cannot ride along. This plan does not touch lib/niche-profile/index.ts or types/niche-scan-slice.ts, and gates both with git diff --exit-code. The regression proof is the existing assertion in lib/bulk-scan-dispatch.test.ts comparing the sent slice against toScannerSlice(INSTALLERS_PROFILE)."
    - "The new slice gate asserts the KEY SETS of the serialised slice and of ProfileCopy do not intersect. A substring ban would be fragile here: short copy keys (the money line's own `line`, the ask's `ask`) occur as fragments in the profile's source and would make a correct slice look dirty or a dirty one look clean."
    - "Dutch trade vocabulary, country and locale literals are allowed under lib/niche-profile/installers/ and fail the build in engine files. isolation.test.ts scans ENGINE_FILES only; copy.ts is not in that list and types.ts is not either. The Dutch copy belongs where it is going, and the exclusion directory assertion in isolation.test.ts stays satisfied."
    - "The document writes its NL placeholders in Dutch ({bedrijf}, {plaats}) and its EN placeholders in English ({business}, {city}). That asymmetry is transcribed as given, not normalised. Phase 12 fills placeholders per locale, or normalises them as part of the reshape it owns."
    - "Phase 12 owns the report and may reshape these fields. The field names follow the document's own section order so the mapping stays obvious; a reshape there is expected and is not a regression here."
---

<objective>
Land the report copy Joshua approved on 2026-11-16 in the repo, ahead of Phase 12 which renders
it: the document as the human-readable source of truth, the typed home for it on ProfileCopy,
and both locales filled from it.

Purpose: the approved copy currently exists only in a session scratchpad that routine cleanup
can delete, and ProfileCopy carries three of the fields the report actually prints. Phase 12
should lay out approved words, not invent them.
Output: three commits on `gsd/phase-09-niche-profile`. One new document, one type, one copy
file, one test file. No deploy, no push.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md

@lib/niche-profile/types.ts
@lib/niche-profile/installers/copy.ts
@lib/niche-profile/index.ts
</context>

<ground_rules>
Read these before the first edit. They bind every task.

1. **The copy is not up for revision.** This task puts approved words into a typed home. Do not
   improve a sentence, do not shorten one, do not translate one afresh. Where the document gives
   a sentence, transcribe it character for character.
2. **Invent no copy and no placeholder.** If the document leaves something a report needs, it is
   named in `<copy_gaps>` below and stays out of the type. Adding a field with a guessed sentence
   is the one failure this plan cannot absorb.
3. **No em-dash anywhere**, in copy, in comments or in a commit message. Commas, colons,
   parentheses or a second sentence instead. The document as approved contains none; keep it that
   way.
4. **Locate by content, never by line number.** Every line reference in this plan came from a
   live read during planning and is a hint for finding the code, not edit authority.
5. **No worktree, no branch switch, no push.** `workflow.use_worktrees` is false and isolation
   resolved to `none`. Work on the main checkout, on branch `gsd/phase-09-niche-profile`,
   starting at HEAD `dd24b89`.
6. **Everything untracked stays untracked.** At HEAD `dd24b89` that is `.planning/state.json`,
   `.planning/milestone.lock`, a stray entry named `--`, and the quick planning directories
   (including this plan's own). Stage every commit with explicit paths. Never `git add -A`, never
   `git add .`. This plan's own PLAN and SUMMARY are committed by the orchestrator at the end of
   the run, not by a task.
7. **Never run the full suite.** On this machine it times out and reports a false failure while
   anything else is working. Run only the files each task names.
8. **Verification order, per task:** the named vitest files first, then `npx tsc --noEmit`, then
   `npx eslint` on the touched files. Then commit. Then start the next task.
9. **Every path in this plan is repo-root-relative**, and every verify command assumes the
   current directory is the checkout root. The one absolute path is the scratchpad source in
   Task 1.
10. **Commit messages** end with the line
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

**The decisions this plan implements, with their substance, so the phase CONTEXT does not need
loading:**

- **D-9-10:** report copy moves into the profile. The profile holds its own copy for the report
  sections, the "Adashi fixes this" lines and the tips. The public scanner's own UI copy stays in
  `messages/nl.json` and `messages/en.json`, untouched.
- **D-9-20:** three copy obligations travel with three job values, and Phase 12 must honour them
  (solar names its 8-panel basis, the kitchen citation states its midpoint derivation, central
  heating prints no money line). This plan adds no field that could carry an obligation silently:
  `copyObligation` stays on the trade, where the type already forces it.
- **D-9-21:** central heating carries a value and still shows no money line. `showMoneyLine` is a
  per-trade switch and stays one. The money-line copy here is a template; whether it prints at all
  is the trade's decision, not the copy's.
- **D-9-24:** a typed field that exists and is honestly empty beats a stub pretending to work.
  That is the precedent `tips` follows.
- **T-9-03:** copy must never reach the Railway scanner. See `<threat_model>`.
</ground_rules>

<copy_gaps>
Two things the report will need that the approved document does not supply. Both are named here
and left out of the filled copy rather than invented.

1. **The five to-do item texts.** Section 10 gives the heading and the ordering line, not the
   five items. The `tips` field D-9-10 asks for therefore ships empty in both locales, with a
   comment naming this gap and pointing at D-9-24 for the precedent. Phase 12, or a copy pass
   before it, writes them with Joshua.
2. **Counsel's Article 14 wording.** Section 12 carries the label and the `{counsel_wording}`
   placeholder. No legal sentence exists yet, so the field keeps the placeholder and nothing
   else. Phase 12 must not render an empty slot; that is a render-time decision it owns.

Also recorded, not a gap: the money-line section of the document prints no heading, so
`MoneyLineCopy` carries none. The competitors section carries no "Adashi fixes this" line, so
`adashiFixes` stays at five keys.
</copy_gaps>

<field_map>
The field-by-field mapping from `docs/report-copy.md` (written in Task 1) onto `ProfileCopy`.
Read the document section, take the sentence, put it in the field. Both locales, from that
locale's own half of the section.

**Transcription rules**

- A bullet prefix that says WHEN or WHERE copy applies is a meta label and is dropped:
  "Kop" / "Heading", "Boven" / "Above", "Onder" / "Below", "Score", "Labels", "Knop" / "Button",
  "Per vraag" / "Per question", the "when others were named" prefix, the numbered state prefixes
  in section 4, and the "Adashi lost dit op" / "Adashi fixes this" prefix.
- A bullet prefix that is itself printed stays, joined to its value by the colon the bullet uses:
  the load-time bullet and the source-for-the-comparison bullet in section 6, and the Article 14
  label in section 12.
- Bold markers, backticks and the italic "(bestaat al)" / "(already in copy.ts)" annotations are
  document notation, not copy. Drop them, keep the words.
- The arrow character in the section 8 per-question bullet is part of the printed line. Keep it.

| field | document source | placeholders |
|---|---|---|
| `header.eyebrow` | 1, the above-the-heading bullet | NL `{bedrijf}`, `{plaats}`; EN `{business}`, `{city}` |
| `header.heading` | 1, the heading | none |
| `header.scoreLine` | 1, the score bullet | `{score}`, `{gap}` |
| `header.intro` | 1, the below-the-score bullet | none |
| `whyYouGotThis.heading` | 2, the heading | none |
| `whyYouGotThis.body` | 2, its two paragraphs, in print order | none |
| `businessFacts.heading` | 3, the heading | none |
| `businessFacts.frame` | 3, the sentence under the heading | none |
| `businessFacts.foundLabel` | 3, the labels bullet, first value | none |
| `businessFacts.notFoundLabel` | 3, the labels bullet, second value | none |
| `socialProof.heading` | 4, the heading | none |
| `socialProof.frame` | 4, the sentence under the heading | none |
| `socialProof.noneHereOthersDo` | 4, state 1 (the sentence already in copy.ts) | `{count}` |
| `socialProof.noneHereNoneThere` | 4, state 2 | `{count}` |
| `socialProof.visibleNotReadable` | 4, state 3 | none |
| `socialProof.visibleAndReadable` | 4, state 4 | `{n}` |
| `competitors.heading` | 5, the heading | none |
| `competitors.frame` | 5, first paragraph (the no-names rule) | `{count}` |
| `competitors.standing` | 5, second paragraph | `{count}`, `{withProof}`, `{withData}`, `{rank}` |
| `websiteOnPhone.heading` | 6, the heading | none |
| `websiteOnPhone.frame` | 6, the sentence under the heading | none |
| `websiteOnPhone.loadTimeLine` | 6, the load-time bullet, label and value joined | `{seconds}` |
| `websiteOnPhone.citationLine` | 6, the source bullet, label and value joined | `{citation}` |
| `quoteRequest.heading` | 7, the heading | none |
| `quoteRequest.frame` | 7, the sentence under the heading | none |
| `quoteRequest.checklist.quoteForm` | 7, labels bullet, value 1 | none |
| `quoteRequest.checklist.clickToCall` | 7, labels bullet, value 2 | none |
| `quoteRequest.checklist.projectPhotos` | 7, labels bullet, value 3 | none |
| `quoteRequest.checklist.certifications` | 7, labels bullet, value 4 | none |
| `aiVisibility.heading` | 8, the heading | none |
| `aiVisibility.frame` | 8, the paragraph under the heading | `{date}` |
| `aiVisibility.perQuestionLine` | 8, the per-question bullet | `{question}`, `{hits}` |
| `aiVisibility.othersNamedLine` | 8, the others-named bullet | `{others}` |
| `moneyLine.line` | 9, first line. Keep the bytes already in copy.ts | `{amount}` |
| `moneyLine.provenance` | 9, second paragraph | `{source}`, `{date}` |
| `moneyLine.followUp` | 9, third paragraph | none |
| `todo.heading` | 10, the heading | none |
| `todo.ordering` | 10, the ordering line | none |
| `ask.heading` | 11, the heading | none |
| `ask.body` | 11, the paragraph | none |
| `ask.buttonLabel` | 11, the button | none |
| `footer.provenance` | 12, first paragraph | NL `{bedrijf}`; EN `{business}`; `{date}` |
| `footer.optOut` | 12, the opt-out question, without the bracketed link text | none |
| `footer.optOutLinkLabel` | 12, the bracketed link text, brackets dropped | none |
| `footer.article14` | 12, the Article 14 line, label and placeholder kept whole | `{counsel_wording}` |
| `adashiFixes.businessFacts` | already in copy.ts. Keep its bytes | none |
| `adashiFixes.socialProof` | already in copy.ts. Keep its bytes | none |
| `adashiFixes.websiteOnPhone` | already in copy.ts. Keep its bytes | none |
| `adashiFixes.quoteRequest` | already in copy.ts. Keep its bytes | none |
| `adashiFixes.aiVisibility` | 8, the sentence after the proposal marker, marker dropped | none |
| `tips` | nothing. Empty record, see `<copy_gaps>` | none |

**The five values already in copy.ts keep their current bytes.** The document quotes them and
marks them "(bestaat al)" / "(already in copy.ts)"; the quote is a reference, not a revision.
Where the quote differs from the file in punctuation, the file wins. The English quote-request
line is the known case: copy.ts hyphenates the tap-to-call phrase and the document does not.
Do not reconcile it. Do not re-translate any of the five.

**The approved placeholder set**, which the Task 3 test pins exactly:

- Both locales: `score`, `gap`, `count`, `withProof`, `withData`, `rank`, `seconds`, `citation`,
  `date`, `question`, `hits`, `others`, `amount`, `source`, `n`, `counsel_wording`
- Dutch only: `bedrijf`, `plaats`
- English only: `business`, `city`
</field_map>

<tasks>

<task type="auto">
  <name>Task 1: land the approved copy document in the repo</name>
  <files>docs/report-copy.md</files>
  <precondition>
    The scratchpad source is still readable at
    `/private/tmp/claude-501/-Users-annan-Developer-Claude-code-projects-website-scanner/e83cbce5-d41f-45e5-a48c-6f329e82612d/scratchpad/report-copy-draft.md`.
    If it is gone, HALT and say so. The copy cannot be reconstructed from memory and the rest of
    this plan has no content authority without it.
  </precondition>
  <read_first>
    - The scratchpad source above, whole. It is 307 lines: a one-paragraph preamble, twelve
      numbered sections each with a Dutch half and an English half, a settled-decisions section,
      an open-decisions section, and a closing note about the code.
    - `docs/scanner-backlog.md`, the first ten lines only, for the documentation voice in this
      repo.
  </read_first>
  <action>
    Create `docs/report-copy.md` as a faithful carry-over of the scratchpad source. Copy the
    content, do not summarise it, do not re-order it, do not edit a sentence of copy. The
    reasoning paragraphs are the point of the document and travel with it: why the header frames
    the customer's decision rather than the audit, why section 2 exists at all, why a fourth
    social-proof state exists, why variant 4 buys the page its credibility, why the competitors
    are described and never named, why the "pays for itself" line is not used, and why the opt-out
    has to be fast and free and one step.

    Four edits, all of them status framing, nothing else:

    1. The title becomes `# Report copy`, with no edition suffix.
    2. The status line becomes exactly:
       `Status: approved by Joshua on 2026-11-16. No open decisions.`
    3. The open-decisions section keeps its heading and its existing answer, which already
       records four of four settled on 2026-11-16.
    4. The closing section about the code is rewritten to describe what is now true: the typed
       home for this copy lands in `lib/niche-profile/types.ts` and
       `lib/niche-profile/installers/copy.ts` in this same task on 2026-11-16, Phase 12 renders
       it and may reshape the fields, and two things are still missing, namely the five to-do
       item texts and counsel's Article 14 wording. Keep it to a short paragraph plus those two
       named gaps. Do not restate the field list; `<field_map>` in the plan is the mapping and
       this document is the copy.

    Keep the settled-decisions section exactly as approved, including the note that wherever the
    money line prints at all the claim would in fact have been true. That note is the record of
    why the arithmetic was sound and the promise was not.

    Em-dash check before committing: the source has none, so a verify gate counts zero of them.
    If your carry-over introduces one, the gate fails and you rewrite that clause with a comma.

    Commit `docs/report-copy.md` alone:
    `docs(quick-261116-ohn): land the approved prospect-report copy`
  </action>
  <verify>
    <automated>test -f docs/report-copy.md</automated>
    <automated>test "$(grep -c '^# Report copy$' docs/report-copy.md)" = "1"</automated>
    <automated>test "$(grep -c '^Status: approved by Joshua on 2026-11-16\. No open decisions\.$' docs/report-copy.md)" = "1"</automated>
    <automated>test "$(grep -c '^## [0-9]' docs/report-copy.md)" = "12"</automated>
    <automated>test "$(grep -c '^## Decisions settled, 2026-11-16$' docs/report-copy.md)" = "1"</automated>
    <automated>test "$(wc -l < docs/report-copy.md)" -ge 295</automated>
    <automated>test "$(LC_ALL=C grep -c $'\xe2\x80\x94' docs/report-copy.md || true)" = "0"</automated>
    <automated>git diff --exit-code -- lib types scanner-service</automated>
  </verify>
  <done>
    - `docs/report-copy.md` exists, at least 295 lines, twelve numbered sections, the
      settled-decisions section present with all four decisions and their reasoning.
    - The status line reads as approved on 2026-11-16 with no open decisions, and the title
      carries no edition suffix.
    - No em-dash in the file.
    - No code file changed in this task.
    - Committed with exactly one path staged.
  </done>
</task>

<task type="tracer" tdd="true">
  <name>Task 2: the four social-proof states, typed so a missing one is a build error</name>
  <files>lib/niche-profile/types.ts, lib/niche-profile/installers/copy.ts, lib/niche-profile/profile.test.ts</files>
  <read_first>
    - `docs/report-copy.md`, section 4 only, both halves. Four states and the reason the second
      one exists.
    - `lib/niche-profile/types.ts`: the `ProfileCopy` interface, and the `JobValue` union above it
      for the house style (the type carries the rule, the comment carries the decision id).
    - `lib/niche-profile/installers/copy.ts`: the whole file. It is short.
    - `lib/niche-profile/profile.test.ts`: the `describe("copy (D-9-10)")` block near the end, the
      slice assertion in the block above it (find it by `toScannerSlice`), and the
      `@ts-expect-error` negative test for `showMoneyLine` (find it by `rejects a trade literal`)
      which is the pattern the new negative test copies.
    - `lib/niche-profile/index.ts`, `toScannerSlice` only. Confirm for yourself that the slice is
      built field by field and spreads nothing.
  </read_first>
  <behavior>
    - A `ProfileCopy` literal carrying all four social-proof states compiles.
    - A `ProfileCopy` literal missing one state does not compile, proven by an
      `@ts-expect-error` test that itself fails the build if the type is ever loosened.
    - Both locales carry all four states, each non-empty.
    - The two count-bearing states carry `{count}`; the both-true state carries `{n}`.
    - The serialised scanner slice and `ProfileCopy` share no object key.
    - The slice a dispatch sends is still byte-identical to `toScannerSlice(INSTALLERS_PROFILE)`.
  </behavior>
  <action>
    This is the thin slice through every layer this plan touches: approved document, type, both
    locales, test gate. Prove it on the one field that carries a hard requirement before
    transcribing the other eleven sections in Task 3.

    Step 1, `lib/niche-profile/types.ts`. Add an exported `SocialProofCopy` interface above
    `ProfileCopy` with six required string fields: `heading`, `frame`, and the four states named
    `noneHereOthersDo`, `noneHereNoneThere`, `visibleNotReadable`, `visibleAndReadable`. Every one
    required, no optional marker, no index signature, no `Record<string, string>`: a free-form
    record is exactly what would let a state go missing at runtime instead of at build time.
    Document each state with the situation it covers in one line, and record on
    `noneHereNoneThere` why it exists: without it the report prints a zero-count sentence claiming
    nearby businesses show reviews when none do (settled decision 4). Change
    `ProfileCopy.socialProof` from `string` to `SocialProofCopy`.

    Step 2, `lib/niche-profile/installers/copy.ts`. Fill `socialProof` for both locales from
    section 4 of `docs/report-copy.md`. Move the sentence the file holds today into
    `noneHereOthersDo` byte for byte, in both locales: the document marks state 1 as already in
    copy.ts and that is this sentence. Transcribe the other three states, the heading and the
    frame sentence from the document. Dutch from the Dutch half, English from the English half.
    Leave `moneyLine`, `adashiFixes` and the file header comment alone in this task.

    Step 3, `lib/niche-profile/profile.test.ts`, inside the existing copy describe block. Replace
    the single `socialProof.length` assertion with a loop over the four state keys asserting each
    is a non-empty string in both locales, plus the placeholder assertions named in `<behavior>`.
    Then add a negative type test in the house style: a `ProfileCopy["socialProof"]` literal that
    omits `visibleAndReadable`, preceded by `@ts-expect-error` and a comment citing settled
    decision 4. That directive is the build-error proof: loosen the type later and `tsc` reports
    an unused directive, so the gate cannot rot silently.

    Step 4, same file, in the describe block that holds the slice assertions. Add the T-9-03 key
    gate: a small recursive helper that walks a value and collects object keys only, skipping
    array indices; assert the key set of `toScannerSlice(INSTALLERS_PROFILE)` and the key set of
    `INSTALLERS_PROFILE.copy.nl` have an empty intersection, and the same for `copy.en`. Assert on
    keys, not on substrings: a short copy key such as the money line's own value key would collide
    with unrelated text in the profile source and make a clean slice look dirty. Leave the
    existing banned-token assertion in place; it is a second net, not a replacement.

    Touch neither `lib/niche-profile/index.ts` nor `types/niche-scan-slice.ts`. Touch neither
    `lib/bulk-scan-dispatch.test.ts` nor `lib/niche-profile/isolation.test.ts`: both must pass
    unchanged, which is what makes them regression gates rather than co-edited tests.

    Commit three paths:
    `feat(quick-261116-ohn): type the four social-proof states on ProfileCopy`
  </action>
  <reversibility rating="reversible">One interface and one field type; Phase 12 may reshape it, and the four states are the document's own.</reversibility>
  <verify>
    <automated>npx vitest run --project unit lib/niche-profile/profile.test.ts</automated>
    <automated>npx vitest run --project unit lib/niche-profile/isolation.test.ts</automated>
    <automated>npx vitest run --project unit lib/bulk-scan-dispatch.test.ts</automated>
    <automated>test "$(grep -cE 'noneHereOthersDo|noneHereNoneThere|visibleNotReadable|visibleAndReadable' lib/niche-profile/types.ts)" -ge "4"</automated>
    <automated>test "$(grep -cE 'installateurs bij jou in de buurt tonen hun reviews|installers near you show their reviews' lib/niche-profile/installers/copy.ts)" = "2"</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>npx eslint lib/niche-profile/types.ts lib/niche-profile/installers/copy.ts lib/niche-profile/profile.test.ts</automated>
    <automated>git diff --exit-code -- lib/niche-profile/index.ts types/niche-scan-slice.ts lib/bulk-scan-dispatch.test.ts lib/niche-profile/isolation.test.ts</automated>
  </verify>
  <done>
    - `SocialProofCopy` is exported with six required fields and no free-form record, and
      `ProfileCopy.socialProof` has that type.
    - Both locales carry all four states; state 1 is the sentence the file held at HEAD, unchanged.
    - The `@ts-expect-error` negative test is present and `npx tsc --noEmit` is green, so a
      missing state is a build error and the directive is doing work.
    - The slice and ProfileCopy share no key; the dispatch byte-identity assertion still passes.
    - `lib/niche-profile/index.ts`, `types/niche-scan-slice.ts`,
      `lib/bulk-scan-dispatch.test.ts` and `lib/niche-profile/isolation.test.ts` are byte-identical
      to HEAD.
    - Committed with exactly three paths staged.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: carry the other eleven sections, the fifth fix line and the empty tips field</name>
  <files>lib/niche-profile/types.ts, lib/niche-profile/installers/copy.ts, lib/niche-profile/profile.test.ts</files>
  <read_first>
    - `docs/report-copy.md`, whole. It is the content authority for every string in this task.
    - `<field_map>` in this plan, which is the mapping from its sections onto the fields.
    - `lib/niche-profile/types.ts` as Task 2 left it.
    - `lib/niche-profile/installers/copy.ts` as Task 2 left it.
    - `lib/niche-profile/types.ts`, the `aiQuestions` field on `TradeProfile` and its comment: the
      house precedent (D-9-24) for a typed field that is honestly empty.
  </read_first>
  <behavior>
    - Both locales carry the same deep key set, asserted recursively, so a field filled in one
      locale and forgotten in the other fails the test as well as the build.
    - The brace placeholders present across each locale's copy equal the approved set for that
      locale exactly: nothing invented, nothing dropped.
    - `adashiFixes` has exactly the five keys, same set in both locales, each value non-empty.
    - `tips` is an empty record in both locales.
    - Each section's own placeholders sit in the field `<field_map>` assigns them.
    - The slice and the dispatched bytes are still unchanged.
  </behavior>
  <action>
    Step 1, `lib/niche-profile/types.ts`. Add one small exported interface per remaining report
    section, each named for its section and holding only the fields `<field_map>` lists, all
    required strings: `HeaderCopy` (`eyebrow`, `heading`, `scoreLine`, `intro`),
    `WhyYouGotThisCopy` (`heading`, and `body` as a readonly two-string tuple so the second
    paragraph cannot go missing), `BusinessFactsCopy` (`heading`, `frame`, `foundLabel`,
    `notFoundLabel`), `CompetitorsCopy` (`heading`, `frame`, `standing`), `WebsiteOnPhoneCopy`
    (`heading`, `frame`, `loadTimeLine`, `citationLine`), `QuoteRequestCopy` (`heading`, `frame`,
    `checklist` holding `quoteForm`, `clickToCall`, `projectPhotos`, `certifications`),
    `AiVisibilityCopy` (`heading`, `frame`, `perQuestionLine`, `othersNamedLine`), `MoneyLineCopy`
    (`line`, `provenance`, `followUp`), `TodoCopy` (`heading`, `ordering`), `AskCopy` (`heading`,
    `body`, `buttonLabel`), `FooterCopy` (`provenance`, `optOut`, `optOutLinkLabel`, `article14`).

    Add an exported `AdashiFixSection` union of the five section ids that carry a fix line:
    `businessFacts`, `socialProof`, `websiteOnPhone`, `quoteRequest`, `aiVisibility`. Retype
    `adashiFixes` from `Readonly<Record<string, string>>` to a readonly record keyed by that
    union, so all five are required and a sixth key is a build error.

    Then rewrite `ProfileCopy` to hold one field per section, in the document's own order:
    `header`, `whyYouGotThis`, `businessFacts`, `socialProof`, `competitors`, `websiteOnPhone`,
    `quoteRequest`, `aiVisibility`, `moneyLine`, `todo`, `ask`, `footer`, then `adashiFixes` and
    `tips`. `moneyLine` changes from a string to `MoneyLineCopy`. `tips` is a readonly record of
    the same five-member union with partial keys, because the document supplies none of the five
    item texts yet; comment it with the gap and cite D-9-10 for why the field exists and D-9-24
    for why empty is the honest state. State in the interface comment that Phase 12 owns the
    report and may reshape these fields, and that the names follow the document's sections so the
    mapping stays readable.

    Carry the decision ids into the comments where they bite: D-9-10 on `ProfileCopy` and `tips`,
    D-9-21 on `MoneyLineCopy` (the template prints only for a trade whose `showMoneyLine` is true,
    so central heating prints nothing), AIV-04 on `AiVisibilityCopy` (a frequency band, never a
    score), REP-05 on `CompetitorsCopy` and on `othersNamedLine` (described, never named).

    Step 2, `lib/niche-profile/installers/copy.ts`. Fill every field for both locales from
    `docs/report-copy.md`, Dutch from the Dutch half and English from the English half, following
    `<field_map>` row by row. Three things to hold to:
    - The five values already in the file keep their bytes. Do not re-translate them, do not
      reconcile the tap-to-call hyphenation against the document's rendering of it.
    - Transcribe the NL placeholders as Dutch words and the EN placeholders as English words,
      exactly as the document writes them. Do not normalise them to one set.
    - `tips` is `{}` in both locales, with a one-line comment pointing at the gap.
    Update the file header comment: it currently says the file holds only the copy that exists in
    the v2 plan sections 7 and 8. It now holds the approved report copy, and the source of truth
    is `docs/report-copy.md`, approved 2026-11-16. Keep the note that the public scanner's UI copy
    stays in next-intl and the note about what fills the placeholders.

    Step 3, `lib/niche-profile/profile.test.ts`, in the copy describe block. Update the money-line
    assertion to read the template through its new field. Add the tests named in `<behavior>`:
    the recursive deep key-parity test between the two locales; the placeholder-set test, which
    collects every brace token from every string in a locale's copy, compares it against the
    approved set for that locale (both directions, so an invented placeholder and a dropped one
    both fail) and whose expected sets are written out literally in the test; the five-key
    `adashiFixes` assertion; the empty-`tips` assertion in both locales; and the per-field
    placeholder assertions from `<field_map>`. Keep every existing assertion in the file.

    Still do not touch `lib/niche-profile/index.ts`, `types/niche-scan-slice.ts`,
    `lib/bulk-scan-dispatch.test.ts` or `lib/niche-profile/isolation.test.ts`.

    HALT CONDITION. If a field in `<field_map>` has no sentence in the document for one of the two
    locales, STOP and report which field and which locale. Do not translate the other locale's
    sentence across, and do not write a placeholder sentence. An unfilled field is a question for
    Joshua; an invented one is a sentence a prospect reads.

    Commit three paths:
    `feat(quick-261116-ohn): carry every approved report section in ProfileCopy`
  </action>
  <reversibility rating="reversible">Field names and nesting only; Phase 12 owns the report and reshaping these fields is expected.</reversibility>
  <verify>
    <automated>npx vitest run --project unit lib/niche-profile/profile.test.ts</automated>
    <automated>npx vitest run --project unit lib/niche-profile/isolation.test.ts</automated>
    <automated>npx vitest run --project unit lib/bulk-scan-dispatch.test.ts</automated>
    <automated>test "$(grep -cE 'HeaderCopy|WhyYouGotThisCopy|BusinessFactsCopy|CompetitorsCopy|WebsiteOnPhoneCopy|QuoteRequestCopy|AiVisibilityCopy|MoneyLineCopy|TodoCopy|AskCopy|FooterCopy|AdashiFixSection' lib/niche-profile/types.ts)" -ge "12"</automated>
    <automated>test "$(grep -cE 'aiVisibility:' lib/niche-profile/installers/copy.ts)" -ge "2"</automated>
    <automated>test "$(grep -cE 'counsel_wording' lib/niche-profile/installers/copy.ts)" = "2"</automated>
    <automated>test "$(grep -cE 'tips: \{\}' lib/niche-profile/installers/copy.ts)" = "2"</automated>
    <automated>npx tsc --noEmit</automated>
    <automated>npx eslint lib/niche-profile/types.ts lib/niche-profile/installers/copy.ts lib/niche-profile/profile.test.ts</automated>
    <automated>git diff --exit-code -- lib/niche-profile/index.ts types/niche-scan-slice.ts lib/bulk-scan-dispatch.test.ts lib/niche-profile/isolation.test.ts</automated>
  </verify>
  <done>
    - `ProfileCopy` holds twelve section fields plus `adashiFixes` and `tips`, every section field
      typed by its own interface, nothing optional except the `tips` record's keys.
    - `adashiFixes` requires five keys in both locales, the fifth being the AI-visibility line
      taken from section 8 without its proposal marker.
    - Both locales carry the same deep key set, and each locale's placeholder set equals the
      approved set for that locale exactly.
    - `tips` is empty in both locales, commented with the gap and the D-9-24 precedent.
    - The five pre-existing values are byte-identical to HEAD.
    - The slice files and the two regression test files are byte-identical to HEAD, and both
      regression tests pass.
    - Committed with exactly three paths staged.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Vercel app to Railway scanner | the niche slice crosses it on every bulk and Atrium scan request. This plan grows the object the slice is derived from, which is the only reason a copy-only change has a threat model at all |
| Report copy to the prospect | every string landed here is read by a business that did not ask for the report. A name, a promise or an invented legal sentence in these fields is a published one |

No new boundary is created. No new endpoint, no new input, no new stored field, no dependency.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ohn-01 | Information disclosure | `ProfileCopy` growth reaching `toScannerSlice` output (T-9-03) | high | mitigate | `NicheScanSlice` and `lib/niche-profile/index.ts` are gated byte-identical with `git diff --exit-code` in both code tasks, so the explicit field list cannot gain a copy field. `lib/niche-profile/profile.test.ts` gains a key-set intersection assertion between the serialised slice and `ProfileCopy`, and keeps its banned-token assertion. The regression proof is `lib/bulk-scan-dispatch.test.ts` asserting the sent slice equals `toScannerSlice(INSTALLERS_PROFILE)`, kept green and unedited. |
| T-ohn-02 | Information disclosure | a competitor or installer name in prospect-facing copy (REP-05, settled decision 2) | high | mitigate | No field holds a name. `competitors.frame` states the no-names rule in the copy itself, and `aiVisibility.othersNamedLine` prints a count through `{others}`. The placeholder-set test pins the exact placeholder set per locale, so a name-shaped placeholder cannot be introduced without failing a test. Raw names stay in the stored AI response for audit and have no field to reach the page through. |
| T-ohn-03 | Tampering | the opt-out line and the Article 14 slot in the footer | high | mitigate | `footer.optOut` and `footer.optOutLinkLabel` carry the one-step, no-explanation opt-out as approved. `footer.article14` keeps the `{counsel_wording}` placeholder and no sentence, so an unreviewed legal text cannot be invented here; the gap is named in `<copy_gaps>` and the placeholder presence is gated by a grep and by the placeholder-set test. Rendering an empty slot is a Phase 12 decision, recorded for it. |
| T-ohn-04 | Spoofing | a promise the report cannot keep (the "pays for itself" line, settled decision 3) | medium | mitigate | The money section ends with the approved follow-up that ties the money to the findings and claims nothing. The rejected sentence is absent from the copy file and its absence is explained in the document that ships with it, so a later reader cannot restore it as an oversight. `MoneyLineCopy` carries no price, so no starting figure is anchored before the call. |
| T-ohn-05 | Repudiation | wrong files staged into a commit | medium | mitigate | `.planning/state.json` and `.planning/milestone.lock` must stay untracked. Every commit stages explicit paths, `git add -A` and `git add .` are forbidden by the ground rules, and each task's `done` names the exact path count. |
| T-ohn-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager install is in scope. No dependency enters the stack in this plan, so the package-legitimacy gate has nothing to audit. It stays armed for any future install. |
</threat_model>

<assumption_delta_decision>
Primary noun: the social-proof state, not the social-proof sentence.

Decision: **promote**. One line becomes four typed states, and the line the file holds today is
demoted to one of them (`noneHereOthersDo`) rather than kept alongside as a still-required
default. Keeping both would let Phase 12 print the old line in the state where no nearby business
shows reviews either, which is the zero-count sentence settled decision 4 exists to prevent. The
same promotion applies to the money line: the flat template becomes `MoneyLineCopy.line` beside
its provenance and follow-up, with no flat field left behind.

No second niche and no second locale set is introduced, so nothing else generalises here and no
debt is accepted. The invariant the promotion asks for is already in the plan: the negative type
test, which goes red the instant someone reintroduces a single free-form social-proof string.
</assumption_delta_decision>

<api_coverage>
No external API integration: this plan adds a markdown document, type fields and copy strings.
No endpoint, SDK or service is called, and no request shape changes.
</api_coverage>

<schema_gate>
No schema push task. Nothing under `supabase/migrations/` is added or modified, no ORM schema
file is touched, and no live database object changes.
</schema_gate>

<verification>
Run once at the end, after the third commit, in this order:

1. `npx vitest run --project unit lib/niche-profile/profile.test.ts`
2. `npx vitest run --project unit lib/niche-profile/isolation.test.ts`
3. `npx vitest run --project unit lib/bulk-scan-dispatch.test.ts`
4. `npx tsc --noEmit`
5. `npx eslint lib/niche-profile/types.ts lib/niche-profile/installers/copy.ts lib/niche-profile/profile.test.ts`
6. `git diff --exit-code -- lib/niche-profile/index.ts types/niche-scan-slice.ts lib/bulk-scan-dispatch.test.ts lib/niche-profile/isolation.test.ts`
7. `git status --porcelain` shows no modified or staged file left over. The untracked entries it
   lists are the ones that were already untracked before this plan started (`.planning/state.json`,
   `.planning/milestone.lock`, a stray `--` entry, and the quick planning directories). None of
   them was staged. Compare against the list in ground rule 6 rather than expecting an empty
   output.
8. `git log --oneline -3` shows the three commits in the planned order.

Do not run the bare suite at any point.

<human-check>
Joshua reads `docs/report-copy.md` as landed and confirms two things: the status line and the
closing code note are the only changes from what he approved, and the two named gaps (the five
to-do item texts, counsel's Article 14 wording) are the only ones he expects to still be open.
</human-check>
</verification>

<success_criteria>
- Three commits, in the stated order, each green on its own verification before the next began.
- The approved copy is in the repo with its reasoning intact and can no longer be lost to a
  scratchpad cleanup.
- `ProfileCopy` carries one field per report section plus the five fix lines and the `tips` field
  D-9-10 asked for, filled for both locales from the approved document and nothing else.
- A `ProfileCopy` literal missing one of the four social-proof states does not compile.
- Each locale's placeholder set is exactly the approved set: no invented placeholder, none
  dropped.
- `NicheScanSlice`, `toScannerSlice` and the bytes a scan request carries are unchanged, proven
  by a byte-identity git gate and by the existing dispatch assertion passing unedited.
- `lib/niche-profile/isolation.test.ts` is untouched and green.
- `.planning/state.json` and `.planning/milestone.lock` are still untracked.
- No deploy, no push, no branch change, no worktree.
</success_criteria>

<output>
Create
`.planning/quick/261116-ohn-land-the-approved-report-copy-extend-pro/261116-ohn-SUMMARY.md`
when done. Record, as named items: the final `ProfileCopy` field list as it landed; the two gaps
still open and who closes them; the locale-asymmetric placeholders
(`{bedrijf}`/`{plaats}` against `{business}`/`{city}`) as a thing Phase 12 must handle or
normalise; that `tips` is empty by decision and not by omission; and the fact that Phase 12 owns
the report and is expected to reshape these fields.
</output>
