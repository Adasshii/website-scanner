---
phase: quick
plan: 261116-oky
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/trade-detection.test.ts
  - tests/fixtures/own-site-zones.ts
  - scanner-service/src/trade-detection.ts
autonomous: true
requirements: [ENG-01, NIC-01, QT-261116-oky]

estimate:
  tokens: 52000
  raw_tokens: 26000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On a multi-page scan, a normalised non-empty body line that appears on EVERY page is counted ONCE at ZONE_WEIGHTS.body, not once per page. The same rule applies to an h2h3 item present on every page, at ZONE_WEIGHTS.h2h3."
    - "A general builder whose repeated footer line names a trade no longer wins that trade, and no longer reaches confidence \"clear\". Proven by a new OWN_SITE_ZONE_CORPUS entry that is RED before the fix."
    - "A one-page scan produces byte-identical scores to today's code, because the one-page branch IS today's code path, not an equivalent rewrite of it."
    - "Repetition is judged on EVERY page, never on a ratio. A line on 2 of 3 pages still sums twice."
    - "Each boilerplate union carries its own hit cap (body 10, h2h3 5) so one hostile repeated line cannot blow up either, and the MAX_TEXT_CHARS 20,000 bound on body text is unchanged."
    - "Every one of the 18 entries already in OWN_SITE_ZONE_CORPUS resolves to exactly the tradeId and confidence it resolves to today. Not one moves."
    - "ZONE_WEIGHTS, ZONE_HIT_CAPS, minTradeScore and dominanceRatio are byte-identical to HEAD. No keyword list is touched."
  artifacts:
    - "scanner-service/src/trade-detection.ts: prepareSite() splits body text into lines before normalising on the multi-page path, lifts every-page lines and every-page h2h3 items into two distinct unions on PreparedSite, and keeps the one-page path literally unchanged; scoreTrade() scores each union once alongside nav and paths; BOILERPLATE_HIT_CAPS and MAX_BODY_LINES are declared; the prepareSite doc comment covers nav and boilerplate as ONE idea."
    - "lib/trade-detection.test.ts: a new describe block pinning the boilerplate rule with exact scores on a synthetic slice, the one-page guard, the every-page strictness, both new caps, the bound, and the removal adjacency; the four existing summing tests rewritten to prove summing with per-page-DISTINCT content."
    - "tests/fixtures/own-site-zones.ts: a general-builder-with-a-trade-word-in-the-footer entry in OWN_SITE_ZONE_CORPUS, shaped and noted like roofer-seven-pages-solar-in-nav (line 93)."
  key_links:
    - "The one-page branch must be the OLD expression (normaliseBounded(page.bodyText), normaliseItems(page.h2h3)) reached by a pages.length >= 2 test, not a line-split rewrite that happens to agree. jv-installatie.nl is a real production one-pager; an equivalence argument is weaker than taking the same branch."
    - "The every-page rule counts pages, not pages-that-have-content. lib/own-site-aggregate.test.ts:230 passes two pages where page 1's h2h3 is [] and page 2's is [\"alpharoof\"], and asserts scores.alpha === 12. If the rule were 'on every page that has a non-empty h2h3', that item would become boilerplate and the score would drop to 10. Confirmed at planning time: page() spreads EMPTY, so h2h3 defaults to []."
    - "Four existing tests in lib/trade-detection.test.ts assert the OLD summing on pagesOf(7, ...), which builds seven IDENTICAL pages. They go red by design and are rewritten in Task 2, in the same commit as the behaviour. They are NOT corpus entries and do NOT trigger the HALT condition. Exact old and new numbers are given in Task 2."
    - "The removal is positional: a removed boilerplate line leaves a '.' in its place so deleting a middle line cannot glue the tail of one line to the head of the next and invent a phrase match. Pinned by its own test."
---

<objective>
Stop a repeated footer from inflating a trade score. On a multi-page scan, a body
line (and an h2/h3 item) present on EVERY page is site-wide boilerplate: count it
once, the way nav text and link paths are already counted once.

Purpose: 09-VERIFICATION.md records this as the last open way the engine can hand
Joshua a confidently WRONG trade (human-check item 4). A wrong trade with
`clear` confidence is worse than a blank, because the blank is honest and the
wrong one gets pitched.

Output: one commit of failing tests, one commit of the fix, one verification pass
across the whole suite and both tsc projects.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@scanner-service/src/trade-detection.ts
@lib/trade-detection.test.ts
@tests/fixtures/own-site-zones.ts
</context>

<ground_rules>
Read these before Task 1. Every one of them is a halt, not a preference.

1. **Do not change `ZONE_WEIGHTS`, `ZONE_HIT_CAPS`, `minTradeScore` or
   `dominanceRatio`.** This is a counting fix, not a tuning exercise. `git diff`
   on `lib/niche-profile/index.ts` must be empty at the end.
2. **Do not touch `lib/niche-profile/installers/trades.ts`.** The keyword lists
   are a separate open item. `git diff` on that file must be empty.
3. **Do not touch anything under `.claude/worktrees/**`** (a stale worktree holds
   its own copies of these exact files) **or `supabase/migrations/`**.
4. **Stay on `fix/footer-boilerplate`.** It was cut fresh from `origin/main`. Do
   not switch, merge, rebase or push.
5. **No re-scanning, no live API call, no deploy.**
6. **Stage explicit paths on every commit.** `git add -A` and `git add .` are
   forbidden: `.planning/milestone.lock`, `.planning/state.json` and a stray `--`
   are untracked in this checkout and must stay untracked.
7. **The HALT condition** is in Task 3 and is Joshua's call, never the
   executor's.
</ground_rules>

<tasks>

<task type="tdd" tdd="true">
  <name>Task 1: write the failing tests and the failing fixture, and see them red</name>
  <files>lib/trade-detection.test.ts, tests/fixtures/own-site-zones.ts</files>
  <read_first>
    - `scanner-service/src/trade-detection.ts` in full (282 lines). The parts this
      plan turns on: `ZONE_WEIGHTS` (lines 45-52), `ZONE_HIT_CAPS` (59-62), the
      bounds block (64-70), `normaliseBounded`/`normaliseItems` (183-189), the
      `prepareSite` doc comment (191-199), `prepareSite` (200-215) and
      `scoreTrade` (217-228).
    - `lib/trade-detection.test.ts` lines 196-312: the `pagesOf` and `scoreOf`
      helpers and the whole `describe("detectTrade: aggregation across a 7-page
      scan")` block. `pagesOf(count, over)` returns the SAME page `count` times,
      which is why four of its cases change meaning under this fix.
    - `lib/trade-detection.test.ts` lines 574-648: the regression-corpus block. It
      pins each entry individually, pins the whole corpus in one naming
      assertion, pins order-independence, and pins "holds trimmed zone data and
      never saved HTML" (no `<`, no `</`, no `http` anywhere in the stringified
      fixtures).
    - `tests/fixtures/own-site-zones.ts` lines 26-60 (the `OwnSiteZoneFixture`
      type, `makeZones`, the `sevenPageSite` helper) and lines 93-108 (the
      `roofer-seven-pages-solar-in-nav` entry: the exact parallel for nav, and the
      shape and note style the new entry follows).
  </read_first>
  <behavior>
    Add ONE new describe block, `describe("detectTrade: boilerplate repeated on
    every page counts once")`, placed immediately after the existing
    `describe("detectTrade: aggregation across a 7-page scan")` block so a reader
    meets the nav rule and the boilerplate rule together. Use the existing
    `zones()` and `scoreOf()` helpers. `scoreOf` runs a one-trade slice at
    `minTradeScore: 1`, so every number below is an exact score, not a band.

    FOUR cases are genuinely RED (they assert the post-fix number and today's
    code reports the summed one). Every number below was computed against the
    read source at planning time; re-confirm each from the red run.

    - **RED 1, the bug itself. 9 today, 3 after.** Three pages, each with a
      distinct first body line and the SAME second line naming a trade three
      times:
      `const footer = "Dakwerken Mulder, dakreparatie en daklekkage";`
      `const pages = ["een", "twee", "drie"].map((n) => zones({ bodyText: n + "\n" + footer }));`
      `expect(scoreOf(pages, "dak")).toBe(3);`
      Today: 3 hits (`dakwerken`, `dakreparatie`, `daklekkage`) x 3 pages = 9.
      After: the footer is on every page, so its 3 hits count once = 3. None of
      `een`/`twee`/`drie` contains the stem, so the per-page remainder is 0.
    - **RED 2, h2h3. 12 today, 8 after.** Three pages, each
      `h2h3: ["dakwerk <distinct>", "Dakreparatie"]` — first item distinct per
      page, second identical on all three. Today: 2 hits per page (under the cap
      of 5) x weight 2 x 3 pages = 12. After: 3 distinct headings x 2 = 6, plus
      the boilerplate heading counted once x 2 = 2, total 8.
    - **RED 3, the body union cap. 20 today, 10 after.** Two pages sharing ONE
      repeated body line of `"dak ".repeat(50)`. Today: capped at 10 per page x 2
      pages = 20. After: counted once and capped at `BOILERPLATE_HIT_CAPS.body`
      = 10. One hostile repeated line cannot blow up the union.
    - **RED 4, the h2h3 union cap. 20 today, 10 after.** Two pages sharing ONE
      repeated h2h3 item of `"dak ".repeat(12)`. Today: capped at 5 hits x weight
      2 x 2 pages = 20. After: counted once, capped at
      `BOILERPLATE_HIT_CAPS.h2h3` = 5, x weight 2 = 10.

    FOUR more cases are rot-pins. They PASS today and must still pass after the
    fix. Say so in a comment on each, so a later reader does not mistake them for
    bug-proofs and "fix" them. A rot-pin that goes red is a real regression.

    - **The one-page guard.** `scoreOf({ bodyText: "dakwerk\ndakwerk\ndakwerk" }, "dak")`
      is 3 and must stay 3. One page has nothing to repeat against. This is the
      pin that stops the `pages.length >= 2` guard rotting into a within-page
      dedupe, which would silently score every one-pager lower. Also assert the
      same single page wrapped in a one-element array gives 3.
    - **Strictness, never a ratio.** Three pages: `"dakwerk een\ndakwerk gedeeld"`,
      `"dakwerk twee\ndakwerk gedeeld"`, `"dakwerk drie"`. The shared line is on 2
      of 3 pages, so it is NOT boilerplate and still sums: 2 + 2 + 1 = 5, before
      and after. This goes red the day someone replaces the every-page rule with
      a ratio. Name the test so that is unmistakable.
    - **The bound.** Two pages whose bodies carry more lines than the candidate
      cap (`Array.from({ length: 250 }, ...)`), with the trade word only on the
      LAST line. It sits past the candidate cap, so it is never a boilerplate
      candidate and is still summed per page: 2, before and after. Comment that
      the cap bounds the boilerplate CANDIDATE set, not the text read, and that
      clipping therefore degrades to today's summing rather than dropping body
      content.
    - **Removal is positional.** Two pages whose bodies are
      `"nieuwe cv" + "\n" + footer + "\n" + "ketel vervangen"` with `footer`
      identical on both. A `"cv ketel"` term in `word` mode scores 0 today
      (`footer` sits between them) and must still score 0 after: removing the
      middle line must not glue `cv` to `ketel`. This is the test that fails if
      the `"."` placeholder from Task 2 is left out.

    Then add ONE new entry to `OWN_SITE_ZONE_CORPUS` in
    `tests/fixtures/own-site-zones.ts`:
    - `id: "general-builder-trade-word-in-footer"`.
    - A multi-page general installer (use `sevenPageSite` or a literal list, at
      least three pages) whose own per-page content names no single trade strongly
      enough to win, and whose body carries ONE repeated footer line naming a
      trade. Model the per-page content on the `generic-contractor` entry (line
      261), which resolves unreadable today.
    - `expected: { tradeId: null, confidence: "unreadable" }` — the honest human
      reading: a general builder is not a roofer because its footer says so.
    - A `note` in the house style, naming what the entry guards and pointing at
      the nav parallel. The note must contain no `<`, no `</` and no `http`.
  </behavior>
  <action>
    Write the tests and the fixture entry. Write NO implementation. Do not touch
    `scanner-service/src/trade-detection.ts` in this task.

    Run `npx vitest run lib/trade-detection.test.ts` and read the failures.

    GATE — the red must be real, and it must be red for the right reason:
    - Exactly the four RED cases (the bug, h2h3, and the two union caps) must
      fail, each reporting the summed current value: 9, 12, 20, 20. Record each
      reported value in a comment beside its assertion. If a reported value
      differs from the figure above, the figure is wrong and the REPORTED one is
      the truth — write it down and carry on; do not bend the fixture to hit the
      plan's number.
    - The four rot-pins must PASS. If one of them is red, something in the
      fixture is wrong, not in the engine: the engine is still untouched at this
      point. Fix the fixture.
    - The new corpus entry must fail by resolving to a TRADE with confidence
      `clear`. That is the defect: a general builder read as a trade,
      confidently. If it resolves unreadable or narrow today, the fixture is not
      strong enough to prove the bug — STRENGTHEN IT (more pages, or more trade
      words in the one repeated footer line) until today's output is a named
      trade at `clear`, and record the reading. Do not weaken the expectation to
      match today.

    Expect the four existing `pagesOf(7, ...)` cases to still pass in this task —
    they assert today's behaviour and Task 2 rewrites them. Do not edit them here.
  </action>
  <verify>
    <automated>npx vitest run lib/trade-detection.test.ts 2>&1 | tail -40</automated>
  </verify>
  <done>
    The new describe block and the new corpus entry exist. `npx vitest run
    lib/trade-detection.test.ts` fails, with exactly the four RED cases and the new
    corpus entry among the failures, each reported current value written into a
    comment, and all four rot-pins passing. The new entry's failure shows a named
    trade at `clear`.
    `git diff --stat` names exactly two files: `lib/trade-detection.test.ts` and
    `tests/fixtures/own-site-zones.ts`. Committed as
    `test(quick-261116-oky): pin that a repeated footer line counts once`.
  </done>
</task>

<task type="auto">
  <name>Task 2: lift every-page body lines and headings into two unions, and rewrite the four summing tests</name>
  <files>scanner-service/src/trade-detection.ts, lib/trade-detection.test.ts</files>
  <read_first>
    - `scanner-service/src/own-site-harvest.ts:231`:
      `bodyText: ((document.body && document.body.innerText) || "").slice(0, caps.bodyText)`.
      `innerText` PRESERVES newlines between block elements, which is why the
      repeated lines are findable at all. They are invisible today only because
      `normaliseBounded` collapses all whitespace into one blob before anything
      can compare them.
    - `scanner-service/src/own-site-facts.ts:1239-1241`: the one production
      caller, `detectTradeSafely`, which passes the whole `harvests` array. It
      needs no change and must not be edited.
    - `scanner-service/src/trade-detection.ts` lines 79-93 (`PreparedPage`,
      `PreparedSite`), 150-172 (`countHits`, `countHitsCapped`), 183-189
      (`normaliseBounded`, `normaliseItems`), 191-228 (the doc comment,
      `prepareSite`, `scoreTrade`).
  </read_first>
  <action>
    Implement the fix in `scanner-service/src/trade-detection.ts`. The file stays
    pure: no I/O, no runtime import, no vocabulary, no pattern built from page
    text or from a profile string (T-9-16).

    **1. Two new bounds, declared beside the existing ones (lines 64-70).** Do not
    alter any existing constant.
    - `const MAX_BODY_LINES = 200;` — caps how many of a page's lines are
      considered as boilerplate candidates, and therefore caps how large either
      union can grow. `MAX_ITEMS_PER_ZONE = 200` is the file's own precedent.
      Comment it so the next reader knows this caps the CANDIDATE set, not the
      text read: `MAX_TEXT_CHARS` 20,000 already bounds the text, and clipping the
      candidate set degrades to today's summing rather than dropping real body
      content from a long page.
    - An exported `BOILERPLATE_HIT_CAPS = { body: 10, h2h3: 5 } as const;`
      mirroring `ZONE_HIT_CAPS` and carrying the same `// tunable default`
      markers, so one hostile repeated line cannot blow up either union.

    **2. `PreparedSite` gains two fields**, documented like `nav` and `paths`:
    `bodyBoilerplate: string[]` and `h2h3Boilerplate: string[]` — the distinct
    normalised body lines, and h2/h3 items, present on every page.

    **3. A line splitter.** Slice the raw text to `MAX_TEXT_CHARS` FIRST, so the
    20,000-char bound is untouched, THEN split on `/\r?\n/`, THEN `normaliseText`
    each line, THEN drop every line that normalises to empty. Order matters: the
    slice is the bound and the per-line normalise is what makes two pages'
    footers comparable.

    **4. An intersection helper**, `onEveryPage(perPage, candidateCap)`:
    - Return `[]` when fewer than two pages.
    - Candidates are the first `candidateCap` entries of page 0, deduped,
      preserving page 0's order. Order must be deterministic: `compareRanked`
      exists precisely because array position must never decide an outcome.
    - Build ONE `Set` per remaining page and test each candidate against every
      one. Sets, not `Array.includes`: 200 candidates against 50 pages of
      `Array.includes` is 100M comparisons on a hostile input, which is exactly
      the bounded-work contract T-9-16 states.
    - A candidate must be present on EVERY page, counting pages, not
      pages-that-have-content. A page with an empty body (or empty h2h3) means
      nothing is boilerplate in that zone. This is load-bearing:
      `lib/own-site-aggregate.test.ts:230` passes two pages where the first has
      `h2h3: []` and asserts `scores.alpha === 12`.

    **5. `prepareSite`.** Compute `const multi = pages.length >= 2;` once.
    - When `multi` is false, the per-page `body` and `h2h3` expressions stay
      LITERALLY what they are today — `normaliseBounded(page.bodyText)` and
      `normaliseItems(page.h2h3)` — and both unions are `[]`. Take the same
      branch, do not write an equivalent rewrite. A one-page scan must be
      byte-identical by construction, not by argument: `jv-installatie.nl` is a
      real one-pager in production.
    - When `multi` is true: split each page's body into lines, normalise each
      page's h2h3 with the existing `normaliseItems`, compute
      `bodyBoilerplate = onEveryPage(lines, MAX_BODY_LINES)` and
      `h2h3Boilerplate = onEveryPage(headings, MAX_ITEMS_PER_ZONE)`, then build
      each page's zones with the boilerplate REMOVED: `h2h3` filtered, and `body`
      rebuilt by joining the page's lines with a single space, putting a single
      `"."` in the place of each removed line. The `"."` is a word boundary
      (`isWordChar` excludes it) and stops a removal from gluing the tail of one
      line to the head of the next and inventing a phrase match. With nothing
      removed, no `"."` is inserted and the join reproduces today's blob exactly.
    - Nav and paths keep their existing distinct-union code, unchanged.

    **6. `scoreTrade`.** Leave the per-page loop and the nav/path lines exactly as
    they are, and add two lines next to them, outside the page loop:
    `score += countHitsCapped(site.bodyBoilerplate, terms, BOILERPLATE_HIT_CAPS.body) * ZONE_WEIGHTS.body;`
    and the same for `h2h3Boilerplate` with `BOILERPLATE_HIT_CAPS.h2h3` and
    `ZONE_WEIGHTS.h2h3`. `countHitsCapped` already shares one cap across a list of
    texts, which is the semantics wanted.

    **7. Extend the `prepareSite` doc comment (lines 191-199) so a later reader
    meets nav and boilerplate as ONE idea.** That comment is load-bearing: it
    already warns the next reader not to simplify the union away, and the same
    warning must now cover boilerplate. Keep the existing nav sentence. Correct
    the clause that claims "the other four zones genuinely differ from page to
    page": it is true of their unique content and FALSE of their boilerplate, and
    a site-wide footer lives in `bodyText` on every page and in `h2h3` when it
    carries headings. State the three rules a reader must not simplify away: every
    page and never a ratio (so it cannot suppress genuine signal that merely
    happens to repeat); two or more pages only (one page has nothing to repeat
    against, and a one-pager must score exactly as it does today); each union
    capped on its own.

    **8. Rewrite the four existing tests that assert the old summing.** They live
    in `describe("detectTrade: aggregation across a 7-page scan")` and every one
    of them feeds `pagesOf(7, ...)`, which builds seven IDENTICAL pages. They go
    red by design, in the same commit as the behaviour. Keep each test's ORIGINAL
    intent by making the repeated content DISTINCT per page, so each still proves
    that the zone sums; the identical-content case is already covered by the new
    block from Task 1.
    - `it("sums body text across pages, because it differs per page")`:
      `scoreOf(pagesOf(7, { bodyText: "dakwerk" }), "dak")` expects 7 and becomes
      1 under the fix. Rewrite it to build seven pages with a DISTINCT body line
      each (`dakwerk 1` ... `dakwerk 7`) and keep the expected 7. The test name
      already says "because it differs per page" — now make the fixture honour it.
    - `it("sums title, h1 and h2/h3 across pages too")`: the `title` (35) and `h1`
      (35) assertions are untouched by this fix and must keep their numbers. The
      `h2h3` assertion `pagesOf(7, { h2h3: ["dakwerk"] })` expects 14 and becomes
      2. Rewrite that one line with a distinct heading per page and keep 14.
    - `it("applies the heading and body caps per page, then sums")`: both
      assertions break (`h2h3` 70 becomes 10, `bodyText` 70 becomes 10). Rewrite
      both with per-page-distinct stuffed content and keep 70 and 70, so the test
      keeps proving the PER-PAGE cap.
    - `it("proves the two rules differ on one scan: the same word counts once in
      nav and seven times in body")`: `pagesOf(7, { navTexts: ["Dakwerk"],
      bodyText: "dakwerk" })` expects `3 + 7` and becomes `3 + 1`. Rewrite it with
      a distinct body line per page so the contrast it was built to show (nav
      unions, body sums) still holds at `3 + 7`, and add one companion assertion
      with the body line IDENTICAL on all seven pages expecting `3 + 1`, named so
      it reads as "and now a repeated body line unions too".

    Change nothing else in the test file. Do not touch the regression-corpus
    block, the three-match-modes block, the Dutch-pitfalls block, the ties block
    or the caps block (its cases are all single-page).
  </action>
  <verify>
    <automated>npx vitest run lib/trade-detection.test.ts lib/own-site-aggregate.test.ts lib/own-site-facts.test.ts lib/own-site-run.test.ts lib/own-site-wiring.test.ts lib/niche-profile 2>&1 | tail -30</automated>
  </verify>
  <done>
    Every test in the five files above passes, including the whole regression
    corpus and the new entry. `git diff lib/niche-profile/` is empty.
    `git diff lib/niche-profile/installers/trades.ts` is empty.
    `git diff HEAD~1 --stat` names exactly two files. `ZONE_WEIGHTS` and
    `ZONE_HIT_CAPS` are unchanged, proven by
    `git diff HEAD~1 -- scanner-service/src/trade-detection.ts | grep -E '^[-+].*(title: 5|h1: 5|nav: 3|path: 3|h2h3: 2|body: 1|h2h3: 5,|body: 10,)'`
    returning nothing from the ZONE_ blocks. Committed as
    `fix(quick-261116-oky): count a line repeated on every page once`.
  </done>
</task>

<task type="auto">
  <name>Task 3: whole-suite verification, both tsc projects, and the corpus audit</name>
  <files>none (verification only; commit of the planning record if the orchestrator asks for one)</files>
  <read_first>
    - `.planning/STATE.md`, the "Test gate needs an idle machine" note: the full
      suite times out and reports a FALSE failure when it runs alongside other
      work. Baseline is 1198 tests in 77 files passing. This task legitimately
      adds tests, so the count rises; a DROP, or a failure in a file this plan
      never touched, is a real regression.
  </read_first>
  <action>
    Run the three gates, in this order, with nothing else running on the machine.

    1. `npx vitest run` from the repo root. The whole suite.
    2. `npx tsc --noEmit` from the repo root.
    3. `npx tsc --noEmit -p scanner-service/tsconfig.json`.

    Both tsc runs are required and neither substitutes for the other: the root
    `tsconfig.json` has `"exclude": ["node_modules", "scanner-service"]`
    (confirmed at planning time), so the root check alone would leave the one
    changed source file entirely unverified. This is the exact trap quick task
    261116-m9s caught in its own brief.

    Then `npm run lint`.

    **HALT CONDITION — this is Joshua's call, never the executor's.**
    The regression corpus is the gate. If ANY `OWN_SITE_ZONE_CORPUS` entry other
    than the one Task 1 added changes its `tradeId` or its `confidence`, STOP:
    - do not retune any weight, cap, threshold or keyword to force it green;
    - do not edit the entry's `expected`;
    - do not weaken an assertion;
    - report which entry moved, what it moved from and to, and why, and hand the
      decision back. Quick task 261116-m4p ran under the same rule.

    Expected at planning time: nothing moves. 17 of the 18 existing entries are
    single-page and take the unchanged one-page branch; the only multi-page entry,
    `roofer-seven-pages-solar-in-nav`, has seven DISTINCT one-line bodies and no
    h2h3 at all, so it has no boilerplate to lift and its pinned
    `scores.solar === 4` (nav 3 + one body mention on page 1) stands. If the audit
    contradicts that, the audit wins and the HALT fires.

    Record in the summary: the test count before and after, the two tsc results,
    the lint result, the measured today-value of each new assertion from Task 1's
    red run, and what the new corpus entry resolved to BEFORE the fix. That
    before-reading is the evidence that the bug was real and is the one number a
    later reader cannot recover from the code.
  </action>
  <verify>
    <automated>npx vitest run 2>&1 | tail -15 && npx tsc --noEmit && npx tsc --noEmit -p scanner-service/tsconfig.json && npm run lint 2>&1 | tail -5</automated>
  </verify>
  <done>
    The whole suite passes with a test count at or above 1198 plus the tests this
    plan added, and no failure in any file this plan did not touch. Both tsc
    projects are clean. Lint is clean. No corpus entry other than the new one
    moved, stated explicitly. `git status --short` still shows
    `.planning/milestone.lock`, `.planning/state.json` and `--` as untracked and
    nothing else unexpected. Nothing pushed, nothing deployed, still on
    `fix/footer-boilerplate`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Scanned stranger's page to the scanner process | `bodyText` and `h2h3` arrive from `document.body.innerText` on an arbitrary third-party site and are the only untrusted input this change reads |
| Railway scanner to Supabase | the detected trade and its score map are stored on the scan row and later select a job value and a money line |

No new boundary. No new external call, no new stored field, no new dependency.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-oky-01 | Denial of service | `prepareSite` line splitting on a hostile page | high | mitigate | `MAX_TEXT_CHARS` 20,000 is applied BEFORE the split, so the split is bounded work. `MAX_BODY_LINES` 200 bounds the candidate set and therefore each union. The intersection uses one `Set` per page, not `Array.includes`, so 50 pages x 200 candidates stays linear. Each union carries its own hit cap (`BOILERPLATE_HIT_CAPS` body 10, h2h3 5). `MAX_PAGES` 50 is unchanged. Pinned by the bound case and the two cap cases in Task 1. |
| T-oky-02 | Tampering | the every-page rule suppressing genuine signal | high | mitigate | The rule is EVERY page and never a ratio, which is strictly narrower than the defect it fixes and cannot suppress a term that merely repeats often. A line on 2 of 3 pages still sums, pinned by its own test. The 18-entry regression corpus is the gate and a move is a HALT. |
| T-oky-03 | Tampering | a removal inventing a phrase match | medium | mitigate | A removed line leaves a `"."` in its place, which `isWordChar` treats as a boundary, so deleting a middle line cannot glue `cv` to `ketel`. Pinned by the adjacency test. With nothing removed no `"."` is inserted, so the no-boilerplate case is byte-identical to today. |
| T-oky-04 | Tampering | the one-page path drifting from today's behaviour | high | mitigate | The `pages.length >= 2` guard makes a one-page scan take the SAME expression it takes today (`normaliseBounded`, `normaliseItems`), not an equivalent rewrite. Pinned by the one-page guard test, which also fails if the guard ever rots into a within-page dedupe. |
| T-oky-05 | Repudiation | wrong files staged | medium | mitigate | `git add -A` and `git add .` are forbidden by the ground rules; three untracked paths must stay untracked; each task's `done` names the exact file count in the diff. |
| T-oky-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager install is in scope and no dependency enters the stack, so the package-legitimacy gate has nothing to audit. It stays armed for any future install. |
</threat_model>

<verification>
- Both tsc projects clean: root (`tsconfig.json`, which excludes
  `scanner-service`) and `scanner-service/tsconfig.json`. Neither alone is
  sufficient.
- `npx vitest run` green, on an idle machine, at or above the 1198-test baseline
  plus this plan's additions.
- `npm run lint` clean.
- `git diff main --stat` names exactly three files:
  `scanner-service/src/trade-detection.ts`, `lib/trade-detection.test.ts`,
  `tests/fixtures/own-site-zones.ts`.
- `git diff main -- lib/niche-profile/ supabase/migrations/` is empty.
- Three commits, in order: the red tests, the fix, and whatever record the
  orchestrator asks for.
</verification>

<success_criteria>
A multi-page site whose footer names a trade no longer wins that trade and no
longer reads `clear`. A one-page site scores exactly what it scores today. No
weight, cap or threshold moved. No corpus entry moved. The `prepareSite` doc
comment now warns the next reader off simplifying BOTH unions away.
</success_criteria>

<output>
Create `.planning/quick/261116-oky-count-repeated-boilerplate-text-once-acr/261116-oky-SUMMARY.md` when done.
</output>
</content>
</invoke>
