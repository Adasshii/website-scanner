---
phase: 03
slug: triage-shortlist
status: secured
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-21
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Register origin: `register_authored_at_plan_time: true` — every one of the 6 plans
carried a `<threat_model>` block authored before execution. This audit verifies those
mitigations exist in the shipped implementation; it does not retroactively invent a
register. ASVS L1, block threshold `high`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| triage worker → arbitrary prospect websites | Server-side outbound HTTP to third-party sites Joshua does not control, including redirect hops | Outbound: honest UA + robots.txt check. Inbound: untrusted HTML (regex-scanned only, never parsed/executed) |
| admin browser → admin API routes | Shortlist read + release write from the admin dashboard | `x-admin-secret` header; shortlist rows (business names/domains/scores) |
| app/CLI → Supabase (prospects) | Service-role writes of `triage_score`, `triage_checked_at`, `scan_released_at` | Business prospect records (public business data, no PII beyond public listings) |
| operator → live database | Manual DDL via dashboard SQL Editor (migration 016) | Schema change on the shared production `prospects` table |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-SSRF | Tampering / Info Disclosure | `lib/triage-fetch.ts` redirect loop | high | mitigate | `validateUrlSafe()` re-run on start URL (L189) **and every `Location` hop** (L250) before following; closes the gap `scanner.ts`'s existing loops lack | closed |
| T-03-DoS-body | Denial of Service | `readBodyCapped` | high | mitigate | Hard `MAX_BODY_BYTES` read cap with stream cancellation; `truncated` is a signal, not a crash | closed |
| T-03-DoS-loop | Denial of Service | redirect follow loop | medium | mitigate | `MAX_HOPS` hard cap + per-hop `AbortController` timeout (`HOP_TIMEOUT_MS`) | closed |
| T-03-02 | Denial of Service | `lib/triage-constants.ts` | high | mitigate | All 6 caps (`MAX_BODY_BYTES`, `MAX_HOPS`, `HOP_TIMEOUT_MS`, `BATCH_SIZE`, `BATCH_DELAY_MS`, `RELEASE_CEILING`) single-sourced; consumers import them rather than inlining literals, so caps cannot silently drift | closed |
| T-03-auth | Elevation of Privilege | release route | high | mitigate | Reuses the exact `x-admin-secret` gate from `app/api/admin/stats`; no new/weaker auth surface | closed |
| T-03-auth-ui | Elevation of Privilege | shortlist GET route | high | mitigate | Same `x-admin-secret` gate; UI reuses the existing sessionStorage secret | closed |
| T-03-budget | DoS / budget blowout | `releaseWorstN` + route | high | mitigate | Ceiling enforced as JS `.slice(0, RELEASE_CEILING)`; route passes only the constant, never a request-body value. Integration test proves ≤ ceiling at cutoff=100 (TRI-09 independent of TRI-08) | closed |
| T-03-budget-ui | DoS / budget | `ReleaseButton` | high | mitigate | Button never sends a ceiling; mandatory `window.confirm` shows exact count + ceiling; disabled at zero eligibility | closed |
| T-03-contain | Blast-radius containment | triage script | high | mitigate | Triage touches only `triage_score`/`triage_checked_at`; verified zero imports/calls to scanner-service, Resend, or the public scan path (sole match is a source-citing comment). A triage failure cannot degrade the live public scanner | closed |
| T-03-falsepos | Verification integrity | build/typecheck | high | mitigate | The Plan 06 blocking human gate forced the live column into existence before end-to-end verification, so a green build could not pass the phase without it. Gate executed 2026-07-21 | closed |
| T-03-SC | Tampering (supply chain) | npm installs | high | mitigate | Zero new dependencies this phase — `package.json` diff adds only `test`/`triage` script entries. TRI-01 grep gate additionally proves no browser/DOM/AI import | closed |
| T-03-input | Tampering | release route body `cutoff` | medium | mitigate | `!Number.isFinite(parsed) \|\| parsed < 0 \|\| parsed > 100` → 4xx before any DB call | closed |
| T-03-notnull | Tampering / data integrity | triage + release writes | medium | mitigate | `.update().eq()` / `.update().in()` only — never `.upsert()` (avoids the `country NOT NULL` INSERT-tuple violation, Pitfall 3). `.upsert(` grep returns 0 | closed |
| T-03-blast | Reputational / blast-radius | outbound fetch etiquette | medium | mitigate | Honest identifiable `TRIAGE_USER_AGENT` (no browser spoofing, not the scanner's UA), robots.txt homepage check, `BATCH_SIZE` concurrency cap + `BATCH_DELAY_MS` spacing; runs off the production IP (D-10) | closed |
| T-03-01 | Tampering | migration 016 | medium | mitigate | Additive-only (`add column if not exists`, nullable, no backfill, no drop/alter); reversible; locally applied and verified before the production push | closed |
| T-03-prod-migrate | Tampering / data integrity | live `prospects` table | medium | mitigate | Additive-only + `if not exists`; human reviewed and ran it, then verified column + index with the two provided queries. Applied 2026-07-21 | closed |
| T-03-xss | Information Disclosure | `ShortlistTable` rendering | low | accept | See Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `high` count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-03-01 | T-03-xss | Domain/score values render as React text nodes (auto-escaped); links use `https://{domain}` with a normalised registrable domain; no `dangerouslySetInnerHTML` anywhere. React's default escaping is sufficient at single-tenant, admin-only scale. Severity low — below the `high` block threshold. | Joshua Annan | 2026-07-21 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-21 | 17 | 17 | 0 | /gsd-secure-phase (L1 short-circuit: register authored at plan time, ASVS L1) |

Verification method: mitigations confirmed by direct source inspection of the shipped
implementation (grep + read), cross-checked against `03-VERIFICATION.md`'s independent
9/9 must-have verification. Per the workflow short-circuit rule, `threats_open: 0` +
`register_authored_at_plan_time: true` + `asvs_level == 1` means L1 grep-depth is
sufficient and no deeper auditor pass was required.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
