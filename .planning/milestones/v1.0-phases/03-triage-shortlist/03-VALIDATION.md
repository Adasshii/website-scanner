---
phase: 3
slug: triage-shortlist
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-20
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Test-architecture detail lives in 03-RESEARCH.md §"Validation Architecture" —
> the planner lifts per-task rows from there into the map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already installed) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <file>` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Typecheck** | `npx tsc --noEmit` |
| **Estimated runtime** | ~10–30 seconds (unit); integration tests hit local Supabase |

Convention: colocated `*.test.ts` (unit) and `*.integration.test.ts` (real DB),
matching `lib/suppression.test.ts` / `lib/prospect-upsert.integration.test.ts`.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Populated by the planner from 03-RESEARCH.md §Validation Architecture. Core
> properties that MUST have automated proof (Nyquist targets):

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 3-01-xx | 01 | 1 | TRI-01..05 | — | Triage signals extracted from raw HTML, no browser in path | unit | `npx vitest run lib/triage-*.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-xx | 01 | 1 | TRI-06 | — | Score is deterministic + monotonic; D-01 gate always tops unreachable/no-HTTPS | unit (property) | `npx vitest run lib/triage-score.test.ts` | ❌ W0 | ⬜ pending |
| 3-0x-xx | — | — | TRI-02 | T-3-SSRF | Per-hop URL re-validated (validateUrlSafe) on every redirect Location | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 3-0x-xx | — | — | TRI-09 | — | Ceiling NEVER exceeded regardless of cutoff permissiveness (independent of TRI-08) | unit (property) | `npx vitest run` | ❌ W0 | ⬜ pending |
| 3-0x-xx | — | — | TRI-08 | — | Worst-N selection correct; excludes already-released; cutoff filters live | unit + integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| 3-0x-xx | — | — | TRI-09 | — | Re-triage idempotency: skips released prospects; re-import never touches triage | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Triage HTML/redirect/robots fixtures (canned responses) — mirror the Phase 1
      Overture-fixtures pattern; needed for deterministic signal-extraction tests
- [ ] `lib/triage-score.test.ts` — property/deterministic stubs for TRI-06 scorer + D-01 gate
- [ ] Ceiling/worst-N release stubs for TRI-08/09 (no new framework — vitest present)

*Framework already installed; no install task needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sliding the cutoff visibly re-shuffles the shortlist | TRI-08 | UI interaction on admin surface | Open admin shortlist, change cutoff, confirm eligible set + count update live |
| `npm run triage` end-to-end against real prospects | TRI-01..05 | Hits live sites over the network | Run with `--dry-run --limit 5`, confirm summary + no browser/AI in path |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (triage fixtures)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
