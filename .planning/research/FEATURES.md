# Feature Research

**Domain:** B2B prospecting / sales-intelligence / cold-outreach tooling — scoped to the
NEW prospecting layer only (list building, qualification, drafting, approval, pipeline).
Existing scan/score/report/email infrastructure is out of scope for this research.
**Researched:** 2026-07-17
**Confidence:** HIGH on category facts (Apollo, Clay, Instantly, Smartlead, Lemlist,
Hunter.io, Dealfront/Leadfeeder feature sets — corroborated across multiple independent
sources). MEDIUM on the calibration judgments (how hard to cut each feature down) since
that's applied reasoning against a single-user, 10–50/week context rather than a
verifiable external fact.

## Calibration Note (read this before the tables)

Apollo, Clay, Instantly, Smartlead, Lemlist, Hunter.io, and Dealfront/Leadfeeder are all
built to solve **volume and scale problems**: hundreds of thousands of contacts, multiple
senders needing deliverability warm-up, teams needing role-based access, and revenue
leaders needing pipeline forecasting. None of those problems exist here. At 10–50
prospects/week, one sender, one approver, near-zero budget, most of what makes those
tools "complete" is precisely the part to leave out. The category research below exists
to identify the *shape* of a working prospecting flow, not to import its feature count.

One structural inversion matters more than any single feature: commercial tools score
prospects by **fit** (ICP match, firmographic signals, intent data) because their proof
of value has to be inferred. This tool scores prospects by **provable badness** — a
scan report is the evidence, not an inference. That inversion is the source of every
differentiator below.

## Feature Landscape

### Table Stakes (Tool Doesn't Work Without These)

Calibrated to "does this fail FOR JOSHUA at 10–50/week" — not to what a SaaS buyer of
Apollo would expect.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bulk import from a source list (Overture) with country/region/category filter | Already decided in PROJECT.md (Overture over Places). Without a repeatable import, every run is manual data entry. | MEDIUM | One-directional import job, not a live sync. No need for scheduling UI — a manual trigger with parameters is enough at this volume. |
| Stable identity across re-imports (dedupe) | Every category tool treats this as non-negotiable (LeadAngel, Clay, CRM dedup guides all confirm domain-based matching is the industry default: normalized registrable domain catches ~70% of matches on its own). Without it, re-running the importer re-creates prospects Joshua already triaged or rejected. | LOW–MEDIUM | Use registrable domain as the dedupe key, not fuzzy name matching. Deterministic matching (domain, then business name+postcode as fallback) is enough — fuzzy matching/identity-graph tooling (Clay's waterfall, identity stitching platforms) solves a scale problem this tool doesn't have. |
| Cheap triage pass before any full scan | Already Active in PROJECT.md. Every commercial funnel tool (Apollo's basic scoring, Dealfront's ICP pass) puts a cheap filter before the expensive step. Here the expensive step is a full Playwright+Lighthouse+Gemini scan; skipping triage burns the near-zero budget on prospects that were never going to qualify. | MEDIUM | Already scoped: reachability, HTTPS, mobile viewport, page weight, load time — no Lighthouse, no AI. This is the single most load-bearing feature in the list; it's what makes the budget constraint survivable. |
| Rank/shortlist by triage signal | Every prospecting tool sorts before it acts (Apollo's lead scoring, Dealfront's "next best action"). Without ranking, Joshua either scans everything (blows the budget/concurrency limit flagged in CONCERNS.md) or picks manually with no signal. | LOW | A sortable list by triage score is sufficient. No need for a scoring UI, weight tuning, or saved views — one fixed heuristic, reviewed and adjusted in code as needed. |
| Bulk scan queueing that respects scanner-service concurrency | CONCERNS.md flags this directly: no queue exists today, and 100 concurrent scan requests will time out the single Railway browser instance. This is a hard blocker for any bulk prospecting flow, not a nice-to-have. | MEDIUM–HIGH | A simple FIFO queue with a concurrency cap (2–3 in flight, per CONCERNS.md's own recommendation) is enough. No need for priority queues, retries-with-backoff sophistication, or a job dashboard — a status column per prospect (queued/scanning/done/failed) covers it. |
| Contact email extraction from the prospect's own site during scan | Already Active. This is the reason the bad-website segment was chosen over Places/Overture-only (per PROJECT.md's own reasoning) — Overture and Places don't reliably supply emails, so this is not optional, it's the segment's entire value proposition. | LOW–MEDIUM | Playwright is already loading the page; extracting `mailto:` links and footer/contact-page text is a parsing addition to code that already runs, not new infrastructure. |
| Preference for generic (`info@`) over personal (`jan@`) addresses | Already Active and grounded in PROJECT.md's legal reasoning (GDPR treats a named-person address as personal data; a role address is not). Note: this is a deliberate *inversion* of category best practice — Hunter.io and cold-email guides generally steer toward named-person addresses because they get materially higher reply rates. That tradeoff has already been made for legal reasons and should not be re-litigated here; it does mean reply-rate expectations should be set lower than category benchmarks. | LOW | Simple preference order in the extraction logic (role-address patterns first, named fallback only if no role address exists, per PROJECT.md's stated Active requirement). |
| Evidence-grounded draft per prospect (not a mail merge) | Category research is unambiguous: firmographic mail-merge personalization ("I noticed your company is doing great things in X") performs *worse* than no personalization, while real-account-signal personalization gets 10–25% reply rates vs. 1–5% for generic. Already Active in PROJECT.md. | MEDIUM | The "signal" here is the scan's own findings (score, top issues) — stronger than what most tools use, because it's not inferred from a news API, it's directly observed and citable in the email. |
| Approval queue: review, edit, or reject before send | Already Active, and already established in PROJECT.md as both a quality and a legal-risk control, not optional infrastructure. | MEDIUM | A flat list (not a kanban board) with inline text edit and one-click reject is sufficient at 10–50/week. No workflow engine needed. |
| Suppression check before every send + working unsubscribe endpoint | Already Active. Non-negotiable per PROJECT.md constraints (Resend does not manage suppression for transactional sends, so an owned table is the only source of truth). | MEDIUM | This is compliance-critical, not a feature to trim. |
| Minimal lifecycle tracking (new → qualified → contacted → replied → booked) | Already Active, and matches category-independent advice for solo/small operators: "three to five stages is plenty" is the repeated finding across CRM guidance for single-operator pipelines — this is *already* right-sized, not something to expand. | LOW | A status enum on the prospect record. No custom stage builder, no per-stage automation rules. |
| Reply rate + booked-call measurement | Already Active (`booked_at` already tracked via Fillout webhook per PROJECT.md). This is the minimum signal needed to know if the whole feature works at all. | LOW | Two numbers, not a reporting dashboard: sends this period, replies this period, booked this period. |

### Differentiators (Where This Tool Should Actually Compete)

Not required for the tool to function, but this is where effort concentrates because it's
what makes a 10–50/week manual-ish flow outperform what a bigger, more automated
commercial tool would produce for the same prospect.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Scan report as the personalization evidence, cited inline in the draft | This is the core differentiator and the thing category tools cannot do: their "signal-based prospecting" (referencing a funding round, a leadership change, a job posting) is inferred from third-party news/social data and is often wrong or generic. Here the signal is a first-party fact Joshua's own system generated about the prospect's own site — undeniable, specific, and impossible for the prospect to dismiss as automated guesswork. Category research explicitly says clumsy/generic personalization performs *worse* than none — so the quality bar for the draft is "cites a real, checkable number," not "sounds personal." | LOW (data already exists) | The draft prompt should pull the specific score and the single worst finding (not a summary of all findings — one sharp, concrete detail beats a full report) and link directly to that prospect's hosted report. This is a prompt-engineering task on top of infrastructure that already exists (Gemini AI analysis, hosted report), not new infrastructure. |
| Report-linked proof instead of claims | Commercial cold-email tools rely entirely on the words in the email being believed. This tool can say "see your homepage load time" and link to a page that proves it, rendered from the prospect's own site. That's a structurally stronger claim than anything a mail-merge tool can produce. | LOW (already exists) | No new build — this is about drafting copy that exploits the existing hosted report rather than duplicating its content inline. |
| Inverted qualification (worst-scoring = most qualified) | Commercial ICP scoring answers "does this account look like our best customers." This tool answers a sharper, self-proving question: "is there a problem here bad enough and provable enough to be worth pitching." That's a one-variable model instead of a multi-factor weighted ICP formula, and it's *more* defensible because the score itself becomes the opening line of the email. | LOW (already the triage design) | Worth stating explicitly in requirements so it doesn't get "improved" later into a generic multi-factor ICP score — that would be optimizing for a metric (fit) the tool doesn't need and losing the thing that makes the draft credible. |
| Approve screen shows evidence next to the draft | None of the reviewed tools' approval/review UIs (Instantly's HITL, Smartlead's AI Assistant) are built around showing supporting evidence alongside the draft — they show the draft and maybe the contact record. Surfacing the triage score, the scan verdict, and the top issue right next to the draft during review turns approval into a 10-second sanity check instead of a re-read of the whole email. | LOW | UI decision inside the approval queue, not a new data source — everything needed is already produced by the scan. |

### Anti-Features (Deliberately Do Not Build)

Aggressive on purpose, per the brief. Each of these is genuinely table stakes for at
least one of Apollo, Clay, Instantly, Smartlead, Lemlist, Hunter.io, or Dealfront — and
genuinely wrong here.

| Feature | Why a Category Tool Has It | Why It's Wrong Here | Alternative |
|---------|----------------------------|----------------------|-------------|
| Multi-provider waterfall enrichment (Clay's 100+ data sources) | Clay's whole value prop is stitching multiple paid data providers to cut bounce rates 5–8% at scale. | At 10–50/week, one prospect's own website (already being scanned) is the enrichment source. Paying for or integrating a second/third data provider adds cost and complexity to solve a bounce-rate problem this volume doesn't have. | Extract from the site Playwright is already loading. If email extraction fails, skip the prospect — don't build a fallback provider chain. |
| ICP / firmographic lead scoring (industry, headcount, funding stage, tech stack) | Apollo, Clay, and Dealfront all build weighted ICP models because their users are targeting a *type* of account across a huge database. | This tool already knows the one fact that matters (the site is bad) directly, not by proxy. Firmographic scoring answers a question ("is this a good-fit company") the triage score already answers better ("is there a provable problem"). | Keep the single triage heuristic. If false positives become a real problem, add one or two more triage signals — not a scoring model. |
| Intent / buying-signal data (Dealfront/Leadfeeder-style website visitor tracking) | Dealfront's entire product is turning anonymous inbound traffic into scored accounts. | This tool is outbound-only and has no inbound website traffic to instrument — there is no visitor data to capture. Structurally inapplicable, not just oversized. | None needed. |
| Multi-step automated sequences | Instantly, Smartlead, and Lemlist are all sequence engines at their core — that's the product. | Already Out of Scope in PROJECT.md, and correctly so: at 10–50/week, one drafted email plus Joshua's own manual follow-up judgment is cheaper than building and maintaining a sequencer, and a human is already in the loop for every send. | Manual follow-up, prompted by the pipeline status view if a prospect goes stale. |
| Deliverability infrastructure (inbox warm-up, sender rotation, domain health monitoring) | Instantly and Smartlead's core differentiation is deliverability at high volume — dozens of rotating inboxes, warm-up schedules, spam-score monitoring. | At 10–50 sends/week from one domain that already sends transactional email via Resend, there is no deliverability problem to solve. Building warm-up/rotation tooling here is solving a volume problem this tool will never have. | Rely on Resend's existing sending reputation and the `List-Unsubscribe` header already required by PROJECT.md. Watch bounce/complaint rate manually; revisit only if it becomes a real signal. |
| Dialer / call tracking / conversation intelligence | Apollo bundles a dialer and call recording because it's competing to be the whole SDR stack. | No phone outreach in scope. Pure scope addition with zero connection to the Core Value (a drafted email + a scan report). | None. |
| CRM sync (HubSpot/Salesforce push, bidirectional field mapping) | Every category tool treats CRM sync as required because their users already run a CRM elsewhere. | Joshua doesn't have a separate CRM to sync with — the pipeline tracking *is* the CRM here, and building a two-way sync to a system that doesn't exist is pure waste. | The Supabase pipeline table is the system of record. Revisit only if Adashi adopts a separate CRM later. |
| Team/role management, multi-user approval workflows | Table stakes for Apollo, Clay, Instantly — they're B2B SaaS sold to teams. | Already explicitly Out of Scope in PROJECT.md (single-tenant). Any access-control or role work here is building for a hypothetical buyer, which PROJECT.md already flags as the wrong bet until the tool proves itself. | Single shared admin auth (already flagged in CONCERNS.md as needing hardening — but hardening ≠ building multi-user roles). |
| Bulk "approve all" / auto-send after N hours | Commercial tools optimize approval friction downward because their users send at volume and treat human review as a bottleneck. | The per-message human gate is explicitly a compliance control in PROJECT.md ("legal posture is identical to manual sending... the human gate buys quality control"). A bulk-approve button defeats the purpose it exists for, at a volume (10–50/week) where reviewing each one individually costs minutes, not hours. | Keep review strictly per-message. If review time becomes the bottleneck, that's a signal the shortlist is too large, not that approval needs to be faster. |
| Kanban/drag-drop pipeline board, custom stage builder | Standard CRM UI pattern, expected by any team-sales tool. | A 5-stage lifecycle at 10–50/week doesn't need a drag-drop board — a sortable/filterable list is faster to build and faster to scan. Custom stage configuration is speculative flexibility for a user base of one. | Status-column list view, filterable by stage. |
| A/B subject line / copy testing, spintax | Instantly and Smartlead build this because statistical significance requires volume they have and this tool doesn't. | 10–50 sends/week will never reach statistical significance on a split test. Building A/B infra here produces noise, not insight. | Joshua's own read on which drafts work, informed by reply rate over time — a qualitative, not statistical, feedback loop. |
| No-website prospect segment | N/A — not a category-tool feature, but worth restating: it's a natural "while we're at it" scope-creep target for this exact milestone. | Already explicitly Out of Scope in PROJECT.md with clear reasoning (no site to scan, no email source). Restated here because prospecting-tool research constantly surfaces "add more lead sources" as a default instinct — resist it. | Data model must not block it later (per PROJECT.md), but nothing is built for it now. |

## Feature Dependencies

```
Import (Overture, filtered) ──requires──> Stable dedupe key (domain)
        │
        ▼
Cheap triage pass ──requires──> Import
        │
        ▼
Rank/shortlist by triage score ──requires──> Cheap triage pass
        │
        ▼
Bulk scan queue (concurrency-capped) ──requires──> Rank/shortlist
        │                                  (only shortlisted prospects enter the queue —
        │                                   this is what keeps the budget near zero)
        ▼
Full scan (existing engine, reused as-is)
        │
        ▼
Contact email extraction ──requires──> Full scan (Playwright already loading the page)
        │
        ▼
Drafted email, evidence-grounded ──requires──> Full scan results + Contact email
        │
        ▼
Approval queue (review/edit/reject) ──requires──> Drafted email
        │
        ▼
Suppression check ──gates──> Send
        │
        ▼
Send (Resend, List-Unsubscribe header) ──requires──> Approval + Suppression check pass
        │
        ▼
Pipeline lifecycle update (contacted) ──requires──> Send
        │
        ▼
Reply / booked tracking ──enhances──> Pipeline lifecycle
```

### Dependency Notes

- **Bulk scan queue requires rank/shortlist, not the raw import list:** this is the load-
  bearing sequencing decision in the whole feature. Skipping the shortlist step and
  queueing every imported prospect directly reintroduces the exact concurrency/budget
  failure CONCERNS.md warns about. Triage-then-shortlist must ship before or alongside
  the queue, never after.
- **Drafted email requires full scan output, not triage output:** the triage pass
  (reachability, HTTPS, weight, load time) is too thin to write a credible evidence-based
  line. The draft needs the full scan's findings (score, specific issues) to hit the
  "cites a real, checkable number" bar established in the differentiators section.
- **Suppression check gates send, and only send:** it should not gate drafting or
  approval-queue entry. A prospect can be triaged, scanned, and have a draft prepared
  for review even if later found to be suppressed — the check belongs at the last
  possible moment before an email actually leaves, per PROJECT.md's compliance framing.
- **Contact email extraction conflicts with (replaces the need for) any enrichment
  provider:** don't build both. The site being scanned is the sole contact-data source
  by design (per PROJECT.md's own reasoning for choosing the bad-website segment).

## MVP Definition

### Launch With (v1)

Everything in Table Stakes above, in dependency order. Restated as a checklist:

- [ ] Import from Overture with country/region/category filter — the funnel has no input without this
- [ ] Domain-based dedupe on import — prevents re-import from corrupting Joshua's triage/approval history
- [ ] Cheap triage scoring (no Lighthouse, no AI) — the budget-preserving gate
- [ ] Rank/shortlist view by triage score — turns triage output into an actionable queue
- [ ] Concurrency-capped scan queue — the CONCERNS.md blocker; nothing bulk works without it
- [ ] Contact extraction with generic-address preference — the segment's whole reason for existing
- [ ] Evidence-grounded draft generation citing the scan's specific findings — the Core Value
- [ ] Approval queue (review/edit/reject, evidence shown alongside) — the compliance and quality gate
- [ ] Suppression check + unsubscribe endpoint — non-negotiable per PROJECT.md
- [ ] 5-stage lifecycle tracking — minimum needed to know what happened after send
- [ ] Reply rate + booked-call counts — minimum needed to know if any of this worked

### Add After Validation (v1.x)

Only once the v1 loop has run for real prospects and produced real replies/bookings:

- [ ] A second triage signal if false positives on the first one turn out to be common (e.g. a
      site that's slow but the business doesn't care because it's not their acquisition
      channel) — trigger: shortlist quality complaints from Joshua after several weeks of use
- [ ] Lightweight per-draft feedback (why Joshua rejected/edited a draft) if edit patterns
      repeat — trigger: the same edit made three or more times across different prospects

### Future Consideration (v2+ or never)

Everything in the Anti-Features table. Restated as explicit deferrals, not silent gaps:

- [ ] No-website prospect segment — deferred per PROJECT.md, data model must not block it
- [ ] Multi-tenancy / team roles — only if productized, per PROJECT.md
- [ ] Deliverability infra (warm-up, rotation) — only if send volume grows an order of magnitude
- [ ] CRM sync — only if Adashi adopts an external CRM
- [ ] Automated sequences — only if manual follow-up genuinely becomes the bottleneck, which at
      10–50/week is not expected

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| Overture import + domain dedupe | HIGH | MEDIUM | P1 |
| Cheap triage pass | HIGH | MEDIUM | P1 |
| Rank/shortlist view | HIGH | LOW | P1 |
| Concurrency-capped scan queue | HIGH | MEDIUM–HIGH | P1 |
| Contact extraction (generic-preferred) | HIGH | LOW–MEDIUM | P1 |
| Evidence-grounded draft generation | HIGH | MEDIUM | P1 |
| Approval queue with inline edit + evidence panel | HIGH | MEDIUM | P1 |
| Suppression check + unsubscribe endpoint | HIGH (compliance) | MEDIUM | P1 |
| 5-stage lifecycle tracking | MEDIUM | LOW | P1 |
| Reply rate / booked-call counters | MEDIUM | LOW | P1 |
| Second triage signal | LOW (unproven need) | LOW | P2 |
| Per-draft edit feedback loop | LOW (unproven need) | LOW–MEDIUM | P2 |
| Any anti-feature above | LOW at this scale | MEDIUM–HIGH | P3 / reject |

**Priority key:**
- P1: Must have — the Core Value doesn't hold without it
- P2: Should have, add only if v1 usage surfaces the need
- P3: Nice to have elsewhere, wrong here — do not build without a scale change

## Competitor Feature Analysis

| Feature area | Apollo / Clay | Instantly / Smartlead / Lemlist | Dealfront / Leadfeeder | This Tool's Approach |
|---------------|----------------|-----------------------------------|--------------------------|------------------------|
| List building | Search a 200M+ contact database, or waterfall-enrich an uploaded list across 100+ providers | N/A (assumes list already exists) | Identify inbound website visitors | Import a filtered Overture slice; dedupe on domain; no enrichment provider |
| Qualification | Weighted ICP fit score (industry, headcount, tech stack) | N/A | Intent score from inbound behavior (pricing page visits, content consumption) | Inverted: rank by triage-detected website badness, not fit |
| Personalization | AI columns generating icebreakers from firmographic/news data | AI sequence generation from lead fields; real-time signal-based personalization performs best in category research | N/A | Draft cites the prospect's own scan score and top issue, with a link to the hosted proof — first-party evidence, not inferred signal |
| Review before send | N/A (assumes send is automated) | Instantly's Human-in-the-Loop mode: approve AI drafts before send | N/A | Same pattern (per-message approve/edit/reject), but positioned as a compliance gate, not a quality-tuning phase to eventually disable |
| Pipeline / lifecycle | Full deal pipeline with forecasting, stages, deal value | Reply detection, but not a pipeline product | Lead routing to CRM | 5 fixed stages, list view, two counters — no forecasting, no deal value |
| Deliverability | Not a focus (Apollo), somewhat (Clay via provider selection) | Core product: warm-up, rotation, spam monitoring | N/A | Not built — relies on existing Resend reputation at low volume |

## Sources

- [Clay vs Apollo 2026: Enrichment vs All-in-One Prospecting — Knowlee](https://www.knowlee.ai/compare/clay-vs-apollo)
- [Apollo.io vs Clay for AI-powered B2B Prospecting 2026 — theaigrowthstack.com](https://theaigrowthstack.com/apolloio-vs-clay-for-ai-powered-b2b-prospecting-2026/)
- [Apollo.io vs. Clay Comparison 2026 — G2](https://www.g2.com/compare/apollo-io-vs-clay-com-clay)
- [Clay vs Apollo — Enrich](https://www.enrich.so/blog/clay-vs-apollo)
- [How to Send Personalized Cold Emails at Scale Without Sacrificing Reply Rates — Instantly](https://instantly.ai/blog/how-to-personalize-cold-emails/?lng=en)
- [What Personalization Strategies Actually Improve Cold Email Reply Rates? — Apollo](https://www.apollo.io/insights/what-personalization-strategies-actually-improve-cold-email-reply-rates)
- [Instantly vs Smartlead vs Lemlist vs Reply.io for Agencies — Instantly](https://instantly.ai/blog/instantly-ai-reply-agent-vs-smartlead-lemlist-reply-io/)
- [Smartlead vs Instantly.ai: My Honest Experience and Comparison — Snov.io](https://snov.io/blog/smartlead-vs-instantly/)
- [CRM Deduplication 2026: A Merge & Match Methodology — Digital Applied](https://www.digitalapplied.com/blog/crm-data-deduplication-merge-framework-2026-methodology)
- [Lead-to-Account Matching: Dedup and Strategy Guide — RevOps Report](https://therevopsreport.com/insights/lead-to-account-matching/)
- [Hunter.io Email Finder Guide 2026 — gistjunction.com](https://gistjunction.com/hunter-io-email-finder-guide/)
- [Hunter.io Features (2026) — growthhacksuite.com](https://growthhacksuite.com/email-hunter-io-features-review)
- [How to Build a Sales Pipeline as a Solo Founder (2026 Guide) — solofoundr.co](https://solofoundr.co/solo-founder-sales-pipeline-without-team/)
- [How to Build Pipeline When You're the Only Salesperson — Revenue Velocity Lab](https://optif.ai/media/articles/build-pipeline-solo-salesperson/)
- [The Dealfront Guide To Lead Scoring - Interest vs. Intent — Dealfront](https://www.dealfront.com/blog/lead-scoring-interest-vs-intent/)
- [Signal Over Noise: Your Website Already Has the Answers — Leadfeeder/Dealfront](https://www.leadfeeder.com/blog/marketing-strategy/dealfront-is-leadfeeder/)
- Internal: `.planning/PROJECT.md` (Core Value, Requirements, Constraints, Key Decisions)
- Internal: `.planning/codebase/CONCERNS.md` (throughput, auth, scoring divergence gaps already identified)

---
*Feature research for: B2B prospecting layer (Prospect Radar), single-tenant internal tool*
*Researched: 2026-07-17*
