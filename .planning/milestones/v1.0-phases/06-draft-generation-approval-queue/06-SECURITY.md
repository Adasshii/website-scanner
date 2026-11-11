---
phase: 06
slug: draft-generation-approval-queue
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-30
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| scanned website content → draft prompt | Business name, domain, issue titles originate from a third party's page and are interpolated into a Gemini prompt | Third-party HTML/text → prompt text |
| model output → outreach_messages row | Anything Gemini returns is a candidate for a message eventually sent to a stranger | Model output → DB row → rendered UI |
| Next.js runtime → Google API | GEMINI_API_KEY leaves the server on every generation call | Server env → outbound HTTPS |
| browser → admin API | The shared x-admin-secret (held in sessionStorage) is the only separation from the public internet | Browser header → route handler |
| admin editorial input → database | Free-text subject/body written straight into a row that will later become an outgoing message | Operator input → DB row |
| editorial reject → compliance suppression | Two adjacent concepts (lifecycle rejection vs. legal suppression) that must never be conflated | Reject action → prospects.lifecycle_state only |
| scanner-service (Railway) → Next.js webhook | Bearer-token authenticated, untrusted network in between | HTTP callback → route handler |
| editorial reject decision → future scans | A rejection must survive every later scan of the same prospect | prospects row state → scan-complete gate read |
| prospects table → admin/shortlist payload | Contact addresses are personal data and should not travel further than needed | DB column → derived boolean only |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-A14 | Repudiation | Article 14 notice | high | mitigate | Code-appended by `appendArticle14Notice` (`lib/draft-prompt.ts:131`), only return path in `generateDraft` (`lib/draft-generator.ts:261`); renders in a read-only block outside the editable textarea (`components/admin/outreach-row-panel.tsx:205-211`), stripped/re-appended around edits | closed |
| T-06-AC | Spoofing / EoP | `/api/admin/outreach` GET/PATCH/POST | high | mitigate | `x-admin-secret` vs `ADMIN_SECRET`, present in all 3 handlers (`app/api/admin/outreach/route.ts:34,72,138`); no new auth mechanism introduced. Residual: shared secret in sessionStorage, vulnerable to admin-page XSS, non-constant-time compare — accepted, pre-existing pattern reused as declared | closed |
| T-06-AUTH | Spoofing | Forged scan-complete callback | medium | mitigate | Existing bearer-token check against `SCANNER_API_KEY` untouched, precedes every branch (`app/api/internal/scan-complete/route.ts:23-26`) | closed |
| T-06-BLAST | Denial of Service | Slow/failing draft breaking public report email | high | mitigate | Prospect branch returns before the email-guard line, wrapped in `.catch()`, `maxDuration=60` (`app/api/internal/scan-complete/route.ts:55-63`) | closed |
| T-06-BULK | Elevation of Privilege | Any view/action exposing more than one draft | high | mitigate | Every function/handler takes exactly one id; `expandedId: string \| null` (`components/admin/outreach-table.tsx:80`); per-row `GenerateDraftButton` (`components/admin/shortlist-table.tsx:222-249`); zero bulk-selection code found | closed |
| T-06-DUP | Tampering | Second draft row for one prospect | medium | mitigate | `generateDraftForProspect` checks for an existing row before inserting (`lib/outreach-queue.ts:364-372`); client hides the action once `has_outreach_draft` is true | closed |
| T-06-KEY | Information Disclosure | GEMINI_API_KEY | high | mitigate | Server-only `process.env.GEMINI_API_KEY` read (`lib/draft-generator.ts:90-96`), lazy client, null on missing, never logged; zero NEXT_PUBLIC_GEMINI references; `/api/health` fixed to `force-dynamic` and no-store, live-confirmed reporting `true` in production (re-verified independently during this audit). **Historical note:** this control was attestation-only for most of the phase and was wrong 3 times (local, prod, cache); now machine-checked | closed |
| T-06-MET | Tampering | Model rounds/paraphrases the cited figure | medium | mitigate | `!raw.includes(metric.displayValue)` guard treats drift as generation failure (`lib/draft-generator.ts:238`), tested | closed |
| T-06-PI | Tampering | Prompt injection from scanned page content | low | accept | Draft body renders only in a `<textarea>`/plain JSX text, never `dangerouslySetInnerHTML` (grep-confirmed zero hits in `components/admin/`); QUE-01 human review gate is the binding control now that generation runs against real crawled sites; verbatim-metric guard is a secondary signal. Disposition remains appropriate for the severity, but is now a live production concern, not theoretical, and the human-read gate is the *only* enforcing control — worth a stronger design (allow-listing model output shape, or explicit injection-pattern detection) if/when Phase 8 raises send volume | closed |
| T-06-PII | Information Disclosure | Contact addresses in admin payload | medium | mitigate | `lib/triage-candidates.ts:100-104` destructures out `contact_email`, returns only derived `has_contact_email` boolean | closed |
| T-06-REJ | Tampering | Rejected prospect re-drafted by a later scan | high | mitigate | App-level gate reads `lifecycle_state` on every scan-complete (`lib/draft-on-scan-complete.ts:100-117`, gates 6+7), `rejectDraft` writes it (`lib/outreach-queue.ts:261-279`), `generateDraftForProspect` checks it (lines 374-376); integration-tested both sides. DB CHECK constraint (`supabase/migrations/010_create_prospects.sql:26`) is defense-in-depth only — its live-production state is human-attested (06-VERIFICATION.md truth #5), not machine-checked; flagged as the same attestation-only pattern that caused T-06-KEY's 3 failures, though not load-bearing here since app-level gates don't depend on it | closed |
| T-06-SC | Tampering | npm install of @google/generative-ai | high | mitigate | Confirmed via `git log -S` that the package was already production in `scanner-service/package.json` pre-phase-6 (commit `063b68a`); phase-6 commit `b996251` is a second install of the identical pinned `0.24.1` into the root manifest, no new/unvetted package | closed |
| T-06-SEND | Repudiation | Draft leaving the queue before send-phase/audit exists | high | mitigate | `approveDraft` writes exactly `status`/`approved_by`/`approved_at` (`lib/outreach-queue.ts:242-249`); zero `sent_at` writes anywhere; zero send affordance in the row panel | closed |
| T-06-SSRF | Tampering / Info Disclosure | URL in the draft/report link | low | mitigate | `buildReportUrl` code-constructs from env + scan id only (`lib/draft-generator.ts:78-84`); `resolveReportLink` sentinel-substitutes the model's `[RAPPORT]` token and strips any other `https?://` URL (`lib/draft-prompt.ts:307-313`); anchor carries `rel="noopener noreferrer"`. Residual: strip regex doesn't catch bare domains/non-http schemes — contained by plain-text-only rendering | closed |
| T-06-SUP | Tampering | Reject mistaken for compliance suppression | medium | mitigate | Zero imports of `lib/suppression` in `lib/outreach-queue.ts` (grep-confirmed, only comment references); `rejectDraft` writes only `lifecycle_state`; UI confirmation copy states explicitly it does not suppress (`outreach-row-panel.tsx:249`) | closed |
| T-06-VAL | Tampering | Draft subject/body free text | medium | mitigate | `applyDraftEdit` trims, rejects empty, enforces `MAX_DRAFT_SUBJECT_LENGTH`/`MAX_DRAFT_BODY_LENGTH` before any write (`lib/outreach-queue.ts:213-223`) | closed |
| T-06-VD | Tampering | Verdict divergence between report and email | medium | mitigate | One `computeVerdict` export (`lib/scoring.ts:72`), imported by scanner-service via `@shared-lib/scoring` (`scanner-service/src/index.ts:21,719`); zero old-threshold remnants | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No standalone accepted risks this phase. Every threat carrying an `accept` disposition at individual-plan level (e.g. T-06-KEY in 06-03/06-05/06-06/06-07/06-08, T-06-SSRF in 06-01/06-02/06-05, T-06-REJ in 06-03/06-04) was a scoped deferral to a specific later plan within this same phase's build sequence, not a permanent risk acceptance — each such deferral was traced to its landing plan and independently re-verified in code during this audit. T-06-PI remains a genuine `accept` at the phase level (severity low, model-output-as-text + human gate), documented above with its residual noted rather than silently closed.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-06-01 | T-06-PI | Draft body renders as inert text (never HTML); QUE-01 human review gate is the binding control against a genuinely untrusted third-party input source (scanned page content); severity low given no automated action is ever taken on model output in this phase | Plan-time (06-01 through 06-08, reaffirmed at 06-secure-phase audit 2026-07-30 against production reality) | 2026-07-30 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-30 | 17 | 17 | 0 | gsd-secure-phase auditor (L1 direct-code verification, ASVS level 1; live production /api/health re-curled independently; full vitest suite re-run, 348/348 green) |

**Note on the attestation-only pattern (flagged per orchestrator instruction):** T-06-KEY's mitigation was a human attestation ("key is set") for the entire phase's construction and was wrong three separate times (local dev, Vercel production, then a stale-cache false negative even after the fix). It is now closed by a genuinely machine-checkable control (`/api/health`, `force-dynamic`, no-store, re-confirmed live during this audit). The same *shape* of risk — a mitigation whose real-world enforcement state rests on a one-time human glance rather than a re-runnable check — also exists for T-06-REJ's database CHECK constraint (its live-in-production presence is attested in 06-VERIFICATION.md, not polled by any health check). This did not flip T-06-REJ to OPEN because the threat's actual behavior is independently enforced by tested application-level gates that don't depend on the DB constraint firing — but the pattern is recorded here so it isn't rediscovered the hard way a second time.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-30
