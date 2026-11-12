# Phase 9: Niche Profile & Own-Site Engine Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-11-12
**Phase:** 9-Niche Profile & Own-Site Engine Data
**Areas discussed:** Pending todos, Job values per trade, Trade assignment, Profile shape and copy, The scoreable rule

---

## Pending todos

**Match presented:** `2026-07-24-random-import-from-target-categories.md`, "Add random import mode, TARGET_CATEGORIES and TARGET_REGIONS sampling" (area: triage, score 0.9).

| Option | Description | Selected |
|--------|-------------|----------|
| Fold it in | The profile's trades become the import target list. One list, not two. Adds importer work to this phase. | ✓ |
| Note as deferred | Keep Phase 9 on profile and extractors only. The todo stays pending and risks a second category list later. | |

**Joshua's choice:** Fold it in.
**Notes:** The fold produced D-9-11, which separates the two lists by job: Overture categories to import, and trades with keyword lists. `EXCLUDED_CATEGORIES` stays in `lib/triage-constants.ts` because `isReleasable` reads it as a negative guard. The todo's own request that Joshua confirm the seed lists before locking is still owed.

---

## Job values per trade

### Who sources the job values?

| Option | Description | Selected |
|--------|-------------|----------|
| I research, you approve | Claude pulls Dutch public sources per trade, writes each number with its citation, Joshua says yes or no to each. Slower, every number traceable. | ✓ |
| You give the numbers | Joshua types the numbers from his own market knowledge. Fast, citation is "Joshua, dated". Honest but weaker in front of a stranger. | |

**Joshua's choice:** I research, you approve.

### What does the number mean?

| Option | Description | Selected |
|--------|-------------|----------|
| Customer invoice total | What the homeowner pays for the job. Easy to source and check. | ✓ |
| Installer gross margin | What the installer keeps. Closer to real value, but almost nothing publishes it. | |

**Joshua's choice:** Customer invoice total.

### Which trades go in the first profile?

| Option | Description | Selected |
|--------|-------------|----------|
| All six | Heat pump, solar, bathroom, kitchen, roofing, central heating. Six numbers to verify. | ✓ |
| A smaller set first | Only the trades Joshua sells to today. Fewer numbers, and the profile proves it can grow. | |

**Joshua's choice:** All six.

### A trade has no verified number yet. What does the engine do?

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the money line | The report renders without a money line for that trade. Nothing invents a figure. | ✓ |
| Block the profile | The profile refuses to load until every trade has a cited number. Safest, but one missing number stops all work. | |

**Joshua's choice:** Hide the money line.
**Notes:** This is PROJECT.md's "never invent a loss figure" rule applied to an unverified trade.

---

## Trade assignment

**Evidence presented before the questions.** `data/overture-categories.json`, four NL provinces, counted by businesses that have a website: `contractor` 10,491; `building_or_construction_service` 5,638; `plumbing` 2,094; `electrician` 1,997; `roofing` 1,908; `building_contractor` 1,118; `hvac_service` 953. No heat pump, solar, kitchen or bathroom category exists.

### Where does a prospect's trade come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Read off their own site | The only source that can tell a heat pump installer from a roofer. Needs new detection work. | ✓ |
| Map the Overture category | Cheap and already stored, but 16,000 of 20,000 businesses land in "contractor" with no trade. | |

**Joshua's choice:** Read off their own site.

### What decides the trade from the site?

| Option | Description | Selected |
|--------|-------------|----------|
| Keyword list in the profile | Dutch keywords per trade in the profile. Code counts matches and picks the winner. Deterministic and auditable. | ✓ |
| Gemini reads the page | Handles odd wording better, but the trade chooses the money figure, so a model would be indirectly choosing a number. | |

**Joshua's choice:** Keyword list in the profile.

### Can one business carry more than one trade?

| Option | Description | Selected |
|--------|-------------|----------|
| One primary trade | The strongest match wins. One money line, one set of checks, one set of AI questions. | ✓ |
| A ranked set | Store every trade found, use the top one. Richer data, more shapes for Phase 11 and 12. | |

**Joshua's choice:** One primary trade.

### No trade can be read from the site. What then?

| Option | Description | Selected |
|--------|-------------|----------|
| Still scoreable, no money line | All six checks and a total score survive. Only the money line goes quiet. | ✓ |
| Not scoreable | Dropped before any scan cost. Cheaper, but throws away prospects whose website is merely vague. | |

**Joshua's choice:** Still scoreable, no money line.

---

## Profile shape and copy

**Evidence presented before the questions.** `scanner-service/Dockerfile:22` copies exactly one file out of `lib/`, and `scanner-service/tsconfig.json:21` names that file in `include`. Any new shared file needs both edits, and quick tasks `260806-kbi` and `260806-luk` already hit that trap. Copy lives in `messages/en.json` and `messages/nl.json` through next-intl.

### What form does the niche profile take?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript module | Typed, checked at build time. A typo fails the build. Changing a number needs a deploy. | ✓ (Claude's recommendation) |
| JSON data file | Editable with no deploy, but a typo only shows at runtime and types must be asserted by hand. | |

**Joshua's response (free text):** "I dont know which one is better for this use case."
**Notes:** Claude recommended the TypeScript module and gave four reasons: the type can force NIC-02's citation field; three existing config modules already use the pattern; a typo becomes a build error rather than a blank money line; and the no-deploy win of JSON is weak when the file holds prospect-facing copy. Claude also recorded the consequence that the value field stays optional while the citation is required whenever a value is present, and that the profile splits into a small folder of modules. Joshua was invited to overrule and did not.

### Where does report copy live?

| Option | Description | Selected |
|--------|-------------|----------|
| Stay in next-intl messages | One place for all copy, bilingual already works. The profile holds keys, not sentences. | |
| Move into the profile | A new niche is one file. Matches NIC-01 literally, but splits copy across two systems. | ✓ |

**Joshua's choice:** Move into the profile.

### Does the profile also hold the Overture import categories?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both lists in the profile | Overture categories to import, and trades with keywords. Two lists, two jobs, one file. | ✓ |
| Keep the import list in triage-constants | Sits beside EXCLUDED_CATEGORIES, but a new niche then touches two files, weakening NIC-04. | |

**Joshua's choice:** Yes, both lists in the profile.

### How does the profile reach the Railway scanner?

| Option | Description | Selected |
|--------|-------------|----------|
| Passed in the scan request | No Dockerfile change, no second deploy surface, no boot trap. | ✓ |
| Copied into the image | Scanner reads it directly, but it is the exact change that broke the build twice. | |

**Joshua's choice:** Passed in the scan request.

---

## The scoreable rule

**Evidence presented before the questions.** `prospect_sources.raw_confidence` already stores Overture confidence. The importer collapses several Overture rows into one prospect by domain, so a second match is already visible as a second source row. `lib/domain-normalize.ts` already has `isAggregatorDomain()`. Nothing anywhere stores coordinates.

### "Exactly one Overture match", how do we count it?

| Option | Description | Selected |
|--------|-------------|----------|
| One match above the limit | Count only source rows above the confidence limit. A weak duplicate is ignored. | ✓ |
| Exactly one source row | Strictest reading, drops businesses for a data-quality fault that is Overture's. | |

**Joshua's choice:** One match above the limit.

### ENG-06 needs a point on a map. Nothing stores one today.

| Option | Description | Selected |
|--------|-------------|----------|
| Store lat/lon at import now | Phase 10's radius needs them anyway, so the work happens once. Existing rows fill on re-import. | ✓ |
| Street address only for now | Less work now, but Phase 10 then adds coordinates and re-imports anyway. | |

**Joshua's choice:** Store lat/lon at import now.

### Where does the scoreable rule run?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside isReleasable | One rule, one place. Cheap triage still runs; the expensive full scan stays gated. | ✓ |
| At import | Cleanest list, but import-time data is thinner, so good businesses get dropped on a missing field. | |

**Joshua's choice:** Inside isReleasable.

### A business fails the rule. What happens to the row?

| Option | Description | Selected |
|--------|-------------|----------|
| Kept and marked | Flagged not scoreable, never released, never drafted. Same shape as the Phase 4.1 unreachable rule. | ✓ |
| Deleted | Smaller table, but the record of what was dropped is lost and a re-import brings it back. | |

**Joshua's choice:** Kept and marked.

---

## Closing gate

| Option | Description | Selected |
|--------|-------------|----------|
| I'm ready for context | Write CONTEXT.md now; the three remaining items go in as Claude's discretion. | ✓ |
| Explore more gray areas | Discuss the three first. | |

**Joshua's choice:** I'm ready for context.

## Claude's Discretion

Offered and left to Claude:

- Where the extracted facts are stored, with missing fields representable.
- The shape of the ENG-07 guard test.
- Whether on-site `AggregateRating` review counts are read and stored.

Not offered, assigned by convention:

- The numeric confidence limit, seeded from the live `raw_confidence` distribution.
- The seed keyword lists per trade.
- The migration shape for coordinates and the not-scoreable marker.
- How the profile folder splits into modules, and naming.
- Test approach per project conventions.

## Deferred Ideas

None. The discussion stayed inside the phase boundary. No scope creep was raised and none had to be redirected.
