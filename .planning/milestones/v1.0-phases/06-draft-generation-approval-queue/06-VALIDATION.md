---
phase: 6
slug: draft-generation-approval-queue
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-28
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `06-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (node environment, `passWithNoTests: true`) |
| **Config file** | `vitest.config.ts` (repo root) |
| **Quick run command** | `npx vitest run lib/draft-*.test.ts lib/scoring.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) |
| **Estimated runtime** | ~30 seconds (full suite, current repo) |

**Integration-test constraint (project-critical):** `.env.local` points at the REMOTE
production Supabase. Any integration test MUST be pinned to the local Supabase at
127.0.0.1 via `.env.development.local` before it runs, or it reads and writes production.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched-file>.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus one manual production
  smoke test — confirm a draft row appears for a real prospect scan even when the
  scanner-service log shows the 10s callback timeout (RESEARCH assumption A1)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. This map is keyed by requirement until then;
> the executor fills Task ID and Status columns as plans are written and run.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 1 | DRA-06 | — | N/A | unit | `npx vitest run lib/scoring.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DRA-02 | — | N/A | unit | `npx vitest run lib/draft-metric-selector.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DRA-05 | — | Article 14 notice cannot be dropped by the model | unit | `npx vitest run lib/draft-generator.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DRA-01, DRA-04 | T-06-PI | Verbatim-metric guard discards a generation that omits the required fact | unit (injectable `deps.generate`) | `npx vitest run lib/draft-generator.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DRA-03 | T-06-SSRF | Report link is code-constructed same-origin, never user-supplied | unit | `npx vitest run lib/draft-generator.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-6-05, D-6-06, D-6-07 | T-06-REJ | Eligibility gate skips named-person / no-email / lifecycle_state='rejected' prospects without throwing | integration (local Supabase) | `npx vitest run app/api/internal/scan-complete/route.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | QUE-02, QUE-03, DRA-06 | T-06-AC | Admin-secret gate on every new outreach route | integration (local Supabase) | `npx vitest run app/api/admin/outreach/route.integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | QUE-01, QUE-04, QUE-05 | — | Single-open invariant makes bulk approval unrepresentable | manual UAT | manual — no component-test harness in this repo | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/scoring.test.ts` — `lib/scoring.ts` has **no test file today**; needed before the
      DRA-06 consolidation can be verified against known-score fixtures
- [ ] `lib/draft-metric-selector.test.ts` — pure-function tests, same shape as
      `lib/contact-extraction.test.ts`
- [ ] `lib/draft-generator.test.ts` — prompt/guard tests, same shape as
      `lib/scanner-design-prompt.test.ts` (string assertions on the built prompt)
- [ ] `lib/draft-prompt.test.ts` — versioned prompt file assertions
- [ ] `app/api/internal/scan-complete/route.integration.test.ts` — this route has **zero
      tests today**; needed to cover the new `prospect_id` branch without disturbing the
      existing email-lead branch
- [ ] `app/api/admin/outreach/route.integration.test.ts` — new admin route; confirm during
      planning whether any existing admin route has a test pattern to mirror

No framework install needed — Vitest is already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Single-open expandable row; expanding a second row collapses the first | QUE-05 | No React Testing Library anywhere in this repo; admin UI has always been manually verified (project convention, see Phase 4.1 and Phase 5 UAT) | Open the Outreach tab with ≥2 pending drafts. Expand row A, then row B. Assert row A collapses and no state exists in which both are actionable. |
| Evidence pane sits beside the draft and the cited number is verifiable against the linked report | QUE-04, DRA-02 | Requires reading a real generated draft against a real scan | Expand a real draft. Compare the highlighted cited number against `/report/[scanId]` opened from the same panel. |
| Draft tone lands as helpful rather than insulting | DRA-04 | Subjective; ROADMAP requires the first N drafts be read by Joshua before the pattern is trusted (Pitfall 5) | Read the first 5 generated drafts end to end before approving any. |
| A draft row appears for a real prospect scan in production | D-6-05 | Depends on the live scanner-service callback, which logs a 10s timeout (RESEARCH assumption A1) | After a real bulk scan completes, confirm the `outreach_messages` row exists despite the callback-timeout log line. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] Integration tests pinned to local Supabase (not the remote in `.env.local`)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
