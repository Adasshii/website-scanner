---
phase: 1
slug: prospect-data-foundation-import
status: secured
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-18
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Live production DB | `supabase db push` / dashboard DDL against the Supabase instance serving the earning public scanner | Schema DDL (additive-only this phase) |
| Third-party packages | npm installs entering the build (`@duckdb/node-api`, `tldts`) | Executable code, native binaries |
| Untrusted Overture data | Third-party dataset rows (names, URLs, categories) ingested into the DB | Untrusted strings → parameterized writes |
| Outbound fetch (SSRF) | Dry-run reachability check fetching Overture-sourced URLs | Untrusted URLs → network requests |
| Service-role credential | `SUPABASE_SERVICE_ROLE_KEY` used by the CLI script outside the request path | Full-DB-access credential |
| Future PII columns | `prospects.contact_email` / `contact_email_type` (created empty this phase) | PII (populated in a later phase) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | EoP / Tampering | `supabase db push` against live prod | high | mitigate | Blocking-human gate executed 2026-07-18: additive-only precondition stated, human ran the SQL via dashboard editor and verified all-zeros | closed |
| T-01-02 | Information Disclosure | `prospects.contact_email` / `contact_email_type` | medium | mitigate | Columns nullable and empty this phase; RLS enabled on `prospects` (010); service-role-only access; no public route added | closed |
| T-01-03 | Repudiation | Migration provenance | low | accept | Versioned migration files in git; standard convention at this scale | closed |
| T-01-SC (01-02) | Tampering | npm installs of `@duckdb/node-api`, `tldts` | high | mitigate | Blocking-human legitimacy checkpoint executed 2026-07-18: official org repos + download counts verified; exact approved versions installed | closed |
| T-01-02b | Tampering | `@duckdb/node-api` native-binary postinstall | medium | mitigate | Same checkpoint confirmed no postinstall beyond DuckDB's normal native-binary fetch | closed |
| T-01-04 | Tampering | Malformed Overture fields reaching upsert | medium | mitigate | Parameterized Supabase client (no string-built SQL); `OverturePlaceRow` typing; `normalizeDomain` returns null on garbage; per-row failures surface for log-and-skip | closed |
| T-01-05 | Tampering (Integrity) | Re-import overwriting work columns | high | mitigate | Freeze-by-omission verified by source inspection (work columns only in INSERT branch, never UPDATE) + integration suite asserting each freeze truth (45/45 green) | closed |
| T-01-06b | Spoofing | GERS-ID churn producing duplicate prospect | low | accept | Domain-collapse branch is the safety net; a reassigned GERS ID still collapses via domain (RESEARCH Pitfall 4) | closed |
| T-01-06 | Tampering / SSRF | Dry-run reachability fetch of Overture URLs | high | mitigate | Exactly one `fetch(` in `scripts/import-prospects.ts`, gated behind `validateUrlSafe()` (DNS + private-IP/metadata block); private-IP fixture test; `blocked` rows reported, never fetched | closed |
| T-01-07 | DoS (self-inflicted) | One malformed row aborting the batch | medium | mitigate | Per-row try/catch logging gersId + error and continuing (`scripts/import-prospects.ts:254-260`, comment references this threat ID) | closed |
| T-01-08 | EoP | `SUPABASE_SERVICE_ROLE_KEY` exposure via script/logs | high | mitigate | dotenv pattern via existing `lib/supabase.ts` client; grep-verified key never appears in any console output; `.env` / `.env*.local` gitignored | closed |
| T-01-09 | Tampering (data quality) | Untrusted Overture rows imported at scale | high | mitigate | D-11 blocking-human sample audit executed 2026-07-18 (approved after province-boundary + aggregator-denylist fixes); `--dry-run` write-free; runtime category detection | closed |
| T-01-SC (01-04) | Tampering | Packages already installed by 01-02 | high | transfer | Legitimacy verified at install time in 01-02's blocking-human checkpoint; no new install in 01-04 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-01-03 | Migration provenance covered by git-versioned files; no extra audit control warranted at single-tenant scale | Joshua (via plan approval, planning 2026-07-17) | 2026-07-18 |
| AR-02 | T-01-06b | GERS-ID churn duplicate risk backstopped by domain-collapse; rare per Overture stability docs, immaterial at 10–50/week | Joshua (via plan approval, planning 2026-07-17) | 2026-07-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-18 | 13 | 13 | 0 | secure-phase L1 (orchestrator grep-depth; short-circuit — register authored at plan time, all gates executed in-session) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
