---
quick_id: 261116-tog
slug: put-the-approved-direction-a-positioning
date: 2026-11-16
branch: copy/report-positioning
---

# Put the approved direction-A positioning lines into the live scanner copy

## Why

Decision logged 2026-11-16 in `decisions/log.md`: Adashi's one-line promise leads
with the moment before a customer makes contact (direction A), not with the craft.
The public scanner still carried the old framing, which sells a technical document.

## Scope

Copy only. Two keys per locale file, values changed, no keys added or removed.

| Key | Rendered at | NL before | NL after |
| --- | --- | --- | --- |
| `report.header.title` | `components/report/full-report.tsx:112` (the report H1) | Website-rapport | Wat een klant van je ziet voordat hij belt |
| `layout.header.tagline` | `components/layout/header.tsx:16` (site header, every page) | Website Performance & Conversie Audit | Wij zorgen dat je klopt op het moment dat iemand je vergelijkt |

English mirrors: "What a customer sees before they call" and
"We make sure you hold up when someone compares you".

## Out of scope

- The `metadata` block in both locale files. Those are SEO titles and descriptions
  and still carry the old framing. Changing them moves search results, so it is a
  separate call.
- The full three-part promise line ("je site, je reviews en je Google-profiel").
  The public scanner does not check reviews or a Google profile, so printing that
  promise here would claim checks the product does not run. That line belongs to the
  Prospect Radar report (Phases 11 and 12), which is not live.

## Verification

- Both files parse as JSON.
- `nl.json` and `en.json` keep an identical key structure.
- No key renamed, so next-intl message typing is unaffected.
