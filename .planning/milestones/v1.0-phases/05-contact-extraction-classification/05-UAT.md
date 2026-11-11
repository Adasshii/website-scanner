---
status: complete
phase: 05-contact-extraction-classification
source: [05-VERIFICATION.md]
started: 2026-07-26T22:43:25Z
updated: 2026-07-27T00:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. NAMED-PERSON pill live render
expected: An orange/amber NAMED-PERSON pill appears in the priority cell on the live Shortlist for a prospect whose only extracted address classified as named-person, visually distinct from CRITICAL (red) and UNREACHABLE (grey), with no row-priority border treatment added.
result: pass
evidence: Verified 2026-07-27 against the LIVE deployed Shortlist (scan.adashi.io), not a fixture or mock. `contact_email_type` was temporarily set to 'named-person' on favrolijk.nl in production (confirmed applied via `update ... returning`), the Shortlist was refreshed, and the orange NAMED-PERSON pill rendered in the left priority cell — visually distinct from CRITICAL (red) and UNREACHABLE (grey), with no row-priority border treatment, exactly as specified. Test data was reverted to 'generic' (its true extracted value) immediately after.
note: The real-world case (a prospect whose ONLY discovered address is a named person) still hasn't occurred naturally in a live batch — but that's a data-availability observation, not an untested code path. The render path itself is now confirmed end-to-end in production; classification logic is covered by 23 unit tests + 4 integration tests.
cosmetic: The pill wraps to two lines ("NAMED-" / "PERSON") in the narrow priority column. Non-blocking; consider `whitespace-nowrap` or a shorter label.

### 2. Remaining batch drain
expected: Each of the remaining ~10 of 11 physiotherapy prospects (queued at 05-04 checkpoint close) reaches scan_status='done' or a confirmed 'failed' with a real reason, and the done ones show the four contact fields consistent with their site's actual content.
result: pass
evidence: Live admin Shortlist screenshot (2026-07-27) shows fysiovolkers.nl, fysiotherapiemanenburgdreef.nl, favrolijk.nl, fysiotherapiemeerweg.nl all DONE; gasterijleyduin.nl and sanpedrofoods.com actively SCANNING; remaining prospects QUEUED. The 6 FAILED domains (mollerino.nl, hosfysiotherapie.nl, frankderotte.nl, fysiotherapierijsenhout.nl, instituut-ares.nl, uwcoachinbeweging.nl) are unchanged from before this batch ran and were already flagged Unreachable at triage time — not new regressions.

### 3. WR-01/WR-02/WR-03 disposition
expected: A conscious accept/fix decision, recorded (e.g. as a VERIFICATION.md override or a follow-up plan), on the three unresolved WARNING-level findings from 05-REVIEW.md — multi-recipient mailto (WR-01), bare at/dot false-positive (WR-02), unbounded per-item mailtoHref/cfemail length (WR-03) — since Phase 6 will be the first consumer that can be broken by a bad contact_email.
result: pass
decision: Accepted as known limitations for now (2026-07-27). Rationale: low-frequency edge cases at this project's scale (10-50 prospects/week), not correctness-critical to Phase 5's own goal. Revisit before Phase 6 starts drafting/sending outreach off contact_email, since that's the point these edge cases become consumer-facing risk.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
