# Requirements: Prospect Radar

**Defined:** 2026-07-17
**Core Value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the proof already written, so that outreach costs him minutes instead of hours.

> "User" throughout means Joshua. This is a single-tenant internal tool; there are no other
> users by design.

> Legal requirements below derive from `.planning/research/LEGAL.md`, which is research,
> not legal advice. Counsel runs in parallel with the build and must land before SEND opens.

## v1 Requirements

### Import

- [x] **IMP-01**: Joshua can import businesses from Overture Maps filtered by country, region, and category
- [x] **IMP-02**: Import runs as a repeatable script with parameters, not manual data entry
- [x] **IMP-03**: Re-running the importer does not create duplicate prospects (stable identity via Overture GERS ID)
- [x] **IMP-04**: Prospects are deduplicated by normalised registrable domain, so the same business at two Overture records becomes one prospect
- [x] **IMP-05**: Re-import never overwrites or resets triage results, lifecycle state, or approval history Joshua has already produced
- [x] **IMP-06**: Import records which country each prospect belongs to, so downstream legal rules can be applied per country
- [x] **IMP-07**: Prospects with no website are imported and marked as such, but excluded from the v1 outreach flow

### Triage

- [ ] **TRI-01**: Every imported prospect gets a cheap triage pass using plain HTTP fetch, with no Playwright, no Lighthouse, and no AI
- [ ] **TRI-02**: Triage records whether the site is reachable at all
- [ ] **TRI-03**: Triage records HTTPS availability and the full redirect chain
- [ ] **TRI-04**: Triage records presence of a mobile viewport meta tag
- [ ] **TRI-05**: Triage records HTML page weight and response time
- [ ] **TRI-06**: Triage produces a single score used to rank prospects
- [ ] **TRI-07**: Joshua can view a shortlist ranked by triage score, worst first
- [ ] **TRI-08**: A configurable cutoff controls which prospects are eligible for a full scan
- [ ] **TRI-09**: A hard ceiling caps how many full scans triage can release per run, so a permissive cutoff cannot blow the budget

### Scan

- [ ] **SCAN-01**: Shortlisted prospects are queued for a full scan without exhausting scanner-service browser concurrency
- [ ] **SCAN-02**: The scanner service rejects scan requests over its capacity rather than accepting them and timing out
- [ ] **SCAN-03**: Each prospect carries a visible scan status (queued, scanning, done, failed)
- [ ] **SCAN-04**: A failed prospect scan is skipped rather than retried indefinitely
- [ ] **SCAN-05**: Bulk scanning respects robots.txt and identifies itself with an honest user-agent
- [ ] **SCAN-06**: Bulk scanning is rate-limited so it cannot get the Railway IP blacklisted and degrade the live public scanner
- [ ] **SCAN-07**: A prospect scan produces the same report artefact the public scanner already produces, reachable at a hosted URL

### Contact

- [ ] **CON-01**: A contact email is extracted from the prospect's own website during the existing scan, without a second crawl
- [ ] **CON-02**: Extraction handles `mailto:` links and body-text addresses, including Cloudflare `data-cfemail` obfuscation
- [ ] **CON-03**: Every extracted address is classified as `generic` (info@, contact@, sales@, hello@) or `named-person`, and the classification is stored on the prospect
- [ ] **CON-04**: Generic addresses are preferred over named-person addresses when both exist
- [ ] **CON-05**: A prospect whose only address is `named-person` is flagged for manual review and never enters the default outreach flow automatically
- [ ] **CON-06**: The system records whether the source page invited commercial contact at that address, defaulting to "no" when absent
- [ ] **CON-07**: A prospect identified as a sole proprietorship (eenmanszaak) has its generic address treated as personal data

### Draft

- [ ] **DRA-01**: Each shortlisted prospect gets a drafted outreach message generated from its own full scan findings
- [ ] **DRA-02**: The draft cites a specific, checkable number from that prospect's scan, not a generic personalisation line
- [ ] **DRA-03**: The draft links to that prospect's hosted scan report as proof rather than restating it
- [ ] **DRA-04**: Draft tone is written to land as helpful rather than as an insult about someone's website
- [ ] **DRA-05**: The first-contact template programmatically includes the Article 14 notice; it is not left to per-send manual drafting
- [ ] **DRA-06**: The verdict shown in the prospect list, the hosted scan report, and the drafted email is the same verdict for the same scan (one verdict-threshold function, exported from `lib/scoring.ts`)

### Approval Queue

- [ ] **QUE-01**: Joshua can review every drafted message before anything is sent
- [ ] **QUE-02**: Joshua can edit a draft's text inline before approving it
- [ ] **QUE-03**: Joshua can reject a prospect outright from the queue
- [ ] **QUE-04**: The scan evidence behind a draft is shown next to the draft during review
- [ ] **QUE-05**: There is no bulk-approve action; approval is per-message by design

### Compliance

- [x] **CMP-01**: A suppression list in Supabase is the source of truth for who must not be contacted
- [ ] **CMP-02**: Suppression is checked immediately before dispatch, not at draft time, because state can change while a draft waits
- [x] **CMP-03**: Suppression matches on both email address and domain
- [x] **CMP-04**: An unsubscribe endpoint writes to the suppression list synchronously before returning success, and is idempotent
- [x] **CMP-05**: Unsubscribes take effect permanently and by the very next send cycle, with no delay language
- [x] **CMP-06**: No code path can re-add a suppressed record without an explicit, logged manual override
- [x] **CMP-07**: Hard bounces and spam complaints automatically suppress, wired to the existing Resend event webhook
- [x] **CMP-08**: A versioned Legitimate Interest Assessment lives in the repo, and every send references the LIA version that applied to it
- [ ] **CMP-09**: Every send record stores legal basis, LIA version, and whether a Tw exemption was claimed
- [ ] **CMP-10**: The send layer refuses a first-touch send unless the Article 14 notice flag is true
- [ ] **CMP-11**: Every send persists an immutable record: prospect, resolved address and classification, timestamp, the message content actually sent, legal basis, approver, and the suppression-check result
- [ ] **CMP-12**: Joshua can answer "why were we allowed to email this business?" per prospect in seconds, from the audit trail rather than from logs
- [ ] **CMP-13**: A scheduled retention job expires prospect, scan, and outreach data (placeholder: 12 months from last contact, pending the LIA — not a legal fact)
- [ ] **CMP-14**: Retention expiry can delete or anonymise by config, not hardcoded
- [ ] **CMP-15**: Suppression records are exempt from retention deletion and retained indefinitely, flagged explicitly in code so nobody silently changes it
- [x] **CMP-16**: Legal-basis rules live in a per-country config table (`country_code`, `spam_law_regime`, `notes_url`), never hardcoded NL logic
- [ ] **CMP-17**: The scan pipeline does not separately index, profile, or reuse incidental personal data (staff photos, named bios) captured in screenshots

### Send — GATED

> Blocked on the send-path decision. Resend is ruled out by its AUP. Channel and provider
> are deliberately undecided. Everything upstream builds and ships without this.

- [ ] **SND-01**: Approved messages dispatch via a channel whose own terms permit outreach
- [ ] **SND-02**: Every electronic message carries `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058 one-click)
- [ ] **SND-03**: The outreach channel is isolated from the existing scanner's transactional email, so an outreach problem cannot take down the live product's mail
- [ ] **SND-04**: The chosen channel's acceptable-use policy is verified in writing before it is built against

### Tracking

- [ ] **TRK-01**: Every prospect carries a lifecycle state (new, qualified, contacted, replied, booked)
- [ ] **TRK-02**: Lifecycle state advances as real events happen rather than by manual bookkeeping where avoidable
- [ ] **TRK-03**: Joshua can see reply rate across contacted prospects
- [ ] **TRK-04**: Joshua can see booked calls attributable to outreach, reusing the existing Fillout `booked_at` signal
- [ ] **TRK-05**: Joshua can see how many prospects were imported, triaged, scanned, and contacted per run

## v2 Requirements

Deferred. Tracked, not in the current roadmap.

### No-Website Segment

- **NOW-01**: Qualify prospects that have no website at all, using non-scan signals
- **NOW-02**: Reach no-website prospects through a channel that does not depend on an extracted email

### Refinement

- **REF-01**: A second triage signal, if false positives on the first prove common in real use
- **REF-02**: Per-draft feedback capture, if Joshua's edit patterns repeat three or more times

### Expansion

- **EXP-01**: Country-specific legal memo and config for each new market beyond NL
- **EXP-02**: Evaluate UK-first targeting, given PECR's corporate-subscriber exemption ranks it above NL

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenancy (users, teams, access control) | Single-tenant internal tool. Building for a buyer who may never exist is paying for an unvalidated hypothesis. |
| Billing and subscriptions | No customers to bill. |
| Sending via the existing Resend account | Resend's AUP prohibits "unsolicited messages of any kind, including cold outreach." Verified verbatim, 2026-05-28. Not a gray area. |
| Google Places as a data source | `websiteUri` sits in the ~$35/1K Enterprise tier and 30-day coordinate caching conflicts with a durable prospect list. Overture is free and global. |
| Automated sending without human approval | Every message passes a human gate. Quality control and risk control. |
| Bulk-approve in the queue | Directly undermines the human gate that the compliance posture depends on. |
| Multi-step automated outreach sequences | At 10–50/week, manual follow-up is cheaper than a sequencer. |
| Waterfall enrichment / multi-provider contact data | The scanned site is the sole contact source by design. Do not build both. |
| ICP and firmographic scoring | Qualification is inverted and single-variable: worst-scoring is most qualified. Deliberate. |
| Intent data | Category table stakes, meaningless at this scale. |
| Deliverability infrastructure and warm-up tooling | Only relevant at volumes this tool will never reach. |
| Dialer, CRM sync, kanban boards, A/B testing | All table stakes for some category tool, all wrong here. |
| Named-person addresses as the default target | Category best practice favours them for reply rate (10–25% vs 1–5%). Deliberately inverted for GDPR reasons. Sets a lower reply-rate expectation; not to be re-litigated. |
| Fixing the scanner's other check gaps (security headers, structured data, Open Graph) | Real and tracked in `docs/scanner-backlog.md`, but a separate concern from prospecting. |
| Resolving the per-page vs aggregate scoring split | Intentional design, not a bug. Only the verdict-threshold divergence gets fixed, because a draft is about to quote a verdict externally. |

## Traceability

Populated during roadmap creation. See `.planning/ROADMAP.md` for phase detail.

| Requirement | Phase | Status |
|-------------|-------|--------|
| IMP-01 | Phase 1 | Complete |
| IMP-02 | Phase 1 | Complete |
| IMP-03 | Phase 1 | Complete |
| IMP-04 | Phase 1 | Complete |
| IMP-05 | Phase 1 | Complete |
| IMP-06 | Phase 1 | Complete |
| IMP-07 | Phase 1 | Complete |
| TRI-01 | Phase 3 | Pending |
| TRI-02 | Phase 3 | Pending |
| TRI-03 | Phase 3 | Pending |
| TRI-04 | Phase 3 | Pending |
| TRI-05 | Phase 3 | Pending |
| TRI-06 | Phase 3 | Pending |
| TRI-07 | Phase 3 | Pending |
| TRI-08 | Phase 3 | Pending |
| TRI-09 | Phase 3 | Pending |
| SCAN-01 | Phase 4 | Pending |
| SCAN-02 | Phase 4 | Pending |
| SCAN-03 | Phase 4 | Pending |
| SCAN-04 | Phase 4 | Pending |
| SCAN-05 | Phase 4 | Pending |
| SCAN-06 | Phase 4 | Pending |
| SCAN-07 | Phase 4 | Pending |
| CON-01 | Phase 5 | Pending |
| CON-02 | Phase 5 | Pending |
| CON-03 | Phase 5 | Pending |
| CON-04 | Phase 5 | Pending |
| CON-05 | Phase 5 | Pending |
| CON-06 | Phase 5 | Pending |
| CON-07 | Phase 5 | Pending |
| DRA-01 | Phase 6 | Pending |
| DRA-02 | Phase 6 | Pending |
| DRA-03 | Phase 6 | Pending |
| DRA-04 | Phase 6 | Pending |
| DRA-05 | Phase 6 | Pending |
| DRA-06 | Phase 6 | Pending |
| QUE-01 | Phase 6 | Pending |
| QUE-02 | Phase 6 | Pending |
| QUE-03 | Phase 6 | Pending |
| QUE-04 | Phase 6 | Pending |
| QUE-05 | Phase 6 | Pending |
| CMP-01 | Phase 2 | Complete |
| CMP-02 | Phase 8 | Pending (gated) |
| CMP-03 | Phase 2 | Complete |
| CMP-04 | Phase 2 | Complete |
| CMP-05 | Phase 2 | Complete |
| CMP-06 | Phase 2 | Complete |
| CMP-07 | Phase 2 | Complete |
| CMP-08 | Phase 2 | Complete |
| CMP-09 | Phase 8 | Pending (gated) |
| CMP-10 | Phase 8 | Pending (gated) |
| CMP-11 | Phase 8 | Pending (gated) |
| CMP-12 | Phase 8 | Pending (gated) |
| CMP-13 | Phase 7 | Pending |
| CMP-14 | Phase 7 | Pending |
| CMP-15 | Phase 7 | Pending |
| CMP-16 | Phase 2 | Complete |
| CMP-17 | Phase 4 | Pending |
| SND-01 | Phase 8 | Pending (gated) |
| SND-02 | Phase 8 | Pending (gated) |
| SND-03 | Phase 8 | Pending (gated) |
| SND-04 | Phase 8 | Pending (gated) |
| TRK-01 | Phase 7 | Pending |
| TRK-02 | Phase 7 | Pending |
| TRK-03 | Phase 7 | Pending |
| TRK-04 | Phase 7 | Pending |
| TRK-05 | Phase 7 | Pending |

**Coverage:**

- v1 requirements: 67 total (IMP 7, TRI 9, SCAN 7, CON 7, DRA 6, QUE 5, CMP 17, SND 4, TRK 5)
- Mapped to phases: 67 ✓
- Unmapped: 0 ✓
- Duplicated across phases: 0 ✓

"Pending (gated)" marks the 9 requirements in Phase 8, blocked on the send-path decision
running as a parallel track. The other 57 are unblocked and build immediately.

### Note on DRA-06 (added 2026-07-17, after roadmap approval)

The **scoring verdict-threshold divergence** was surfaced by architecture research as phase
work with no requirement ID. It is now numbered as **DRA-06** and scheduled as Phase 6's
first plan.

`lib/scoring.ts` and `scanner-service/src/index.ts` each carry their own verdict-threshold
function with different cutoffs (95/85/70/50 vs 90/70/50). Today that is a cosmetic
admin-panel mismatch. The moment a draft quotes a verdict to a stranger, the same number
must mean the same thing in the prospect list, in the report the prospect clicks through
to, and in the email — otherwise the pitch contradicts itself in front of the person being
pitched. Fix: consolidate into one function exported from `lib/scoring.ts`.

Scope guard: this is **distinct** from the per-page (`scorePage()`) vs aggregate
(`aggregateScores()`) split, which is intentional layering and stays (see Out of Scope).
Triage's score is a third independent function and is untouched. Only the verdict threshold
is consolidated. This is not a scoring refactor.

---
*Requirements defined: 2026-07-17*
*Last updated: 2026-07-17 after roadmap approval — DRA-06 added and mapped, 67/67 mapped*
