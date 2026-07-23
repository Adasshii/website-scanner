---
created: 2026-07-21T21:59:23.622Z
title: Exclude food-service categories at ingestion/triage
area: triage
files:
  - lib/triage-scorer.ts
  - lib/triage-release.ts
---

## Problem

The first live shortlist (Phase 4 cutover, 2026-07-21) was dominated by restaurants
(mollerino.nl, gasterijleyduin.nl, lekkerebites.nl, restaurantinheems.nl,
brasseriecheers.nl, and more). Joshua's call: food-service businesses are not target
prospects — mostly low budget, and their core need is table reservations, not the
website rebuilds Adashi sells. Nothing in ingestion or triage filters by business
category, so whatever dominates the Overture extract dominates the shortlist.

## Solution

Overture places data carries category tags. Exclude (or heavily down-weight) the
food-service categories (restaurants, cafes, bars — the "eat and drink" family)
before prospects reach the shortlist: at ingestion filtering, or as a category
gate in triage. Keep the category list configurable, not hardcoded — geography and
vertical are parameters on this project. Agreed with Joshua 2026-07-21.
