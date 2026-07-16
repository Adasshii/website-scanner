# Project Research Summary

**Project:** Prospect Radar (B2B prospecting layer on the existing Website Scanner)
**Domain:** Outbound B2B prospecting / cold-outreach tooling, single-tenant internal tool
**Researched:** 2026-07-17
**Confidence:** MEDIUM-HIGH (technical dimensions HIGH; legal dimension deliberately unsettled in parts)

> Legal findings in this document are research, not legal advice. They were produced by an
> AI agent reading public sources. Verify with a qualified Dutch lawyer or ACM directly
> before sending at any volume.

## READ THIS FIRST — Two Findings Contradict Locked PROJECT.md Decisions

### 1. Resend AUP hard blocker

Resend's Acceptable Use Policy (verified verbatim, current 2026-05-28) prohibits
"unsolicited messages of any kind, including cold outreach, purchased lists, or scraped
contact data," requires opt-in, and enforces automatic termination thresholds (0.08%
complaint, 4% bounce). PROJECT.md's locked requirement "Send approved outreach via Resend
with a List-Unsubscribe header" cannot be built as scoped — this is categorical policy
text, not a gray area. Compounding: the production scanner depends on the same Resend
account for transactional email, so a violation risks taking down the live product's email
too. Two paths, in order of fit: ask Resend in writing for a low-volume exception, or move
outreach to a separate provider/domain (which also solves the reputation-bleed risk below
for free). Not resolved here — Joshua decides.

### 2. Telecommunicatiewet art. 11.7 lid 2(a) doesn't cover the assumed data source

The Dutch B2B opt-out exemption applies only where an address was designated AND published
specifically for receiving such communications. A scraped generic `info@bedrijf.nl` does
not clear that bar (MEDIUM confidence, one consistent secondary legal source, no case law
found directly on point) unless the page explicitly invites marketing contact there. This
undercuts PROJECT.md's implicit assumption that preferring `info@` is a legal safe harbor —
it remains the right GDPR-minimization choice, but not a Telecommunicatiewet consent
exemption. Default engineering posture: build for a documented GDPR legitimate-interest
basis (Art 6(1)(f)) plus an Article 14 notice folded into the first email, treating any
exemption as a bonus case, not the default.

Both findings are gating decisions for Joshua, not resolved recommendations.

## Executive Summary

Prospect Radar is a bolt-on prospecting layer for an existing, working two-deployable
scanner (Next.js/Vercel + Express/Playwright/Railway + Supabase + Resend + Gemini), not a
new product. STACK, ARCHITECTURE, and FEATURES research all converge: at 10–50
prospects/week, the whole feature fits inside existing infrastructure with zero new
services — Overture Maps replaces Places, a plain Postgres `SELECT ... FOR UPDATE SKIP
LOCKED` queue driven by Vercel Cron replaces any job-queue library, and regex/native-fetch
triage replaces a DOM library. FEATURES.md confirms the scope is right-sized: commercial
prospecting tools (Apollo, Clay, Instantly, Smartlead, Hunter.io, Dealfront) solve
volume/scale problems this project doesn't have; the real differentiator is structural —
this tool proves badness with a scan report instead of inferring fit from firmographic
data.

The recommended approach: reuse everything reusable (scan engine, extractor, Resend's
*mechanics* if not its account), add only new tables and small route/module additions, and
treat the two-stage triage funnel as the single most load-bearing piece of the design —
it's what keeps the near-zero budget survivable and prevents the scanner-service's
already-fragile single-instance browser concurrency from being overrun.

The key risk is not technical. Two of PROJECT.md's locked assumptions — sending via the
existing Resend account, and treating scraped `info@` as adequate legal basis — do not
survive verification against primary sources. Both are gating decisions, not implementation
details to discover mid-build. Secondary but real: bulk-scanning strangers' sites from the
same Railway IP serving the live public scanner risks WAF fingerprinting that degrades the
production product, and Overture's own data has a documented history of confidently-wrong
aggregate signals (this project's own prior research already hit a 98%-false-positive read
once). Both are addressed with process, not new infrastructure.

## Key Findings

### Recommended Stack

No new deployables. `@duckdb/node-api` reads Overture's GeoParquet from S3 (sponsored, no
egress cost) and writes directly into Supabase Postgres via its `postgres` extension — a
one-off script, not a service. Bulk dispatch uses Postgres `SKIP LOCKED` + Vercel Cron;
`p-limit` caps concurrent scan dispatches. Triage is native `fetch()` + regex on raw HTML —
DOM libraries (jsdom/Cheerio) explicitly rejected as the exact cost triage exists to avoid.
Contact-email extraction and Cloudflare-obfuscation decoding are hand-rolled, not packages.

**Core technologies:** `@duckdb/node-api` (Overture ingestion, S3→Postgres in one script) ·
Postgres `FOR UPDATE SKIP LOCKED` + Vercel Cron (bounded queue, zero new infra) · `p-limit`
(concurrency ceiling in one line) · native `fetch` + regex (cheap triage).

### Expected Features

Calibrated against 10–50/week, one sender, one approver — not a SaaS buyer's expectations.
Structural inversion: commercial tools score by fit (inferred); this tool scores by provable
badness (a scan report is evidence, not inference).

**Must have:** Overture import with domain dedupe, cheap triage before full scan,
rank/shortlist by triage signal, concurrency-capped scan queue, contact extraction with
generic-address preference, evidence-grounded drafts citing actual scan findings, approval
queue with evidence shown alongside, suppression check + working unsubscribe
(compliance-critical), 5-stage lifecycle tracking, reply-rate/booked-call counters.

**Should have (differentiators):** scan report as personalization evidence cited inline (the
core differentiator — first-party, checkable proof, not inferred signal); inverted
qualification (worst-scoring = most qualified, deliberately a one-variable model); evidence
shown next to the draft during approval.

**Defer:** multi-provider enrichment, ICP/firmographic scoring, intent data, automated
sequences, deliverability infra, dialer, CRM sync, team/roles, bulk-approve, kanban, A/B
testing, no-website segment — all genuinely table-stakes for at least one category tool,
genuinely wrong at this scale.

### Architecture Approach

New tables plus small additive route/module changes inside the existing two-deployable
shape — nothing new deployed. `prospects`, `outreach_messages`, `suppressions` are new
tables, deliberately not merged into `leads` (which implies opt-in — PROJECT.md treats this
distinction as the legal crux of the milestone). Scanner-service gets a capacity check on
the existing `activeFullScans` map and an email-extractor addition to `extractor.ts` (no
second fetch).

**Major components:** Importer (one-off script, not a Vercel route) · Triage worker +
scan-queue dispatcher (two separate crons, different cost profiles) · Concurrency gate
(extends existing `activeFullScans`) · Draft generator + approval queue UI (Next.js only,
mirrors existing `app/admin/lead/[id]/` pattern).

### Critical Pitfalls

1. **Resend AUP hard blocker** — must resolve before the send phase is designed.
2. **Domain/IP reputation bleed** — cold outreach needs a domain separate from
   `adashi.io`'s transactional mail, warmed up before real sending.
3. **Shared Railway IP risk** — bulk-scanning strangers' sites risks WAF fingerprinting that
   could blacklist the IP serving the live scanner; mitigate with rate-limiting, honest
   user-agent, robots.txt respect, skip-not-retry.
4. **Overture data quality** — prior research already produced one 98%-false-positive read;
   triage must run against every import, dedupe by domain before triage.
5. **Too-permissive triage defeats the funnel's cost premise** — needs an explicit pass-rate
   target and a hard full-scan ceiling.

## Implications for Roadmap

### Phase 0 (gating, precedes all else): Provider & Legal-Basis Decision

**Rationale:** Both contradictions above are Joshua-only decisions that every downstream
phase depends on.
**Delivers:** Chosen send provider/domain; explicit legal posture (legitimate-interest +
Article 14 notice as default); versioned LIA document.
**Avoids:** Pitfalls 0 and 1; resolves LEGAL.md Open Question #1.
**Research flag:** Needs a lawyer, not further AI research — not a "standard patterns" phase.

### Phase 1: Data Foundations (migrations, importer, dedupe)

**Delivers:** `prospects`/`outreach_messages`/`suppressions` tables + `scans.prospect_id`;
`scripts/import-prospects.ts`; domain-based dedupe on top of GERS-ID dedupe.
**Avoids:** Pitfall 3.

### Phase 2 (parallel with Phase 1): Suppression + Unsubscribe

**Rationale:** ARCHITECTURE.md calls this a co-requisite of migrations, not step 9 —
compliance ships in v1.
**Delivers:** `lib/suppression.ts`, unsubscribe endpoint, automatic webhook-driven
suppression on hard bounce/complaint.
**Avoids:** Pitfall 6.

### Phase 3: Triage & Shortlist

**Delivers:** Cheap triage, ranked shortlist, explicit pass-rate target, hard full-scan
ceiling.
**Avoids:** Pitfall 4.

### Phase 4: Bulk Scan Queue + Concurrency Gate

**Delivers:** `prospect-scan-dispatch` cron, `activeFullScans` capacity check,
rate-limiting/skip-not-retry/robots.txt respect.
**Avoids:** Pitfall 2.

### Phase 5: Contact Extraction + Draft Generation

**Delivers:** Generic-preferred email extraction; distinct cold-outreach tone brief for
Gemini; Article-14 notice content in the first-email template.
**Avoids:** Pitfall 5.

### Phase 6: Approval Queue + Send

**Rationale:** Cannot start meaningfully before Phase 0 closes.
**Delivers:** Review/edit/reject UI with evidence shown; suppression check immediately
before dispatch; `List-Unsubscribe`/`List-Unsubscribe-Post` headers; full audit trail per
send.

### Phase 7: Lifecycle & Reporting Polish

**Delivers:** 5-stage lifecycle view, reply-rate/booked-call counters.

### Research Flags

Needs deeper research: **Phase 0** (qualified lawyer; written contact with Resend).
**Phase 6** (Article-14 wording, LIA reviewed by counsel). **Country expansion beyond NL**
(needs its own legal memo per country).
Standard patterns: **Phases 1–5, 7** — grounded in the existing codebase, independently
converged upon by STACK.md and ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH / MEDIUM (queueing untested under real load) | Official docs + cross-referenced sources |
| Features | HIGH on category facts / MEDIUM on calibration | — |
| Architecture | HIGH / MEDIUM on one external fact (GERS ID stability) | — |
| Pitfalls | HIGH (Resend AUP verified) / MEDIUM on deliverability specifics | — |
| Legal | MEDIUM-HIGH on NL statute / MEDIUM on GDPR legitimate-interest (contested) / LOW-MEDIUM on fine ceilings and non-NL countries | **This is research, not legal advice** |

**Overall confidence:** MEDIUM-HIGH on what to build; genuinely unresolved by design on two
gating legal/provider questions.

### Gaps to Address

- Resend's actual position on a low-volume exception — resolve via direct written contact in
  Phase 0.
- Whether AP's 2019 restrictive stance is still live post-VoetbalTV/EDPB-2024 — unconfirmed,
  flag for lawyer.
- Exact current Tw art. 15.4 fine ceiling — conflicting figures.
- Sole-proprietorship edge case (`info@` = a natural person's business) — flag for Phase 1/5
  design.
- UK/Germany/Belgium risk ranking — secondary-source-only. LEGAL.md ranks NL third of four
  for this use case (UK most favorable via PECR corporate-subscriber exemption; Germany most
  hostile) — PROJECT.md's NL-first-then-global plan means the home market is not the most
  favorable starting point. Worth surfacing to Joshua explicitly.
- Independent convergence: STACK.md and ARCHITECTURE.md arrived at the identical queue design
  without coordinating — a real confidence booster.

## Sources

**Primary:** `docs.overturemaps.org` · `resend.com/legal/acceptable-use` &
`terms-of-service` · `wetten.overheid.nl/BWBR0009950` · `ai.google.dev/gemini-api/docs/pricing`
· `vercel.com/docs/functions/limitations` · `.planning/codebase/ARCHITECTURE.md`/`STRUCTURE.md`/`CONCERNS.md`
· `.planning/PROJECT.md`

**Secondary:** ICTRecht · DDMA, Ploum, BG.legal · EDPB Guidelines 1/2024 · ACM enforcement
decisions · ICO B2B marketing guidance · npm listings, deliverability blogs

**Tertiary:** Germany UWG / Belgium GBA secondary summaries · Polish DPA case · exact Tw art.
15.4 ceiling

---
*Research completed: 2026-07-17* · *Ready for roadmap: yes, with Phase 0 as an explicit gate*
