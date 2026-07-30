---
status: testing
phase: 06-draft-generation-approval-queue
source: [06-VERIFICATION.md]
started: 2026-07-30
updated: 2026-07-30
---

## Current Test

number: 1
name: Confirm GEMINI_API_KEY is present in the Vercel production environment
expected: |
  The Vercel project website-scanner has GEMINI_API_KEY set, scoped to Production and
  Preview, server-side, with no NEXT_PUBLIC_ prefix. Confirmed by looking at the Vercel
  dashboard directly, not by recollection.
awaiting: user response

## Tests

### 1. GEMINI_API_KEY present in Vercel production
expected: |
  Vercel Dashboard -> website-scanner -> Settings -> Environment Variables lists
  GEMINI_API_KEY, scoped to Production and Preview, with no NEXT_PUBLIC_ prefix.

  Why this is a test and not an assumption: the identical "key is set" attestation for local
  dev turned out to be false earlier in this phase. The key existed only in
  scanner-service/.env, which the Next.js runtime never loads, so draft generation had never
  once run end to end. The production claim rests on the same kind of attestation and has not
  been independently checked.

  Stronger check if the app is deployed: open https://scan.adashi.io/api/health and confirm
  the env block reports GEMINI_API_KEY as true. That endpoint reports presence as a boolean
  and never exposes a value.
result: [pending]

### 2. A draft generated from a genuinely crawled scan
expected: |
  Every live generation so far used seeded fixture scans. Run one real prospect through the
  pipeline (scan completes -> draft appears in the Outreach tab) and confirm the draft is
  coherent, cites a figure that matches its report, and reads as something you would send.
result: [pending]

### 3. Dutch report/draft locale match on a real NL scan
expected: |
  During Task 3 a Dutch draft linked to a report page that rendered in English. This is
  believed to be the seed fixture not setting scan.locale rather than a product defect, but
  it was never confirmed. On a real NL prospect, confirm the linked report renders in Dutch
  so a prospect clicking through from a Dutch email does not land on English.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
