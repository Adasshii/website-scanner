---
status: testing
phase: 05-contact-extraction-classification
source: [05-VERIFICATION.md]
started: 2026-07-26T22:43:25Z
updated: 2026-07-26T22:43:25Z
---

## Current Test

number: 1
name: Confirm the NAMED-PERSON pill renders correctly against a real named-person-only prospect in production (not just unit/integration fixtures)
expected: |
  An orange/amber NAMED-PERSON pill appears in the priority cell on the live Shortlist for a prospect whose only extracted address classified as named-person, visually distinct from CRITICAL (red) and UNREACHABLE (grey), with no row-priority border treatment added.
awaiting: user response

## Tests

### 1. NAMED-PERSON pill live render
expected: An orange/amber NAMED-PERSON pill appears in the priority cell on the live Shortlist for a prospect whose only extracted address classified as named-person, visually distinct from CRITICAL (red) and UNREACHABLE (grey), with no row-priority border treatment added.
result: [pending]

### 2. Remaining batch drain
expected: Each of the remaining ~10 of 11 physiotherapy prospects (queued at 05-04 checkpoint close) reaches scan_status='done' or a confirmed 'failed' with a real reason, and the done ones show the four contact fields consistent with their site's actual content.
result: [pending]

### 3. WR-01/WR-02/WR-03 disposition
expected: A conscious accept/fix decision, recorded (e.g. as a VERIFICATION.md override or a follow-up plan), on the three unresolved WARNING-level findings from 05-REVIEW.md — multi-recipient mailto (WR-01), bare at/dot false-positive (WR-02), unbounded per-item mailtoHref/cfemail length (WR-03) — since Phase 6 will be the first consumer that can be broken by a bad contact_email.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
