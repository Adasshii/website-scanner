---
quick_id: 261118-luy
slug: bring-the-public-scanner-homepage-and-se
date: 2026-11-18
branch: copy/home-positioning
---

# Bring the homepage and the SEO title onto the direction-A positioning

## Why

Direction A (logged 2026-11-16) is live in three places now: the report H1 and the site header
tagline (`261116-tog`), and the cold email and its subject (`261118-lhg`). The homepage still
sold the old technical audit, so the live site said two different things depending on the page a
prospect landed on.

## Scope

Copy only. Nine lines per locale file, values changed, no keys added or removed.

| Key | Was | Is |
| --- | --- | --- |
| `metadata.title` | Gratis Website Audit, Performance & Conversie \| Adashi | Gratis website-audit: wat een klant van je ziet \| Adashi |
| `home.hero.title` / `titleHighlight` / `titleSuffix` | Hoe presteert je website **echt** ? | Wat ziet een klant **voordat** hij contact opneemt? |
| `home.hero.subtitle` | a list of the four checks | what a visitor meets, in a visitor's order |
| `home.features.heading` / `subheading` | Wat je ontdekt | Wat een bezoeker tegenkomt |
| `home.bottomCta.heading` / `subheading` | Klaar om te zien hoe jouw site scoort? | Kijk mee door de ogen van je klant |

English mirrors the Dutch throughout.

## Two things worth noting

**The headline fixes an old bug.** `app/page.tsx` renders
`{title}{" "}<span>{titleHighlight}</span>{" "}{titleSuffix}`, so a bare `"?"` suffix produced
"Hoe presteert je website echt ?" with a space before the question mark. The new split ends on a
word, so the mark now sits tight in both languages.

**The gradient word carries the positioning.** `titleHighlight` is the one phrase rendered in the
gradient. It is now "voordat" / "before", which is the whole point of direction A: the moment.

## The SEO cost, stated plainly

`metadata.title` drops "Performance & Conversie" / "Performance & Conversion". The primary search
term stays first ("Gratis website-audit" / "Free website audit") and both dropped words still
appear in `metadata.description`, which is unchanged, so they are not lost from the page. Both
new titles are under 60 characters, so neither is truncated in a result.

## Out of scope

- `metadata.description` and `ogDescription`. Accurate, keyword-bearing, and changing them is
  risk with no gain.
- The four feature boxes (`accessibility`, `content`, `seo`, `performance`). Their titles and
  descriptions describe what the scan measures and are still true. Only the block's heading moved.
- `home.steps`. Still accurate.

## Verification

- Both files parse as JSON and keep an identical key structure.
- The hero string is assembled exactly as `app/page.tsx` does it and checked for a stray space.
- The rendered page is checked on the pull request's Vercel preview, not locally: this worktree
  has no `node_modules` and no env file.
