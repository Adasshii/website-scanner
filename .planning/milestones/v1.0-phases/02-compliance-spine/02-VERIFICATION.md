---
phase: 02-compliance-spine
verified: 2026-07-20T01:15:00Z
status: passed
score: 5/5 success criteria verified, 8/8 requirements verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 2: Compliance Spine Verification Report

**Phase Goal:** A business that says "stop" is unreachable from that moment on, and the basis for contacting anyone is recorded and versioned.
**Verified:** 2026-07-20
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Unsubscribe returns success only after the suppression is written; clicking twice succeeds both times (CMP-04) | ✓ VERIFIED | `app/api/unsubscribe/[token]/route.ts` `resolveAndSuppress()` `await writeSuppression(...)` runs before `return { ok: true }` (lines 38-45); GET/POST both call this helper and only respond after it resolves. `writeSuppression` (`lib/suppression.ts`) does check-then-insert, idempotent by construction. Integration test `route.integration.test.ts` — "CMP-04: GET verifies, writes the suppression, and returns 200 only after the write" and "CMP-04: clicking the link twice succeeds both times and leaves exactly one active suppression row" — both pass against real local Postgres (109ms/73ms, real DB round-trips, not mocked). |
| 2 | A suppressed record blocks that address AND every other address on the same domain, permanently, from the next send cycle onward (CMP-01, CMP-03, CMP-05) | ✓ VERIFIED | `isSuppressed()` (`lib/suppression.ts:13-25`) runs a single query `.or(email.eq.X,domain.eq.Y)` filtered `.is("lifted_at", null)` — one row blocks the exact email and the whole domain. No expiry/TTL column exists on `suppressions` (migration 014, confirmed by full-file read — no expiry field). Integration test "CMP-03 domain: suppressing sales@ blocks info@ on the same domain" passes (32ms, real DB). Table is the sole source of truth (no caller outside `lib/suppression.ts` writes to it — confirmed by grep). |
| 3 | A hard bounce or spam complaint on the existing Resend webhook lands in the suppression list automatically (CMP-07) | ✓ VERIFIED | `app/api/webhooks/resend/route.ts` extended in place (single route, Svix verification untouched — one `wh.verify(` call, one `RESEND_EVENT_MAP`). Recipient is read back via `.select("email").maybeSingle()` (payload only carries `email_id`, confirmed). On `bounced`/`complained`, `writeSuppression` fires domain-wide, wrapped in try/catch so a failure never breaks the webhook's 200 ack. Integration tests (real Svix-signed requests, real DB): "email.bounced event writes an active domain-wide suppression" (61ms), "email.complained event writes an active domain-wide suppression" (29ms), "does not suppress on a non-bounce/complaint event" (17ms), "fails closed: an unsigned/invalid request is rejected and writes nothing" (13ms) — all pass. |
| 4 | Re-adding a suppressed record is impossible without an explicit override that leaves a log entry (CMP-06) | ✓ VERIFIED | DB-level: `suppressions_email_active_idx` is a **partial unique index** `(email) WHERE lifted_at IS NULL` (migration 014) — a raw duplicate active insert violates this constraint. Integration test "CMP-06: a raw direct insert of a second active row for an already-suppressed email fails at the DB, and writeSuppression treats it as a no-op" passes (57ms, real Postgres). Operator level: `scripts/suppression-override.ts` is the only file in the repo calling `liftSuppression`; it requires both `--email` and `--reason` (fail-closed `OverrideArgsError` if missing), never deletes (grep for `.delete(` in the file returns nothing), and the lift itself writes `lifted_at` + `lifted_by_reason` onto the row — a persisted, permanent log entry (not just console output), consistent with D-09/CMP-15 (indefinite retention of the audit trail). |
| 5 | Joshua can look up which LIA version and which country's regime applies to a given prospect (CMP-08, CMP-16) | ✓ VERIFIED | `scripts/legal-basis.ts` resolves `--email`/`--domain` → prospect → `legal_regimes` (country_code, spam_law_regime, notes_url, current_lia_version) → `lia_versions` (version, effective_from, content_hash) → suppression status, all read exclusively from config tables (grep for a hardcoded `country === 'NL'`-style branch returns nothing). `legal_regimes.current_lia_version` is a hard FK to `lia_versions(version)`. `lia_versions` has a `BEFORE UPDATE OR DELETE` trigger (`prevent_lia_versions_mutation`) enforcing immutability at the DB level. Unit tests cover both an NL fixture and a DE fixture (proving no hardcoded branch) — all pass. Production confirmation (02-07-SUMMARY.md, human-approved 2026-07-20): live Supabase project has all three tables, the partial unique index, the NL row resolving to `opt-out-narrow-exemption` → LIA v1, and the immutability trigger firing with `P0001` on a live UPDATE attempt. |

**Score:** 5/5 success criteria verified, 0 present-but-behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/014_create_suppressions.sql` | `suppressions` table, partial unique active-email index, RLS-enable-no-policy | ✓ VERIFIED | Full-file read confirms exact shape: CHECK-constrained `reason`/`source`, `suppressions_email_active_idx` partial unique, `idx_suppressions_domain_active` partial index, RLS enabled, no policy. |
| `lib/suppression.ts` | `isSuppressed`, `writeSuppression`, `liftSuppression` | ✓ VERIFIED | All three exported, DI-friendly (`sb: SupabaseClient` first arg), reuse `normalizeDomain`, no `.from("prospects")` reference, no `lifecycle_state` reference. |
| `lib/unsubscribe-token.ts` | HMAC sign/verify, no PII, no expiry | ✓ VERIFIED | `createHmac`/`timingSafeEqual` from `node:crypto`, payload carries only `pid`, no expiry field, fails closed when `UNSUBSCRIBE_TOKEN_SECRET` unset. |
| `app/api/unsubscribe/[token]/route.ts` | GET (verify→write→confirm), POST (RFC 8058 one-click) | ✓ VERIFIED | Both handlers present, `resolveAndSuppress` shared helper, POST issues no redirect (grep confirms), fail-closed on bad token/missing secret. |
| `app/api/webhooks/resend/route.ts` | Extended in place for auto-suppression | ✓ VERIFIED | Single route, Svix verification untouched, recipient read-back added, suppression write wrapped and non-fatal. |
| `supabase/migrations/015_create_legal_basis.sql` | `lia_versions` + `legal_regimes` + immutability trigger + NL seed | ✓ VERIFIED | All present; FK from `legal_regimes.current_lia_version` to `lia_versions(version)`; RLS enabled, no policy. |
| `docs/legal/lia/LIA-v1.md` | Immutable DRAFT LIA skeleton | ✓ VERIFIED | DRAFT banner at top, Purpose/Necessity/Balancing/Article 14/Data Minimisation/Country Scope sections present, sha256-hashed and registered in `lia_versions`. |
| `scripts/backfill-suppressions.ts` | One-time D-06 backfill, no email_type filter | ✓ VERIFIED | Query is `status IN ('bounced','complained')` only; unit test proves no `.eq()` email_type predicate is ever applied. |
| `scripts/suppression-override.ts` | Logged lift, no delete, no bulk | ✓ VERIFIED | Requires `--email` + `--reason`, calls `liftSuppression` only, no `.delete(` in file. |
| `scripts/legal-basis.ts` | Country → regime → LIA version + suppression status | ✓ VERIFIED | Reads `legal_regimes`/`lia_versions` exclusively; no hardcoded country branch. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `app/api/unsubscribe/[token]/route.ts` | `lib/unsubscribe-token.ts` | `verifyUnsubscribeToken(token)` gate before any write | ✓ WIRED | Called first in `resolveAndSuppress`; returns `{ ok: false }` (no write) on failure. |
| `app/api/unsubscribe/[token]/route.ts` | `lib/suppression.ts` | `writeSuppression(sb, {...})`, awaited before responding | ✓ WIRED | Confirmed in source; confirmed by integration test timing/behavior. |
| `app/api/webhooks/resend/route.ts` | `lib/suppression.ts` | `writeSuppression` on bounce/complaint after Svix verify | ✓ WIRED | Runs strictly after `.update(...).select("email")`, inside its own try/catch. |
| `scripts/backfill-suppressions.ts` | `lib/suppression.ts` | Per-row `writeSuppression` (idempotent) | ✓ WIRED | Confirmed in source and unit test (dedupe + idempotency). |
| `scripts/suppression-override.ts` | `lib/suppression.ts` | `liftSuppression(sb, { email, reason })` | ✓ WIRED | Sole caller in the repo; confirmed by unit test. |
| `scripts/legal-basis.ts` | `lib/suppression.ts` + migration 015 tables | `isSuppressed` + `legal_regimes`/`lia_versions` lookups | ✓ WIRED | Confirmed in source and unit test (NL + DE fixtures). |
| `lib/suppression.ts` | `lib/domain-normalize.ts` | `normalizeDomain` reused, no second normaliser | ✓ WIRED | Confirmed — only one `export function normalizeDomain` exists repo-wide (`lib/domain-normalize.ts`); every phase-2 file imports it from there. |

### Behavioral Spot-Checks / Test Execution

| Check | Command | Result | Status |
|---|---|---|---|
| Type check | `npx tsc --noEmit` | Clean, no errors | ✓ PASS |
| Full test suite | `npx vitest run` | 13 files, 99 tests, all passed (977ms) | ✓ PASS |
| Suppression integration (real local Postgres) | `lib/suppression.integration.test.ts` (4 tests) | idempotent, re-suppression, no-re-add, domain-wide — all pass, real DB round-trip timings (32-126ms) | ✓ PASS |
| Legal-basis integration (real local Postgres) | `supabase/migrations/015_create_legal_basis.integration.test.ts` (4 tests) | UPDATE and DELETE on `lia_versions` both raise; NL resolution correct | ✓ PASS |
| Unsubscribe route integration | `app/api/unsubscribe/[token]/route.integration.test.ts` (4 tests) | write-before-success, idempotent double-click, one-click non-redirect 2xx, fail-closed forged token | ✓ PASS |
| Resend webhook integration (real Svix signatures) | `app/api/webhooks/resend/route.integration.test.ts` (4 tests) | bounce/complaint suppress, non-suppressing event skipped, forged signature rejected | ✓ PASS |
| Unsubscribe token unit | `lib/unsubscribe-token.test.ts` (6 tests) | round-trip, tamper rejection, malformed rejection, missing-secret throw | ✓ PASS |
| Backfill/override/legal-basis unit (DI-stubbed) | 3 files | dedupe, dry-run, no-email_type-filter, lift-only, no-hardcoded-country | ✓ PASS |

Note: the fast overall wall time (977ms for 99 tests including several real-Postgres integration suites) is consistent with a local Supabase instance already running and warm — individual integration test durations (13-182ms per test) show genuine DB round-trips, not mocked short-circuits, confirming these are not silently skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CMP-01 | 02-01 | Suppression list in Supabase is source of truth | ✓ SATISFIED | `suppressions` table, no writer outside `lib/suppression.ts`, live in production (02-07). |
| CMP-03 | 02-01 | Suppression matches on email AND domain | ✓ SATISFIED | `isSuppressed` `.or(email.eq,domain.eq)`; domain-match integration test passes. |
| CMP-04 | 02-01, 02-03, 02-04 | Unsubscribe endpoint synchronous, idempotent | ✓ SATISFIED | write-before-success + idempotent-double-click integration tests pass. |
| CMP-05 | 02-01, 02-03, 02-04 | Unsubscribe permanent, no delay language | ✓ SATISFIED | No expiry column; re-suppression-after-lift test passes; confirmation copy has no delay wording (source review). |
| CMP-06 | 02-01, 02-06 | No silent re-add without logged override | ✓ SATISFIED | Partial unique index + no-re-add integration test; override CLI is lift-only, sole caller of `liftSuppression`. |
| CMP-07 | 02-05 | Hard bounce/spam complaint auto-suppresses via existing webhook | ✓ SATISFIED | Webhook extended in place; 4 integration tests pass; backfill seeds history (D-06). |
| CMP-08 | 02-02, 02-06 | Versioned LIA in repo, resolvable | ✓ SATISFIED | `LIA-v1.md` + `lia_versions` registry + immutability trigger; `legal-basis.ts` resolves it; live in production. |
| CMP-16 | 02-02, 02-06 | Per-country legal-basis config table, never hardcoded | ✓ SATISFIED | `legal_regimes` table, NL seeded; no hardcoded country branch (grep + DE-fixture test); live in production. |

No orphaned requirements — all 8 phase requirement IDs (CMP-01, 03, 04, 05, 06, 07, 08, 16) appear in plan frontmatter and are traced above. This matches `.planning/REQUIREMENTS.md`'s traceability table, which marks all 8 "Phase 2 / Complete."

### Anti-Patterns Found

Scanned all phase-2 source files (`lib/suppression.ts`, `lib/unsubscribe-token.ts`, `app/api/unsubscribe/[token]/route.ts`, `app/api/webhooks/resend/route.ts`, `scripts/backfill-suppressions.ts`, `scripts/suppression-override.ts`, `scripts/legal-basis.ts`, both migrations, `docs/legal/lia/LIA-v1.md`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/stub patterns.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | none found | — | No debt markers, no stub returns, no hardcoded empty responses in any phase-2 production file. |

One pre-existing, low-severity hygiene item (not a phase-2 code defect): `supabase/migrations/015_create_legal_basis.integration.test.ts` sits under `supabase/migrations/` instead of `lib/` or a test directory — flagged in 02-05-SUMMARY.md's "Deferred Issues" section as harmless (Supabase CLI skips non-`.sql` files on `db reset`) and explicitly out of scope for the plan that noticed it. Does not affect any success criterion. **Informational only, not a gap.**

`ROADMAP.md`'s Phase 2 section still shows `[ ] 02-07-PLAN.md` and "Plans: 6/7 plans executed," even though `02-07-SUMMARY.md` documents the human-verify gate as completed and approved 2026-07-20. This is a documentation-sync lag in `ROADMAP.md`, not a functional gap — the production evidence in `02-07-SUMMARY.md` (live tables, index, NL seed, immutability trigger firing with `P0001`) is authoritative per this verification's instructions. **Informational only, recommend updating ROADMAP.md's checkbox in a follow-up commit, not blocking.**

### Human Verification Required

None. Production schema presence (the one item that cannot be checked directly from this environment) is covered by the human-approved, read-back-verified evidence in `02-07-SUMMARY.md`, which this verification treats as authoritative per its production_note instructions.

### Gaps Summary

No blocking gaps. All 5 ROADMAP success criteria and all 8 phase requirements are verified against actual code (not SUMMARY narrative), with real local-Postgres integration tests exercising the exact behaviors claimed (write-before-success, idempotency, domain-wide matching, no-re-add, auto-suppression, immutability, config-driven regime resolution), plus a human-approved production read-back confirming the schema is live. `npx tsc --noEmit` is clean and the full suite (13 files / 99 tests) is green. All locked decisions (D-01 through D-12) hold in code: D-01 (synchronous suppress), D-02 (idempotent), D-03 (domain-agnostic route), D-04 (minimal capture — only email/domain/reason/source/timestamps), D-05 (bounce+complaint both suppress domain-wide via one path), D-06 (backfill, no email_type filter), D-07 (no prospects/lifecycle_state mutation anywhere in the phase — confirmed by exhaustive grep), D-08 (CLI override), D-09 (lift-not-delete, partial unique index), D-10 (one-output legal-basis lookup), D-11 (immutable-file + DB registry), D-12 (one LIA, per-country regime table, NL seeded).

Two informational, non-blocking hygiene notes are recorded above (a misplaced test file, and a ROADMAP.md checkbox not yet flipped) — neither affects the phase goal or any success criterion.

---

*Verified: 2026-07-20*
*Verifier: Claude (gsd-verifier)*
