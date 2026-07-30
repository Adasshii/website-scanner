---
status: testing
phase: 06-draft-generation-approval-queue
source: [06-VERIFICATION.md]
started: 2026-07-30
updated: 2026-07-30
---

## Current Test

number: 2
name: A draft generated from a genuinely crawled scan
expected: |
  Blocked on test 1's gap being closed first (GEMINI_API_KEY added to Vercel, then main
  pushed). Until then no draft can generate in production.
awaiting: gap closure

## Tests

### 1. GEMINI_API_KEY present in Vercel production
expected: |
  Vercel Dashboard -> website-scanner -> Settings -> Environment Variables lists
  GEMINI_API_KEY, scoped to Production and Preview, with no NEXT_PUBLIC_ prefix.

  Why this is a test and not an assumption: the identical "key is set" attestation for local
  dev turned out to be false earlier in this phase. The key existed only in
  scanner-service/.env, which the Next.js runtime never loads, so draft generation had never
  once run end to end. The production claim rests on the same kind of attestation and has not
  been independently checked.

  Stronger check if the app is deployed: open https://scan.adashi.io/api/health and confirm
  the env block reports GEMINI_API_KEY as true. That endpoint reports presence as a boolean
  and never exposes a value.
result: PASSED (2026-07-30, after gap closure)
resolution: |
  https://scan.adashi.io/api/health now returns status "ok" with GEMINI_API_KEY true, on an
  uncached request-time read (x-vercel-cache: MISS). All eight required vars report true.
  Verified by machine check, not attestation — which is the point, since the attestation for
  this variable was wrong three times in this phase (local, then production, then again
  before the redeploy took effect).

  Two fixes were needed beyond adding the variable:
  - Vercel binds env vars to a deployment at build time, so the variable did not reach the
    already-deployed build. A redeploy was required after saving it.
  - /api/health was itself statically prerendered (no dynamic directive, no request arg, no
    dynamic functions), so it reported BUILD-time env and was served from CDN cache with a
    climbing age. Commit e5f47e7 added `export const dynamic = "force-dynamic"` and a
    no-store Cache-Control. Without that fix this endpoint would have kept reporting false
    even once the variable was correct.
prior_failure_detail: |
  Originally FAILED. Confirmed absent from Vercel Production by direct inspection of
  Settings -> Environments -> Production -> Environment Variables. The full list is
  CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, SCANNER_SERVICE_URL, SCANNER_API_KEY,
  RESEND_WEBHOOK_SECRET, RESEND_FROM_EMAIL, RESEND_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, FILLOUT_WEBHOOK_SECRET, ADMIN_EMAIL, ADMIN_SECRET — all
  added Mar 25. No Gemini variable under any name.

  Independently corroborated: https://scan.adashi.io/api/health returns 200 and reports
  only those seven checked vars, with no GEMINI_API_KEY entry at all (production runs a
  build predating commit f393036, which added it to REQUIRED_VARS).

  Severity HIGH, and live now rather than hypothetical. The deployed production commit
  56e06a0 already contains lib/draft-generator.ts, lib/outreach-queue.ts,
  lib/draft-on-scan-complete.ts and components/admin/outreach-row-panel.tsx. So draft
  generation is deployed and silently returning null on every call in production today,
  not merely at risk of doing so on the next release.

### 2. A draft generated from a genuinely crawled scan
expected: |
  Every live generation so far used seeded fixture scans. Run one real prospect through the
  pipeline (scan completes -> draft appears in the Outreach tab) and confirm the draft is
  coherent, cites a figure that matches its report, and reads as something you would send.
result: PASSED (2026-07-30)
detail: |
  First end-to-end execution of DRA-01 against real crawl data in production.
  Prospect: fysiotherapiemeerweg.nl, score 74, locale NL, status DRAFT, generated automatically.

  Subject (model-authored): "Leesbaarheid op je site" — four words, specific to the actual
  finding, informal register, not the worked example's wording.

  Body: opens "Hi,", informal je/jouw throughout, names one real finding (insufficient colour
  contrast between text and background), states the business consequence (harder to read,
  especially for visually impaired visitors or in bright sunlight, so they miss information
  about the practice), cites the required figure verbatim ("7 kritieke problemen", matching
  the evidence pane's "7"), links the report once, closes with a single low-friction CTA and
  no sign-off. Roughly 95 words.

  Report link resolved to https://scan.adashi.io/report/8a1b0c06-... — the first PRODUCTION
  exercise of the NEXT_PUBLIC_SITE_URL fix (commit 813672e). Before that fix this would have
  been a hardcoded host; the link is correct and unmangled, confirming the [RAPPORT] token
  substitution (commit b6c52d0) works against real data.

  Cited figure cross-checked against the live report page, which states "7 need immediate
  attention". Figures match, so DRA-02 holds in production.

  Article 14 notice renders as its own captioned block outside the single textarea
  (DRA-05/D-6-12 satisfied); it is deliberately not inside the editable body.

### 3. Dutch report/draft locale match on a real NL scan
expected: |
  During Task 3 a Dutch draft linked to a report page that rendered in English. This is
  believed to be the seed fixture not setting scan.locale rather than a product defect, but
  it was never confirmed. On a real NL prospect, confirm the linked report renders in Dutch
  so a prospect clicking through from a Dutch email does not land on English.
result: FAILED (2026-07-30) — but see scope note, NOT a Phase 6 defect
detail: |
  Reproduced against the real NL prospect, so this is neither a fixture artifact nor a
  browser-language artifact as previously hoped.

  https://scan.adashi.io/report/8a1b0c06-... serves <html lang="en"> with English body copy
  ("issues found", "need immediate attention", "worth fixing soon", "How you compare").
  Requested three ways to rule out client bias:
    Accept-Language: nl-NL,nl;q=0.9,en;q=0.5  -> lang=en, English copy
    Accept-Language: en-US                    -> lang=en, English copy
    no Accept-Language header                 -> lang=en, English copy
  The page does carry an EN/NL toggle, so Dutch content exists; it is the DEFAULT that
  ignores visitor language.

  Impact: a Dutch prospect reading a Dutch cold email that says "je kunt alle bevindingen
  zelf bekijken" clicks through and lands on English, at exactly the moment the pitch asks
  them to verify its claim. This weakens the proof step that the project's core value rests
  on ("a qualified prospect, a real scan report, and a drafted message he is willing to
  send").
scope_note: |
  This is NOT a Phase 6 requirement. The report page and its locale resolution
  (pickLocalizedScan / ai_content_alt / issues_alt) predate this phase; Phase 6's own
  requirement for the link is DRA-03 (code-constructed from BASE_URL + scan id, never taken
  from scanned content), which passes. Phase 6 did not cause this behaviour, it created the
  first audience that is exposed to it — Dutch cold-email recipients.

  Recommendation: do not block Phase 6 on it. Track as a follow-up to be fixed before any
  real sending, which is Phase 8's territory. Sending Dutch outreach that links to an
  English report is a credibility problem worth closing before the first campaign, not
  before this phase closes.

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0
note: |
  The one issue (test 3, report locale default) is explicitly scoped OUT of Phase 6 — see its
  scope_note. All eleven Phase 6 requirements (DRA-01..06, QUE-01..05) are satisfied.

## Gaps

### GAP-06-01: GEMINI_API_KEY missing from the Vercel production environment
severity: high
status: resolved
resolved: 2026-07-30
resolution_note: |
  Variable added to Vercel Production and picked up by a fresh deployment. Confirmed live via
  an uncached /api/health read reporting GEMINI_API_KEY true and overall status ok. Closing
  this also required fixing the health endpoint itself (commit e5f47e7) — it was statically
  prerendered and reporting build-time env, so it could not have confirmed the fix.
source: UAT test 1
requirement: DRA-01
detail: |
  Draft generation is deployed to production (commit 56e06a0) but GEMINI_API_KEY is not set
  in the Vercel project env, so lib/draft-generator.ts's getClient() returns null and every
  draft resolves to null with no user-visible error. The feature is live and inert.

  This is the second occurrence of the same root cause in this phase. Plan 06-02 was marked
  complete on a human attestation for BOTH runtimes; the local claim was already found false
  during 06-07 verification (the key existed only in scanner-service/.env, which the Next.js
  runtime does not load). The production half of that same attestation is now also confirmed
  false. The lesson is recorded rather than the incident: an env-var prerequisite needs a
  machine check, not an attestation. app/api/health/route.ts now provides that check, but it
  is not yet deployed.
fix: |
  1. Joshua adds GEMINI_API_KEY in Vercel -> website-scanner -> Settings -> Environments ->
     Production, scoped to Production and Preview, server-side, no NEXT_PUBLIC_ prefix.
     Same credential as scanner-service/.env. Claude cannot do this step — entering a
     credential is out of bounds.
  2. Push main (20 commits ahead of origin/main). Vercel is git-connected with Branch
     Tracking on main, so the push itself deploys. This ships the health check, the report
     URL fix, the inline error banner, the in-DOM confirmations and the prompt rewrite.
  3. Re-check https://scan.adashi.io/api/health and confirm GEMINI_API_KEY reports true.
  4. Then run UAT tests 2 and 3, which are blocked until generation works in production.
blocks: [test 2, test 3]
