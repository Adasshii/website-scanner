# Phase 7: Lifecycle, Reporting & Retention - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-07-31
**Phase:** 7-Lifecycle, Reporting & Retention
**Areas discussed:** Lifecycle source of truth, Booking attribution, Reporting (run scope and surface), Retention semantics

---

## Lifecycle source of truth

### Where does a prospect's lifecycle state actually live?

| Option | Description | Selected |
|--------|-------------|----------|
| Derived from existing markers | One `deriveLifecycleState()` reads scan_released_at, scan_status, triage_checked_at, contact_email, outreach_messages.status. Column keeps only terminals. No migration, no backfill, no writes added to Phases 1 through 6. | ✓ |
| Stored column, dual-written | lifecycle_state becomes authoritative; add a write at each transition in triage release, scan drain, contact extraction and draft generation, plus a backfill for the ~800 rows at 'new'. | |
| Stored column, backfill only | Backfill once, then write forward only at Phase 7/8 transitions. Goes stale the moment a scan drains without a matching write. | |

**User's choice:** Derived from existing markers
**Notes:** Scouting found the column is effectively a ghost: 13 enum values, three ever written (`'new'` and `'no_website'` at `lib/prospect-upsert.ts:127`, `'rejected'` at `lib/outreach-queue.ts:274`). Migrations 016 and 017 both carry comments explicitly declining to write it. Deriving continues that convention rather than reversing it, and makes the STATE.md warning about `'rejected'` structurally impossible to violate.

### How many states does the derivation return?

| Option | Description | Selected |
|--------|-------------|----------|
| Fine-grained, grouped for display | Twelve states derived; grouped to the five TRK-01 names for the funnel. Answers TRK-05's per-stage counts directly. | ✓ |
| Five states only | Return exactly what TRK-01 names. Per-stage counts then need separate marker queries. | |

**User's choice:** Fine-grained, grouped for display

### Where does the derivation run?

| Option | Description | Selected |
|--------|-------------|----------|
| TypeScript predicate in lib/ | Pure function in `lib/lifecycle.ts`, applied at read time. Same shape as `isReleasable` and `lib/triage-eligibility.ts`. No DDL. | ✓ |
| Postgres view or generated column | Filterable and countable server-side; logic then lives in SQL apart from the TypeScript predicates it must agree with. | |

**User's choice:** TypeScript predicate in lib/

### When markers disagree, what wins?

| Option | Description | Selected |
|--------|-------------|----------|
| Stored terminal wins, then latest stage | Stored column read first, only for `rejected` and `no_website`; otherwise furthest marker stage reached. | ✓ |
| Latest stage always wins | Purely positional; rejection becomes a separate flag and disappears from funnel counts. | |

**User's choice:** Stored terminal wins, then latest stage

### Does the derived state consult the suppressions table?

| Option | Description | Selected |
|--------|-------------|----------|
| No, suppression is a separate axis | Per-email and permanent; a suppressed prospect still has a real funnel position. TRK-01 does not name it. `'suppressed'` stays unused. | ✓ |
| Yes, suppressed outranks everything | Join suppressions on contact_email; obvious in the admin list, at the cost of a join and of hiding where the prospect actually got to. | |

**User's choice:** No, suppression is a separate axis

---

## Booking attribution

### How does a Fillout booking find its prospect?

| Option | Description | Selected |
|--------|-------------|----------|
| Email exact, then domain fallback | Try `prospects.contact_email` exact; on a miss, match the booking email's domain against `prospects.domain`, screened through `isAggregatorDomain()`. No external config. | ✓ |
| Email exact only | Zero false positives, close to zero true positives. The person booking rarely types the generic address we mailed. | |
| Token through the report link | Exact attribution, but requires changes to the adashi.io site and the Fillout form config, both outside this repo. | |

**User's choice:** Email exact, then domain fallback
**Notes:** Framing correction during discussion. There is no booking form in this repo; `lib/email.ts:72` links to `https://adashi.io/contact`, where the Fillout form lives. That is what rules the token approach out of Phase 7's reach.

### Where does the booked signal get recorded?

| Option | Description | Selected |
|--------|-------------|----------|
| `prospects.booked_at` + `booked_match_method` | One additive migration mirroring migration 004. The method column keeps a domain-inferred booking from being silently counted as certain. | ✓ |
| `prospects.booked_at` only | Smaller; loses the ability to tell an exact match from an inferred one later. | |
| A `prospect_events` table | More general, the shape Phase 8's reply signal would want. Heavier than 10 to 50 per week needs. | |

**User's choice:** `prospects.booked_at` + `booked_match_method`

### What guards against attributing an unrelated booking?

| Option | Description | Selected |
|--------|-------------|----------|
| Only attribute after contact, first write wins | Requires an `outreach_messages` row with status `'sent'`; writes once via `.is("booked_at", null)`. Reads honest zero until Phase 8. | ✓ |
| Attribute any match, no contact requirement | Credits outreach for people who found the public scanner on their own. | |
| Attribute after contact, within a time window | More defensible; one more constant to tune before anyone knows the right number. | |

**User's choice:** Only attribute after contact, first write wins

### How do we keep the prospect lookup from touching the live leads path?

| Option | Description | Selected |
|--------|-------------|----------|
| Leads first, prospects in a try/catch after | Leads update unchanged; attribution failure logs and still returns 200. Cannot stop a lead being marked booked or trigger a Fillout retry. | ✓ |
| One transaction, both or neither | Stronger consistency; couples the working public-scanner path to new outreach code. | |

**User's choice:** Leads first, prospects in a try/catch after

---

## Reporting: what a "run" is, and where it lives

### What is a "run" in TRK-05?

| Option | Description | Selected |
|--------|-------------|----------|
| A calendar day, derived from timestamps | Group five existing timestamps by day. No table, no run_id, no writes added to prior phases. Crons are daily, so a day already is a run. | ✓ |
| A real runs table with a run_id | Exact grouping; costs a table plus four new write sites in Phases 1 through 4. | |
| Rolling windows, no run concept | Simplest; cannot answer "what did yesterday's drain do". | |

**User's choice:** A calendar day, derived from timestamps

### Where do the numbers live?

| Option | Description | Selected |
|--------|-------------|----------|
| A 5th admin tab | Follows the D-6-01 precedent; same auth and fetch pattern, no rework of an existing tab. | ✓ |
| A summary strip on the Scans tab | Visible on open without clicking; per-day breakdown has nowhere to go. | |
| Strip on Scans plus a tab for detail | Best of both, roughly twice the UI work. | |

**User's choice:** A 5th admin tab

### Reply rate and booked calls read zero until Phase 8. How should that read?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit "not yet sending" state | Shows absence rather than rendering 0%. Same failure mode as the Phase 6 health endpoint reporting a stale `false`. | ✓ |
| Plain zeros | Honest arithmetically; reads as "outreach is failing" rather than "outreach has not started". | |

**User's choice:** Explicit "not yet sending" state

### What does the tab show by default?

| Option | Description | Selected |
|--------|-------------|----------|
| Current funnel + last 30 days per-day | Standing five-state funnel on top, per-day imported/triaged/scanned/contacted plus reply rate and booked below. 30 days is roughly 40 to 200 prospects, readable without paging. | ✓ |
| Current funnel only, per-day behind a toggle | Quieter default, one more click to answer "what happened yesterday". | |
| Per-day table only | Least to build; TRK-01's aggregate view then has nowhere to appear. | |

**User's choice:** Current funnel + last 30 days per-day

### Where does the fine-grained state show per-prospect?

| Option | Description | Selected |
|--------|-------------|----------|
| As a column on the Shortlist tab | Beside the existing NAMED-PERSON and CRITICAL pills; one column rather than a second list. Reporting tab stays aggregate. | ✓ |
| Only inside the reporting tab | All lifecycle presentation in one place; cannot see a single prospect's stage while triaging. | |
| Nowhere in the UI, aggregate only | Least UI work; loses the "stuck at scan_queued" debugging value. | |

**User's choice:** As a column on the Shortlist tab

---

## Retention semantics

### What starts the clock for the ~800 prospects never contacted?

| Option | Description | Selected |
|--------|-------------|----------|
| Most recent of contact, scan, or import | Coalesce down to `created_at`, so nothing is ever undated. One expression, one config value. | ✓ |
| Two windows: contacted and never-contacted | More defensible under minimisation; two config values and two code paths to tune blind. | |
| Import date only, ignore later activity | Simplest; expires an actively-corresponding prospect mid-conversation. | |

**User's choice:** Most recent of contact, scan, or import
**Notes:** The tradeoff was raised explicitly and accepted. A scraped prospect never used arguably has a weaker basis than one corresponded with. A shorter window for the untouched pile becomes a second constant if counsel asks for it after the LIA, not now.

### What does the job touch?

| Option | Description | Selected |
|--------|-------------|----------|
| Prospect-owned rows only | `prospects`, their `outreach_messages`, and `scans WHERE prospect_id IS NOT NULL`. The NOT NULL filter proves the scope in the query. | ✓ |
| All scans and leads too | One policy across the database; points a scheduled delete at the earning product's data. | |

**User's choice:** Prospect-owned rows only

### Delete or anonymise as the default?

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymise by default, null the identifiers, keep the row | Personal data gone, funnel history TRK-05 is built on survives. `RETENTION_MODE` via `lib/retention-constants.ts`. | ✓ |
| Delete by default, row removed | Strongest minimisation posture; costs the historical counts and makes an over-eager window a permanent loss. | |

**User's choice:** Anonymise by default

### How is the CMP-15 suppression exemption enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| Structural, plus a test that fails if it breaks | Explicit table allowlist without `suppressions`, plus an integration test that seeds an old suppression and asserts it survives. | ✓ |
| Comment and config default only | Satisfies the literal wording; nothing fails if someone changes the default a year from now. | |

**User's choice:** Structural, plus a test that fails if it breaks
**Notes:** Chosen against the attestation-only mitigation pattern that `06-SECURITY.md` flagged as a weakness in Phase 6.

### Does the first production run need a rehearsal?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, a dry-run mode that logs and changes nothing | Third `RETENTION_MODE` value. Cheap, since the selection query is identical either way. | ✓ |
| No, ship it live | One fewer mode to build and remember to switch off. | |

**User's choice:** Yes, a dry-run mode

### How often does the job run?

| Option | Description | Selected |
|--------|-------------|----------|
| Monthly, dedicated cron route | `/api/cron/retention`. Expiry does not need day resolution; keeps a first version's blast radius small. | ✓ |
| Daily, dedicated cron route | Matches every other cron; more runs, more chances for a bad window to do damage first. | |
| Folded into an existing daily cron | Sidesteps the cron-count question; a retention failure could take out the scan drain. | |

**User's choice:** Monthly, dedicated cron route
**Notes:** Flagged as an open research item. `vercel.json` already carries four crons on Vercel Hobby. Whether a fifth is permitted, and whether Hobby accepts a monthly schedule, must be confirmed before planning commits. Stated fallback if not: a manually-invoked script, not folding into an existing route.

---

## Claude's Discretion

- How aggregate counts are computed given the TypeScript derivation (row pull and count in TS vs per-stage SQL counts). Either is fine at ~800 rows; follow the existing `app/api/admin/*` routes.
- Visual treatment of the funnel on the new tab.
- Naming of the 5th tab and the new module files.
- The precise field list anonymised beyond the identifiers named in the decision.

## Deferred Ideas

- A shorter retention window for never-contacted prospects. Revisit when the LIA returns.
- A `prospect_events` append-only log. Reconsider if Phase 8's reply signal needs more than one timestamp column.
- Token-carrying report links for exact booking attribution. Revisit if domain-fallback proves lossy once real sends start.
- Dutch report locale (pre-existing, running as a separate task; must land before Phase 8 sends).
- Prompt-injection gate at volume (T-06-PI). Belongs in Phase 8's threat model.
- Scan throughput investigation. Suspicion is triage release starving batches, not scanner capacity. Not measured, not urgent.

### Reviewed Todos (not folded)

- `2026-07-24-random-import-from-target-categories.md`: "Add random import mode: TARGET_CATEGORIES and TARGET_REGIONS sampling". Matched at 0.9 on generic keywords rather than on lifecycle, reporting or retention. Import/triage scope; left in the backlog.
