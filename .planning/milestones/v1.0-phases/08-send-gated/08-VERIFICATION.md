---
phase: 08-send-gated
verified: 2026-08-05T12:50:00Z
status: human_needed
score: 4/5 must-haves verified (mechanism-proven), 1 present-but-behavior-unverified (blocked on counsel by design)
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Walk the full Prepare flow live in a browser (not curl/vitest): admin Outreach tab, filter to approved, expand a real approved draft, press Prepare send."
    expected: "A red role=alert banner reads 'Send refused: legal-basis-unset.' plus the detail line; no copy/mark block renders; nothing about the draft changes."
    why_human: "08-01, 08-02 and 08-03 each proved the underlying route/gate behavior via vitest and one production curl walkthrough, but none drove an actual browser paint of the panel. Rendering, spacing and interaction of the Prepare/Copy/Mark UI have not been visually confirmed (08-01-SUMMARY D5, 08-02-SUMMARY D2/D3 all mark human_judgment: true for this reason)."
  - test: "Switch the Outreach tab to the fourth 'Sent' filter."
    expected: "The filter loads with zero rows (no real send has ever completed), and no row anywhere carries the 'PREPARED, NOT SENT' amber marker."
    why_human: "Same class of gap as above — the count fetch and filter wiring are proven server-side, the actual tab switch was not driven through a browser."
  - test: "Once counsel supplies legal_regimes.legal_basis and sets article_14_notice_approved for NL, run one real Prepare -> Mark as sent -> expand the row and confirm the 'Why were we allowed to email this business?' block renders all eleven fields correctly for that first genuine send."
    expected: "The audit block shows sent-at, resolved address, classification, first contact, legal basis, LIA version, Tw exemption claimed, notice-included, approved by, suppression-checked-at and suppression result — all matching what was actually sent."
    why_human: "This is Success Criterion 5's actual claim (CMP-09/CMP-11/CMP-12) exercised against real data. It is provably unexercisable today: local and production `legal_regimes.legal_basis` are both NULL for NL, so zero real send_records rows exist anywhere. The mechanism is proven against fixtures only (lib/send-audit.integration.test.ts, components/admin/outreach-row-panel.test.tsx) — this is the deliberate deferral the phase was authorized to ship with, not a defect, and it cannot be closed by more code or more test-writing. It can only be closed by counsel's answer plus one real walkthrough afterward."
---

# Phase 8: Send — GATED Verification Report

**Phase Goal:** An approved message reaches a real business through a channel that permits it, with the proof of why it was allowed to.
**Verified:** 2026-08-05
**Status:** human_needed
**Re-verification:** No — initial verification

## Read this first: what "done" means for this phase

Phase 8's goal has two halves, and only one of them was ever in scope to close now. The provider half of the Parallel Track closed 2026-08-04 (manual send, no dispatch provider). The legal half — the Telecommunicatiewet art. 11.7 exemption question, the Legitimate Interest Assessment, and the Article 14 notice wording — is still open with external counsel. ROADMAP.md's own narrowed directive (2026-08-04) authorized building and gating the mechanism, explicitly not opening it: "Build the gate, do not open it."

Confirmed directly against the local database (mirroring what 08-03's own production curl walkthrough reports for the live system): `legal_regimes` for country `NL` carries `legal_basis = NULL` and `article_14_notice_approved = false`. That is the intended, correct, shipped state. **No message has reached, or could reach, a real business through this code, and that is not a gap** — it is the phase working as designed. I did not independently query production Supabase in the course of this verification (this repo's `.env.local` points at production and `supabase db push` is forbidden by convention); I relied on direct source review to confirm the write-path guarantee below, which makes the claim provider-independent.

What this verification actually checks: is the mechanism — the gate, the two-step Prepare/Mark flow, the immutable audit record, the opt-out link, and the isolation guard — real, complete, tested against a real database, and genuinely refusing for the reason it claims? And separately: which of the five ROADMAP success criteria can be proven today, which are proven only against fixtures, and which are structurally blocked until counsel answers.

## Goal Achievement

### Observable Truths (the five ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Joshua approves a message, Prospect Radar prepares it, Joshua sends by hand; no third-party dispatch provider sits in the path so no AUP applies (SND-01, SND-04) | ✓ VERIFIED (mechanism) | `lib/send-gate.ts`'s `prepareSend()` + `app/api/admin/outreach/send/route.ts` implement Prepare end to end; `components/admin/outreach-row-panel.tsx` implements the copy-subject/copy-body handoff (D-02) with no `mailto:` link and no `.eml` download (grepped, zero hits). `lib/outreach-isolation.test.ts` proves, by a deliberate temporary violation I introduced and reverted during this verification, that no mail-sending import or package can enter the outreach path undetected. `.planning/research/SEND-CHANNEL.md` is the pinned SND-04 artifact. The literal "Joshua sends by hand" action is outside any codebase's ability to prove — it is a human act the mechanism only prepares for. |
| 2 | Every message carries a working, one-step opt-out link into the Phase 2 unsubscribe endpoint (SND-02) | ✓ VERIFIED | `lib/opt-out-link.ts`'s `renderSendableBody()`/`buildUnsubscribeUrl()`, 7 passing unit tests (idempotence, no-PII, both locale labels, notice-then-opt-out ordering). `buildUnsubscribeUrl()` calls the same `signUnsubscribeToken()` Phase 2 already ships and resolves against the same `/api/unsubscribe/[token]` route, unmodified. |
| 3 | An outreach failure leaves the public scanner's transactional email untouched (SND-03) | ✓ VERIFIED | `lib/outreach-isolation.test.ts` scans 12 enumerated outreach-path files for 6 banned mail tokens including `@/lib/email`. I confirmed the guard actually guards: added a real `import "@/lib/email"` to `lib/send-gate.ts`, ran the suite, watched it fail with the exact offending line named, reverted, watched it pass again (`git diff --stat lib/send-gate.ts` empty after). Separately confirmed the scanner's own legitimate imports of `lib/email.ts` (`app/api/cron/follow-up`, `app/api/cron/send-pending-reports`, `app/api/internal/scan-complete`, `app/api/scan/[id]/email`) sit entirely outside the enumerated outreach-path file set and are unaffected. |
| 4 | A send is refused when the address is suppressed at that moment, and a first-touch send is refused when the Article 14 notice flag is not true (CMP-02, CMP-10) | ✓ VERIFIED | `lib/send-gate.ts`'s `evaluateSendGates()` runs suppression (live `isSuppressed()` call) before any legal-config read, then the Article-14 flag-and-body-text check. 13 tests in `lib/send-gate.integration.test.ts` produce every one of the nine refusal members against real local Postgres, including a suppress-then-lift pair proving the check reads live state. `lib/send-record.ts`'s `markAsSent()` re-runs the whole gate at Mark time (9 more passing integration tests), so a suppression written between Prepare and Mark still refuses. I independently re-ran the full migration and both a real UPDATE and a real DELETE against a live `send_records` row inside a rolled-back transaction; both raised `prevent_send_records_mutation()` as designed. |
| 5 | Joshua answers "why were we allowed to email this business?" in seconds from an immutable per-send record (CMP-09, CMP-11, CMP-12) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `lib/send-audit.ts`'s `getSendAudit()` (one query, zero joins, grep-gated), the audit route, and the "Why were we allowed to email this business?" panel block are all built and pass 9 integration tests plus 4 component tests — against **fixture** data only. Zero real `send_records` rows exist for a real prospect (confirmed: `legal_regimes.legal_basis` is NULL for NL both locally and, per 08-03's own production curl, in production). The actual claim — Joshua reading a **real** send's legal-basis proof — cannot be exercised until counsel supplies the two values and one real send happens. This is not a defect; it is the specific, correctly-identified piece of this phase that stays open pending the legal gate. |

**Score:** 4/5 truths verified against real mechanism behavior (one of those four, #4, additionally confirmed against the real-shaped NL configuration); 1/5 present, wired, and fixture-tested but not exercisable against real data by design.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/020_create_send_records.sql` | `send_records` table, immutability trigger, two unset counsel columns, `prepared_at` | ✓ VERIFIED | Re-applied against local Postgres a second time during this verification — every statement returned a `NOTICE ... skipping` no-op, zero errors. `legal_regimes.legal_basis` created nullable with no seed insert (grepped: zero `insert into legal_regimes`, zero `set legal_basis`, zero `article_14_notice_approved = true` in the file). |
| `lib/send-gate.ts` | Nine-member refusal gate, `prepareSend()`, `computePreparedHash()`, `isPreparedFresh()` | ✓ VERIFIED | All 9 refusal members implemented in the documented fixed order (suppression before legal-config read). `prepareSend()` returns at its `if (!result.ok) return result` line **before** its only write (the `prepared_at` stamp) — confirmed by direct read, which is what makes the reported production curl during 08-03 safe regardless of whether it actually ran. |
| `lib/opt-out-link.ts` | `buildUnsubscribeUrl`, `buildOptOutLine`, `renderSendableBody` | ✓ VERIFIED | Pure module, zero `process.env`, zero `contact_email` reference, zero `mailto:`, zero `List-Unsubscribe` — all grepped and confirmed zero. |
| `lib/send-record.ts` | `markAsSent()` | ✓ VERIFIED | Re-runs `evaluateSendGates()` fresh, recomposes subject/body server-side, hash-compares against the caller's `preparedHash`, inserts one immutable row, translates Postgres `23505` to `already-sent`. |
| `lib/send-audit.ts` | `getSendAudit()` | ✓ VERIFIED | Exactly one `sb.from(` call, zero joins back to `prospects`/`outreach_messages`, zero insert/update/delete — all confirmed by direct read, matching the grep gates in the plan. |
| `app/api/admin/outreach/send/route.ts`, `app/api/admin/outreach/audit/route.ts` | Prepare/mark-sent POST, read-only audit GET | ✓ VERIFIED | Both admin-secret gated inline; the send route resolves no record field itself (parses only `id`/`action`/`preparedHash`); the audit route contains no insert/update/delete. |
| `lib/outreach-isolation.test.ts` | Standing SND-01/03/04 guard | ✓ VERIFIED, and proven to actually fail | See Truth #3 above — I reproduced the fail-then-pass cycle myself rather than trusting the SUMMARY's account of it. |
| `components/admin/outreach-row-panel.tsx` | Prepare/Copy/Mark UI + CMP-12 audit block | ✓ VERIFIED (code), ⚠️ unexercised in a live browser | Present, wired, all grep gates hold (no `window.confirm`/`window.alert`, no `mailto:`). See human verification below. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `lib/send-gate.ts` | `lib/suppression.ts`'s `isSuppressed()` | live call before any legal-config read | ✓ WIRED |
| `lib/opt-out-link.ts` | `lib/unsubscribe-token.ts`'s `signUnsubscribeToken()` | `buildUnsubscribeUrl()` | ✓ WIRED |
| `lib/send-gate.ts` / `lib/send-record.ts` | `legal_regimes.legal_basis` / `.article_14_notice_approved` | read-only; both counsel columns hold the gate shut | ✓ WIRED, confirmed unset for NL |
| `app/api/admin/outreach/send/route.ts` | `components/admin/outreach-row-panel.tsx` | the only UI path to the gate | ✓ WIRED |
| `outreach_messages.status = 'sent'` | `deriveLifecycleState()` → `contacted`, `sentGateOpen` in `lib/reporting-aggregates.ts` | existing Phase 7 machinery, zero new writer | ✓ WIRED, confirmed 0-line diff on `lib/reporting-aggregates.ts` across the whole phase (`git log` shows no Phase-8 commit touching it) |
| `send_records` | `lib/send-audit.ts`'s `getSendAudit()` | audit route | panel block | ✓ WIRED (fixture-proven) |

### Locked Decisions (08-CONTEXT.md D-01 through D-07)

| Decision | Honored in shipped code? | Evidence |
|----------|---------------------------|----------|
| D-01 manual send, no provider | Yes | `lib/outreach-isolation.test.ts` pins zero banned mail packages, `resend` still present for the scanner; `package.json` byte-identical across the whole phase (`git diff --numstat` empty at every phase-end commit). |
| D-02 copy subject + copy body, no mailto/eml | Yes | Two independent `navigator.clipboard.writeText` call sites in `outreach-row-panel.tsx`; zero `mailto:`/`.eml` anywhere in the panel or `lib/opt-out-link.ts`. |
| D-03 Prepare and Mark are two distinct actions | Yes | Two route branches (`"prepare"` / `"mark-sent"`), two client handlers, two buttons; no combined action exists. |
| D-04 prepared-but-unsent resurfaces, re-prepare reruns gates | Yes | `PREPARED_TTL_MINUTES` + `isPreparedFresh()` gate Mark; `PreparedNotSentPill` in `outreach-table.tsx` renders whenever `status === "approved" && preparedAt` is set; `prepareSend()` has no cached state, re-stamps and re-evaluates every call. |
| D-05 both gates refuse, run at Prepare (and re-run at Mark) | Yes | Confirmed in both `evaluateSendGates()` and `markAsSent()`'s re-invocation of it. |
| D-06 opt-out is a body link, not RFC 8058 headers | Yes | Zero `List-Unsubscribe` string anywhere in `lib/opt-out-link.ts` (grepped). |
| D-07 no legal content authored | Yes | `lib/draft-prompt.ts` (home of `ARTICLE_14_NOTICE_EN/NL`) carries no Phase 8 commit at all (`git log` for that file stops at Phase 6); `legal_regimes.legal_basis` for NL confirmed NULL by direct query; `tw_exemption_claimed` traced to `prospects.commercial_contact_invited` with zero `?? true` / `|| true` fallback anywhere in `lib/send-gate.ts` or `lib/send-record.ts`. |

### Scope Fence Check

- No Article 14 notice wording authored: confirmed, `lib/draft-prompt.ts` untouched by any Phase 8 commit.
- No LIA text or version value written: confirmed, no `insert into lia_versions` anywhere in migration 020 or any Phase 8 lib file.
- `tw_exemption_claimed` never defaulted true: confirmed by grep (zero `?? true`, zero `|| true` in both `lib/send-gate.ts` and `lib/send-record.ts`); it is read verbatim from `prospects.commercial_contact_invited`.
- No code path sets `legal_regimes.legal_basis` or flips `article_14_notice_approved` for a **real** regime: confirmed by direct query — the only three `legal_regimes` rows that exist anywhere are the real, still-unset `NL` row and two fake-country test fixtures (`XX`, `QR`), exactly the pattern the phase was authorized to use.
- One observation, not a violation: `lib/send-audit.integration.test.ts`'s two permanent fixture prospects are seeded with `country: "NL"` (a real ISO code, unlike the `XX`/`ZZ`/`QR` fixture codes the other two suites use) and their `send_records` rows carry a fabricated `legal_basis` string (e.g. `"legitimate interest (audit fixture A, older)"`). This is a **different table** from the one the scope fence protects — it never touches `legal_regimes`, which is the counsel-supplied config the fence exists to keep unset — and both fixtures are clearly disclosed in the file's own header as permanent residue, scoped by `prospect_id` so they cannot bleed into a real prospect's audit answer. It is not a scope-fence violation. It is mildly sloppy naming: a future person querying `send_records` joined on `prospects.country = 'NL'` will see these three fixture rows sitting beside whatever the first real NL send eventually produces, with no code-level flag distinguishing them beyond the domain name. Worth a one-line follow-up (rename the fixture country to a fake code) but not worth blocking on.

### Deviation Judgment: `lib/reporting-aggregates.integration.test.ts` (08-02, deviation 3)

Verified directly (`git show 3d295b6 -- lib/reporting-aggregates.integration.test.ts` and `lib/reporting-aggregates.ts`'s own git log across the phase). Judgment: **legitimate revision, not a weakening for convenience** — with one residual coverage gap worth naming.

- The original test asserted two things: `sentGateOpen` starts `false` with zero sent rows, then flips `true` once one exists. Its own comment explicitly anticipated this exact moment: *"If this ever fails because a real sent row exists, that assumption no longer holds and the test needs revisiting, not silencing."*
- 08-02's own permanent, `markAsSent()`-driven fixtures (Task 1) are exactly that real `sent` row, made permanent by the same immutability trigger this phase built. Once they exist, "starts false" can never hold again on this shared local database — not because the code changed, but because the fixture data is now permanent by design.
- The revision dropped only the now-unachievable "starts false" half and kept the "flips true given a real sent row" half, which is the actual behavior the test exists to prove. `lib/reporting-aggregates.ts` itself carries a **confirmed zero-line diff** across the entire phase (I checked its git log independently; no Phase 8 commit touches it).
- Residual gap, not a blocker: no test anywhere (unit or integration) now proves `sentGateOpen` defaults to `false` in the absence of any sent row — that half of the behavior is asserted by code reading (`let sentGateOpen = false` initialized once, flipped only by an `=== "sent"` equality check, both trivial) rather than by a passing test. A small follow-up — a pure unit test isolating the OR-loop with a mocked row array — would close this without needing a pristine database.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|---|---|---|---|
| SND-01 | 08-03 | ✓ Mechanism satisfied | `lib/outreach-isolation.test.ts` package scan |
| SND-02 | 08-01 | ✓ Mechanism satisfied | `lib/opt-out-link.ts` + 7 tests |
| SND-03 | 08-03 | ✓ Mechanism satisfied | `lib/outreach-isolation.test.ts` token scan, proven to fail on violation |
| SND-04 | 08-03 | ✓ Mechanism satisfied | `SEND-CHANNEL.md` pinned by test |
| CMP-02 | 08-01, 08-02 | ✓ Mechanism satisfied | Suppression re-checked live at both Prepare and Mark |
| CMP-09 | 08-02 | ✓ Mechanism satisfied (no real record yet) | `send_records` schema + `markAsSent()` field mapping |
| CMP-10 | 08-01 | ✓ Mechanism satisfied | Article 14 flag + body-text check in `evaluateSendGates()` |
| CMP-11 | 08-02 | ✓ Mechanism satisfied (no real record yet) | Immutable insert, DB-level UPDATE/DELETE block, confirmed live |
| CMP-12 | 08-03 | ⚠️ Fixture-proven only | `getSendAudit()` + panel block; zero real records exist to answer against |

All nine are marked `Pending (gated)` in `.planning/REQUIREMENTS.md`'s own tracking table, and left unchecked (`- [ ]`) in the requirement list itself — correctly, since none can be marked delivered while the legal gate stays shut. This verification does not ask that they be checked off; it confirms the mechanism behind each one is real.

### Anti-Patterns Found

None. Scanned all 13 files this phase created or modified for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"coming soon"/"not yet implemented" — zero hits. The one pre-existing "Draft wording - pending counsel review" label on the Article 14 block predates this phase (Phase 6) and is an honest status label, not a stub.

### Behavioral Spot-Checks (performed live during this verification, not taken from SUMMARY.md)

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full suite passes | `npx vitest run` | 568/568 passed, 50 files | ✓ PASS |
| Types clean | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Build compiles | `npm run build` | compiles clean | ✓ PASS |
| Migration 020 idempotent | re-ran the file against local Postgres a second time | all `NOTICE ... skipping`, zero errors | ✓ PASS |
| Immutability trigger fires | `BEGIN; UPDATE ...; ROLLBACK;` and `BEGIN; DELETE ...; ROLLBACK;` against a real row | both raised `prevent_send_records_mutation()` | ✓ PASS |
| Isolation guard actually guards | added a real `import "@/lib/email"` to `lib/send-gate.ts`, ran `outreach-isolation.test.ts`, reverted | failed with the exact offending line named, then passed clean after revert | ✓ PASS |
| Fixture hygiene (no leak) | queried `send_records`/`sent` `outreach_messages`/`prospects` counts, ran the full suite once more, re-queried | 7 / 5 / 11 before and after — unchanged | ✓ PASS |
| `prepareSend()` write ordering | direct source read | returns on gate refusal (`if (!result.ok) return result`) strictly before its only write (`prepared_at` stamp) | ✓ PASS |
| Scanner's own mail use unaffected | `grep -rl "@/lib/email\"" app/ lib/` | 4 real call sites (cron follow-up, send-pending-reports, scan-complete, scan email), none inside `OUTREACH_PATH_FILES` | ✓ PASS |
| No legal content or package touched this phase | `git log` on `lib/draft-prompt.ts` and `package.json` | zero Phase 8 commits touch either file | ✓ PASS |

Note on the fixture baseline: the task brief's stated baseline was 4 `send_records` / 2 sent `outreach_messages` / 9 prospects. Current state is 7 / 5 / 11. This is not a leak — it is the accumulated, disclosed, idempotent permanent residue from all three plans' fixtures (08-01's `XX`-country already-sent fixture, 08-02's two `QR`-country mark fixtures, 08-03's two `NL`-country audit fixtures), and I confirmed it is stable: re-running the entire suite did not move any of the three counts.

### Human Verification Required

See the `human_verification` list in the frontmatter above for the full detail. In short: three items, none of them code gaps —

1. A live-browser walkthrough of Prepare send's refusal banner (proven at the route/function level, never painted).
2. A live-browser check of the Sent filter and the absence of any `PREPARED, NOT SENT` marker today.
3. The one real end-to-end walkthrough of the CMP-12 audit block against a genuine send — impossible until counsel supplies `legal_regimes.legal_basis` and sets `article_14_notice_approved`.

### Gaps Summary

There are no gaps in the sense of missing, stub, or unwired work. Every artifact the three plans promised exists, is substantive, is wired, and is covered by passing tests I re-ran myself against real local Postgres rather than trusting the SUMMARYs. The isolation guard was not just read but deliberately broken and repaired to confirm it actually enforces SND-03. The scope fence holds under direct inspection of the migration, the gate module, and git history — no legal value was written anywhere.

What remains open is exactly what the phase was designed to leave open: the legal gate itself, and the handful of "walk it in a real browser" checks every plan explicitly deferred to a human because no live Prepare can succeed until that gate opens. `status: human_needed` reflects that honestly — not a defect in the build, and not a false "passed" that would hide the one criterion (CMP-09/11/12 against real data) that genuinely cannot be closed by more code.

---

*Verified: 2026-08-05*
*Verifier: Claude (gsd-verifier)*
