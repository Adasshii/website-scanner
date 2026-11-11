# Adversarial review: the renewed Adashi scanner plan

Target: `docs/v2-renewed-scanner-plan.md`
Run: 2026-11-11, two independent subagent reviewers (fair + hostile), both reading the plan
and the recorded project state.

**Normal reviewer verdict: Major rework required.**
**Adversarial reviewer verdict: Reject (two fatal flaws).**

Both reviewers converged on the same two problems, independently.

---

## Blocker 1 — Google Places cannot store or republish what the plan needs

Checks 1, 2 and 3 of the six (Google profile, reviews, competitors) carry 50% of the score.
Phase 1's stated result is "All raw data for one business in Supabase", and §8 republishes it
on a hosted report page plus a PDF, with an AI summary of the reviews on top.

Google Maps Platform Terms §3.2.3, verified at https://cloud.google.com/maps-platform/terms/
(fetched 2026-11-11), forbids exactly that:
- (a)(i) no storing, resharing or rehosting Maps content outside the Services
- (a)(iii) no copying and saving business names, addresses or user reviews
- (b) no caching except as the Maps Service Specific Terms allow — and the only general
  caching grant there is §3 "Google ID Caching", `place_id` only
- (c)(vii) no using Maps content to improve or feed AI models

The Places policies page repeats it: no pre-fetch, cache or store beyond the exceptions;
`place_id` is the exemption. Showing Places data without a Google Map also requires the
Google logo and third-party attribution, which the report design does not carry.

This was already decided against. `.planning/PROJECT.md:85-88` puts Places out of scope on
cost AND on this exact ground: "Its 30-day caching restrictions also conflict with holding a
durable prospect list." `PROJECT.md:234` locks it as a Key Decision. The plan does not cite
that decision, does not argue against it, and does not say what changed.

Secondary collision: the shipped retention window is 12 months
(`lib/retention-constants.ts:49-57`). Places-derived columns would need a 30-day expiry
inside a system built around 12 months. New plumbing the plan does not name.

Cost arithmetic (verified https://developers.google.com/maps/billing-and-pricing/pricing,
2026-11-11, USD per 1,000 calls, free allowance per SKU per month):

| SKU | Free/month | First paid tier |
|---|---|---|
| Place Details Enterprise + Atmosphere (ratings/reviews) | 1,000 | $25.00 |
| Nearby Search Enterprise | 1,000 | $35.00 |
| Place Details Photos | 1,000 | $7.00 |

Honest reading, which cuts both ways: at funnel-1 volume (10-50/week) every SKU sits inside
its free allowance, so the Places bill is plausibly zero. The plan's instinct is not wrong on
cost. But the binding cap on the SKUs it actually needs is 1,000/month, not 10,000, and the
plan has not noticed. Funnel 2 is where it breaks: an ads-driven public page is unbounded
anonymous volume at roughly $0.06-$0.10 of Places per visitor plus 4-5 LLM calls plus a
Playwright scan, with no spend cap and no rate limit — and caching the result to amortise the
cost is prohibited anyway.

**Fix:** either re-source checks 1-3 from data you may keep (the business's own site and its
schema.org markup; Overture, already in the stack and free), or obtain a licence that permits
storing and republishing ratings and reviews. Until then checks 1-3 and 50% of the score do
not exist. If Places stays, write the override as a decision with SKUs, field masks, lookups
per business, monthly volume and euros — not the line "paid per lookup".

---

## Blocker 2 — the Apollo send path reverses a locked decision and re-opens a shut gate

The plan puts Apollo in the send path, sends from a warmed separate domain and mailbox, runs
two automated follow-ups, and states Phase 4's result as "The first 20 emails sent".

Every one of those four was individually removed on purpose:

- `PROJECT.md:213-217` (Provider policy): "resolved 2026-08-04 by removing the third-party
  provider from the send path entirely. There is no dispatch provider... The principle stays
  in force for any future automated channel: it must permit outreach under its own terms,
  **checked against its AUP before it is built against, not after**." The plan's §12 says to
  check Apollo's *pricing page*. That is the exact inversion the constraint names.
- `PROJECT.md:229` locks manual send from Joshua's own mailbox, no third-party dispatcher.
- `PROJECT.md:91-92` (Out of Scope): "Fully automated multi-step outreach sequences — at
  10-50 prospects per week, manual follow-up is cheaper than building a sequencer."
- `.planning/phases/08-send-gated/08-CONTEXT.md:36-38`: "No outreach domain, no SPF/DKIM/DMARC
  setup, no warmup. Those were provider-era concerns and are now moot." `:89` rules out "any
  automated dispatch, scheduling, batching, or queue-draining of sends."
- `ROADMAP.md:34` marks SND-04 "CLOSED 2026-08-04 (manual send, no provider)".

It is also fenced in code. `lib/outreach-isolation.test.ts` enumerates 12 outreach-path files,
bans 6 mail tokens and 5 mail packages, and asserts the SND-04 artifact still records "There
is no third-party dispatch provider". Wiring Apollo in fails that suite by design. The test's
own header predicts the failure mode: someone "fixes" it by loosening an assertion.

Two shipped guarantees break:
- `lib/send-gate.ts:5-7`: suppression is checked at Prepare against live rows, "never against
  anything cached at draft time". An Apollo sequence fires follow-up 2 days later against
  draft-time state, with no human and no live suppression check.
- `lib/opt-out-link.ts:12-18` composes the opt-out line fresh at Prepare and deliberately never
  persists it into `draft_body`. If Apollo renders the follow-ups, the opt-out stops being
  code-enforced and becomes something Joshua must remember.

And the legal half of the gate is still open. `ROADMAP.md:33`: counsel on legitimate interest,
Article 14 wording and Tw art. 11.7, status **OPEN**. `ROADMAP.md:397-401`: "no real message
may be sent to a real business until counsel closes the legal half... Build the gate, do not
open it." `docs/legal/lia/LIA-v1.md` is still "Status: DRAFT — pending counsel review".
`STATE.md:37` records a production check: `legal_regimes.legal_basis` is null and
`article_14_notice_approved` is false on every row, so every Prepare refuses
`legal-basis-unset`. `lib/send-gate.ts:177-184` and `:200-206` are built to refuse exactly
what the plan schedules.

So "The first 20 emails sent" is either impossible to execute, or executable only by someone
setting counsel's values without counsel. Routing through Apollo bypasses the gates entirely,
because Apollo does not read `send_records`.

On Apollo's own terms (https://www.apollo.io/terms-of-service, Last Updated 2026-08-10,
fetched 2026-11-11): you will not use the Services "for any illegal purpose, or in any way
that violates applicable marketing laws such as CAN-SPAM, CASL, or the TCPA". Apollo permits
cold outreach as a product; it does not permit unlawful cold outreach. By the project's own
research (`.planning/research/LEGAL.md:15`), a generic scraped `info@` does not satisfy Tw art.
11.7 lid 2 sub a. No document titled "Acceptable Use Policy" could be found on apollo.io
(three obvious URLs 404ed on 2026-11-11), so SND-04's written AUP verification currently has
nothing to verify against. Treat that as unresolved, not as clearance.

The tell is inside the plan: §2 line 24 shows an acceptable-use check WAS run on AgentMail and
ruled it out. The same check was not run on Apollo, the component that matters.

**Fix:** do not touch the send path in this milestone. No Apollo, no sequencer, no warm-up
domain, no automated follow-ups. If an automated channel is wanted later it needs a fresh
SND-04 artifact, an AUP verified in writing before any build, and counsel on Tw art. 11.7
first, in that order.

---

## Serious, below the two blockers

**S3. The light check cannot run where the plan puts it.** §9 step 2 checks website + active +
phone + email. `prospects` has no phone column (`supabase/migrations/010_create_prospects.sql:9-35`),
no migration adds one, and the importer never captures one. `contact_email` is populated
*during* the full scan (`scanner-service/src/extractor.ts:251`), so "there is an email" is only
knowable after the expensive step it is meant to gate. Two of four criteria do not exist pre-scan.

**S4. Places spend is not actually gated.** §12 says only leads that pass the light check get a
full scan, but §9 puts **Pick** (step 4) *after* the **Full scan** (step 3), and Pick needs
rating and review count — Places data. So Places runs on everything surviving the light check.
One category in one province returned 1,446 rows (`STATE.md:35`). §9's ordering, §11's ordering,
and the money must agree.

**S5. The pick criteria invert what triage is built to do.** §9 step 4 picks good rating + many
reviews + one weak spot. Triage selects for bad: `lib/triage-constants.ts:34` `DEFAULT_CUTOFF = 60`,
"score <= cutoff is eligible", targeting ~30% pass; `ROADMAP.md:20` states Phase 3's goal as
"only the worst earn a full scan". "Good rating, many reviews" is an orthogonal Places-sourced
axis the triage scorer has no input for.

**S6. "ChatGPT names you X of 3 times" is not a measurement, and it carries 20% of the score.**
One run per question, n=1, no temperature, no seed, no repetition, no confidence band. No
geographic grounding: an API call has no location, so what you measure is not what the prospect
sees. There is no "ChatGPT API" — that is OpenAI, a new vendor; current deps are
`@google/generative-ai` only, in both package.json files. Nothing stores the model version,
prompt or raw response, so no two scans are comparable and nothing is auditable when a prospect
disputes it. Minimum fix: k>=5 runs per question at temperature 0 against a pinned model, store
prompt + model + raw responses, report a frequency band ("named in 1 of 5 runs") rather than a
score, and keep it out of the weighted total until 50 scans show it is stable. Otherwise drop it.

**S7. The new score and report collide with a deployed, revenue-earning product.** One scoring
system already ships: `lib/scoring.ts:23-32` (perf .25 / SEO .25 / a11y .15 / content .15 /
security .10 / design .10), with one consolidated verdict function at `lib/scoring.ts:68-72`.
`ROADMAP.md:306` records why it was consolidated: "the same number has to mean the same thing in
the prospect list, the report the prospect clicks through to, and the email, or the pitch
contradicts itself in front of the person being pitched." The plan demotes all of it to a 30%
input and never says whether the existing report and score are replaced, kept alongside, or
forked. `lib/draft-metric-selector.ts:8-16` picks every draft's hook metric from those scores,
so a new schema breaks draft generation quietly rather than loudly. The public scanner at `/`
earns money today (`PROJECT.md:218-219` blast-radius constraint).

**S8. The per-business report page is public, indexable and shareable by design.**
`app/report/[id]/page.tsx:32-65` generates full `openGraph` metadata carrying the domain and
score. `middleware.ts:13-23` matches `/report/:path*` and only sets a header: no auth, no
noindex, no gate. A UUID is the only secret, and grep finds no `noindex` or robots rule anywhere
in `app/`. The plan then adds a **share** button, a named-competitor ranking, and review
sentiment — about a business that never asked. Two exposures the plan never mentions: Dutch
misleading/comparative advertising rules (BW 6:194a) for naming a competitor as better in
commercial material, and GDPR Art. 5(1)(f) for any named-person data behind URL obscurity only.
Minimum: noindex, a signed expiring link, and competitors described but never named in first
contact.

**S9. Open tracking is a new legal surface opened in one line.** §8 tracks opens and "which
sections were read" on a page an identified business did not request. Telecommunicatiewet art.
11.7a is the Dutch tracking-consent provision (article confirmed to exist in the consolidated
text BWBR0009950, 2026-07-01; its body could not be retrieved, the same truncation
`.planning/research/LEGAL.md:40` hit, so treat the substance as the reviewer's reading). The
plan mentions no consent, banner or exemption. Also: pixel opens are systematically wrong after
Apple Mail Privacy Protection, and here they are the primary trigger for a phone call — build
the call list on a click or a reply instead.

**S10. The lifecycle has a hole exactly where the plan puts reply handling.** `lib/lifecycle.ts:75-78`:
"`replied` has no rung: no reply marker exists anywhere in this codebase until Phase 8 builds
one." A reply Hermes classifies as "unsubscribe" is an opt-out request that must reach the
`suppressions` table; today only the unsubscribe endpoint and the Resend webhook write there.
Hermes classifying an opt-out with no write path to suppression is a compliance hole. Also,
Hermes sorting replies duplicates the lifecycle machine Phase 7 already shipped — neither would
be authoritative.

**S11. Funnel 2's live streaming is not something this scanner can do.** The quick scan is one
blocking POST returning a single JSON blob at the end: `lib/scanner-client.ts:116-135`
(`AbortSignal.timeout(180_000)`), served by `scanner-service/src/index.ts:211-344`, which inside
that one call scans, uploads a screenshot, then awaits the bilingual AI pipeline before
responding. There is no intermediate emission point. Grepping `event-stream|ReadableStream|EventSource`
across app/lib/components returns one hit: `lib/pipeline-run.ts:109`, the dev-only admin runner
that 404s outside development. Live progress today is DB polling returning three coarse states
(`app/api/scan/[id]/status/route.ts:24-30`), not six part-results. `app/api/scan/route.ts:11` sets
`maxDuration = 300` with the comment "Lighthouse needs ~60-90s", so the hardcoded "26 seconds
left" countdown will be visibly wrong to a stranger who just typed their business name. Capacity:
`BULK_DISPATCH_CONCURRENCY = 2`, and the service returns 503 "At capacity"
(`scanner-service/src/index.ts:420-422`). This is six independently-resolvable sub-jobs, a
per-part result store, SSE or fast polling, a spend cap and a rate limit. §11's one word
"streaming" understates it by a phase.

**S12. Suppression ordering.** Suppression is checked at Prepare only (`lib/send-gate.ts:154-160`),
correct when Prepare was the only outward-facing act. The plan's funnel 1 runs a full scan and
**publishes a report page** at step 3, before any suppression check. Someone who unsubscribed
last month gets scanned and gets a page built about them.

**S13. Four-plus new vendors against "no new infrastructure".** `PROJECT.md:201-202`: "Vercel,
Railway, Supabase, Resend, Gemini, Playwright only." The plan adds Google Places, OpenAI, Apollo,
AgentMail, Hermes, a registered domain and a Workspace mailbox. The AI in the codebase is Gemini
(`scanner-service/src/ai.ts:1,47,253`, `gemini-2.5-flash`); grep for `openai` returns nothing.
Check 6 genuinely requires OpenAI, because the question is what ChatGPT answers — say so rather
than letting "3 AI calls per scan" read as existing capability. AgentMail and Hermes appear in §2
and §9 but in neither §11 nor §12: in scope and unbudgeted, or out of scope and should be cut.

**S14. The PDF has no foundation.** `grep -rln pdf app lib components package.json` returns
nothing. Headless-Chrome rendering of a React report is its own build, with its own font, layout
and Vercel-runtime problems.

**S15. "Phases 1 to 3 are tested on 10 real installers before one email goes out" is not true.**
Phase 3's own deliverable includes open tracking, which requires the email channel (Phase 4), so
Phase 3 cannot complete. And Phases 1-3 build plumbing: the product hypothesis is the money line,
the to-do list and the pitch, none of which can be validated without showing it to a business.
The plan's own success criteria are all post-send.

**S16. The to-do list hands commercial claims to a language model.** §4 line 47 has the AI write
5 actions, §1 prices every one at €2,500+. Phase 6 already solved this: `lib/draft-metric-selector.ts:1-16`
exists so that "the number a draft cites is chosen by code and never by the model (DRA-02)". The
plan discards that principle without noticing it is there.

**S17. Edge cases that fire in front of a prospect.**
- Wrong Places match: the public page's only input is a business name. Name collisions are the
  norm in the trades. A wrong match emails business A a report about business B's reviews. No
  disambiguation, no confidence threshold, no "is this you?" step.
- No Google profile: checks 1-3 unscoreable, 50% of the weight undefined. Score 0 and insult
  them, or exclude them? The existing system solved this class of problem with one explicit
  predicate, `isReleasable` (`PROJECT.md:266`). The plan has no equivalent.
- Chains and multi-location: prospect identity today is domain-based (`PROJECT.md:262`), Places
  identity is `place_id`-based. Two identity systems that disagree, no reconciliation rule, in a
  project that already needed an aggregator denylist because this bit once (`PROJECT.md:263`).
- Service-area businesses have no address, so "competitors within X km" has no centre.
- Shared phone numbers and shared office addresses, common for one-person installers, produce
  false competitor sets and false duplicates.

**S18. Volume quadruples while inheriting the low-volume risk assessment.** "5 a day building to
20-40" is up to 200/week against a recorded 10-50 (`PROJECT.md:208-209`, which says solutions
sized larger "should be rejected on sight"). The manual-send decision, the human-gate rationale,
and "ACM enforcement at 10-50 per week is low probability" (`PROJECT.md:166`) were all argued at
the low number. Note `PROJECT.md:166-168` records low enforcement probability and lawfulness as
separate claims that must not be merged. Capacity also forbids it: bulk gets two concurrent slots
(`scanner-service/src/capacity.ts:10,15`) and the drain cron runs once daily
(`vercel.json:17-19`, a Vercel Hobby constraint recorded at `PROJECT.md:264`).

---

## Minor

- **M19.** §3's description of Prospect Radar is accurate — it does find businesses in Overture,
  triage them and draft emails for approval (`ROADMAP.md:18-24`). Worth *adding* that the send
  mechanism also exists (Prepare, Mark as sent, the immutable `send_records` audit trail,
  migration 020), so Phase 4 is partly a rewire of working code, not a build.
- **M20.** "The report link opens the full report directly, no loading screen, no email gate" is
  already free: `/report/[id]` is public and ungated, and `lib/draft-generator.ts:78-83` already
  writes `${REPORT_BASE_URL}/report/${scanId}` into drafts. Good fit, no work needed.
- **M21. Genuinely well-fitted, keep all three:** §6's weights sum to 100; §11 correctly sequences
  data → score → report → outbound → public page, putting the riskiest surface last; and "tested
  on 10 real installers before one email goes out" is the right instinct even though S15 shows the
  claim does not hold as written.
- **M22.** §13 "Still open" omits the two largest open items: counsel, and whether
  `PROJECT.md:85-88`'s Places exclusion is being overridden. Those go at the top.
- **M23.** Ambiguity: §4 check 4 says "fast homepage scan, then the deep scan"; §10 says part 4
  uses the fast scan with the deep scan afterwards; §9 step 3 says just "full scan". Three
  readings. Pick one per funnel.
- **M24.** §5's niche profile should take country and locale as dimensions from the start, per
  `PROJECT.md:220-221` (country and locale are parameters, never hardcoded).
- **M25.** §5/§2's "a new niche is a new profile and a new landing page, with no engine work" is
  true about code and misleading about cost: the profile includes the landing page, six scan
  screens, tips, report texts and the "Adashi fixes this" lines. Copy and design are the scarce
  resource at Adashi's size.
- **M26.** Weight tuning has no fit target: "adjust after the first 50 scans" with 20% on the
  least stable signal. Fifty scans produce no conversions to fit against, so the weights get
  tuned by feel and then quoted to prospects as a number.
- **M27.** Funnel 2 is labelled "later" and then built in the same milestone (Phase 5). If funnel
  1 does not produce a paid project, Phase 5 is dead weight.

---

## What survives

Checks 4 and 5 — the phone-view website scan and the quote-request check. They are pure
extensions of the existing scanner, need no new vendor, break no terms, and are the half of the
engine that survives scrutiny. The niche-profile shape and the money line are a real improvement
on a scanner that currently scores websites in the abstract. The phase ordering is sensible.

## What both reviewers asked to be answered in writing before replanning

1. Is `PROJECT.md:85-88`'s Places exclusion being overridden? If yes, with which SKUs, field
   masks, lookups per business, monthly volume and euros — and how the storage and republication
   problem is solved.
2. Does the send path stay untouched in this milestone? If not, the AUP verification and the
   override of the no-provider policy come first, then counsel, then any build.
3. Counsel as a hard precondition, named in the plan where the send phase lives.
4. Does the public scanner's score change, or not? Is the prospect report a new route or the
   existing one?
5. What is the single predicate, like `isReleasable`, that decides whether a business is
   scoreable at all?
