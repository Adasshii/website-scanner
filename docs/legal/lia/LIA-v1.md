# Legitimate Interest Assessment — v1

> **Status: DRAFT — pending counsel review (parallel track).** This version
> ships as a structured skeleton so the compliance mechanism (versioning,
> immutability, per-country resolution) can go live now. The legal
> reasoning below is placeholder prose derived from `.planning/research/LEGAL.md`
> and is not final. A future revision is a new file (`LIA-v2.md`) — this
> file is never edited once committed (D-11).

**Version:** 1
**Effective from:** 2026-07-20
**Covers:** Cold B2B outreach email sent by Prospect Radar (Adashi) to
businesses whose contact details were sourced from their own public
website.
**Scope:** EU-wide GDPR instrument (D-12) — one LIA covers every country
Prospect Radar operates in. Country-specific spam-law regimes (e.g. the
Dutch Telecommunicatiewet) are tracked separately in the `legal_regimes`
config table; this document addresses the GDPR Article 6(1)(f) legitimate
interest basis only.

---

## 1. Purpose Test

**What is the interest, and is it legitimate?**

Adashi's interest is new-business generation: identifying businesses with
underperforming websites and offering paid design/development work to fix
the specific problems found. This is a real, present, and lawful commercial
interest — GDPR recital 47 explicitly names direct marketing as a potential
legitimate interest, and the EDPB's Guidelines 1/2024 confirm marketing
*can* qualify, while stressing it is not automatic.

*(Placeholder — counsel to confirm this framing survives the Dutch AP's
2019 Normuitleg position on new-customer acquisition, in light of the
VoetbalTV court ruling. See LEGAL.md §2.3 and Open Question 2.)*

## 2. Necessity Test

**Is this processing — and this channel — necessary to achieve the interest?**

Email is the least intrusive channel available for this kind of pitch: it
is asynchronous, does not interrupt the recipient's workday the way a
phone call would, and carries an unconditional one-click unsubscribe.
Processing is limited to what the pitch requires: the business's contact
email, its registrable domain, and the specific findings from the website
scan that justify the outreach. No data beyond this is collected or
retained for the purpose of the pitch itself.

*(Placeholder — counsel to confirm no less-intrusive channel achieves the
same purpose, and that the scan-derived data retained is proportionate.)*

## 3. Balancing Test

**Do the recipient's rights and interests override Adashi's interest?**

Factors weighed:

- **Professional context lowers intrusiveness.** The recipient is
  contacted at a business capacity, about a business matter, at an address
  they have made public for their business.
- **Specificity raises legitimacy.** Every outreach is grounded in an
  actual scan of the recipient's own website — this is not a generic list
  blast, it is a targeted pitch referencing that business's real,
  identified problems.
- **Reduced personal-data footprint.** Generic addresses (`info@`,
  `contact@`) are preferred over named-person addresses wherever both
  exist, specifically to keep the processing outside GDPR's personal-data
  scope where possible.
- **A working, unconditional opt-out reduces residual risk.** Every send
  carries a one-click unsubscribe that suppresses the recipient
  permanently, honored immediately with no balancing test applied once
  invoked (GDPR art. 21(2) is an absolute right for direct marketing).
- **Low volume, high targeting.** 10–50 sends/week, each individually
  human-approved before dispatch — this is not automated bulk marketing.
- **Expectation.** A business that has published a contact address on its
  own public website should reasonably expect to be contacted about
  matters relevant to that business, though not without limit — hence the
  narrow targeting and immediate opt-out above.

**Conclusion (placeholder):** on balance, the interest is judged to
outweigh the recipient's rights, provided the safeguards above
(specificity, minimisation, opt-out, notice) are actually implemented in
the send pipeline — not merely asserted here.

*(Placeholder — this is the single most legally contested section per
LEGAL.md §2.3. Counsel review is required before this conclusion is relied
on for volume beyond a handful of test sends.)*

## 4. Article 14 Notice Approach

Because prospect contact data is not collected directly from the data
subject, GDPR Article 14 requires notice at the time of first contact
(art. 14(3)(b)). The "disproportionate effort" exemption does not apply
here — the data is already held, and notice is feasible (see LEGAL.md
§2.3, the Polish DPA precedent). Every first-touch send must therefore
include, in the message itself:

- The controller's identity and contact details (Adashi / Joshua Annan)
- The purpose of processing (evaluating and contacting the business about
  its website)
- The legal basis relied on (legitimate interest) and a link to this LIA
- The categories of data concerned (contact email; name, if a
  named-person address is used)
- The source of the data — the business's own public website
- Recipients or categories of recipients (e.g. the email-delivery
  subprocessor)
- The retention period or the criteria used to determine it
- The right to object, access, rectify, erase, and complain to the
  relevant supervisory authority

Enforcement of this notice at send time (a `first_contact_notice_included`
gate) is scoped to the send phase, not this phase — see
`.planning/phases/02-compliance-spine/02-CONTEXT.md` §Explicitly NOT in
this phase.

## 5. Data Minimisation

Only what the pitch requires is retained: contact email and its
classification (generic vs. named-person), registrable domain, and the
scan findings that justify the specific pitch. Screenshots or scraped text
that incidentally capture other personal data (staff photos, named bios)
are not separately indexed, profiled, or reused beyond the single
prospect's record. Retention limits and expiry are governed by a separate
retention job (CMP-13–15), out of scope for this artifact.

## 6. Country Scope

This LIA is a single, EU-wide GDPR instrument (D-12) — it does not vary by
country. What *does* vary by country is the spam-law regime governing
whether prior consent is required at all before GDPR's legitimate-interest
analysis even becomes relevant (e.g. the Netherlands' Telecommunicatiewet
art. 11.7 opt-out-with-narrow-exemption regime, versus Germany's stricter
UWG regime, versus the UK's broader corporate-subscriber carve-out under
PECR). Those per-country differences are tracked in the `legal_regimes`
config table (`country_code`, `spam_law_regime`, `notes_url`,
`current_lia_version`), which points every country at the LIA version that
applies to it. A future country could reference a different LIA version
with no schema change — this file is not hardcoded to any one country.

---

*This document is registered in the `lia_versions` table by version,
effective date, and a sha256 content hash, so the running application can
verify this on-disk file has not been altered since the version was
recorded.*

---

## Addendum (2026-07-21): CMP-17 No-Profiling Control

Per this document's own immutability note (D-11) and the `lia_versions`
content-hash registration above, the body of this v1 assessment is not
rewritten in place. This addendum records a technical control implemented
after the v1 text was committed, so the compliance claim below points at
checkable behaviour rather than an intention.

**Control:** Incidental personal data captured in design-analysis
screenshots (staff photos, named bios) is never separately indexed,
profiled, or reused — consistent with §5 Data Minimisation above. The
control is a no-profiling instruction in the design-analysis prompt built
by `buildDesignAnalysisPrompt()` (`scanner-service/src/design-prompt.ts`),
which directs the vision model not to describe, name, or identify any
person visible in the screenshot. Nothing person-identifying derived from a
screenshot is persisted. The instruction's presence, wording, and ordering
in the built prompt are asserted by `lib/scanner-design-prompt.test.ts`.

**Face redaction was considered and rejected** as disproportionate cost
against the near-zero-spend constraint this project operates under (D-13)
— an instruction-based control achieves the same data-minimisation outcome
without an added image-processing pipeline or its cost.

**Versioning note:** this addendum is appended text within the same v1
file, not a body rewrite, but it does change the file's bytes and therefore
its sha256. Whether this requires a new `lia_versions` row (a v1.1 hash
update or a new version) is flagged for a decision outside this plan — see
the 04-02 plan SUMMARY. No `lia_versions` row was inserted or modified by
this change.
