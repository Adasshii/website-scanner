# Requirements: Renewed Scanner (v2.0)

**Defined:** 2026-11-11
**Core Value:** Joshua opens the tool and finds businesses genuinely worth pitching, with the
proof already written, so that outreach costs him minutes instead of hours.
**Source plan:** `docs/v2-renewed-scanner-plan.md` (revision 2, adversarially reviewed)

Phase numbering continues from v1.0, which ended at Phase 8. v2.0 starts at Phase 9.

## v2.0 Requirements

### Engine data

- [ ] **ENG-01**: The scan reads business facts from the prospect's own site as structured data: address, phone, opening hours, service area, certifications
- [ ] **ENG-02**: The scan detects on-site social proof: whether reviews are shown at all, how many, how recent, and whether they are machine-readable
- [ ] **ENG-03**: The scan builds a local competitor set from Overture: same trade, within a radius set by the niche profile
- [ ] **ENG-04**: Each competitor's site is scanned on the same storable signals, so the comparison is like for like
- [ ] **ENG-05**: The scan checks whether a customer can actually request a quote: a form, a tap-to-call phone number, project photos, certifications
- [ ] **ENG-06**: One predicate decides whether a business is scoreable at all (one place match above a confidence limit, a website on its own domain, an address or a declared work-area centre); a business that fails is skipped and never emailed
- [ ] **ENG-07**: Nothing Google returns is written to the database, enforced in code rather than intended in prose

### AI visibility

- [ ] **AIV-01**: The probe asks the 3 trade questions held in the niche profile
- [ ] **AIV-02**: Each question runs 5 times at temperature 0 against a pinned model version
- [ ] **AIV-03**: The prompt, the model id and every raw response are stored, so a disputed result can be audited
- [ ] **AIV-04**: The result is reported as a frequency band ("named in 1 of 5 runs"), never as a single score
- [ ] **AIV-05**: AI visibility carries zero weight in the total score until 50 scans show it is stable

### Niche profile

- [ ] **NIC-01**: An installers profile holds trades, job values, AI questions, competitor rules, trade-specific website checks and all copy
- [ ] **NIC-02**: Each default job value carries a citation to the source it came from
- [ ] **NIC-03**: Country and locale are parameters of the profile, never hardcoded
- [ ] **NIC-04**: Adding a niche is a new profile plus a landing page, with no change to the engine

### Scoring

- [ ] **SCR-01**: One score computed from the six checks replaces the existing score everywhere, including the public scanner at `/`
- [ ] **SCR-02**: The verdict-threshold source stays single, so the same number means the same thing in the prospect list, the report and the email (DRA-06 preserved)
- [ ] **SCR-03**: Draft metric selection is updated to the new score shape in the same change that introduces it
- [ ] **SCR-04**: Scans already stored under the old score shape still render correctly
- [ ] **SCR-05**: The public scanner is verified correct before the new score ships, because it earns money today
- [ ] **SCR-06**: The report states a money line that never invents a loss figure, and the owner can change the job value
- [ ] **SCR-07**: The report ends in a to-do list of 5 actions where every number is chosen by code, never by the model

### Report

- [ ] **REP-01**: A new report page replaces the existing one
- [ ] **REP-02**: A prospect report carries `noindex`, so it cannot be crawled
- [ ] **REP-03**: A report link is signed and expires, rather than being a bare UUID
- [ ] **REP-04**: A live Google band (stars, review count) is fetched when the page opens, carries the Google logo and third-party attribution, is stored nowhere, and the page reads correctly when the call fails
- [ ] **REP-05**: Competitors are described and never named in anything stored or sent
- [ ] **REP-06**: A PDF of the report carries the stored score only, never the live Google band
- [ ] **REP-07**: The report offers "plan a call", and the call list is built from clicks and replies rather than from email opens

### Outbound

- [ ] **OUT-01**: Prospects are picked before the expensive scan runs, on cheap signals only
- [ ] **OUT-02**: The "busy enough to pay" pick axis is reconciled with triage's existing worst-website selection, rather than contradicting it
- [ ] **OUT-03**: Suppression is checked before a report page about a business is published, not only before a send
- [ ] **OUT-04**: Joshua approves each message body before anything leaves
- [ ] **OUT-05**: On approval, our code checks suppression against live rows, builds a fresh opt-out link, writes the immutable `send_record`, and only then hands the finished message to the provider
- [ ] **OUT-06**: The provider never composes, schedules or sequences a message
- [ ] **OUT-07**: Each follow-up passes the same approval and the same checks as a first contact
- [ ] **OUT-08**: A reply that means "unsubscribe" reaches the `suppressions` table
- [ ] **OUT-09**: The chosen provider's acceptable-use terms are verified in writing, in a successor to the SND-04 artifact, before any send code is written
- [ ] **OUT-10**: No message reaches a real business until counsel sets `legal_regimes.legal_basis` and `article_14_notice_approved`

## Future Requirements

Acknowledged, not in this milestone.

### Funnel 2, the public live-scan page

- **PUB-01**: A niche landing page with a business-name search
- **PUB-02**: A live scan in six parts, each result streamed as it resolves
- **PUB-03**: Role and job-value questions asked during the wait
- **PUB-04**: A result page showing the total score with the detail behind an email gate
- **PUB-05**: A spend cap and a rate limit on anonymous scans

### Stored review data

- **REV-01**: Star ratings and review counts from a source that licenses storage
- **REV-02**: A competitor review comparison in an emailed report

## Out of Scope

| Feature | Reason |
|---------|--------|
| Storing anything Google returns | Maps Platform Terms §3.2.3 forbid storing, re-hosting and deriving from ratings, reviews, names and addresses. Only `place_id` may be kept. Live on-screen display only. |
| Scraping Trustpilot | Their consumer terms forbid text mining, data mining and web scraping outright, AI training included. The Data Solutions API is the only route, and it is waitlist-only. |
| Werkspot, until its terms are read | Where Dutch installer reviews actually live, but no public API, so using it probably means scraping. Nothing is built against it before its terms are read. |
| Star ratings in anything stored or sent | Follows from the three entries above. Returns only with a licensed, storable source. |
| Provider-side outreach sequences | A send fired days later bypasses the live suppression check and the freshly built opt-out link. At 10-50 a week, approving each follow-up is cheaper than building a sequencer. |
| Automated sending without human approval | Every message passes a human gate. A quality decision and a risk decision. |
| Funnel 2 in this milestone | The scanner cannot stream today, the countdown promise is unkeepable against a 60-90s Lighthouse step, and it is unbounded anonymous spend with no cap. Its own milestone, after funnel 1 reports a result. |
| Raising outreach volume above 10-50 per week | The whole legal risk assessment was argued at the low number, and bulk scanning gets two concurrent slots with a once-daily drain. Raising it redoes both. |
| Open tracking and per-section read tracking | Tracking an identified business on a page it did not request touches Telecommunicatiewet art. 11.7a. Goes to counsel with the Article 14 question, or does not happen. |

## Traceability

Filled during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (pending roadmap) | — | Pending |

**Coverage:**
- v2.0 requirements: 40 total
- Mapped to phases: 0
- Unmapped: 40 ⚠️

---
*Requirements defined: 2026-11-11*
