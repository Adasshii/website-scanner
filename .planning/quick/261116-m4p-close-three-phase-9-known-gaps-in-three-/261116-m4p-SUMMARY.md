---
phase: quick
plan: 261116-m4p
subsystem: niche-profile
tags: [trade-detection, niche-registry, eng-07, phase-9-gaps]
requires: []
provides:
  - plural-only boiler sites resolve to central_heating (clear)
  - production profile reads go through getNicheProfile("installers")
  - ENG-07 column guard reads supabase/migrations only
affects: [lib/niche-profile, lib/bulk-scan-dispatch.ts, lib/atrium-scan.ts, scripts/import-prospects.ts]
tech-stack:
  added: []
  patterns: [registry lookup by id in production code]
key-files:
  created: []
  modified:
    - lib/niche-profile/installers/trades.ts
    - tests/fixtures/own-site-zones.ts
    - lib/bulk-scan-dispatch.ts
    - lib/atrium-scan.ts
    - scripts/import-prospects.ts
    - lib/google-content-guard.test.ts
    - .claude/CLAUDE.md
    - .planning/codebase/STACK.md
  deleted:
    - supabase/schema.sql
decisions:
  - "Phrase terms of central_heating match by prefix, not by a second term, so a bare 'cv' stays unseeded."
  - "OWN_SITE_ZONE_KNOWN_GAPS stays exported and empty so the next gap has a home."
metrics:
  tasks: 3
  commits: 4
  completed: 2026-11-16
status: complete
actuals:
  tokens: 6000
  tasks: 3
  commits: 4
plan_head_before: 801f2fffb521ec6936da983cabd446604ecaa1ce
plan_head_after: f1d8e820918052a40f9288283ecc7173d2be87b4
requirements-completed: [NIC-01, NIC-04, ENG-01, ENG-07, QT-261116-m4p]
---

# Quick Task 261116-m4p: Close three Phase 9 known gaps Summary

Four commits (three task commits plus one doc follow-up) on `gsd/phase-09-niche-profile`: boiler phrases match by prefix, production reads the installers profile through the niche registry, and the stale schema dump is gone with the ENG-07 guard retargeted at the migrations.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | eab0d07 | fix(09): match the boiler phrases by prefix so 'cv ketels' reads as central heating |
| 2 | 67a6f0f | refactor(09): read the installers profile through the niche registry (NIC-04) |
| 3 | 4c88f0f | fix(09): drop the stale schema dump and point the ENG-07 guard at the migrations |
| 3 (follow-up) | f1d8e82 | docs(09): correct the migration count and table list in the stack notes |

## Named items

**Measured confidence for the plural fixture.** The detector returns `clear` for `central-heating-plurals-only` (trade `central_heating`). Measured by moving the entry into the corpus with `clear`, which the per-entry test accepted. To confirm the test really asserts confidence, I temporarily set `narrow`; it failed with "expected 'clear' to be 'narrow'" and named the entry. The fixture was restored to `clear`. Nothing was retuned.

**Did any other corpus site move.** No. After the prefix change, the only failure in `lib/trade-detection.test.ts` was the known-gaps pin (the entry now resolves). With the entry moved, the whole-corpus naming assertion reports an empty broken list. The HALT CONDITION never tripped. 87 of 87 tests pass.

**ENG-07 probe migration (RED, both directions).**
- With `supabase/migrations/zzz-guard-probe.sql` containing `alter table prospects add column user_rating_count integer;`, `lib/google-content-guard.test.ts` exited 1 and failed with: `supabase/migrations/zzz-guard-probe.sql declares a Google-named column: column "user_rating_count"`.
- With the probe deleted, the same file passed 12 of 12. The probe was never staged and does not exist.
- Guard strictness unchanged: the `existsSync` directory check still runs first, `toBeGreaterThan(1)` is kept (23 migrations satisfy it), the per-file `findGoogleColumnViolations` assertion and its message are untouched, and `lib/google-content-guard.ts` is byte-identical to HEAD. The test was renamed to "no migration declares a column named after a field Google returns".

**Task 2 behaviour proof.** `lib/bulk-scan-dispatch.test.ts` (sent slice equals `toScannerSlice` of the profile), `scripts/import-prospects.test.ts` and `lib/niche-profile/isolation.test.ts` pass unmodified. No test file was touched, `lib/niche-profile/index.ts` is byte-identical, and both grep gates (3 registry calls, 0 concrete-export names outside comments) pass. The Atrium route integration test needs local Supabase and was not run, per the plan; `tsc` plus the grep gates cover it.

## Deviations from Plan

### Orchestrator-authorized scope additions

**1. `.planning/codebase/STACK.md` line 12 corrected in the Task 3 commit.**
- Reason: that line carried the identical stale `supabase/schema.sql` reference and is the generator source for that section of `.claude/CLAUDE.md`. Left alone, a future `/gsd-map-codebase` run would reintroduce the reference Task 3 removes, so the fix would undo itself.
- Change: now names `supabase/migrations/` only, the same correction as `.claude/CLAUDE.md`.
- This supersedes the plan's instruction to leave STACK.md alone. Task 3 therefore staged four paths (the deletion, the test, CLAUDE.md, STACK.md) rather than three.

**2. `.claude/CLAUDE.md` lines 109 and 110 corrected, and the matching lines in `.planning/codebase/STACK.md` (lines 85 and 86).**
- Approved by Joshua after the first dispatch had told me to leave them alone and only report them. This supersedes that instruction and the "Open items" entry that previously held it.
- Because Task 3 was already committed (4c88f0f) when the addition arrived, I did not amend. The edit is a fourth commit, f1d8e82, which says it completes the same doc cleanup.
- Line 109 now reads "23 files, Mar–Nov 2026". Count: `ls supabase/migrations/*.sql` gives 23. Span: migration filenames carry no dates, so I took the date each file was first added in git (`git log --diff-filter=A --follow`): earliest 2026-03-24 (001), latest 2026-11-14 (023).
- Line 110 now lists the ten tables the migrations create, derived from every `create table` statement under `supabase/migrations/`: `scans`, `leads` (001), `email_events` (003), `prospects` (010), `prospect_sources` (011), `outreach_messages` (012), `suppressions` (014), `lia_versions` and `legal_regimes` (015), `send_records` (020). `email_events` is real, so it stays. "with indexes and RLS policies" was kept after checking: all ten tables sit in files that enable row level security and the migrations create indexes.
- Generator source: `.planning/codebase/STACK.md` carries the identical two lines (85, 86) and was corrected the same way. No other file under `.planning/codebase/` carries them (grep).
- ENG-07 RED probe: the follow-up touches documentation only, so it was not re-run. The probe result recorded above (RED exit 1 naming the probe file, green 12/12 after removal) was taken on the committed guard code in 4c88f0f, which the follow-up does not change.

### Auto-fixed issues

None. The plan executed as written. Placement note: in `lib/atrium-scan.ts` and `lib/bulk-scan-dispatch.ts` the `const profile` binding sits inside the existing `try`, directly above the `fullScanBulk` call, with the D-9-12 comments untouched.

## Open items (reported, not fixed)

- None from the doc cleanup: the stale lines 109 and 110 were folded in as scope addition 2 above.
- **Verification-only dependency:** the Atrium route integration test was not run (needs local Supabase).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path, file access or schema change.

## Self-Check: PASSED

- eab0d07, 67a6f0f, 4c88f0f, f1d8e82 are all ancestors of HEAD (`git rev-list --count 801f2ff..HEAD` = 4).
- `supabase/schema.sql` and `supabase/migrations/zzz-guard-probe.sql` do not exist.
- Final run: 6 vitest files, 188 tests pass; `tsc --noEmit` clean; eslint clean on all touched TS files.
- `git status --short` shows only the three planning files untracked, plus this quick-task directory.
