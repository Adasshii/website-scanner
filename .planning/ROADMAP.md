# Roadmap: Prospect Radar

## Overview

Prospect Radar is built as a pipeline, one working stage at a time, bolted onto a scanner that already works and already earns. Prospects come in from Overture, get triaged cheaply, and only the worst ones earn a full scan. That scan produces both the proof (a hosted report) and the contact (an email off the prospect's own site). From there a draft is written from real findings, Joshua approves it by hand, and — once the send path clears — it goes out with a full record of why it was allowed to.

The compliance spine is not the last phase. Suppression and unsubscribe ship in parallel with the importer, before anything can be sent, because the ability to say "stop" has to exist before the first cold email, not after. The send phase is the only gated one: Resend is ruled out by its own AUP, the channel is deliberately undecided, and legal counsel runs alongside the build rather than in front of it. Every phase below Phase 8 ships without that decision landing.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Prospect Data Foundation & Import** - Overture businesses become a durable prospect list that survives re-import (completed 2026-07-18)
- [x] **Phase 2: Compliance Spine** - Suppression, unsubscribe, and versioned legal basis exist before anything can be sent (completed 2026-07-19)
- [x] **Phase 3: Triage & Shortlist** - Every prospect gets a cheap verdict; only the worst earn a full scan (completed 2026-07-20)
- [x] **Phase 4: Bulk Scan Queue** - Shortlisted prospects get real scan reports without harming the live public scanner (completed 2026-07-23)
- [x] **Phase 5: Contact Extraction & Classification** - Each scanned prospect carries a contact address whose legal status is known (completed 2026-07-27)
- [x] **Phase 6: Draft Generation & Approval Queue** - A drafted message Joshua is willing to send, backed by evidence he can check (completed 2026-07-30)
- [ ] **Phase 7: Lifecycle, Reporting & Retention** - The funnel reports what it did, and old data expires on its own
- [ ] **Phase 8: Send — GATED** - An approved message reaches a business through a channel that permits it, with proof of why

## Parallel Track: Send-Path & Legal Decision (NOT a phase, NOT a blocker)

This track runs alongside Phases 1–7 from day one. It gates **Phase 8 only**. No other phase waits on it, and no other phase may be re-sequenced behind it.

| Item | Owner | Gates |
|------|-------|-------|
| Engage counsel on legitimate-interest basis, Article 14 wording, and the Tw art. 11.7 exemption question | Joshua + lawyer | Phase 8 |
| Choose the outreach channel/provider and verify its AUP in writing (SND-04 is the deliverable) | Joshua | Phase 8 |
| Stand up a separate outreach domain with SPF/DKIM/DMARC, warmed before target volume (Pitfall 1) | Joshua | Phase 8 |

**Why this is not Phase 0:** research proposed a blocking gate ahead of everything. That was overridden deliberately. The legal and provider risk concentrates entirely in the send step; import, triage, scan, extract, and draft are low-risk and hold the value. Building them now avoids a send pipeline that may have to be thrown away.

**What ships without it:** Phases 1–7. That is a working prospect funnel producing scans, contacts, drafts, and an approval queue — everything except dispatch.

## Phase Details

### Phase 1: Prospect Data Foundation & Import

**Goal**: Joshua pulls a country/region/category slice of businesses from Overture into a durable prospect list that survives re-import
**Depends on**: Nothing (first phase)
**Requirements**: IMP-01, IMP-02, IMP-03, IMP-04, IMP-05, IMP-06, IMP-07
**Success Criteria** (what must be TRUE):

  1. Joshua runs the importer with a country, region, and category and new prospects appear in the list (IMP-01, IMP-02)
  2. Re-running the same import creates no duplicates, and two Overture records sharing a domain appear as one prospect (IMP-03, IMP-04)
  3. Re-running the import leaves triage results, lifecycle state, and approval history already on a prospect untouched (IMP-05)
  4. Every prospect shows which country it belongs to (IMP-06)
  5. Prospects with no website appear marked as such and never enter the outreach flow (IMP-07)

**Plans**: 4/4 plans complete
**Wave 1**

- [x] 01-01-PLAN.md — Migrations 010–013 (prospects, prospect_sources, outreach_messages, scans.prospect_id) + [BLOCKING] live-prod schema push (wave 1)
- [x] 01-02-PLAN.md — Test infra (vitest) + package-legitimacy checkpoint & installs (@duckdb/node-api, tldts, tsx) + shared types & Overture fixtures (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — Dedupe engine: normalizeDomain (tldts) + upsertOverturePlace (GERS-then-domain branching, freeze-by-omission) + integration suite (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — Importer CLI: overture-client (DuckDB, runtime category detection) + import-prospects.ts (--dry-run/--limit, SSRF-safe reachability) + D-11 sample-audit gate (wave 3)

Phase work not yet a numbered requirement:

- Migrations: `prospects`, `outreach_messages`, `scans.prospect_id` (nullable). Deliberately NOT merged into `leads` — `leads` implies opt-in, and that distinction is the legal crux of the milestone.

Notes:

- The importer is a one-off script (`scripts/import-prospects.ts`) run locally or on demand, NOT a Vercel route. Overture GeoParquet scans are the wrong shape for a 300s function.
- Overture data quality is a proven risk on this project, not a theoretical one — prior research produced a 98% false-positive read before correction. Dedupe-by-domain belongs here, not in triage, and a manual sample audit runs before the pipeline is trusted at scale (Pitfall 3).

### Phase 2: Compliance Spine

**Goal**: A business that says "stop" is unreachable from that moment on, and the basis for contacting anyone is recorded and versioned
**Depends on**: Nothing (runs in parallel with Phase 1 — its tables are independent)
**Requirements**: CMP-01, CMP-03, CMP-04, CMP-05, CMP-06, CMP-07, CMP-08, CMP-16
**Success Criteria** (what must be TRUE):

  1. Clicking unsubscribe returns success only after the suppression is written, and clicking it twice succeeds both times (CMP-04)
  2. A suppressed record blocks that address and every other address on the same domain, permanently and from the next send cycle onward (CMP-01, CMP-03, CMP-05)
  3. A hard bounce or spam complaint on the existing Resend event webhook lands in the suppression list without anyone touching it (CMP-07)
  4. Re-adding a suppressed record is impossible without an explicit override that leaves a log entry (CMP-06)
  5. Joshua can look up which LIA version and which country's legal regime applies to a given prospect (CMP-08, CMP-16)

**Plans**: 6/7 plans executed

**Wave 1** *(independent foundations — parallel)*

- [x] 02-01-PLAN.md — suppressions table (migration 014) + lib/suppression.ts (isSuppressed/writeSuppression/liftSuppression) + unit & integration suites (wave 1)
- [x] 02-02-PLAN.md — legal-basis schema (migration 015: lia_versions + legal_regimes + immutability trigger + NL seed) + docs/legal/lia/LIA-v1.md + immutability test (wave 1)
- [x] 02-03-PLAN.md — lib/unsubscribe-token.ts (HMAC sign/verify, stdlib crypto, no PII, no expiry) + unit tests (wave 1)

**Wave 2** *(consumers — blocked on Wave 1)*

- [x] 02-04-PLAN.md — app/api/unsubscribe/[token]/route.ts (GET verify→write→confirm, RFC 8058 one-click POST) + integration test (wave 2)
- [x] 02-05-PLAN.md — Resend webhook auto-suppression (extend in place) + scripts/backfill-suppressions.ts (D-06) + tests (wave 2)
- [x] 02-06-PLAN.md — scripts/suppression-override.ts (logged lift) + scripts/legal-basis.ts (country→regime→LIA lookup) + tests (wave 2)
- [x] 02-07-PLAN.md — [BLOCKING] apply migrations 014 + 015 to the live Supabase project (wave 2, human gate)

Notes:

- ARCHITECTURE.md is explicit: this is a **co-requisite of the data-model migration, not step 9**. Compliance ships in v1. It is placed second, not last, on purpose.
- This phase owns its own migrations (`suppressions`, per-country legal-basis config). It does not depend on Phase 1's tables.
- The suppression table is the source of truth. Resend's Suppressions API is a backstop only — and this account never sends outreach regardless.
- The LIA **artifact and versioning mechanism** ship here. Its **content** is reviewed by counsel on the parallel track. The mechanism does not wait for the review.
- CMP-07 wires to the existing Resend webhook, which already exists. This is the one place the existing transactional integration is touched, and it is read-only with respect to sending.

### Phase 3: Triage & Shortlist

**Goal**: Joshua opens a ranked shortlist of the worst sites, produced without spending a cent on Playwright, Lighthouse, or AI
**Depends on**: Phase 1
**Requirements**: TRI-01, TRI-02, TRI-03, TRI-04, TRI-05, TRI-06, TRI-07, TRI-08, TRI-09
**Success Criteria** (what must be TRUE):

  1. Every imported prospect gets a triage result with no browser, no Lighthouse, and no AI anywhere in the path (TRI-01)
  2. Each triaged prospect shows reachability, HTTPS plus the full redirect chain, mobile viewport presence, page weight, and response time (TRI-02, TRI-03, TRI-04, TRI-05)
  3. Joshua opens a shortlist ranked worst-first by a single triage score (TRI-06, TRI-07)
  4. Changing the cutoff changes which prospects are eligible for a full scan (TRI-08)
  5. With the cutoff opened wide, no run releases more full scans than the hard ceiling allows (TRI-09)

**Plans**: 6/6 plans complete
**UI hint**: yes

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Foundations: migration 016 (scan_released_at) + local apply, types/triage.ts, tunable constants block, Wave 0 fixtures (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Compute: lib/triage-fetch.ts (redirect-chain GET, per-hop SSRF guard, robots.txt, viewport/weight/TTFB) + lib/triage-scorer.ts (gate-then-weighted) (wave 2)
- [x] 03-03-PLAN.md — Release: lib/triage-release.ts (worst-N + hard ceiling) + app/api/admin/release-prospects route (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-04-PLAN.md — CLI: lib/triage-candidates.ts + scripts/triage-prospects.ts (`npm run triage`, bounded concurrency) (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-05-PLAN.md — Shortlist UI: SignalChips/CutoffSlider/ShortlistTable/ReleaseButton + shortlist GET route + admin tab (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-06-PLAN.md — [BLOCKING] apply migration 016 to live Supabase (human gate) (wave 5)

Notes:

- **This phase must ship before or with Phase 4. It is the load-bearing sequencing decision of the whole project.** Queueing every imported prospect straight into the scan queue reintroduces the exact concurrency and budget failure CONCERNS.md warns about.
- Triage is native `fetch()` + regex on raw HTML. DOM libraries (jsdom, Cheerio) are rejected on sight — they are the exact cost triage exists to avoid.
- TRI-09's ceiling is enforced independently of TRI-08's cutoff. A permissive cutoff is a tuning mistake; a missing ceiling is a budget blowout (Pitfall 4). Set an explicit pass-rate target here.

### Phase 4: Bulk Scan Queue

**Goal**: Shortlisted prospects get real scan reports at bulk without putting the live public scanner at risk
**Depends on**: Phase 3
**Requirements**: SCAN-01, SCAN-02, SCAN-03, SCAN-04, SCAN-05, SCAN-06, SCAN-07, CMP-17
**Success Criteria** (what must be TRUE):

  1. Joshua queues a batch of shortlisted prospects and each one ends showing queued, scanning, done, or failed (SCAN-01, SCAN-03)
  2. The scanner service refuses requests over its capacity instead of accepting them and timing out (SCAN-02)
  3. The live public scanner holds its normal success rate throughout a bulk run (SCAN-06)
  4. A prospect whose scan fails is skipped rather than retried indefinitely, and bulk scanning identifies itself honestly, respects robots.txt, and is rate-limited (SCAN-04, SCAN-05)
  5. Each scanned prospect has a report at a hosted URL identical in form to the public scanner's, and personal data caught incidentally in screenshots is not separately indexed, profiled, or reused (SCAN-07, CMP-17)

**Plans**: 6/6 plans complete

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Foundations: migration 017 (scan_status/attempts/reason + `claim_next_scan_batch` SKIP LOCKED RPC) + `lib/bulk-scan-constants.ts` + `scanner-service/src/capacity.ts` + p-limit declared (wave 1)

**Wave 2** *(blocked on Wave 1)*

- [x] 04-02-PLAN.md — Scanner service: `full-async` 503 capacity refusal, bulk user-agent passthrough, CMP-17 no-profiling prompt + LIA record (wave 2)

**Wave 3** *(blocked on Wave 2)*

- [x] 04-03-PLAN.md — Libraries: `lib/scan-queue.ts` (arm/claim/fail/requeue/reconcile) + `lib/bulk-scan-dispatch.ts` (robots pre-flight, SSRF, paced p-limit dispatch) + SKIP LOCKED overlap integration test (wave 3)

**Wave 4** *(blocked on Wave 3)*

- [x] 04-04-PLAN.md — Routes: `/api/cron/drain-scan-queue` + vercel.json schedule, `/api/admin/run-batch`, `/api/admin/requeue-scan` (wave 4)

**Wave 5** *(blocked on Wave 4)*

- [x] 04-05-PLAN.md — Admin UI: Shortlist status column, report link, re-queue action, RunBatchButton (wave 5, human checkpoint)

**Wave 6** *(blocked on Wave 5)*

- [x] 04-06-PLAN.md — SCAN-06 health measurement script + [BLOCKING] apply migration 017 to live Supabase + end-to-end batch verification (wave 6, human gate)

Notes:

- Postgres `SELECT ... FOR UPDATE SKIP LOCKED` + Vercel Cron + `p-limit`. STACK.md and ARCHITECTURE.md converged on this design independently — treat as high confidence. No job-queue library. No new infrastructure.
- The concurrency gate extends the scanner-service's existing `activeFullScans` map. It already tracks exactly what is needed. This is an addition, not a rewrite.
- Blast radius: bulk-scanning strangers' sites from the same Railway IP that serves the live scanner risks WAF fingerprinting that would degrade the production product (Pitfall 2). Verification watches the public scanner's success rate alongside the bulk run — no shared degradation is a pass condition, not a nice-to-have.
- Dispatch reuses `lib/scanner-client.ts` and the existing `full-async` endpoint. No new scanner-service endpoint.

### Phase 04.1: Prospect Quality — category exclusion, gate split, batch size (INSERTED)

**Goal:** The shortlist feeds the pipeline the right businesses before Phase 5: food-service categories and unreachable sites are never releasable, no-HTTPS sites stay top priority, and one daily drain tick scans up to 10 prospects.
**Requirements**: 3 captured todos (no numbered IDs) — exclude-food-service-categories, split-triage-gate-unreachable-vs-no-https, raise-bulk-batch-size-for-daily-cron
**Depends on:** Phase 4
**Plans:** 2/2 plans complete

Plans:

- [x] 04.1-01-PLAN.md — Releasability engine: isReleasable predicate + EXCLUDED_CATEGORIES, wired into selectWorstN/getShortlist, BULK_BATCH_SIZE 2→10 (wave 1)
- [x] 04.1-02-PLAN.md — Shortlist UI: rename GATED→CRITICAL, unreachable visible-not-releasable, counts via isReleasable; ship to prod + verify (wave 2)

### Phase 5: Contact Extraction & Classification

**Goal**: Each scanned prospect carries a contact address whose legal status is known and recorded
**Depends on**: Phase 4
**Requirements**: CON-01, CON-02, CON-03, CON-04, CON-05, CON-06, CON-07
**Success Criteria** (what must be TRUE):

  1. A prospect's contact email appears after its scan, with no second fetch of the site (CON-01)
  2. Addresses behind `mailto:` links, in body text, and behind Cloudflare `data-cfemail` obfuscation are all found (CON-02)
  3. Every address is stored as `generic` or `named-person`, and where both exist the generic one is chosen (CON-03, CON-04)
  4. A prospect whose only address is a named person is flagged for manual review and stays out of the default outreach flow (CON-05)
  5. Each prospect records whether its source page invited commercial contact (defaulting to no) and whether it is a sole proprietorship whose generic address is therefore personal data (CON-06, CON-07)

**Plans**: 4/4 plans complete

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Foundation: migration 018 (contact_email_type CHECK + commercial_contact_invited + sole_proprietorship) + local apply + shared types (ContactExtraction, PageData.contactExtraction, ProspectRow columns) (wave 1)

**Wave 2** *(blocked on Wave 1)*

- [x] 05-02-PLAN.md — Pure `lib/contact-extraction.ts` (decode/parse/classify/detect/aggregate) + unit tests + extractor harvest of raw contact material (mailto/cfemail/text) (wave 2)

**Wave 3** *(blocked on Wave 2)*

- [x] 05-03-PLAN.md — Wire aggregateContacts into `reconcileInFlightScans` on the done transition (fill-only-when-null) + local-Supabase integration cases (wave 3)

**Wave 4** *(blocked on Wave 3)*

- [x] 05-04-PLAN.md — Shortlist NAMED-PERSON pill + [BLOCKING] live migration 018 + Railway + Vercel deploys + real-batch verification (wave 4, human gate)

Notes:

- The extractor rides the scan Playwright already runs (`scanner-service/src/extractor.ts`). It adds no crawl and no second fetch — re-fetching the page is an explicit anti-pattern in ARCHITECTURE.md.
- CON-06 is the only field that could ever trigger the narrow Tw art. 11.7(2)(a) exemption. It defaults to "no" and the pipeline proceeds on legitimate-interest plus notice regardless. Preferring `info@` is a GDPR-minimisation choice, **not** a Telecommunicatiewet safe harbour. Do not re-litigate this.
- CON-07 (eenmanszaak) is the sole-proprietorship edge case SUMMARY.md flagged as an open design gap. It lands here.

### Phase 6: Draft Generation & Approval Queue

**Goal**: Joshua opens a queue of drafted messages he is willing to send, each backed by evidence he can check
**Depends on**: Phase 5
**Requirements**: DRA-01, DRA-02, DRA-03, DRA-04, DRA-05, DRA-06, QUE-01, QUE-02, QUE-03, QUE-04, QUE-05
**Success Criteria** (what must be TRUE):

  1. The verdict in the ranked prospect list, the hosted scan report, and the drafted email are the same verdict for the same scan (DRA-06)
  2. Each shortlisted prospect has a draft citing a specific checkable number from its own scan and linking to its own hosted report rather than restating it (DRA-01, DRA-02, DRA-03)
  3. Drafts land as helpful rather than as an insult about someone's website (DRA-04)
  4. The first-contact template carries the Article 14 notice without anyone adding it by hand (DRA-05)
  5. Joshua reads every draft with its scan evidence beside it, edits inline, approves one at a time, or rejects the prospect outright — and finds no bulk-approve action anywhere (QUE-01, QUE-02, QUE-03, QUE-04, QUE-05)

**Plans**: 8/8 plans executed

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — DRA-06 verdict consolidation: one `computeVerdict()` in `lib/scoring.ts`, imported by the scanner service (wave 1)
- [x] 06-02-PLAN.md — Blocking manual prerequisites: `GEMINI_API_KEY` for the Next.js runtime, live `lifecycle_state = 'rejected'` constraint check (wave 1, non-autonomous)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — Versioned prompt file (tone brief, Article 14 notice EN+NL, locale map, subject template) and the citable-metric selector (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-04-PLAN.md — `generateDraft()`: Gemini call from Next.js, verbatim-metric guard, report link, notice append (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-05-PLAN.md — Scan-complete prospect branch and eligibility gate, placed before the email guard (wave 4)
- [x] 06-06-PLAN.md — Outreach queue library and admin API: list, edit, approve, reject, regenerate, manual generate (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-07-PLAN.md — Outreach admin tab: single-open expandable review panel with evidence pane (wave 5, non-autonomous)
- [x] 06-08-PLAN.md — Shortlist "Generate draft" affordance for named-person and failed-generation prospects (wave 5)

**UI hint**: yes

**Schema note (added at plan time, 2026-07-28):** this phase authors NO migration file. `outreach_messages`
(migration 012) already carries the full status enum plus `approved_by`/`approved_at`, and
`prospects.lifecycle_state` (migration 010) already carries the unused `'rejected'` value D-6-15 needs.
06-02 verifies the live constraint by hand in the Supabase dashboard SQL Editor rather than applying
new DDL. Phase 7 (TRK-01/02) owns the lifecycle state machine and must not reintroduce a parallel
reject flag or overwrite this value in a generic status-advance sweep.

**DRA-06 — scoring verdict-threshold fix (first plan of this phase):**

- `lib/scoring.ts` and `scanner-service/src/index.ts` each carry their own verdict-threshold function with different cutoffs (95/85/70/50 vs 90/70/50). Today that is a cosmetic admin-panel mismatch. The moment a draft quotes a verdict in an email to a stranger, the same number has to mean the same thing in the prospect list, the report the prospect clicks through to, and the email — or the pitch contradicts itself in front of the person being pitched. Consolidate into one function exported from `lib/scoring.ts`, imported by `scanner-service/src/index.ts` and the draft generator. **This is a one-function prerequisite scheduled as the first plan of this phase — it does not gate Phases 1-5.** Numbered as DRA-06 on 2026-07-17 at Joshua's direction, after the roadmapper correctly flagged that unnumbered work goes untracked.

Notes:

- The **intentional** per-page (`scorePage()`) vs aggregate (`aggregateScores()`) split stays. It is documented layering, not a bug, and triage's score is a third independent function that touches neither. Only the verdict-threshold divergence gets fixed. Do not turn this into a scoring refactor.
- The draft generator needs **full scan output**, not triage output. Triage is too thin to write a credible evidence-based line.
- Suppression is NOT checked here. It gates send only (Phase 8) — state changes while a draft waits in the queue.
- Distinct cold-outreach tone brief in the Gemini prompt; the first N drafts get read by Joshua before the pattern is trusted (Pitfall 5). Draft generation calls Gemini from Next.js — no browser needed.
- No bulk-approve, by design. It directly undermines the human gate the compliance posture depends on.

### Phase 7: Lifecycle, Reporting & Retention

**Goal**: Joshua sees what the funnel actually did, and data that has outlived its basis expires without him thinking about it
**Depends on**: Phase 4
**Requirements**: TRK-01, TRK-02, TRK-03, TRK-04, TRK-05, CMP-13, CMP-14, CMP-15
**Success Criteria** (what must be TRUE):

  1. Every prospect shows a lifecycle state of new, qualified, contacted, replied, or booked, advancing off real events rather than manual bookkeeping (TRK-01, TRK-02)
  2. Joshua sees how many prospects were imported, triaged, scanned, and contacted per run (TRK-05)
  3. Joshua sees reply rate across contacted prospects and booked calls attributable to outreach, from the existing Fillout `booked_at` signal (TRK-03, TRK-04)
  4. Prospect, scan, and outreach data past the retention window expires on a schedule, deleting or anonymising by config rather than by hardcoding (CMP-13, CMP-14)
  5. Suppression records survive the retention job and are flagged in code as permanently exempt (CMP-15)

**Plans**: 10/10 plans executed
**UI hint**: yes

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Component-test infrastructure and migration 019 (`prospects.booked_at`)
- [x] 07-02-PLAN.md — `deriveLifecycleState()`, the reporting route and the Reporting tab

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-03-PLAN.md — Per-day aggregates, reply-rate formatting and the sent-gate copy

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-04-PLAN.md — Stage column on the Shortlist tab

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-05-PLAN.md — Booking attribution in the Fillout webhook

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 07-06-PLAN.md — Retention config, expiry clock and the cron route, dry-run only

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 07-07-PLAN.md — Anonymise and delete modes, the monthly schedule, and the flip decision

**Wave 7** *(gap closure — blocked on Wave 6 completion)*

- [x] 07-08-PLAN.md — `prospect_sources` anonymisation: the decision, the code path, and the test that pins it (closes FA-CMP-13-SOURCES / WR-03)

**Wave 8** *(gap closure — blocked on Wave 7 completion)*

- [x] 07-09-PLAN.md — Candidate-set correctness: chunked `getShortlist()` lookup and uncapped booking attribution (closes WR-02, WR-01)

**Wave 9** *(gap closure — blocked on Wave 8 completion)*

- [x] 07-10-PLAN.md — Deploy the retention cron and gather its four evidence steps; close both broken windows and correct CMP-13/14 status

Notes:

- **Placed before the gated send phase on purpose.** ARCHITECTURE.md's build order put reporting last, but that ordering assumed send was not gated. Reporting is presentation, not new plumbing — it ships and reads honest zeros until Phase 8 lands.
- Honest dependency: the `contacted` transition and the channel-specific reply signal are fired by Phase 8. This phase builds the state machine, the transitions that already have events (new, qualified from triage, booked from the existing Fillout webhook), and the counters. Phase 8 calls the hooks it defines. Reply rate and booked-call figures read empty until then.
- CMP-13's 12-month window is a **placeholder pending the LIA, not a legal fact**. It is config (CMP-14), so counsel's answer changes a value, not the code.
- CMP-15 is the trap: deleting a suppression record to satisfy a generic retention job recreates the exact problem retention exists to prevent. It gets an explicit code comment, not just a config default someone can quietly flip.

### Phase 8: Send — GATED

**Goal**: An approved message reaches a real business through a channel that permits it, with the proof of why it was allowed to
**Depends on**: Phase 2, Phase 6, **and the Parallel Track send-path decision**
**Requirements**: SND-01, SND-02, SND-03, SND-04, CMP-02, CMP-09, CMP-10, CMP-11, CMP-12
**Success Criteria** (what must be TRUE):

  1. Joshua approves a message and it dispatches through a channel whose own AUP permits outreach, verified in writing before any code was built against it (SND-01, SND-04)
  2. Every electronic message carries `List-Unsubscribe` and `List-Unsubscribe-Post` one-click headers (SND-02)
  3. An outreach failure leaves the existing public scanner's transactional email untouched and working (SND-03)
  4. A send is refused when the address is suppressed at that moment, and a first-touch send is refused when the Article 14 notice flag is not true (CMP-02, CMP-10)
  5. Joshua answers "why were we allowed to email this business?" in seconds from an immutable per-send record holding the resolved address and classification, the content actually sent, legal basis, LIA version, Tw exemption claimed, approver, and the suppression-check result (CMP-09, CMP-11, CMP-12)

**Plans**: TBD (est. 3-4)

> ⚠️ **BLOCKED on the send-path decision.** Do not plan or build this phase until the Parallel Track closes.

Notes:

- **Resend is ruled out.** Its AUP prohibits "unsolicited messages of any kind, including cold outreach, purchased lists, or scraped contact data" (verified verbatim, current 2026-05-28). No low-volume carve-out. The channel and provider are deliberately **UNDECIDED**.
- Resend stays exactly where it is: transactional email for the existing public scanner, untouched and uncontaminated. SND-03 is what enforces that separation.
- Changing provider fixes the AUP problem. It does **not** fix the legal-basis problem — Telecommunicatiewet is indifferent to whether Resend, Gmail, or a human hand sent the message. These are two separate problems and this conflation has already come up twice.
- CMP-02 checks suppression **immediately before dispatch**, not at draft time. A draft can sit in the queue for days while state changes underneath it.
- The suppression design and the `List-Unsubscribe` pattern carry over to whatever channel is chosen. Only the dispatcher changes.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

Phase 2 has no dependencies and may run in parallel with Phase 1 (`parallelization: true`).
Phase 8 does not begin until the Parallel Track closes, regardless of numeric order.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Prospect Data Foundation & Import | 4/4 | Complete    | 2026-07-18 |
| 2. Compliance Spine | 7/7 | Complete    | 2026-07-19 |
| 3. Triage & Shortlist | 6/6 | Complete    | 2026-07-20 |
| 4. Bulk Scan Queue | 6/6 | Complete    | 2026-07-23 |
| 5. Contact Extraction & Classification | 4/4 | Complete    | 2026-07-27 |
| 6. Draft Generation & Approval Queue | 8/8 | Complete    | 2026-07-30 |
| 7. Lifecycle, Reporting & Retention | 10/10 | In Progress|  |
| 8. Send — GATED | 0/TBD | Blocked (send-path decision) | - |

## Coverage

All 67 v1 requirements map to exactly one phase. No orphans, no duplicates.

| Category | Count | Phase(s) |
|----------|-------|----------|
| IMP-01..07 | 7 | Phase 1 |
| TRI-01..09 | 9 | Phase 3 |
| SCAN-01..07 | 7 | Phase 4 |
| CON-01..07 | 7 | Phase 5 |
| DRA-01..06 | 6 | Phase 6 |
| QUE-01..05 | 5 | Phase 6 |
| CMP-01..17 | 17 | Phase 2 (8), Phase 4 (1), Phase 7 (3), Phase 8 (5) |
| SND-01..04 | 4 | Phase 8 |
| TRK-01..05 | 5 | Phase 7 |
| **Total** | **67** | **8 phases** |

**Compliance distribution (CMP-01..17)** — deliberately spread, not deferred:

| Requirement | Phase | Why there |
|-------------|-------|-----------|
| CMP-01, 03, 04, 05, 06, 07, 08, 16 | Phase 2 | Suppression + unsubscribe infrastructure is a co-requisite of the data model, not step 9 |
| CMP-17 | Phase 4 | Scan-pipeline data minimisation — belongs with the scan pipeline |
| CMP-13, 14, 15 | Phase 7 | Retention is a later slice; the window is a placeholder pending the LIA |
| CMP-02, 09, 10, 11, 12 | Phase 8 | Send-time enforcement and the per-send audit record |

---
*Roadmap created: 2026-07-17*
*Granularity: standard (8 phases)*
*Structure: pipeline stages — each phase delivers one working stage of the funnel*
