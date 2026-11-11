# Phase 3: Triage & Shortlist - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase gives every imported prospect a cheap, browserless verdict and turns
those verdicts into a worst-first shortlist that gates entry to the Phase 4 full
scan. It delivers, and only delivers:

- A triage pass over every prospect using native `fetch()` + regex on raw HTML —
  **no Playwright, no Lighthouse, no jsdom/Cheerio, no AI anywhere in the path**
  (TRI-01). It records reachability (TRI-02), HTTPS availability + the full
  redirect chain (TRI-03), mobile-viewport meta presence (TRI-04), and HTML page
  weight + response time (TRI-05).
- A single triage score used to rank prospects worst-first (TRI-06), written to
  the existing `prospects.triage_score` (jsonb) + `triage_checked_at` columns.
- An admin shortlist ranked worst-first by that score (TRI-07), with a
  configurable cutoff that decides which prospects are eligible for a full scan
  (TRI-08) and a hard per-run ceiling that caps how many are released regardless
  of how permissive the cutoff is (TRI-09).

**Explicitly NOT in this phase** (owned elsewhere, do not build here):
- The bulk scan queue, its browser-concurrency control, and running real scans —
  Phase 4. Phase 3 hands off a marked "released" set; Phase 4 drains it.
- Contact extraction / classification (Phase 5), draft generation (Phase 6),
  send (Phase 8).
- Any DOM parsing, headless browser, or AI — the exact cost triage exists to
  avoid.

</domain>

<decisions>
## Implementation Decisions

### Triage score (TRI-06)
- **D-01: Gate, then weighted score.** Unreachable OR no-HTTPS (served over plain
  HTTP) hard-gates a prospect straight to the top of the worst-first shortlist.
  The remaining signals — redirect-chain health, mobile-viewport presence, HTML
  page weight, response time — form a weighted score below the gate.
  Unreachable/no-HTTPS are the loudest "neglected site" tells and the strongest
  pitch hooks, so they dominate by construction rather than by weight-tuning.
- **D-02: Store score + full signal breakdown.** `prospects.triage_score` (jsonb)
  holds the numeric score AND every raw signal (reachable, https, redirectChain,
  hasViewport, bytes, responseMs). The shortlist shows *why* a prospect ranks
  badly, and Phase 6's draft generation can cite specifics without re-fetching.

### Cutoff & hard ceiling (TRI-08, TRI-09)
- **D-03: Cutoff is a default constant, previewable live in the shortlist.** A
  sane default lives in a constants block; the admin shortlist view takes a cutoff
  parameter so Joshua slides it and watches eligibility re-shuffle instantly
  (satisfies TRI-08). The release step accepts an explicit `--cutoff`. No new
  config table.
- **D-04: Hard ceiling ~= 20 full scans per run; target ~= 30% pass-rate.** Sized
  to the 10–50/week import volume and limited Railway browser concurrency; ~30%
  pass means triage is genuinely filtering, not passing everyone through. Both are
  tunable defaults, documented in one place.
- **D-05: Overflow releases worst-N up to the ceiling.** When more prospects clear
  the cutoff than the ceiling allows, release the worst-ranked up to the ceiling;
  the rest stay shortlisted and roll into the next run. The ceiling is a
  throughput cap, never a rejection — nothing is lost.
- **D-06: Ceiling is per release invocation, and released prospects never re-release.**
  Each explicit release action gets its own ceiling, and a prospect
  already released to the scan queue is marked and excluded from every future
  release. Total scans stay bounded no matter how many times triage/release runs —
  TRI-09 enforced independently of TRI-08's cutoff (Pitfall 4).

### Eligibility & the Phase 3 / Phase 4 boundary (TRI-07, TRI-08)
- **D-07: Eligibility is a pure query, not a state flip.** Triage writes only
  `triage_score` + `triage_checked_at`; it never touches `lifecycle_state`. The
  shortlist and the "eligible" set are a live query over `triage_score` + the
  current cutoff, so moving the cutoff changes eligibility with zero
  re-computation. Mirrors Phase 2's D-07 ("pure lookup, never mutate").
- **D-08: Release is the single state change; Phase 3 marks, Phase 4 queues.** On
  release, Phase 3 marks the ceiling-limited worst-N as released-to-scan (a
  marker/timestamp on the prospect). Phase 4 owns the real queue mechanism and
  concurrency. Phase 3 stays cheap and browserless; no premature queue infra.
- **D-09: Re-triage overwrites for un-released prospects, skips released ones.**
  Running triage again refreshes `triage_score` + `triage_checked_at` for
  prospects not yet released; already-released prospects are skipped (their full
  scan supersedes the cheap verdict). Re-import still never touches triage results
  (IMP-05 holds).

### How triage runs (operator surface)
- **D-10: Triage execution is a CLI script, run as a clean `npm run triage`.**
  `scripts/triage-prospects.ts` follows the established importer pattern
  (`--dry-run`, `--limit`, `--cutoff`, prints a summary like "42 triaged, 13 clear
  the cutoff, 0 unreachable"). It runs locally — off the production Vercel/Railway
  IP — which sidesteps both the thin-cron-reliability concern and the Vercel
  function-timeout cliff that 10–50 sequential fetches would hit. This is the
  "clean and easy" path Joshua asked for: one memorable command, identical in feel
  to `import`.
- **D-11: Release is triggered from the admin shortlist UI.** Joshua reviews the
  ranked shortlist, sets the cutoff, and clicks Release; the action enforces the
  ceiling and marks the worst-N released (cheap row updates that fit a Vercel
  route fine). Keeps the human in the loop exactly where the budget is spent.
- **D-12: Good-citizen fetch manners.** Triage sends a truthful, identifiable
  User-Agent (names the tool + a contact URL — no browser spoofing), checks
  robots.txt before fetching a homepage, and self-rate-limits (small concurrency +
  spacing). Consistent with the PITFALLS blast-radius posture even though the
  script runs off the production IP. Reachability/HTTPS/redirect signals reuse
  `validateUrlSafe()` rather than a second fetch guard.

### Claude's Discretion
- Exact signal weights within the weighted band, the "bad" threshold band values
  for page weight and response time (sensible small-business-site defaults in one
  tunable constants block), the `triage_score` jsonb key names, the release-marker
  column name (e.g. `scan_released_at`) and its migration (next number is `016`),
  the shortlist query/sort SQL, and the admin shortlist UI layout — all Claude's
  call as long as D-01…D-12 hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §Triage — TRI-01..09, full wording (the signal list
  and the cutoff/ceiling split are precise).
- `.planning/ROADMAP.md` §"Phase 3: Triage & Shortlist" — goal, 5 success
  criteria, and the notes: triage is native `fetch()` + regex (DOM libs rejected
  on sight); TRI-09's ceiling is enforced independently of TRI-08's cutoff; this
  phase must ship before or with Phase 4.

### Data model (storage already provisioned)
- `supabase/migrations/010_create_prospects.sql` — the `prospects` table already
  carries `triage_score jsonb` + `triage_checked_at`; `domain` is the normalised
  registrable domain (NULL = no-website, never triaged); `lifecycle_state`
  defaults to 'new'. Triage writes the two triage columns; the release marker is a
  new column via migration `016_…`.

### Reusable code (reuse, don't reinvent)
- `lib/url-validation.server.ts` — `validateUrlSafe()`: SSRF-safe fetch guard with
  redirect-chain detection. Triage's reachability, HTTPS, and redirect-chain
  signals reuse this, not a second fetcher.
- `lib/domain-normalize.ts` — the registrable-domain normaliser shared across
  import and suppression; any domain handling here reuses it.
- `lib/supabase.ts` `createServerClient()` — service-role client for the script's
  writes and the admin release action.
- `scripts/import-prospects.ts` — the established CLI-script shape (required args,
  `--dry-run`, `--limit`, prints a summary) that `scripts/triage-prospects.ts`
  follows.
- `app/admin/page.tsx` — the existing admin dashboard (tabbed, StatCards, bulk
  actions) that the shortlist view extends. `UI hint: yes` — a UI-SPEC gate will
  fire at plan time.

### Why triage has its own scorer (avoid the known trap)
- `lib/scoring.ts` — the full-scan aggregator (`aggregateScores`, `buildSummary`)
  operates on `PageResult[]` from a browser scan. Triage has no PageResult and
  must NOT reuse it; the triage scorer is a separate, browserless module. Do not
  couple them.
- `.planning/codebase/CONCERNS.md` — documents the duplicated/diverged scoring
  between `scanner-service/src/scoring.ts` and `lib/scoring.ts`, the
  browser-concurrency limits that break under bulk load, and thin cron
  reliability. These drive triage's own scorer, the ceiling, and the local-script
  runner.
- `.planning/research/PITFALLS.md` — the WAF-fingerprinting / blast-radius concern
  behind D-12's fetch etiquette.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `prospects.triage_score` (jsonb) + `prospects.triage_checked_at` — result
  storage already exists (migration 010); no new table for triage results.
- `validateUrlSafe()` (`lib/url-validation.server.ts`) — SSRF-safe
  reachability/HTTPS/redirect-chain, returns the normalised URL.
- `lib/domain-normalize.ts` — registrable-domain normaliser, reused.
- `createServerClient()` (`lib/supabase.ts`) — service-role writes for both the
  script and the admin release route.

### Established Patterns
- Operator actions are CLI scripts (`scripts/*.ts`) with explicit args,
  `--dry-run`, and a printed summary. Triage execution follows this; the release
  action is the deliberate exception (admin UI, because that is where the budget
  decision is reviewed).
- Migration convention `NNN_name.sql`, next number is `016`. RLS/service-role
  posture matches existing tables.
- Admin surface is a client component with tabs + StatCards; the shortlist is a
  new prospects/shortlist view within it.

### Integration Points
- Reads `prospects` (imported in Phase 1); writes `triage_score` /
  `triage_checked_at` and, on release, the release marker.
- Hands the released set to Phase 4's scan queue via the marker column — the
  single Phase 3 → Phase 4 contract.

</code_context>

<specifics>
## Specific Ideas

- Triage summary line example: "42 triaged, 13 clear the cutoff, 0 unreachable."
- The shortlist is the surface where TRI-08 is *demonstrated*: sliding the cutoff
  visibly re-shuffles who is eligible, before any scan budget is spent.
- Gate semantics: unreachable and no-HTTPS are not "a high score" — they are an
  automatic top-of-list placement, so they cannot be diluted by a fast, light,
  otherwise-tidy plain-HTTP site.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The bulk scan queue, its
concurrency control, and per-site scan rate-limiting were repeatedly bounded OUT
to Phase 4; contact extraction, draft generation, and send stay in their later
owning phases.

</deferred>

---

*Phase: 3-Triage & Shortlist*
*Context gathered: 2026-07-20*
