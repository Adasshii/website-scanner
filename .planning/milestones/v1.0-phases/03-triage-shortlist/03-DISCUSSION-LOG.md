# Phase 3: Triage & Shortlist — Discussion Log

**Date:** 2026-07-20
**Mode:** discuss (interactive)
**Areas selected:** Triage score formula · Cutoff + hard ceiling · Eligibility (flip vs. query) · Runner + fetch etiquette

> Human-reference record of the discussion. Downstream agents consume CONTEXT.md,
> not this file.

## Area 1 — Triage score formula (TRI-06)

- **Score model** — Options: Gate-then-weighted (rec) / Flat weighted sum / You
  decide. → **Gate-then-weighted score.** Unreachable or no-HTTPS auto-tops the
  shortlist; the rest weighted below. → D-01.
- **Weights** — Options: Trust+mobile first (rec) / Performance first / You
  decide. → **You decide** (roughly even, documented). → D-01 / Claude's Discretion.
- **Thresholds** — Options: Banded defaults in one tunable block (rec) / I'll give
  numbers / You decide. → **You decide** (small-business-site defaults). → Claude's
  Discretion.
- **Stored data** — Options: Score + full breakdown (rec) / Score only. → **Score +
  full signal breakdown in triage_score jsonb.** → D-02.

## Area 2 — Cutoff + hard ceiling (TRI-08, TRI-09)

- **Cutoff home** — Options: Default constant + previewable in shortlist (rec) /
  Config table row / Env var. → **Default constant, previewable via a cutoff param
  on the shortlist; `--cutoff` on release. No new table.** → D-03.
- **Ceiling** — Options: ~20/run + ~30% target (rec) / I'll give numbers / You
  decide. → **~20 full scans per run, ~30% target pass-rate** (tunable). → D-04.
- **Overflow** — Options: Release worst-N up to ceiling (rec) / Refuse, force
  tighter cutoff / You decide. → **You decide** → chose **release worst-N up to the
  ceiling, rest roll to next run.** → D-05.
- **Run scope** — Options: Per invocation + no re-release (rec) / Per rolling
  window / You decide. → **You decide** → chose **per release invocation + released
  prospects never re-release** (bounded total). → D-06.

## Area 3 — Eligibility & Phase 3 / Phase 4 boundary (TRI-07, TRI-08)

- **Eligibility** — Options: Pure query; release is the only state change (rec) /
  Flip on triage / You decide. → **Pure query.** Triage writes only triage_score;
  shortlist/eligible = live query over triage_score + cutoff. → D-07.
- **P3/P4 line** — Options: P3 marks 'released' under the ceiling, P4 builds the
  queue (rec) / P3 also writes queue rows / You decide. → **P3 marks released; P4
  owns the queue.** → D-08.
- **Re-triage** — Options: Overwrite score, skip already-released (rec) / Always
  overwrite / You decide. → **Overwrite for un-released, skip released.** → D-09.

## Area 4 — Runner + fetch etiquette

- **Triage run** — Options: `scripts/triage-prospects.ts` like the importer (rec) /
  Vercel cron / Admin button. → **Other: "a clean and easy way to do this."**
  Reflected back: the clean/easy path given the timeout + cron constraints is the
  script packaged as **`npm run triage`**. Locked to that (vetoable). → D-10.
- **Release** — Options: From the admin shortlist UI (rec) / Flag on the script /
  You decide. → **From the admin shortlist UI** (human-in-loop at the budget
  decision). → D-11.
- **Fetch manners** — Options: Honest UA + robots + gentle rate-limit (rec) / UA +
  rate-limit, skip robots / You decide. → **Honest UA + respect robots + gentle
  rate-limit.** → D-12.

## Deferred ideas

None — discussion stayed within phase scope. Scan-queue mechanics, concurrency,
and per-site scan rate-limiting bounded OUT to Phase 4.

## Claude's Discretion (delegated)

Signal weights, page-weight / response-time threshold bands, `triage_score` jsonb
keys, release-marker column name + migration `016`, shortlist query/sort, and
admin shortlist UI layout — Claude's call as long as D-01…D-12 hold.
