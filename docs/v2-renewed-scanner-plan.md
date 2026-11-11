# Plan: the renewed Adashi scanner

> Captured 2026-11-11 from Joshua. Reviewed the same day by two independent reviewers
> (`docs/v2-renewed-scanner-plan-REVIEW.md`): verdicts "major rework required" and "reject".
> This is revision 2, rewritten against Joshua's answers to the five gate questions.
>
> It sits on top of Prospect Radar v1.0 (7 of 8 phases complete; Phase 8 "Send" built and
> deliberately gated shut pending counsel). It is not yet a roadmap and not yet planned.

---

## 0. Decisions taken at the review gate, 2026-11-11

| # | Question | Joshua's answer |
|---|---|---|
| 1 | Override `PROJECT.md:85-88`, the internal Places exclusion? | **Yes, overridden.** That rule was ours and it is now closed. |
| 2 | Google Maps Platform Terms §3.2.3 forbid storing, re-hosting and deriving from ratings and reviews. This is Google's contract, not ours to override. Which way? | **Nothing from Google is stored.** The saved score and the saved report use storable sources only. **Revised 2026-11-11 after Joshua asked about Trustpilot and Google reviews:** Google stars and review count may still be shown **live on the report page**, fetched when it opens, with the Google logo and attribution, stored nowhere. See §4a. |
| 3 | Is counsel a hard stop in front of the send phase? | **Yes, a hard stop.** Nothing sends until counsel closes Tw art. 11.7, the LIA and the Article 14 wording. |
| 4 | Does the public scanner's score and report change, or stay? | **Replace everywhere.** One score, one report, for the public scanner and for prospects. |
| 5 | What single predicate decides whether a business is scoreable at all? | Joshua had no answer; Claude's proposal below is recorded as the working rule, open to change. |

**Consequence of answer 2:** checks 1, 2 and 3 are recast onto storable sources (§4). Nothing
Google returns enters the database, the saved score, the PDF or an email. Google data appears
only as a live on-screen band (§4a). A licensed, storable review source is now partly solved:
Trustpilot permits storage under conditions, but has almost no coverage of Dutch installers
(§4a).

**Consequence of answer 3, corrected 2026-11-11.** Revision 2 first read "hard stop" as "no
provider at all". Joshua corrected that: he does want a tool like Apollo, with the content
checked by a human before it sends. That design is compatible with every shipped guarantee,
on one condition: **our code keeps the gate and the tool is only the transport.**

The design that works (`approve-then-dispatch`):

1. Joshua approves the draft body in our admin. Already built (Phase 6).
2. Our code checks suppression at that moment, against live `suppressions` rows.
3. Our code builds the body with a fresh opt-out link (`lib/opt-out-link.ts`).
4. Our code writes the immutable `send_record`.
5. Our code hands the finished message to the provider's send API for immediate dispatch.
6. The provider does **not** sequence, does not own the content, does not choose the timing.
7. Each follow-up goes through the same seven steps, approved one at a time.

**Why the provider must not sequence.** A sequenced follow-up fires days later against
draft-time state. If someone unsubscribes in between, the provider does not know, and
`lib/send-gate.ts:5-7`'s live suppression check is bypassed. The opt-out link has the same
problem: it is deliberately never persisted into `draft_body`, so a provider-rendered follow-up
would lose it. At 10-50 prospects a week, approving each follow-up costs minutes.

**What still blocks it:** counsel only. Apollo's Terms of Service do not forbid cold email; they
forbid use that "violates applicable marketing laws such as CAN-SPAM, CASL, or the TCPA"
(https://www.apollo.io/terms-of-service, Last Updated 2026-08-10, read 2026-11-11). Apollo's own
help pages recommend a separate outreach subdomain and starting near 50 emails a day, so cold
outreach is a supported use of the product. Whether **our** outreach is lawful is the Tw art.
11.7 question, which is counsel's. So Apollo is not the blocker; Dutch law is.

**Process that still applies** (`PROJECT.md:213-217`, Joshua's own rule): the provider's
acceptable-use terms are verified in writing **before** anything is built against them. No page
titled "Acceptable Use Policy" exists on apollo.io; three obvious URLs 404ed on 2026-11-11, so
the Terms of Service clause above is the binding text. A fresh SND-04 artifact records that,
plus the approve-then-dispatch design, before Phase 4 writes code. `lib/outreach-isolation.test.ts`
is then updated deliberately, with the new SND-04 artifact as its reference, not loosened.

**One Apollo limit to respect:** Apollo's plans are for internal business use, and using Apollo's
*contact data* to power an external product or reselling it needs a separate agreement
(apollo.io/pricing, read 2026-11-11). We never use Apollo's data. Prospects come from Overture
and our own extraction. Keep it that way.

**Apollo free plan, third-party reports, not Apollo's own docs, so unverified:** about 250 sends
a day, 2 active sequences, Gmail-only mailbox connection. Enough for 10-50 a week. Because we
only need a transport and not a sequencer, a plain send API may fit better; that choice is made
when counsel clears the path.

**Consequence of answer 4 (required work, not warnings):**
- `lib/scoring.ts` and `scanner-service/src/scoring.ts` both change. The single
  `computeVerdict()` source (`lib/scoring.ts:68-72`, DRA-06) must stay single.
- `lib/draft-metric-selector.ts:8-16` picks every draft's hook metric from the old `scores`
  shape. It changes in the same commit, or draft generation breaks quietly.
- Scan rows already in the database carry the old score shape. The report page must still
  render them: either a backfill, or a version field plus a dual renderer.
- The public scanner at `/` earns money today (`PROJECT.md:218-219`). This change needs its own
  verification before it ships. The blast-radius constraint now cuts both ways: an outreach
  change can break the earner.

---

## 1. Goal

The scanner becomes a **sales tool for installers and renovation companies**. It shows an owner,
in plain words, where they lose customers to competitors. Every problem in the report leads to
an Adashi service at €2,500 or more.

The **first funnel is cold email**: we scan first, then we send each business a link to its own
report. The **second funnel** comes later, for ads: a public page where the owner types the
business name and watches the scan live. Funnel 2 is **not in this milestone** (see §11).

## 2. Decisions made

| Topic | Decision |
|---|---|
| Niche | Local businesses with money. Start: installers and renovation (heat pumps, solar panels, bathrooms, kitchens, roofing, central heating). |
| Build shape | A general **engine** plus a **niche profile** per group. A new niche is a new profile and a new landing page, with no engine work. Note: the profile holds copy and design, which is the real cost, not code. |
| Money | The job value is filled in per trade (for example heat pump about €12,000). The owner can change it. We never invent a loss figure. Each default value is stored with a citation. |
| Funnel 1 (now) | Outbound: find, scan, pick, email with a link to their own report. No loading screen and no gate. |
| Funnel 2 (later, own milestone) | The public page: name search, a live scan in 6 parts, the total score visible, the rest unlocked with an email. |
| Every problem | Ends with "Adashi fixes this" and a "plan a call" button. |
| Sending cold email | A provider such as Apollo, used as **transport only**, after Joshua approves each body. Our code keeps the gate: live suppression check, fresh opt-out link, immutable `send_record`, then dispatch. No provider-side sequencing. Counsel is a hard stop. See §0. |
| Google Places | Never stored. Live on-screen display only, with the Google logo and attribution. See §4a. |
| Trustpilot | Storable through the official Data Solutions API, under a 24-hour refresh duty and a deletion-sync duty. Almost no Dutch installer coverage, so low value here. See §4a. |

## 3. What we keep and what is new

**We keep:**
- The website scan (speed, SEO, content, accessibility). It becomes one part of the score.
- **Prospect Radar:** it finds businesses in Overture map data, triages them, extracts contacts
  and drafts emails for your approval. The send mechanism also already exists: Prepare, Mark as
  sent, an immutable `send_records` audit trail (migration 020). Phase 4 below is partly a
  rewire of working code, not a build.
- Hosting: Vercel, the Railway scanner service, Supabase.

**New:**
- Structured-data extraction from the business's own site, on-site social proof, an Overture
  competitor set, the quote-request checks, an AI visibility probe, the money line, niche
  profiles, one new score, one new report.

**New, outreach side:** a send transport (Apollo or a plain send API) driven by our own gate.

**Explicitly not new (removed at review):** Google Places as a *stored* source, provider-side
sequencing, AgentMail, Hermes. Reply handling and follow-ups stay in our own lifecycle, each
approved by hand.

## 4. The engine: six checks per business

Every source below is one we may store.

| # | Check | What it measures | Data source |
|---|---|---|---|
| 1 | **Business facts online** | Does their own site publish, as machine-readable structured data, the facts a customer and an AI need: address, phone, opening hours, service area, certifications | schema.org / JSON-LD on their own site, plus Overture |
| 2 | **Social proof** | Stored part: are reviews shown on their own site at all, how many, how recent, and are they marked up so search engines and AIs can read them. Live part: Google stars and review count, shown on screen only (§4a) | Their own site (stored); Google Places (live only); Trustpilot where a profile exists (stored) |
| 3 | **Local competitor position** | Same trade, within X km, compared on what we can see and keep: site quality, structured data, on-site social proof | Overture, plus our own scan of each competitor's site |
| 4 | **Website on a phone** | Load time, mobile view, the most important problems | The existing scanner |
| 5 | **Can a customer request a quote?** | A quote form, a clickable phone number, project photos, reviews on the site, certifications | New website checks |
| 6 | **AI visibility** | Whether an AI assistant names the business for 3 real trade questions, and which competitors it names | OpenAI API, **5 runs per question, temperature 0, pinned model** |

**Check 6 rules (from review finding S6).** One run is noise, not a measurement. So: 5 runs per
question at temperature 0 against a pinned model version; store the prompt, the model id and
every raw response; report a band ("named in 1 of 5 runs"), never a single score. **Check 6
carries 0% of the total score until 50 scans show it is stable.** It is shown as evidence only.
This needs the OpenAI API, a genuinely new vendor: the codebase uses Gemini only
(`scanner-service/src/ai.ts`). Say "an AI assistant", not "ChatGPT", in anything a prospect reads.

After the six checks, the AI writes a **to-do list of 5 actions**, each linked to an Adashi
service. **Every number in that list is chosen by code, never by the model** (the DRA-02 rule
`lib/draft-metric-selector.ts` already enforces for drafts). The model writes the words around
numbers it is handed.

### The scoreable rule (§0 answer 5, Claude's proposal)

A business is scoreable only if all three are true:
1. It matches exactly one Overture place, above a confidence limit.
2. It has a website on its own domain (not a Facebook page, not an aggregator listing).
3. It has an address, or a declared work-area centre.

If any is false: skip it, never score it, never email it. This copies the shape of
`isReleasable` (`PROJECT.md:266`), which already works. This closes the "no profile / chain /
service-area / wrong match" edge cases in one rule instead of five.

### 4a. Review data: what each source allows

Answered 2026-11-11, after Joshua asked whether Trustpilot and Google reviews can be used.

**Google: you may show it, you may not keep it.** Maps Platform Terms §3.2.3 forbid storing,
re-hosting and deriving content from ratings, reviews, names and addresses; only `place_id` may
be cached. But calling the API and showing the answer to a person is the intended use. So:

- Google stars and review count appear as a **live band on the report page**, fetched when the
  page opens, with the Google logo and third-party attribution as the Places policies require.
- They never enter Supabase, the saved score, the PDF, or an email body.
- Cost: one Place Details (Enterprise + Atmosphere) call per report open. At 10-50 prospects a
  week with a few opens each, inside the 1,000-per-month free allowance for that SKU.
- Open: Places policies also restrict how long a response may be held even in a page session.
  Confirm the exact wording before building, and set a short server-side TTL of seconds, not
  hours, if any is used at all.

**Trustpilot: you may keep it, under two duties.** This is the real difference from Google.
Verified 2026-11-11:

- Scraping Trustpilot is forbidden. Their Terms of Use for Consumers: "You must not carry out in
  any way (including facilitating, permitting or authorising) any text mining, data mining or web
  scraping of our platform for any purpose without our express permission. This includes the
  training and development of artificial intelligence systems or models." The same terms say you
  may not use "TrustScores and reviews submitted by other users, unless we specifically say you
  are authorised to use them."
- The authorised route is the **Data Solutions API**
  (https://developers.trustpilot.com/data-solutions-get-started). It is built for exactly our
  case: reading data about businesses that are not ours.
  - `Search business units`: fuzzy search by name or domain, with a country code. Returns
    `trustScore`, `stars` and `numberOfReviews` in the search response itself.
  - `Get business unit details`: TrustScore, star rating, category, review count.
  - `Get latest reviews for business unit`: up to five recent reviews.
  - Two products: **Display API** (search, find, details, latest reviews) and **Insights API**
    (adds full service-review text and categories).
- **Duty 1, refresh.** "If you display any Trustpilot review data, you must refresh your cache
  every 24 hours as part of the Content Refresh Guidelines"
  (https://developers.trustpilot.com/ds-caching-best-practices/). Business Unit IDs may be cached
  indefinitely. Do not fetch on every page load.
- **Duty 2, deletions.** The Deletions API returns consumer and review IDs to remove from our
  system, and those calls do not count against the API allowance. A third-party source claims a
  28-day cadence; that figure is **not** in the official caching page, so confirm it in the
  Deletions API docs before relying on it.
- **Access is a waitlist.** No self-serve key and no published price
  (https://business.trustpilot.com/datasolutions). Joining the waitlist is free and costs nothing
  but time.

**The catch, and it decides the matter.** Trustpilot fixes the legal problem and not the data
problem. Dutch installers are barely on Trustpilot. A check on 2026-11-11 found Werkspot profiles
with real volume for real heat-pump installers (Warmland 121 reviews, De Keteldokter Noord 35,
Warmtepompgigant 27 at 4.9), and no Trustpilot profile for an individual installer. Trustpilot's
Dutch presence is for platforms like Werkspot itself, which has roughly 7,600 Trustpilot reviews
as a company.

**So, in order:**
1. The saved score uses storable sources only: their own site, Overture, and Trustpilot where a
   profile exists. Unchanged from revision 2.
2. Google stars and review count are a live on-screen band, for sales punch where the prospect
   actually looks.
3. Join the Trustpilot Data Solutions waitlist to learn the price. Use it where coverage exists.
4. **Open: Werkspot.** That is where Dutch installer reviews actually live. It has no public API,
   so using it probably means scraping, which is the same trap as Google. Their terms need
   reading before anything is built. Recorded as a research job, not a plan.

## 5. The niche profile (installers)

One settings file holds:
1. **Trades:** heat pump, solar panels, bathroom, kitchen, roofing, central heating.
2. **The default job value per trade**, each stored **with a citation to its source**. You check
   these numbers. Wrong by 2x in front of someone who installs heat pumps loses the report in
   one sentence.
3. **The 3 AI questions per trade**, for example "which {trade} in {city} is good?"
4. **Competitor rules:** the same trade, within X km.
5. **Website checks for this trade:** quote form, phone, project photos, certifications.
6. **Copy:** the landing page, the six scan screens, the "Did you know?" tips, the report texts
   and the "Adashi fixes this" lines.

**Country and locale are dimensions of the profile, never hardcoded** (`PROJECT.md:220-221`).
NL is the first target, not the only one.

## 6. The score

One total score (0 to 100%), plus sub-scores. The report says "X points to win". This score
**replaces** the current one everywhere (§0 answer 4).

Proposed starting weights. **These are a proposal and need your check**, because the original
weights assumed Google review and rating data that is now out:

| Part | Weight |
|---|---|
| Website on a phone (check 4) | 35% |
| Can a customer request a quote (check 5) | 25% |
| Business facts online (check 1) | 20% |
| Social proof on your own site (check 2) | 10% |
| Local competitor position (check 3) | 10% |
| AI visibility (check 6) | 0%, evidence only, reviewed after 50 scans |

Weight tuning needs a target to fit against. Fifty scans produce no conversions, so "adjust
after 50 scans" can only mean "adjust by judgement". Say that, or wait for conversions.

## 7. The money line

We never invent a loss figure. The report says:
- "One extra heat pump job is worth about €12,000." The owner can change this number. The
  default carries its citation.
- "Three installers near you show their reviews on their own site. You do not."
- "An Adashi website pays for itself with one extra job."

**Not in an email or the PDF:** "Installer X has 3 times more reviews." That needs stored Google
review counts. A review comparison may appear in the **live on-screen band** only (§4a). It also
names a competitor in commercial material, which touches Dutch comparative advertising rules
(BW 6:194a) and goes to counsel alongside the Article 14 question. Competitors are **described,
never named**, in first contact and in anything we store.

## 8. The report

The report is one web page per business, with a unique link, plus a PDF.

1. **Header:** name, address, total score, sub-scores, "X points to win". Buttons: share,
   download PDF, plan a call.
2. **Business facts online:** a checklist, then "Adashi fixes this".
3. **Social proof:** what a visitor finds on their site, and what is missing.
4. **Competitors:** a position, with this business marked "you". Competitors described, not named.
5. **Website on a phone:** the main problems, in plain words.
6. **Quote request:** what a customer finds or misses.
7. **AI visibility:** the 3 questions and the frequency band.
8. **The money line.**
9. **The to-do list:** 5 actions.
10. **The ask:** "Plan a free 15-minute call. We walk through this report together."

**Required before any prospect report goes out (review findings S8, S9):**
- `noindex` on prospect reports. There is no robots rule anywhere in `app/` today, and
  `app/report/[id]/page.tsx:32-65` publishes full `openGraph` metadata carrying the domain and
  score. A UUID is the only secret.
- A signed, expiring link, not a bare UUID.
- The **share button is a decision, not a default.** It is an instruction to leak a page about a
  business that never asked.
- **Open tracking and per-section read tracking are deferred.** Tracking an identified business
  on a page they did not request touches Telecommunicatiewet art. 11.7a (tracking consent). It
  goes to counsel with the Article 14 question, or it does not happen. Pixel opens are also
  systematically wrong after Apple Mail Privacy Protection, so build the call list on a click
  on "plan a call", or a reply, not on an open.
- The PDF is its own build. Nothing in the repo generates a PDF today. The PDF carries the
  stored score only, never the live Google band.
- The **live Google band** (§4a) renders server-side on each open, carries the Google logo and
  third-party attribution, and degrades to nothing if the call fails. The page must read correctly
  without it, because it is the one part we are not allowed to keep.

## 9. Funnel 1: outbound (first)

1. **Find:** Prospect Radar pulls installers for one region from Overture.
2. **Light check:** the website exists and the business is active. **Phone and email are not
   checkable here** (review finding S3): `prospects` has no phone column
   (`supabase/migrations/010_create_prospects.sql:9-35`), the importer never captures one, and
   `contact_email` is only populated during the full scan
   (`scanner-service/src/extractor.ts:251`). Either add an import-side phone field and a
   pre-scan contact-discovery step, or drop those two criteria. **Open, decide before Phase 1.**
3. **Apply the scoreable rule** (§4). Anything that fails is dropped here and never scanned.
4. **Pick, before the expensive step** (review finding S4): the original plan put Pick after the
   full scan, which removed the cost control it claimed. Pick now runs on cheap signals only.
   Note this inverts what triage is built to do: triage selects for a bad score
   (`lib/triage-constants.ts:34`, `DEFAULT_CUTOFF = 60`, "only the worst earn a full scan").
   "Busy enough to have money" is a second, orthogonal axis the triage scorer has no input for.
   **Open: reconcile the two, or add the new axis to triage.**
5. **Full scan:** all six checks, only for picked leads.
6. **Check suppression before publishing anything** (review finding S12). Today suppression is
   checked at Prepare only (`lib/send-gate.ts:154-160`), which was right when Prepare was the
   only outward act. Publishing a report page about a business is now an outward act, so
   someone who unsubscribed last month must not get scanned or get a page built about them.
7. **Draft:** one personal fact plus the link to their report. You approve each draft. Already
   built (Phase 6).
8. **Send: approve-then-dispatch** (§0). Joshua approves the body. Our code checks suppression
   live, builds the fresh opt-out link, writes the immutable `send_record`, then hands the
   finished message to the provider's send API for immediate dispatch. The provider never
   sequences and never owns the content. **Nothing sends until counsel closes the legal half**
   (`ROADMAP.md:33`, status OPEN; `LIA-v1.md` still DRAFT; production `legal_basis` null). Hard
   stop.
9. **Follow-up:** two follow-ups, each with a new fact from the report, each approved by Joshua
   and dispatched through the same seven steps. No provider-side sequence
   (`PROJECT.md:91-92`), because a sequenced send bypasses the live suppression check and the
   fresh opt-out link.
10. **Replies:** by hand into the existing lifecycle. Note the hole (review finding S10):
    `lib/lifecycle.ts:75-78` says `replied` has no rung and no reply marker exists yet, and a
    reply meaning "unsubscribe" must reach the `suppressions` table. **Open: name that write
    path before Phase 4.**
11. **Call list:** anyone who clicks "plan a call", or replies.
12. **Call:** walk through the report together, then make the offer.

**Volume** stays at the recorded 10 to 50 prospects a week (`PROJECT.md:208-209`). The "5 a day
building to 20 to 40" ramp is out: it is up to 200 a week, the whole legal risk assessment was
argued at the low number (`PROJECT.md:166`), and the scanner cannot feed it anyway (bulk gets
two concurrent slots, `scanner-service/src/capacity.ts:10,15`, and the drain cron runs once a
day, `vercel.json:17-19`). Raising the volume is a separate decision that redoes the risk
assessment and the concurrency.

The report link opens the **full report directly**. No loading screen, no email gate, because we
already know who they are. This is already free: `/report/[id]` is public and ungated, and
`lib/draft-generator.ts:78-83` already writes the report URL into drafts.

## 10. Funnel 2: the public page with the live scan (NOT in this milestone)

Moved out at review. Reasons:
- The scanner cannot stream. The quick scan is one blocking POST returning a single JSON blob at
  the end (`lib/scanner-client.ts:116-135`, `scanner-service/src/index.ts:211-344`). There is no
  intermediate emission point. Live progress today is DB polling returning three coarse states
  (`app/api/scan/[id]/status/route.ts:24-30`), not six part-results. Six streamed parts means
  six independently-resolvable sub-jobs, a per-part result store, and SSE or fast polling. That
  is a milestone, not the word "streaming" in a table.
- A hardcoded "26 seconds left" countdown is a promise to a stranger that the pipeline cannot
  keep: `app/api/scan/route.ts:11` sets `maxDuration = 300` with the comment "Lighthouse needs
  ~60-90s".
- It is unbounded anonymous spend with no cap and no rate limit. The existing 5-scans-per-IP-hour
  limit covers `/api/scan` only (`app/api/scan/route.ts:56`).
- Capacity: the service returns 503 "At capacity" at two concurrent bulk scans
  (`scanner-service/src/index.ts:420-422`). Concurrent strangers from an ad hit that.
- If funnel 1 does not produce a paid project, this is dead weight.

The design (name search, 6 screens, live cards, the questions, the email gate) is kept as
written in revision 1 and lives in git history. It becomes its own milestone, decided after
funnel 1 reports a result.

## 11. Build phases

| Phase | What | Result |
|---|---|---|
| **1. Engine data** | Structured-data extractor, on-site social-proof detector, Overture competitor set, quote checks, the AI visibility probe (5 runs, pinned model, raw responses stored), the scoreable rule | All storable raw data for one business in Supabase |
| **2. Niche profile and score** | The installers profile with cited job values, the new score **replacing the old one everywhere**, the `draft-metric-selector` update, the old-scan render path, the money line, the to-do list with code-chosen numbers | One complete result per business, and the public scanner still correct |
| **3. Report** | The new report page replacing the old one, `noindex`, signed expiring links, the PDF build, "plan a call" | A report you can send |
| **4. Outbound** | Prospect Radar's lead filter, the new drafts, the SND-04 artifact for the chosen provider, the approve-then-dispatch send path, the reply-to-suppression write path | Approved drafts that dispatch on one click, switched off until counsel answers |

Four phases, not five. Funnel 2 is out (§10).

Phases 1 to 3 are tested on 10 real installers before one email goes out. **Be honest about what
that proves** (review finding S15): it proves the data flows. It does not prove the money line,
the to-do list or the pitch, because those can only be judged by a business. The success
criteria in §14 are all post-send.

**Started now, because the lead time is real and the cost is not:** the separate domain, the
Google Workspace mailbox, SPF/DKIM/DMARC, and the warm-up. Two to three weeks, about €10 a year
plus a few euros a month. Warm-up traffic must be our own, never real prospects, because the
legal gate is shut.

**Started now, next to the build:** the search for a review data source whose terms permit
storage. That is what unlocks stars, review counts and rating-based competitor rank later.

## 12. Costs

| Item | Cost |
|---|---|
| Google Places, live band only | One Place Details (Enterprise + Atmosphere) per report open. Free allowance 1,000/month on that SKU, then $25 per 1,000. Needs a hard spend cap. |
| Trustpilot Data Solutions | Price not published, waitlist only. Free to ask. |
| OpenAI API (check 6) | 15 calls per business (3 questions x 5 runs). New vendor, needs a key and a spend cap. |
| Gemini (summaries, to-do list) | Already in the stack |
| Send provider | Apollo free plan reportedly ~250 sends/day, 2 sequences, Gmail only (third-party figures, unverified). We need transport, not sequences. |
| Domain + Workspace mailbox | About €10 a year plus a few euros a month |
| Competitor scans | Our own scanner, against the two-concurrent-slot limit |

The plan now adds three vendors instead of six: OpenAI, Google Places (live only) and a send
provider. Trustpilot is a fourth only if the waitlist and the price work out. That is against the
"Vercel, Railway, Supabase, Resend, Gemini, Playwright only" constraint (`PROJECT.md:201-202`),
so each one needs writing down as an override before it is built.

We measure the real cost per scan on the first 10 tests.

## 13. Still open

In order of weight.

1. **Counsel.** The legal half of the Phase 8 gate is OPEN (`ROADMAP.md:33`). Nothing sends.
2. **The send provider.** Apollo, or a plain send API that only needs transport. Either way: the
   SND-04 artifact and the written acceptable-use verification come before any code
   (`PROJECT.md:213-217`).
3. **Werkspot** (§4a). Where Dutch installer reviews actually live. No public API. Read their
   terms before anything is built.
4. **Trustpilot Data Solutions:** join the waitlist, learn the price, measure the real coverage of
   Dutch installers on 10 names.
5. **The Places session-hold rule** (§4a): confirm how long a live response may be held before
   building the live band.
6. **The score weights** in §6 are Claude's proposal and need your check.
7. **The job values per trade:** you check the starting numbers, each with its citation.
8. **The light check** (§9 step 2): add a phone field and pre-scan contact discovery, or drop
   those two criteria.
9. **Pick versus triage** (§9 step 4): reconcile "worst website" with "busy enough to pay".
10. **The reply-to-suppression write path** (§9 step 10).
11. **Open tracking:** counsel, or drop it.
12. **The share button:** keep or drop.
13. **Three vendor overrides** written down: OpenAI, Google Places (live only), the send provider.

## 14. How we know it works

- At least 1 call per 25 emails.
- The first paid project from the scanner within the first 100 emails.

The "30% open their report" metric is out: pixel opens are unreliable, and open tracking is
deferred pending counsel. Measure clicks on "plan a call" and replies instead.
