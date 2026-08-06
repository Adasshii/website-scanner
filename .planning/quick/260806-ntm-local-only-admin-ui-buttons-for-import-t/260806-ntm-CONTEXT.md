# Quick Task 260806-ntm: Local-only admin UI buttons for import, triage, and drain - Context

**Gathered:** 2026-08-06
**Status:** Ready for planning

<domain>
## Task Boundary

Replace the three CLI entry points Joshua currently runs by hand with buttons on the
local admin dashboard, so the daily prospecting routine happens in the browser instead
of the terminal.

The three actions:

1. **Import prospects** — `scripts/import-prospects.ts`, requires `--country --region
   --category`, optional `--dry-run --limit --campaign-tag`.
2. **Run triage** — `scripts/triage-prospects.ts`, no required flags, optional
   `--dry-run --limit --cutoff`.
3. **Run drain** — the queue drain currently reachable only via
   `app/api/cron/drain-scan-queue/route.ts`, whose 10-minute cadence is not available
   on the Vercel Hobby plan.

Explicitly IN scope: three new admin API routes, a new Pipeline tab, the forms and
buttons, the production guard, and tests for the guard.

Explicitly OUT of scope: changing what the scripts do, changing the scan queue, the
send gate, the outreach path, or anything the public scanner touches. The existing
`scripts/*.ts` files stay runnable from the CLI exactly as they are — this task adds a
second front door, it does not replace the first one.

</domain>

<decisions>
## Implementation Decisions

### Button placement — new "Pipeline" tab

A sixth tab alongside the existing five in `app/admin/page.tsx:61`
(`type Tab = "scans" | "leads" | "shortlist" | "outreach" | "reporting"`), extended
with `"pipeline"`. The three controls sit in pipeline order: Import → Triage → Drain.

Rationale: keeps the local-only tools off the Shortlist tab used daily, and gives the
import form room for its four fields. Follow the existing `TabButton` +
`handleTabChange` pattern already in that file rather than inventing new tab
machinery.

### Production guard — NODE_ENV 404 *and* admin secret

Every one of the three new routes carries two independent locks:

1. `process.env.NODE_ENV !== "development"` returns a bare 404 (no body hinting the
   route exists) before any other work — before body parsing, before the Supabase
   client is constructed, before the secret is even read.
2. The existing `x-admin-secret` header check, matching
   `app/api/admin/run-batch/route.ts:15` verbatim.

Order matters: the env check comes first so a production request never reaches auth
logic at all. Two locks, not one, because the entire blast-radius constraint for this
milestone rests on these routes not existing in production — a single boolean is too
thin a thing to hang that on.

The Pipeline tab itself must also not render outside development, so the buttons are
not visible on the deployed admin page. That is cosmetic defence, not the real guard;
the route-level 404 is the real guard and must hold on its own.

### Progress feedback — stream live progress

Triage runs 10-50 sequential fetches with `BATCH_DELAY_MS` between batches
(`lib/triage-constants.ts`), so a real run goes quiet for minutes. The triage and
import routes stream progress as work completes; the panel shows a running count and
the final summary.

Rationale: a long run and a hung run must not look identical. This is the whole reason
the CLI was tolerable — the terminal showed output. Losing that on the way to the
browser would be a downgrade.

Drain is short enough that a spinner is fine, but it should use the same result-display
component for consistency.

### Dry-run — exposed, on by default

Both Import and Triage render a dry-run checkbox, **checked by default**. Joshua sees
the sample or the summary first, then unchecks to commit.

Rationale: import writes to `prospects`, and category is free text (see below), so a
fat-fingered category on a live run is a real cost. The safe path should be the
default path.

Drain has no dry-run concept and gets no checkbox.

### Import form inputs — dropdowns where a validated list exists, free text where it does not

- **Country**: dropdown driven off `COUNTRY_BBOXES` in `lib/overture-client.ts:53`.
- **Region**: dropdown driven off `REGION_BBOXES` in `lib/overture-client.ts:79`,
  filtered to the selected country by the `"<ISO2>:<region-slug>"` key prefix.
- **Category**: free text. There is no known-good category list in the repo — the value
  is matched exactly against Overture's detected category column
  (`detectCategoryColumn`, `lib/overture-client.ts:144`), which is `categories.primary`,
  `taxonomy.primary`, or `basic_category` depending on the release.
- **Limit** and **campaign tag**: optional free text / number.

Both dropdowns read from the exported bbox tables at render time rather than from a
hardcoded copy, so the UI can never drift from what the importer will actually accept.

**Zero-row results must be loud.** A wrong category returns zero rows with no error,
which is the most likely way this UI wastes Joshua's time. A run that matched nothing
must say so unmistakably, distinct from a run that failed and distinct from a run that
succeeded with writes.

### Claude's Discretion

- Exact component decomposition under `components/admin/` (the existing convention is
  one kebab-case file per control, e.g. `release-button.tsx`, `run-batch-button.tsx`).
- The streaming mechanism (Server-Sent Events, a streamed `ReadableStream` of NDJSON,
  or chunked text) — pick whichever is simplest against Next.js 14 App Router route
  handlers and keeps the client code small.
- How the routes invoke the script logic. Prefer importing the exported functions from
  `scripts/import-prospects.ts` and `scripts/triage-prospects.ts` directly over
  spawning a child process; fall back to a child process only if the scripts' exports
  do not permit clean in-process invocation.
- Error copy and layout details within the Pipeline tab.

</decisions>

<specifics>
## Specific Ideas

- `app/api/admin/run-batch/route.ts` is the reference shape for the new routes: header
  auth, server-owned bounds that the request body may clamp downward but never raise,
  `runtime = "nodejs"`, structured JSON errors, `console.error` with a route-name
  prefix.
- `app/admin/page.tsx:238` already documents the pattern for adding a tab with the same
  secret-header auth and 401 handling. The Pipeline tab should follow it.
- The scripts already parse and validate their args synchronously with zero side
  effects before touching the network or DB (`parseImportArgs`, `parseTriageArgs`, both
  exported and both with existing tests). Reuse that validation rather than
  reimplementing it in the route — a route that hand-rolls its own validation will
  drift from the CLI.

</specifics>

<canonical_refs>
## Canonical References

- `.claude/CLAUDE.md` — project constraints. Two bind directly here: **Blast radius**
  ("nothing in this milestone may put the existing public scanner's email or scanning
  at risk") and **Geography** ("country and locale are parameters, never hardcoded" —
  which is why the dropdowns read from the bbox tables rather than listing NL provinces
  inline).
- `.planning/STATE.md` — Quick Tasks Completed table gets a row for this task.
- `lib/overture-client.ts` — `COUNTRY_BBOXES`, `REGION_BBOXES`, `detectCategoryColumn`.
- `lib/triage-constants.ts` — `BATCH_SIZE`, `BATCH_DELAY_MS`, `DEFAULT_CUTOFF`.
- `lib/bulk-scan-constants.ts` — `BULK_ARM_CEILING`, the server-owned ceiling pattern.

</canonical_refs>
