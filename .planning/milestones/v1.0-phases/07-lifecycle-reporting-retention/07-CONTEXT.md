# Phase 7: Lifecycle, Reporting & Retention - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Every prospect resolves to a lifecycle state that is computed from events that already
happened, not from bookkeeping anyone has to remember. Joshua opens a reporting surface
and sees how many prospects were imported, triaged, scanned and contacted per day, plus
reply rate and booked calls attributable to outreach. Prospect, prospect-scan and
outreach data past its retention window expires on a schedule, anonymising or deleting by
config, with suppression records structurally exempt.

Nothing sends. The `contacted` and `replied` transitions are fired by Phase 8; this phase
builds the derivation and the counters that read them, and reads an explicit
"not yet sending" state until Phase 8 lands. The send channel is still undecided.

Out of scope: any change to how prospects are imported, triaged, scanned, or drafted.
This phase adds a derivation, a reporting surface, one webhook extension and one
scheduled job. It does not add writes to Phase 1 through 6 code paths.

</domain>

<decisions>
## Implementation Decisions

### Locked by ROADMAP / PROJECT / prior phases (do not re-litigate)
- **D-7-R1: Reply rate and booked-call figures read empty until Phase 8.** By design.
  Phase 7 builds the state machine, the transitions that already have events, and the
  counters. Phase 8 calls the hooks.
- **D-7-R2: TRK-01/02 must not overwrite `lifecycle_state = 'rejected'`.** Carried
  forward from Phase 6 (STATE.md note, D-6-15). D-7-01 makes this structurally
  impossible rather than a rule someone has to follow.
- **D-7-R3: CMP-13's 12-month window is a placeholder pending the LIA, not a legal fact.** It is config (CMP-14), so counsel's answer changes a value, not code.
- **D-7-R4: Scale is 10 to 50 prospects per week.** Solutions sized for thousands are
  rejected on sight (PROJECT.md Constraints).
- **D-7-R5: Nothing in this phase may put the existing public scanner's email or scanning at risk** (PROJECT.md blast radius). Two decisions below, D-7-09 and D-7-16, exist specifically to hold this line.

### Lifecycle state machine (TRK-01, TRK-02)
- **D-7-01: Lifecycle state is derived, never written.** A pure
  `deriveLifecycleState()` reads the markers that already carry the truth:
  `prospects.lifecycle_state` (terminals only), `triage_checked_at`,
  `scan_released_at`, `scan_status`, `contact_email`, `booked_at`, and the owning
  `outreach_messages.status`. No migration for lifecycle, no backfill of the ~800 rows
  sitting at `'new'`, and no write added to any Phase 1 through 6 code path. It cannot
  drift, because there is nothing to keep in sync. This is also what makes D-7-R2
  structural: Phase 7 never writes `lifecycle_state`, so `'rejected'` cannot be swept
  away by a generic status advance.
  — **Reversibility:** reversible — the derivation is one module with one caller
  surface; switching to a stored column later means adding writes, not undoing any.
- **D-7-02: The derivation returns the fine-grained state; the funnel groups it.**
  Fine: `new`, `no_website`, `triaged`, `qualified`, `scan_queued`, `scanned`,
  `drafted`, `approved`, `contacted`, `replied`, `booked`, `rejected`. TRK-05 asks how
  many were imported, triaged, scanned and contacted, so the fine state answers the
  per-stage counts directly instead of needing a second set of queries. A grouping maps
  it to the five names TRK-01 uses for the funnel view.
- **D-7-03: It lives in TypeScript, not SQL.** `lib/lifecycle.ts`, a pure predicate
  applied at read time, the same shape as `isReleasable` (Phase 4.1) and
  `lib/triage-eligibility.ts`. No view, no generated column, no DDL. Unit-testable
  without a database. At ~800 rows the aggregate cost is irrelevant.
- **D-7-04: Precedence, stored terminals win, then furthest stage reached.** The stored
  column is read first and only for its terminal values (`rejected`, `no_website`); if
  it holds one, that is the state. Otherwise the derivation returns the furthest marker
  stage.
- **D-7-05: The derivation does not join suppressions.** Suppression is a separate axis:
  per-email, permanent, and a suppressed prospect still has a real funnel position.
  TRK-01 does not name it as a lifecycle state. The `'suppressed'` enum value stays
  unused, as it is today.

### Booking attribution (TRK-04)
- **D-7-06: Match email exact, then fall back to domain.** In the existing Fillout
  webhook: after the leads update, try `prospects.contact_email` exact; on a miss, take
  the domain from the booking email and match `prospects.domain`, screened through
  `isAggregatorDomain()` (`lib/domain-normalize.ts`). Someone booking as
  `jan@praktijkdevries.nl` attributes to the prospect mailed at
  `info@praktijkdevries.nl`. Exact-only would attribute almost nothing, because the
  person booking rarely types the generic address we mailed. No change to the adashi.io
  site or the Fillout form config, both of which are outside this repo.
- **D-7-07: Record `prospects.booked_at` and `prospects.booked_match_method`.** One
  additive migration, same shape as migration 004 did for `leads`. `booked_at` gives
  D-7-01 its `booked` marker; `booked_match_method` (`'email' | 'domain'`) keeps the
  figure auditable so a domain-inferred booking is never silently counted as certain.
  Two columns, no new table, no `prospect_events` log.
  — **Reversibility:** costly — needs a migration to add and another to remove; the
  columns become inputs to D-7-01 and to the reporting queries.
- **D-7-08: Attribute only after contact, and only once.** A booking attributes to a
  prospect only if that prospect has an `outreach_messages` row with status `'sent'`,
  and `booked_at` is written under `.is("booked_at", null)`, the same first-write-wins
  guard the leads update already uses at `app/api/webhooks/fillout/route.ts:50`. Until
  Phase 8 sends anything this reads honest zero, rather than crediting outreach for
  inbound public-scanner bookings.
- **D-7-09: Leads first, prospects after, in a try/catch.** The existing leads update
  runs and returns exactly as it does today; prospect attribution runs after it, wrapped
  so a failure logs and still returns 200. A broken attribution query can never stop a
  lead being marked booked, and can never make Fillout retry a submission that already
  landed. This is D-7-R5 applied to the webhook.

### Reporting (TRK-03, TRK-05)
- **D-7-10: A "run" is a calendar day, derived from timestamps.** Group
  `prospects.created_at` (imported), `triage_checked_at` (triaged), `scan_released_at`
  (released), `scans.created_at` (scanned) and `outreach_messages.sent_at` (contacted)
  by day. No `runs` table, no `run_id` stamped anywhere, no writes added to prior
  phases, the same reasoning as D-7-01. Vercel forces the crons to daily anyway
  (`drain-scan-queue` at 07:00), so a day genuinely is a run for triage release and scan
  drain; only the manual import is off-grain, and at this volume a day is finer than
  needed.
- **D-7-11: The numbers live on a 5th admin tab.** Follows the D-6-01 precedent set when
  Outreach became the 4th tab: same `secret`-header auth, same fetch and pagination
  pattern, no rework of an existing tab. Add the new value to the `Tab` union at
  `app/admin/page.tsx:58`.
- **D-7-12: Default view is the current funnel plus a 30-day per-day table.** Top: where
  every prospect stands now, using the five-state grouping from D-7-02. Below: per-day
  imported / triaged / scanned / contacted, plus reply rate and booked. Thirty days
  covers roughly 40 to 200 prospects at the stated volume, so the table stays readable
  without paging.
- **D-7-13: Figures that depend on a Phase 8 signal render an explicit "not yet sending" state, not 0%.** A literal 0% reply rate is a number that looks like a result and is
  actually an absence, the same failure mode as the Phase 6 health endpoint reporting a
  stale `false`. Once the first send lands, the real number takes over on its own.
- **D-7-14: The fine-grained state shows as a column on the existing Shortlist tab.**
  Shortlist already lists prospects row by row with pills (NAMED-PERSON, CRITICAL). A
  lifecycle column answers "which stage is this one stuck at" where Joshua is already
  looking at individual prospects, and costs one column rather than a second list. The
  reporting tab stays aggregate.

### Retention (CMP-13, CMP-14, CMP-15)
- **D-7-15: The clock is the most recent of contact, scan, or import.** Coalesce down:
  last sent message, then last scan, then `created_at`. Every prospect has `created_at`,
  so nothing is ever undated and nothing sits forever because a field was null. One
  expression, one config value; counsel's LIA answer changes a single number.
  **Known tradeoff, recorded deliberately:** a scraped prospect never used arguably has
  a weaker basis than one actively corresponded with, so a shorter window for the
  untouched pile is defensible. That becomes a second constant if counsel asks for it,
  not now.
- **D-7-16: Scope is prospect-owned rows only.** `prospects`, their
  `outreach_messages`, and `scans WHERE prospect_id IS NOT NULL`. Public-scanner scans
  and the `leads` table are explicitly out of scope, and the `NOT NULL` filter is what
  proves it in the query rather than in a comment. D-7-R5 applied to the job: a bug here
  cannot delete the data the earning product runs on.
  — **Reversibility:** one-way — this job deletes or anonymises production rows. A wrong
  scope or a wrong window is not undoable from the application; D-7-18's dry-run mode is
  the mitigation.
- **D-7-17: Anonymise is the default; delete is the alternative; both by config.** Clear
  `name`, `domain`, `website_url`, `contact_email` and the draft body; keep the row, its
  timestamps, its scores and its lifecycle markers. The personal data is gone and the
  funnel history TRK-05 is built on in this same phase survives. Delete-by-default would
  quietly destroy that reporting a few months in. `RETENTION_MODE` env var read through a
  `lib/retention-constants.ts`, matching the `lib/triage-constants.ts` and
  `lib/bulk-scan-constants.ts` pattern.
- **D-7-18: `RETENTION_MODE` carries a third value, dry run.** Reports exactly which
  rows it would have touched, changes nothing. Cheap, because the selection query is
  identical either way, and it is what catches an off-by-one in D-7-15's clock
  expression before it anonymises 800 rows. Ship in dry-run, read one run's output, then
  flip it.
- **D-7-19: CMP-15 is enforced structurally and by a test, not by a comment.** The job
  carries an explicit allowlist of the tables it may touch; `suppressions` is absent from
  it, with a named comment saying why it can never be added. Backed by an integration
  test that seeds a suppression older than the window, runs the job, and asserts the row
  survives. A comment tells the next person; the test stops them. Note that anonymising
  a prospect does not weaken suppression: `suppressions` keys on the email
  independently, so the send-time check in Phase 8 still catches a re-imported business.
- **D-7-20: A dedicated monthly cron route, `/api/cron/retention`.** Data expiry does not
  need day resolution, and a monthly run keeps the blast radius of a first version small.
  Not folded into an existing cron: a retention failure must not be able to take out the
  scan drain.
  **Open for research:** `vercel.json` already carries four crons and this project is on
  Vercel Hobby. Whether a fifth cron is permitted, and whether Hobby accepts a
  monthly schedule string, must be confirmed before planning commits to it. If a fifth
  cron is not available, the fallback is a manually-invoked script, not folding it into
  an existing route.

### Claude's Discretion
- How the aggregate counts are computed given D-7-03 (pull rows and count in TypeScript
  vs per-stage SQL counts). At ~800 rows either is fine; follow whatever the existing
  `app/api/admin/*` routes already do.
- The exact visual treatment of the funnel on the new tab.
- Naming of the 5th tab and of the new module files.
- The precise field list anonymised by D-7-17, beyond the identifiers named there.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` § "Phase 7: Lifecycle, Reporting & Retention": goal, success
  criteria, and the four Notes, including the CMP-15 trap and the honest-dependency note
  on Phase 8
- `.planning/REQUIREMENTS.md` lines 87 to 89 and 105 to 109: verbatim text of
  CMP-13/14/15 and TRK-01..05
- `.planning/PROJECT.md` § Constraints: scale (10 to 50 per week), blast radius,
  tech-stack ceiling, geography as a parameter
- `.planning/STATE.md`: carries the Phase 6 warning that TRK-01/02 must not overwrite
  `lifecycle_state = 'rejected'`

### Schema the derivation reads
- `supabase/migrations/010_create_prospects.sql` lines 23 to 26: the 13-value
  `lifecycle_state` check constraint, and line 42's index on it
- `supabase/migrations/016_add_scan_release_marker.sql` lines 1 to 8: `scan_released_at`,
  and the explicit statement that triage never touches `lifecycle_state` (D-07/D-08)
- `supabase/migrations/017_add_scan_status.sql` lines 12 to 17 and 45 to 53:
  `scan_status`, `scan_attempts`, and the comment recording that the lifecycle enum
  values "are never written anywhere in this codebase"
- `supabase/migrations/012_create_outreach_messages.sql` lines 10 to 16: the status enum
  (`draft | edited | approved | rejected | sent`) plus `approved_at` and `sent_at`
- `supabase/migrations/013_add_prospect_id_to_scans.sql`: `scans.prospect_id`, the
  column that draws D-7-16's scope line
- `supabase/migrations/014_create_suppressions.sql` lines 4 to 30: the permanent,
  no-expiry table CMP-15 protects
- `supabase/migrations/004_add_booked_at.sql`: the shape D-7-07's migration mirrors

### Code the phase touches or reuses
- `app/api/webhooks/fillout/route.ts`: the webhook D-7-06/08/09 extend; line 50 is the
  first-write-wins guard being copied
- `lib/outreach-queue.ts:274`: the only production writer of `lifecycle_state` in the
  repo, and the one D-7-01 must not disturb
- `lib/prospect-upsert.ts:127`: where `'new'` and `'no_website'` are set at import
- `lib/domain-normalize.ts`: `normalizeDomain()`, `AGGREGATOR_DOMAINS`,
  `isAggregatorDomain()`, used by D-7-06's domain fallback
- `lib/triage-eligibility.ts`, `lib/triage-release.ts`: the derived-predicate pattern
  D-7-03 follows
- `lib/triage-constants.ts`, `lib/bulk-scan-constants.ts`: the config pattern D-7-17
  follows
- `app/admin/page.tsx:58`: the `Tab` union D-7-11 extends; `ShortlistTab` at line 474 is
  where D-7-14's column goes
- `vercel.json`: the four existing crons, relevant to D-7-20's open question

### Prior-phase context that binds
- `.planning/phases/06-draft-generation-approval-queue/06-CONTEXT.md`: D-6-01 (the
  4th-tab precedent D-7-11 follows), D-6-15 (the `'rejected'` reuse D-7-04 protects)
- `.planning/phases/06-draft-generation-approval-queue/06-SECURITY.md`: flags the
  attestation-only mitigation pattern; relevant to how D-7-19's test is written

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isAggregatorDomain()` and `normalizeDomain()` (`lib/domain-normalize.ts`): D-7-06's
  domain fallback screens through these rather than writing a second denylist. Note the
  false-positive risk is low by construction, because prospects are businesses with their
  own website domains, so a booking from a free-mail address matches nothing.
- `scans.prospect_id` (migration 013): already links every prospect scan to its prospect
  and every public-scanner scan is NULL. This is what lets D-7-16 draw its scope line in
  a query rather than a convention.
- The `secret`-header admin auth, fetch and pagination pattern in `app/admin/page.tsx`:
  D-7-11's tab reuses it wholesale, as the Outreach tab did.
- `.is("booked_at", null)` at `app/api/webhooks/fillout/route.ts:50`: the exact
  first-write-wins idiom D-7-08 copies for prospects.

### Established Patterns
- **Purpose-built markers over a status column.** Every phase so far expressed state as a
  dedicated column (`scan_released_at`, `scan_status`, `triage_checked_at`,
  `outreach_messages.status`), and migrations 016 and 017 both carry comments explicitly
  declining to write `lifecycle_state`. D-7-01 continues that convention rather than
  reversing it.
- **Derived rules live as pure TypeScript predicates in `lib/`.** `isReleasable`
  (Phase 4.1) and `lib/triage-eligibility.ts` are the precedent for D-7-03.
- **Config as constants modules plus env vars.** `lib/triage-constants.ts` and
  `lib/bulk-scan-constants.ts` are the shape D-7-17's `lib/retention-constants.ts`
  takes. There is no config table and no runtime settings UI.
- **Additive, re-runnable migrations.** Every migration since 013 states in its header
  comment that it reads and writes no existing row. D-7-07's migration follows.
- **Fire-and-forget side effects wrapped so the primary path cannot fail.** The
  scan-complete webhook already works this way; D-7-09 applies it to Fillout.

### Integration Points
- `app/api/webhooks/fillout/route.ts`: one extension after the existing leads update.
- `app/admin/page.tsx`: one new tab (D-7-11) and one new column on `ShortlistTab`
  (D-7-14).
- A new admin API route under `app/api/admin/` for the funnel and per-day aggregates.
- A new cron route `/api/cron/retention` plus a `vercel.json` entry (D-7-20, pending the
  cron-limit check).
- New modules: `lib/lifecycle.ts`, `lib/retention-constants.ts`, and the retention job
  itself.
- One migration (`019`) adding `prospects.booked_at` and `prospects.booked_match_method`.
  This phase authors no other DDL.

### Known repo hazards (from the working tree, not from this phase)
- Two stale agent worktrees under `.claude/worktrees/` (`epic-mcclintock-57c9ce`,
  `beautiful-rosalind-b64012`) duplicate every source file and pollute repo-wide greps.
  Exclude them when searching.
- Run tests with `npx vitest run` (348/348 as of Phase 6). `npm test` ran files in
  parallel against one Postgres and produced false failures until `56e06a0` serialized
  them.

</code_context>

<specifics>
## Specific Ideas

- The framing that settled three of the four areas: **prefer deriving over storing**.
  It was chosen for lifecycle (D-7-01) and then applied again to runs (D-7-10) for the
  same reason. A derived value cannot disagree with the markers beside it, and adding
  writes to five prior-phase code paths is the failure mode both decisions exist to
  avoid. Downstream agents should treat "add a column and write it at each transition"
  as the rejected option in this phase, not the default.
- **Honest absence over a plausible zero** (D-7-13). Named against the Phase 6 precedent
  where a statically-prerendered `/api/health` reported a stale `GEMINI_API_KEY: false`
  and looked like a fact.
- **A test, not a comment, is what makes a rule non-silent** (D-7-19). The roadmap calls
  CMP-15 the trap of this phase; the mitigation is deliberately not attestation-shaped,
  which `06-SECURITY.md` flagged as a weakness in Phase 6.

</specifics>

<deferred>
## Deferred Ideas

- **A shorter retention window for never-contacted prospects.** Defensible under data
  minimisation, and explicitly not built now (D-7-15). Revisit when counsel returns the
  LIA. At that point it is a second constant beside the first, not a redesign.
- **A `prospect_events` append-only log** (considered and rejected for D-7-07). It is the
  shape Phase 8's reply signal would want too. If Phase 8 needs more than one more
  timestamp column, that is the moment to reconsider it, not now at 10 to 50 per week.
- **Token-carrying report links for exact booking attribution** (considered and rejected
  for D-7-06). Requires changes to the adashi.io site and the Fillout form config, both
  outside this repo, and only attributes people who arrive via the report link. Revisit
  if domain-fallback attribution proves too lossy once real sends start in Phase 8.
- **Dutch report locale.** The report page serves English to Dutch prospects regardless
  of `Accept-Language`. Reproduced against real production data in the Phase 6 session,
  scoped out of Phase 6 deliberately, and running as a separate task. Pre-existing code
  this phase does not touch. Must land before Phase 8 sends anything.
- **Prompt-injection gate at volume (T-06-PI).** Currently rests solely on human review
  of every draft. Fine at three drafts a week, weak at volume. Belongs in Phase 8's
  threat model.
- **Scan throughput investigation.** Ceiling is roughly 10 per day and 70 per week; the
  design target is 10 to 50 per week, so capacity is not short. The open suspicion is
  that the triage release ceiling in `lib/triage-release.ts` starves batches rather than
  the scanner being the constraint. Not measured, not urgent.

### Reviewed Todos (not folded)
- **`2026-07-24-random-import-from-target-categories.md`**: "Add random import mode:
  TARGET_CATEGORIES and TARGET_REGIONS sampling". Matched this phase at 0.9 on generic
  keywords (prospects, phase, every) rather than on lifecycle, reporting or retention.
  It is import/triage scope. Left in the backlog deliberately.

</deferred>

---

*Phase: 7-Lifecycle, Reporting & Retention*
*Context gathered: 2026-07-31*
