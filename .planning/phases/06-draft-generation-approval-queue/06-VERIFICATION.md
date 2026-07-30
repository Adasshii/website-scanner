---
phase: 06-draft-generation-approval-queue
verified: 2026-07-30T14:20:26Z
status: passed
status_transition:
  from: human_needed
  to: passed
  date: 2026-07-30
  by: "orchestrator, after all three human_verification items were resolved with evidence (see 06-UAT.md)"
  resolutions:
    - item: "GEMINI_API_KEY genuinely live in Vercel Production"
      outcome: RESOLVED
      evidence: |
        Initially FAILED — the variable was absent from Vercel Production entirely, confirmed
        both from the dashboard and from https://scan.adashi.io/api/health. The verifier's
        suspicion was correct: the attestation was wrong for production exactly as it had been
        for local. Worse, the phase's code was ALREADY deployed (commit 56e06a0), so draft
        generation was live and silently returning null in production.
        Now closed: variable added, redeployed, and confirmed by an uncached request-time read
        reporting GEMINI_API_KEY true with overall status ok.
        Closing it also required fixing the health endpoint itself (commit e5f47e7) — it was
        statically prerendered and reporting BUILD-time env, so it could not have confirmed
        the fix and would have kept reporting false.
    - item: "A draft from a genuinely crawled scan"
      outcome: RESOLVED
      evidence: |
        fysiotherapiemeerweg.nl, real production prospect, drafted automatically. Subject
        "Leesbaarheid op je site", cites "7 kritieke problemen" matching the report's "7 need
        immediate attention", report link resolved to scan.adashi.io unmangled, Article 14
        block present and read-only. Tone approved by Joshua. First true end-to-end execution
        of DRA-01/02/03 against real crawl data.
    - item: "NL report locale on a real scan"
      outcome: "HYPOTHESIS DISPROVEN, but scoping conclusion upheld"
      evidence: |
        IMPORTANT correction to this file's original reasoning. The item stated the English
        report was "attributed to the seed fixture not setting scan.locale, not a product
        defect". That attribution is WRONG and was disproven against the real NL prospect:
        the report serves <html lang="en"> with English copy under Accept-Language nl-NL,
        en-US, and no header alike. It is not a fixture artifact and not browser-dependent.
        What the original reasoning got right is the scoping: the report page's locale logic
        is pre-existing code this phase did not touch, and Phase 6's own requirement for the
        link (DRA-03, code-constructed from BASE_URL + scan id) passes. Phase 6 did not cause
        this; it created the first audience exposed to it.
        Agreed with Joshua on 2026-07-30 to treat it as a follow-up to be fixed before any
        real sending (Phase 8), not as a Phase 6 blocker. Tracked as a separate work item.
score: 39/39 must-haves verified (code + tests + build + live checks)
behavior_unverified: 0
overrides_applied: 0
re_verification: false

behavior_unverified_items: []

human_verification:
  - test: "Confirm GEMINI_API_KEY is genuinely live in Vercel Production (not just attested), by hitting the deployed app's /api/health endpoint or triggering a real scan-complete callback and checking for a new outreach_messages row."
    expected: "{\"env\":{...,\"GEMINI_API_KEY\":true}}\" in production, and a real prospect scan produces a draft row without manual intervention."
    why_human: "The exact same 'key set' attestation for local dev (06-02) turned out to be inaccurate at the runtime level — the key existed only in scanner-service/.env and was never loaded by the Next.js process until 06-07's Task 3 fix. The Vercel production claim rests on the same kind of unverified attestation and has not been independently re-checked after that fix. This verifier has no Vercel/production access to check directly."
  - test: "Run one real full scan through the actual scanner-service -> /api/internal/scan-complete webhook path for a genuinely crawled prospect (not a seeded fixture), and confirm an outreach_messages row appears with a correctly cited number and a report link that resolves."
    expected: "A single outreach_messages row, status 'draft', citing a real figure from that scan's own coreWebVitals/summary, with a working /report/[scanId] link."
    why_human: "Every live generation exercised so far (Task 3 of 06-07) ran against a freshly seeded local Supabase fixture, not a genuinely crawled scan. The code path is fully unit- and integration-tested and was proven against one real (non-mocked) Gemini call, but DRA-01/02/03's true end-to-end behavior under real-world scan data variance (multi-page discovery, real LCP values, real issue sets) has never been observed."
  - test: "Scan a real NL-registered business end to end and confirm the linked hosted report renders in Dutch while the drafted email (also Dutch, per prospects.country) cites the same number shown in the report."
    expected: "Report page language matches scan.locale as set by a genuine NL scan; the cited figure in the draft evidence pane matches the same figure on the report page."
    why_human: "During 06-07's Task 3 verification, the linked report rendered in English while the linked draft was Dutch. This is attributed to the seed fixture not setting scan.locale, not a product defect — lib/draft-generator.ts resolves its own locale from prospect.country independently of scan.locale, and the report page's locale logic is unchanged, pre-existing code this phase did not touch — but that explanation has not been confirmed against a real NL scan."

duration_note: "Verification performed via static code read, `npx vitest run` (348/348 passed), `npx tsc --noEmit` (both root and scanner-service, clean), `npm run lint` (clean), `npm run build` (clean), a live `/api/health` check against a locally started dev server, and git-log confirmation of every commit hash the summaries cite."
---

# Phase 6: Draft Generation & Approval Queue Verification Report

**Phase Goal:** Every prospect that finishes a full scan with a usable generic contact email
comes out carrying a drafted outreach message written from its own scan findings, in its own
country's language, citing one real checkable number and linking to its own hosted report.
Joshua reads each draft in a new admin Outreach tab with the scan evidence beside it, edits
inline, and approves or rejects one at a time. Nothing sends.

**Verified:** 2026-07-30T14:20:26Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All 39 must-have truths declared across the 8 plans' frontmatter were checked directly against
the current codebase (not against SUMMARY.md prose). Every one below is VERIFIED at the code
level — implementation exists, is substantive, is wired, and (where the truth is a state
transition) is exercised by a passing automated or live-manual test. Three residual,
production-realism concerns are not truth failures but are routed to Human Verification below.

| # | Truth (source plan) | Status | Evidence |
|---|---|---|---|
| 1 | One verdict function; scanner service and Next.js call the same one (06-01, DRA-06) | VERIFIED | `lib/scoring.ts` exports `computeVerdict`/`getWeakestCategory`; `scanner-service/src/index.ts:21` imports it via `@shared-lib/scoring`; `scanner-service/tsconfig.json` maps the alias to `../lib/*` and `tsc --noEmit` in scanner-service is clean |
| 2 | Shipped thresholds are the scanner service's live 90/70/50 bands | VERIFIED | `lib/scoring.ts:73-83` uses 90/70/50; no `95/85/70/50` remnant anywhere in the file or `scanner-service/src/index.ts` |
| 3 | `scorePage()`/`aggregateScores()` split and `lib/triage-scorer.ts` untouched | VERIFIED | `git log` shows no phase-6 commit touching `scanner-service/src/scoring.ts` or `lib/triage-scorer.ts`; last touch to each predates phase 6 |
| 4 | GEMINI_API_KEY readable by Next.js runtime, dev + prod, never exposed to browser (06-02) | VERIFIED (dev), see Human Verification (prod) | Live `curl http://localhost:3000/api/health` (started for this verification) returned `"GEMINI_API_KEY":true`; `lib/draft-generator.ts` reads it via bare `process.env.GEMINI_API_KEY` with no `NEXT_PUBLIC_` prefix anywhere, and is imported only by server-side route/lib files, never by a `"use client"` component |
| 5 | Live production `lifecycle_state` CHECK accepts 'rejected' | VERIFIED (schema) | `supabase/migrations/010_create_prospects.sql:24-27` declares `'rejected'` in the CHECK constraint; production DB state itself was human-confirmed per 06-02-SUMMARY and is outside this verifier's reach |
| 6 | No migration authored in 06-02 | VERIFIED | `git show f393036`, `a67b690`, `d3e7c8b` touch only `.env.example`, `app/api/health/route.ts` and docs — no new migration file |
| 7 | Tone brief + DRA-04 guardrails + Article 14 text live in one versioned file (06-03) | VERIFIED | `lib/draft-prompt.ts` contains `TONE_BRIEF`, `ARTICLE_14_NOTICE_EN`/`_NL` in one file; `git log` on this path shows the full post-review revision history |
| 8 | Cited number chosen by code, never the model (D-6-11, DRA-02) | VERIFIED | `lib/draft-metric-selector.ts`'s `selectCitableMetric()` computes `displayValue`/`displayText`; `lib/draft-generator.ts:238` rejects any generation where `!raw.includes(metric.displayValue)`; covered by `lib/draft-generator.test.ts` ("returns null when the model rounds the cited number instead of reproducing it verbatim") |
| 9 | Article 14 notice as real EN/NL sentences covering LIA-v1 §4, code-appended (D-6-12, DRA-05) | VERIFIED | `lib/draft-prompt.ts:122-135`, `appendArticle14Notice()` is idempotent and always called from `generateDraft()`'s return path |
| 10 | Draft locale resolved from `prospects.country`, not `scans.locale` (D-6-09) | VERIFIED | `localeForCountry(prospect.country)` used in `draft-generator.ts`, `outreach-queue.ts`; `scan.locale` is never read for this purpose |
| 11 | Subject templated in code, verbatim-number problem confined to one field | VERIFIED | `buildDraftSubject()` fallback in `lib/draft-prompt.ts`; model-authored subject is parsed and validated by `parseDraftResponse()`, falling back to the template when implausible |
| 12 | Draft generated from full scan output via Gemini from Next.js, no browser (06-04, DRA-01/02/03/05) | VERIFIED | `lib/draft-generator.ts` — server module, `GoogleGenerativeAI` client instantiated lazily server-side only; imported by `lib/draft-on-scan-complete.ts` and `lib/outreach-queue.ts` (both server) |
| 13 | Non-verbatim body discarded, not accepted | VERIFIED + tested | Same as #8; `draft-generator.test.ts` |
| 14 | Hosted report link present in every accepted draft, code-constructed | VERIFIED + tested | `resolveReportLink()` guarantees exactly-once presence; `buildReportUrl()` builds from `NEXT_PUBLIC_SITE_URL`/`BASE_URL` + scan id only, never scanned content; tests: "keeps the report URL exactly once...", "appends the report URL on its own line when the model omitted it" |
| 15 | Article 14 notice appended by generator, no caller can skip it | VERIFIED | `generateDraft()`'s only return path is `appendArticle14Notice(body, locale)` |
| 16 | Gemini failure/timeout resolves to null, never throws | VERIFIED + tested | `Promise.race` + `.catch()` in `defaultGeminiGenerate()`; tests cover thrown error, timeout, and missing-key paths distinctly |
| 17 | Every completed prospect scan w/ usable generic email gets a draft, unasked (06-05, DRA-01) | VERIFIED + tested | `lib/draft-on-scan-complete.ts`; `lib/draft-on-scan-complete.integration.test.ts` — "a generic contact email produces exactly one draft row" |
| 18 | Prospect branch runs BEFORE the email-lead guard | VERIFIED | `app/api/internal/scan-complete/route.ts:55-61` — `if (scan.prospect_id) { ...; return ...; }` precedes the `scan.email` guard at line 63 |
| 19 | Rejected prospect skipped on EVERY future scan-complete | VERIFIED + tested | Gate 6 in `maybeGenerateDraftForProspectScan`; test "a rejected prospect produces no row even with a generic email and completed scan" |
| 20 | Named-person-only and no-email prospects get no draft, no row (D-6-06/07) | VERIFIED + tested | Gates 4/5; tests for both cases |
| 21 | No new score threshold gates drafting (D-6-08) | VERIFIED + tested | No score comparison anywhere in the gate; test "a low-scoring (12) and a high-scoring (88) prospect BOTH get a row" |
| 22 | Draft failure never fails the webhook | VERIFIED + tested | Route wraps the call in `.catch()`; gate itself wraps everything in try/catch and always resolves; test "an injected generate that returns null produces no row, a failed outcome, and does not throw" |
| 23 | Edit overwrites in place, flips draft→edited, no AI original retained (06-06, QUE-02, D-6-13) | VERIFIED + tested | `applyDraftEdit()`; test "on a 'draft' row sets status to 'edited' and stores the new text" |
| 24 | Regenerate overwrites body, resets to draft; recovery + manual-entry path (D-6-14) | VERIFIED + tested | `regenerateDraft()`; test "replaces body and subject and resets status from 'edited' to 'draft'"; null-result path leaves row untouched, tested |
| 25 | Reject writes status=rejected AND lifecycle_state=rejected, never suppression table (D-6-15, QUE-03) | VERIFIED + tested | `rejectDraft()`; tests "sets the message status to 'rejected' AND the prospect's lifecycle_state to 'rejected'" and "writes no row to the suppressions table" |
| 26 | Approve writes status/approved_by/approved_at only (D-6-16) | VERIFIED + tested | `approveDraft()`; test "does not change the prospect's lifecycle_state" |
| 27 | Default listing pending-only, worst score first; approved/rejected behind filter (D-6-04) | VERIFIED + tested | `listOutreachDrafts()` STATUS_GROUPS + sort; test "pending filter returns only 'draft' and 'edited' rows" and "orders rows lowest overall score first" |
| 28 | Every action addresses exactly one id, no bulk handler (QUE-05, D-6-R1) | VERIFIED | `app/api/admin/outreach/route.ts` — `messageId`/`prospectId` are single strings throughout; no array/collection param anywhere; no `new Set`/checkbox in any outreach UI file |
| 29 | Joshua reads every draft w/ evidence beside it, edits, approves/rejects one at a time (06-07, QUE-01-04) | VERIFIED (code + live human check) | `components/admin/outreach-row-panel.tsx` two-column layout; 06-07-SUMMARY Task 3 checklist items 1-3, driven live against seeded local Supabase, all commit hashes confirmed present in `git log` |
| 30 | No view with two drafts actionable at once (QUE-05, D-6-02) | VERIFIED (code + live human check) | `expandedId: string \| null` in `outreach-table.tsx`, `grep -c "new Set"`/`checkbox` both zero; live-verified "expanding row B collapsed row A" |
| 31 | Outreach is a 4th admin tab, reuses secret-header auth (D-6-01) | VERIFIED | `app/admin/page.tsx` — `Tab = "scans" \| "leads" \| "shortlist" \| "outreach"`, `fetchOutreach` mirrors `fetchShortlist`'s secret header/401 handling |
| 32 | Default view shows pending only, worst score first | VERIFIED | Same as #27, surfaced through the GET route's default `status=pending` and the table's default filter state |
| 33 | Article 14 notice renders as a visually distinct read-only block outside the textarea (D-6-12) | VERIFIED | `outreach-row-panel.tsx:205-211` — separate `border-l-4` block below (not inside) the `<textarea>`; body is stripped of the notice on load and re-appended on save (`stripArticle14Notice`/`appendArticle14Notice`) |
| 34 | Cited number highlighted with a shared token for one-glance verification (D-6-03, D-6-11) | VERIFIED (evidence pane only, per plan's own either/or instruction) | The highlight (`bg-adashi-electric/30 ...`) is rendered in the evidence pane, labeled "Figure the draft must contain" — `06-07-PLAN.md` lines 203-209 explicitly permit body-or-evidence-pane placement "because the body is an editable textarea, which cannot carry inline markup," requiring only that the choice be commented (it is, in source) |
| 35 | Verdict shown in the evidence pane comes from the one consolidated function (DRA-06) | VERIFIED | `listOutreachDrafts()` computes `verdict: computeVerdict(scan.scores, ...)` fresh per row, never a stored copy |
| 36 | Named-person-only prospect can be drafted manually by explicit judgement (06-08, D-6-06) | VERIFIED | `GenerateDraftButton` in `shortlist-table.tsx`, gated on `scan_status === "done" && has_contact_email && !has_outreach_draft` (deliberately not `contact_email_type`) |
| 37 | A prospect whose auto-generation silently failed has a visible manual recovery path | VERIFIED | Same gate as #36 — a failed generation leaves no `outreach_messages` row, so `has_outreach_draft` is false and the button reappears |
| 38 | Already-scanned prospects backfilled via the same manual action, not a one-off script | VERIFIED | No backfill script exists in the repo; `getShortlist()`'s derived fields make the same button work for any prospect regardless of when it was scanned |
| 39 | Action only offered where it can succeed: completed scan, contact email, no existing draft | VERIFIED | `canGenerateDraft` boolean gate in `shortlist-table.tsx:220-224` |

**Score:** 39/39 truths verified (0 present-but-behavior-unverified, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/scoring.ts` | exports `computeVerdict`/`getWeakestCategory` | VERIFIED | Confirmed, plus `lib/scoring.test.ts` passing |
| `scanner-service/tsconfig.json` | `@shared-lib/*` alias | VERIFIED | Present; `tsc --noEmit` in scanner-service clean |
| `lib/draft-prompt.ts` | `COUNTRY_LOCALE_MAP`, `localeForCountry`, `TONE_BRIEF`, `ARTICLE_14_NOTICE_EN/NL`, `buildDraftPrompt`, `buildDraftSubject`, `appendArticle14Notice` | VERIFIED | All present, all exported |
| `lib/draft-metric-selector.ts` | `selectCitableMetric` + `CitableMetric` | VERIFIED | Present |
| `lib/draft-generator.ts` | `generateDraft` with injectable seam | VERIFIED | `DraftDeps.generate` seam confirmed, used by all callers' tests |
| `lib/draft-on-scan-complete.ts` | `maybeGenerateDraftForProspectScan` | VERIFIED | Present, wired into the webhook |
| `lib/outreach-queue.ts` | list/edit/approve/reject/regenerate/manual-generate | VERIFIED | All six exported, all single-record |
| `app/api/admin/outreach/route.ts` | GET/PATCH/POST, x-admin-secret | VERIFIED | Confirmed auth on all three handlers |
| `components/admin/outreach-table.tsx` | 4th tab table, single-open state | VERIFIED | Confirmed |
| `components/admin/outreach-row-panel.tsx` | editor + evidence + Article 14 + actions | VERIFIED | Confirmed |
| `app/admin/page.tsx` Tab union | extended with `outreach` | VERIFIED | Confirmed |
| `lib/triage-candidates.ts` | `has_contact_email`/`has_outreach_draft` on ShortlistRow | VERIFIED | Confirmed, plus integration test |
| `components/admin/shortlist-table.tsx` | Generate draft action | VERIFIED | Confirmed |
| Test files (7 Wave-0 gaps: scoring, draft-prompt, draft-metric-selector, draft-generator, draft-on-scan-complete, outreach-queue, triage-candidates) | present, passing | VERIFIED | All present; `npx vitest run` on the full suite: 348/348 passing |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `scanner-service/src/index.ts` | `lib/scoring.ts` | `@shared-lib/scoring` import | WIRED | Confirmed at line 21, used at line 719 |
| `app/api/internal/scan-complete/route.ts` | `lib/draft-on-scan-complete.ts` | `maybeGenerateDraftForProspectScan` awaited before the email guard | WIRED | Confirmed, correct ordering |
| `lib/draft-on-scan-complete.ts` | `lib/draft-generator.ts` | `generateDraft()` call | WIRED | Confirmed |
| `lib/outreach-queue.ts` | `lib/draft-generator.ts` | `generateDraft`/`buildReportUrl` in regenerate + manual-generate | WIRED | Confirmed |
| `lib/outreach-queue.ts` | `lib/scoring.ts` + `lib/draft-metric-selector.ts` | fresh `computeVerdict`/`selectCitableMetric` per row (no stale stored value) | WIRED | Confirmed — evidence pane recomputes, never reads a cached verdict/metric |
| `components/admin/outreach-table.tsx` | `app/api/admin/outreach/route.ts` | `fetch` in `app/admin/page.tsx`'s `fetchOutreach` | WIRED | Confirmed, mirrors `fetchShortlist` |
| `components/admin/shortlist-table.tsx` | `app/api/admin/outreach/route.ts` (POST) | `GenerateDraftButton`'s fetch | WIRED | Confirmed |
| `lib/outreach-queue.ts` rejectDraft | `lib/draft-on-scan-complete.ts` gate 6 | `prospects.lifecycle_state = 'rejected'` write/read | WIRED | Confirmed both sides |

### Data-Flow Trace (Level 4)

The Outreach table and row panel render exclusively from `listOutreachDrafts()`, which queries
real `outreach_messages`/`prospects`/`scans` rows via Supabase (no static/empty fallback) and
recomputes `verdict`/`citedMetric`/`topIssueTitles` fresh from each scan's own stored
`scores`/`summary`/`pages` — confirmed FLOWING, not STATIC. The Shortlist's `has_contact_email`/
`has_outreach_draft` are derived from a second live query against `outreach_messages`, not
hardcoded — confirmed FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full test suite green | `npx vitest run` | 32 files, 348 tests, all passed, 8.05s | PASS |
| Targeted phase-6 tests | `npx vitest run lib/draft-generator.test.ts lib/draft-metric-selector.test.ts lib/draft-prompt.test.ts lib/scoring.test.ts lib/draft-on-scan-complete.integration.test.ts lib/outreach-queue.integration.test.ts lib/triage-candidates.integration.test.ts` | 7 files, 110 tests, all passed | PASS |
| App type-check | `npx tsc --noEmit` | exit 0, no output | PASS |
| Scanner-service type-check (shared-lib import) | `npx tsc --noEmit` (in scanner-service/) | exit 0, no output | PASS |
| Lint | `npm run lint` | "No ESLint warnings or errors" | PASS |
| Production build | `npm run build` | Compiled successfully, all 25 routes generated, `/api/admin/outreach` and `/api/internal/scan-complete` present | PASS |
| GEMINI_API_KEY live in the Next.js runtime | started `npm run dev`, `curl http://localhost:3000/api/health` | `{"GEMINI_API_KEY":true,...,"db":{"ok":true}}` | PASS |
| No debt markers in phase-6 files | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 14 touched files | no matches | PASS |
| No bulk-action code paths | `grep -n "new Set\|checkbox\|bulkApprove"` across outreach UI/API/lib files | no matches | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DRA-01 | 06-02, 06-04, 06-05, 06-08 | Drafted outreach message from own full scan findings | SATISFIED | See truths #4, #12, #17, #36-39 |
| DRA-02 | 06-03, 06-04 | Cites a specific, checkable number from the scan | SATISFIED | Truths #8, #13, #34 |
| DRA-03 | 06-04 | Links to hosted scan report as proof | SATISFIED | Truth #14 |
| DRA-04 | 06-03 | Tone lands as helpful, not an insult | SATISFIED (human-judged, per requirement's own nature) | `TONE_BRIEF` in `draft-prompt.ts`; 06-07-SUMMARY records Joshua's live read-and-approve after a rewrite (commits confirmed in git log) |
| DRA-05 | 06-03, 06-04 | Article 14 notice programmatically included | SATISFIED | Truths #9, #15 |
| DRA-06 | 06-01, 06-07 | One verdict function across prospect list / report / draft | SATISFIED | Truths #1-3, #35; confirmed no divergent thresholds remain anywhere |
| QUE-01 | 06-06, 06-07 | Review every drafted message before send | SATISFIED | Truths #27, #29, #31, #32 |
| QUE-02 | 06-06, 06-07 | Edit a draft's text inline before approving | SATISFIED | Truths #23, #29 |
| QUE-03 | 06-06, 06-07 | Reject a prospect outright from the queue | SATISFIED | Truths #25, #29 |
| QUE-04 | 06-06, 06-07 | Scan evidence shown next to the draft | SATISFIED | Truth #29, evidence pane data-flow trace above |
| QUE-05 | 06-06, 06-07 | No bulk-approve; per-message only | SATISFIED | Truths #28, #30 |

No orphaned requirements: cross-referencing `.planning/REQUIREMENTS.md` lines 58-71 (DRA-01..06,
QUE-01..05) against every plan's `requirements:` frontmatter field accounts for all 11 IDs, with
no REQUIREMENTS.md phase-6 mapping left unclaimed by any plan.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers, no empty-return stubs, no
hardcoded-empty props, and no dead code remnants (the old 95/85/70/50 verdict chain and the
scanner service's own `generateVerdict()` are both fully removed, not commented out) in any of
the 14 files this phase touched.

One documentation inaccuracy (not a code defect): `06-07-SUMMARY.md`'s `key-files.modified` list
names `lib/health.ts`, but no such file exists in this repo — the actual file modified by commit
`f393036` is `app/api/health/route.ts`. The code change itself is correct and verified live; only
the summary's file path is wrong.

### Human Verification Required

1. **Confirm GEMINI_API_KEY is genuinely live in Vercel Production**
   - **Test:** Hit the deployed app's `/api/health` endpoint (or trigger a real scan-complete callback) and check the boolean.
   - **Expected:** `"GEMINI_API_KEY": true` in production, and a real prospect scan produces a draft row without manual intervention.
   - **Why human:** The identical "key set" attestation for local dev turned out to be inaccurate at the runtime level — the key existed only in `scanner-service/.env` and was never actually loaded by the Next.js process until 06-07's Task 3 fix (defect 3). The Vercel production claim in 06-02-SUMMARY rests on the same kind of attestation and has not been independently re-checked since. This verifier has no Vercel/production access.

2. **Run one real full scan through the production pipeline end to end**
   - **Test:** Let a genuinely crawled (not seeded-fixture) prospect scan complete and flow through `/api/internal/scan-complete`.
   - **Expected:** An `outreach_messages` row appears citing a real figure from that scan's own data, with a working report link, no manual trigger needed.
   - **Why human:** Every live Gemini call exercised so far ran against seeded local-Supabase fixtures (06-07 Task 3). The mechanism is fully unit- and integration-tested and was exercised once with a real (non-mocked) Gemini call, but DRA-01/02/03's behavior under real scan-data variance (multi-page discovery, real Core Web Vitals, real issue sets) has not been observed.

3. **Confirm the report-page locale matches the draft's locale on a real NL scan**
   - **Test:** Scan a real NL-registered business end to end; open the drafted message and the linked hosted report side by side.
   - **Expected:** Both render in Dutch, and the cited figure in the draft's evidence pane matches the same figure on the report page.
   - **Why human:** During 06-07 Task 3, the linked report rendered in English while the draft was Dutch. Believed to be the seed fixture not setting `scan.locale` (an unrelated, pre-existing code path this phase did not touch), but not confirmed against a real NL scan.

### Gaps Summary

No gaps. Every declared must-have truth, artifact, and key link is present, substantive, and
wired; the full test suite (348/348), type-check (both runtimes), lint, and production build are
all green; every commit hash cited across the eight SUMMARY.md files was confirmed present in
`git log`. The phase is routed to `human_needed` rather than `passed` solely because three
concrete, previously-flagged residual concerns about production-realism (a Vercel env attestation
with a known false-positive precedent in this same phase, and two fixture-vs-real-crawl gaps the
executing agent itself surfaced and left as "open follow-up, not a blocker") have not yet been
resolved by a human with production access. None of the three implicate incorrect code — all
three are "prove it under real conditions" checks, not defect reports.

---

*Verified: 2026-07-30T14:20:26Z*
*Verifier: Claude (gsd-verifier)*
