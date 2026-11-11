# Phase 6: Draft Generation & Approval Queue - Research

**Researched:** 2026-07-28
**Domain:** Server-side Gemini text generation from Next.js, verdict-threshold consolidation, admin CRUD queue UI
**Confidence:** HIGH (verdict consolidation, schema, hook point, UI wiring — all confirmed by direct codebase read) / LOW-MEDIUM (Gemini prompt-engineering guarantees, Vercel background-execution semantics — external, unverifiable against this specific deployment without a live test)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by ROADMAP / PROJECT (do not re-litigate):**
- D-6-R1: No bulk-approve action anywhere (QUE-05).
- D-6-R2: Suppression is NOT checked in this phase (gates send only, Phase 8).
- D-6-R3: Drafts are generated from full scan output, not triage output.
- D-6-R4: DRA-06 verdict consolidation is the first plan of this phase. Consolidate into one function exported from `lib/scoring.ts`, imported by the scanner service and the draft generator. Not a scoring refactor — `scorePage()`/`aggregateScores()` split stays, triage's scorer is untouched.
- D-6-R5: Draft generation calls Gemini from Next.js. No browser needed.

**Review surface & queue UX:**
- D-6-01: The queue is a new 4th admin tab, "Outreach" (`app/admin/page.tsx:54` `Tab` union).
- D-6-02: Expandable row, one open at a time — single-open state is the structural enforcement of QUE-05.
- D-6-03: Evidence pane (QUE-04) = summary block (overall score, consolidated DRA-06 verdict, critical/major counts, top 3 issues) + report link. Already in `scans.summary`, no new plumbing.
- D-6-04: Default view is pending drafts only (`draft`/`edited`), worst score first.

**Draft trigger & eligibility:**
- D-6-05: Drafts generate on scan-complete, fire-and-forget, hooked into `/api/internal/scan-complete`. A generation failure leaves no draft row; regenerate is the recovery path.
- D-6-06: Named-person-only prospects get no automatic draft; manual generate stays available.
- D-6-07: Prospects with no extracted contact email get no draft and no queue row.
- D-6-08: No new score threshold for drafting — triage's cutoff + `isReleasable` already decided eligibility.

**Draft content, tone & language:**
- D-6-09: Draft locale follows the prospect's country config (referred to in CONTEXT.md as `prospects.country_code` — **see Pitfall 1, this column does not exist under that name**).
- D-6-10: Cold-outreach tone brief lives in a versioned prompt file in the repo (tone brief + DRA-04 guardrails + Article 14 text, one reviewable place).
- D-6-11: The DRA-02 evidence number is chosen by code (a selector in `lib/`), passed to Gemini as a required fact.
- D-6-12: The Article 14 notice is appended by code AFTER generation (DRA-05), not written by Gemini.

**Edit / regenerate / reject / approve semantics:**
- D-6-13: Editing overwrites in place; status flips `draft` → `edited`. No AI-original retention (REF-02 deferred).
- D-6-14: Regenerate exists, confirms first if status is already `edited`.
- D-6-15: Reject kills the message AND flags the prospect so scan-complete never re-drafts it. Explicitly NOT suppression — must not write to the Phase 2 suppression table.
- D-6-16: Approve writes `status`, `approved_by`, `approved_at` and nothing else. No dispatch, no lifecycle write (Phase 7/8 own that).

### Claude's Discretion
- Schema shape for the D-6-15 prospect-level never-draft flag, and anything D-6-05 needs for a failed-generation record. Idempotent migration, applied via Supabase dashboard SQL Editor — never `supabase db push`.
- What `approved_by` holds given no user system exists (single-tenant, admin-secret auth only).
- Whether prospects scanned before ship get backfilled drafts, and by what mechanism.
- Gemini failure handling, timeout and retry policy on the scan-complete path — follow `scanner-service/src/ai.ts` conventions (return null, continue, never block).
- Subject-line generation, message length, how the DRA-03 report link renders in the body.
- Exact metric-selection heuristic inside D-6-11.
- Test approach per project conventions (vitest, local Supabase pinned to 127.0.0.1).

### Deferred Ideas (OUT OF SCOPE)
- Backfill of drafts for already-scanned prospects — discretion, revisit at plan time only if it's more than a one-off script.
- Per-draft feedback capture / AI-vs-human edit diffing (REF-02, v2).
- Bulk anything — permanently out of scope, not deferred.
- Sending, suppression-at-send, per-send audit record — Phase 8.
- Lifecycle transitions and reply/booked reporting — Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DRA-01 | Each shortlisted prospect gets a drafted outreach message from its own full scan findings | Hook point confirmed in `app/api/internal/scan-complete/route.ts`; generator reads `scans.summary`/`scores`/`pages` — no new scan-side plumbing needed |
| DRA-02 | Draft cites a specific, checkable number from the scan | Metric-selector design (D-6-11) below; `scans.summary` already carries `totalIssues`, `criticalIssues`, `majorIssues`, `topIssues`; Core Web Vitals live in `pages[].data` — selector must reach into per-page data, not just `summary` |
| DRA-03 | Draft links to the hosted report | `${NEXT_PUBLIC_SITE_URL}/report/${scanId}` — exact pattern lifted from `lib/email.ts` (`BASE_URL` constant, used 4x already) |
| DRA-04 | Tone lands as helpful, not insulting | `VOICE_DIRECTIVE` constant in `scanner-service/src/ai.ts` is the established brand-voice injection pattern; D-6-10's versioned prompt file layers a cold-outreach-specific brief on top |
| DRA-05 | Article 14 notice is programmatic, not manual | D-6-12 (code appends after generation) — content sourced from `docs/legal/lia/LIA-v1.md` §4 required-elements list (see Pitfall 6) |
| DRA-06 | One verdict function, same output in list/report/email | Both current implementations read below; consolidation plan below |
| QUE-01..05 | Review, edit, reject-outright, evidence-alongside, no-bulk | `outreach_messages` schema already supports the full state machine; UI-SPEC.md is binding and already resolves the interaction design |
</phase_requirements>

## Summary

Phase 6 is mostly wiring, not invention: the hard schema (`outreach_messages`, migration 012) and the hard UI decisions (UI-SPEC.md) are already locked. The two genuinely unfamiliar pieces are (1) making a Gemini call safely from a Vercel serverless function for the first time in this codebase's history — every existing Gemini call lives in the always-on Railway Express service — and (2) consolidating two divergent verdict functions without disturbing the intentional per-page/aggregate scoring split.

Direct codebase reads surfaced three landmines not visible from CONTEXT.md alone. First, `prospects.country_code` does not exist — the real column is `prospects.country` (ISO2, e.g. `"NL"`), and no country→locale mapping exists anywhere yet; D-6-09 needs a small new lookup, not a read of an existing field. Second, the scan-complete webhook that D-6-05 hooks into already receives a POST for every full scan including bulk/prospect scans (scanner-service calls it unconditionally), but its current body rejects with 400 if `!scan.email` — every prospect-scan row has `email = null` by construction, so the route must gain a `prospect_id` branch that runs independently of the existing email-lead branch, not just an addition bolted onto the end of the current happy path. Third, the Next.js side has zero prior art for background/fire-and-forget execution (`setImmediate` exists only in the Railway service); the simplest correct fix is a plain synchronous `await` before responding, with `maxDuration` raised to match the sibling cron routes (60s) — no new dependency (`@vercel/functions`) needed for a 10-50/week workload.

**Primary recommendation:** Do DRA-06 first exactly as scoped (extract one `computeVerdict(scores, criticalCount): string` from `lib/scoring.ts`, re-export from the scanner service, no other scoring change). Then build the draft generator as a synchronous, awaited call inside a new `prospect_id` branch of `scan-complete/route.ts`, with `maxDuration` raised and a code-side (not Gemini-side) verification that the D-6-11 selected metric literally appears in the model's output before accepting the draft.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verdict consolidation (DRA-06) | API / Backend (`lib/scoring.ts`) | Scanner service (import only) | Single source of truth must live where both consumers (Next.js draft generator, scanner-service report/list) can import it; scanner-service already has a working `@shared/*` alias precedent for cross-boundary imports, but `lib/` is Next.js-only today — see Pitfall 2 |
| Draft generation (DRA-01/02/03/04/05) | API / Backend (Next.js, `scan-complete` route + new `lib/draft-generator.ts`) | — | D-6-R5 locks this out of the browser and out of the scanner service; no client-side involvement at all |
| Metric selection (D-6-11) | API / Backend (`lib/`) | — | Pure function over `scans.summary`/`scores`/`pages`, no I/O — same shape as `lib/contact-extraction.ts` |
| Article 14 append (D-6-12) | API / Backend (`lib/`) | — | Fixed string concatenation after the Gemini call returns, not a prompt concern |
| Outreach tab UI (D-6-01/02/03/04) | Browser / Client (React) | API / Backend (new `/api/admin/outreach` routes) | Matches the existing Shortlist tab split: client component + admin API route, no SSR needed (admin is already `"use client"` throughout) |
| Locale selection (D-6-09) | API / Backend (`lib/`) | Database (config constant, not a table) | A country→locale lookup table would be over-built for two possible locale values; a small named constant matches the `EXCLUDED_CATEGORIES`/`TRIAGE_USER_AGENT` precedent already in this codebase |
| Reject-blocks-redraft (D-6-15) | Database (`prospects.lifecycle_state`) | API / Backend (scan-complete gate check) | Reuses the existing `lifecycle_state` CHECK constraint's `'rejected'` value rather than adding a column — see Don't Hand-Roll |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/generative-ai` | `^0.24.1` (currently `scanner-service`-only; confirmed on npm registry `[VERIFIED: npm registry]`) | Gemini text generation for the draft | Already the project's sole AI integration; D-6-R5 requires it to also be a **root** `package.json` dependency, not just `scanner-service/package.json` |

**Installation:**
```bash
npm install @google/generative-ai@0.24.1
```
Run at the repo root — `scanner-service/` already has it in its own `package.json`; this is a second, independent install for the Next.js app, since the two `package.json`s do not share a lockfile or `node_modules` tree.

### Supporting
No new supporting libraries. Everything else this phase needs (Supabase client, vitest, existing i18n helpers) is already a dependency.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain `await` inside the route handler | `waitUntil()` from `@vercel/functions`, or Next.js `after()` | Both give a true fire-and-forget (response returns immediately, generation continues detached). Neither is worth the new dependency (`@vercel/functions`) or the Next.js-version risk (`after()` was experimental in 14.x, stabilized in 15.1 — this project is on 14.2.35) at 10-50 drafts/week. A synchronous await with a raised `maxDuration` is simpler and already the project's established idiom for "slow but bounded" routes (`app/api/scan/route.ts` sets `maxDuration = 300` for exactly this reason). |

**Version verification:** `npm view @google/generative-ai version` → `0.24.1`, matching the version already pinned in `scanner-service/package.json`. No drift to reconcile.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@google/generative-ai` | npm | published 2025-04-29 (this major line); org-maintained since 2023 | ~3.88M/week | `github.com/google/generative-ai-js` | OK | Approved — already a trusted, in-production dependency of this exact codebase (`scanner-service`); this phase only adds it to a second `package.json` |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

No `checkpoint:human-verify` gate is needed for this install — it is not a new supply-chain surface, it is the same already-approved package added to a second manifest in the same repo.

## Architecture Patterns

### System Architecture Diagram

```
scanner-service (Railway, always-on)
  full-scan-async completes
    │
    ├─▶ writes scans row (status=completed, scores, summary, pages)
    │
    └─▶ POST /api/internal/scan-complete   (unconditional, fire-and-forget,
         { scanId }                          10s abort timeout on the CALLER side only —
                                              does not affect how long the Next.js function runs)
                                                │
                                                ▼
                                  scan-complete/route.ts (Next.js, Vercel)
                                                │
                              ┌─────────────────┴─────────────────┐
                              │                                   │
                     scan.prospect_id IS NULL           scan.prospect_id IS NOT NULL
                     (existing public-lead path,        (NEW: Phase 6 branch)
                      unchanged)                                  │
                              │                                   ▼
                     sendReportReadyEmail(...)          eligibility gate:
                     sendAdminNotificationEmail(...)      - contact_email present? (D-6-07)
                                                           - contact_email_type != named-person? (D-6-06)
                                                           - lifecycle_state != 'rejected'? (D-6-15)
                                                                    │ pass
                                                                    ▼
                                                        selectCitableMetric(scan)  (D-6-11, lib/)
                                                                    │
                                                                    ▼
                                                        generateDraft(prospect, scan, metric, locale)
                                                          → Gemini call (awaited, synchronous)
                                                          → returns null on timeout/error (non-fatal)
                                                                    │ non-null
                                                                    ▼
                                                        appendArticle14Notice(draftBody, locale)  (D-6-12)
                                                                    │
                                                                    ▼
                                                        INSERT outreach_messages (status='draft')
                                                                    │
                                                                    ▼
                                                        response 200 (whether draft succeeded or not —
                                                        never fail the webhook itself)

Admin browser
  │
  ▼
app/admin/page.tsx  ("Outreach" tab, 4th in Tab union)
  │
  ▼
GET /api/admin/outreach  (secret-header auth, same pattern as /api/admin/shortlist)
  │
  ▼
expandable row (single expandedId state) → left: edit/regenerate/approve/reject
                                          → right: evidence pane (scans.summary + link to /report/[scanId])
```

### Recommended Project Structure
```
lib/
├── scoring.ts                  # DRA-06: gains the single exported verdict function
├── draft-prompt.ts             # NEW — versioned prompt template (D-6-10), pure string builder, unit-testable
├── draft-metric-selector.ts    # NEW — D-6-11: picks the one citable number, pure function
├── draft-generator.ts          # NEW — orchestrates Gemini call + D-6-12 append, injectable client (DI pattern)
├── draft-locale.ts             # NEW — D-6-09: small country→locale constant map
app/api/internal/scan-complete/
└── route.ts                    # gains the prospect_id branch
app/api/admin/outreach/
└── route.ts                    # NEW — GET (list, filtered by status) + PATCH (edit/approve/reject/regenerate)
components/admin/
├── outreach-table.tsx          # NEW — collapsed table, mirrors shortlist-table.tsx
└── outreach-row-panel.tsx      # NEW — expanded panel, draft editor + evidence pane
supabase/migrations/
└── 019_add_outreach_reject_flag.sql   # NEW (or reuse lifecycle_state — see Don't Hand-Roll)
docs/prompts/
└── draft-outreach-v1.md        # NEW — D-6-10's versioned tone brief (git-tracked prose, imported as a string constant or read at build time)
```

### Pattern 1: Dependency-injected Gemini client (matches `dispatchClaimedProspects`'s DI seam)
**What:** The draft generator takes an optional `deps.client` just like `lib/bulk-scan-dispatch.ts` takes `deps.client: Pick<ScannerClient, "fullScanBulk">`.
**When to use:** Any function that calls an external, non-deterministic API and needs a fast, deterministic unit test suite.
**Example:**
```typescript
// Source: pattern lifted from lib/bulk-scan-dispatch.ts (dispatchClaimedProspects)
interface DraftDeps {
  generate?: (prompt: string) => Promise<string | null>;
}

export async function generateDraft(
  prospect: ProspectRow,
  scan: ScanRow,
  metric: CitableMetric,
  deps: DraftDeps = {}
): Promise<{ subject: string; body: string } | null> {
  const generate = deps.generate ?? defaultGeminiGenerate;
  const prompt = buildDraftPrompt(prospect, scan, metric); // pure, unit-tested separately
  const raw = await generate(prompt);
  if (!raw) return null;
  if (!raw.includes(metric.displayValue)) {
    console.error("[draft] Generated body dropped or altered the required metric — discarding");
    return null; // fail closed, not a paraphrased/hallucinated number (D-6-11)
  }
  return parseDraftOutput(raw);
}
```

### Pattern 2: Timeout-wrapped Gemini call, non-fatal (matches `scanner-service/src/ai.ts`'s `withTimeoutLocal`)
**What:** Every existing Gemini call in this codebase returns `null` on timeout/error and the caller continues — never throws, never blocks the pipeline.
**When to use:** The draft-generation call itself.
**Example:**
```typescript
// Source: scanner-service/src/ai.ts, withTimeoutLocal (lines 97-109), reproduced for the Next.js side
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
// scan-complete route: await withTimeout(generateDraft(...), 45_000, null)
```

### Pattern 3: Language directive injection (matches `generateComprehensiveAnalysis`'s `languageDirective`)
**What:** `scanner-service/src/ai.ts` prepends a `languageDirective` string when `locale === "nl"`, instructing the model to respond entirely in Dutch, JSON keys staying English.
**When to use:** D-6-09's per-prospect locale selection for the draft prompt.
**Example:**
```typescript
// Source: scanner-service/src/ai.ts lines 257-259
const languageDirective = locale === "nl"
  ? `LANGUAGE: Respond entirely in natural Dutch (Nederlands)...`
  : "";
```

### Anti-Patterns to Avoid
- **Adding a Gemini SDK-level `timeout` option instead of the codebase's `Promise.race` convention:** the SDK does support a `RequestOptions.timeout` field, but every existing call site in this repo uses the local `withTimeout`/`withTimeoutLocal` wrapper. Mixing both mechanisms in the same codebase makes failure behavior inconsistent for the next reader. Follow the established convention.
- **Using `setImmediate` on the Next.js side:** this pattern exists only in `scanner-service/src/index.ts` (an always-on Express process). On Vercel serverless, `setImmediate` scheduled after a response is returned has no guarantee of running to completion — the execution environment can freeze. Either await synchronously (recommended here) or use `waitUntil()`/`after()` explicitly; never assume `setImmediate` "just works" because it does elsewhere in this repo.
- **Trusting Gemini to include the Article 14 notice:** D-6-12 already locks this (code appends after generation), but the underlying risk this decision avoids is real — models reliably paraphrase, shorten, or drop boilerplate legal text embedded only via prompt instruction. Do not weaken D-6-12 later "to make the draft read more naturally."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| D-6-15's "never re-draft this prospect" flag | A new `prospects.draft_rejected` boolean/timestamp column | `prospects.lifecycle_state = 'rejected'` | `[VERIFIED: codebase grep]` The `lifecycle_state` CHECK constraint (migration 010) already includes `'rejected'` as a valid value, and nothing in the codebase writes it yet — it is unused today. Reusing it needs zero new schema. **Coordination note:** Phase 7 (TRK-01/02) is the documented future owner of the `lifecycle_state` state machine; log this reuse as a decision in STATE.md so Phase 7 planning doesn't reintroduce a parallel "rejected" mechanism or overwrite this value as part of a generic status-advance sweep. |
| D-6-09's country→locale mapping | A new database table or a `legal_regimes.locale` column | A small named constant, e.g. `lib/draft-locale.ts` exporting `COUNTRY_LOCALE_MAP: Record<string, "en" | "nl">` defaulting unknown countries to `"en"` | The app supports exactly two locales today (`type Locale = "en" | "nl"` in `lib/email.ts`); a table is over-built for a lookup with two possible outputs. This matches the existing `EXCLUDED_CATEGORIES`/`TRIAGE_USER_AGENT` "named tunable constant" convention from Phase 3/4.1, not a new persistence layer. |
| Verifying the cited number wasn't altered by the model | A second Gemini call to "check" the first one | A plain `String.includes()` check in code against the exact string the selector produced | Gemini can't reliably self-audit its own paraphrasing, and a second AI call doubles cost and latency for a problem a string comparison solves deterministically. |
| Draft locale detection from prose | Language-detection library on the generated output | Locale is already known before generation (comes from `prospects.country` → the map above) — pass it INTO the prompt, don't detect it after | The output language is fully determined by the input; detecting it afterward is solving an already-solved problem. |

**Key insight:** Every "new" piece of infrastructure this phase seems to need (a locale table, a reject-flag column, an AI verification pass) already has a same-shape solution sitting unused in the codebase or is smaller than it looks once the actual cardinality (two locales, one boolean-shaped state) is accounted for.

## Common Pitfalls

### Pitfall 1: `prospects.country_code` does not exist
**What goes wrong:** CONTEXT.md (D-6-09) and this research's own additional-context brief both reference `prospects.country_code`. `[VERIFIED: codebase grep]` The actual column, present since migration 010, is `prospects.country` (e.g. `"NL"`, matching the `--country=NL` CLI argument convention in `scripts/import-prospects.ts`). The only table with a column literally named `country_code` is `legal_regimes` (migration 015), a different table entirely.
**Why it happens:** CONTEXT.md was written referencing IMP-06 conceptually ("which country each prospect belongs to") without re-verifying the literal column name against the schema.
**How to avoid:** Read `prospects.country` in the draft generator and locale selector. Do not add a migration to rename or duplicate the column — that would be scope creep into Phase 1's schema for no benefit.
**Warning signs:** A Supabase query that silently returns `undefined`/`null` for a `country_code` selector — Postgres will error on a genuinely missing column in a `.select()`, so this would surface immediately at integration-test time, not silently in production.

### Pitfall 2: The scan-complete route rejects every bulk-scan callback today, by design of its *current* code (not a bug, but a gate that must move)
**What goes wrong:** `[VERIFIED: codebase grep]` `app/api/internal/scan-complete/route.ts` currently does: `if (scan.status !== "completed" || !scan.email || !scan.summary) return 400`. Every prospect (bulk) scan's `scans` row is inserted by `lib/bulk-scan-dispatch.ts` with no `email` field at all (only `id, url, domain, type, status, pages, started_at, ip_hash, prospect_id`), so `scan.email` is always `null` for prospect scans. If Phase 6's draft-generation code is appended naively AFTER this existing guard, it will never run for a single bulk scan.
**Why it happens:** The route was designed for exactly one caller shape (public lead scans) before Phase 4 introduced a second, email-less scan shape.
**How to avoid:** Branch on `scan.prospect_id` BEFORE the existing `!scan.email` check, not after it. The prospect branch needs `scan.status === "completed"` and `scan.summary`/`scan.scores` present, but must never require `scan.email`.
**Warning signs:** Zero draft rows ever appear despite scans completing — silent, because the route still returns 200-ish/400 either way and nothing surfaces the skip (D-6-05 already accepts "no row" as the failure signal, so this pitfall can hide for a while unless it's specifically tested).

### Pitfall 3: The scanner-service's callback has its own independent 10-second abort timeout — separate from the Next.js function's `maxDuration`
**What goes wrong:** `[VERIFIED: codebase grep]` `scanner-service/src/index.ts` calls the webhook with `signal: AbortSignal.timeout(10_000)` and a `.catch()` that only logs. If the Next.js route takes longer than 10s (a Gemini call plausibly will), the scanner-service's own fetch aborts and logs "Failed to trigger report email" — harmless (it's fire-and-forget from that side already) but easy to misread as "the draft generation itself failed." `[CITED: general Vercel/AWS Lambda serverless-invocation semantics, LOW confidence — not confirmed against this project's specific Vercel plan]` a Vercel Node function invocation, once started, is understood to continue running to completion (up to its own `maxDuration`) independent of whether the calling client disconnected; if that holds here, the Next.js side still finishes writing the draft even though the scanner-service's log shows an error.
**Why it happens:** Two independent timeout budgets exist on either side of the same HTTP call, and only one of them (the Next.js side) matters for whether the draft actually gets written.
**How to avoid:** Set `export const maxDuration = 60;` (matching the `follow-up`/`send-pending-reports`/`drain-scan-queue` cron-route convention already in this repo) on `scan-complete/route.ts`, and do not treat a scanner-service-side "Failed to trigger report email" log line as proof the draft failed — check `outreach_messages` directly.
**Warning signs:** Confusion during manual verification where the scanner-service log shows a timeout error but a draft row exists anyway.

### Pitfall 4: Bulk-scan `scans` rows do not carry `locale` either
**What goes wrong:** The existing `sendReportReadyEmail` call reads `scan.locale ?? "en"` — but bulk scans (via `bulk-scan-dispatch.ts`'s insert) don't set `locale` on the `scans` row any more than they set `email`. The locale for a draft must come from `prospects.country` (via the new mapping), NOT from `scan.locale`, even though `scan.locale` is what the rest of the codebase (report page, report-ready email) already reads.
**Why it happens:** `scan.locale` was designed for the public-scanner visitor-language toggle, a different concept from "which country is this business in."
**How to avoid:** Explicitly resolve locale from `prospects.country` in the draft generator; do not reuse `scan.locale` for this purpose even though it's tempting since it's already on the row being read.
**Warning signs:** A draft generated in the visitor's browser locale (usually `"en"`, or whatever default the scan row happens to carry) instead of the correct business-country locale.

### Pitfall 5: Gemini has no mechanism that guarantees verbatim number reuse
**What goes wrong:** `[CITED: ai.google.dev/gemini-api/docs, LOW-MEDIUM confidence]` there is no Gemini API parameter that pins a specific substring into the output unchanged. Structured JSON output (`responseMimeType: "application/json"`) constrains shape, not content — the model can still round `73` to "about 70" or restate `"3.2s load time"` as "over three seconds," which breaks D-6-11's "guarantees the number is real, makes verification deterministic" premise if not checked.
**Why it happens:** LLMs paraphrase by default; explicit prompt instructions to preserve a number reduce but do not eliminate this.
**How to avoid:** After generation, verify the exact display string (e.g. `"73"`, `"3.2s"` — whatever `selectCitableMetric()` produced) appears verbatim in the returned body via `String.includes()`. If absent, treat it the same as a generation failure (D-6-05's existing "no row" recovery path) rather than accepting a draft that silently fails DRA-02.
**Warning signs:** A draft in the review queue whose prose doesn't match the number highlighted in the evidence pane (exactly the scenario D-6-03's "one glance verifiable" UI design exists to catch — but catching it via code first is cheaper than relying on Joshua noticing it during every single review).

### Pitfall 6: The Article 14 notice text does not exist yet as approved copy — it currently exists only as a *list of required elements*
**What goes wrong:** `docs/legal/lia/LIA-v1.md` §4 ("Article 14 Notice Approach") lists eight required disclosure elements (controller identity, purpose, legal basis + LIA link, data categories, source, recipients, retention criteria, rights) but is explicitly marked `Status: DRAFT — pending counsel review` and contains no drafted notice sentence(s) to literally append. D-6-12 assumes a "fixed, translated string" already exists to append; it doesn't yet.
**Why it happens:** LIA-v1.md's own scope note defers enforcement of first-contact notice content to "the send phase, not this phase" — but Phase 6 needs the actual notice text NOW, to render it in the review pane (even though Phase 8 is what enforces its presence at send time).
**How to avoid:** Treat drafting the actual Article 14 notice sentence(s) (EN + NL) as an explicit task in this phase's plan, sourced from LIA-v1.md §4's element list, and flag it `[ASSUMED — pending counsel review]` in both the prompt file and the UI copy, matching LIA-v1.md's own DRAFT status. Do not present the notice text as legally final; the whole LIA is pending counsel per the Parallel Track.
**Warning signs:** A plan that treats "append the Article 14 notice" as a one-line task with no drafting step.

### Pitfall 7: `topIssues` in `scans.summary` is already capped/deduped, but it is NOT locale-specific for bulk scans the way `ai_content_alt`/`issues_alt` are
**What goes wrong:** The evidence pane (D-6-03) and prompt input both plan to read `scans.summary.topIssues`. This is fine for the primary locale, but if a Dutch-locale draft is generated, the issue titles/descriptions inside `topIssues` are still in whatever locale the scan's primary AI pass ran in (the codebase's existing bilingual system stores alt-locale overrides in `scan.issues_alt`, applied via `applyIssuesAlt()` — but only if the draft generator remembers to call it).
**Why it happens:** The bilingual plumbing exists and is well-established, but it's opt-in per call site, not automatic.
**How to avoid:** If the metric selector or prompt ever quotes an issue title/description (not just a bare number), route it through the existing `applyIssuesAlt()`/`pickLocalizedScan()` helpers in `lib/i18n-helpers.ts` for the resolved draft locale, the same way the report page does.
**Warning signs:** A Dutch draft that quotes an English issue title.

## Code Examples

### DRA-06 verdict consolidation — current state (both copies, to be replaced by one)
```typescript
// Source: lib/scoring.ts lines 55-67 (thresholds: 95/85/70/50)
if (scores.overall >= 95) { verdict = "Excellent work..."; }
else if (scores.overall >= 85) { verdict = "Your website is performing well..."; }
else if (scores.overall >= 70) { verdict = "You have a solid foundation..."; }
else if (scores.overall >= 50) { verdict = `There's clear room to grow...`; }
else { verdict = "Your website has significant issues..."; }

// Source: scanner-service/src/index.ts lines 730-742 (thresholds: 90/70/50 — DIVERGENT)
function generateVerdict(scores: ScanScores, criticalCount: number): string {
  if (scores.overall >= 90) return "Great job! ...";
  if (scores.overall >= 70) { const weakest = getWeakestCategory(scores); return `...but ${weakest} needs attention...`; }
  if (scores.overall >= 50) return `Your website has several areas...`;
  return "Your website has significant issues...";
}
```
**Consolidation shape:** move `generateVerdict`'s richer signature (it already takes `criticalCount` and computes `weakest` category) into `lib/scoring.ts` as the single exported function — it is the more informative of the two — and have `buildSummary()` in `lib/scoring.ts` call it instead of its own inline if/else chain. `scanner-service/src/index.ts` deletes its local `generateVerdict`/`buildSummary`'s inline verdict logic and imports the consolidated function.

**The cross-boundary import question:** `scanner-service/tsconfig.json` maps `@shared/*` → `../types/*` only — it has no path alias into the repo root's `lib/`. `[VERIFIED: codebase grep]` `scanner-service/tsconfig.json`'s `rootDir` is `..` (the repo root), and its `include` is `["src/**/*", "../types/**/*"]` — `lib/` is outside both. Two viable options:
1. Add `lib/scoring.ts` to `scanner-service`'s `include`/a new `@shared-lib/*` path alias pointing at `../lib/*` (mirrors the existing `@shared/*` → `../types/*` precedent exactly — same mechanism, one more alias).
2. Duplicate the single verdict function's logic into `scanner-service/src/index.ts` and unit-test both copies against the same fixture table to guarantee identical output — rejected as needlessly weaker than option 1 (defeats "one function" and reopens the exact bug DRA-06 exists to close).

Recommend option 1: add `"@shared-lib/*": ["../lib/*"]` to `scanner-service/tsconfig.json` and `import { computeVerdict } from "@shared-lib/scoring"` from `scanner-service/src/index.ts`. This is a path-alias change only, no build-tool change, no bundler — `scanner-service` already compiles via plain `tsc`/`tsx` per its `package.json`.

### Locale directive (reuse verbatim)
```typescript
// Source: scanner-service/src/ai.ts lines 257-259 — same pattern for the draft prompt
const languageDirective = locale === "nl"
  ? `LANGUAGE: Respond entirely in natural Dutch (Nederlands). Use clear, direct business Dutch...`
  : "";
```

### Report link construction (reuse verbatim)
```typescript
// Source: lib/email.ts line 16 + 138/186/240/284 (BASE_URL constant, used 4x already)
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://scan.adashi.io";
const reportUrl = `${BASE_URL}/report/${scanId}`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Two independent verdict-threshold functions (`lib/scoring.ts` 95/85/70/50, `scanner-service` 90/70/50) | One consolidated function exported from `lib/scoring.ts` | This phase (DRA-06, first plan) | The prospect list, hosted report, and drafted email now agree on the same verdict for the same scan — required before a draft ever quotes a verdict externally |
| No Gemini usage from the Next.js/Vercel side | `@google/generative-ai` added to root `package.json`, called synchronously from `scan-complete/route.ts` | This phase | First precedent for calling an external AI API from a Vercel serverless function in this codebase; establishes the "raise `maxDuration`, await synchronously" pattern for any future Next.js-side AI call |

**Deprecated/outdated:** None — this phase introduces new capability rather than replacing an existing one (aside from the verdict consolidation above).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A Vercel Node serverless function invocation continues running to completion after the calling client (scanner-service's 10s-abort fetch) disconnects, up to the route's own `maxDuration` | Pitfall 3 | If false, drafts would silently fail to generate for scans where the Gemini call exceeds ~10s, with no error surfaced anywhere (the scanner-service log would show a timeout, which reads as expected/harmless either way). Mitigation: verify with one real production scan post-deploy, checking that `outreach_messages` gets a row even when the scanner-service log shows "Failed to trigger report email." |
| A2 | Adding a `@shared-lib/*` → `../lib/*` path alias to `scanner-service/tsconfig.json` compiles cleanly with the existing `tsc`/`tsx` toolchain (no bundler-specific path resolution needed) | Code Examples, DRA-06 cross-boundary import | If false, the "one function" consolidation would need the fallback (duplicate + fixture-test) approach instead, which is weaker but not blocking. Low risk — `@shared/*` already proves cross-boundary aliasing works in this exact tsconfig. |
| A3 | Setting `prospects.lifecycle_state = 'rejected'` on Reject is safe with no other code currently reading/writing that value for a different purpose | Don't Hand-Roll | Low risk per the grep audit (only `'new'`/`'no_website'`/test-only `'qualified'` are currently written anywhere), but Phase 7 (the documented future owner of `lifecycle_state` transitions) needs this decision logged in STATE.md so it doesn't collide. |
| A4 | Gemini's structured-JSON mode plus an explicit "preserve this figure exactly" instruction is worth attempting before falling back to pure post-hoc verification (rather than skipping the prompt-side attempt entirely) | Pitfall 5 | Low risk either way — the code-side `String.includes()` check (Pattern 1) is the actual safety net regardless of whether the prompt-side instruction helps; A4 only affects how often a draft needs regenerating vs. how often it's silently discarded on the first pass. |

## Open Questions

1. **Where exactly does the "manual generate" action for named-person prospects (D-6-06) and for a silently-failed webhook call live?**
   - What we know: D-6-06 says it's a link-style action next to the `NAMED-PERSON` pill in `shortlist-table.tsx`. The Outreach tab's "Regenerate" action (D-6-14) only works on a prospect that ALREADY has an `outreach_messages` row.
   - What's unclear: A prospect with a usable generic email whose scan-complete draft attempt failed (Gemini timeout, or the webhook call itself never arriving) has no `outreach_messages` row and therefore never appears in the Outreach tab at all. Is there a manual "generate" entry point for THIS case, or does it silently never get a draft unless Joshua notices its absence?
   - Recommendation: Extend the same manual-generate affordance already planned for named-person rows (D-6-06) to also cover any Shortlist row with `contact_email_type = 'generic'` and no linked `outreach_messages` row — same UI location, same action, one extra condition. This closes the "no error, no recovery path" gap the roadmap's own Pitfall 5 note ("first N drafts get read closely before the pattern is trusted") implicitly assumes exists.

2. **Should the draft subject line be generated by Gemini or templated in code?**
   - What we know: CONTEXT.md leaves "subject-line generation... how the report link is rendered" to Claude's discretion.
   - What's unclear: A templated subject (e.g., `"{domain} — a few things we noticed"`) is simpler, deterministic, and needs no AI-verification pass at all; a Gemini-generated subject adds another surface where DRA-02's "specific checkable number" guarantee would need separate enforcement.
   - Recommendation: Template the subject line in code (no Gemini call for it), reserving Gemini for the body only. Simpler, and keeps the number-verification problem (Pitfall 5) confined to one text field.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@google/generative-ai` (root `package.json`) | Draft generation from Next.js (D-6-R5) | ✗ (only in `scanner-service/package.json` today) | needs `0.24.1` added at root | None needed — trivial `npm install`, already vetted (see Package Legitimacy Audit) |
| Gemini API key reachable from the Next.js/Vercel runtime | Draft generation | ✗ — `[VERIFIED: codebase grep]` `.env.local` has no `GEMINI_API_KEY` or `GOOGLE_API_KEY` entry at all; only `scanner-service/.env` has `GEMINI_API_KEY` set, and `app/api/health/route.ts`'s `REQUIRED_VARS` list does not include it either | — | None — this is a genuine environment gap. The plan must add `GEMINI_API_KEY` to `.env.local` (dev) and to the Vercel project's environment variables (prod) before this phase can run end-to-end. Recommend naming it `GEMINI_API_KEY` on the Next.js side too, matching `scanner-service`'s existing name, rather than introducing a second name (`GOOGLE_API_KEY`, which appears only in stale project documentation and is not read by any code path found in this repo) |
| Supabase local instance at 127.0.0.1 | Integration tests (draft insert, reject-flag write) | Assumed ✓ per project convention (`lib/*.integration.test.ts` already pins to it) | — | — |

**Missing dependencies with no fallback:**
- `GEMINI_API_KEY` must be provisioned for the Next.js/Vercel runtime — no code-side fallback exists (the codebase's convention on missing API keys is to return `null` and skip the AI step entirely, which for this phase means "no drafts are ever generated," a silent full-feature outage rather than a partial degradation).

**Missing dependencies with fallback:**
- None — the one real gap (API key) has no fallback by design of this phase's requirements (a draft with no evidence-backed content is not a draft).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest.config.ts`, node environment, `passWithNoTests: true`) |
| Config file | `vitest.config.ts` (repo root) |
| Quick run command | `npx vitest run lib/draft-*.test.ts lib/scoring.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DRA-06 | Consolidated verdict function returns identical thresholds/output shape for known score fixtures | unit | `npx vitest run lib/scoring.test.ts` | ❌ Wave 0 — `lib/scoring.ts` currently has no test file at all |
| DRA-02 / Pitfall 5 | `selectCitableMetric()` picks the worst CWV/critical-count/lowest-category deterministically from a fixture `scans.summary`/`scores` | unit | `npx vitest run lib/draft-metric-selector.test.ts` | ❌ Wave 0 |
| DRA-05 | `appendArticle14Notice()` produces a string containing every required LIA-v1 §4 element marker, for both `en` and `nl` | unit | `npx vitest run lib/draft-generator.test.ts` | ❌ Wave 0 |
| D-6-11 (verbatim-metric guard) | `generateDraft()` discards (returns null) a mocked Gemini response that omits the required metric string | unit (injectable `deps.generate`) | `npx vitest run lib/draft-generator.test.ts` | ❌ Wave 0 |
| D-6-05 (eligibility gate) | `scan-complete` route's prospect branch skips named-person / no-email / rejected prospects and does not throw | integration (local Supabase) | `npx vitest run app/api/internal/scan-complete/route.integration.test.ts` | ❌ Wave 0 |
| D-6-13/14/15/16 (status transitions) | Edit flips to `edited`; regenerate confirms/overwrites and resets to `draft`; reject sets `outreach_messages.status='rejected'` AND `prospects.lifecycle_state='rejected'`; approve writes exactly `status`/`approved_by`/`approved_at` | integration (local Supabase) | `npx vitest run app/api/admin/outreach/route.integration.test.ts` | ❌ Wave 0 |
| QUE-05 (single-open invariant) | Only one row's `expandedId` can be non-null at any time; expanding a second row collapses the first | unit (component logic, not full render) — or manual UAT per UI-SPEC.md's own interaction contract | manual (admin surface has no existing component-test harness) | N/A — matches the project's existing convention of manual UAT for admin UI (no React Testing Library anywhere in this repo today) |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched-file>.test.ts`
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus one manual production smoke test per Assumption A1 (confirm a draft row appears for a real scan even if the scanner-service log shows the 10s callback timeout)

### Wave 0 Gaps
- [ ] `lib/scoring.test.ts` — no existing test file for `lib/scoring.ts` at all; needed before DRA-06 consolidation can be verified against fixtures
- [ ] `lib/draft-metric-selector.test.ts`, `lib/draft-generator.test.ts`, `lib/draft-prompt.test.ts` — new pure-function test files, same shape as `lib/scanner-design-prompt.test.ts` (prompt-builder string assertions) and `lib/contact-extraction.test.ts` (pure classification logic)
- [ ] `app/api/internal/scan-complete/route.integration.test.ts` — no existing integration test for this route at all (it has zero tests today); needed to cover the new `prospect_id` branch without touching the existing email-lead branch
- [ ] `app/api/admin/outreach/route.integration.test.ts` — new admin route, no precedent test file (mirrors whatever pattern the Shortlist/admin routes use, if any exist — confirm during planning)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Existing `secret`-header admin auth (`ADMIN_SECRET` env var) — new Outreach routes reuse this verbatim, no new auth mechanism |
| V3 Session Management | no | No session concept beyond the existing sessionStorage-cached secret; unchanged by this phase |
| V4 Access Control | yes | Same admin-secret gate on every new `/api/admin/outreach*` route; the internal `/api/internal/scan-complete` bearer-token check is unchanged and untouched by the new branch |
| V5 Input Validation | yes | Draft body/subject edits (D-6-13) are free text written by Joshua only (single-tenant, no external input) — still validate non-empty and a sane max length before writing, matching the general "validation errors throw or return error objects" convention already in this codebase |
| V6 Cryptography | no | Nothing new to encrypt/sign — `outreach_messages` holds plaintext draft copy, same posture as every other table in this database |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Prompt injection via scan content (a scanned website's own text/issue titles feeding into the Gemini prompt) | Tampering | Low severity here — the worst outcome is a distorted draft that Joshua reviews and can reject before anything sends (QUE-01/05 human gate already exists as the primary control); no automated action is ever taken on Gemini's raw output without human approval |
| SSRF via the report link or any URL embedded in the draft | Tampering / Information Disclosure | Not a new surface — `DRA-03`'s report link is a same-origin, code-constructed URL (`${BASE_URL}/report/${scanId}`), never user-supplied input; no new fetch of an external URL is introduced by this phase |
| Leaking the Gemini API key via a client-exposed env var | Information Disclosure | Ensure `GEMINI_API_KEY` is set as a server-only env var (no `NEXT_PUBLIC_` prefix), consistent with how `SCANNER_API_KEY`/`RESEND_API_KEY` are already handled |
| A rejected prospect's draft resurrected via re-import or re-scan | Tampering (bypassing an editorial decision) | D-6-15's `lifecycle_state = 'rejected'` gate must be checked by the scan-complete eligibility branch on every future scan-complete for that prospect, not just at reject time — re-verify this gate is read, not just written, during plan review |

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (`[VERIFIED: codebase grep]`): `lib/scoring.ts`, `scanner-service/src/index.ts`, `scanner-service/src/ai.ts`, `app/api/internal/scan-complete/route.ts`, `supabase/migrations/{010,012,013,015,018}*.sql`, `lib/bulk-scan-dispatch.ts`, `lib/scan-queue.ts`, `lib/contact-extraction.ts`, `components/admin/shortlist-table.tsx`, `app/admin/page.tsx`, `lib/email.ts`, `lib/i18n-helpers.ts`, `tsconfig.json` (root + `scanner-service`), `package.json` (root + `scanner-service`), `.env.local`, `app/api/health/route.ts`, `vitest.config.ts`, `vercel.json`, `docs/legal/lia/LIA-v1.md`
- `npm view @google/generative-ai version` — `0.24.1` confirmed against the live registry
- `gsd-tools query package-legitimacy check` — `@google/generative-ai` verdict `OK`

### Secondary (MEDIUM confidence)
- Context7 `/google-gemini/deprecated-generative-ai-js` — `generateContent`'s `RequestOptions.timeout`/`AbortSignal` support (not adopted; codebase convention wins per Anti-Patterns)

### Tertiary (LOW confidence)
- WebSearch: Gemini's lack of a verbatim-number-lock mechanism (general API docs, no code-level test possible against this project's actual Gemini calls in this research pass)
- WebSearch: Vercel serverless invocation continuing past client disconnect — general Lambda/Vercel platform behavior, not confirmed against this specific project's Vercel plan/config; flagged as Assumption A1, recommend a real smoke test

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@google/generative-ai` is already a production dependency in this exact repo, version-verified
- Architecture: HIGH for the hook point, schema, and consolidation shape (all directly read from source); MEDIUM for the Vercel background-execution recommendation (platform behavior asserted, not locally testable)
- Pitfalls: HIGH — all seven are grounded in direct file reads of this codebase, not general industry knowledge

**Research date:** 2026-07-28
**Valid until:** 2026-08-27 (30 days — stable stack, no fast-moving dependencies; re-verify sooner if `@google/generative-ai` majors or Next.js is upgraded past 14.x before this phase executes)
