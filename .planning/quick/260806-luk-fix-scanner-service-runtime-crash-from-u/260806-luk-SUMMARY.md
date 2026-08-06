---
phase: quick
plan: 260806-luk
subsystem: infra
tags: [docker, railway, typescript, module-resolution, scanner-service]

requires:
  - phase: quick-260806-kbi
    provides: "scanner-service Docker image that BUILDS (COPY lib/scoring.ts, railway.toml watchPatterns)"
provides:
  - "scanner-service/src/index.ts imports computeVerdict via a relative path that resolves at both compile time and runtime"
  - "boot-proof gate: a container built from the real Dockerfile, run with zero env vars, answers GET /health with 200"
  - "dist/ grep gate proving zero runtime requires through @shared-lib/*, @shared/*, or @/*"
affects: [scanner-service-deploy, phase-08-send]

actuals:
  tokens: 584
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Runtime module resolution across the scanner-service/lib boundary must use relative specifiers, never tsconfig path aliases, because tsc emits path-mapped specifiers verbatim and Node cannot resolve them"

key-files:
  created: []
  modified:
    - scanner-service/src/index.ts

key-decisions:
  - "Fixed with a relative specifier (../../lib/scoring) rather than adding module-alias/tsconfig-paths/tsc-alias — avoids a new production dependency and the package-legitimacy gate it would require"
  - "Verification runs the actual built image (docker build + docker run + poll /health) rather than asserting the emitted file exists, because an existence check is exactly what let this bug reach Railway deployment 11bb3605"

requirements-completed: [DRA-06]

coverage:
  - id: D1
    description: "scanner-service/src/index.ts imports computeVerdict through a relative specifier with a rationale comment explaining why it must stay relative"
    requirement: "DRA-06"
    verification:
      - kind: other
        ref: "grep -c 'from \"../../lib/scoring\"' scanner-service/src/index.ts == 1; grep -vE '^[[:space:]]*//' scanner-service/src/index.ts | grep -c '@shared-lib' == 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "A container built from the real Dockerfile, run with no environment variables, boots and answers GET /health with HTTP 200, status=ok, service=adashi-scanner, restart count 0"
    requirement: "DRA-06"
    verification:
      - kind: e2e
        ref: "docker build -f scanner-service/Dockerfile -t prospect-radar-scanner:luk-verify . ; docker run -d -p 127.0.0.1:13001:3001 ; curl http://127.0.0.1:13001/health"
        status: pass
    human_judgment: false
  - id: D3
    description: "The built dist/ tree contains zero runtime requires through any tsconfig path alias (@shared-lib/*, @shared/*, @/*)"
    requirement: "DRA-06"
    verification:
      - kind: other
        ref: "grep -rF -e 'require(\"@shared-lib' -e 'require(\"@shared/' -e 'require(\"@/' <dist copied from container> | wc -l == 0"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-08-06
status: complete
---

# Quick Task 260806-luk: Fix scanner-service runtime crash from unresolved path alias Summary

**Replaced the `@shared-lib/scoring` compile-time path alias with a relative import, then proved the real Dockerfile-built container boots and answers `GET /health` with 200 before committing — closing the boot-crash half of the same bug 260806-kbi's build fix left open.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-06T13:40:03Z (approx)
- **Completed:** 2026-08-06T13:52:21Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `scanner-service/src/index.ts` now imports `computeVerdict` from `../../lib/scoring` instead of the `@shared-lib/scoring` tsconfig path alias, with a `//`-comment rationale directly above it explaining the alias is compile-time only and must not be restored.
- Proved the fix against the real built artifact: built the actual `scanner-service/Dockerfile` from repo root, ran the image detached with zero environment variables, and got a genuine HTTP 200 from `/health` — not an existence check on `dist/index.js`, which is exactly what passed last time on a file that crashed on require.
- Ran the negative gate against the container's own `dist/` tree (copied out via `docker cp`, not reconstructed): zero runtime `require` calls through `@shared-lib/*`, `@shared/*`, or `@/*` anywhere in the built output.

## Task Commits

Each task was committed atomically:

1. **Task 1: point the computeVerdict import at a relative path, and record why** — folded into Task 2's commit per the plan's explicit instruction ("Do not commit yet — commit in Task 2, once the container has actually booted").
2. **Task 2: prove the container actually boots and answers /health, then commit** — `4641f79` (fix)

**Plan metadata:** commit pending (orchestrator-owned final commit)

## Files Created/Modified
- `scanner-service/src/index.ts` - `computeVerdict` import changed from `@shared-lib/scoring` to `../../lib/scoring`; added a 5-line rationale comment above the import

## Decisions Made
- Fixed with a relative specifier rather than a runtime module-resolver package (`module-alias`, `tsconfig-paths`, `tsc-alias`) — no new production dependency, no package-legitimacy gate needed, and the file's own line 18 already uses this exact relative depth for shared types.
- Left `scanner-service/tsconfig.json`'s now-unused `@shared-lib/*` mapping in place (noted, not fixed — see below) to keep this a one-line change with a real boot test, per the plan's locked scope.

## Deviations from Plan

None — plan executed exactly as written. Both tasks completed exactly as specified: Task 1's two verification greps passed on the first attempt, and Task 2's full boot-proof sequence (build, run, poll, four assertions, negative gate, teardown, commit) completed with no retries or auto-fixes needed.

## Issues Encountered

None. The build used cached layers from 260806-kbi's earlier work today (base image, `npm ci` layer, `COPY lib/scoring.ts`), so the full `docker build` completed in under 7 seconds of actual work. `/health` returned 200 on the very first poll attempt (1 of 60 allowed).

## Real output, as required by the reporting contract

**Exact `/health` HTTP status and JSON body:**
```
HTTP 200
{"status":"ok","service":"adashi-scanner","timestamp":"2026-08-06T13:51:37.483Z"}
```

**Poll attempts before `/health` answered:** 1 of 60 allowed (interval was 1s; the container was ready on the very first request).

**Container running state and restart count after the probe:**
```
Running=true RestartCount=0
```

**Zero-alias grep result across the built `dist/`:**
```
grep -rF -e 'require("@shared-lib' -e 'require("@shared/' -e 'require("@/' <scratch>/dist | wc -l
0
```

All assertions passed on the first pass; nothing failed, so there is no `docker logs` failure output to report.

## Teardown

Verification container (`prospect-radar-scanner-luk-verify`) force-removed, verify image tag (`prospect-radar-scanner:luk-verify`) removed, scratch directory deleted. The `mcr.microsoft.com/playwright:v1.58.2-noble` base image and Docker build cache were left untouched, as instructed.

## User Setup Required

None - no external service configuration required. This fix does not touch environment variables, Railway config, or any deployment step. It is unpushed and undeployed by design; the orchestrator owns the push and any Railway redeploy trigger.

## Next Phase Readiness

- `scanner-service/src/index.ts` is committed (`4641f79`) and boot-proven locally against the real Dockerfile. Ready for the orchestrator to push and let Railway redeploy.
- **Noted, not fixed (carried from the plan, still open):**
  1. `scanner-service/tsconfig.json`'s `@shared-lib/*` mapping is now unused and still present — a loaded gun for the next value import through it. Deliberately deferred.
  2. `scanner-service/package.json`'s `"start": "node dist/index.js"` is still wrong (actual emit path is `dist/scanner-service/src/index.js`); harmless in production since the Dockerfile CMD overrides it, but a trap for anyone running the service locally from a build. Carried over unchanged from 260806-kbi.
  3. No CI step yet builds the image and curls `/health` automatically — Task 2 of this plan performed that sequence by hand; worth adding as a real check the next time this service's deploy path is touched.
- No blockers for Phase 8 or any other in-flight work. Production is unaffected; Railway is still serving the prior working deployment.

---
*Phase: quick*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: scanner-service/src/index.ts
- FOUND: 4641f79 (git log --oneline --all)
- FOUND: 260806-luk-SUMMARY.md
