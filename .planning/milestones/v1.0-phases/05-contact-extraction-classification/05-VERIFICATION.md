---
phase: 05-contact-extraction-classification
verified: 2026-07-26T22:43:25Z
status: passed
score: 5/5 roadmap success criteria verified (1 with documented scope caveat)
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Confirm the NAMED-PERSON pill renders correctly against a real named-person-only prospect in production (not just unit/integration fixtures)."
    expected: "An orange/amber NAMED-PERSON pill appears in the priority cell on the live Shortlist for a prospect whose only extracted address classified as named-person, visually distinct from CRITICAL (red) and UNREACHABLE (grey), with no row-priority border treatment added."
    why_human: "No named-person example has appeared in the live batch yet (05-04-SUMMARY.md Known Gaps — both confirmed-done prospects resolved to generic). Visual placement/color distinction was already flagged by the executor as a human-judgment item (D2) with no live render to check against."

  - test: "Confirm the remaining ~10 of the 11 physiotherapy prospects (queued at 05-04 checkpoint close) drained correctly, i.e. populated contact_email/contact_email_type/commercial_contact_invited/sole_proprietorship or an accepted null-contact miss, once the daily cron ticks them through."
    expected: "Each of the remaining prospects reaches scan_status='done' or a confirmed 'failed' with a real reason, and the done ones show the four contact fields consistent with their site's actual content."
    why_human: "Vercel Hobby-tier cron fires once daily; only 2/11 had drained by 05-04 checkpoint close. This was an already-documented limitation, not a new one, but it remains an open confirmation, not a closed one."

  - test: "Decide whether the three unresolved WARNING-level findings from 05-REVIEW.md (WR-01 multi-recipient mailto, WR-02 bare at/dot false-positive, WR-03 unbounded per-item mailtoHref/cfemail length) need a fix before Phase 6 starts using contact_email to draft and send messages."
    expected: "A conscious accept/fix decision, recorded (e.g. as a VERIFICATION.md override or a follow-up plan), since Phase 6 will be the first consumer that can be broken by a non-deliverable comma-joined address (WR-01) or a manufactured false email from ordinary prose (WR-02)."
    why_human: "These are correctness bugs, not missing/stub artifacts — confirmed still present by direct code inspection (lib/contact-extraction.ts:106-107, 118-120; scanner-service/src/extractor.ts:255-260), unlike CR-01 and WR-04 which were fixed in commits caaed28/4abfe68 after the plan SUMMARYs were written. The code review rated them Warning, not Critical, so they do not block this phase's goal, but they are live risk for the very next phase."
---

# Phase 5: Contact Extraction & Classification Verification Report

**Phase Goal:** Each scanned prospect carries a contact address whose legal status is known and recorded
**Verified:** 2026-07-26T22:43:25Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria, Phase 5)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A prospect's contact email appears after its scan, with no second fetch of the site (CON-01) | ✓ VERIFIED | `scanner-service/src/extractor.ts:255-262` harvests `mailtoHrefs`/`cfemailTokens`/`contactText` inside the *existing* `page.evaluate` callback (no new navigation). `lib/scan-queue.ts:177-180` adds `pages` to the already-executed `scans` select in `reconcileInFlightScans` and calls `aggregateContacts(scan.pages, row.domain)` on the done transition — no new fetch or callback introduced anywhere in the diff. Integration test `lib/scan-drain.integration.test.ts:291` (`CON-01/CON-04`) passes against local Postgres. |
| 2 | Addresses behind `mailto:` links, in body text, and behind Cloudflare `data-cfemail` obfuscation are all found (CON-02) | ✓ VERIFIED (with residual correctness caveat — see human verification #3) | `lib/contact-extraction.ts` exports `parseMailtoHref`, `decodeCfEmail`, `extractEmailsFromText`, all exercised by 23 passing unit tests (`npx vitest run lib/contact-extraction.test.ts`). Two edge-case bugs (WR-01, WR-02 from 05-REVIEW.md) remain unfixed and are confirmed still present in the current file — see anti-patterns below. |
| 3 | Every address is stored as `generic` or `named-person`, and where both exist the generic one is chosen (CON-03, CON-04) | ✓ VERIFIED | Migration `018_add_contact_classification.sql` adds `prospects_contact_email_type_check` (NULL or generic/named-person). `classifyLocalPart()` + `scoreCandidate()` (generic +50) implement the preference; integration test asserts both `contactEmail` and `contactEmailType` resolve to the generic same-domain address when both exist. |
| 4 | A prospect whose only address is a named person is flagged for manual review and stays out of the default outreach flow (CON-05) | ✓ VERIFIED — visibility half; enforcement half not yet applicable | `contact_email_type` is stored (CHECK-constrained) and surfaced as a `NAMED-PERSON` pill on the live Shortlist (`components/admin/shortlist-table.tsx:186-190`, `lib/triage-candidates.ts:30,66`). "Stays out of the default outreach flow" cannot be independently tested yet because no outreach/draft flow exists in the codebase — Phase 6 has not been built. The codebase carries an explicit boundary comment (`lib/contact-extraction.ts:8-10`, `lib/scan-queue.ts:155-156`) assigning this enforcement to Phase 6's draft-eligibility filter, and this was scoped that way in the plan *before* execution, not discovered as a shortfall after the fact. Flagged here for re-verification once Phase 6 ships. |
| 5 | Each prospect records whether its source page invited commercial contact (defaulting to no) and whether it is a sole proprietorship whose generic address is therefore personal data (CON-06, CON-07) | ✓ VERIFIED | Migration: `commercial_contact_invited boolean not null default false`; `sole_proprietorship text not null default 'unknown' check (...)`. `detectCommercialInvite()`/`detectSoleProprietorship()` implement the literal-only precedence (eenmanszaak > company-form > unknown). **Critically**, `lib/scan-queue.ts:212-224` now derives and (re)writes both fields on *every* completed scan (fixed by commit `4abfe68`, WR-04), not just when `contact_email` was null — closing the real gap where Phase-1-imported prospects with a pre-existing `contact_email` would never get CON-06/07 computed. Integration test asserts `commercial_contact_invited=true`/`sole_proprietorship='yes'` for an eenmanszaak fixture. |

**Score:** 5/5 roadmap success criteria verified (truth #4 verified for its currently-testable half; truth #2 verified with a documented residual defect, not a missing capability)

### Plan-Level Must-Haves (all four plans)

| Plan | Must-have | Status | Evidence |
|------|-----------|--------|----------|
| 05-01 | `contact_email_type` CHECK, `commercial_contact_invited` default false, `sole_proprietorship` default unknown, `ContactExtraction`/`PageData.contactExtraction`/`ProspectRow` fields | ✓ VERIFIED | Migration file inspected directly; `types/scanner.ts:131,135,423-428` confirmed. `npx tsc --noEmit` green. |
| 05-02 | mailto/body/cfemail all recoverable; generic wins; commercial-invite/sole-proprietorship detection; extractor harvests inside existing `page.evaluate` | ✓ VERIFIED | 23/23 unit tests pass; extractor diff is additive-only inside the existing callback (confirmed by direct read, no new `page.evaluate` or navigation added). |
| 05-03 | contact fields derived from `scans.pages` on the done transition with no second fetch; winning contact persisted; named-person stored; fill-only-when-null | ✓ VERIFIED — and strengthened post-summary | `lib/scan-queue.ts` current state (read directly, not via SUMMARY) shows the fill-only-when-null guarantee is now enforced via `.is("contact_email", null)` on the UPDATE itself (commit `caaed28`, CR-01 fix), which is *more* structural than what 05-03-SUMMARY.md described (an in-memory check) — this is an improvement over the plan's original ask, not a regression. 4 integration cases in `lib/scan-drain.integration.test.ts` pass against local Postgres, including the no-overwrite case. |
| 05-04 | NAMED-PERSON pill reads stored classification; no new admin surface; full pipeline proven end-to-end against real prospects | ✓ VERIFIED (production evidence partial — see human verification) | Pill code confirmed (`shortlist-table.tsx:167,186-190`), no new route/filter/column added (`git diff --stat` for the commit shows only the 2 files the plan named). Production: migration 018 live (confirmed via `information_schema.columns` query per SUMMARY), scanner-service on Railway and app on Vercel both deployed from `aeb38c4`, and 2/11 real prospects (favrolijk.nl, fysiovolkers.nl) confirmed `done` with correct generic `contact_email`. Remaining ~10 prospects were still queued and the named-person path has no live example — both are pre-existing, already-documented limitations from the 05-04 checkpoint, not new gaps found in this verification. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/018_add_contact_classification.sql` | Idempotent migration: 2 new columns + 1 guarded CHECK | ✓ VERIFIED | Confirmed idempotent (`add column if not exists`, `do $$ ... pg_constraint` guard). Applied locally (`npx vitest run` integration suite passes against local Postgres) and live (per 05-04-SUMMARY D3, confirmed via `information_schema.columns`). |
| `types/scanner.ts` — `ContactExtraction`, `PageData.contactExtraction`, `ProspectRow` fields | New exported type + 2 new PageData/ProspectRow fields | ✓ VERIFIED | Present at lines 131, 135, 423-428. `npx tsc --noEmit` green (root and `scanner-service/`). |
| `lib/contact-extraction.ts` | Pure module: decode/parse/classify/detect/aggregate | ✓ VERIFIED | All 7 named functions present and exported; no Supabase/I-O import. |
| `lib/contact-extraction.test.ts` | Unit tests covering every behavior bullet | ✓ VERIFIED | 23/23 passing. |
| `scanner-service/src/extractor.ts` | Harvests `contactExtraction` inside existing evaluate | ✓ VERIFIED | Additive-only; `visibleText` (innerText) reused, not `outerHTML`; counts capped at 50; `contactText` capped at 50,000 chars. Per-item length of `mailtoHrefs`/`cfemailTokens` is **not** capped (WR-03, unresolved — see anti-patterns). |
| `lib/scan-queue.ts` `reconcileInFlightScans` | Extended to derive+persist contact fields | ✓ VERIFIED | Confirmed via direct read of current file (not SUMMARY): `.is("contact_email", null)` atomic guard (CR-01 fix) + unconditional `commercial_contact_invited`/`sole_proprietorship` write (WR-04 fix). |
| `lib/scan-drain.integration.test.ts` | Contact-extraction integration cases | ✓ VERIFIED | 4 cases present (`describe("reconcileInFlightScans — contact extraction ...")`), all pass against local Supabase (10/10 tests in the file, full run). |
| `lib/triage-candidates.ts` | `ShortlistRow.contact_email_type` + select | ✓ VERIFIED | Line 30 (interface), line 66 (select list). |
| `components/admin/shortlist-table.tsx` | NAMED-PERSON pill | ✓ VERIFIED | Lines 167, 186-190; orange/amber token, distinct from CRITICAL (red)/UNREACHABLE (grey); correctly excluded from the row-priority border treatment (only `isCritical` triggers `border-l-4`). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scanner-service/src/extractor.ts` (harvest) | `lib/contact-extraction.ts` `aggregateContacts()` | `PageData.contactExtraction` shape, persisted in `scans.pages` JSONB | ✓ WIRED | Both sides agree on `{ mailtoHrefs, cfemailTokens, contactText }`; `aggregateContacts` reads `page.data?.contactExtraction` defensively (legacy-safe). |
| `lib/scan-queue.ts` `reconcileInFlightScans` | `lib/contact-extraction.ts` `aggregateContacts()` | direct import, called on the done transition | ✓ WIRED | `import { aggregateContacts } from "@/lib/contact-extraction"` at top of file; called at line 210. |
| `lib/triage-candidates.ts` `ShortlistRow.contact_email_type` | `components/admin/shortlist-table.tsx` | props pass-through, `row.contact_email_type === "named-person"` | ✓ WIRED | No route change needed, confirmed by direct read of both files. |
| `lib/scan-queue.ts` contact-field UPDATE | `prospects.contact_email` fill-only-when-null guarantee | `.eq("id", id).is("contact_email", null)` | ✓ WIRED (structural, stronger than plan asked) | Confirmed in current file, not the (now-stale) SUMMARY description — this is the CR-01 post-review fix. |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Contact-extraction pure-module unit tests | `npx vitest run lib/contact-extraction.test.ts` | 23/23 passed | ✓ PASS |
| scan-queue unit tests (contact-field wiring, CR-01/WR-04 fixes) | `npx vitest run lib/scan-queue.test.ts` | 34/34 passed (combined with contact-extraction file) | ✓ PASS |
| Integration cases against local Supabase | `npx vitest run lib/scan-drain.integration.test.ts` | 10/10 passed (4 contact-extraction cases + 6 pre-existing) — ran for real, did not skip (local Supabase reachable) | ✓ PASS |
| Full workspace test suite (run once) | `npx vitest run` | 242/242 passed across 25 files | ✓ PASS |
| Root TypeScript compile | `npx tsc --noEmit` | Clean, exit 0 | ✓ PASS |
| scanner-service TypeScript compile | `cd scanner-service && npx tsc --noEmit` | Clean, exit 0 | ✓ PASS |
| Debt-marker scan (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) on all phase-modified files | `grep -n -E "TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER"` across all 7 modified files | No matches | ✓ PASS (no blocker anti-pattern) |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|-------------|--------|----------|
| CON-01 | 05-02, 05-03 | Contact email extracted during existing scan, no second crawl | ✓ SATISFIED | Extractor harvest rides existing `page.evaluate`; `reconcileInFlightScans` reads already-selected `scan.pages`. |
| CON-02 | 05-02 | mailto/body-text/cfemail all handled | ✓ SATISFIED (residual bugs, not missing capability — see WR-01/WR-02 below) | 23 unit tests; two edge-case defects unresolved. |
| CON-03 | 05-01, 05-02 | generic/named-person classification stored | ✓ SATISFIED | CHECK constraint + `classifyLocalPart` + integration test. |
| CON-04 | 05-02, 05-03 | Generic preferred over named-person | ✓ SATISFIED | `scoreCandidate` +50 for generic; integration test asserts. |
| CON-05 | 05-03, 05-04 | Named-person flagged, excluded from default outreach | ✓ SATISFIED — visibility/storage half; enforcement half genuinely deferred to Phase 6 (no outreach flow exists yet, by design) | Pill + stored classification confirmed; enforcement not testable pre-Phase-6. |
| CON-06 | 05-01, 05-02, 05-03 | Commercial-contact-invited recorded, defaults no | ✓ SATISFIED | Default `false`, `detectCommercialInvite`, now derived on every completed scan (WR-04 fix). |
| CON-07 | 05-01, 05-02, 05-03 | Sole-proprietorship signal recorded | ✓ SATISFIED | Default `unknown`, three-state CHECK, `detectSoleProprietorship` literal-only precedence, derived on every completed scan (WR-04 fix). |

No orphaned requirements: all 7 CON-* IDs mapped to Phase 5 in REQUIREMENTS.md appear in at least one plan's `requirements:` frontmatter field (05-01: CON-03/06/07; 05-02: CON-01/02/03/04/06/07; 05-03: CON-01/04/05; 05-04: CON-05 — union covers CON-01 through CON-07).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/contact-extraction.ts` | 106-107 | `parseMailtoHref` validation regex (`/.+@.+\..+/`) has no anchors and doesn't reject `,`/`;` separators — a multi-recipient `mailto:a@x.nl,b@x.nl` decodes to a single non-deliverable "email" string that can win as `contactEmail` | ⚠️ Warning | Confirmed **still present** (05-REVIEW.md WR-01, unfixed). Not blocking Phase 5's own goal, but a live risk the moment Phase 6 drafts/sends against `contact_email`. |
| `lib/contact-extraction.ts` | 118-120 | `extractEmailsFromText` rewrites bare `\s+at\s+`/`\s+dot\s+` (not just bracketed `[at]`/`(at)`) across the whole page text before re-matching, which can manufacture a false email from ordinary prose (e.g. "back at 5.pm" → "back@5.pm") | ⚠️ Warning | Confirmed **still present** (05-REVIEW.md WR-02, unfixed). Same downstream risk as above — a site with no real email could get an invented `contactEmail`. |
| `scanner-service/src/extractor.ts` | 255-260 | `mailtoHrefs`/`cfemailTokens` are count-capped (50) but not length-capped per item, despite the adjacent comment claiming DoS bounds hold | ⚠️ Warning | Confirmed **still present** (05-REVIEW.md WR-03, unfixed). Lower risk than WR-01/02 (bounded by the 50-item cap and `MAX_EMAIL_LEN=254` downstream discard), but the comment overstates what's actually bounded. |
| `types/scanner.ts` | 424, 428 | `contact_email_type`/`sole_proprietorship` typed as bare `string` instead of the literal unions from `lib/contact-extraction.ts` | ℹ️ Info | Unfixed (05-REVIEW.md IN-01), low priority, cross-boundary typing constraint acknowledged in the review itself. |
| `scanner-service/src/extractor.ts` + `lib/contact-extraction.ts` | 242 / 68 | Email-shape regex duplicated across the Node/browser boundary | ℹ️ Info | Unfixed (05-REVIEW.md IN-02), explicitly marked "not urgent" by the reviewer. |

No `TBD`/`FIXME`/`XXX` blocker-tier markers found in any phase-modified file — the debt-marker gate does not fire.

### Human Verification Required

See YAML frontmatter `human_verification` for the structured list. Summary:

1. **NAMED-PERSON pill live render** — no named-person prospect has appeared in production yet to confirm the pill's visual behavior end-to-end (already flagged as a known gap in 05-04-SUMMARY.md; still open).
2. **Remaining batch drain** — ~10 of the 11 verification prospects were still queued at 05-04 checkpoint close; their eventual `contact_email`/classification outcome is unconfirmed (already flagged; still open).
3. **WR-01/WR-02/WR-03 disposition** — three code-review WARNING findings remain unfixed as of this verification (confirmed by direct inspection of current file contents, not SUMMARY claims). They don't invalidate Phase 5's delivered capability, but Phase 6 will be the first place a bad `contact_email` value (multi-recipient string, or a manufactured false address) can cause real harm (a bounced/failed send). Recommend an explicit accept-or-fix decision before Phase 6 starts drafting against `contact_email`.

### Gaps Summary

No BLOCKER-level gaps. All 5 roadmap Success Criteria for Phase 5 are verified against the current codebase (not SUMMARY claims) — the migration, pure module, extractor harvest, reconcile wiring, and Shortlist pill are all present, wired, unit/integration-tested (242/242 suite green, including live-against-local-Postgres integration cases), and confirmed in production for 2 real prospects. The two post-summary code-review fixes (CR-01, WR-04) were independently re-confirmed by reading `lib/scan-queue.ts` directly, and both hold as described in the task's `important_context` — the fill-only-when-null guarantee is now a DB-level predicate, and CON-06/CON-07 signals are now derived on every completed scan regardless of pre-existing `contact_email`.

The status is `human_needed` rather than `passed` because of three items, none of which are structural failures: (1) the NAMED-PERSON pill has no live production example yet, (2) most of the verification batch was still queued at checkpoint close, and (3) three WARNING-level correctness bugs from the code review remain unfixed and deserve an explicit decision before Phase 6 depends on `contact_email` correctness. All three are either already-documented, expected limitations (1, 2) or genuine but non-blocking residual risk (3) — none of them contradict the phase's core goal, which is demonstrably achieved: every scanned prospect that has a discoverable address now gets it classified and recorded, with the legal signals (commercial-invite, sole-proprietorship) captured alongside.

---

_Verified: 2026-07-26T22:43:25Z_
_Verifier: Claude (gsd-verifier)_
