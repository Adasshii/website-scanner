---
phase: quick
plan: 260806-kbi
subsystem: scanner-service build/deploy
tags: [docker, railway, build-infrastructure, DRA-06]
status: complete
dependency-graph:
  requires: []
  provides:
    - "scanner-service Docker image builds successfully with lib/scoring.ts resolved"
    - "Railway rebuild trigger on lib/** changes"
  affects:
    - scanner-service/Dockerfile
    - scanner-service/railway.toml
tech-stack:
  added: []
  patterns:
    - "Narrow single-file COPY across a directory boundary in a multi-stage Dockerfile, to avoid widening the container's file surface"
key-files:
  created: []
  modified:
    - scanner-service/Dockerfile
    - scanner-service/railway.toml
decisions:
  - "Copied only lib/scoring.ts, never the whole lib/ directory, to keep outreach/send-gate/suppression/legal-basis/retention modules out of the scanner container (isolation posture, T-260806-kbi-01)."
  - "watchPatterns entry is lib/** (broader than the narrow COPY), deliberately, since over-triggering a rebuild is cheap and under-triggering silently ships a stale computeVerdict."
metrics:
  duration: "~9.5 minutes"
  completed: 2026-08-06
actuals:
  tokens: 840
  tasks: 3
  commits: 2
---

# Fix the scanner-service Docker build by copying `lib/scoring.ts` — Summary

Copied `lib/scoring.ts` into the scanner-service Docker image (one COPY line, narrow by
design) and added `lib/**` to Railway's `watchPatterns`, closing both the immediate build
break and the silent-staleness deploy-trigger gap it would otherwise have reopened.

## What Was Built

1. **Task 1 (RED):** Proved, with a real `docker build` against unmodified HEAD, that the
   scanner-service image cannot build — fails at `RUN npm run build` with `TS2307` on
   `@shared-lib/scoring`.
2. **Task 2 (GREEN):** Added one `COPY lib/scoring.ts /app/lib/scoring.ts` instruction to
   `scanner-service/Dockerfile`, positioned after `RUN npm ci --ignore-scripts` and before
   `COPY scanner-service/ .`, with a three-part rationale comment. Proved with a second
   real `docker build` that the fix passes, that `/app/lib` in the built image holds
   exactly `scoring.ts` and nothing else, and that the CMD's target
   `/app/scanner-service/dist/scanner-service/src/index.js` exists in the image.
3. **Task 3:** Appended `lib/**` to `scanner-service/railway.toml`'s `[build].watchPatterns`
   array so a future commit touching only `lib/scoring.ts` triggers a Railway rebuild
   instead of leaving a stale `computeVerdict` deployed. Run before Task 2's build
   completed, as instructed, since it has no Docker dependency.

## Verification Path — Reporting Requirement

**The real `docker build` path ran for both directions, per the user's locked decision.**
No fallback to the tsc-layout reproduction was needed — `mcr.microsoft.com` was reachable
and the multi-gigabyte base image pulled successfully on the first (Task 1) build. Task
2's build then reused the cached base-image layers and the `npm ci` layer, completing in
under 3 seconds of actual work (everything through `npm ci` was `CACHED`).

**Task 1 (RED), against unmodified HEAD:**
- `docker build -f scanner-service/Dockerfile -t prospect-radar-scanner:kbi-red .`
- Observed exit code: `1` (recorded in the scratch log as `EXIT=1`)
- Failure point: `RUN npm run build` (step `[8/8]`), the plain `tsc` invocation
- Exact compiler error: `src/index.ts(21,32): error TS2307: Cannot find module
  '@shared-lib/scoring' or its corresponding type declarations.`
- The automated one-command assertion (non-zero `EXIT=`, log contains `TS2307`, log names
  `@shared-lib/scoring`) — all three held: `TASK1_VERIFY=PASS`

**Task 2 (GREEN), with the COPY added:**
- `docker build -f scanner-service/Dockerfile -t prospect-radar-scanner:kbi-green .`
- Observed exit code: `0` (recorded in the scratch log as `EXIT=0`)
- All prior steps through `npm ci` came back `CACHED`; the new `COPY lib/scoring.ts
  /app/lib/scoring.ts` step ran in `0.0s`; `RUN npm run build` completed in `2.5s` with no
  errors.

## Image-Content Assertion Results

Ran the built `kbi-green` image with an overriding shell command:
`ls /app/lib && echo "---SEP---" && ls /app/scanner-service/dist/scanner-service/src/index.js`

Raw output:
```
scoring.ts
---SEP---
/app/scanner-service/dist/scanner-service/src/index.js
```

Formal assertion, both required and both held:
- `/app/lib` single-entry assertion: entry count = `1`, sole entry name = `scoring.ts`.
  **PASS.** (No outreach, send-gate, suppression, legal-basis, or retention module reached
  the image — enforces T-260806-kbi-01.)
- `dist` path assertion: `/app/scanner-service/dist/scanner-service/src/index.js` exists
  (the `ls` on the exact path returned the path with no error). **PASS.** This is the
  literal path the Dockerfile `CMD` executes.

## railway.toml Edit — Exact Figures

`git diff --numstat -- scanner-service/railway.toml`:
```
1	1	scanner-service/railway.toml
```
One insertion, one deletion — the single-line additive edit the plan requires.

Read-back (`node -e` script isolating the `[build]` table slice, extracting
`watchPatterns`, `JSON.parse`-ing it, deep-equality against the expected array):
```
parsed:   ["scanner-service/**","types/**","lib/**"]
expected: ["scanner-service/**","types/**","lib/**"]
MATCH:    true
```
`git diff` on the file confirms `[deploy]` (healthcheckPath, healthcheckTimeout,
restartPolicyType, restartPolicyMaxRetries) and `dockerfilePath` are byte-identical —
only the `watchPatterns` line changed.

## Cleanup and Disk Disclosure

- Both verify image tags removed: `prospect-radar-scanner:kbi-red` (never existed as a
  tag — the RED build failed before Docker could tag anything, so `docker rmi` correctly
  reported "No such image") and `prospect-radar-scanner:kbi-green` (removed successfully).
- Both scratch build-log directories deleted.
- **Base image disk disclosure (per plan instruction — not deleted, disclosed instead):**
  `mcr.microsoft.com/playwright:v1.58.2-noble` was pulled during Task 1 and is not left as
  a discrete entry in `docker images` (Docker's default `docker` buildx driver caches
  `FROM`-pulled layers in BuildKit's build-cache store rather than the classic image
  store on this machine — confirmed via `docker image inspect
  mcr.microsoft.com/playwright:v1.58.2-noble`, which reports "No such image", and
  `docker buildx du`, which shows the layers there instead). Current state:
  `docker system df` reports `Build Cache: 33 total / 2.513GB total / 1.39GB reclaimable`.
  If Joshua wants the space back: `docker builder prune` (interactive, prompts before
  deleting) or `docker builder prune -f` (non-interactive). This was left in place —
  deleting it was explicitly not this task's call.

## Deviations from Plan

**1. [Reporting nuance, not a deviation] Base-image cleanup command differs from a plain
`docker rmi`.** The plan anticipated disclosing "the `mcr.microsoft.com/playwright:v1.58.2-noble`
base image" as something occupying local disk with an `rmi`-style reclaim command. Because
this machine's Docker uses BuildKit's own cache store for `FROM` layers rather than the
classic image store, the base image never appears under `docker images` or
`docker image inspect` by that reference — `docker rmi mcr.microsoft.com/playwright:v1.58.2-noble`
would fail with "No such image." Investigated with `docker buildx du` and `docker system df`
to find the real location, and gave the correct reclaim command (`docker builder prune`)
instead of the assumed one. No repository file was touched by this investigation.

No other deviations. Both files changed exactly as the plan specified: one COPY
instruction plus its rationale comment in the Dockerfile, one appended array entry in
railway.toml. No package was installed. No architectural change was needed.

## Threat Flags

None. Both threats identified in the plan's own `<threat_model>` (T-260806-kbi-01,
information disclosure via container filesystem; T-260806-kbi-03, deployed-artifact
staleness) were mitigated exactly as planned and are verified above, not newly discovered.
T-260806-kbi-02 (package tampering) was accepted by the plan as out of scope since no
package was installed — confirmed true, `package.json`/`package-lock.json` untouched.

## Self-Check: PASSED

- FOUND: `scanner-service/Dockerfile`
- FOUND: `scanner-service/railway.toml`
- FOUND: `COPY lib/scoring.ts /app/lib/scoring.ts` in Dockerfile
- FOUND: `lib/**` entry in railway.toml `watchPatterns`
- FOUND commit `31fc75f` (Task 3, railway.toml)
- FOUND commit `3d91e00` (Task 2, Dockerfile)
