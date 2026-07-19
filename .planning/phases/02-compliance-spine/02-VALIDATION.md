---
phase: 2
slug: compliance-spine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-19
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `02-RESEARCH.md` → `## Validation Architecture` (all rows grounded in verified codebase conventions).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.10 (`[VERIFIED: package.json]`) |
| **Config file** | `vitest.config.ts` (node env, `passWithNoTests: true`, `@/*` alias) |
| **Quick run command** | `npx vitest run <path/to/file>.test.ts` |
| **Full suite command** | `npx vitest run` (script: `npm test`) |
| **Estimated runtime** | ~5s unit-only · ~30s incl. local-Supabase integration |

**Two existing conventions to follow exactly (both verified in-repo):**
- **Unit** (`*.test.ts`): DI stubs, no real DB — pattern: `scripts/import-prospects.test.ts` (`ImportDeps` seam + `vi.fn()`).
- **Integration** (`*.integration.test.ts`): real local Supabase (`supabase start && supabase db reset`), local-only demo service-role JWT — pattern: `lib/prospect-upsert.integration.test.ts:6-27`. Scoped `afterEach` cleanup via a distinctive test-only email/domain prefix.

---

## Sampling Rate

- **After every task commit:** Run the quick-run command scoped to the file(s) the task touched.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd-verify-work`:** Full suite green, plus a manual local click-test of `/api/unsubscribe/[token]`.
- **Max feedback latency:** ~30 seconds.

---

## Per-Task Verification Map

> Task ID / Plan / Wave bind when the planner assigns tasks (`TBD@plan`). Rows are keyed by requirement from research. Threat Ref is set by each PLAN.md `<threat_model>`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD@plan | TBD | TBD | CMP-01/03 | — | `isSuppressed()` matches exact email AND any address on a suppressed domain (blocks-entire-domain property) | unit | `npx vitest run lib/suppression.test.ts -t "domain"` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-04 | — | Unsubscribe write path called twice both succeed; exactly one active row after (idempotent) | integration | `npx vitest run lib/suppression.integration.test.ts -t "idempotent"` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-04 (token) | — | `verifyUnsubscribeToken` rejects tampered + malformed tokens, round-trips a valid signed token | unit | `npx vitest run lib/unsubscribe-token.test.ts` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-05 | — | A lifted-then-re-suppressed email is blocked by the new row, not the lifted one | integration | `npx vitest run lib/suppression.integration.test.ts -t "re-suppression"` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-06 | — | Duplicate active row for an already-suppressed (non-lifted) email fails at DB partial-unique index / no-ops; never a 2nd active row | integration | `npx vitest run lib/suppression.integration.test.ts -t "no re-add"` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-07 | — | Svix-verified `email.bounced`/`email.complained` payload writes a new active suppression row with correct domain | integration | `npx vitest run app/api/webhooks/resend/route.integration.test.ts -t "auto-suppress"` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-07 (backfill) | — | `backfill-suppressions.ts` over fixture `bounced`/`complained` `email_events` → one active suppression per distinct email, domain normalised | integration | `npx vitest run scripts/backfill-suppressions.test.ts` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-08/16 | — | `legal-basis.ts` resolves an NL prospect fixture to seeded `legal_regimes` row + current `lia_versions` row | integration | `npx vitest run scripts/legal-basis.test.ts` | ❌ W0 | ⬜ pending |
| TBD@plan | TBD | TBD | CMP-08 (immutable) | — | `UPDATE` on an existing `lia_versions` row raises a DB error (immutable-versioning property) | integration | `npx vitest run supabase/migrations/015.integration.test.ts -t "immutable"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/suppression.test.ts` — unit coverage for `isSuppressed()` domain-matching (DI-stubbed, no DB)
- [ ] `lib/suppression.integration.test.ts` — idempotency, re-suppression, no-re-add-without-override (real local Supabase, migrations 014–015 applied)
- [ ] `lib/unsubscribe-token.test.ts` — HMAC sign/verify round-trip + tamper rejection (pure unit)
- [ ] `app/api/webhooks/resend/route.integration.test.ts` — auto-suppression on bounced/complained (new coverage — no existing test found for this route)
- [ ] `scripts/backfill-suppressions.test.ts`, `scripts/suppression-override.test.ts`, `scripts/legal-basis.test.ts` — CLI DI-seam pattern per `scripts/import-prospects.test.ts`
- [ ] `supabase/migrations/015.integration.test.ts` (or equivalent) — asserts `lia_versions` immutability trigger raises on UPDATE
- [ ] Framework install: none — Vitest already configured project-wide

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/api/unsubscribe/[token]` end-to-end | CMP-04 | Browser render + route GET/POST round-trip not covered by unit/integration | Local: GET the signed token URL → confirmation renders; POST → 200 empty; re-POST → 200 (idempotent). Verify a new active `suppressions` row exists. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
