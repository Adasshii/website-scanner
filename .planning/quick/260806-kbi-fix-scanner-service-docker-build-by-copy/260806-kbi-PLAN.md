---
type: quick
slug: fix-scanner-service-docker-build-by-copy
quick_id: 260806-kbi
created: 2026-08-06
mode: quick
phase: quick
plan: 260806-kbi
wave: 1
depends_on: []
files_modified:
  - scanner-service/Dockerfile
  - scanner-service/railway.toml
autonomous: true
requirements: [DRA-06]

estimate:
  tokens: 32000
  raw_tokens: 19000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "`docker build -f scanner-service/Dockerfile .` runs to completion: `tsc` inside the image resolves `@shared-lib/scoring` and `npm run build` exits 0."
    - "The built image contains `/app/scanner-service/dist/scanner-service/src/index.js` — the exact path the Dockerfile CMD executes."
    - "`/app/lib` in the built image contains exactly one entry, `scoring.ts`. No outreach, send-gate, suppression, legal-basis or retention module reaches the scanner container."
    - "The same build against unmodified HEAD fails at the `npm run build` step with TS2307 on `@shared-lib/scoring` — the proof discriminates, it is not a build that would have passed anyway."
    - "The `[build]` table's `watchPatterns` in scanner-service/railway.toml parses to exactly three entries, the existing two plus `lib/**`, so a change to `lib/scoring.ts` alone triggers a Railway rebuild instead of leaving an older `computeVerdict` deployed."
  artifacts:
    - "scanner-service/Dockerfile — one `COPY lib/scoring.ts /app/lib/scoring.ts` line plus a rationale comment, placed after `RUN npm ci --ignore-scripts` and before `RUN npm run build`."
    - "scanner-service/railway.toml — one entry appended to the existing `[build]` `watchPatterns` array, nothing else touched."
  key_links:
    - "`scanner-service/src/index.ts:21` `@shared-lib/scoring` -> tsconfig `paths` `@shared-lib/*`:`../lib/*` + `include` `../lib/scoring.ts` -> `/app/lib/scoring.ts` in the image -> `tsc` module resolution -> `RUN npm run build` exit 0 -> Railway deploy succeeds."
    - "edit to `lib/scoring.ts` -> `[build].watchPatterns` match -> Railway rebuild triggered -> the new `computeVerdict` reaches the deployed scanner. Without the `lib/**` entry this chain is broken at the second link and fails silently."
---

# Fix the scanner-service Docker build by copying `lib/scoring.ts` into the image

The scanner-service image cannot build on current HEAD.

`scanner-service/src/index.ts:21` imports `computeVerdict` from `@shared-lib/scoring`.
`scanner-service/tsconfig.json` maps `@shared-lib/*` to `../lib/*` (line 17) and its
`include` array explicitly names `../lib/scoring.ts` (line 21). The Dockerfile copies
`types/` (line 6) and `scanner-service/` (line 16). It never copies `lib/`, so
`RUN npm run build` — plain `tsc` — has nothing to resolve the import against and the
build dies.

The import landed in 14af0a9 (feat(06-01): point scanner service at the shared verdict
function), which serves DRA-06. This is build-infrastructure repair for that change, not
new product behaviour. The Dockerfile was last patched for this exact class of problem in
82d7401, which added `types/` and stopped there.

Copying the file in is only half the fix. `scanner-service/railway.toml` sets
`watchPatterns = ["scanner-service/**", "types/**"]`. Once `lib/scoring.ts` is a genuine
build input, a change to that file alone matches nothing in that list, so Railway does not
rebuild and the deployed scanner keeps running an older `computeVerdict` while the
repository says otherwise. That is precisely the app-versus-service verdict divergence
Phase 06-01 existed to eliminate, reintroduced through the deploy trigger instead of
through the code. Task 3 closes it.

## Settled evidence — do not re-derive

These were established by reproducing the image's file layout in a scratch directory and
running the real compiler. Treat them as facts:

1. Without `lib/` present, `npx tsc` in scanner-service fails with
   `src/index.ts(21,32): error TS2307: Cannot find module '@shared-lib/scoring' or its
   corresponding type declarations.`, exit code 2.
2. With the full `lib/` directory present, `npx tsc` exits 0.
3. With **only** `lib/scoring.ts` present at `../lib/scoring.ts`, `npx tsc` exits 0. One
   file is sufficient.
4. `lib/scoring.ts` has exactly one import, a type-only
   `import type { ScanScores, PageResult, ScanSummary, Issue } from "@/types/scanner"`.
   The `@/*` -> `../*` alias plus the already-copied `types/` resolves it.
5. The root `.dockerignore` does not exclude `lib/`. No `.dockerignore` change is needed.

Also confirmed at planning time: the Docker CLI is present and the daemon is running, but
`mcr.microsoft.com/playwright:v1.58.2-noble` is **not** cached locally. The first build
pulls a multi-gigabyte base image. Plan the task timeouts around that.

## Locked approach

These are decided. Do not revisit them.

- **Copy `lib/scoring.ts` only. Never the whole `lib/` directory.** `lib/` holds the
  outreach, send-gate, suppression, legal-basis and retention modules. This project
  maintains a deliberate isolation posture (`lib/outreach-isolation.test.ts`, and the
  blast-radius constraint in `.claude/CLAUDE.md`). Shipping outreach and legal code into
  the scanner container buys nothing and widens the blast radius. The narrow copy is
  verified sufficient by evidence #3.
- **The file must land at `/app/lib/scoring.ts`,** so it resolves as `../lib/scoring.ts`
  from the `/app/scanner-service` WORKDIR. Use the absolute destination in the COPY —
  WORKDIR is `/app/scanner-service` at that point in the file, so a relative destination
  reads as a puzzle.
- **Place the COPY after `RUN npm ci --ignore-scripts`,** not up beside the `types/` copy.
  Anything above `npm ci` invalidates the dependency layer every time `scoring.ts` changes.
- **Prove it with a real build, in both directions.** A grep confirming the line exists in
  the file is not verification. Task 1 proves current HEAD fails, Task 2 proves the fix
  passes, and the expensive base-image and `npm ci` layers are shared between them.
- **The watch pattern is `lib/**`, broader than the COPY, and that is deliberate.** The
  two settings answer different questions and the errors are not symmetric. The COPY
  decides what code lives in the container, where over-inclusion is a real cost (outreach
  and legal modules on the scanner host), so it stays narrow. `watchPatterns` decides only
  when to rebuild, where over-triggering costs a wasted build and under-triggering ships
  stale code silently. Given that asymmetry the broader pattern is correct, and it also
  survives the next `@shared-lib/*` import without anyone remembering to widen it.

## Tasks

<task type="auto">
  <name>Task 1 (RED): prove the image build fails on unmodified HEAD</name>
  <precondition>The Docker daemon is running (`docker info` exits 0) and the registry `mcr.microsoft.com` is reachable — this build pulls a multi-gigabyte base image that is not cached on this machine.</precondition>
  <files>none — this task modifies nothing</files>
  <action>
Do NOT edit any file in this task. This is the failing-first proof, run in the real
medium (Docker) rather than the tsc reproduction that produced the settled evidence.

Create a scratch directory with `mktemp -d` and keep every log inside it. Nothing from
this task may be written into the repository.

From the repository root, build the real Dockerfile against the repository root as build
context (this matches `scanner-service/railway.toml`, which sets
`dockerfilePath = "scanner-service/Dockerfile"`), tagging the result
`prospect-radar-scanner:kbi-red`, redirecting combined stdout and stderr into a log file
in the scratch directory, and recording the exit code into that same log on a line of the
form `EXIT=<n>`.

Run this build as a BACKGROUND command and poll for completion. It pulls a base image of
several gigabytes and then runs `npm ci` inside the container; it will very likely exceed
a ten-minute foreground timeout. Do not retry it in the foreground if it times out — poll
the background job instead.

The build is EXPECTED to fail. It must fail for the right reason. Read the log and
confirm all three:

  - the recorded `EXIT=` value is non-zero,
  - the log contains the compiler error code for an unresolvable module (the code quoted
    in settled evidence #1),
  - that error names the `@shared-lib/scoring` specifier.

If the build instead fails during the base-image pull, during `npm ci`, or with any error
that is not the module-resolution error, STOP. That is a different problem and this plan
does not cover it. Report what actually happened rather than proceeding.

If the base-image pull cannot succeed at all because the registry is unreachable, fall
back to the layout reproduction: `rsync -a --exclude node_modules --exclude dist` the
`scanner-service/` directory and copy `types/` into the scratch directory, symlink the
existing `scanner-service/node_modules` into the copy so no install is needed, do NOT
create a `lib/` directory, then run `npx tsc` from the copied scanner-service directory
and assert the same non-zero exit and the same error. Record in the summary which of the
two paths was used, since they are not equally strong.

Leave the failed build's cached layers in place. Task 2's build reuses the base image and
the `npm ci` layer, which is what makes the second build cheap.
  </action>
  <verify>
    <automated>Grep the scratch build log and assert, in one command: the `EXIT=` line is non-zero, the log contains the TS module-resolution error code, and the log names `@shared-lib/scoring`. All three must hold.</automated>
  </verify>
  <done>The scratch log records a non-zero exit from `docker build` against unmodified HEAD, and the failure is the module-resolution error on `@shared-lib/scoring` at the `npm run build` step — not a pull failure, not an install failure. No repository file was modified.</done>
</task>

<task type="auto">
  <name>Task 2 (GREEN): copy `lib/scoring.ts` into the image and prove the build passes</name>
  <precondition>Task 1 completed and its cached Docker layers (base image, `npm ci`) are still present, so this build does not re-pull or re-install.</precondition>
  <files>scanner-service/Dockerfile</files>
  <action>
Edit `scanner-service/Dockerfile`. Insert a single COPY instruction with the destination
`/app/lib/scoring.ts`, sourced from `lib/scoring.ts` in the build context, positioned
after the `RUN npm ci --ignore-scripts` line and before the `COPY scanner-service/ .`
line. Use the absolute destination path; WORKDIR is `/app/scanner-service` at that point,
and a relative destination would obscure where the file lands.

Above it, add a short comment recording three things, in this repo's existing Dockerfile
comment register (see the `--ignore-scripts` comment at lines 11-12 for the tone):

  - that the service source imports the shared scoring module and the service tsconfig
    maps that specifier one directory up, which is why the file has to be in the image,
  - that this is deliberately one file and not the whole directory, because the rest of
    that directory is outreach, send-gate and legal code that must stay out of the
    scanner container,
  - that its position after the install step is deliberate, so the dependency layer is
    not invalidated whenever the copied file changes.

Change nothing else. Do not touch `package.json`, `railway.toml`, `.dockerignore`, the
tsconfig, or any application source. Do not reorder or reword the existing instructions.

Then rebuild from the repository root with the same context and the same Dockerfile,
tagging `prospect-radar-scanner:kbi-green`, logging to the scratch directory and recording
`EXIT=<n>` the same way. Run it in the BACKGROUND and poll, as in Task 1, even though the
cached layers should make it fast.

Assert the build exits 0.

Then run the built image with an explicit command overriding CMD, and capture its output:
list `/app/lib`, print a separator line, then list
`/app/scanner-service/dist/scanner-service/src/index.js`. Assert both halves:

  - `/app/lib` contains exactly one entry and that entry is `scoring.ts`. More than one
    entry means the narrow copy was widened and the isolation posture was broken. This is
    the assertion that enforces the locked decision, so do not soften it to "contains".
  - the `index.js` path exists. That is the literal path the Dockerfile CMD executes, so
    this closes the loop from source import to running container.

Clean up afterwards: remove both `kbi-red` and `kbi-green` image tags and delete the
scratch directory. Do NOT remove the `mcr.microsoft.com/playwright:v1.58.2-noble` base
image — it was pulled during this task and is several gigabytes, so mention in the summary
that it now occupies local disk and give the user the command to drop it if they want the
space back. Deleting it silently on their behalf is not this task's call.

Commit with `fix(scanner): copy lib/scoring.ts into the scanner-service image`, and in the
body state that the build failed on HEAD with the module-resolution error, that only the
one file is copied to keep outreach and legal code out of the container, and that the fix
was verified by a real `docker build` in both directions.
  </action>
  <verify>
    <automated>Assert in one command that the scratch log for the green build records `EXIT=0`; then `docker run` the tagged image with an overriding command and assert its output shows exactly `scoring.ts` as the sole entry of `/app/lib` and shows the `dist/scanner-service/src/index.js` path.</automated>
  </verify>
  <done>`docker build -f scanner-service/Dockerfile .` exits 0. The built image's `/app/lib` holds exactly `scoring.ts` and nothing else, and `/app/scanner-service/dist/scanner-service/src/index.js` exists. `scanner-service/Dockerfile` is the only modified file, and the change is one COPY line plus its comment. Both verify image tags and the scratch directory are removed; the base image is left in place and disclosed.</done>
</task>

<task type="auto">
  <name>Task 3: watch `lib/**` so a scoring change triggers a Railway rebuild</name>
  <files>scanner-service/railway.toml</files>
  <action>
This task has NO dependency on Docker and NO dependency on Task 2's build completing. Run
it while Task 2's build polls in the background, or ahead of Task 2 entirely. It must not
sit behind a multi-gigabyte image pull.

Why it is in scope: after Task 2, `lib/scoring.ts` is a genuine input to the scanner
image. `watchPatterns` currently lists only `scanner-service/**` and `types/**`, so a
commit that changes `lib/scoring.ts` and nothing else matches no pattern, Railway does not
rebuild, and the deployed scanner goes on running the previous `computeVerdict` while the
repository claims the new one. Nothing surfaces that: no build fails, no health check
trips, and the app and the service quietly disagree about verdict bands again. That
divergence is the exact condition Phase 06-01 was written to remove, so leaving the
trigger unfixed would hand it straight back through the deploy path.

Edit `scanner-service/railway.toml`. Append one entry, `lib/**`, to the end of the
existing `watchPatterns` array under the `[build]` table. Keep the array on a single line,
as it is now. That is the entire change.

Keep it strictly additive:
  - do not reorder, reword or remove the two existing entries,
  - do not touch `dockerfilePath`,
  - do not touch the `[deploy]` table — `healthcheckPath`, `healthcheckTimeout`,
    `restartPolicyType` and `restartPolicyMaxRetries` all stay byte-identical,
  - do not add a comment to this file. It carries none today, a comment would break the
    one-line assertion below, and the reasoning belongs in the commit message and in this
    plan rather than buried in a deploy config.

Commit this separately from Task 2, as its own atomic commit, with
`fix(scanner): watch lib/** so a scoring change triggers a Railway rebuild`. In the body,
record that `lib/scoring.ts` became a build input in the preceding commit and that without
this the deployed scanner would silently retain an older `computeVerdict`. Either commit
order relative to Task 2 is acceptable — the two touch disjoint files.
  </action>
  <verify>
    <automated>Two assertions, both required. (1) `git diff --numstat -- scanner-service/railway.toml` reports exactly one insertion and one deletion, which proves a single-line additive edit with no restructuring. (2) A read-back that parses instead of grepping: a short inline `node -e` script that reads the file, slices out the `[build]` table (from the `[build]` header to the next line whose first non-whitespace character is `[`), extracts the `watchPatterns = [ ... ]` assignment from within that slice only, `JSON.parse`s the array literal, and asserts deep equality against `["scanner-service/**", "types/**", "lib/**"]`, exiting non-zero on any mismatch. Deep equality on the parsed value scoped to the correct table is what gives this teeth: it fails if the entry landed under `[deploy]`, if it only appears in a comment, if the array is malformed, if an existing entry was altered, or if a duplicate crept in. No TOML dependency is added — this machine has no `tomllib`, `yq`, `dasel` or `taplo`, and installing a parser for a two-key config file is not worth a package legitimacy gate.</automated>
  </verify>
  <done>`scanner-service/railway.toml`'s `[build].watchPatterns` parses to exactly `["scanner-service/**", "types/**", "lib/**"]`, in that order. `git diff --numstat` on the file shows 1 insertion and 1 deletion. `dockerfilePath` and every `[deploy]` key are unchanged. The change is committed on its own, and it did not wait on the Docker build.</done>
</task>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo -> scanner container image | Build context decides which source modules become resident on the Railway host |
| repo HEAD -> deployed Railway service | `watchPatterns` decides which commits are believed to change the service, and therefore whether what runs still matches what was reviewed |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260806-kbi-01 | Information Disclosure | scanner container filesystem | medium | mitigate | Copy exactly one file. Task 2 asserts `/app/lib` holds a single entry, so outreach, send-gate, suppression, legal-basis and retention modules cannot reach the scanner container by accident or by a later widening of the COPY. |
| T-260806-kbi-02 | Tampering | build inputs | low | accept | No package is installed or upgraded. `package.json`, `package-lock.json` and `RUN npm ci --ignore-scripts` are untouched, so no package legitimacy gate applies to this change. |
| T-260806-kbi-03 | Tampering | deployed artifact vs reviewed source | medium | mitigate | An unwatched build input lets the running service diverge from reviewed HEAD with no signal — no failed build, no failed health check. Task 3 adds `lib/**` to `watchPatterns` so the deployed scanner cannot silently lag the source. Stated honestly: the realistic consequence here is verdict divergence rather than exploitation, but "what runs is not what was reviewed" is an integrity property worth holding. |
</threat_model>

## Verification

Both directions of the build proof run against the real Dockerfile with the real build
context. None of the three steps may be replaced by reading a file and confirming a line
is present.

1. Task 1: unmodified HEAD fails at `RUN npm run build` with TS2307 on `@shared-lib/scoring`.
2. Task 2: with the COPY added, the same build exits 0, `/app/lib` holds exactly
   `scoring.ts`, and the CMD's target `index.js` exists in the image.
3. Task 3: `[build].watchPatterns` is parsed out of railway.toml and deep-equals the
   expected three entries, and `git diff --numstat` shows the edit was one line.

## Success Criteria

- `scanner-service/Dockerfile` gains one COPY instruction plus its rationale comment.
- `scanner-service/railway.toml` gains one `watchPatterns` entry. Those two files are the
  only changes in the repository.
- A real `docker build` succeeds where it previously failed, and the failure was observed
  first so the success is known to mean something.
- The scanner container carries the shared scoring module and none of the outreach or
  legal modules.
- A future commit touching only `lib/scoring.ts` will trigger a Railway rebuild, so the
  deployed verdict function cannot silently lag the repository.

## Noted, not fixed

Two real problems found while planning. Both are out of scope here; neither blocks this
change. (A third, the `railway.toml` `watchPatterns` gap, was promoted into scope and is
now Task 3.)

1. **`scanner-service/package.json` `"start": "node dist/index.js"` is wrong.** The build
   emits to `dist/scanner-service/src/index.js` (tsconfig `rootDir: ".."`), which is what
   the Dockerfile CMD runs. `npm start` after a build would fail. Harmless today because
   CMD overrides it and Railway never invokes `npm start`, but it is a trap for the next
   person who tries to run the service locally from a build.

2. **`scanner-service/tsconfig.json` hardcodes `../lib/scoring.ts` in `include`.** The
   knowledge that a shared module is needed lives in two places, the tsconfig include and
   the Dockerfile COPY, and both are per-file. A second `@shared-lib/*` import will
   reproduce this exact failure unless both are updated together, and only the Docker build
   will catch it. Task 3's `watchPatterns` entry is deliberately not a third such place —
   `lib/**` is a directory glob, so it already covers any future shared module without
   being touched again.

## Output

Create `.planning/quick/260806-kbi-fix-scanner-service-docker-build-by-copy/260806-kbi-SUMMARY.md` when done.
