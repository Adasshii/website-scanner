# Roadmap: Prospect Radar

## v2.0 — Renewed Scanner

**Goal:** turn the scanner from a website grader into a sales tool for Dutch installers, where every problem in the report leads to an Adashi service.

**Source plan:** `docs/v2-renewed-scanner-plan.md` (revision 2, adversarially reviewed 2026-11-11; findings in `docs/v2-renewed-scanner-plan-REVIEW.md`). The v1.0 roadmap is archived at `.planning/milestones/v1.0-ROADMAP.md`, its phase folders at `.planning/milestones/v1.0-phases/`.

## Overview

v1.0 built a funnel: find a business, triage it cheaply, scan the worst, extract a contact, draft a message, gate the send. v2.0 changes what the scan *says*. Six checks per business instead of one website grade, on sources we are allowed to store, scored once and rendered once, so an installer reading the report sees where they lose customers rather than a page of Lighthouse numbers.

The build order follows the dependency chain, not the runtime chain. The niche profile comes first because the competitor radius, the AI questions, the per-trade website checks and the job values all live in it, and three of the six checks read from it. Then the outside evidence, which needs the per-site extractors to already exist so the comparison is like for like. Then one score, which is the dangerous phase: it replaces the score on the public scanner at `/`, and that scanner earns money today. Then the report. Then outbound last, because the message carries a link to a report that must exist first.

Two things are deliberately held flat. **AI visibility ships as displayed evidence at zero weight**, so no scoring decision depends on a probe we have not yet seen 50 scans of. And **nothing Google returns is ever written to the database**: Google appears only as a live on-screen band on the report, fetched on open, attributed, stored nowhere. That rule is enforced by a test in Phase 9, before Phase 12 writes the first Google call.

The legal gate is unchanged from v1.0. Phase 13 builds the mechanism and leaves it refusing.

## Phases

**Phase Numbering:**

- Numbering continues from v1.0, which ended at Phase 8. v2.0 starts at Phase 9.
- Integer phases (9, 10, 11): planned milestone work
- Decimal phases (10.1, 10.2): urgent insertions (marked INSERTED)

- [ ] **Phase 9: Niche Profile & Own-Site Engine Data** - One profile holds the niche, and a scoreable installer's own site yields storable facts, social proof and quote-request evidence
- [ ] **Phase 10: Competitor Position & AI Visibility** - The same signals measured on nearby same-trade competitors, plus an auditable probe of whether an AI assistant names the business at all
- [ ] **Phase 11: One Score, Everywhere** - A single score computed from the six checks replaces the old one, including on the public scanner that earns money today
- [ ] **Phase 12: The New Report** - One page per business that an owner can read, act on, and not find by accident
- [ ] **Phase 13: Outbound — Pick, Approve, Dispatch (GATED)** - Prospects picked before the expensive scan, and an approved body that dispatches under our own gate, shut until counsel answers

## Parallel Track: started now, alongside the build

These are not phases and they do not block Phases 9 to 12. They exist here because their lead time is real and their cost is not.

| Item | Owner | Gates | Status |
|------|-------|-------|--------|
| Counsel closes Tw art. 11.7, the Legitimate Interest Assessment and the Article 14 wording | Joshua + lawyer | Phase 13 shipping (not planning, not building) | OPEN, carried from v1.0 |
| Separate outreach domain, Google Workspace mailbox, SPF/DKIM/DMARC, warm-up on our own traffic only | Joshua | Phase 13 shipping | Not started. Two to three weeks of lead time, about €10/year plus a few euros a month |
| Search for a review source whose terms permit storage (Trustpilot Data Solutions waitlist, Werkspot terms read) | Joshua | Nothing in v2.0. Unlocks the deferred REV-01/REV-02 | Not started |
| Three vendor overrides written down before the vendor is built against: OpenAI (Phase 10), Google Places live-only (Phase 12), the send provider (Phase 13) | Joshua | The phase that introduces each vendor | Not started. Each one is an exception to the "Vercel, Railway, Supabase, Resend, Gemini, Playwright only" constraint and needs recording as such |

## Phase Details

### Phase 9: Niche Profile & Own-Site Engine Data

**Goal**: One settings file defines the niche, and for any business that is scoreable at all, the engine stores what that business's own site says about itself
**Depends on**: Nothing new. Builds on the v1.0 prospect list (Phase 1), the scan pipeline (Phase 4) and the contact extractor (Phase 5)
**Requirements**: NIC-01, NIC-02, NIC-03, NIC-04, ENG-01, ENG-02, ENG-05, ENG-06, ENG-07
**Success Criteria** (what must be TRUE):

  1. A business that fails the scoreable rule is dropped before any scan cost is spent, and can never be scored or emailed: it needs exactly one Overture match above a confidence limit, a website on its own domain (not a Facebook page, not an aggregator listing), and an address or a declared work-area centre (ENG-06)
  2. For a scoreable installer, Joshua can read back from Supabase what the site publishes as machine-readable data (address, phone, opening hours, service area, certifications) and what its own site shows of its reviews (shown at all, how many, how recent, marked up), including the fields that are missing (ENG-01, ENG-02)
  3. The same stored result says whether a customer can actually request a quote: a form, a tap-to-call number, project photos, certifications, using the checks the installers profile names for that trade (ENG-05, NIC-01)
  4. Changing country, locale, trade, competitor radius or copy is a change to the profile file and nothing else, and every default job value in it carries a citation to the source it came from (NIC-02, NIC-03, NIC-04)
  5. A test fails if any field Google returns is written to a Supabase table (ENG-07)

**Plans**: 3/9 plans executed in 5 waves

Plans:
**Wave 1**
- [x] 09-01-PLAN.md — Toolchain baseline and the ENG-07 Google-content guard (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 09-02-PLAN.md — The installers niche profile: trades, values, citations, checks, copy, categories (wave 2)
- [x] 09-03-PLAN.md — Migration 022: Overture coordinates, operating status, the not-scoreable marker, prospect retention (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 09-04-PLAN.md — ENG-06: the scoreable predicate folded into `isReleasable`, and the release and shortlist read paths (wave 3)
- [ ] 09-05-PLAN.md — The own-site harvester and structured business facts (ENG-01) (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 09-06-PLAN.md — Marker refresh, the never-drafted gates, and random import modes (wave 4)
- [ ] 09-07-PLAN.md — On-site social proof and quote-request readiness (ENG-02, ENG-05) (wave 4)
- [ ] 09-08-PLAN.md — Dutch trade detection, no model involved (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 09-09-PLAN.md — The scan request contract, aggregation, migration 022 (wave 5)

Notes:

- **ENG-06 gates everything downstream and belongs in the first plan.** It decides whether a business can be scored at all. It copies the shape of `isReleasable` (`lib/triage-eligibility.ts`), which already works and is already the single releasability rule from Phase 4.1. One predicate closes the "no profile / chain / service-area / wrong match" edge cases instead of five scattered checks.
- **ENG-07 is an enforcement requirement, not a note.** It needs a test that fails first, in the style of `lib/outreach-isolation.test.ts` (which already fails if a dispatch provider enters the outreach path). The guard ships in Phase 9 so that Phase 12's live Google band inherits a rule that is already enforced, rather than being trusted to respect prose. Only `place_id` may be kept; Maps Platform Terms §3.2.3 forbid storing, re-hosting and deriving from ratings, reviews, names and addresses.
- The profile holds copy and design, which the source plan names as the real cost of a new niche, not code. NIC-04 is therefore an architectural claim about the engine reading its parameters from the profile, provable here and re-provable every phase after.
- Country and locale are dimensions of the profile, never hardcoded (`PROJECT.md` Geography constraint). NL is the first target, not the only one.

**Open question for `/gsd-discuss-phase`: CLOSED 2026-11-12.**

- **The per-trade job values awaited Joshua's check** (plan §13 item 7). Closed by D-9-18: all six values were researched from Dutch public sources and approved individually on 2026-11-12, each with its source, URL, the page's own last-updated date and the read date, recorded in `09-JOB-VALUES.md`. Heat pump €12,000 (Milieu Centraal, pre-subsidy invoice total per D-9-19), solar €3,200, bathroom €7,500, kitchen €11,000 (midpoint of the source range, per D-9-20), roofing €5,700, central heating €2,100 with no money line (D-9-21). The profile copies from that file; it never re-derives a number.
- **Added after research, D-9-22:** success criterion 1 now carries a fourth condition. Overture marks 3.7% of sampled installer rows permanently closed and the importer ignores that field, so a business marked permanently closed also fails the scoreable rule.

### Phase 10: Competitor Position & AI Visibility

**Goal**: The business can be placed against nearby same-trade competitors on signals we may keep, and we know whether an AI assistant names it at all
**Depends on**: Phase 9 (the profile's competitor rules and trade questions; the per-site extractors, so competitors are measured on the same signals)
**Requirements**: ENG-03, ENG-04, AIV-01, AIV-02, AIV-03, AIV-04
**Success Criteria** (what must be TRUE):

  1. For a scoreable installer, a competitor set of same-trade businesses within the profile's radius exists, drawn from Overture (ENG-03)
  2. Every competitor in that set has been scanned on the same storable signals as the subject (site quality, structured data, on-site social proof), so no comparison is drawn on a signal only one side was measured on (ENG-04)
  3. For each of the 3 trade questions in the profile, 5 runs at temperature 0 against a pinned model version are stored with the prompt, the model id and every raw response, so a disputed result can be re-read months later (AIV-01, AIV-02, AIV-03)
  4. The AI visibility result reads as a frequency band ("named in 1 of 5 runs"), never as a single score (AIV-04)

**Plans**: TBD

Notes:

- One run is noise, not a measurement. The 5-runs-at-temperature-0 rule and the stored raw responses come from review finding S6 and are the only reason the probe is reportable at all.
- **This phase introduces OpenAI, a genuinely new vendor.** The codebase uses Gemini only (`scanner-service/src/ai.ts`). It needs a key, a spend cap, and a written override against the tech-stack constraint before it is built against. Cost shape: 15 calls per business (3 questions x 5 runs).
- Anything a prospect reads says "an AI assistant", never "ChatGPT".
- Competitor scans run against the existing two-concurrent-slot bulk limit (`scanner-service/src/capacity.ts`) and the once-daily drain (`vercel.json`). A competitor set multiplies scan volume per subject; the phase has to size itself against that, not assume headroom.
- AIV-05 (zero weight) is deliberately not in this phase. It is only observable against a total score, which Phase 11 creates. This phase ships the probe as stored, displayable evidence that feeds no score.

### Phase 11: One Score, Everywhere

**Goal**: One score computed from the six checks is the only score the system has, and the public scanner that earns money today is provably unharmed
**Depends on**: Phase 9 and Phase 10 (all six checks must produce stored data before one score can combine them)
**Requirements**: SCR-01, SCR-02, SCR-03, SCR-04, SCR-05, AIV-05
**Success Criteria** (what must be TRUE):

  1. The public scanner at `/` is verified correct before the new score ships: a real scan still completes, still scores, still renders and still emails, measured rather than assumed, because that surface earns money today (SCR-05)
  2. One score computed from the six checks is what the prospect list, the report and the email all read, and a single `computeVerdict()` source still decides the verdict, so the same number means the same thing in all three places (SCR-01, SCR-02)
  3. Draft generation still picks a citable hook metric from a real scan, because `lib/draft-metric-selector.ts` moved to the new score shape in the same change that introduced it (SCR-03)
  4. A scan already stored under the old score shape still opens and reads correctly (SCR-04)
  5. AI visibility moves the total score by exactly zero points, and is labelled evidence rather than scored (AIV-05)

**Plans**: TBD

Notes:

- **This is the highest-blast-radius phase in the milestone.** SCR-01 replaces the score on a live, revenue-earning product. SCR-05 is the gate: the public scanner is verified correct *before* the new score ships, not after.
- SCR-03 and SCR-04 are in this phase and not a later one by design. `lib/draft-metric-selector.ts` picks every draft's hook metric from the old `scores` shape, so if it moves later, draft generation breaks quietly in between. Scan rows already in the database carry the old shape, so if the render path moves later, historic reports break in between. Either a backfill or a version field plus a dual renderer; that choice belongs to the plan.
- Both scoring modules change: `lib/scoring.ts` and `scanner-service/src/scoring.ts`. They have already diverged once (`.planning/codebase/CONCERNS.md`), and Phase 6 of v1.0 consolidated `computeVerdict()` into one source (DRA-06) precisely to stop that. DRA-06 must stay single. Note the Docker and runtime traps that the v1.0 quick tasks `260806-kbi` and `260806-luk` found around `lib/scoring.ts` crossing into the scanner container: a change here can break the Railway build or its boot without anything looking broken.
- **No new UI.** This phase changes numbers, not surfaces. The existing report and the existing public scanner must keep rendering; Phase 12 replaces the page.

**Open question for `/gsd-discuss-phase`:**

- **The score weights await Joshua's check** (plan §6, §13 item 6). The proposal is: website on a phone 35%, quote request 25%, business facts 20%, on-site social proof 10%, local competitor position 10%, AI visibility 0%. These were re-derived after Google review and rating data went out of scope, so they are untested. Weight tuning also has no target to fit against: 50 scans produce no conversions, so "adjust after 50 scans" can only mean "adjust by judgement". Decide which it is before planning.

### Phase 12: The New Report

**Goal**: One page per business that an owner can read in plain words, act on, and that nobody uninvited can find
**Depends on**: Phase 11 (the page renders the new score, the sub-scores and "X points to win")
**Requirements**: REP-01, REP-02, REP-03, REP-04, REP-05, REP-06, REP-07, SCR-06, SCR-07
**Success Criteria** (what must be TRUE):

  1. An owner opens one link and reads a page about their own business: name, address, total score, sub-scores, "X points to win", the six checks each in plain words with "Adashi fixes this", and the ask to plan a free 15-minute call (REP-01, REP-07)
  2. A prospect report cannot be reached by anyone who was not sent the link: it carries `noindex`, and its link is signed and expires rather than being a bare UUID (REP-02, REP-03)
  3. The page states a money line built from the profile's cited job value, which the owner can change, and never states a loss figure nobody measured; it ends in 5 actions where every number was chosen by code and the model only wrote the words around it (SCR-06, SCR-07)
  4. The live Google band shows stars and review count with the Google logo and third-party attribution when the call succeeds, and the page reads correctly with the band simply absent when the call fails; the band appears in no table, no PDF and no email, while the PDF carries the stored score only (REP-04, REP-06)
  5. Competitors are described and positioned but never named in the page, the PDF or anything sent, and the call list is built from clicks on "plan a call" and from replies, never from an email open (REP-05, REP-07)

**Plans**: TBD
**UI hint**: yes

Notes:

- **REP-02, REP-03 and REP-05 are release gates.** No prospect report goes out without `noindex`, a signed expiring link, and competitors unnamed. Today there is no robots rule anywhere in `app/`, and `app/report/[id]/page.tsx` publishes full `openGraph` metadata carrying the domain and the score, with a UUID as the only secret. That is the gap this phase closes.
- **REP-04's live Google band must degrade to nothing.** It renders on each open and is the one part of the report we are not allowed to keep, so the page has to read correctly when the call fails. It also needs a hard spend cap: one Place Details (Enterprise + Atmosphere) call per report open, free to 1,000/month on that SKU, then $25 per 1,000.
- Competitors are described, never named, because naming a competitor in commercial material touches Dutch comparative advertising rules (BW 6:194a). A review comparison may appear in the live on-screen band only, never in an email or the PDF, which would need stored Google review counts.
- **The PDF is its own build.** Nothing in the repo generates a PDF today.
- **Open tracking and per-section read tracking are deferred, not forgotten.** Tracking an identified business on a page it did not request touches Telecommunicatiewet art. 11.7a, so it goes to counsel with the Article 14 question or it does not happen. Pixel opens are also systematically wrong after Apple Mail Privacy Protection. That is why REP-07 builds the call list from clicks and replies.
- **The share button is a decision, not a default** (plan §13 item 12). It is an instruction to leak a page about a business that never asked. Decide it in planning.

**Open question for `/gsd-discuss-phase`:**

- **The Places session-hold rule** (plan §13 item 5): confirm how long a live Places response may be held before building the live band. This decides whether the band is fetched once per page render or may be reused within a request or a session, and it is a terms question, not a performance preference.

### Phase 13: Outbound — Pick, Approve, Dispatch (GATED)

**Goal**: Prospects are picked before the expensive scan, and an approved message dispatches through our own gate with the provider as transport only, with the mechanism shut until counsel answers
**Depends on**: Phase 12 (the message carries a link to a report that must exist), Phase 11, and the v1.0 compliance spine (Phase 2), draft queue (Phase 6) and send gate (Phase 8). Shipping also depends on the Parallel Track legal item, which is external
**Requirements**: OUT-01, OUT-02, OUT-03, OUT-04, OUT-05, OUT-06, OUT-07, OUT-08, OUT-09, OUT-10
**Success Criteria** (what must be TRUE):

  1. Before a line of send code exists, a written artifact names the chosen provider and quotes its acceptable-use terms verbatim with a read date, and `lib/outreach-isolation.test.ts` is updated deliberately against that artifact rather than loosened to let it pass (OUT-09)
  2. Prospects are picked before the expensive scan runs, on cheap signals only, under one reconciled rule rather than two rules that pull in opposite directions (OUT-01, OUT-02)
  3. A business that unsubscribed has no report page published about it: suppression is checked before publication, not only before a send (OUT-03)
  4. Joshua approves a body, and only then does our code check suppression against live rows, build a fresh opt-out link, write the immutable `send_record`, and hand the finished message to the provider for immediate dispatch; the provider never composes, never schedules and never sequences, and every follow-up repeats all of it (OUT-04, OUT-05, OUT-06, OUT-07)
  5. A reply that means "unsubscribe" reaches the `suppressions` table, and no message reaches a real business while `legal_regimes.legal_basis` or `article_14_notice_approved` is unset: the mechanism refuses by its own gate, not by a note in a file (OUT-08, OUT-10)

**Plans**: TBD

Notes:

- **OUT-09 is the first plan of this phase, not a task at the end.** Joshua's own standing rule is that a provider's acceptable-use terms are verified in writing *before* anything is built against them. v1.0 produced that artifact as SND-04 (`.planning/research/SEND-CHANNEL.md`); this phase produces its successor for the chosen provider. Apollo's Terms of Service (read 2026-11-11) forbid use that "violates applicable marketing laws such as CAN-SPAM, CASL, or the TCPA" and do not forbid cold email as such; no page titled "Acceptable Use Policy" exists on apollo.io, so that clause is the binding text. The artifact records it plus the approve-then-dispatch design.
- **OUT-10 is external and cannot be closed by us.** Counsel sets `legal_regimes.legal_basis` and `article_14_notice_approved`. This phase ships its mechanism refusing, exactly as v1.0's Phase 8 does today, and that is a correct outcome rather than a failed phase. Do not read an unshippable phase as a broken one: plan it, build it, verify it refuses, and leave it shut. `docs/legal/lia/LIA-v1.md` is still DRAFT and production `legal_basis` is null by design.
- **Why the provider must never sequence.** A sequenced follow-up fires days later against draft-time state: if someone unsubscribes in between, the provider does not know, and `lib/send-gate.ts`'s live suppression check is bypassed. The opt-out link has the same problem, since it is deliberately never persisted into `draft_body`, so a provider-rendered follow-up would lose it. At 10 to 50 prospects a week, approving each follow-up costs minutes.
- We never use the provider's contact data. Prospects come from Overture and our own extraction. Using a provider's contact data to power an external product needs a separate agreement; keeping prospects on our own sources keeps that question closed.
- Volume stays at 10 to 50 prospects a week. The whole legal risk assessment was argued at that number, and raising it redoes both the risk assessment and the scanner concurrency.
- OUT-03 widens where suppression is checked. Today it is checked at Prepare only (`lib/send-gate.ts`), which was right when Prepare was the only outward act. Publishing a report page about a business is now an outward act too.
- Unchanged from v1.0: `info@bedrijf.nl` is not a Telecommunicatiewet safe harbour, and changing provider does not fix the legal basis. Two separate problems; this conflation has already come up twice.

**Open questions for `/gsd-discuss-phase`:**

- **Which send provider, and a plain send API versus Apollo** (plan §13 item 2). We need transport, not a sequencer, so a plain send API may fit better than Apollo. Undecided, and it decides what OUT-09's artifact is about.
- **Pick versus triage** (plan §9 step 4, §13 item 9). Triage selects for the worst website (`lib/triage-constants.ts`, `DEFAULT_CUTOFF = 60`, "only the worst earn a full scan"). The new pick wants "busy enough to pay", which is a second, orthogonal axis the triage scorer has no input for. These must be reconciled: one rule, or the new axis added to triage. Not two selectors that contradict.
- **The light check cannot read phone or email pre-scan today** (plan §9 step 2, §13 item 8). `prospects` has no phone column (`supabase/migrations/010_create_prospects.sql`), the importer never captures one, and `contact_email` is only populated during the full scan (`scanner-service/src/extractor.ts`). Either add an import-side phone field plus a pre-scan contact-discovery step, or drop those two criteria from the light check. Undecided.

## Progress

**Execution Order:**

Phases execute in numeric order: 9 → 10 → 11 → 12 → 13

The dependency chain is real at every step: Phase 10 needs Phase 9's extractors to compare like for like, Phase 11 needs all six checks to produce data before one score can combine them, Phase 12 renders that score, and Phase 13's message carries a link to Phase 12's report. There is no parallel pair here.

Phase 13 may be planned and built at any time. It may not ship until the Parallel Track legal item closes.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Niche Profile & Own-Site Engine Data | 3/9 | In Progress | - |
| 10. Competitor Position & AI Visibility | 0/? | Not started | - |
| 11. One Score, Everywhere | 0/? | Not started | - |
| 12. The New Report | 0/? | Not started | - |
| 13. Outbound — Pick, Approve, Dispatch (GATED) | 0/? | Not started | - |

**Honest limit on what Phases 9 to 12 prove.** They are tested on 10 real installers before one email goes out, and that proves the data flows. It does not prove the money line, the to-do list or the pitch, because only a business can judge those. Every success metric in the source plan §14 is post-send: at least 1 call per 25 emails, and a first paid project within the first 100 emails.

## Coverage

All 40 v2.0 requirements map to exactly one phase. No orphans, no duplicates.

| Category | Count | Phase(s) |
|----------|-------|----------|
| ENG-01..07 | 7 | Phase 9 (5: ENG-01, 02, 05, 06, 07), Phase 10 (2: ENG-03, 04) |
| AIV-01..05 | 5 | Phase 10 (4: AIV-01..04), Phase 11 (1: AIV-05) |
| NIC-01..04 | 4 | Phase 9 |
| SCR-01..07 | 7 | Phase 11 (5: SCR-01..05), Phase 12 (2: SCR-06, 07) |
| REP-01..07 | 7 | Phase 12 |
| OUT-01..10 | 10 | Phase 13 |
| **Total** | **40** | **5 phases** |

**Why three categories split across phases:**

| Requirement | Phase | Why there |
|-------------|-------|-----------|
| ENG-03, ENG-04 | Phase 10 | The competitor set must be measured on the same signals as the subject, so ENG-01/02/05 have to exist first. Like-for-like is the requirement, not an aspiration |
| AIV-05 | Phase 11 | "Zero weight in the total score" is only observable against a total score, and Phase 11 is where the weight table is created. Phase 10 ships the probe as evidence that feeds no score |
| SCR-06, SCR-07 | Phase 12 | The money line and the 5-action to-do list are report content, and the owner adjusting the job value is an interaction on the report page. Keeping them out of Phase 11 keeps the live-score swap's blast radius as small as it can be |

---
*Roadmap created: 2026-11-11*
*Granularity: standard (5 phases)*
*Structure: dependency chain — profile and own-site data, outside evidence, one score, one report, outbound last*
*Phase numbering continues from v1.0, which ended at Phase 8*
