---
phase: quick
plan: 261118-luy
status: complete
subsystem: i18n-copy
tags: [positioning, copy, homepage, seo, i18n]
requires: []
provides:
  - the homepage and the SEO title carry the direction-A positioning
affects: [homepage, start page, the browser tab title, Google result title]
key-files:
  created: []
  modified:
    - messages/nl.json
    - messages/en.json
commits:
  - e86f326
date: 2026-11-18
branch: copy/home-positioning
---

# Put the moment on the homepage and in the title

## What changed

Nine string values per locale file. No keys added, renamed or removed.

| Key | Dutch, before | Dutch, after |
| --- | --- | --- |
| `metadata.title` | Gratis Website Audit, Performance & Conversie \| Adashi | Gratis website-audit: wat een klant van je ziet \| Adashi |
| `home.hero.title` | Hoe presteert je website | Wat ziet een klant |
| `home.hero.titleHighlight` | echt | voordat |
| `home.hero.titleSuffix` | ? | hij contact opneemt? |
| `home.hero.subtitle` | Een directe scan van de toegankelijkheid, SEO, contentkwaliteit en prestaties ... | We bekijken je site zoals een bezoeker dat doet ... |
| `home.features.heading` | Wat je ontdekt | Wat een bezoeker tegenkomt |
| `home.features.subheading` | We controleren de zaken die er ... het meest toe doen. | We controleren de vier dingen die een bezoeker als eerste raken. |
| `home.bottomCta.heading` | Klaar om te zien hoe jouw site scoort? | Kijk mee door de ogen van je klant |
| `home.bottomCta.subheading` | ... brengt vaak problemen aan het licht ... | ... je ziet wat hij ziet voordat hij kiest. |

English mirrors throughout: "What does a customer see **before** they get in touch?",
"What a visitor runs into", "Look through your customer's eyes".

## A bug fixed on the way

`app/page.tsx` renders `{title}{" "}<span>{titleHighlight}</span>{" "}{titleSuffix}`, with
explicit spaces. The Dutch suffix was a bare `"?"`, so the live headline read
"Hoe presteert je website echt ?" with a space before the question mark. The new split ends the
suffix on a word, so the mark sits tight in both languages. This was not the point of the change
and had not been reported.

## The SEO cost, stated plainly

The title drops "Performance & Conversie" / "Performance & Conversion". The primary search term
stays first and both dropped words still appear in `metadata.description`, which is unchanged, so
they remain on the page. NL is 56 characters, EN is 49, so neither is truncated in a result.

Watch the inbound search traffic. If it drops, the old title is one line to restore.

## Verification

- Both locale files parse as JSON.
- Identical key structure in both, checked by walking the trees and diffing the key sets.
- The hero string was assembled exactly as `app/page.tsx` does and asserted free of a double
  space and of a space before the question mark.
- Both `metadata.title` values measured under 60 characters.
- The rendered page was checked on the pull request's Vercel preview. This worktree has no
  `node_modules` and no env file, so no local dev server was run.
- No test or type check was run: the change is values-only in two JSON files and touches no
  TypeScript.

## Open

Unchanged by this task, carried forward:

- Counsel's Article 14 wording. Still the blocker on sending anything.
- No live draft has been generated and read with the new email wording.
- `docs/report-copy.md` is still not in `main`; it sits on `gsd/phase-09-niche-profile`.
