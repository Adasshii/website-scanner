---
phase: 4
slug: bulk-scan-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-21
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (already in root `package.json`) |
| **Config file** | none dedicated — follows existing `lib/*.test.ts` / `lib/*.integration.test.ts` convention |
| **Quick run command** | `npx vitest run lib/<file>.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds (full suite) |

Note: `scanner-service/` has **zero** test files today (documented in CONCERNS.md). This phase adds the minimal harness for its own new capacity-check logic only — not a full retrofit.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run lib/<file>.test.ts` for the touched file
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _populated during execution_ | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Requirement-level map (from research, pre-task-breakdown):

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| SCAN-01 | Released prospects transition queued→scanning without exceeding set concurrency | integration | `npx vitest run lib/scan-drain.integration.test.ts` | ❌ W0 |
| SCAN-02 | `full-async` returns 503 (not 200-then-timeout) at the bulk ceiling | integration | scanner-service capacity test | ❌ W0 |
| SCAN-03 | `scan_status` moves queued→scanning→done/failed and admin API surfaces it | integration | shortlist route integration test | ❌ W0 |
| SCAN-04 | Failed prospect's attempt counter stays at 1, never auto-retried, excluded from later claims | unit + integration | `npx vitest run lib/scan-claim.test.ts` | ❌ W0 |
| SCAN-05 | robots.txt-disallowed prospects skipped before dispatch; bulk UA differs from public UA | unit | `npx vitest run lib/bulk-scan-dispatch.test.ts` | ❌ W0 |
| SCAN-06 | Public scanner's success rate holds during a bulk run | manual + log-based | see below | — |
| SCAN-07 | A `done` prospect's report renders at `/report/[id]` identically to a public report | manual smoke | — | — |
| CMP-17 | Design-analysis prompt carries the no-profiling instruction | unit (string assertion) | prompt test on `scanner-service/src/ai.ts` | ❌ W0 |

---

## Wave 0 Requirements

- [ ] `lib/scan-claim.test.ts` — SCAN-04 (attempt counter, no re-claim of claimed rows)
- [ ] `lib/scan-drain.integration.test.ts` — SCAN-01 (concurrency bound, claim-batch correctness under simulated overlap)
- [ ] `lib/bulk-scan-dispatch.test.ts` — SCAN-05 (robots.txt skip, correct UA)
- [ ] scanner-service capacity-check test harness — SCAN-02 (minimal, new logic only)
- [ ] `scripts/check-public-scanner-health.ts` — SCAN-06 before/after measurement script

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public scanner success rate holds through a bulk run | SCAN-06 | Live-system observation, not a pure function | 1. Before the batch, compute `count(status='completed') / count(*)` over `scans` where `prospect_id IS NULL`, trailing 7–14 days. 2. Re-run the identical query immediately after the batch, same window, same `prospect_id IS NULL` filter (so bulk failures never contaminate the metric). 3. Pass if the post-batch rate is within the agreed tolerance (~5pp) of baseline. Log both numbers. |
| Report renders at hosted URL identically to a public report | SCAN-07 | Visual/structural comparison of a rendered page | Open a `done` prospect's `/report/[id]`, compare form against an existing public-scanner report |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
