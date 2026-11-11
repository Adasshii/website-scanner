---
status: complete
phase: 03-triage-shortlist
source: [03-VERIFICATION.md]
started: 2026-07-20T23:45:00Z
updated: 2026-07-21T11:43:47.302Z
---

## Current Test

[testing complete]

## Tests

### 1. Live cutoff re-shuffle (TRI-08 — visual/real-time UI behavior)
expected: On the admin Shortlist tab, dragging the cutoff slider re-shuffles the eligible count and row highlighting live, with zero network requests on drag (DevTools Network shows no /api/admin/shortlist call while sliding — only on tab switch / after release).
result: pass
evidence: |
  Observed by Joshua in the browser at http://localhost:3001/admin (Shortlist tab)
  against 18 real triaged prospects (20 imported, 2 clear the default cutoff),
  confirming the live re-shuffle. The no-re-fetch half is additionally
  code-proven in 03-VERIFICATION.md: CutoffSlider's onChange calls only
  setCutoff (local React state); fetchShortlist() is absent from the slider
  path and fires only on tab switch / onReleased.

### 2. Real-network `npm run triage` dry-run smoke test (TRI-01..06 external path)
expected: Running `npm run triage -- --dry-run --limit 5` against real, live prospect websites prints a summary line (`N triaged, M clear the cutoff, K unreachable`); the fetch/score pipeline handles real-world redirects, slow sites, and non-viewport pages without crashing; zero DB writes occur under --dry-run.
result: pass
evidence: |
  Prerequisite data seeded first: imported 20 real NL/Noord-Holland/restaurant
  prospects from live Overture (campaign-tag uat-phase3) — 18 with a domain,
  2 no-website.
  Real run: `npm run triage -- --limit=20` → "18 triaged, 2 clear the cutoff,
  1 unreachable" — exact specified summary format; 18 live sites fetched
  (including one genuinely unreachable) with no crash.
  Dry-run zero-writes proof: snapshot of triage_checked_at across all rows
  before/after `npm run triage -- --dry-run --limit 5` is byte-identical
  (md5 fingerprint 4aec55793a76 both sides; total=20, triaged=18, released=0
  unchanged). Output: "5 triaged, 0 clear the cutoff, 0 unreachable —
  dry-run, zero writes performed."

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
