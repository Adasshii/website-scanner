# Prospect Radar

## What This Is

A private prospecting layer built on top of the existing Website Scanner. It pulls
businesses from open map data, cheaply triages their websites, runs a full scan on the
ones that look bad enough to be worth pitching, and hands Joshua a drafted cold email
plus a hosted scan report to approve and send.

It exists to fill Adashi's own sales pipeline. It is a single-tenant internal tool, not
a product. If it demonstrably works for Joshua, productising it becomes a separate
milestone with its own decision.

## Core Value

Joshua opens the tool and finds businesses genuinely worth pitching, with the proof
already written, so that outreach costs him minutes instead of hours.

If everything else fails, this must work: a qualified prospect, a real scan report, and
a drafted message he is willing to send.

## Requirements

### Validated

<!-- Inferred from the existing codebase (see .planning/codebase/). Shipped and relied upon. -->

- ✓ Scan a website end to end via Playwright (crawl, extract, screenshot) — existing
- ✓ Detect accessibility issues via axe-core (WCAG 2.1) — existing
- ✓ Measure Core Web Vitals via Lighthouse (LCP, CLS, FCP, TBT) — existing
- ✓ Run a mobile usability pass in a separate browser context — existing
- ✓ Score a single page 0–100 and aggregate across pages — existing
- ✓ Generate AI analysis via Gemini (design critique, exec summary, quick wins, sales brief) — existing
- ✓ Persist scans, leads, and email events in Supabase with RLS — existing
- ✓ Render a hosted, shareable, bilingual (NL/EN) scan report at `/report/[id]` — existing
- ✓ Send transactional email via Resend with delivery/open/click event tracking — existing
- ✓ Admin dashboard listing leads and scan detail — existing
- ✓ Quick scan (synchronous) and full scan (async, callback webhook) modes — existing
- ✓ Cron-driven follow-up email with per-lead guardrails — existing

### Active

<!-- Current scope. Hypotheses until shipped and validated. -->

- [ ] Import businesses from Overture Maps, filtered by country, region, and category
- [ ] Store prospects with a stable identity that survives re-imports (no duplicates)
- [ ] Cheap triage pass on every prospect (reachability, HTTPS, mobile viewport, page
      weight, load time) with no Lighthouse and no AI
- [ ] Rank and shortlist prospects by triage signal, so only qualified ones get a full scan
- [ ] Queue and run full scans in bulk without exhausting scanner-service browser concurrency
- [ ] Extract a contact email from the prospect's own website during scanning
- [ ] Prefer generic business addresses (`info@`) over named-person addresses
- [ ] Generate a drafted cold email per prospect, grounded in that prospect's actual scan findings
- [ ] Review queue where Joshua approves, edits, or rejects each message before it sends
- [ ] Suppression list in Supabase as the source of truth, checked at send time (not draft time)
- [ ] Working unsubscribe endpoint that writes to the suppression list
- [ ] Automatic suppression on hard bounce and spam complaint, wired to the existing Resend webhook
- [ ] Immutable audit trail of what was sent, to whom, when, and on what legal basis
- [ ] Article 14 GDPR notice folded into the first-contact message template
- [ ] Legal basis (Legitimate Interest Assessment) stored as a versioned artifact in the repo
- [ ] Per-country legal-basis configuration, so expansion is a config decision with a paper trail

**Gated — blocked on the send-path decision (see Key Decisions):**

- [ ] Dispatch approved outreach via a channel that permits it, with `List-Unsubscribe` on
      every electronic message. Provider and channel are deliberately UNDECIDED. Resend is
      ruled out (see below). Everything upstream of this is unblocked and gets built first.
- [ ] Track prospect lifecycle beyond scan result (new → qualified → contacted → replied → booked)
- [ ] Measure reply rate and booked calls attributable to outreach
- [ ] Country and locale are parameters throughout — no hardcoded geography

### Out of Scope

<!-- Explicit boundaries. Reasoning included to prevent re-adding. -->

- No-website prospect segment — deferred to a later phase. There is no site to scan, so
  the existing engine contributes nothing, and there is no email address to reach them
  on. The data model must not block it, but v1 does not build it.
- Multi-tenancy (users, teams, per-user lists, access control) — this is a single-tenant
  internal tool. Building it for a buyer who may never exist is paying for an unvalidated
  hypothesis. Becomes its own milestone if the tool proves itself.
- Billing and subscriptions — nothing to bill; there are no customers.
- Google Places as a data source at scale — prior research put Text Search with
  `websiteUri` in the Enterprise SKU tier at roughly $35/1K, which cannot coexist with
  the near-zero-cost constraint. Its 30-day caching restrictions also conflict with
  holding a durable prospect list. Overture is free and global.
- Automated sending without human approval — every message passes a human gate. This is
  both a quality decision and a risk decision.
- Fully automated multi-step outreach sequences — at 10–50 prospects per week, manual
  follow-up is cheaper than building a sequencer.
- Fixing the scanner's known check gaps (security headers, structured data, Open Graph,
  broken-link detection) — real, tracked in `docs/scanner-backlog.md`, but a separate
  concern from prospecting.

## Context

**Existing system.** Two deployables. A Next.js 14 App Router frontend on Vercel that
orchestrates scans, polls status, and serves reports; and an Express + Playwright service
on Railway that does the actual scanning. Supabase (PostgreSQL + Storage) is the source
of truth. Resend handles email, Gemini handles AI analysis. There is no user login system
anywhere: auth is API-key and shared-secret only, service to service.

**Today the scanner is a public lead magnet.** A visitor submits their own URL, gets a
report, and becomes a row in `leads`. Prospect Radar inverts that flow: Joshua picks the
targets, and they never opt in. That inversion is the whole project, and it is also the
source of every legal question below.

**Why bad-website leads.** Two reasons, and the second matters more than it first appears.
It reuses the entire existing scan engine. And a business with a website carries its
contact email on that website, which Playwright is already loading. Overture and Places
do not reliably supply emails. The segment solves its own contact-data problem.

**Prior research (2026-07-16, same day as this init).** Overture Maps was probed against
Amsterdam. An initial reading suggested 98% brand affiliation in the no-website segment;
that turned out to be a false positive, and the corrected count was ~2,147 actionable
commercial prospects. Google Places API pricing and caching terms were investigated in
depth: field masking pushes `websiteUri` into the Enterprise tier, and Places
distinguishes Google IDs (cacheable indefinitely) from coordinate data (30-day limit).
These findings drove the Overture-over-Places decision recorded below.

**Known blockers from the codebase audit** (`.planning/codebase/CONCERNS.md`, dated
2026-07-16). The mapper explicitly flagged these as missing for a prospecting feature:

- No bulk import or queueing anywhere in the codebase.
- No user or team concept. Everything is global, admin or public.
- No prospect lifecycle. A lead has a scan result and nothing else — no "contacted", no
  "interested", no outcome.
- Browser concurrency and per-request limits will not survive bulk scanning as built.
- Scoring logic is duplicated between `scanner-service/src/scoring.ts` and `lib/scoring.ts`
  and has already diverged. Bulk scanning will amplify any divergence.
- Cron reliability is thin, and the admin dashboard has no rate limiting.

**Legal exposure is a first-class engineering concern, not paperwork.** Cold outreach to
businesses in the Netherlands is governed by Telecommunicatiewet art. 11.7 and by GDPR.
The Dutch spam ban was extended to B2B in 2009, so "they are a business" is not a free
pass. Two things were established during questioning and should not be re-litigated:

1. Manual sending and queued sending carry the same legal posture. The mechanism is not
   the dividing line; consent or a valid exemption is. A human gate is a quality and risk
   control, not a legal shield.
2. `info@bedrijf.nl` and `jan@bedrijf.nl` are not equivalent under GDPR. The second is
   personal data about an identifiable human.

**Research answered the exemption question, and the answer went against the premise.**
Telecommunicatiewet art. 11.7 lid 2(a) exempts unsolicited B2B email only where the
address was designated **and published specifically for receiving such communications**.
A generic `info@bedrijf.nl` scraped from a contact page was published so customers could
reach the business, not so agencies could pitch it. It does not clear that bar (MEDIUM
confidence: consistent secondary legal sources, no directly on-point case law found).
Preferring `info@` remains the right GDPR-minimisation choice, but it is **not** a
Telecommunicatiewet safe harbour. See `.planning/research/LEGAL.md`.

Consequences now baked into the requirements above:

- Default posture is a documented GDPR legitimate-interest basis (Art. 6(1)(f)) plus an
  Art. 14 notice folded into the first message, treating any Tw exemption as a bonus case
  rather than the default. Art. 14(5)(b) "disproportionate effort" will not save skipping
  the notice; a directly analogous Polish DPA case rejected exactly that argument because
  the controller already held usable contact details, as Joshua would.
- Dutch legitimate-interest for customer acquisition is **genuinely unsettled**: the AP's
  2019 guidance says it does not qualify, the 2020 VoetbalTV ruling undercut that, and
  EDPB Guidelines 1/2024 take a middle path (possible, not automatic, three-part test).
  This is live ambiguity and is recorded as ambiguity.
- ACM enforcement at 10–50/week is low probability; real cases target mass spammers.
  **Low enforcement probability is not the same as lawful.** These are separate claims and
  are not to be merged.
- Country risk ranking for expansion: UK (most favourable, PECR corporate-subscriber
  exemption) > Netherlands > Belgium > Germany (most hostile, no B2B carve-out). Worth
  noting that NL-first-then-global starts in the third-best of four researched markets.

Research output is not legal advice and does not substitute for it. Counsel runs in
parallel with the build and must land before the send phase opens.

**Resend: mechanics understood, account ruled out for outreach.** Resend supports a
`List-Unsubscribe` header on transactional sends, exposes a Suppressions API
(`resend.suppressions.add`, with a batch endpoint still in private beta), and carries an
`unsubscribed` flag on Contacts (Audiences only). It does **not** manage contact lists for
transactional email, so Joshua owns the unsubscribe endpoint and the decision not to send
regardless. That is why the suppression table lives in Supabase as source of truth.

But Resend's **Acceptable Use Policy prohibits cold outreach outright**, so none of those
mechanics are usable for this purpose on this account. Resend stays exactly where it is:
transactional email for the existing public scanner, untouched and uncontaminated. The
outreach channel is a separate, deliberately open decision. The `List-Unsubscribe`
pattern and the suppression design carry over to whatever channel is chosen; only the
dispatcher changes.

**Other verified pitfalls now shaping the build** (see `.planning/research/PITFALLS.md`):
bulk-scanning strangers' sites from the same Railway IP that serves the live public
scanner risks WAF fingerprinting that would degrade the production product, so the scan
queue owns rate-limiting, an honest user-agent, robots.txt respect, and skip-not-retry.
Overture data quality is a proven risk on this project specifically, not a theoretical
one — prior research already produced a 98% false-positive read before correction — so
dedupe-by-domain and reachability verification belong to the import phase, not triage.

## Constraints

- **Tech stack**: Vercel, Railway, Supabase, Resend, Gemini, Playwright only — no new
  infrastructure. Everything is already paid for and already understood.
- **Budget**: costs stay near zero. This is what rules out Places at scale, and what makes
  the triage stage load-bearing rather than optional.
- **Performance**: bulk scanning must respect scanner-service browser concurrency. The
  codebase audit says the current limits break under bulk load; the design must not
  pretend otherwise.
- **Scale**: 10–50 prospects per week. Deliberately small. Solutions sized for thousands
  are over-built and should be rejected on sight.
- **Legal**: every send passes a human gate, carries `List-Unsubscribe`, and is checked
  against the suppression list first. Non-negotiable.
- **Provider policy**: the outreach channel must permit outreach under its own terms.
  Resend does not. Any candidate channel is checked against its AUP before it is built
  against, not after.
- **Blast radius**: nothing in this milestone may put the existing public scanner's email
  or scanning at risk. It works and it earns. Outreach failures must stay contained.
- **Geography**: country and locale are parameters, never hardcoded. NL is the first
  target, not the only one.
- **Tenancy**: single-tenant. No users, no teams, no billing.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| **Resend is ruled out for outreach** (supersedes the original "send via Resend" decision) | Resend's AUP (verified verbatim, updated 2026-05-28) prohibits "unsolicited messages of any kind, including cold outreach, purchased lists, or scraped contact data." No low-volume carve-out. Compounding: the production scanner shares that Resend account for transactional mail, so a violation risks killing email for the already-working product | ✓ Good (caught in research, before any build) |
| **Build the engine, gate the send phase** | The legal and provider risk concentrates entirely in the send step. Import, triage, bulk scan, qualify, and draft are low-risk and hold the value. Decoupling unblocks all of it today and avoids building a send pipeline that may have to be thrown away | — Pending |
| **Lawyer engaged in parallel, not as a blocker** | The open legal questions are real but do not gate the engine. Counsel runs alongside the build and must land before the send phase opens | — Pending |
| Changing email provider does NOT fix the legal basis | Two separate problems. Resend's AUP is solved by changing provider; Telecommunicatiewet consent is not — it is indifferent to whether Resend, Gmail, or a human hand sent the message. Recorded because this conflation has already come up twice | ✓ Good |
| Bad-website segment first, no-website deferred | Reuses the whole scan engine, and the prospect's own site supplies the contact email that Overture and Places cannot | — Pending |
| Overture Maps over Google Places | Free and global; Places pushes `websiteUri` into the ~$35/1K Enterprise tier and imposes 30-day coordinate caching, both fatal under near-zero cost | — Pending |
| Two-stage funnel: cheap triage, then full scan | A full Playwright + Lighthouse + Gemini scan on every prospect burns budget on businesses that will never be contacted | — Pending |
| Queue with per-message human approval | Legal posture is identical to manual sending, so the human gate buys quality control and speed rather than legal cover | — Pending |
| Compliance in v1, not v2 | Suppression, opt-out, and audit trail must exist before the first cold email, not after | — Pending |
| Supabase suppression table as source of truth | Resend does not manage lists for transactional email; an owned table is what can be queried, proven, and audited | — Pending |
| Single-tenant, no multi-tenancy accommodation | Productising is an unvalidated hypothesis; build for the one confirmed user | — Pending |
| Global-capable from day one, NL first | Overture is global anyway; parameterising geography now is cheap, retrofitting it later is not | — Pending |
| Success = reply rate (fast signal) + booked calls (real signal) | Reply rate gives a read in days; booked calls prove it. `booked_at` is already tracked via the Fillout webhook | — Pending |
| Legal question researched, not assumed | NL extended its spam ban to B2B in 2009; confident-sounding guesses here carry real downside | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Phase 1 (Prospect Data Foundation & Import) complete 2026-07-18 — migrations 010–013 live in production, dedupe engine (domain identity + GERS sources, freeze-by-omission) tested 45/45, importer CLI with exact province boundaries and aggregator denylist passed the D-11 sample audit. IMP-01..07 validated. First real (writing) import remains a manual command.*

*Last updated: 2026-07-17 after initialization and the five-dimension research pass
(STACK, FEATURES, ARCHITECTURE, PITFALLS, LEGAL). Research contradicted two locked
decisions: the Resend send path is dead, and the Tw art. 11.7 B2B exemption does not
cover scraped generic addresses. Both are reflected above.*
