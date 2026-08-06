---
phase: quick-260806-ntm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/api/admin/pipeline/drain/route.ts
  - app/api/admin/pipeline/triage/route.ts
  - app/api/admin/pipeline/import/route.ts
  - app/api/admin/pipeline/guard.test.ts
  - lib/pipeline-run.ts
  - lib/pipeline-run.test.ts
  - lib/overture-bboxes.ts
  - lib/overture-client.ts
  - scripts/pipeline-runner.ts
  - components/admin/pipeline-tab.tsx
  - components/admin/pipeline-run.tsx
  - components/admin/drain-button.tsx
  - components/admin/triage-form.tsx
  - components/admin/import-form.tsx
  - app/admin/page.tsx
autonomous: true
requirements: [QT-260806-ntm]

estimate:
  tokens: 90000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "In `next dev`, the admin dashboard shows a sixth Pipeline tab holding Import, Triage and Drain controls in that order."
    - "Each of the three new routes returns a bare 404 whenever NODE_ENV is not `development`, before auth and before any Supabase client or child process is created."
    - "A production-NODE_ENV request carrying a WRONG x-admin-secret gets 404, not 401 — proving the env check runs first."
    - "Import and Triage stream live progress while the run is in flight, so a long run never looks like a hung run."
    - "Import and Triage render a dry-run checkbox that is checked by default."
    - "An import that matched zero Overture rows is displayed distinctly from a failed run and from a successful run with writes."
    - "The country and region dropdowns are driven by the same COUNTRY_BBOXES / REGION_BBOXES tables the importer itself resolves against."
    - "`scripts/import-prospects.ts` and `scripts/triage-prospects.ts` are byte-identical to their current contents and still run from the terminal unchanged."
    - "`@duckdb/node-api` never enters the Next.js server bundle."
  artifacts:
    - app/api/admin/pipeline/drain/route.ts
    - app/api/admin/pipeline/triage/route.ts
    - app/api/admin/pipeline/import/route.ts
    - app/api/admin/pipeline/guard.test.ts
    - lib/pipeline-run.ts
    - lib/overture-bboxes.ts
    - scripts/pipeline-runner.ts
    - components/admin/pipeline-tab.tsx
    - components/admin/pipeline-run.tsx
    - components/admin/import-form.tsx
    - components/admin/triage-form.tsx
    - components/admin/drain-button.tsx
  key_links:
    - "`scripts/pipeline-runner.ts` -> `parseImportArgs`/`runImport` and `parseTriageArgs`/`runTriage`: the runner is the ONLY validator, so route and CLI can never drift."
    - "`ImportDeps` / `TriageDeps` injection seams -> live progress: the runner wraps the existing seams instead of editing the scripts."
    - "`lib/overture-bboxes.ts` -> both `lib/overture-client.ts` (re-export) and the client dropdowns: one table, two readers, no copy."
    - "Route spawns `node_modules/.bin/tsx` as a child process -> `@duckdb/node-api` stays out of the Next.js webpack graph."
    - "`app/admin/page.tsx` Tab union -> the Pipeline tab render branch, dev-gated for cosmetic defence only."
---

<objective>
Replace three hand-run CLI entry points (import, triage, drain) with buttons on the local
admin dashboard, so the daily prospecting routine happens in the browser instead of the
terminal.

Purpose: the terminal round-trip is the friction in Joshua's daily loop. Moving it into the
dashboard he already has open costs minutes instead of context switches.

Output: a sixth Pipeline tab, three admin routes locked to `next dev` by a route-level 404,
a dev-only NDJSON runner that reuses the scripts' existing exports and injection seams
verbatim, and an automated test proving the production guard holds on all three routes.

Non-negotiable framing: this task adds a SECOND front door. `scripts/import-prospects.ts`
and `scripts/triage-prospects.ts` are not edited. The scan queue, the send gate, the
outreach path and the public scanner are not touched.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.claude/CLAUDE.md
@.planning/quick/260806-ntm-local-only-admin-ui-buttons-for-import-t/260806-ntm-CONTEXT.md

@app/api/admin/run-batch/route.ts
@app/api/cron/drain-scan-queue/route.ts
@app/api/health/route.test.ts
@components/admin/run-batch-button.tsx
@scripts/import-prospects.ts
@scripts/triage-prospects.ts
</context>

<interfaces>

Facts established by reading the codebase. Treat these as given; do not re-derive them.

**The scripts already expose everything needed. Do not edit them.**

`scripts/import-prospects.ts` exports: `ImportArgsError`, `ImportArgs`, `parseImportArgs(argv)`,
`ImportDeps`, `ImportResult`, `runImport(args, deps?)`, `runCli(argv, deps?)`, `pickRandomSample`.
`ImportResult` = `{ totalRows, hasDomainCount, noWebsiteCount, dryRun, created, collapsed, skipped }`.
`ImportDeps` = `{ queryOverturePlaces, upsertOverturePlace, createServerClient, validateUrlSafe,
fetchReachability }`. The module-level `defaultDeps` object and `defaultFetchReachability` are NOT
exported.

`scripts/triage-prospects.ts` exports: `TriageArgsError`, `TriageArgs`, `parseTriageArgs(argv)`,
`TriageDeps`, `TriageResult`, `runTriage(args, deps?)`, `runCli(argv, deps?)`.
`TriageResult` = `{ totalRows, triaged, clearsCutoff, unreachable, skipped, dryRun }`.
`TriageDeps` = `{ getTriageCandidates, validateUrlSafe, fetchTriageSignals, computeTriageScore,
createServerClient }` — every one of those five is exported from its own lib module, so the runner
can wrap any of them with zero duplication.

Both scripts guard their CLI entrypoint with `if (require.main === module)`, so importing them from
another Node process has no side effects.

**The blocking constraint that shapes the whole design.**

`lib/overture-client.ts` line 1 is `import { DuckDBInstance } from "@duckdb/node-api"`.
`node_modules/@duckdb` is 109 MB and ships a native `duckdb.node` binary. Nothing in the Next.js
app graph imports `lib/overture-client.ts` today — the only importers are
`scripts/import-prospects.ts` and `lib/overture-client.test.ts`. A route that imports the import
script (directly or via `await import()`) would drag that 109 MB native package into the Next
server bundle and the Vercel function trace for the first time. That is a direct hit on the Blast
radius constraint in `.claude/CLAUDE.md`.

This is why the routes spawn a child process rather than calling the script exports in-process.
CONTEXT.md permits exactly this fallback ("fall back to a child process only if the scripts'
exports do not permit clean in-process invocation"); the reason is the native dependency, not the
exports.

**Auth shape to copy verbatim** (`app/api/admin/run-batch/route.ts:14-17`):

`const secret = request.headers.get("x-admin-secret");` then
`if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) return 401 {error:"Unauthorized"}`.
Kept literal per handler, never factored into a shared helper — that is the standing project
convention (Phase 06-06 decision, mirroring the grep-gated shortlist route).

**Admin page integration points** (`app/admin/page.tsx`):

- Line 61: `type Tab = "scans" | "leads" | "shortlist" | "outreach" | "reporting";`
- Line 65: `const [secret, setSecret] = useState("")` — the secret is passed to child controls as a
  prop (see `ReleaseButton`, `RunBatchButton` at lines 558-559).
- Lines 273-284: the `useEffect` that dispatches per-tab fetches.
- Line 291: `handleTabChange(t: Tab)`.
- Lines 413-445: the `TabButton` list.
- Lines 448-467: the `tab === "x" ? <X/> : ...` render ladder.
- Line 565: `TabButton` component definition.
- The file is a client component. `process.env.NODE_ENV` is statically inlined by Next in client
  bundles, so `process.env.NODE_ENV === "development"` is a valid render gate with no new env var.

**Test environment facts**

- `npm run test` is `vitest run`. Vitest sets `NODE_ENV=test` by default, so the three new routes
  return 404 in tests unless `NODE_ENV` is explicitly stubbed to `"development"`.
- `vi.stubEnv("NODE_ENV", ...)` is supported in vitest 4 and is the mechanism to use.
- Route-module unit tests already exist and work in the `unit` project (`app/api/health/route.test.ts`).
- The `unit` vitest project runs `environment: "node"` and collects `**/*.test.ts` outside the
  `*.integration.test.ts` and `*.test.tsx` globs.

**Zero new packages.** Everything used here (`node:child_process`, `node:path`, `tsx`) is already a
dependency. No package legitimacy gate is required.

</interfaces>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Drain button end-to-end — the production guard, proven</name>
  <files>
    app/api/admin/pipeline/guard.test.ts,
    lib/pipeline-run.ts,
    app/api/admin/pipeline/drain/route.ts,
    components/admin/pipeline-run.tsx,
    components/admin/drain-button.tsx,
    components/admin/pipeline-tab.tsx,
    app/admin/page.tsx
  </files>
  <behavior>
    `app/api/admin/pipeline/guard.test.ts` is written FIRST and must fail before the route exists.
    It is table-driven over a `ROUTES` array so Tasks 2 and 3 add one entry each. Task 1's array
    holds one entry: the drain route.

    - Test 1: `NODE_ENV` stubbed to `"production"`, `ADMIN_SECRET` stubbed, request carries the
      CORRECT `x-admin-secret` -> status is 404 and the response body is empty (`await res.text()`
      is `""`). Nothing in the body may hint the route exists.
    - Test 2: `NODE_ENV` stubbed to `"production"`, request carries a WRONG `x-admin-secret` ->
      status is 404, NOT 401. This is the observable proof that the env check runs before auth.
    - Test 3: `NODE_ENV` left at vitest's default `"test"` -> status is 404. Proves the check is
      `!== "development"`, not `=== "production"`.
    - Test 4: a `vi.mock("@/lib/supabase")` factory whose `createServerClient` is a `vi.fn()`, and a
      `vi.mock("node:child_process")` factory whose `spawn` is a `vi.fn()`. After Tests 1-3 have
      run, both mocks report zero calls. Proves no DB client and no child process is constructed on
      a production-NODE_ENV request.
    - Test 5: `NODE_ENV` stubbed to `"development"`, `ADMIN_SECRET` stubbed, WRONG secret -> status
      is 401. Proves the guard did not simply blanket-404 the route and that auth is still live.
    - Test 6 (structural): read each route file with `readFileSync`, slice from
      `indexOf("export async function POST")` to end, and assert within that handler-body slice
      that `indexOf("NODE_ENV")` is a non-negative number smaller than the index of every marker in
      `["ADMIN_SECRET", "request.json", "createServerClient", "spawn", "acquirePipelineLock"]` that
      is present in the slice. Markers absent from a given route are skipped, not failed.
  </behavior>
  <action>
Write the test file first and watch it fail, then build the route and the UI.

**`lib/pipeline-run.ts`** — create with the run lock only (Task 2 extends this file with the
streaming helper). Export `acquirePipelineLock(): boolean` and `releasePipelineLock(): void`, backed
by a flag stored on `globalThis` under a module-private symbol or a namespaced string key so it
survives Next dev HMR module re-evaluation. `acquirePipelineLock` returns false when a run is
already in flight. One lock shared by all three routes: this is a single-tenant local tool and
serialising every pipeline action is simpler to reason about than per-action locks.

**`app/api/admin/pipeline/drain/route.ts`** — `export const runtime = "nodejs"`, POST handler,
statements in this exact order:

1. `if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 });`
   This is the first statement in the handler body. Nothing precedes it.
2. The `x-admin-secret` check, copied verbatim from `app/api/admin/run-batch/route.ts:14-17`.
3. `if (!acquirePipelineLock()) return NextResponse.json({ error: "A pipeline run is already in
   progress" }, { status: 409 });`
4. Inside `try`/`finally` (the `finally` calls `releasePipelineLock()`): guard on
   `process.env.CRON_SECRET` being set and return a 500 with an explicit "CRON_SECRET is not set in
   this local environment" detail if it is missing — an opaque 401 from the cron route would be a
   confusing failure mode. Then invoke the existing drain by importing its handler
   (`import { GET as drainScanQueue } from "@/app/api/cron/drain-scan-queue/route"`) and calling it
   with a `new NextRequest` carrying `Authorization: Bearer ${process.env.CRON_SECRET}`. Return the
   drain's JSON body through unchanged.

   Invoking the cron handler rather than re-calling `reconcileInFlightScans` / `claimNextScanBatch` /
   `dispatchClaimedProspects` is deliberate: that route's reconcile-before-claim ordering is
   load-bearing (SCAN-03) and duplicating it here would create a drift hazard in scan queue
   semantics, which this task is explicitly forbidden from touching.
5. `catch` logs with a `[admin/pipeline/drain]` prefix and returns a structured 500.

AUTHORING RULE that Test 6 depends on: no comment inside the POST handler body may mention
`ADMIN_SECRET`, `createServerClient`, `spawn`, `acquirePipelineLock` or `request.json` above the
NODE_ENV guard. Put every explanatory comment above the `export async function POST` signature,
where the structural slice does not reach.

**`components/admin/pipeline-run.tsx`** — the shared run-state layer, used by all three controls.
Export a `PipelineRunPanel` component and a `usePipelineRun` hook. For Task 1 the hook only needs
the plain-JSON path: POST to a given path with the `x-admin-secret` header, hold
`status: "idle" | "running" | "done" | "failed"`, a log line array, and a final outcome. Task 2
extends the hook with NDJSON stream reading. `PipelineRunPanel` renders three visually distinct
tones from a `{ tone: "ok" | "empty" | "error", headline, lines }` shape — `empty` is a loud amber
state, not a muted one, because a run that did nothing must never read as a run that succeeded.

**`components/admin/drain-button.tsx`** — accent-blue button matching `RunBatchButton`'s classes
(`bg-adashi-blue hover:bg-adashi-science ...`), takes `secret` as a prop, POSTs to
`/api/admin/pipeline/drain`, disabled while running. Maps the drain response to the panel shape:
`claimed === 0` is the `empty` tone with a headline saying nothing was queued, a non-2xx or a thrown
fetch is `error`, anything else is `ok` listing reconciled / claimed / dispatched / refused /
skipped.

**`components/admin/pipeline-tab.tsx`** — the tab body. Takes `secret` as a prop. Lays the controls
out in pipeline order Import -> Triage -> Drain, each in its own bordered card with a short
one-line description. Task 1 renders only the Drain card plus two placeholder cards that Tasks 2
and 3 replace. Header copy states plainly that these controls exist only on the local development
server.

**`app/admin/page.tsx`** — four scoped edits, nothing else:
1. Line 61: extend the `Tab` union with `| "pipeline"`.
2. Add a sixth `TabButton` labelled "Pipeline" after "Reporting" in the tab list (lines 413-445),
   wrapped in `{process.env.NODE_ENV === "development" && (...)}`.
3. Add a `tab === "pipeline" ? <PipelineTab secret={secret} /> : ...` branch to the render ladder
   at lines 448-467, before the default table branch.
4. In the `useEffect` at lines 273-284, add `pipeline` to the set of tabs that do NOT call
   `fetchData(tab, page)` — the Pipeline tab has no list to load, and letting it fall through to
   `fetchData` would fire a pointless `/api/admin/stats?tab=pipeline` request.

The dev gate on the tab button is cosmetic defence only. The route-level 404 is the real guard and
must hold on its own; say so in a comment at the gate so nobody later mistakes it for the security
boundary.
  </action>
  <verify>
    <automated>cd "/Users/annan/Developer/Claude code/projects/website-scanner" && npx vitest run app/api/admin/pipeline/guard.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    The guard test fails before the drain route exists and passes after. A production-NODE_ENV
    request with a wrong secret gets 404 rather than 401; the same request in development gets 401.
    The Supabase and child_process mocks report zero calls across all production-NODE_ENV cases.
    `tsc --noEmit` is clean. The Pipeline tab renders in `next dev` with a working Drain button.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: The NDJSON runner and the Triage form with live progress</name>
  <files>
    scripts/pipeline-runner.ts,
    lib/pipeline-run.ts,
    lib/pipeline-run.test.ts,
    app/api/admin/pipeline/triage/route.ts,
    components/admin/triage-form.tsx,
    components/admin/pipeline-run.tsx,
    components/admin/pipeline-tab.tsx,
    app/api/admin/pipeline/guard.test.ts
  </files>
  <behavior>
    `lib/pipeline-run.test.ts` covers the line splitter that turns a chunked byte stream into whole
    NDJSON lines, written before the implementation:
    - A payload delivered in one chunk yields every line exactly once.
    - The same payload split mid-JSON-object across two chunks yields identical lines, proving no
      object is ever emitted half-parsed.
    - A trailing fragment with no newline is flushed exactly once at stream end, not dropped and not
      duplicated.
    - A non-JSON line (the scripts' own `console.log` output) passes through untouched for the
      client to classify.

    `app/api/admin/pipeline/guard.test.ts` gains the triage route as a second `ROUTES` entry. All
    six existing assertions run against it unchanged.
  </behavior>
  <action>
**`scripts/pipeline-runner.ts`** — a new file. This does NOT modify either existing script; it is a
third CLI that imports their exported functions.

Shape: `argv[2]` selects the mode (`triage` for this task, `import` added in Task 3); everything
after it is passed straight to the matching `parseXArgs`. The runner never validates anything
itself — `parseTriageArgs` is the single validator, which is what keeps the button and the terminal
from drifting.

Emit NDJSON on stdout, one JSON object per line, via `process.stdout.write(JSON.stringify(e) + "\n")`:
- `{ t: "start", total }` once the candidate set is known
- `{ t: "progress", done, total }` per completed unit
- `{ t: "result", mode, result }` carrying the whole typed `TriageResult`
- `{ t: "error", message }` then `process.exit(1)` on any throw, including `TriageArgsError`

Live progress comes from wrapping the EXISTING `TriageDeps` injection seam — that seam is the
designed extension point, and using it means zero edits to `scripts/triage-prospects.ts`:

- `getTriageCandidates`: call the real one from `@/lib/triage-candidates`, emit `start` with
  `rows.length`, return the rows unchanged.
- `fetchTriageSignals`: call the real one from `@/lib/triage-fetch`, increment a counter in a
  `finally` so failures still advance the bar, emit `progress`, return unchanged.
- `validateUrlSafe`, `computeTriageScore`, `createServerClient`: pass through untouched.

Note in a comment that a prospect with a null `website_url` throws before `fetchTriageSignals` and
so does not advance the counter — the `result` event, not the counter, is the authoritative tally.

Mirror the scripts' `loadLocalEnv()` helper (two `process.loadEnvFile` calls in try/catch over
`.env.local` and `.env`) so the runner also works when invoked directly from a terminal, and keep
the same `if (require.main === module)` entrypoint guard.

**`lib/pipeline-run.ts`** — add `streamPipelineRun(mode, args): Response`, joining the lock helpers
already there.

- Spawn with `spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), [runnerPath, mode, ...flags],
  { cwd: process.cwd() })`. Absolute binary path, no PATH lookup, no `npx` round trip.
- `shell: true` is forbidden and the argv must be an array of separate strings — never a
  concatenated command string. That is what makes a free-text `--category=<user input>` value inert:
  no shell ever sees it.
- Return a `ReadableStream` in a `Response` with `Content-Type: application/x-ndjson` and
  `Cache-Control: no-store`. Forward stdout and stderr lines through the splitter verbatim; the
  scripts' own human log lines flow through as-is and the client classifies unparseable lines as log
  output.
- On child `close`, emit a final `{ t: "exit", code }` line and close the stream. The client treats
  "stream ended with no `result` event" as a failure, which is what closes the silent-hang hole.
- Release the lock in the `close` handler.
- If the client disconnects, do NOT kill the child. A half-killed import or triage leaves the DB
  mid-write; letting the run finish is the safer default. The lock therefore stays held until the
  run really ends, which is correct.

**`app/api/admin/pipeline/triage/route.ts`** — same four-step handler order as the drain route
(NODE_ENV 404, then `x-admin-secret` 401, then lock 409, then work), same authoring rule about
comment placement inside the handler body. After the lock, read the JSON body for
`{ dryRun, limit, cutoff }`, translate to the flags `parseTriageArgs` accepts (`--dry-run`,
`--limit=N`, `--cutoff=N`), omitting any field the client left blank, and return
`streamPipelineRun("triage", flags)`. The route performs no validation of its own: an invalid value
reaches `parseTriageArgs` in the child and comes back as an `error` event, exactly as it does in the
terminal.

**`components/admin/pipeline-run.tsx`** — extend `usePipelineRun` with the NDJSON path: read
`res.body.getReader()`, decode with `TextDecoder`, split on newlines, `JSON.parse` each line inside
a try and fall back to treating it as a log line. Keep `{ done, total }` in state for a running
count and a progress bar, append log lines to a capped scrollback (keep the last ~200 lines so a
large run cannot grow the DOM without bound), and resolve the final outcome from the `result` event,
falling back to the `exit` event.

**`components/admin/triage-form.tsx`** — a dry-run checkbox `defaultChecked`, an optional limit
input, and a cutoff input defaulting to `DEFAULT_CUTOFF` from `@/lib/triage-constants`. Submit
button label makes the mode explicit ("Run triage (dry run)" vs "Run triage"), so an unchecked box
cannot go unnoticed. Renders the running count and `PipelineRunPanel` beneath. Result tones:
`error` on an `error`/non-zero-`exit` event, `empty` when `result.totalRows === 0` with a headline
saying no eligible prospects were found, otherwise `ok` listing triaged / clears cutoff /
unreachable / skipped and whether it was a dry run.

Wire the Triage card into `components/admin/pipeline-tab.tsx`, replacing its placeholder.
  </action>
  <verify>
    <automated>cd "/Users/annan/Developer/Claude code/projects/website-scanner" && npx vitest run lib/pipeline-run.test.ts app/api/admin/pipeline/guard.test.ts && npx tsc --noEmit && git diff --quiet -- scripts/triage-prospects.ts scripts/import-prospects.ts && echo "SCRIPTS-UNTOUCHED"</automated>
  </verify>
  <done>
    The splitter tests pass, including the chunk-boundary case. The guard test now covers two routes
    with all six assertions. `tsc --noEmit` is clean. `git diff --quiet` proves both existing scripts
    are byte-identical. In `next dev`, clicking Run triage streams a rising count and finishes with a
    typed summary; a zero-candidate run shows the loud empty state, not a success state.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The Import form — shared bbox tables, dropdowns, and loud zero-row results</name>
  <files>
    lib/overture-bboxes.ts,
    lib/overture-client.ts,
    scripts/pipeline-runner.ts,
    app/api/admin/pipeline/import/route.ts,
    components/admin/import-form.tsx,
    components/admin/pipeline-tab.tsx,
    app/api/admin/pipeline/guard.test.ts
  </files>
  <behavior>
    `app/api/admin/pipeline/guard.test.ts` gains the import route as the third `ROUTES` entry. All
    six assertions run against it unchanged, and the suite's final state is that every one of the
    three new routes is proven to 404 outside development, before auth and before any Supabase
    client or child process is created.

    The existing `lib/overture-client.test.ts` is the regression gate on the bbox extraction: it
    imports `resolveBbox` from `./overture-client` and must keep passing untouched, proving the
    re-export preserves the importer's resolution behaviour exactly.
  </behavior>
  <action>
**`lib/overture-bboxes.ts`** — a new, dependency-free module. Move `Bbox`, `COUNTRY_BBOXES`,
`REGION_BBOXES`, `slugifyRegion` and `resolveBbox` out of `lib/overture-client.ts` into it,
comments and values carried across verbatim. Nothing else moves; `buildPlacesSql`,
`detectCategoryColumn`, `pickProvinceDivisionId` and `queryOverturePlaces` stay where they are.

**`lib/overture-client.ts`** — replace the moved declarations with a re-export
(`export { COUNTRY_BBOXES, REGION_BBOXES, resolveBbox, type Bbox } from "./overture-bboxes";`) and
import `resolveBbox` from the new module for its own internal use. Every existing importer keeps
working against the same specifier.

Why the split: `lib/overture-client.ts` line 1 imports `@duckdb/node-api`, a 109 MB native package.
A client component that imported the bbox tables from there would drag it into the browser bundle.
Extracting the pure data table lets the dropdowns read the exact object the importer resolves
against, which is what CONTEXT.md requires ("read from the exported bbox tables at render time
rather than from a hardcoded copy"), with no way for the two to drift.

**`scripts/pipeline-runner.ts`** — add the `import` mode alongside `triage`. Same NDJSON contract,
same "the script's parser is the only validator" rule: pass the flags straight to
`parseImportArgs`, let `ImportArgsError` surface as an `error` event.

Build the `ImportDeps` object by wrapping the real implementations:
- `queryOverturePlaces` from `@/lib/overture-client`: call it, emit `{ t: "start", total:
  rows.length }` the moment the DuckDB query returns, return the rows unchanged. This is the event
  that matters most — the S3 query is the long silent stretch, and this is the first proof of life.
- `upsertOverturePlace` from `@/lib/prospect-upsert`: call it, increment a counter in a `finally`,
  emit `progress`, return unchanged.
- `createServerClient` and `validateUrlSafe`: pass through untouched.
- `fetchReachability`: `ImportDeps` requires all five fields and the script's own
  `defaultFetchReachability` is not exported, so implement a local HEAD fetch with an
  `AbortController` 5s timeout. It is safe by construction and must be commented as such: the
  script's `checkReachability` always routes the URL through `deps.validateUrlSafe` BEFORE calling
  this, so the SSRF gate (D-11, Pitfall 3, T-01-06) lives in the script and is not weakened here.
  Do not add validation to this helper and do not remove the real `validateUrlSafe` pass-through.

Emit `{ t: "result", mode: "import", result }` with the whole typed `ImportResult`. A dry run's
per-sample lines already reach the browser as log lines through the parse-or-log path, so the dry-run
progress feed matches what the terminal shows today.

**`app/api/admin/pipeline/import/route.ts`** — same four-step handler order and the same authoring
rule about comment placement inside the handler body. After the lock, read
`{ country, region, category, dryRun, limit, campaignTag }` from the body, translate to
`--country=`, `--region=`, `--category=`, `--dry-run`, `--limit=N`, `--campaign-tag=` flags omitting
blanks, and return `streamPipelineRun("import", flags)`. No validation in the route. If the route
needs the `ImportResult` shape for typing, use `import type` only — a value import from
`@/scripts/import-prospects` would pull `@duckdb/node-api` into the Next server bundle and defeat
the whole design.

**`components/admin/import-form.tsx`** — a client component:
- Country: a `<select>` over `Object.keys(COUNTRY_BBOXES)` from `@/lib/overture-bboxes`.
- Region: a `<select>` over the `REGION_BBOXES` keys filtered by the `` `${country}:` `` prefix, with
  the slug after the colon as both the option value and its label. Send the slug verbatim —
  `slugifyRegion` is idempotent on an already-slugged value, so it round-trips through
  `resolveBbox` unchanged. The region list re-derives whenever the country changes; clear a stale
  region selection when it does.
- Category: a free-text input. There is no known-good category list in the repo — the value is
  matched exactly against Overture's runtime-detected category column. Put that in the field's help
  text, along with the fact that a wrong string returns zero rows rather than an error.
- Limit and campaign tag: optional inputs.
- Dry run: a checkbox, `defaultChecked`. Submit is disabled until country, region and category are
  all filled, and its label states the mode ("Import (dry run)" vs "Import — writes to prospects").

Result tones, using `PipelineRunPanel`:
- `error` on an `error` event or a non-zero `exit`.
- `empty` when `result.totalRows === 0` — the loud amber state, headline stating that the query
  matched zero places and nothing was written, with the category string echoed back as the most
  likely cause. This is the single most probable way this UI wastes time, so it must be impossible
  to mistake for either a failure or a success.
- `ok` otherwise, listing total rows, with-domain and no-website counts, and on a real run
  created / collapsed / skipped.

Wire the Import card into `components/admin/pipeline-tab.tsx`, replacing its placeholder, and add
the import route to the guard test's `ROUTES` array.
  </action>
  <verify>
    <automated>cd "/Users/annan/Developer/Claude code/projects/website-scanner" && npm run test && npx tsc --noEmit && git diff --quiet -- scripts/triage-prospects.ts scripts/import-prospects.ts && echo "SCRIPTS-UNTOUCHED" && npm run build && ! grep -rqi duckdb .next/server && echo "NO-DUCKDB-IN-SERVER-BUNDLE"</automated>
    <human-check>In `next dev`, open /admin -> Pipeline. Run an import with a deliberately wrong category and confirm the zero-row state is unmistakable. Then run a dry-run import with a real category and confirm sample lines stream in as they complete. Then run triage and confirm the count rises during the run.</human-check>
  </verify>
  <done>
    The full suite passes, including `lib/overture-client.test.ts` unchanged after the extraction.
    All three routes are covered by the guard test. `git diff --quiet` proves both existing scripts
    are byte-identical to their pre-task contents. `npm run build` succeeds and the built server
    output contains no reference to duckdb, proving the 109 MB native package never entered the
    Next.js graph.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> admin route | Free-text `category`, `region`, `limit`, `campaign-tag` cross here from the Pipeline form. |
| route -> child process | Those same values become argv for `node_modules/.bin/tsx`. |
| deployed production -> these routes | The routes exist in the production bundle as files; only the NODE_ENV guard stops them being reachable. |
| runner -> Overture-sourced URL | A `HEAD` request is issued against a third-party-supplied URL during dry-run sampling. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ntm-01 | Elevation of Privilege | all three pipeline routes | critical | mitigate | `process.env.NODE_ENV !== "development"` returns a bare 404 as the first statement of every handler, before auth, body parsing, DB client construction and spawn. Proven by `app/api/admin/pipeline/guard.test.ts` behaviourally (404 not 401 on a wrong secret) and structurally (handler-body source ordering). |
| T-ntm-02 | Elevation of Privilege | all three pipeline routes | high | mitigate | Second independent lock: the `x-admin-secret` / `ADMIN_SECRET` check copied verbatim from `app/api/admin/run-batch/route.ts`. Two locks, because the blast-radius constraint should not hang on a single boolean. |
| T-ntm-03 | Tampering | `streamPipelineRun` argv construction | high | mitigate | `spawn` with an array argv and no `shell: true`, never a concatenated command string. No shell ever interprets the free-text category. Binary resolved by absolute path under `process.cwd()`, not via PATH. |
| T-ntm-04 | Information Disclosure | production 404 response | medium | mitigate | The 404 carries an empty body. No JSON, no error name, nothing that distinguishes "guarded" from "does not exist". Asserted by the guard test. |
| T-ntm-05 | Denial of Service | concurrent pipeline runs | medium | mitigate | One `globalThis`-backed lock shared by all three routes; a second run gets 409 while one is in flight. Prevents a double-click launching two importers against the same DB. |
| T-ntm-06 | Information Disclosure | SSRF via Overture-supplied URL | high | mitigate | Unchanged from today: `checkReachability` in `scripts/import-prospects.ts` routes every URL through the real `validateUrlSafe` before calling `deps.fetchReachability`. The runner passes the real `validateUrlSafe` through untouched and its local HEAD helper adds no bypass. |
| T-ntm-07 | Tampering | Next.js production bundle | high | mitigate | No route imports `@/scripts/import-prospects` or `@/lib/overture-client` as a value; the script runs in a spawned child. Verified by a build-output grep for duckdb in Task 3. Protects the deployed public scanner from a 109 MB native dependency entering its function trace. |
| T-ntm-08 | Tampering | npm/pip/cargo installs | high | mitigate | Not applicable: this task installs zero new packages. `node:child_process`, `node:path` and `tsx` are already present. No `[ASSUMED]`/`[SUS]` package and therefore no legitimacy checkpoint. |
</threat_model>

<source_audit>
## Multi-Source Coverage Audit

| # | Source | Item | Covered by |
|---|--------|------|-----------|
| 1 | CONTEXT (Task Boundary) | Import prospects button | Task 3 |
| 2 | CONTEXT (Task Boundary) | Run triage button | Task 2 |
| 3 | CONTEXT (Task Boundary) | Run drain button | Task 1 |
| 4 | CONTEXT (Button placement) | Sixth "Pipeline" tab, order Import -> Triage -> Drain, existing `TabButton`/`handleTabChange` pattern | Task 1 (tab + ladder), Tasks 2-3 (cards) |
| 5 | CONTEXT (Production guard) | NODE_ENV 404 first, before auth and DB client | Task 1, extended Tasks 2-3 |
| 6 | CONTEXT (Production guard) | `x-admin-secret` check matching run-batch verbatim | Task 1, extended Tasks 2-3 |
| 7 | CONTEXT (Production guard) | Pipeline tab not rendered outside development, flagged as cosmetic | Task 1 |
| 8 | CONTEXT (Progress feedback) | Triage and import stream live progress; running count + final summary | Task 2 (hook, splitter, triage), Task 3 (import) |
| 9 | CONTEXT (Progress feedback) | Drain uses the same result-display component | Task 1 |
| 10 | CONTEXT (Dry-run) | Checkbox on Import and Triage, checked by default; none on Drain | Tasks 2, 3 |
| 11 | CONTEXT (Import inputs) | Country dropdown from `COUNTRY_BBOXES` | Task 3 |
| 12 | CONTEXT (Import inputs) | Region dropdown from `REGION_BBOXES`, filtered by `<ISO2>:` prefix | Task 3 |
| 13 | CONTEXT (Import inputs) | Category free text, with the "no known-good list" reason surfaced | Task 3 |
| 14 | CONTEXT (Import inputs) | Limit and campaign tag optional | Task 3 |
| 15 | CONTEXT (Import inputs) | Dropdowns read the exported tables at render time, never a copy | Task 3 (`lib/overture-bboxes.ts` extraction) |
| 16 | CONTEXT (Import inputs) | Zero-row results loud and distinct from failure and from success-with-writes | Task 3 |
| 17 | CONTEXT (Specifics) | run-batch is the reference route shape: header auth, `runtime = "nodejs"`, structured JSON errors, prefixed `console.error` | Tasks 1-3 |
| 18 | CONTEXT (Specifics) | Reuse `parseImportArgs`/`parseTriageArgs` rather than reimplementing validation | Tasks 2-3 (runner is the only validator) |
| 19 | CONTEXT (Discretion) | Component decomposition under `components/admin/`, kebab-case per control | Tasks 1-3 |
| 20 | CONTEXT (Discretion) | Streaming mechanism | Task 2 (NDJSON over `ReadableStream`) |
| 21 | CONTEXT (Discretion) | In-process vs child process | Tasks 2-3 (child process, forced by the 109 MB native duckdb dependency; documented in `<interfaces>`) |
| 22 | Constraint (orchestrator) | Automated test: each of the three routes 404s when NODE_ENV is not development, before auth and before DB client construction | Task 1 creates it, Tasks 2-3 extend to all three |
| 23 | Constraint (orchestrator) | `scripts/*.ts` CLI behaviour unchanged | `git diff --quiet` gate in Tasks 2 and 3 |
| 24 | Constraint (CLAUDE.md, Blast radius) | Nothing risks the public scanner's email or scanning | Task 3 build + duckdb grep gate; no send/queue/outreach file is touched |
| 25 | Constraint (CLAUDE.md, Geography) | Country and locale are parameters, never hardcoded | Task 3 (dropdowns derive from the bbox tables, no inline province list) |

No unplanned items. No deferred items.
</source_audit>

<verification>
1. `npm run test` — full suite green, including `lib/overture-client.test.ts` unchanged after the
   bbox extraction and the existing `scripts/*.test.ts` files unchanged.
2. `npx tsc --noEmit` — clean.
3. `git diff --quiet -- scripts/triage-prospects.ts scripts/import-prospects.ts` — exit 0. Both
   existing scripts are byte-identical to their pre-task contents.
4. `npm run build` — succeeds, and the built server output contains no duckdb reference.
5. `app/api/admin/pipeline/guard.test.ts` covers all three routes with the six assertions in
   Task 1's behavior block.
6. Manual, in `next dev`: the Pipeline tab appears, all three controls work, triage and import
   stream a rising count, and a wrong category produces the loud zero-row state.
7. Manual, terminal: `npx tsx scripts/import-prospects.ts --country=NL --region=noord-holland
   --category=<real> --dry-run --limit=5` and `npx tsx scripts/triage-prospects.ts --dry-run
   --limit=5` still run exactly as before.
</verification>

<success_criteria>
- Three admin routes exist, each returning a bare-bodied 404 when NODE_ENV is not `development`,
  before auth and before any Supabase client or child process is constructed, proven behaviourally
  and structurally by an automated test.
- The Pipeline tab is the sixth tab, rendered only in development, with Import, Triage and Drain in
  pipeline order.
- Import and Triage stream live progress and render dry-run-by-default checkboxes.
- A zero-row import is visually distinct from both a failed run and a successful run with writes.
- Country and region dropdowns are driven by the same tables `resolveBbox` uses.
- Both existing scripts are untouched and still run from the terminal.
- `@duckdb/node-api` is absent from the Next.js server build output.
</success_criteria>

<output>
Create `.planning/quick/260806-ntm-local-only-admin-ui-buttons-for-import-t/260806-ntm-SUMMARY.md`
when done, and add a row to the Quick Tasks Completed table in `.planning/STATE.md`.
</output>