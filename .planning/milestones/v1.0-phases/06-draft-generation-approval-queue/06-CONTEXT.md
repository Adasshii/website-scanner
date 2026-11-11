# Phase 6: Draft Generation & Approval Queue - Context

**Gathered:** 2026-07-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Every prospect that finishes a full scan with a usable generic contact email comes out
carrying a drafted outreach message written from its own scan findings, in its own
country's language, citing one real checkable number and linking to its own hosted
report. Joshua reads each draft in a new admin Outreach tab with the scan evidence
beside it, edits inline, and approves or rejects one at a time.

Nothing sends. Dispatch, suppression-at-send, and the per-send audit record are Phase 8,
and the channel is still undecided. Lifecycle state transitions are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Locked by ROADMAP / PROJECT (do not re-litigate)
- **D-6-R1: No bulk-approve action anywhere.** QUE-05. It directly undermines the human
  gate the whole compliance posture rests on.
- **D-6-R2: Suppression is NOT checked in this phase.** It gates send only (CMP-02,
  Phase 8), because state changes while a draft waits in the queue.
- **D-6-R3: Drafts are generated from full scan output, not triage output.** Triage is
  too thin to write a credible evidence-based line.
- **D-6-R4: DRA-06 verdict consolidation is the first plan of this phase.** Confirmed
  live: `lib/scoring.ts:55-67` uses 95/85/70/50 thresholds inside `buildSummary()`;
  `scanner-service/src/index.ts:730` carries its own `generateVerdict()`. Consolidate
  into one function exported from `lib/scoring.ts`, imported by the scanner service and
  the draft generator. **Not a scoring refactor** — the per-page (`scorePage()`) vs
  aggregate (`aggregateScores()`) split stays, and triage's scorer is untouched.
- **D-6-R5: Draft generation calls Gemini from Next.js.** No browser needed, so it does
  not belong in the scanner service.

### Review surface & queue UX
- **D-6-01: The queue is a new 4th admin tab, "Outreach".** Add `outreach` to the `Tab`
  union at `app/admin/page.tsx:54`, beside `scans | leads | shortlist`. Reuses the
  existing `secret`-header auth, pagination and fetch pattern. Shortlist answers "who is
  worth pitching"; Outreach answers "what am I sending them". This deliberately departs
  from Phase 5's D-5-02 (no new admin surface) — inline editing plus an evidence pane is
  heavier than a pill and does not fit in a Shortlist row.
- **D-6-02: Expandable row, one open at a time.** The table lists prospects; clicking a
  row expands a full-width panel with the editable draft on the left and scan evidence
  on the right, plus approve/reject actions. Single-open is a structural expression of
  QUE-05 — there is no view in which many drafts can be acted on at once.
- **D-6-03: The evidence pane (QUE-04) is a summary block plus a report link.** Overall
  score, the consolidated DRA-06 verdict, critical/major issue counts, and the top 3
  issues by impact — all already present in `scans.summary`, no new plumbing. Plus a
  link opening `/report/[scanId]` in a new tab for the full report. The specific number
  the draft cites (see D-6-11) is highlighted so verification is one glance.
- **D-6-04: Default view is pending drafts only, worst score first.** Pending means status
  `draft` or `edited`. Matches the Shortlist's worst-is-most-qualified inversion. Approved and
  rejected are reachable behind a status filter, out of the default view, so the tab
  always answers "what still needs me".

### Draft trigger & eligibility
- **D-6-05: Drafts generate on scan-complete, fire-and-forget.** Hook generation into
  the existing `/api/internal/scan-complete` webhook, async, so drafts are waiting when
  the tab is opened. Matches the codebase's established fire-and-forget pattern. A
  generation failure simply leaves no draft row; regenerate (D-6-13) is the recovery
  path.
- **D-6-06: Named-person-only prospects get no auto-draft; manual generate stays.** CON-05
  turns on the word "automatically": the scan-complete trigger
  skips them so they never enter the pending queue on their own, they stay visible in
  the Shortlist behind the existing NAMED-PERSON pill, and an explicit per-prospect
  generate action lets Joshua clear one by judgement. Not dead-ended, not automatic.
- **D-6-07: Prospects with no extracted contact email get no draft and no queue row.** A
  draft with nowhere to send it is queue noise. The prospect stays in the Shortlist
  where the missing-contact state is already visible.
- **D-6-08: No new score threshold for drafting.** Triage's configurable cutoff (TRI-08)
  plus the Phase 4.1 `isReleasable` predicate already decided who was worth a full scan.
  A second threshold means two places to tune and two places to get wrong.

### Draft content, tone & language
- **D-6-09: Draft locale follows the prospect's country config.** `prospects.country`
  (ISO2, e.g. `"NL"` — from IMP-06) maps to a locale; one draft in that language. NL
  prospects get Dutch. Honours the standing no-hardcoded-geography constraint and follows
  the CMP-16 per-country config precedent, without generating a second-language version
  that will never be sent. *(Column name corrected 2026-07-28 during Phase 6 research —
  this document previously said `country_code`, which does not exist. The decision is
  unchanged; only the column reference was wrong. No country→locale map exists yet, so
  the mapping is new work, not a read of an existing field.)*
- **D-6-10: The cold-outreach tone brief lives in a versioned prompt file in the repo.**
  Tone brief, the DRA-04 helpful-not-insulting guardrails, and the Article 14 text in one
  reviewable place. The prompt is the product here; git history becomes the record of how
  the pitch evolved, which is what matters when tuning against real reply rates. Future
  per-country variants hang off the same file.
- **D-6-11: The DRA-02 evidence number is chosen by code, and the prompt must use it.** A
  selector in `lib/` picks the strongest citable metric from `scans.summary` (worst Core
  Web Vital, critical issue count, or lowest category score) and passes it to Gemini as a
  required fact. Guarantees the number is real, makes verification deterministic, and
  gives the evidence pane a concrete value to highlight. Rules out hallucinated or
  cherry-picked figures without flattening every draft to the same line.
- **D-6-12: The Article 14 notice is appended by code after generation (DRA-05).** Gemini
  writes the pitch; the notice is a fixed, translated string the code appends to
  `draft_body`, so the model cannot paraphrase, shorten or drop it. Rendered visually
  separated in the review pane so its presence is verifiable at a glance. The draft
  Joshua approves is the message that would go out — attaching it later at send time
  would break the review gate's premise.

### Edit / regenerate / reject / approve semantics
- **D-6-13: Editing overwrites in place; status flips `draft` → `edited`.** Migration 012
  was built for exactly this. The AI original is not retained: at 10–50/week with one
  reviewer, superseded drafts are storage nobody reads, and capturing the AI-vs-human
  delta is REF-02, already deferred to v2 pending an edit pattern repeating 3+ times.
- **D-6-14: Regenerate exists, with a confirmation when edits are present.** A fresh
  Gemini call overwrites `draft_body` and resets status to `draft`. If status is already
  `edited`, confirm first so a stray click cannot destroy a rewrite. This action is also
  the recovery path for a failed scan-complete generation and the manual entry point for
  D-6-06 named-person prospects.
- **D-6-15: Reject kills both the message and the prospect's future drafts.**
  `outreach_messages.status` → `rejected` AND a flag on the prospect so the scan-complete
  trigger never re-drafts it. QUE-03 says "reject a prospect outright"; without the
  prospect-level mark, a rescan quietly resurrects it in the queue. **This is explicitly
  NOT suppression** — it is an editorial call, not a legal one, and must not write to the
  Phase 2 suppression table (CMP-06 makes those entries hard to reverse by design).
- **D-6-16: Approve writes `status`, `approved_by`, `approved_at` and nothing else.** The
  draft leaves the pending view and waits. No dispatch, no send queue — Phase 8 owns that
  and its channel is still undecided. Approved is not contacted; advancing lifecycle here
  would contradict TRK-02 and pre-empt Phase 7.

### Claude's Discretion
- Schema shape for the two new bits of state D-6-15 needs (a prospect-level
  never-draft/rejected flag) and anything D-6-05 needs to record a failed generation.
  Ships as an idempotent migration applied by Joshua via the Supabase dashboard SQL
  Editor — project convention, never `supabase db push`.
- What `approved_by` holds given there is no user system (single-tenant, admin-secret
  auth only). Pick something honest and constant.
- Whether prospects scanned before this ships get backfilled drafts, and by what
  mechanism (one-off script vs a generate action per row). Not discussed; low stakes at
  this volume.
- Gemini failure handling, timeout and retry policy on the scan-complete path, following
  the existing AI-timeout conventions in `scanner-service/src/ai.ts` (return null,
  continue, never block).
- Subject-line generation, message length, and how the DRA-03 report link is rendered in
  the body.
- Exact metric-selection heuristic inside D-6-11.
- Test approach per project conventions (vitest, local Supabase pinned to 127.0.0.1).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and prior decisions
- `.planning/ROADMAP.md` — Phase 6 section: goal, DRA-01..06 + QUE-01..05 success
  criteria, and the notes locking D-6-R1..R5. Also read the Phase 7 and Phase 8 sections
  to see what this phase must NOT do.
- `.planning/REQUIREMENTS.md` — DRA-01..06 and QUE-01..05 definitions, plus the
  "Note on DRA-06" section at the end which scopes the verdict fix precisely.
- `.planning/PROJECT.md` — constraints (near-zero cost, 10–50/week scale, no new
  infrastructure, geography as a parameter, blast radius) and the Key Decisions table.
- `.planning/STATE.md` — accumulated decisions.
- `.planning/phases/05-contact-extraction-classification/05-CONTEXT.md` — CON-05
  named-person handling and the Shortlist pill precedent this phase builds on.

### Code this phase builds on
- `supabase/migrations/012_create_outreach_messages.sql` — **already exists**, built in
  Phase 1 for this phase. `prospect_id`, `scan_id`, `draft_subject`, `draft_body`,
  `status` check constraint (`draft|edited|approved|rejected|sent`), `approved_by`,
  `approved_at`, `sent_at`. RLS enabled.
- `lib/scoring.ts` — `buildSummary()` at lines 43-79 holds the 95/85/70/50 verdict
  thresholds. This is where the single consolidated verdict function lands (DRA-06).
- `scanner-service/src/index.ts` — `buildSummary()` at line ~700 and `generateVerdict()`
  at line 730, the divergent copy DRA-06 removes.
- `app/admin/page.tsx` — the `Tab` union (line 54), tab state, `fetchData`/`fetchShortlist`
  split, `secret`-header auth, `TabButton` component. The Outreach tab plugs in here.
- `components/admin/shortlist-table.tsx` — table layout, pill patterns, and the
  `contact_email_type === "named-person"` check at line 167 that D-6-06 keys off.
- `lib/contact-extraction.ts` — Phase 5 contact classification, the source of the
  generic-vs-named-person state that gates eligibility.
- `app/api/internal/scan-complete/route.ts` — the webhook D-6-05 hooks generation into.
- `scanner-service/src/ai.ts` — the only current Gemini integration; the prompt and
  timeout conventions the Next.js-side draft generator should follow.
- `lib/triage-candidates.ts` — `ShortlistRow` shape and the release-gate context behind
  D-6-08.
- `supabase/migrations/` — migration conventions (idempotent DDL, dashboard-applied).

### Codebase maps
- `.planning/codebase/ARCHITECTURE.md` — fire-and-forget async pattern, the duplicate
  scoring anti-pattern DRA-06 closes, and the no-job-queue constraint.
- `.planning/codebase/CONVENTIONS.md` — naming, module layout, Supabase client access,
  i18n conventions relevant to D-6-09.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`outreach_messages` table** — the entire draft/edit/approve/reject state machine
  already exists in migration 012 with the right status enum. Only the prospect-level
  reject flag from D-6-15 is genuinely new schema.
- **Admin tab shell** — `app/admin/page.tsx` already does auth, tabs, pagination and
  data fetching. The Outreach tab is a new branch in an established structure, not a
  new surface.
- **`ShortlistTable` patterns** — table styling, pills, and row actions transfer
  directly to the Outreach table.
- **`scans.summary`** — already carries `totalIssues`, `criticalIssues`, `majorIssues`,
  `topIssues` (top 10 deduped by impact) and `verdict`. The D-6-03 evidence pane and
  the D-6-11 metric selector both read from it; nothing new needs computing.
- **`/report/[id]`** — the hosted report DRA-03 links to already exists and is public.
- **Bilingual scan content** (`ai_content_alt`, `pickLocalizedScan()`) — the locale
  plumbing D-6-09 needs is established, even though drafts generate in one locale only.

### Established Patterns
- **Fire-and-forget async** — the scan pipeline already runs background work via
  `setImmediate` after responding, and writes results to the DB directly. D-6-05 follows
  it rather than inventing a queue (the no-job-queue architectural constraint stands).
- **No user system** — auth is admin-secret and service-to-service only. This constrains
  what `approved_by` can meaningfully hold.
- **Idempotent, dashboard-applied migrations** — never `supabase db push`.
- **AI failure is non-fatal** — every existing Gemini call returns null on timeout and
  the pipeline continues. Draft generation must not break scan-complete.

### Integration Points
- `app/api/internal/scan-complete/route.ts` — where D-6-05 hangs generation off.
- `lib/scoring.ts` — becomes the single verdict source; `scanner-service/src/index.ts`
  and the draft generator both import from it (DRA-06).
- `app/admin/page.tsx` `Tab` union + `/api/admin/stats` — where the Outreach tab and its
  data fetch plug in.
- Phase 8 boundary: this phase must leave approved drafts sitting untouched. No
  dispatcher, no suppression call, no lifecycle write.

</code_context>

<specifics>
## Specific Ideas

- The single-open expandable row (D-6-02) is not just a layout choice — it is how
  QUE-05's no-bulk-approve rule is enforced structurally rather than by omission. There
  should be no view in which multiple drafts are actionable simultaneously.
- The Article 14 block should be visually distinct in the review pane (D-6-12) so its
  presence is verifiable without reading the whole body.
- The roadmap notes the first N drafts get read closely before the pattern is trusted
  (Pitfall 5). The versioned prompt file (D-6-10) is what makes that iteration legible.
- Live data exists to build against: the physiotherapy prospects released and scanned
  during Phases 4–5.

</specifics>

<deferred>
## Deferred Ideas

- **Backfill of drafts for already-scanned prospects** — noted as Claude's discretion
  above rather than a design decision; revisit at plan time if it turns out to be more
  than a one-off script.
- **Per-draft feedback capture / AI-vs-human edit diffing** — REF-02, already v2. D-6-13
  deliberately does not retain the AI original; if the edit pattern repeats 3+ times,
  that is when this gets built.
- **Bulk anything** — permanently out of scope, not deferred. It is the one thing the
  compliance posture forbids.
- **Sending, suppression-at-send, per-send audit record** — Phase 8, blocked on the
  send-path decision.
- **Lifecycle transitions and reply/booked reporting** — Phase 7.

### Reviewed Todos (not folded)
- `2026-07-24-random-import-from-target-categories.md` — "Add random import mode:
  TARGET_CATEGORIES and TARGET_REGIONS sampling". Scored 0.9 on keyword match but the
  match was on generic tokens (lib, triage, phase, every), not real overlap. It is
  import/triage scope. Deferred; belongs with import work, not with drafting or the
  approval queue.

</deferred>

---

*Phase: 06-draft-generation-approval-queue*
*Context gathered: 2026-07-27*
