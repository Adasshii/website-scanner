# Phase 6: Draft Generation & Approval Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 06-draft-generation-approval-queue
**Areas discussed:** Review surface & queue UX, Draft trigger & eligibility, Draft content/tone/language, Edit/regenerate/reject semantics

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Review surface & queue UX | Where the queue lives; what QUE-04 evidence renders | ✓ |
| Draft trigger & eligibility | When drafts generate; which prospects qualify (CON-05 interaction) | ✓ |
| Draft content, tone & language | Locale, prompt location, cited number, Art. 14 placement | ✓ |
| Edit / regenerate / reject semantics | What each queue action writes to migration 012's state machine | ✓ |

**User's choice:** All four.

### Todo cross-reference

| Option | Description | Selected |
|--------|-------------|----------|
| Don't fold — note as deferred | `random-import-from-target-categories` is import/triage scope; matched on generic keywords only | ✓ |
| Fold it into Phase 6 | Treat random-import sampling as part of this phase | |

---

## Review surface & queue UX

### Where does the approval queue live in the admin?

| Option | Description | Selected |
|--------|-------------|----------|
| New 4th tab "Outreach" | Adds `outreach` to the Tab union at app/admin/page.tsx:54; reuses existing auth, pagination, fetch pattern | ✓ |
| Extend the Shortlist tab | Follows Phase 5's D-5-02 no-new-surface precedent; row gets crowded with inline editing | |
| Dedicated full-page review screen | /admin/outreach/[id]; best reading experience, most new surface | |

**User's choice:** New 4th tab "Outreach".
**Notes:** Separates "who is worth pitching" (Shortlist) from "what am I sending them" (Outreach). Departs from Phase 5's precedent because inline editing plus an evidence pane does not fit a table row.

### Inside the tab, how do you read and act on a draft?

| Option | Description | Selected |
|--------|-------------|----------|
| Expandable row — one open at a time | Full-width panel: editable draft left, evidence right; single-open reinforces QUE-05 | ✓ |
| List + side drawer | Table context preserved; drawer cramped for a full email body plus evidence | |
| List + navigate to detail page | Most room; a page load between every prospect makes 20 drafts feel slow | |

**User's choice:** Expandable row, one open at a time.
**Notes:** Single-open is a structural expression of the no-bulk-approve rule, not just a layout preference.

### What does the QUE-04 evidence pane show?

| Option | Description | Selected |
|--------|-------------|----------|
| Summary block + link to hosted report | Score, DRA-06 verdict, critical/major counts, top 3 issues — all already in scans.summary; plus /report/[id] link | ✓ |
| Only the numbers the draft cites | Tightest pane; loses the ability to spot a weak or misleading chosen number | |
| Embedded report iframe | Nothing to build; far too tall and heavy for a review pane | |

**User's choice:** Summary block + link to hosted report.

### What does the tab list by default, and in what order?

| Option | Description | Selected |
|--------|-------------|----------|
| Pending drafts only, worst score first | status draft/edited; matches Shortlist's worst-is-most-qualified inversion; approved/rejected behind a filter | ✓ |
| Everything with a draft, newest first | Simple; approved/rejected pile up and bury the work | |
| Pending first, then everything else below | No filter UI; list grows unbounded | |

**User's choice:** Pending drafts only, worst score first.

---

## Draft trigger & eligibility

### When does a draft get generated?

| Option | Description | Selected |
|--------|-------------|----------|
| On scan-complete, fire-and-forget | Hooks the existing /api/internal/scan-complete webhook; matches the codebase's async pattern | ✓ |
| On-demand, button per prospect | Zero wasted Gemini calls; queue is empty on arrival | |
| Daily cron, alongside the drain | Batched; Vercel Hobby's daily cap means up to 24h latency | |

**User's choice:** On scan-complete, fire-and-forget.

### CON-05: what happens to named-person-only prospects?

| Option | Description | Selected |
|--------|-------------|----------|
| No auto-draft; manual generate stays available | Honours CON-05's "automatically" without dead-ending the prospect | ✓ |
| No draft at all, ever | Strictest reading; permanently strands prospects a judgement call could clear | |
| Auto-draft but held in a separate review state | Spends Gemini calls on prospects that may never be contacted; adds a state the schema lacks | |

**User's choice:** No auto-draft; manual generate stays available.

### Prospects with no extracted contact email?

| Option | Description | Selected |
|--------|-------------|----------|
| No draft, no queue row | A draft with nowhere to send it is queue noise | ✓ |
| Draft anyway, flag missing contact | Work done in advance; pads the queue and burns calls | |

**User's choice:** No draft, no queue row.

### Is there a score floor for drafting?

| Option | Description | Selected |
|--------|-------------|----------|
| No new threshold — reuse the release gate | Triage cutoff + Phase 4.1 isReleasable already decided; a second threshold is a second thing to get wrong | ✓ |
| Draft only below a configurable overall score | A DRAFT_SCORE_CEILING constant stops weak-evidence drafts reaching the queue | |
| Draft everything, sort by score | Simplest logic, most wasted Gemini calls | |

**User's choice:** No new threshold — reuse the release gate.

---

## Draft content, tone & language

### What language does a draft generate in?

| Option | Description | Selected |
|--------|-------------|----------|
| Follow prospect country config | prospects.country_code → locale; honours no-hardcoded-geography and the CMP-16 pattern | ✓ |
| Dutch only, hardcoded | Simplest; contradicts a standing constraint and must be undone at first expansion | |
| Both NL and EN, like the scanner | Mirrors ai_content_alt; doubles cost and review surface for a version rarely sent | |

**User's choice:** Follow prospect country config — NL prospects get Dutch.

### Where does the cold-outreach tone brief live?

| Option | Description | Selected |
|--------|-------------|----------|
| Versioned prompt file in the repo | Tone brief + DRA-04 guardrails + Art. 14 text in one reviewable place; git history records how the pitch evolves | ✓ |
| Inline string in the generator | One less file; buries the thing you iterate on most | |
| Database-stored template, editable in admin | Fastest iteration; new schema, new UI, no version history, for a tool that deploys in a minute | |

**User's choice:** Versioned prompt file in the repo.

### DRA-05: how does the Article 14 notice get into the message?

| Option | Description | Selected |
|--------|-------------|----------|
| Appended by code after generation | Fixed translated string; the model cannot paraphrase, shorten or drop it | ✓ |
| Part of the Gemini prompt, AI writes it | Reads more naturally; a model rewording a legal disclosure is the exact failure DRA-05 exists to prevent | |
| Appended at send time in Phase 8 | Cleaner drafts; you'd be approving a message that isn't what goes out | |

**User's choice:** Appended by code after generation.

### DRA-02: who picks the cited number?

| Option | Description | Selected |
|--------|-------------|----------|
| Code picks it, prompt must use it | Selector in lib/ chooses the strongest metric from scans.summary and passes it as a required fact | ✓ |
| Gemini picks from the full scan payload | More varied copy; inherits hallucinated or cherry-picked numbers | |
| Fixed metric for every draft | Trivially verifiable; every email reads identically — the generic line DRA-02 rules out | |

**User's choice:** Code picks it, prompt must use it.

---

## Edit / regenerate / reject semantics

### What does editing write?

| Option | Description | Selected |
|--------|-------------|----------|
| Overwrite in place, status → edited | What migration 012 was built for; AI original not retained | ✓ |
| Keep the AI original alongside your edit | Raw material for prompt improvement — but that's REF-02, deferred to v2 | |
| Full version history per draft | Complete audit trail; over-built for single-tenant at this volume | |

**User's choice:** Overwrite in place, status → edited.

### Can you regenerate, and what happens to edits?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with a confirm when edits exist | Fresh Gemini call overwrites, resets to draft; confirm guards an `edited` draft. Also the failure-recovery and named-person entry point | ✓ |
| Yes, no confirmation | Fewer clicks; one misclick destroys a rewrite | |
| Only when no draft exists | Nothing can be lost; can't reroll a badly wrong draft | |

**User's choice:** Yes, with a confirm when edits exist.

### QUE-03: does reject kill the message or the prospect?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — message rejected, prospect marked never-contact | Without the prospect-level mark, a rescan resurrects it. Distinct from suppression: editorial, not legal | ✓ |
| Message only | Smallest change; a future rescan re-drafts a prospect already turned down | |
| Write it to the suppression list | Guarantees Phase 8 honours it; conflates editorial rejection with an opt-out, and CMP-06 makes it hard to reverse | |

**User's choice:** Both — message rejected, prospect marked never-contact.
**Notes:** Explicitly must NOT write to the Phase 2 suppression table.

### What does approving do, given Phase 8 doesn't exist?

| Option | Description | Selected |
|--------|-------------|----------|
| Sets status/approved_by/approved_at, nothing else | Draft leaves the pending view and waits; Phase 8 owns dispatch and its channel is undecided | ✓ |
| Also advance prospect lifecycle state | Pre-empts Phase 7 and would be a lie — approved isn't contacted (TRK-02) | |

**User's choice:** Sets status/approved_by/approved_at, nothing else.

---

## Claude's Discretion

- Schema shape for the prospect-level never-draft flag (D-6-15) and failed-generation state; idempotent migration, dashboard-applied.
- What `approved_by` holds given there is no user system.
- Backfill approach for prospects scanned before this ships.
- Gemini failure handling, timeout and retry policy on the scan-complete path.
- Subject-line generation, message length, DRA-03 report-link rendering.
- The exact metric-selection heuristic inside D-6-11.
- Test approach per project conventions.

## Deferred Ideas

- Backfill of drafts for already-scanned prospects (revisit at plan time if larger than a one-off script).
- Per-draft feedback capture / AI-vs-human edit diffing — REF-02, v2.
- Bulk anything — permanently out of scope, not deferred.
- Sending, suppression-at-send, per-send audit record — Phase 8.
- Lifecycle transitions and reply/booked reporting — Phase 7.
- Todo `2026-07-24-random-import-from-target-categories.md` — reviewed, not folded; import/triage scope.
