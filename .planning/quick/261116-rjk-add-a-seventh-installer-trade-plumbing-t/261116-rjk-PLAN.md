---
phase: quick
plan: 261116-rjk
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md
  - lib/niche-profile/types.ts
  - lib/niche-profile/installers/trades.ts
  - lib/niche-profile/installers/checks.ts
  - lib/niche-profile/profile.test.ts
  - tests/fixtures/own-site-zones.ts
autonomous: true
requirements: [NIC-01, NIC-02, ENG-01, QT-261116-rjk]

estimate:
  tokens: 58000
  raw_tokens: 29000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`TradeId` carries a seventh member, `plumbing`, and `INSTALLERS_TRADES` holds seven entries. The six existing ids, amounts, keyword lists and tieBreakRanks are byte-identical to HEAD."
    - "plumbing carries jobValue 300 EUR, derivation \"published\", citing Homedeal \"Lekkage opsporen kosten\", readOn 2026-11-16, and its citation note records the page's internal conflict (header average 300, body range 200 to 400, FAQ 300 to 500) rather than silently picking one."
    - "plumbing has a jobValue AND showMoneyLine false. It is the SECOND trade with that combination (central_heating is the first, D-9-21). The two fields stay independent and a test names both, so a third cannot be added silently."
    - "plumbing.tieBreakRank is 7. No existing rank is renumbered. Ranks stay unique across all seven."
    - "A realistic Dutch loodgieter site (gutters, leaks, water mains, with roof words present) resolves to plumbing with confidence clear. Proven by a NEW corpus entry, and proven to discriminate by a throwaway probe showing the same entry resolves to roofing when the plumbing trade is removed from the slice."
    - "A genuine zinc and lead roofer (loodwerk, zinkwerk, dakgoot, no occurrence of the word loodgieter) still resolves to roofing with confidence clear. Proven by a second NEW corpus entry."
    - "Every one of the 18 entries already in OWN_SITE_ZONE_CORPUS resolves to exactly the tradeId and confidence it resolves to today. Not one moves. `git diff -- tests/fixtures/own-site-zones.ts` is PURELY ADDITIVE."
    - "The roofing keyword list is untouched. `{ term: \"dak\", match: \"prefix\" }` is still present and is asserted by profile.test.ts line 211."
    - "ZONE_WEIGHTS, ZONE_HIT_CAPS, BOILERPLATE_HIT_CAPS, minTradeScore 8 and dominanceRatio 1.5 are byte-identical to HEAD. scanner-service/src/trade-detection.ts is not opened."
  artifacts:
    - ".planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md: a section 7 for plumbing, a seventh table row, a corrected header count and status line, and a What is still owed entry recording the page's internal conflict. This file changes FIRST and the profile follows it."
    - "lib/niche-profile/types.ts: the TradeId union gains `plumbing`; its doc comment stops claiming six and names where the seventh came from."
    - "lib/niche-profile/installers/trades.ts: a seventh TradeProfile entry; a second READ_ON and RECHECK_AFTER pair for the 2026-11-16 read; the file header's measured-corrections list extended in the same evidence-first voice."
    - "lib/niche-profile/installers/checks.ts: a `plumbing` entry in INSTALLERS_SITE_CHECKS carrying the shared quote and project terms and GENERIC_CERTIFICATION_TERMS, with a comment saying no plumber scheme was searched for or cited in this task."
    - "lib/niche-profile/profile.test.ts: EXPECTED_AMOUNTS and ALL_TRADE_IDS gain plumbing; a new EXPECTED_READ_ON literal table replaces the single hardcoded read date; the six-trade count assertions become seven; the money-line assertion names BOTH showMoneyLine-false trades."
    - "tests/fixtures/own-site-zones.ts: two new OWN_SITE_ZONE_CORPUS entries, `plumber-gutters-and-leaks` expecting plumbing/clear and `zinc-roofer-lead-work` expecting roofing/clear, composed from measured site classes with invented business names, following the file header's provenance rules."
  key_links:
    - "Adding to the TradeId union makes lib/niche-profile/installers/checks.ts a COMPILE ERROR until a plumbing entry exists, because INSTALLERS_SITE_CHECKS is typed Readonly<Record<TradeId, TradeSiteChecks>>. types.ts, checks.ts, trades.ts and profile.test.ts therefore land in ONE commit; no commit is red."
    - "profile.test.ts line 154 asserts `citation.readOn === \"2026-11-12\"` for EVERY trade in a loop. plumbing is read on 2026-11-16, so that loop MUST become a literal table (EXPECTED_READ_ON) or the suite goes red. This is the single most likely thing to be missed."
    - "The keyword term is the full word `loodgieter`, never the bare stem `lood`. uitendaal-harmelen.nl is a genuine zinc and roof firm measured at lood x6 and dak x6; a `lood` prefix term would take it to plumbing and regress a real roofer. The zinc-roofer corpus entry pins this."
    - "`plumber-multi-trade` (own-site-zones.ts line 231) computes to a 19/19 EXACT TIE between bathroom and plumbing after this change. It stays bathroom ONLY because plumbing ranks 7 and bathroom ranks 3. Its runnerUpId changes from roofing to plumbing and its margin from 3 to 0, neither of which any test asserts. If plumbing were ranked above bathroom this entry WOULD move, which is Joshua's call and not the executor's."
    - "`installer-with-vacancies` (line 306) scores plumbing 5 from the word loodgieter in its title, against minTradeScore 8. It stays unreadable by 3 points. It is the existing entry closest to moving; if the keyword list is widened beyond the four terms in Task 2, re-check it before anything else."
    - "`riool` / `riolering` / `ontstopping` are deliberately NOT in the keyword list. The 49-scan evidence records sewer-only and ventilation firms reading as no trade and says that reading is correct. Adding them would change that class's behaviour, which this task was not asked to do."
---

<objective>
Add a seventh installer trade, `plumbing`, so Dutch loodgieter sites stop being
forced into roofing, bathroom or kitchen by secondary mentions.

Purpose: across 49 production scans (34 unique domains) 11 of the 18 domains that
resolved to a trade read `roofing`, while 12 of the 34 domains carry `loodgieter`
in the domain name. Plumbing was not one of the six trades, so a plumber's
everyday vocabulary (`dakgoot`, `daklekkage`) landed on roofing's `dak` prefix
term and the engine answered confidently and wrongly. A wrong trade selects a
wrong job value and a wrong pitch.

Output: three commits. The approved-numbers document first, then the trade
itself through every layer that types it, then the regression corpus proof.

Task 2 is the vertical slice: the union, the profile entry, the per-trade checks
and the scanner slice either carry plumbing end to end or they do not compile.
There is no architecture to prove here, so the slice is the whole change and
Tasks 1 and 3 are its paperwork and its gate.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@lib/niche-profile/types.ts
@lib/niche-profile/installers/trades.ts
@lib/niche-profile/installers/checks.ts
@lib/niche-profile/profile.test.ts
@tests/fixtures/own-site-zones.ts
</context>

<ground_rules>
- `git add -A` and `git add .` are forbidden. Stage the named files only.
  `.planning/milestone.lock` and `.planning/state.json` are untracked and must
  stay untracked.
- No em-dashes in any prose written into any file (project writing rule).
- Do NOT open `scanner-service/src/trade-detection.ts`. No weight, cap,
  threshold or scoring rule changes in this task.
- Do NOT delete or edit an existing `OWN_SITE_ZONE_CORPUS` entry, including its
  `note`. The diff on that file must be purely additive.
- The full suite needs an IDLE machine. Running `npx vitest run` while another
  agent works times out and reports a false failure (see the machine note in
  project memory). Use the targeted commands in each task; run the full suite
  only when nothing else is running.
- Every path below is repo-root-relative and every command assumes cwd at the
  checkout root.
</ground_rules>

<tasks>

<task type="auto">
  <name>Task 1: Record the approved plumbing job value in 09-JOB-VALUES.md</name>
  <files>.planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md</files>
  <read_first>
    Read the whole file. Sections 1 to 6 set the voice and the shape: source,
    URL in backticks, Read date, Basis, a Cross-check where one exists, and a
    "One thing to weigh" paragraph that names the weakness of the figure.
    Section 6 is the closest model, because it is the other trade that has a
    value and prints no money line.
  </read_first>
  <action>
    Four edits, all scoped, in this order.

    One. The header block. "Status: all six approved by Joshua, 2026-11-12"
    becomes a two-line record: the original six approved 2026-11-12, and
    plumbing approved 2026-11-16. Leave the Requirement and Decisions lines
    alone except to note that D-9-03 scoped Phase 9 to six trades and that
    plumbing was added afterwards by quick task 261116-rjk, driven by 49
    production scans.

    Two. The table. Retitle "The six values" to "The seven values" and append a
    row: Plumbing, "EUR 300, no money line", "Marketplace average",
    "[x] 2026-11-16". Match the existing EUR formatting used in the table
    exactly as it appears in the file; do not restyle the other six rows.

    Three. A new section 7, placed after section 6 and before "What is still
    owed". Source: Homedeal, "Lekkage opsporen kosten", URL
    https://www.homedeal.nl/prijsgidsen/lekkage-opsporen-kosten/ in backticks
    like the others. Read: 2026-11-16. Basis: leak detection, the page's stated
    average. Then a "One thing to weigh" paragraph that states the conflict ON
    the page and does not resolve it: the header states an average of 300 with a
    minimum of 150 and a maximum of 500, the body states a project range of 200
    to 400, and the FAQ states 300 to 500. The approved number is the page's
    stated average of 300. Say plainly that the three statements disagree and
    that 300 was taken because it is the figure the page itself labels as the
    average, not because the others were discounted.

    Then a paragraph mirroring section 6's money-line reasoning, in this file's
    voice: an Adashi project is EUR 2.500 or more, so at EUR 300 the "one extra
    job pays for the website" sentence is false by a wider margin than it is for
    central heating. Plumbing therefore carries a value AND prints no money line
    (D-9-21), approved by Joshua on 2026-11-16. Say that this is the second
    trade in that state and that the two fields stay independent.

    Also record the page-date honesty call: the page shows a PUBLICATION date of
    30/12/2025, not a last-updated label, so the profile citation omits the
    `pageUpdated` field (which sections 3, 4 and 5 use for a genuine
    last-updated date) and carries the publication date inside the citation note
    instead. State why: using a last-updated field to hold a publication date
    would make `pageUpdated` mean two different things across the Homedeal
    sourced trades.

    Four. "What is still owed". Update the first bullet so it no longer says all
    six were approved on one date, and add a bullet naming the open question:
    this is a leak-detection figure standing in for the whole trade, and a
    plumber whose work is mostly bathroom or kitchen connection is worth more
    than 300, so the figure is the weakest of the seven and is the first
    candidate for a re-read.
  </action>
  <verify>
    <automated>test "$(grep -c '^## 7\.' .planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md)" = 1 &amp;&amp; test "$(grep -c 'lekkage-opsporen-kosten' .planning/phases/09-niche-profile-own-site-engine-data/09-JOB-VALUES.md)" -ge 1</automated>
  </verify>
  <done>
    The file carries a section 7 for plumbing, a seventh table row, an accurate
    header status, and a What-is-still-owed entry. The conflict between the
    page's header, body and FAQ figures is written down, not resolved away. No
    number in sections 1 to 6 moved. Committed on its own, before any code
    change, so the ordering rule (this file changes first, the profile follows)
    is visible in the history.
  </done>
</task>

<task type="tracer" tdd="true">
  <name>Task 2: Add the plumbing trade through the union, the profile and its tests</name>
  <files>lib/niche-profile/types.ts, lib/niche-profile/installers/trades.ts, lib/niche-profile/installers/checks.ts, lib/niche-profile/profile.test.ts</files>
  <behavior>
    The tests below are written in the SAME commit as the profile change,
    because adding a member to the TradeId union makes checks.ts fail to
    compile until its plumbing entry exists. No commit is red.

    - getTrade(INSTALLERS_PROFILE, "plumbing") returns a trade whose
      jobValue.amountEur is 300 and whose derivation is "published".
    - That trade's citation source is Homedeal, its readOn is "2026-11-16", its
      url starts with https, and its note mentions all three of the page's
      figures so the conflict is inspectable from the profile alone.
    - The citation carries no pageUpdated field (the page shows a publication
      date, not a last-updated label).
    - plumbing.jobValue is defined AND plumbing.showMoneyLine is false, asserted
      as one expression, exactly the way the central_heating case is asserted
      today.
    - Exactly two trades have showMoneyLine false, and they are central_heating
      and plumbing, asserted by name so a third cannot appear unnoticed.
    - The profile holds seven trades, every TradeId exactly once, and seven
      unique tieBreakRanks. plumbing.tieBreakRank is 7.
    - plumbing's keywords contain { term: "loodgieter", match: "substring" } and
      contain NO term equal to "lood" after normalisation, which is the term
      that would take a zinc roofer.
    - plumbing's certificationTerms are exactly the three generic terms, the
      same set roofing, bathroom and kitchen carry.
    - staleJobValues returns seven ids long after every recheck date, returns
      the original six (and not plumbing) on 2027-11-12, and returns nothing on
      2026-11-13.
  </behavior>
  <read_first>
    lib/niche-profile/profile.test.ts lines 19 to 43 (the two literal tables),
    135 to 196 (the all-six block), 198 to 243 (keywords and certifications) and
    338 to 352 (staleJobValues). lib/niche-profile/installers/trades.ts lines 1
    to 36 (the header comment and the two date constants) and the
    central_heating entry at the end, which is the model for a trade with a
    value and no money line.
  </read_first>
  <action>
    lib/niche-profile/types.ts. Add `| "plumbing"` to the TradeId union. Rewrite
    the one-line doc comment above it so it no longer claims six: say the
    profile ships seven installer trades, that Phase 9 shipped six under D-9-03,
    and that plumbing was added by quick task 261116-rjk after 49 production
    scans showed Dutch plumber sites resolving to roofing. Keep the "a typo is a
    build error" sentence.

    lib/niche-profile/installers/checks.ts. Add a `plumbing` key to
    INSTALLERS_SITE_CHECKS carrying QUOTE_TERMS, PROJECT_TERMS and
    GENERIC_CERTIFICATION_TERMS. Extend the comment above the object so it says
    roofing, bathroom, kitchen AND plumbing carry the generic terms, and add one
    sentence recording honestly that no search for a Dutch plumber
    certification scheme was run in this task, so none is claimed; the energy
    trades' InstallQ and Techniek Nederland terms were NOT copied across,
    because nothing here measures that plumbers carry them. Mark it [ASSUMED]
    the same way the existing comment does.

    lib/niche-profile/installers/trades.ts. Two date constants for the second
    read, next to the existing pair and named so the pairing is obvious: the
    read date 2026-11-16 and a recheck date twelve months later, 2027-11-16.
    Then a seventh entry appended after central_heating:

      id "plumbing"; jobValue amountEur 300, derivation "published",
      recheckAfter the new constant, citation source "Homedeal", url
      https://www.homedeal.nl/prijsgidsen/lekkage-opsporen-kosten/, readOn the
      new constant, and NO pageUpdated field. The citation note must carry four
      things in one sentence or two: that this is leak detection, that the page
      states an average of 300 with a minimum of 150 and a maximum of 500, that
      the same page's body states 200 to 400 and its FAQ 300 to 500, and that
      the page shows a publication date of 30/12/2025 rather than a last-updated
      label, which is why pageUpdated is absent. Above the entry, a comment in
      the style of the central_heating comment: the value is known and approved
      and does not support the one-extra-job claim, so this trade has a value
      AND prints no money line, two independent fields and never one switch
      (D-9-21).

      showMoneyLine false. tieBreakRank 7, with a one-line comment giving the
      reason: appended rather than inserted so no existing rank is renumbered,
      and last is also the honest place, because plumbing's vocabulary is the
      most likely of the seven to appear incidentally on another trade's site,
      so on an exact tie the other trade is the better read.

      keywords, exactly these four and no more:
        { term: "loodgieter", match: "substring" }
        { term: "lekkage", match: "substring" }
        { term: "dakgo", match: "prefix" }
        { term: "waterleiding", match: "substring" }

      siteChecks INSTALLERS_SITE_CHECKS.plumbing and aiQuestions
      EMPTY_AI_QUESTIONS, matching the other six.

    Extend the file header's measured-corrections list with three plumbing
    bullets in the same evidence-first voice, each naming what was measured:
      - plumbing carries the full word for a plumber and never the bare
        four-letter stem that also names the metal, because a measured zinc and
        roof firm wrote that stem six times and is a genuine roofer;
      - the gutter term is a shortened stem, because the singular and the plural
        of the Dutch word for a roof gutter diverge after five letters, the same
        reason the solar term is shortened;
      - the leak term is shared in effect with roofing, which keeps its own
        prefix term untouched: a leak word is counted for both trades and the
        rest of the site decides, which is the honest reading of a word both
        trades really use.

    lib/niche-profile/profile.test.ts. Add plumbing to EXPECTED_AMOUNTS (300)
    and to ALL_TRADE_IDS, both appended last to mirror the rank. Add a third
    literal table, EXPECTED_READ_ON, a Readonly<Record<TradeId, string>> giving
    2026-11-12 for the original six and 2026-11-16 for plumbing, and change the
    citation loop that currently asserts a single hardcoded read date for every
    trade so it reads from that table instead. Update the comment above the
    tables so it describes seven amounts and two read dates and still explains
    why they are written out rather than derived (T-9-04).

    Then: the count assertions move from six to seven in the exhaustive-ids test
    and in the staleJobValues far-future test; the describe title stops saying
    six; the money-line test excludes BOTH central_heating and plumbing and
    gains a sibling assertion for plumbing shaped exactly like the
    central_heating one, plus the named-pair assertion from the behaviour block;
    the certification test's three-generic-trades list becomes four; and the
    2027-11-12 staleness case asserts the six original ids by name rather than a
    bare length, because plumbing's later recheck date would otherwise keep that
    number at six for a reason the test does not state. Add one assertion that
    plumbing's keyword list carries no bare metal-name term.

    Do not touch any existing amount, rank, keyword, certification list or
    assertion for the six existing trades.
  </action>
  <verify>
    <automated>npx vitest run --project unit lib/niche-profile/ &amp;&amp; npx tsc --noEmit &amp;&amp; npx tsc --noEmit -p scanner-service/tsconfig.json</automated>
  </verify>
  <done>
    Both tsc projects are clean (the root tsconfig excludes scanner-service, so
    the root check alone leaves the scanner unverified). The niche-profile unit
    tests pass with seven trades. `git diff --stat` for this commit names
    exactly four files. The roofing keyword list is unchanged, provable by
    `git diff -- lib/niche-profile/installers/trades.ts` showing no removed line
    inside the roofing entry.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove it on the corpus, and HALT if any existing entry moves</name>
  <files>tests/fixtures/own-site-zones.ts</files>
  <read_first>
    tests/fixtures/own-site-zones.ts lines 1 to 60 (the provenance rules and
    makeZones) and the `plumber-multi-trade` entry at line 231, which is the
    entry this change comes closest to moving. lib/trade-detection.test.ts lines
    652 to 724, the corpus block that will run the new entries.
  </read_first>
  <action>
    Append two entries to OWN_SITE_ZONE_CORPUS, after the last entry. Both are
    composed from measured site classes with invented business names, never a
    capture of a named live site, per the file header's provenance rules.

    Entry one, id `plumber-gutters-and-leaks`. Its note says: a Dutch plumber
    whose work is gutters, leaks and water mains, the class measured at dak x11,
    lood x21 and lekkage x10 on a real scan that resolved to roofing. A person
    reads a plumber. Roof words are present and must not win. One page.
      title: "Willemsen Loodgieters | Lekkage, dakgoot en waterleiding in Alkmaar"
      h1: ["Loodgieter voor lekkage en dakgoten"]
      h2h3: ["Daklekkage snel verholpen", "Dakgoot vervangen of repareren", "Lekkage opsporen", "Waterleiding vervangen"]
      navTexts: ["Loodgieter", "Lekkage", "Dakgoten", "Waterleiding", "Contact"]
      internalPaths: ["/loodgieter", "/lekkage", "/dakgoten", "/waterleiding"]
      bodyText: "Loodgietersbedrijf Willemsen verhelpt lekkage, vervangt dakgoten en zinkwerk en repareert uw waterleiding. Bij daklekkage komen wij dezelfde dag."
      expected: tradeId "plumbing", confidence "clear"
    Planning-time arithmetic, for the executor to check against the real run:
    plumbing 72 (title 20, h1 15, h2h3 8, nav 12, paths 12, body 5), roofing 22.
    72 is at or above 22 x 1.5, so the reading is clear.

    Entry two, id `zinc-roofer-lead-work`. Its note says: a genuine zinc and
    lead roofer, the class measured at dak x6 and lood x6 that resolves to
    roofing with a wide margin today. It writes the metal, never the word for a
    plumber, which is exactly why the plumbing term is the full word and not the
    four-letter stem. One page.
      title: "Uithof Dakwerken | Zinkwerk en loodwerk voor pannendaken"
      h1: ["Dakwerken, zinkwerk en loodwerk"]
      h2h3: ["Loodslabben vervangen", "Zinken dakgoot", "Pannendak reparatie"]
      navTexts: ["Dakwerken", "Zinkwerk", "Loodwerk", "Contact"]
      internalPaths: ["/dakwerken", "/zinkwerk", "/loodwerk"]
      bodyText: "Wij werken met lood en zink op het dak. Loodwerk rond schoorstenen, nieuwe zinken dakgoot en reparatie van uw pannendak."
      expected: tradeId "roofing", confidence "clear"
    Planning-time arithmetic: roofing 20, plumbing 3 (the gutter term only), so
    plumbing never reaches the minimum of 8 and roofing reads clear.

    Then run the discrimination probe. Write a throwaway script in the
    scratchpad directory, never in the repo and never committed, that imports
    detectTrade, toScannerSlice and INSTALLERS_PROFILE, builds a slice with the
    plumbing trade filtered OUT, and runs `plumber-gutters-and-leaks` against
    it. It must resolve to roofing. That is the bug this task exists to fix, and
    it is what proves the new entry discriminates rather than passing for free.
    Record the before and after readings in the task notes. Delete the script.

    HALT CONDITION, not optional. Run the corpus suite. If ANY existing entry's
    tradeId or confidence changes, STOP, change nothing further, and surface to
    Joshua: the entry id, what it resolved to before, what it resolves to now,
    and the scores behind the move. Moving an existing expectation is his
    decision and never the executor's. Do not delete an entry, do not edit an
    entry's expected value, and do not move an entry into
    OWN_SITE_ZONE_KNOWN_GAPS to make the suite pass.

    One expected non-move the executor should confirm by eye rather than assume:
    `plumber-multi-trade` now ties at 19 for bathroom and 19 for plumbing. It
    stays bathroom because bathroom ranks 3 and plumbing ranks 7. Its
    runnerUpId silently changes from roofing to plumbing and its margin from 3
    to 0, and no test asserts either. If the suite shows that entry resolving to
    plumbing, something in Task 2 ranked plumbing wrongly: fix the rank, do not
    touch the fixture.
  </action>
  <verify>
    <automated>npx vitest run --project unit lib/trade-detection.test.ts lib/niche-profile/ &amp;&amp; CORPUS_DIFF=$(git diff -- tests/fixtures/own-site-zones.ts) &amp;&amp; test "$(printf '%s\n' "$CORPUS_DIFF" | grep -c '^-[^-]')" = 0 &amp;&amp; npx tsc --noEmit &amp;&amp; npx tsc --noEmit -p scanner-service/tsconfig.json</automated>
  </verify>
  <done>
    The corpus holds 20 entries. The new plumber entry resolves to plumbing with
    confidence clear, and the probe recorded it resolving to roofing with the
    plumbing trade removed. The new zinc roofer resolves to roofing with
    confidence clear. All 18 pre-existing entries resolve exactly as they do on
    HEAD, and the diff on tests/fixtures/own-site-zones.ts removes no line.
    OWN_SITE_ZONE_KNOWN_GAPS is still an empty array.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Scanned stranger's page to the scanner process | page text is matched against the keyword terms this change adds; the terms themselves are repo-controlled, the text is not |
| Vercel profile to Railway scanner | the four new terms travel inside the NicheScanSlice on every scan request |
| Detected trade to the prospect-facing report | the trade selects a job value and a citation that a stranger reads, so a wrong trade is a wrong number in front of a prospect |

No new boundary, no new external call, no new stored column, no new dependency.

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-rjk-01 | Tampering | a new keyword term stealing a genuine roofer | high | mitigate | The term is the full word for a plumber, never the four-letter metal stem a measured zinc roofer writes six times. Pinned by the `zinc-roofer-lead-work` corpus entry and by a profile test asserting no bare metal term exists in the list. The roofing keyword list is untouched and its `dak` prefix assertion still stands. |
| T-rjk-02 | Tampering | the 18-entry corpus silently re-baselined to make a test pass | high | mitigate | The diff on tests/fixtures/own-site-zones.ts must remove no line, gated by a command in Task 3. Deleting an entry, editing an expected value, or demoting an entry into the known-gaps register are each named and forbidden. A move is a HALT and goes to Joshua. |
| T-rjk-03 | Information disclosure | a wrong or conflicting figure printed to a prospect | high | mitigate | The citation note carries all three figures the page states and says which one was taken and why. showMoneyLine is false, so the 300 is never used for the one-extra-job claim, and the two fields stay independent, pinned by a test naming both showMoneyLine-false trades. |
| T-rjk-04 | Denial of service | hostile page text against the new terms | low | accept | No scoring code is opened. MAX_TEXT_CHARS, MAX_PAGES, MAX_TERMS_PER_TRADE and the zone hit caps are unchanged, and four more literal terms on one more trade is bounded work under MAX_TRADES 50. |
| T-rjk-05 | Repudiation | the profile diverging from the approved-numbers document | medium | mitigate | 09-JOB-VALUES.md changes in its own commit BEFORE the profile, and profile.test.ts asserts the amount and the read date against literal tables, so a number edited in one place and not the other fails the build (T-9-04). |
| T-rjk-SC | Tampering | npm/pip/cargo installs | low | accept | No package-manager install is in scope and no dependency enters the stack, so the package-legitimacy gate has nothing to audit. It stays armed for any future install. |
</threat_model>

<verification>
- Both tsc projects clean: root `tsconfig.json` (which excludes
  scanner-service) and `scanner-service/tsconfig.json`. Neither alone is
  sufficient.
- `npx vitest run --project unit lib/niche-profile/` green.
- `npx vitest run --project unit lib/trade-detection.test.ts` green, including
  the per-entry corpus cases and the reversed-order case.
- `npm run lint` clean.
- `npx vitest run` green on an IDLE machine, at or above the 1266-test baseline
  plus this plan's additions. On a busy machine this times out and reports a
  false failure; do not treat that as a red suite.
- `git diff main --stat` names exactly six files and no more.
- `git diff main -- scanner-service/ supabase/migrations/` is empty.
- `git diff -- tests/fixtures/own-site-zones.ts` removes no line.
- Three commits, in order: the approved-numbers document, the trade, the corpus.
</verification>

<success_criteria>
A Dutch loodgieter site reads `plumbing`, not `roofing`. A zinc and lead roofer
still reads `roofing`. The seventh trade carries an approved, cited 300 EUR value
whose source conflict is written down rather than resolved away, and prints no
money line. No existing trade, rank, keyword or corpus expectation moved.
</success_criteria>

<output>
Create `.planning/quick/261116-rjk-add-a-seventh-installer-trade-plumbing-t/261116-rjk-SUMMARY.md` when done.
</output>
