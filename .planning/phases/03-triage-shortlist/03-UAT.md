---
status: testing
phase: 03-triage-shortlist
source: [03-VERIFICATION.md]
started: 2026-07-20T23:45:00Z
updated: 2026-07-20T23:45:00Z
---

## Current Test

number: 1
name: Live cutoff re-shuffle on the admin Shortlist tab
expected: |
  Sliding the cutoff control updates the eligible count and which rows are treated
  as eligible instantly on every tick, with NO network request fired on drag
  (confirm in browser DevTools → Network: no /api/admin/shortlist call while dragging).
awaiting: user response

## Tests

### 1. Live cutoff re-shuffle (TRI-08 — visual/real-time UI behavior)
expected: On the admin Shortlist tab, dragging the cutoff slider re-shuffles the eligible count and row highlighting live, with zero network requests on drag (DevTools Network shows no /api/admin/shortlist call while sliding — only on tab switch / after release).
result: [pending]

### 2. Real-network `npm run triage` dry-run smoke test (TRI-01..06 external path)
expected: Running `npm run triage -- --dry-run --limit 5` against real, live prospect websites prints a summary line (`N triaged, M clear the cutoff, K unreachable`); the fetch/score pipeline handles real-world redirects, slow sites, and non-viewport pages without crashing; zero DB writes occur under --dry-run.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
