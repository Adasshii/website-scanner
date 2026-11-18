---
phase: quick
plan: 261116-tog
status: complete
subsystem: i18n-copy
tags: [positioning, copy, report, i18n]
requires: []
provides:
  - the report H1 and site header tagline now carry the direction-A promise
affects: [public scanner report page, every page's site header]
key-files:
  created: []
  modified:
    - messages/nl.json
    - messages/en.json
commits:
  - d2b04df
date: 2026-11-16
branch: copy/report-positioning
---

# Lead the report with the moment, not the audit

## What changed

Four string values across the two locale files. Nothing else.

| Key | Before | After |
| --- | --- | --- |
| `report.header.title` (NL) | Website-rapport | Wat een klant van je ziet voordat hij belt |
| `report.header.title` (EN) | Website Report | What a customer sees before they call |
| `layout.header.tagline` (NL) | Website Performance & Conversie Audit | Wij zorgen dat je klopt op het moment dat iemand je vergelijkt |
| `layout.header.tagline` (EN) | Website Performance & Conversion Audit | We make sure you hold up when someone compares you |

The report H1 renders at `components/report/full-report.tsx:112`. The tagline
renders at `components/layout/header.tsx:16`, in a `hidden sm:inline` span, so it
shows on the home, start, scan and report pages on desktop and is hidden on phones.

## Why

Decision logged 2026-11-16 in `decisions/log.md`. Adashi's one-line promise leads
with the moment before a customer makes contact (direction A), not with the craft.
The old lines sold a technical document. Everything a customer sees in the
comparison window then belongs in the report by definition, which is what lets one
report carry findings Adashi does not itself sell.

## Deliberately not done

- The `metadata` block in both locale files still says "Gratis Website Audit,
  Performance & Conversie" and the English equivalent. Those are the SEO title and
  description. Changing them moves search results and needs its own call.
- The full promise line naming reviews and a Google profile is NOT on the public
  scanner, because the public scanner does not check either. It belongs to the
  Prospect Radar report, which is not live.
- The cold email subject and the call opening from the same decision have no home
  in this codebase yet. They land with Phases 11 and 12.

## Verification

- Both locale files parse as JSON.
- `nl.json` and `en.json` have an identical key structure, checked by walking both
  trees and diffing the key sets. No key only in one file.
- No key added, renamed or removed, so next-intl message typing cannot be affected.
- `npx tsc --noEmit` was NOT run. This worktree has no `node_modules` and the change
  touches no TypeScript. Install and run it before merge if you want the gate.
- The rendered page was not opened. No dev server runs in this worktree.

## Open for Joshua

The English lines are a translation, not approved copy. Only the Dutch lines were
settled in the decision log. Read the two English strings before this merges.
