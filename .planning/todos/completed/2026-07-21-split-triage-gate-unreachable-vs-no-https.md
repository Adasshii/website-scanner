---
created: 2026-07-21T21:59:23.622Z
title: Split triage gate — unreachable not releasable, rename GATED label
area: triage
files:
  - lib/triage-scorer.ts
  - lib/triage-release.ts
  - lib/scan-queue.ts
  - components/admin/shortlist-table.tsx
---

## Problem

D-01 folds two very different signals into one `gated` boolean
(`!reachable || !https`, lib/triage-scorer.ts:38) and fast-tracks both: gated
prospects are always release-eligible and sort first. Seen on real data at the
Phase 4 cutover (2026-07-21): mollerino.nl (Unreachable) was released and armed —
but a scan of an unreachable site is guaranteed to FAIL, so it burns a queue slot
and produces no report, and the report is the whole pitch. Meanwhile the UI label
"GATED" reads as "excluded" when it means "top priority", which misled Joshua.

## Solution

Revises D-01, agreed with Joshua 2026-07-21:

1. `!reachable` prospects must NOT be releasable to the scan queue (exclude in
   selectWorstN eligibility or block at release). They may stay visible in the
   Shortlist table.
2. `!https` prospects keep the current behavior: always eligible, top priority —
   a live site without HTTPS is a prime prospect.
3. Rename the "GATED" pill in the Shortlist UI to something that communicates
   priority, e.g. "CRITICAL".
