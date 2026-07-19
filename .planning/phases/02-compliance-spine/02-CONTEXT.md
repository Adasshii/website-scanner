# Phase 2: Compliance Spine - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes "stop" mechanically permanent and makes the legal basis for
contacting anyone recorded and versioned. It delivers, and only delivers:

- A `suppressions` table in Supabase as the single source of truth for who must
  not be contacted (CMP-01), matching on both email address and registrable
  domain (CMP-03), permanent and effective from the next send cycle (CMP-05).
- An idempotent `/unsubscribe` endpoint that writes synchronously before
  returning success (CMP-04).
- Auto-suppression wired to the **existing** Resend event webhook for hard
  bounces and spam complaints (CMP-07), read-only with respect to sending.
- A guard that no code path can re-add a suppressed record without an explicit,
  logged override (CMP-06).
- A versioned Legitimate Interest Assessment artifact in the repo plus a
  per-country legal-basis config table, so Joshua can look up which LIA version
  and which country's regime applies to a prospect (CMP-08, CMP-16).

**Explicitly NOT in this phase** (owned elsewhere, do not build here):
- The send layer and its pre-dispatch suppression check (CMP-02), legal-basis
  stamping on send records (CMP-09–12) — the send phase is gated and later.
- Retention / expiry jobs (CMP-13–15) — separate phase.
- The Article-14-notice send gate (CMP-10) — send phase.
- Any admin UI. Phase 3 owns the admin surface; this phase's operator actions
  are CLI scripts.
- LIA legal *content* — counsel reviews that on a parallel track. This phase
  ships the artifact + versioning *mechanism*, which does not wait for review.

</domain>

<decisions>
## Implementation Decisions

### Unsubscribe experience
- **D-01: Suppress instantly on visit.** Opening the unsubscribe link writes the
  suppression synchronously, then renders a confirmation. Also expose an RFC 8058
  one-click `List-Unsubscribe-Post` POST path for Gmail/Yahoo. Over-suppression
  from mail-scanner prefetch is accepted at this scale (10–50 sends/week); the
  logged override (D-08) undoes a false positive.
- **D-02: Endpoint is idempotent** (CMP-04) — clicking twice succeeds both times,
  the second click is a no-op that still returns success.
- **D-03: Domain-agnostic route.** Build `/unsubscribe` in the existing Next.js
  app with no hardcoded host; the token is self-contained. Which host actually
  appears in outreach emails (main domain vs. an outreach subdomain) is decided
  in the gated send phase — no outreach emails exist yet, so nothing is locked
  early.
- **D-04: Capture nothing beyond the suppression.** No opt-out reason, no extra
  fields. Record is address, domain, source, timestamp only. GDPR minimisation;
  feedback is statistically meaningless at this volume.

### Auto-suppression rules
- **D-05: Both hard bounce and spam complaint suppress domain-wide.** Matches the
  roadmap success criterion verbatim ("blocks that address and every other
  address on the same domain"). One rule, one code path, compliance-safest.
- **D-06: One-time backfill at migration time.** Seed `suppressions` from
  existing `email_events` rows with status `bounced` / `complained`, so anyone
  who already signalled "stop" on the shared Resend account is protected from day
  one. The spine starts complete, not empty.
- **D-07: Suppression is a pure lookup, never a prospect mutation.** The
  `suppressions` table is consulted at the boundaries (the future send check;
  a Phase 3 admin join for a "suppressed" badge). It does NOT flip prospect
  `lifecycle_state`. One source of truth, nothing to keep in sync.

### Override & lookup surface (this phase = CLI, Phase 3 layers UI)
- **D-08: Logged override is a CLI script** (`scripts/suppression-override.ts`),
  same shape as `scripts/import-prospects.ts`: explicit arguments, prints what it
  did, writes the log entry. Satisfies CMP-06 without building throwaway UI ahead
  of Phase 3.
- **D-09: Override *lifts*, never deletes.** The suppression row stays forever
  with `lifted_at` + `lifted_by_reason` (or equivalent); matching ignores lifted
  rows; a later re-suppression adds a new row. Preserves the full audit trail and
  aligns with CMP-15's "suppressions retained indefinitely" posture.
- **D-10: Legal-basis lookup is a CLI script** (`scripts/legal-basis.ts
  <domain-or-email>`): resolves prospect country → legal-regime row → current LIA
  version, and reports suppression status, in one output. Same resolution logic
  becomes an API/UI call in Phase 3 without rework.

### LIA artifact & versioning
- **D-11: Immutable files + a DB registry.** LIA versions live as immutable repo
  files (`docs/legal/lia/LIA-v1.md`, `LIA-v2.md`, …) — a new version is a new
  file, old files are never edited. A small `lia_versions` table (version,
  effective_from, content hash) lets the running app and the lookup script
  resolve "current version" without shelling into git.
- **D-12: One LIA, per-country regimes.** A single versioned LIA covers the
  outreach approach (it is an EU-wide GDPR instrument). The per-country
  differences live in the config table (CMP-16: `country_code`,
  `spam_law_regime`, `notes_url`), which points at the applicable LIA version —
  so a future country *could* reference its own artifact with no schema change.
  Seed the NL row now.

### Claude's Discretion
- **Confirmation page design (D-01 follow-up):** minimal, bilingual page
  ("Je bent uitgeschreven / You've been unsubscribed"), sender name for context,
  no CTA, no resubscribe, no tracking. Language follows the prospect's country
  (NL first, parameterised).
- Token scheme for the unsubscribe link (signed, self-contained), table/column
  names, migration structure, and email-address normalisation for matching are
  Claude's call — as long as D-01…D-12 hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §Compliance — CMP-01, 03, 04, 05, 06, 07, 08, 16
  are in scope; CMP-02, 09–17 are explicitly out (later phases). Read the full
  wording, it is precise.
- `.planning/ROADMAP.md` §"Phase 2: Compliance Spine" — goal, 5 success criteria,
  and the phase notes (co-requisite of the data model, owns its own migrations,
  suppression table is source of truth, Resend Suppressions API is backstop only).

### Legal basis (drives LIA + per-country config)
- `.planning/research/LEGAL.md` — the Telecommunicatiewet art. 11.7 analysis. The
  crux: the B2B exemption does NOT cover scraped generic addresses; provider
  choice does not fix consent. This is the substance the LIA and `legal_regimes`
  config must encode. MEDIUM-confidence legal finding — the LIA content is
  counsel's to finalise; the mechanism is ours.

### Existing integration touched (CMP-07)
- `app/api/webhooks/resend/route.ts` — the live Resend webhook. It already maps
  `email.bounced` / `email.complained` and is Svix-signature-verified. This phase
  adds suppression writes alongside the existing `email_events` update. NOTE: the
  webhook payload carries `data.email_id` (Resend id), NOT the recipient address
  — resolving the address to suppress means reading it back from `email_events`
  (or the send record). The researcher should confirm where the recipient address
  is retrievable.

### Data model / identity (for domain-match semantics)
- `supabase/migrations/010_create_prospects.sql` — `domain` is the normalised
  registrable domain; NULL = no-website prospect. Suppression domain-matching
  (D-05) should use the same registrable-domain normalisation the importer uses.
- `.planning/phases/01-prospect-data-foundation-import/01-CONTEXT.md` — Phase 1
  identity/dedupe decisions (D-01…D-14), especially country-is-frozen-and-legally-
  load-bearing (D-12/D-13), which the per-country legal config depends on.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/api/webhooks/resend/route.ts`: extend in place for CMP-07 — Svix
  verification, event map, and `createServerClient()` are already there.
- `scripts/import-prospects.ts`: the established CLI-script pattern (required
  args, `--dry-run`, prints a summary). D-08 and D-10 scripts follow it.
- `lib/supabase.ts` `createServerClient()`: service-role client used by all
  admin/webhook writes — reuse for suppression writes.
- Supabase migration convention `NNN_name.sql` (next: `014_…`). RLS is enabled
  on existing tables; new tables need the same service-role posture.

### Established Patterns
- Service-role writes for all system/admin operations; anon can only read scans
  by id. `suppressions` is service-role-only.
- Registrable-domain normalisation already exists for prospect identity — the
  suppression domain match must reuse it, not invent a second normaliser.

### Integration Points
- Resend webhook (CMP-07) — the single point where the existing transactional
  integration is touched; read-only w.r.t. sending.
- The future send layer will call the suppression check (CMP-02) — this phase
  provides the table + a query helper it can consume, but does not build the
  send path.

</code_context>

<specifics>
## Specific Ideas

- Confirmation copy example (bilingual): "Je bent uitgeschreven / You've been
  unsubscribed." No further CTA.
- "The spine starts complete, not empty" — the backfill (D-06) is a deliberate
  first-class step, not an afterthought.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Adjacent compliance requirements
(pre-dispatch suppression check CMP-02, send-record legal stamping CMP-09–12,
retention CMP-13–15, Article 14 gate CMP-10) were repeatedly bounded OUT to their
owning phases rather than pulled in here.

</deferred>

---

*Phase: 2-Compliance Spine*
*Context gathered: 2026-07-18*
