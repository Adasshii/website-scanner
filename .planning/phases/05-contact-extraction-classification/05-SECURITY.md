---
phase: 05
slug: contact-extraction-classification
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-27
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| extracted string → prospects row | Untrusted third-party website text/emails eventually land in these columns; the schema is the last structural guard on their SHAPE | Third-party text → DB columns |
| prospect website DOM → extractor harvest | Untrusted third-party HTML; harvest bounds count (50) and length (50k) before anything is stored | Third-party HTML → in-memory harvest |
| harvested material → pure parser | Extracted strings are untrusted input to regex/decoding | Harvest → parsed candidates |
| scans.pages (JSONB) → prospects update | Data derived from an untrusted site is persisted | scans row → prospects row |
| re-scan → existing prospect state | A later scan must not erase a human's manual-review contact/classification | New scan → existing prospect row |
| stored contact_email_type → admin UI | Rendered in the admin Shortlist; React auto-escapes | prospects row → admin UI |
| deploy sequence | Applying code that writes new columns before the columns exist in prod would fail writes | migration → deploy ordering |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | contact_email_type column | medium | mitigate | `prospects_contact_email_type_check` CHECK constraint (migration 018), verified present in production via `information_schema.columns` query | closed |
| T-05-02 | Tampering | sole_proprietorship column | low | mitigate | Inline CHECK restricts to yes/no/unknown, NOT NULL default 'unknown', verified in migration 018 | closed |
| T-05-SC | Tampering | npm/pip/cargo installs | low | accept | No package.json changes in any phase 5 commit (`git show --stat` across all `05-*` commits) | closed |
| T-05-03 | Denial of Service | extractor harvest of a hostile page | medium | mitigate | `scanner-service/src/extractor.ts:256-261` — `.slice(0, 50)` on mailtoHrefs/cfemailTokens, `.slice(0, 50_000)` on contactText, verified by direct read | closed |
| T-05-04 | Denial of Service | regex email/obfuscation extraction (ReDoS) | medium | mitigate | All 4 patterns in `lib/contact-extraction.ts` inspected: no nested quantifiers, no overlapping-class backtracking risk; inputs already length-capped upstream (T-05-03) | closed |
| T-05-05 | Tampering | oversized "email-looking" string bloating a prospects row | medium | mitigate | `lib/contact-extraction.ts:235` — `MAX_EMAIL_LEN = 254`, candidates over this length are discarded before selection, verified by direct read | closed |
| T-05-06 | Spoofing | crafted lookalike/third-party email captured as the prospect's own | low | mitigate | `scoreCandidate()` — same-domain candidates score +100 over cross-domain, verified by direct read | closed |
| T-05-07 | Tampering | reconcile overwriting a reviewed contact | high | mitigate | **Escalated during this review** — original mitigation (in-memory snapshot check) was found insufficient by code review (CR-01) and replaced with a DB-level `.is("contact_email", null)` guard on the write itself (commit `caaed28`), independently re-verified against the current `lib/scan-queue.ts`, 242/242 tests passing | closed |
| T-05-08 | Injection | extracted email/text into the DB | medium | mitigate | Only one `.rpc()` call in phase-5-adjacent code (`claim_next_scan_batch`, parameterized object arg, pre-existing from Phase 4); all other writes are parameterized Supabase `.update()`/`.eq()` calls, no string-interpolated SQL found | closed |
| T-05-09 | Repudiation | which scan produced the contact | low | accept | `latest_scan_id` (migration 013, pre-existing) already ties the prospect to its producing scan | closed |
| T-05-10 | Tampering | prod writes to not-yet-existing columns | high | mitigate | Migration 018 applied to production and independently confirmed live (`information_schema.columns`) before either the Railway or Vercel deploy — order followed and verified during this session | closed |
| T-05-11 | Elevation of Privilege | Shortlist data exposure | low | accept | `app/api/admin/shortlist/route.ts` reuses the existing `x-admin-secret` gate, no new unauthenticated endpoint, verified by direct read | closed |
| T-05-12 | Information Disclosure | rendering extracted email in admin | low | accept | Verified `components/admin/shortlist-table.tsx` does not render `contact_email` at all — only a static "NAMED-PERSON" string gated on `contact_email_type`, more conservative than the plan assumed | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-05-01 | T-05-SC | No new dependencies this phase; nothing to audit | Plan-time (05-01-PLAN.md) | 2026-07-24 |
| AR-05-02 | T-05-09 | Provenance already covered by pre-existing `latest_scan_id`; no additional audit trail needed at this scale | Plan-time (05-03-PLAN.md) | 2026-07-25 |
| AR-05-03 | T-05-11 | Reuses the existing admin auth gate; no new attack surface introduced | Plan-time (05-04-PLAN.md) | 2026-07-26 |
| AR-05-04 | T-05-12 | Admin-only surface, React-escaped, and (as verified) the raw email isn't even rendered yet — only a derived boolean pill | Plan-time (05-04-PLAN.md) | 2026-07-26 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-27 | 12 | 12 | 0 | Orchestrator (L1 direct-code verification, ASVS level 1 — no auditor agent spawn needed per short-circuit rule) |

**Note on T-05-07:** this threat's original plan-time mitigation description ("a done prospect with a non-null contact_email is written scan_status-only") was accurate in *intent* but not in *enforcement* — the code review (05-REVIEW.md, CR-01) found the actual guard was a stale in-memory snapshot check, not a DB-level predicate, making it a real (if narrow) race condition. This was fixed in commit `caaed28` before this security audit ran. Documents the value of independently re-verifying against code rather than trusting a plan's mitigation description at face value.

**Known non-blocking risk carried forward (not part of this threat register — tracked in 05-REVIEW.md / 05-UAT.md):** WR-01 (multi-recipient mailto parsed as one string), WR-02 (bare at/dot deobfuscation can manufacture a false email from prose), and WR-03 (mailtoHrefs/cfemailTokens bounded by count but not per-item length) are correctness bugs, not security threats in this register — they don't grant unauthorized access, tamper with data integrity guarantees, or leak information. Accepted as known limitations per the 05-UAT.md decision (2026-07-27); revisit before Phase 6 relies on `contact_email` correctness for drafting/sending outreach.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-27
