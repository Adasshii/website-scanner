---
phase: 03-triage-shortlist
plan: 05
subsystem: ui
tags: [react, nextjs, tailwind, admin, triage]

requires:
  - phase: 03-triage-shortlist
    plan: 03
    provides: app/api/admin/release-prospects/route.ts (POST {cutoff} -> releaseWorstN, ceiling never client-overridable)
  - phase: 03-triage-shortlist
    plan: 04
    provides: lib/triage-candidates.ts getShortlist() (pure read of all triaged prospects)
provides:
  - components/admin/signal-chips.tsx — SignalChips, derives applicable severity chips from a TriageScore
  - components/admin/cutoff-slider.tsx — CutoffSlider, native range input, live eligible-count readout, no fetching
  - components/admin/shortlist-table.tsx — ShortlistTable, worst-first ranked table with gate/release row treatment
  - components/admin/release-button.tsx — ReleaseButton, confirm-then-POST release action
  - app/api/admin/shortlist/route.ts — GET, x-admin-secret gated, returns getShortlist() sorted gated DESC / score ASC
  - app/admin/page.tsx — Tab extended to "shortlist", ShortlistTab sub-component wiring StatCards + slider + table + button
affects: [03-06-production-push]

tech-stack:
  added: []
  patterns:
    - "Shortlist eligibility (gated || score <= cutoff, excluding already-released) is computed identically in ShortlistTable and app/admin/page.tsx's ShortlistTab — both derive it client-side from the same already-fetched rows array, zero network calls per slider tick (D-07/TRI-08)"
    - "Intl.RelativeTimeFormat (stdlib) used for the 'Released {relative date}' cell instead of adding a date library"

key-files:
  created:
    - components/admin/signal-chips.tsx
    - components/admin/cutoff-slider.tsx
    - components/admin/shortlist-table.tsx
    - components/admin/release-button.tsx
    - app/api/admin/shortlist/route.ts
  modified:
    - app/admin/page.tsx

key-decisions:
  - "app/api/admin/shortlist/route.ts performs the gated DESC / score ASC sort server-side (getShortlist() itself returns unordered rows) so the client renders in received order per the plan's contract, rather than re-sorting client-side on every render"
  - "ReleaseButton takes the admin secret as an explicit prop (not read from sessionStorage itself) to keep it a plain, testable presentational component consistent with ScansTable/LeadsTable's existing secret-prop pattern"
  - "No next-intl on this surface: app/admin/page.tsx and every existing admin component (StatCard, TabButton, EmailStatusGroup) use hardcoded English strings with zero useTranslations calls — the Shortlist tab follows that established convention rather than introducing i18n on an internal single-tenant tool where none exists today"

patterns-established:
  - "New admin sub-surfaces get their own sub-component (ShortlistTab) inside app/admin/page.tsx that owns its StatCards + controls, rather than threading shortlist-specific state through the generic scans/leads fetchData path"

requirements-completed: [TRI-07, TRI-08, TRI-09]

coverage:
  - id: D1
    description: "Shortlist tab renders every triaged prospect worst-first (gated rows always on top, then lowest score first), with the GATED badge, red stripe/tint, and released-row opacity-60 treatment"
    requirement: "TRI-07"
    verification:
      - kind: other
        ref: "grep -q 'x-admin-secret' app/api/admin/shortlist/route.ts && grep -q 'getShortlist' app/api/admin/shortlist/route.ts && grep -q 'border-l-4 border-red-400' components/admin/shortlist-table.tsx && grep -q 'opacity-60' components/admin/shortlist-table.tsx"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit"
        status: pass
    human_judgment: true
    rationale: "Visual row ordering/treatment and the live slider re-shuffle are UI behaviors that need eyes-on confirmation per 03-VALIDATION.md's Manual-Only note; grep gates prove the contract's building blocks are present, not the rendered result."
  - id: D2
    description: "Cutoff slider re-shuffles eligibility and the Eligible-now StatCard live, client-side, over already-fetched rows with zero network round-trips per slide"
    requirement: "TRI-08"
    verification:
      - kind: other
        ref: "grep -q 'accent-adashi-blue' components/admin/cutoff-slider.tsx && grep -q 'type=\"range\"' components/admin/cutoff-slider.tsx"
        status: pass
    human_judgment: true
    rationale: "The 'zero network call per slide' behavior and the visual re-shuffle are runtime/interaction claims; deferred to /gsd-verify-work per plan's <verification> section."
  - id: D3
    description: "ReleaseButton confirms count + ceiling (+ overflow note when eligible > ceiling) before POSTing {cutoff} to the existing ceiling-enforcing release route, refreshes shortlist on success"
    requirement: "TRI-09"
    verification:
      - kind: other
        ref: "grep -q 'Release to Scan Queue' components/admin/release-button.tsx && grep -q '/api/admin/release-prospects' components/admin/release-button.tsx"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit && npm run lint && npm run build"
        status: pass
    human_judgment: true
    rationale: "The window.confirm copy, disabled states, and end-to-end release-then-refresh flow require a human click-through per 03-VALIDATION.md's Manual-Only note."

duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 3 Plan 5: Admin Shortlist UI Summary

**Third "Shortlist" tab on `app/admin/page.tsx`: a worst-first triaged-prospect table with a live cutoff slider (zero-refetch client re-filter) and a ceiling-aware Release-to-Scan-Queue action, all in the existing admin's hand-rolled Tailwind component language.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-20T16:12:00Z
- **Completed:** 2026-07-20T16:32:00Z
- **Tasks:** 3
- **Files modified:** 6 (5 new, 1 modified)

## Accomplishments
- `SignalChips` derives the applicable severity-tier chips (critical/major/minor/info, exact UI-SPEC classes) from a `TriageScore`, rendering zero chips for a clean site and always carrying a text label (never color-only)
- `CutoffSlider` is a native `<input type="range" min={0} max={100} step={5}>` at `accent-adashi-blue`, with the live "Cutoff: score ≤ {value} — {eligibleCount} of {totalTriaged} eligible" readout and the "0 (worst)"/"100 (best)" direction captions; does zero fetching itself
- `app/api/admin/shortlist/route.ts` copies the `x-admin-secret` gate verbatim from `app/api/admin/stats/route.ts` and returns `getShortlist()` rows sorted `gated DESC, score ASC` server-side
- `ShortlistTable` renders the 5-column contract (marker/domain/score/signals/released), gated rows get the `border-l-4 border-red-400` + `bg-red-50/30` + GATED badge treatment, released rows get `opacity-60` and stay visible, and all three UI-SPEC empty states (nothing triaged / nothing eligible / everything released) render the exact copy
- `ReleaseButton` is accent-blue (never destructive-red), disabled at zero-eligible or in-flight, confirms via `window.confirm` with the exact count/ceiling/overflow copy before POSTing `{cutoff}` to `/api/admin/release-prospects`, and refreshes the shortlist on success
- `app/admin/page.tsx`'s `Tab` type gained `"shortlist"` (appended after `"scans" | "leads"`); a new `ShortlistTab` sub-component owns its own 4 StatCards (Total triaged/Gated/Eligible now [highlighted]/Released), the slider, the table, and the release button — moving the cutoff recomputes `eligibleCount` purely from the already-fetched `shortlistRows` array, no re-fetch
- `npx tsc --noEmit`, `npm run lint`, `npm run test` (166/166), and `npm run build` all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: SignalChips + CutoffSlider components** - `174a160` (feat)
2. **Task 2: ShortlistTable component + shortlist GET data route** - `db3ebd7` (feat)
3. **Task 3: ReleaseButton + wire the Shortlist tab into app/admin/page.tsx** - `99fe553` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/signal-chips.tsx` - `SignalChips`, derives + renders the applicable severity chips from a `TriageScore`
- `components/admin/cutoff-slider.tsx` - `CutoffSlider`, controlled native range input + live readout, no fetching
- `components/admin/shortlist-table.tsx` - `ShortlistTable`, worst-first table with gate/release row treatment and the 3 empty-state copies
- `components/admin/release-button.tsx` - `ReleaseButton`, confirm-then-POST release action against the existing Plan 03 route
- `app/api/admin/shortlist/route.ts` - GET handler, admin-gated, returns `getShortlist()` sorted worst-first
- `app/admin/page.tsx` - `Tab` extended to `"shortlist"`; new `ShortlistTab` sub-component and its data-fetch wiring

## Decisions Made
- The gated-DESC/score-ASC sort happens server-side in `app/api/admin/shortlist/route.ts` (since `getShortlist()` itself is an unordered pure read from Plan 04) so the client renders rows in the order received, per the plan's contract
- `ReleaseButton` takes the admin `secret` as an explicit prop rather than reading `sessionStorage` itself, keeping it a plain presentational component consistent with how `ScansTable`/`LeadsTable` already receive `secret`
- No next-intl on this tab: confirmed via grep that zero existing admin components use `useTranslations` — the Shortlist tab follows that established hardcoded-English convention rather than introducing i18n on an internal, single-tenant admin surface
- Used `Intl.RelativeTimeFormat` (stdlib) for the "Released {relative date}" cell instead of adding a date-formatting dependency

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. The Shortlist tab reads via the existing `ADMIN_SECRET`/`sessionStorage` admin-auth pattern already configured for this project.

## Next Phase Readiness
- The admin Shortlist UI is complete end-to-end: worst-first ranking (TRI-07), live client-side cutoff re-shuffle (TRI-08), and a ceiling-aware, confirmed Release action (TRI-09) — all reusing Plan 03's release route and Plan 04's `getShortlist()` query with no redefinition.
- Manual UAT (per 03-VALIDATION.md's Manual-Only note) is deferred to `/gsd-verify-work`: open the tab, confirm worst-first order, drag the slider and confirm zero network calls, click Release and confirm the live refresh.
- Plan 06 (production push) can proceed once this UI is verified; no blockers.

---
*Phase: 03-triage-shortlist*
*Completed: 2026-07-20*
