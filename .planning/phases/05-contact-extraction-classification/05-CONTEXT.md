# Phase 5: Contact Extraction & Classification — Context

**Gathered:** 2026-07-24
**Status:** Ready for planning
**Source:** Live session decisions (2026-07-24) + ROADMAP Phase 5 notes — discuss-phase equivalent; the roadmap already locks the architecture and legal posture, Joshua locked the two open design calls below in chat.

<domain>
## Phase Boundary

Each scanned prospect comes out of its scan carrying a contact email whose legal status is known and recorded. Extraction rides the Playwright pass the scan already runs (`scanner-service/src/extractor.ts`) — no second fetch, no new crawl (ARCHITECTURE.md anti-pattern). Classification (generic vs named-person), commercial-contact-invited, and sole-proprietorship signals are stored per prospect. No outreach, no drafting — that is Phase 6.

</domain>

<decisions>
## Implementation Decisions

### Locked by ROADMAP (do not re-litigate)
- **D-5-R1: No second fetch.** The extractor runs inside the existing scan; re-fetching the site for contacts is an explicit anti-pattern.
- **D-5-R2: Legal posture is legitimate interest + Article 14 notice.** Preferring `info@` is a GDPR-minimisation choice, NOT a Telecommunicatiewet safe harbour. CON-06 defaults to "no" and the pipeline proceeds on LI+notice regardless.

### Locked by Joshua (2026-07-24)
- **D-5-01: CON-07 eenmanszaak detection uses on-page signals only.** Detect from what the scan already sees ("eenmanszaak" mentions, KVK/BTW-id patterns on the page). Imperfect by design: uncertain cases are stored as unknown and treated cautiously (as if personal data). No KVK API, no new external dependency — the no-new-infrastructure constraint wins.
- **D-5-02: CON-05 named-person-only review happens in the existing Shortlist.** A pill/filter on the current admin Shortlist tab, following the CRITICAL/UNREACHABLE pill pattern from Phase 4.1. No separate review queue or new admin surface.

### Claude's Discretion
- Extraction implementation details (mailto parsing, body-text regex, Cloudflare `data-cfemail` decoding) and where in the scan lifecycle contact data is persisted, provided no second fetch.
- Schema shape for the new contact fields (new columns on prospects vs a contacts table), shipped as an idempotent migration applied by Joshua via the dashboard SQL Editor (project convention — never `supabase db push`).
- Exact on-page signal set and confidence handling for D-5-01.
- Test approach per project conventions (vitest + local Supabase pinned to 127.0.0.1).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and prior decisions
- `.planning/ROADMAP.md` — Phase 5 section (goal, CON-01..07 success criteria, notes)
- `.planning/REQUIREMENTS.md` — CON-01 through CON-07 definitions
- `.planning/STATE.md` — Accumulated decisions, esp. the Tw art. 11.7 / legitimate-interest posture and Phase 2 suppression conventions

### Code this phase builds on
- `scanner-service/src/extractor.ts` — the existing per-page data extraction the contact extractor rides
- `scanner-service/src/scanner.ts` — scan lifecycle, where extracted data flows to the DB
- `lib/triage-candidates.ts` + `components/admin/shortlist-table.tsx` — ShortlistRow shape and the pill pattern (CRITICAL/UNREACHABLE) the CON-05 flag follows
- `lib/suppression.ts` + `lib/legal-basis.ts` — Phase 2 compliance spine the contact data must interoperate with
- `supabase/migrations/` — migration conventions (idempotent DDL, dashboard-applied)

</canonical_refs>

<specifics>
## Specific Ideas

- Live data to build against: 11 physiotherapy prospects released 2026-07-24 are queued for scanning — the first real batch this phase's extractor will have run against by execution time.
- NL-specific signals worth considering for D-5-01: "eenmanszaak" as a literal string, KVK-nummer patterns (8 digits), BTW-id patterns (NL...B..), and their typical placement (footer, contact/impressum, algemene voorwaarden pages the scan already visits).
- The scan currently visits multiple pages on full scans (discovery.ts) — contact extraction should aggregate across visited pages, still zero extra fetches.

</specifics>

<deferred>
## Deferred Ideas

- KVK API lookup for authoritative legal-form data — explicitly rejected 2026-07-24 (new external dependency).
- Separate review-queue admin surface — rejected in favor of Shortlist flag.
- Any outreach/drafting behavior — Phase 6.

</deferred>

---

*Phase: 05-contact-extraction-classification*
*Context gathered: 2026-07-24 from live session decisions + roadmap*
