---
type: quick
slug: fix-scanner-service-runtime-crash-from-u
quick_id: 260806-luk
created: 2026-08-06
mode: quick
phase: quick
plan: 260806-luk
wave: 1
depends_on: []
files_modified:
  - scanner-service/src/index.ts
autonomous: true
requirements: [DRA-06]

estimate:
  tokens: 28000
  raw_tokens: 17000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "The image built from `scanner-service/Dockerfile`, run with NO environment variables set, boots and answers `GET /health` with HTTP 200."
    - "That 200 response body carries `status` = `ok` and `service` = `adashi-scanner` — the same shape Railway's healthcheck at `/health` receives."
    - "The container is still running after the health probe, with restart count 0, so a boot-crash cannot be mistaken for a pass."
    - "The built `dist/` tree contains ZERO runtime `require` calls through a tsconfig path alias, so a future value import through any alias fails this gate instead of failing in production."
    - "`scanner-service/src/index.ts` imports `computeVerdict` through a relative specifier, and carries a comment at the import site stating why it must stay relative."
    - "`scanner-service/src/index.ts` is the only file changed in the repository."
  artifacts:
    - "scanner-service/src/index.ts — one rewritten module specifier on the `computeVerdict` import, plus a short rationale comment directly above it."
  key_links:
    - "relative specifier in `src/index.ts` -> `tsc` emits the specifier verbatim -> `dist/scanner-service/src/index.js` resolves `../../lib/scoring` -> `dist/lib/scoring.js` (same relative depth, already present in the image) -> `node` completes module load -> `app.listen(3001)` -> `/health` 200 -> Railway healthcheck passes -> deployment promoted."
    - "`lib/scoring.ts` is STILL a build input after this change. The `COPY lib/scoring.ts` in the Dockerfile and the `lib/**` watch pattern in railway.toml (both from 260806-kbi) remain load-bearing and must not be reverted as newly-redundant."
---

# Fix the scanner-service boot crash: make the shared-scoring import resolve at runtime

The image builds. The container does not boot.

Railway deployment `11bb3605` shows Initialization OK, Build OK (1:20), Deploy OK, then
`Network > Healthcheck` FAILED at 4:51. Railway kept the previous deployment ACTIVE, so
production is not down — but the live image is still `feat(05-04)` from 12 days ago, and
the shared-verdict change from 06-01 (DRA-06) has never actually run in production.

`scanner-service/src/index.ts:21` imports `computeVerdict` through the `@shared-lib/*`
tsconfig path alias. Path aliases are a compile-time concept: `tsc` uses `paths` to
resolve types, then emits the module specifier unchanged. Node has no idea what that
specifier means, so the process dies on its first require, before `app.listen` is ever
reached, and the healthcheck has nothing to answer it.

Quick task 260806-kbi fixed the build. This fixes the boot. Same root import, two
different failure surfaces.

## Settled evidence — do not re-derive

Established empirically against the real built image. Treat these as facts:

1. Running the built image crashes immediately with
   `Error: Cannot find module '@shared-lib/scoring'`, require stack
   `/app/scanner-service/dist/scanner-service/src/index.js`.
2. The emitted JavaScript contains the alias verbatim as a `require` argument. The service
   has no `module-alias`, `tsconfig-paths` or `tsc-alias` dependency, and its `build`
   script is plain `tsc`.
3. This never surfaced before because every other alias use in this service is an
   `import type`, which TypeScript erases at emit. `computeVerdict` is a VALUE import — the
   first alias use that survives into runtime.
4. Grepping the whole built `dist/` for a runtime alias require returns exactly one hit,
   `dist/scanner-service/src/index.js:17`. Nothing else. (`lib/scoring.ts`'s own
   `@/types/scanner` import is type-only and erased — confirmed again at planning time.)
5. `lib/scoring.ts` compiles into the image correctly at `dist/lib/scoring.js`. The file is
   present; only the specifier pointing at it is wrong.
6. The `/health` handler (`src/index.ts:81`) is registered before the auth middleware and
   reads no environment variables. The Supabase client is built lazily inside `getSupabase()`.
   There is no startup env validation anywhere in the service — re-confirmed at planning
   time: no `REQUIRED_VARS`, no eager `process.exit` outside the signal handlers, and
   `authMiddleware` reads `SCANNER_API_KEY` per-request, not at module load. A correctly
   built container therefore serves `/health` with zero env vars set.

## Locked approach

Decided. Do not revisit.

- **Fix it with a relative specifier: `../../lib/scoring`.** From `scanner-service/src/`
  that walks up to the repository root and into `lib/`. It resolves at compile time AND at
  runtime, because the emitted `dist/scanner-service/src/index.js` sits at the same
  relative depth from `dist/lib/scoring.js`. It also works under `tsx watch src/index.ts`,
  which handles relative imports natively. Line 18 of the same file already uses this exact
  depth for the shared types, so the fix is consistent with what is there.
- **Do NOT add `module-alias`, `tsconfig-paths` or `tsc-alias`.** A new runtime-resolver
  package would need a package-legitimacy approval gate, and a new production dependency in
  the scanner container, for a problem one relative path solves outright.
- **A comment at the import site is part of the fix, not decoration.** Without it the next
  person to normalise imports puts the alias back and reproduces this outage. The comment
  is the only durable defence at the source; the `dist` grep gate in Task 2 is the
  automated one.
- **Verification boots the real thing.** 260806-kbi's verification asserted the emitted
  `index.js` EXISTS — and it did exist, and it crashed on require. An existence check
  cannot distinguish a working container from that. This plan's gate is an HTTP 200 from a
  running container, or it is nothing.
- **Everything else stays untouched.** `tsconfig.json`, `Dockerfile`, `railway.toml`,
  `package.json`, `lib/scoring.ts`, all application logic. Note anything else you spot
  under "Noted, not fixed" and move on.

**Still load-bearing after this change:** the Dockerfile's `COPY lib/scoring.ts` and
railway.toml's `lib/**` watch pattern, both added by 260806-kbi. A relative import still
needs the file present in the image and still needs a change to it to trigger a rebuild.
Do not treat either as newly redundant.

## Tasks

<task type="auto">
  <name>Task 1: point the computeVerdict import at a relative path, and record why</name>
  <files>scanner-service/src/index.ts</files>
  <action>
Change the module specifier on line 21 — the `computeVerdict` import — to the relative
specifier `../../lib/scoring`.

Change nothing else about that statement: the imported binding stays `computeVerdict`, it
stays a value import (not `import type`), and it keeps its position in the import block.
Line 18 of this same file already imports the shared types at this exact relative depth, so
the result reads consistently with its neighbours.

Directly above it, add a short comment, two or three lines, in this file's existing comment
register. It must record all three of:

  - that this import is deliberately relative,
  - that the tsconfig path alias which used to sit here is compile-time only — `tsc` emits
    the specifier verbatim and Node cannot resolve it, which crashed the container on boot
    and failed Railway's healthcheck,
  - that it must therefore not be "tidied" back to the alias form, and that the alias is
    safe only for `import type` uses, which are erased at emit.

Two constraints on how that comment is written, both mechanical:

  - Use `//` line comments, not a block comment, and start each line with `//` at the start
    of the (indented) line. Task 1's own gate strips comment lines before counting alias
    occurrences in this file, and it recognises `//`-prefixed lines.
  - Name the alias bare, as a name. Never write it inside a quoted module specifier and
    never write it as a require call. `tsc` preserves comments into `dist/`, and Task 2
    greps the built JavaScript for exactly that shape — a comment written that way would
    fail the gate it exists to protect. If Task 2's grep does hit a comment line, fix the
    comment; do not weaken the pattern.

Do not touch `scanner-service/tsconfig.json`. The now-unused `@shared-lib/*` mapping stays
where it is; removing it is noted, not fixed.

Do not commit yet — commit in Task 2, once the container has actually booted. A commit
before the boot proof is the same mistake as the last pass.
  </action>
  <verify>
    <automated>Two assertions on `scanner-service/src/index.ts`, both required. (1) `grep -c 'from "\.\./\.\./lib/scoring"' scanner-service/src/index.ts` returns exactly 1. (2) With comment lines removed first — `grep -vE '^[[:space:]]*//' scanner-service/src/index.ts | grep -c '@shared-lib'` — the count is exactly 0, proving no code line still resolves through the alias while leaving the new rationale comment free to name it.</automated>
  </verify>
  <done>`scanner-service/src/index.ts` imports `computeVerdict` from `../../lib/scoring`, with a `//` comment above it stating that the import is deliberately relative, that the alias is compile-time only and crashed the container, and that it must not be reverted. No non-comment line in the file mentions the alias. No other file is modified, and nothing is committed yet.</done>
</task>

<task type="auto">
  <name>Task 2: prove the container actually boots and answers /health, then commit</name>
  <precondition>The Docker daemon is running (`docker info` exits 0). The base image `mcr.microsoft.com/playwright:v1.58.2-noble` and the `npm ci` layer were cached by quick task 260806-kbi earlier today, so this build should be fast; if the cache was cleared, the build re-pulls several gigabytes and must be run as a background command and polled.</precondition>
  <files>none — this task verifies and commits, it does not edit source</files>
  <action>
This is the gate the previous pass did not have. Do not substitute any file-existence or
grep-only check for it.

Work entirely inside a scratch directory from `mktemp -d`. Nothing from this task may be
written into the repository.

Build the real Dockerfile from the repository root as build context — matching
`scanner-service/railway.toml`, which sets `dockerfilePath = "scanner-service/Dockerfile"`
— and tag the result `prospect-radar-scanner:luk-verify`. Log combined stdout and stderr
into the scratch directory and record the exit code. Assert it exits 0. If the build fails,
stop and report the log; that is a different problem from the one this plan covers.

Run the image detached, named `prospect-radar-scanner-luk-verify`, publishing container
port 3001 to host port 13001 bound to `127.0.0.1` only. Pass NO environment variables and
no `--restart` flag. Settled evidence 6 says a correctly built container serves `/health`
with nothing set; a non-default loopback-only port keeps this clear of any scanner-service
you have running locally, and the absent restart policy means a crash leaves the container
exited rather than silently cycling.

Poll, do not sleep a fixed interval. Up to 60 attempts, one second apart, requesting
`http://127.0.0.1:13001/health` with a 2-second per-request timeout, capturing the response
body to a file in the scratch directory and the HTTP status separately. Break on status
200. On every iteration also check whether the container is still running, and break
immediately if it has exited — there is no point polling a dead container.

Then assert all four, and treat any one of them failing as a failed task:

  - the captured HTTP status is 200,
  - the captured body contains a `status` field whose value is `ok`,
  - the captured body contains a `service` field whose value is `adashi-scanner`,
  - the container is still running after the probe and its restart count is 0.

Then run the negative gate. Copy the built tree out of the container with
`docker cp prospect-radar-scanner-luk-verify:/app/scanner-service/dist` into the scratch
directory, and grep that copy for runtime requires through a path alias (the exact fixed
patterns are in the verify block). The count must be exactly 0. Copying it out first is
deliberate: it keeps the shell quoting simple and lets the same grep run on the host.
This gate is broader than the one line this plan fixes — it is what catches the NEXT value
import added through any alias, which would otherwise reach production the same way.

If the container never returns 200, or exits during polling, capture the full
`docker logs prospect-radar-scanner-luk-verify` output and report it verbatim. Do not
report a partial result as success, and do not report success on the build alone.

Tear down when the assertions are done: force-remove the container, remove the
`prospect-radar-scanner:luk-verify` image tag, and delete the scratch directory. Do NOT
remove the `mcr.microsoft.com/playwright:v1.58.2-noble` base image and do NOT prune the
build cache — both belong to the machine, not to this task.

Then commit `scanner-service/src/index.ts` alone with
`fix(scanner): import shared scoring by relative path so the container boots`. In the body
record: that path aliases are compile-time only and `tsc` emitted the specifier verbatim,
that this crashed the container on require and failed the Railway healthcheck on
deployment 11bb3605 while the previous deployment stayed active, that no runtime-resolver
package was added, and that the fix was proven by running the built image and getting a
200 from `/health`.

Do not push, do not deploy, and do not trigger a Railway rebuild. The orchestrator owns
the push.
  </action>
  <verify>
    <automated>Four assertions plus the negative gate, all required, none skippable. (1) The build log records exit 0. (2) `curl -s -o BODY -w '%{http_code}' -m 2 http://127.0.0.1:13001/health`, polled up to 60 times at 1s intervals, yields `200`. (3) The captured body satisfies both `grep -q '"status":"ok"'` and `grep -q '"service":"adashi-scanner"'`. (4) `docker inspect -f '{{.State.Running}}' prospect-radar-scanner-luk-verify` is `true` AND `docker inspect -f '{{.RestartCount}}'` is `0`. (5) Against the `dist` tree copied out of the container, `grep -rF -e 'require("@shared-lib' -e 'require("@shared/' -e 'require("@/' SCRATCH/dist | wc -l` returns exactly 0.</automated>
  </verify>
  <done>A container built from the real Dockerfile, running with no environment variables, returned HTTP 200 from `/health` with `status` `ok` and `service` `adashi-scanner`, and was still running with restart count 0 after the probe. The built `dist/` tree contains zero runtime requires through a path alias. The verify container and image tag are removed and the scratch directory is deleted; the base image and build cache are left alone. `scanner-service/src/index.ts` is committed on its own, and nothing was pushed or deployed.</done>
</task>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo HEAD -> running Railway container | The emitted module graph decides whether the reviewed code can execute at all; a build that passes is not evidence that it runs |
| host -> temporary verification container | A published port on the developer machine exposes a service process for the duration of the probe |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260806-luk-01 | Denial of Service | scanner-service boot path | high | mitigate | A compile-time-only specifier surviving into emitted JavaScript kills the process before `app.listen`, taking the whole service down on deploy. Task 1 removes this instance; Task 2's `dist` grep gate closes the class, failing on any future value import through any of the three aliases rather than letting it reach Railway. |
| T-260806-luk-02 | Tampering | build inputs | low | accept | No package is added, removed or upgraded. `package.json`, `package-lock.json` and `npm ci --ignore-scripts` are untouched, so no package legitimacy gate applies — which is precisely why the relative path was chosen over a runtime resolver. |
| T-260806-luk-03 | Information Disclosure | verification container | low | mitigate | The verify container is started with zero environment variables, so it holds no Supabase service-role key, no scanner API key and no Gemini key; its port is published to `127.0.0.1` only, on non-default 13001; and it is force-removed with its image tag at the end of the task. `docker logs` output captured on failure therefore cannot carry a secret. |
</threat_model>

## Verification

The whole point of this plan is the boot proof. It runs against the real Dockerfile with
the real build context, and nothing substitutes for it.

1. Task 1: the source file's non-comment lines no longer reference the alias, and the
   relative specifier is present exactly once.
2. Task 2: the image builds, the container boots with no env vars, `/health` returns 200
   with the expected `status` and `service` values, the container is still alive with
   restart count 0 afterwards, and the built `dist/` has zero alias requires.

An existence check on `dist/scanner-service/src/index.js` is explicitly NOT acceptable
evidence. That check passed last time, on a file that crashed on require.

## Success Criteria

- `scanner-service/src/index.ts` gains one rewritten specifier and one rationale comment.
  It is the only file changed.
- A container built from the current Dockerfile boots and answers `/health` with 200 —
  observed, not inferred from a successful build.
- A future value import through `@shared-lib/*`, `@shared/*` or `@/*` fails the `dist`
  grep gate instead of failing on the Railway healthcheck.
- No new dependency, and therefore no package legitimacy gate.
- Nothing is pushed or deployed by this plan.

## Noted, not fixed

Real, out of scope here, none blocking.

1. **`scanner-service/tsconfig.json`'s `@shared-lib/*` mapping is now unused.** After this
   change nothing resolves through it. Leaving it costs nothing today, but it is a loaded
   gun: it makes the alias look available and correct to the next person who adds a value
   import. Removing it, and possibly `@/*` too (its only consumer is `lib/scoring.ts`'s
   type-only import), would make the compiler enforce what the comment currently asks for
   politely. Deliberately deferred so this plan stays a one-line change with a real boot
   test.

2. **`scanner-service/package.json`'s `"start": "node dist/index.js"` is still wrong.** The
   build emits to `dist/scanner-service/src/index.js` (tsconfig `rootDir: ".."`), which is
   what the Dockerfile CMD runs. `npm start` after a build fails. Harmless in production
   because CMD overrides it; a trap for anyone running the service locally from a build.
   Carried over unchanged from 260806-kbi's notes.

3. **The two failure surfaces of one import were found one at a time.** 260806-kbi fixed
   the build, this fixes the boot, and both came from the same line added in 14af0a9. The
   cheap structural defence is a CI step that builds the image and curls `/health` — the
   exact sequence Task 2 performs by hand. Worth considering the next time this service's
   deploy path is touched.

## Output

Create `.planning/quick/260806-luk-fix-scanner-service-runtime-crash-from-u/260806-luk-SUMMARY.md` when done.
