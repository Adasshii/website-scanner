---
phase: 7
slug: lifecycle-reporting-retention
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-31
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by plan-phase from `07-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.x (`vitest.config.ts`, projects: `unit` + `integration`) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run --project unit` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60s full suite (348 tests green as of Phase 6) |

**Concurrency constraint:** the `integration` project runs `fileParallelism: false` against the
shared local Supabase instance. Do not run `npm test` in parallel shells — integration tests
must serialize or they corrupt each other's fixtures.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --project unit`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Task IDs are filled in by the planner. Requirement → behaviour → command mapping is
> pre-seeded from research and is binding.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | TRK-01, TRK-02 | — | `deriveLifecycleState()` returns the correct fine state for every marker combination, including the terminal short-circuit for `rejected` / `no_website` | unit | `npx vitest run lib/lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRK-01, TRK-02 | — | A `lifecycle_state = 'rejected'` row is never overwritten by funnel grouping or the Shortlist column, even when other markers advance | unit | `npx vitest run lib/lifecycle.test.ts -t rejected` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRK-05 | — | Per-day aggregate counts match manually-seeded fixture rows across a UTC day boundary | integration | `npx vitest run lib/reporting-aggregates.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRK-04 | — | Fillout webhook attributes a booking by email-exact and by domain-fallback; a DB failure in the attribution step still returns 200 and leaves `leads` updated | integration | `npx vitest run app/api/webhooks/fillout/route.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CMP-13, CMP-14 | — | Dry-run reports the correct expiring-row count and writes nothing; anonymize clears exactly the named fields and preserves timestamps/scores; delete succeeds without FK violation given the 3-step order | integration | `npx vitest run lib/retention.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CMP-15 | — | A suppression row older than the retention window survives a full retention run, in every mode | integration | `npx vitest run lib/retention.integration.test.ts -t suppression` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | TRK-03, TRK-04 (UI-SPEC E1/E2 backstop) | — | The sent-gate renders the awaiting-copy treatment when closed and real numbers when open, for both the funnel cards and every per-day table cell | UI-state (held-out) | `npx vitest run app/admin/reporting-gate.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/lifecycle.test.ts` — TRK-01/TRK-02, the full precedence ladder, and the `rejected` / `no_website` terminal short-circuit
- [ ] `lib/reporting-aggregates.integration.test.ts` — TRK-05 per-day counts plus the UTC-day-boundary edge case
- [ ] `app/api/webhooks/fillout/route.integration.test.ts` (new, or extend if one already exists — confirm at plan time) — TRK-04 email/domain attribution and the D-7-09 fire-and-forget guarantee
- [ ] `lib/retention.integration.test.ts` — CMP-13/14/15, including the mandatory suppression-survives-the-job assertion (D-7-19) and an explicit assertion on FK-safe delete ordering, not merely "the job completed without throwing"
- [ ] `app/admin/reporting-gate.test.tsx` — held-out UI-state test for the two UI-SPEC `backstop` rows, asserting rendered output with the gate both closed and open

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Monthly retention cron actually fires on Vercel | CMP-13 | A monthly schedule cannot be observed inside a test run; only the handler's behaviour is automatable | After deploy, confirm the cron appears in the Vercel dashboard with schedule `0 3 1 * *`, then invoke the route manually once with `RETENTION_MODE=dry-run` and check the returned counts against a SQL count of expiring rows |

---

## Non-Negotiable Assertions

Two items here fail **silently** and must not be accepted on code inspection:

1. **The sent-gate backstop rows (UI-SPEC E1/E2 `partial`).** A broken gate renders a plausible
   `0%`, which reads as a valid answer. "The derivation function has a unit test" is NOT
   sufficient evidence. The component/page render output must be asserted with the gate open and
   closed.
2. **Suppression survival (CMP-15, D-7-19).** CONTEXT.md requires this exact test. Deleting a
   suppression record to satisfy a generic retention job recreates the precise problem retention
   exists to prevent.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
