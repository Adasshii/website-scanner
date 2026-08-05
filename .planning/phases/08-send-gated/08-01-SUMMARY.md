---
phase: 08-send-gated
plan: 01
subsystem: compliance
tags: [supabase, postgres, next.js, admin-api, gdpr, cmp-02, cmp-10]

# Dependency graph
requires:
  - phase: 02-compliance-spine
    provides: isSuppressed()/writeSuppression()/liftSuppression() (lib/suppression.ts), signUnsubscribeToken()/verifyUnsubscribeToken() (lib/unsubscribe-token.ts), the /api/unsubscribe/[token] endpoint, and legal_regimes/lia_versions (migration 015)
  - phase: 06-draft-generation-approval-queue
    provides: outreach_messages, the admin Outreach tab (OutreachTable/OutreachRowPanel), ARTICLE_14_NOTICE_EN/NL and appendArticle14Notice (lib/draft-prompt.ts), localeForCountry
provides:
  - send_records table (immutable, unique per outreach_message_id) — the audit-record schema for a future "mark as sent" step
  - legal_regimes.legal_basis / legal_regimes.article_14_notice_approved — the two counsel-supplied gate columns, created unset
  - outreach_messages.prepared_at — the short-lived prepared-state stamp (D-04)
  - lib/send-gate.ts — evaluateSendGates() (the nine-member refusal sequence), prepareSend(), computePreparedHash()
  - lib/opt-out-link.ts — buildUnsubscribeUrl()/buildOptOutLine()/renderSendableBody(), the SND-02 opt-out mechanism
  - POST /api/admin/outreach/send (action "prepare") — the only route that can reach the gate
  - "Prepare send" button in the outreach row panel, visible on approved drafts
affects: [08-send-gated (plans 02/03: mark-as-sent, isolation gate), any future automated-dispatch milestone]

actuals:
  tokens: 12823
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Fixed-order refusal gate: evaluateSendGates() returns on first failure, suppression checked before any legal-config read (T-08-01-02)"
    - "DB-level immutability trigger (BEFORE UPDATE OR DELETE, guarded by pg_trigger existence check) reused from migration 015's lia_versions pattern for send_records"
    - "Permanent idempotent test fixture (check-then-insert on a stable marker) as the accepted alternative to fighting an immutable-table's DELETE block in test cleanup"

key-files:
  created:
    - supabase/migrations/020_create_send_records.sql
    - lib/send-gate.ts
    - lib/send-gate.integration.test.ts
    - lib/opt-out-link.ts
    - lib/opt-out-link.test.ts
    - app/api/admin/outreach/send/route.ts
  modified:
    - components/admin/outreach-row-panel.tsx

key-decisions:
  - "D-05 implemented literally: both CMP-02 (suppression) and CMP-10 (Article 14 notice) gates refuse rather than warn, and suppression is checked live at Prepare, never against anything cached at draft time"
  - "D-07 implemented literally: legal_basis is created nullable with no seed, article_14_notice_approved defaults false, and three separate acceptance-criteria greps (no `= true`, no `set legal_basis`, no `insert into legal_regimes`) plus a shipped-configuration integration test all assert the gate stays shut"
  - "Already-sent and non-first-contact test cases use one permanent, idempotently-created fixture (prospect + legal_regimes row + two outreach_messages rows + one send_records row) instead of deleting fixture rows the immutability trigger would reject; documented in the test file header as accepted residue, not a leak"

patterns-established:
  - "A gate module (lib/send-gate.ts) that only ever reads legal config and never writes a legal value, verified by grep gates on the migration and the module itself — a template for any future counsel-supplied-config consumer"

requirements-completed: [CMP-02, CMP-10, SND-02]

coverage:
  - id: D1
    description: "Migration 020 creates send_records (immutable via BEFORE UPDATE OR DELETE trigger, unique per outreach_message_id), legal_regimes.legal_basis (nullable, unseeded) and .article_14_notice_approved (default false), and outreach_messages.prepared_at — idempotent on a second run"
    requirement: CMP-10
    verification:
      - kind: integration
        ref: "supabase migration up (applied); docker exec psql re-run of 020_create_send_records.sql (all NOTICE/skip, zero errors)"
        status: pass
      - kind: integration
        ref: "docker exec psql transaction: UPDATE and DELETE on a real send_records row both raise prevent_send_records_mutation(), then ROLLBACK"
        status: pass
    human_judgment: false
  - id: D2
    description: "evaluateSendGates() runs the fixed nine-member refusal sequence (not-approved, already-sent, no-contact-email, contact-classification-unset, suppressed, no-legal-regime, legal-basis-unset, article-14-notice-not-approved, notice-missing-from-body) and returns ok:true with a full context only when every gate passes"
    requirement: CMP-02
    verification:
      - kind: integration
        ref: "lib/send-gate.integration.test.ts — 13 tests, one per refusal member (not-approved x2) plus a non-first-contact case and a field-by-field ok:true assertion"
        status: pass
    human_judgment: false
  - id: D3
    description: "CMP-10: a first-contact send is refused unless article_14_notice_approved is true AND the locale's exact notice text is present in draft_body; a prospect with a prior send_records row is exempt from both checks"
    requirement: CMP-10
    verification:
      - kind: integration
        ref: "lib/send-gate.integration.test.ts#article-14-notice-not-approved, #notice-missing-from-body, #non-first-contact"
        status: pass
    human_judgment: false
  - id: D4
    description: "renderSendableBody() composes a PII-free, one-step opt-out link (Unsubscribe/Afmelden + the Phase 2 unsubscribe URL) after any existing Article 14 notice, idempotently, and never persists it into stored draft_body"
    requirement: SND-02
    verification:
      - kind: unit
        ref: "lib/opt-out-link.test.ts — 7 tests covering URL shape, no-PII, both locale labels, trim/blank-line/opt-out-line composition, idempotence, and notice-then-opt-out ordering"
        status: pass
    human_judgment: false
  - id: D5
    description: "POST /api/admin/outreach/send is admin-secret gated (401 with no header), returns 409 with {refusal, detail} on a gate refusal, and 200 with the rendered subject/body/preparedHash on success; a Prepare send button (approved rows only) surfaces the refusal in the existing role=alert banner"
    verification:
      - kind: integration
        ref: "curl -X POST .../api/admin/outreach/send with no x-admin-secret header -> 401 (verified against a locally-started next dev server)"
        status: pass
      - kind: unit
        ref: "npx tsc --noEmit across app/api/admin/outreach/send/route.ts and components/admin/outreach-row-panel.tsx"
        status: pass
    human_judgment: true
    rationale: "The visible red banner reading 'Send refused: legal-basis-unset' in the actual admin UI (the plan's own <human-check>) was not driven through a real browser session in this run — the route's refusal behavior is proven at the function level (same evaluateSendGates() the route calls) and the 401 gate is proven over real HTTP, but the rendered banner text itself needs a human or browser-automation pass to confirm visually."

duration: ~24min
completed: 2026-08-05
status: complete
---

# Phase 8 Plan 1: Send Gate Foundation Summary

**Migration 020, `lib/send-gate.ts`'s nine-member refusal gate, `lib/opt-out-link.ts`'s PII-free opt-out link, and a Prepare-send route+button that end-to-end refuses every real draft with `legal-basis-unset` under the shipped, unset counsel configuration.**

## Performance

- **Duration:** ~24 min
- **Started:** 2026-08-05T11:22:00+02:00 (approx.)
- **Completed:** 2026-08-05T11:46:32+02:00
- **Tasks:** 3 completed
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `send_records` exists with a database-level immutability trigger (blocks UPDATE and DELETE), verified against real inserted rows inside a rolled-back transaction, not just an empty-table no-op.
- `evaluateSendGates()` implements the full nine-member `SendGateRefusal` union in a fixed check order (suppression before any legal-config read), proved by 13 integration tests against real local Postgres — one test per refusal member, a non-first-contact exemption case, and a field-by-field `ok: true` assertion.
- The shipped configuration (migration 020's unset `legal_basis`, unset-by-default `article_14_notice_approved`) is proven, not assumed, to refuse every Prepare attempt with `legal-basis-unset` — the phase's central claim.
- `renderSendableBody()` composes a one-step, PII-free opt-out link after any Article 14 notice, idempotently, without ever writing it into persisted `draft_body`.
- The admin Outreach panel gained a "Prepare send" button (approved rows only) wired to a new admin-secret-gated route; the 401 unauthenticated path is verified over real HTTP.
- No counsel value (legal_basis, article_14_notice_approved, tw_exemption_claimed) is set anywhere in code, migration, or seed — enforced by grep gates that pass, and by the hard scope fence being respected throughout.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end refusal path (migration 020, the gate, the route, one button)** - `cfde275` (feat)
2. **Task 2: Opt-out link inside the copied body** - `e74966a` (test, RED) → `391a0b4` (feat, GREEN) → `a9a342b` (feat, route wiring)
3. **Task 3: The full refusal matrix, proved against a real database** - `4de2a8a` (test)

_Note: Task 2 followed the TDD RED→GREEN cycle plus a separate wiring commit to move `prepareSend()` into the route._

## Files Created/Modified

- `supabase/migrations/020_create_send_records.sql` - `send_records` (17 columns, immutable, unique per message), `legal_regimes.legal_basis`/`.article_14_notice_approved` (both unset), `outreach_messages.prepared_at`
- `lib/send-gate.ts` - `evaluateSendGates()`, `prepareSend()`, `computePreparedHash()`, `PREPARED_TTL_MINUTES`
- `lib/send-gate.integration.test.ts` - 13 tests against real local Postgres: every refusal member, the non-first-contact exemption, and a field-by-field `ok: true` case
- `lib/opt-out-link.ts` - `buildUnsubscribeUrl()`, `buildOptOutLine()`, `renderSendableBody()`, `OPT_OUT_LABEL_EN`/`_NL`
- `lib/opt-out-link.test.ts` - 7 unit tests covering URL shape, PII-freedom, labels, composition, idempotence, and notice ordering
- `app/api/admin/outreach/send/route.ts` - `POST` handler for `action: "prepare"`, admin-secret gated, 409 on refusal
- `components/admin/outreach-row-panel.tsx` - "Prepare send" button (approved rows only), refusal rendered in the existing `role="alert"` banner

## Decisions Made

- Kept `evaluateSendGates()`'s check order exactly as specified (status → already-sent → contact email → classification → suppression → legal regime → legal basis → Article 14), matching T-08-01-02's threat mitigation that suppression can never be masked by a misconfigured legal_regimes row.
- Used a permanent, idempotently-created fixture (one prospect, one `legal_regimes` row for a fake country `XX`, two `outreach_messages` rows, one `send_records` row) for the `already-sent` and non-first-contact test cases, rather than attempting to delete rows the immutability trigger would reject. Documented in the integration test's file header as intentional, bounded residue (never grows across runs — verified by re-running the suite and confirming row counts stayed at 1/1/2).
- `UNSUBSCRIBE_BASE_URL` in `lib/opt-out-link.ts` is a bare literal with zero env-var fallback (unlike `lib/draft-generator.ts`'s `REPORT_BASE_URL`, which does read `NEXT_PUBLIC_SITE_URL` with a literal fallback) — the plan's acceptance criteria required zero `process.env` references in this file, which is a stricter bar than the file it was modeled after.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `lib/send-gate.integration.test.ts`'s first `ok:true` fixture originally used a draft body that did not contain the real Article 14 notice text**
- **Found during:** Task 1, writing the shipped-config + ok:true integration tests
- **Issue:** The fixture prospect is a first-contact case by construction (zero prior `send_records`), so `evaluateSendGates()` requires `draft_body` to contain the exact locale notice text (`ARTICLE_14_NOTICE_EN`, since the fixture country resolves to locale `en`). A placeholder string like `"Article 14 notice placeholder..."` does not match and produces `notice-missing-from-body` instead of `ok: true`.
- **Fix:** Built the fixture body through `appendArticle14Notice("Body text.", "en")` (the same helper `lib/draft-prompt.ts` exports and the app itself uses), so the test fixture matches real production behavior rather than a stand-in string.
- **Files modified:** `lib/send-gate.integration.test.ts`
- **Verification:** `npx vitest run lib/send-gate.integration.test.ts` — the `ok:true` test passes.
- **Committed in:** `cfde275` (part of Task 1's commit; caught and fixed before the commit, not as a follow-up)

---

**Total deviations:** 1 auto-fixed (Rule 3, blocking issue in a test fixture, caught before commit)
**Impact on plan:** No scope creep. The fix made the test fixture match real application behavior instead of loosening any assertion.

### Noted Discrepancy (not a deviation — no file touched)

The plan's acceptance criteria for Task 1 states: `grep -c "ARTICLE_14_NOTICE_EN" lib/draft-prompt.ts` returns exactly 2 ("declaration and use in `appendArticle14Notice`"), "unchanged from before this task." `lib/draft-prompt.ts` was never read-write touched by this plan (confirmed via `git diff` — empty, no status entry). The actual count is 3: the declaration (line 122), the usage inside `appendArticle14Notice` (line 132), and a third occurrence inside the file's own header doc-comment (line 9: "ARTICLE_14_NOTICE_EN and ARTICLE_14_NOTICE_NL are drafted from..."), which the plan's author appears to have not counted when writing the criterion. The substantive requirement — the file is unmodified by this plan — is satisfied and verified; the literal grep count in the criterion was written against a mistaken baseline.

## Issues Encountered

None beyond the deviation and discrepancy noted above.

## User Setup Required

None for local development or this plan's own verification — everything needed was already running (local Supabase, migrations 001-019). Production DDL for migration 020 is Joshua's own deliberate manual step (Supabase Dashboard SQL Editor), per this plan's `user_setup` block, and was not performed as part of this execution — the plan's hard scope fence requires it to stay a human action, not something the executor pushes.

## Next Phase Readiness

`send_records`, the gate, the opt-out mechanism, and the Prepare route/button are all in place and proven to refuse under the shipped, legally-unset configuration. Plan 08-02 (mark-as-sent) and 08-03 (isolation gate, SND-03/04 verification) can now build on `prepareSend()`'s rendered subject/body/preparedHash output. No blockers. The legal half of the Phase 8 gate (counsel's `legal_basis` and `article_14_notice_approved` values) remains deliberately open — this plan's entire point was to prove the mechanism refuses correctly while that gate stays shut.

---
*Phase: 08-send-gated*
*Completed: 2026-08-05*

## Self-Check: PASSED

All 7 created/modified files confirmed present on disk; all 5 task commit hashes (`cfde275`, `e74966a`, `391a0b4`, `a9a342b`, `4de2a8a`) confirmed in `git log --oneline --all`.
