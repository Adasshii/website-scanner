---
created: 2026-07-23T23:40:00.000Z
title: Raise BULK_BATCH_SIZE to 10 for the daily drain cadence
area: triage
files:
  - lib/bulk-scan-constants.ts
---

## Problem

Vercel Hobby only allows daily crons, so the drain runs once a day at 07:00
(commit 96296d9, discovered at Phase 4 verification). At `BULK_BATCH_SIZE = 2`
that is 2 scans/day — a 20-prospect batch takes 10 days. Joshua's decision
(2026-07-23): stay on Hobby, take a bigger bite per tick instead.

## Solution

Set `BULK_BATCH_SIZE` from 2 to 10 in lib/bulk-scan-constants.ts (10 is the
server-side clamp in `claim_next_scan_batch`, so higher values are pointless).
One daily tick then scans 10 prospects — 70/week, above the 10–50/week target.
SCAN-06 measured 0.0pp public-scanner impact at current capacity settings;
re-check with `npm run scanner-health -- --compare` after the first full tick.
Requires redeploy (`npx vercel --prod`). Ship with the prospect-quality
mini-phase alongside the category-exclusion and gate-split todos.
