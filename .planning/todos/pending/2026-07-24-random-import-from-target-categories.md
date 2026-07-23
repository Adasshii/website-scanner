---
created: 2026-07-24T09:30:00.000Z
title: Add random import mode — TARGET_CATEGORIES and TARGET_REGIONS sampling
area: triage
files:
  - scripts/import-prospects.ts
  - lib/triage-constants.ts
---

## Problem

Every import requires a hand-picked `--category` (Phase 1 decision D-10 — country,
region, and category are all required and validated before any Overture query).
Joshua doesn't want to choose a vertical for every import (2026-07-24). Making
imports truly random across all businesses is the wrong fix: Overture NL data is
dominated by food service, schools, churches, and government — random sampling
spends triage on non-buyers.

## Solution

Revises D-10, keeps its spirit (bounded, deliberate imports):

1. Add `TARGET_CATEGORIES` to lib/triage-constants.ts — the positive twin of
   EXCLUDED_CATEGORIES, seeded with Adashi-shaped verticals (physiotherapy,
   dental, salons/beauty, construction, garages, legal, accounting, etc. —
   confirm exact Overture category strings against real data). Configurable,
   never hardcoded at call sites.
2. Accept `--category=random` (or `--mixed`) in scripts/import-prospects.ts:
   sample across TARGET_CATEGORIES instead of one fixed value. `--limit` still
   bounds the pull; EXCLUDED_CATEGORIES still guards release regardless.
3. Same for region (added 2026-07-24): `TARGET_REGIONS` in lib/triage-constants.ts
   (the NL provinces Joshua wants to prospect — likely all twelve to start, still
   configurable) and `--region=random` sampling from it. Region resolution
   itself is untouched — the existing bbox pre-filter + ST_Within polygon check
   (Phase 01-04) just receives the sampled name.
4. Explicit `--category=<value>` and `--region=<value>` keep working unchanged.

With both random, an import becomes one no-decision command:
`npx tsx scripts/import-prospects.ts --country=NL --region=random --category=random --limit=50`

Small feature; fits a /gsd-quick or a plan alongside Phase 5. Have Joshua
confirm the seed lists (target verticals AND target provinces) before locking.
