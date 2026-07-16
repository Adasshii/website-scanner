> This is research, not legal advice. It was produced by an AI agent reading public sources. Verify with a qualified Dutch lawyer or ACM directly before sending at any volume.

# Legal & Compliance Research: Cold B2B Email Outreach (Netherlands, expanding to EU/UK)

**Project:** Prospect Radar (website-scanner)
**Researched:** 2026-07-17
**Overall confidence:** MEDIUM-HIGH on the core NL statutory question (multiple independent primary/secondary sources converge). MEDIUM on GDPR legitimate-interest application (genuinely contested area, even among Dutch courts and the AP). LOW-MEDIUM on exact current fine ceilings and on non-NL countries (secondary sources only, no statute-level verification for DE/UK/BE).

---

## 1. Bottom Line Up Front

**Conditionally legal, with one hard constraint the current plan does not yet satisfy.**

Unsolicited commercial email to a business in the Netherlands is legal *without prior consent* only if the recipient's electronic contact address was made public **specifically for the purpose of receiving such communications** (Telecommunicatiewet art. 11.7 lid 2 sub a). A generic `info@bedrijf.nl` scraped off a contact page does **not**, on its own, satisfy this — multiple independent legal sources agree that "a for-that-purpose-designated address" excludes a plain general-contact `info@` unless the site itself invites commercial pitches/acquisition at that address. This directly contradicts the PROJECT.md assumption ("prefer `info@` over named-person addresses") as a *legal* safe harbor — `info@` may still be the right *technical/GDPR* choice (it's less likely to be personal data than a named address), but it does not, by itself, clear the Telecommunicatiewet bar for unsolicited email.

In practice this means: **the statutory spam-law exemption for B2B is narrow and probably does not cover this project's default data source (a scraped contact-page email).** The project's actual legal position rests on two separate, partially independent gates:

1. **Telecommunicatiewet 11.7** — an opt-out (not opt-in) regime for B2B *if* the exemption's narrow condition is met; otherwise prior consent is required, full stop, with no other legal basis available under this specific law (GDPR legitimate interest cannot substitute for a Tw consent requirement — they are cumulative, not alternative).
2. **GDPR** — separately governs any personal data touched in the process (a named-person email, any personal data incidentally scraped, and the profile/record built about the prospect), requiring a lawful basis (most plausibly legitimate interest, art. 6(1)(f)) and an Article 14 notice.

Enforcement risk at 10–50 sends/week is low in probability but not zero, and the more important exposure is not an ACM fine — it's (a) the AP acting on an individual complaint, (b) reputational/deliverability damage, and (c) civil injunction risk from a target business's lawyer. Given Adashi is a design agency pitching design credibility, getting caught out on the mechanics of its own outreach is a specific reputational risk worth weighting above the raw fine-probability math.

**Recommendation for engineering:** build the software as if the exemption does *not* reliably apply — i.e., default posture is "we need a defensible legitimate-interest basis under GDPR, a working one-click opt-out, full audit trail, and an Article-14-compliant first email" — and treat any found "acquisitie toegestaan"-style label on a scraped address as a bonus, not the default. This is the only posture that survives the ambiguity documented below without needing a lawyer's sign-off before v1 ships. **Get an actual lawyer to review before scaling past a handful of test sends regardless** — see open questions.

---

## 2. Findings

### 2.1 Telecommunicatiewet art. 11.7 — the statutory text and the B2B published-address question (CRITICAL)

**Statute, verbatim (Dutch), current consolidated version "geldend van 01-07-2026 t/m heden," `wetten.overheid.nl/BWBR0009950`:**

> **Lid 1:** "Het gebruik van automatische oproep- en communicatiesystemen zonder menselijke tussenkomst, faxen en elektronische berichten voor het overbrengen van ongevraagde communicatie voor commerciële, ideële of charitatieve doeleinden aan abonnees of gebruikers is uitsluitend toegestaan, mits de verzender kan aantonen dat de desbetreffende abonnee of gebruiker daarvoor voorafgaand toestemming heeft verleend [...]"
>
> **Lid 2:** "Indien de gebruiker, bedoeld in het eerste lid, een rechtspersoon is dan wel een natuurlijke persoon die handelt in de uitoefening van zijn beroep of bedrijf, geldt met betrekking tot het door middel van elektronische berichten overbrengen van ongevraagde communicatie voor commerciële, ideële of charitatieve doeleinden dat geen voorafgaande toestemming is vereist:
> a. indien de verzender bij het overbrengen van de communicatie gebruik maakt van elektronische contactgegevens die door de gebruiker daarvoor zijn bestemd en bekendgemaakt, en deze zijn gebruikt in overeenstemming met de door de gebruiker aan die contactgegevens verbonden doeleinden, of
> b. indien de gebruiker is gevestigd buiten de Europese Economische Ruimte en voldaan is aan de in het desbetreffende land geldende voorschriften met betrekking tot het verzenden van ongevraagde communicatie."

Source: [wetten.overheid.nl BWBR0009950](https://wetten.overheid.nl/BWBR0009950/2026-07-01/0#Hoofdstuk11_Paragraaf11.1_Artikel11.7); text as reproduced via [omgevingsweb.nl](https://omgevingsweb.nl/wetgeving/telecommunicatiewet/hoofdstuk-11-bescherming-van-persoonsgegevens-en-de-persoonlijke-levenssfeer/%C2%A7-11-1-algemene-bepalingen/artikel-11-7/), cross-checked against a WebSearch summary independently citing the same operative language ("lid 3" in an older numbering — the article was renumbered around the 2021 telemarketing amendment, so lid numbers differ slightly between the pre- and post-2021 consolidated versions; the *substance* is consistent across sources). **Confidence: HIGH on substance, MEDIUM on exact current lid numbering** — the tool could not retrieve one single unbroken official rendering of the full article text due to page-length truncation; two independent partial extractions agree word-for-word on the operative clause, which is the load-bearing evidence.

**What this means for the CRITICAL question — is there an exemption for a published business contact address:**

Yes, but it is **narrow, not general**. The exemption requires the contact detail to be:
1. **Designated by the recipient specifically for that purpose** ("die door de gebruiker daarvoor zijn bestemd" — "for that" refers back to receiving unsolicited commercial/ideological/charitable communication), and
2. **Made public** ("bekendgemaakt"), and
3. **Used in accordance with the purpose the recipient attached to it** ("gebruikt in overeenstemming met de [...] doeleinden").

A general "Contact us" `info@bedrijf.nl` address is, per the independent legal commentary reviewed, **not** "daarvoor bestemd" — it's designated for general contact, not for receiving marketing:

> "Een 'daarvoor bedoeld e-mailadres' is niet info@bedrijf.nl (bedoeld voor het leggen van contact in het algemeen) of inkoop@bedrijf.nl, tenzij erbij vermeld stond dat acquisitie naar dat adres mag worden verstuurd."
> — [ICTRecht, "Bedrijfsgerichte koude acquisitie, mag dat?"](https://www.ictrecht.nl/blog/bedrijfsgerichte-koude-acquisitie-mag-dat)

This is a single secondary source (a reputable Dutch ICT-law firm, but not the statute or ACM itself), so treat the *specific line-drawing* ("info@ never qualifies unless explicitly labeled") as **MEDIUM confidence, not settled case law**. But it is consistent with the plain statutory text: the words "daarvoor... bestemd" (designated *for that*) do real work in the sentence, and a generic contact address is, on its face, designated for general inbound contact, not for soliciting outbound marketing. No source found any ACM or AP guidance, or case law, that reads "any published business email = exempt." **This is the single most important open finding in this research: do not build on the assumption that a scraped `info@` address is legally exempt from the consent requirement.** Flag for lawyer review (see §4).

ACM's own consumer-facing guidance (ConsuWijzer/consument.acm.nl) does **not** mention a published-address exemption at all — its public-facing page focuses on the existing-customer exception and does not distinguish B2B from B2C in its plain-language explanation, which is consistent with "the ban applies to both, with only narrow statutory exceptions" (see §2.1 next paragraph) but is not itself authoritative on the exemption's scope. Source: [consument.acm.nl](https://consument.acm.nl/telecom-post/internet/veilig-op-internet/welke-regels-zijn-er-voor-het-sturen-van-e-mail-spam).

**Confirmation the 2009 B2B extension is real:** Multiple secondary sources (law firm blogs, MKB Servicedesk) independently and consistently state the Dutch spam ban was extended from consumers-only to cover businesses as of October 2009 ("In oktober 2009 zijn de regels voor e-mail aan consumenten en bedrijven gelijk getrokken"). This matches the structure of art. 11.7 lid 2 itself, which explicitly carves out separate treatment for legal persons / persons acting in a professional capacity — that carve-out would be pointless if B2B were unregulated. **Confidence: HIGH** (statutory structure + consistent secondary sourcing, though no single primary legislative-history document was directly read).

### 2.2 Enforcement — ACM, fines, and realism at 10–50/week

**Regulator:** ACM (Autoriteit Consument & Markt), successor to OPTA, supervises Telecommunicatiewet art. 11.7 compliance. Complaints route through spamklacht.nl / acm.nl.

**Fine ceiling:** Under Telecommunicatiewet art. 15.4, the current statutory maximum administrative fine is **€900,000, or if higher, 1% of the offending company's turnover**, doubling to €1.8M / 2% for a repeat violation within 5 years. Sources: [PONT Omgeving art. 15.4](https://omgevingsweb.nl/wetgeving/telecommunicatiewet/hoofdstuk-15-handhaving/%C2%A7-15-2-bestuurlijke-boete-en-last-onder-dwangsom/artikel-15-4/), [wetten.overheid.nl informatie page](https://wetten.overheid.nl/BWBR0009950/2024-01-01/0/Hoofdstuk15/Paragraaf15.2/Artikel15.4/informatie). **Flag:** older ACM decisions and secondary write-ups cite lower figures (€100,000 / €300,000 / €450,000 tiers, tied to an internal ACM severity-tiering policy, "Boetebeleidsregels") — these appear to be ACM's own *policy* sub-ceilings for categorized severity, not the current statutory cap, and may predate a legislative increase. **Confidence on exact current cap: MEDIUM** — the €900k/1%-turnover figure is the most recent and most directly-sourced number found, but this was not verified against the live text of art. 15.4 word-for-word (fetch attempts hit truncation).

**Real cases exist, but they target volume spammers, not small targeted B2B campaigns.** All concrete enforcement actions found (Van Leerdam's/Zmart €5,000×2, Thuiswerkcentrale, All4Call, Abodata VOF + H.P.T. Development €510,000 combined, an €810,000 case reported by De Clercq Advocaten) involve **SMS/telemarketing spam at mass-consumer scale**, generally triggered by thousands of complaints via spamklacht.nl. Sources: [ACM publicaties](https://www.acm.nl/nl/publicaties/publicatie/9519/Boetebesluit-Thuiswerkcentrale-voor-overtreding-spamverbod), [De Clercq](https://www.declercq.com/kennisblog/2154-acm-geeft-signaal-af-810000-boete-voor-overtreding-spamwetgeving/). No case was found of ACM sanctioning a small-scale, individually-approved B2B email campaign of the kind planned here.

**Complaint threshold:** ACM (formerly OPTA) has explicit policy and a court ruling backing it — "OPTA hoeft geen onderzoek te doen op basis van één spamklacht" (OPTA/ACM is not required to investigate based on a single complaint) — confirming ACM prioritizes by complaint volume/severity and does not chase isolated reports. Source: [ACM.nl](https://www.acm.nl/nl/publicaties/publicatie/9739/Rechter-OPTA-hoeft-geen-onderzoek-te-doen-op-basis-van-een-spamklacht). **Practical read: at 10–50 highly-targeted, individually-approved sends per week, ACM enforcement is realistically low-probability** — but "low probability" is not "zero," and a genuinely angry recipient (or a competitor design agency looking to embarrass Adashi) filing a complaint plus forwarding it to a journalist is a distinct, non-statutory risk that doesn't depend on ACM ever acting. **Confidence: MEDIUM-HIGH** that formal ACM enforcement is unlikely at this volume; **LOW** confidence on reputational-risk probability (not researchable — a business judgment, not a legal fact).

### 2.3 GDPR angle

**Is `info@bedrijf.nl` personal data? Is `jan@bedrijf.nl`?**
Per GDPR recital 26 and general EU DPA guidance (consistent across sources, not contested), personal data requires identifiability of a *natural person*. A functional address (`info@`, `sales@`, `contact@`) tied to an organization rather than an identifiable individual is generally **not** personal data. A named-person address (`jan@bedrijf.nl`, `j.devries@bedrijf.nl`) **is** personal data — it identifies (or makes readily identifiable, combined with the domain/company context) a specific natural person. This matches the distinction already locked in PROJECT.md and is not contested in any source reviewed. **Confidence: HIGH.** Edge case not separately verified: a sole proprietorship (eenmanszaak) where the *business itself* is a natural person — `info@jansbakkerij.nl` for a one-person bakery may still be personal data because the "business" and "the individual" are the same legal person under Dutch law. No source directly confirmed this edge case; flag for the software to treat KVK legal form as a signal (see §3).

**Lawful basis — legitimate interest, art. 6(1)(f), and the Legitimate Interest Assessment (LIA):**
This is genuinely contested in NL, not settled:
- GDPR **recital 47** explicitly names direct marketing as a potential legitimate interest example.
- The Dutch AP published a restrictive **"Normuitleg Gerechtvaardigd Belang"** (Nov 2019) stating that acquiring *new* customers does not qualify as legitimate interest — only informing *existing* customers about similar products does — because "acquiring new customers" is (in the AP's reading) not an interest recognized "in legislation or elsewhere in law." Source: [DDMA](https://ddma.nl/kennisbank/autoriteit-persoonsgegevens-publiceert-normuitleg-gerechtvaardigd-belang/), [Ploum](https://ploum.nl/en/news/autoriteit-persoonsgegevens-te-streng-over-gerechtvaardigd-belang-en-marketing).
- This AP position was widely criticized as inconsistent with recital 47 and WP29 Opinion 06/2014, and **the Rechtbank Midden-Nederland annulled an AP fine (the VoetbalTV case, 23 Nov 2020)** on the general point that AP cannot categorically exclude commercial/economic interests from qualifying as "legitimate interest" — "It is contrary to European case law to exclude a specific interest as justified interest on a priori grounds." Source: [DDMA](https://ddma.nl/kennisbank/rechter-vernietigt-ap-boete-gerechtvaardigd-belang-voor-voetbaltv/), [BG.legal](https://bg.legal/rechtbank-geeft-autoriteit-persoonsgegevens-rode-kaart/). This case was about a different context (VoetbalTV selling data to sponsors), not cold email specifically, but its reasoning directly undercuts the AP's narrower marketing-specific position.
- The **EDPB adopted Guidelines 1/2024 on Article 6(1)(f)** (draft published 8 Oct 2024, consultation closed 20 Nov 2024; secondary sources describe the guidelines as subsequently adopted in final form, though this research could not directly confirm the final adoption date from a primary EDPB page — flag as **unverified, needs a direct check of edpb.europa.eu**). These guidelines set a mandatory three-part cumulative test: (1) a lawful, clearly articulated, real/present interest; (2) processing strictly necessary for that interest; (3) the interest does not override the data subject's rights/expectations. Crucially the EDPB explicitly states direct marketing **can** be a legitimate interest but is **not automatically** one — "the fact that direct marketing may be carried out to fulfil a legitimate interest does not mean that direct marketing always constitutes a legitimate interest." Source: [EDPB Guidelines 1/2024 PDF](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf), [Morgan Lewis summary](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2024/10/gdpr-when-can-data-controllers-rely-on-legitimate-interests-for-data-processing-new-guidelines-from-the-edpb).

**Net read:** the AP's own narrowest position (2019 Normuitleg, "new-customer acquisition never qualifies") looks legally shaky post-VoetbalTV and post-EDPB-Guidelines, but **has not been formally withdrawn** as far as this research could establish. A defensible legitimate-interest basis for targeted B2B outreach (narrow targeting, business-relevant purpose, clear opt-out, no sensitive data, low intrusiveness, minimal retention) is plausible under current EU-level guidance, but doing it while ignoring AP's own published Dutch guidance is a real, documented tension — not a hypothetical one. **A written LIA is not optional here; it's the primary defensible artifact if AP or a recipient ever challenges the basis.** A LIA requires, per standard EDPB/ICO methodology (three-part test above): naming the specific interest (new business generation for a design agency), showing necessity (why email, why this data, why not a less intrusive method), and a documented balancing test against the recipient's interests (professional context lowers intrusiveness; specificity/relevance of the pitch to *that* business's actual site raises legitimacy; a working one-click opt-out reduces residual risk; excluding named-individual addresses where a generic one exists reduces the personal-data footprint in the first place).

**Article 14 notification — what the first email must contain:**
Since the prospect's data (email + scan-derived profile) is *not* collected from the data subject directly, GDPR Article 14 applies. The **disproportionate-effort exemption (14(5)(b)) will not save this project** — a real enforcement case is directly on point: Poland's DPA fined a data broker (~€220,000) for invoking "disproportionate effort" to skip notifying millions scraped from a public business registry; the DPA rejected the argument specifically **because the company already held the contact details as part of the scraped data**, making notification feasible. Source: found via WebSearch synthesis, corroborated across multiple GDPR-compliance blog write-ups of the Polish case. This project's exact situation — scraping contact data off a website and then having a functioning channel (email) to that address — is the fact pattern where the exemption is *least* available, not most. **The correct compliance mechanism is therefore to fold the Art. 14(1)-(2) notice into the first outreach email itself**, which Art. 14(3)(b) explicitly permits/requires ("at the latest, at the time of the first communication to that data subject, where the data are to be used for communication with the data subject"). The first email must therefore contain, at minimum:
- Identity and contact details of the controller (Adashi / Joshua Annan, legal entity, address)
- The purpose of processing (evaluating and contacting the business about its website / offering design services)
- The legal basis relied on (legitimate interest) and, if asked, access to the underlying LIA reasoning
- The categories of personal data concerned (contact email; if a named address, name)
- **The source of the data** — must disclose it came from the business's own public website (Art. 14(2)(f))
- Recipients or categories of recipients, if any (e.g., email-delivery subprocessor / Resend)
- Retention period or the criteria used to determine it
- The existence of the right to object (art. 21), access, rectification, erasure, and the right to lodge a complaint with the AP
- **Note:** because this is direct marketing, GDPR gives an **absolute** right to object (art. 21(2)) — once objected, no balancing test applies; processing for marketing purposes must stop.

**Does scanning + scoring a business's website constitute "processing personal data"?**
Split answer. Scanning a business's *technical* attributes (load time, accessibility violations, Core Web Vitals, mobile usability) is not, by itself, processing personal data — these are facts about a website/business, not about an identifiable natural person, **unless** the site is a sole proprietorship where the business and the individual are legally the same (see above), or the scan/screenshot pipeline incidentally captures personal data (staff photos, named bios, a phone number tied to a named person, testimonials with names). Storing the *extracted contact email* is processing personal data whenever that email is a named-person address, and arguably still "relates to" the organization (not personal data) when it's a generic functional address. **Practical implication:** the "profile/score" Prospect Radar builds is mostly not personal data, but the pipeline touches personal data at specific, identifiable points (contact extraction, any named individual appearing in a screenshot or scraped text used in the AI-generated critique), and those points are what GDPR governs — not the whole scan. **Confidence: MEDIUM** — this is a reasonable legal reading consistent with how EU DPAs generally treat B2B website/company data, but no primary AP or EDPB source was found addressing "automated website scoring of businesses" specifically.

### 2.4 Required mechanics (opt-out, sender ID, records, retention)

These are less contested and consistently confirmed across ACM's own consumer guidance and general GDPR practice:

- **Sender identification:** must clearly identify the sending business by real name/email — no disguised or "fantasy" sender identities. Source: [ACM](https://www.acm.nl/nl/verkoop-aan-consumenten/reclame-en-verleiden/spam-voorkomen-uw-reclame).
- **Opt-out:** must be fast and free ("snel" and "gratis"), cannot require payment or extra personal data as a condition of unsubscribing. Same source.
- **Every message needs an opt-out mechanism**, not just the first one, per the general structure of art. 11.7 combined with GDPR art. 21.
- **Geographic scope of the Dutch rule:** ACM's page frames the obligations as applying "bij al uw klanten binnen de EER" — i.e., the *sender's* obligations under Dutch-transposed EU e-privacy rules extend across the EEA when a Dutch-established sender targets recipients there, which matters directly for the planned country expansion (see §5).
- **Record-keeping / proof of legal basis:** not explicit in ACM's consumer-facing text, but flows directly from GDPR's accountability principle (art. 5(2)) — the controller must be able to demonstrate, on request, which legal basis was used and why, per-send. This is a hard software requirement, not optional documentation (see §3).
- **Retention limits:** GDPR storage-limitation principle (art. 5(1)(e)) requires data kept no longer than necessary for the stated purpose. No specific NL statutory retention period was found for cold-outreach data; absence of a fixed number means the project must set and justify its own (e.g., "prospect record + email content retained for N months post-send, or until objection/unsubscribe, whichever is earlier").
- **Right to object:** must be honored immediately and permanently for direct marketing (art. 21(2), absolute right — no balancing test, no "but our interest is stronger" argument once objected).

---

## 3. Required Software Behaviours

Concrete, checkable, engineering-level. These translate the above into what the system must *do*.

**Data classification (at extraction time)**
1. When extracting a contact email from a scanned website, classify it as `generic` (info@, contact@, sales@, hello@, etc. — a fixed/configurable prefix list, extendable per-locale) or `named-person` (anything else, e.g. `firstname.lastname@`, `jdevries@`). Store this classification on the prospect record.
2. If the only email found is a `named-person` address, flag the prospect for manual review before drafting; do not auto-include named-person addresses in the default outreach flow without an explicit human decision to use it (PROJECT.md already sets `info@`-preference; this makes it a checkable classification field, not just a preference).
3. Separately record whether the source page, at the point the address was found, contains language inviting commercial/marketing contact at that address (e.g. "for partnerships/marketing enquiries") — this is the only condition that could trigger the narrow Tw 11.7(2)(a) exemption. Default assumption when absent: **exemption does not apply**; proceed on the legitimate-interest + notice-in-first-email path, not on "no consent needed."
4. If the KVK/company registry legal form (if available) indicates a sole proprietorship (eenmanszaak) or comparable natural-person business form, treat the `info@`-style address as personal data (name-of-business-owner-equivalent) rather than as a safely non-personal generic address.

**Legitimate Interest Assessment (LIA) as a stored artifact, not a one-time doc**
5. Maintain a single versioned LIA document/record (purpose, necessity, balancing test, safeguards) that every send references by version ID. Re-review and re-version whenever targeting criteria, data sources, or retention periods materially change.
6. Every outbound send record stores which LIA version and which legal-basis determination applied to it (`legal_basis`, `lia_version`, `tw_exemption_claimed: boolean`).

**First-email content (Article 14 notice, hard requirement)**
7. The first (and only the first, unless materially changed) email to a given prospect must programmatically include, in the template — not left to manual drafting per-send:
   - Sender's real legal identity and physical/registered business address
   - Stated purpose ("we reviewed your website and are reaching out about potential design work")
   - A short legal-basis line and a link to a static page with the full LIA-derived notice (controller identity, purpose, legal basis, data categories, **source of the data** = "your own public website," recipients/subprocessors, retention period, and rights: object / access / rectify / erase / complain to the AP)
   - The one-click unsubscribe / opt-out mechanism (see below)
8. Enforce at the send layer (not just template convention) that a `first_contact_notice_included: boolean` flag is true before a first-touch send is allowed to leave the review queue as "ready."

**Suppression / opt-out (already scoped in PROJECT.md — make it a hard gate)**
9. Every send checks the Supabase suppression table immediately before dispatch (not at draft time — state can change between draft and send, especially with a human-approval queue that may sit for days).
10. `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058 one-click) on every send, per Resend's documented support — confirmed capability, not a research gap.
11. The unsubscribe endpoint writes to the suppression table synchronously before returning success, and is idempotent (repeated unsubscribe calls are no-ops, not errors).
12. Unsubscribe/object requests are honored **permanently** and **immediately** — no "processing may take up to X days" language, since art. 21(2) is an absolute right for direct marketing. A suppressed contact must be unreachable by the very next send cycle, with no code path that can re-add a suppressed row without an explicit, logged manual override (and even that override should be treated as almost certainly wrong — flag, don't silently allow).
13. Suppression list checks by **email address and by domain** — a business that objects should not be re-contactable at a different address on the same domain without a fresh, separate justification.

**Audit trail (proof of basis)**
14. Every send record persists, immutably: prospect ID, resolved email + classification (`generic`/`named-person`), timestamp, message content actually sent (not just template ID — content can be edited in the approval UI), legal basis + LIA version, `tw_exemption_claimed`, first-contact-notice status, human approver identity, and suppression-check result at send time.
15. This audit trail must be queryable per-prospect on demand — "show me why we were allowed to email this business" is a question the system must answer in seconds, not by reconstructing from logs.

**Retention**
16. A scheduled job enforces a retention ceiling on prospect + scan + outreach data (default proposed: 12 months from last contact or from `no_website`/`disqualified` status, whichever is sooner — this number is a placeholder pending the LIA, not a legal fact this research can set). On expiry, either delete or anonymize (strip contact email, keep aggregate/statistical fields only) — deletion vs. anonymization should be a config choice, not hardcoded.
17. Suppressed/opted-out records are the one exception: they must be **retained indefinitely** (or for a long, deliberately-set period) specifically so the system never re-contacts them — deleting a suppression record to satisfy a generic retention job would recreate the exact problem retention exists to prevent. Flag this explicitly in the retention-job logic with a comment, not just a config default someone could silently change.

**Geography-as-parameter (already a stated constraint — make legal basis parametric too)**
18. Legal-basis rules (which exemptions exist, what the first-email notice must say, what "generic vs named" means locally) must be a per-country config table, not hardcoded NL logic, so expansion doesn't require re-deriving this research inline in code. At minimum: `country_code`, `spam_law_regime` (opt-out-with-narrow-exemption / opt-out-broad-corporate-exemption / opt-in-required), `notes_url` (link to the country-specific legal memo).

**Scan-pipeline data minimization**
19. The scan/screenshot/AI-critique pipeline should not persist personal data beyond what's needed for the pitch itself — e.g., if a screenshot captures staff photos or named bios, that's incidental and should not be separately indexed, profiled, or reused outside the single prospect's record.

---

## 4. Open Questions for a Lawyer

1. **Does a scraped `info@` address with no explicit "send us marketing here" language ever satisfy Tw art. 11.7(2)(a)?** This research found one consistent secondary-source answer ("no, not unless explicitly labeled") but no ACM guidance document or case law directly on point. This is the single highest-value question to resolve, because it determines whether the entire default flow needs consent-first redesign or can proceed on the narrower legitimate-interest + notice path already scoped above.
2. **Is the AP's 2019 "Normuitleg Gerechtvaardigd Belang" still AP's live enforcement position**, given the 2020 VoetbalTV court loss and the 2024 EDPB Guidelines 1/2024? Has the AP published anything superseding or narrowing its own 2019 stance? This research could not confirm either way from primary AP sources (403-blocked on direct fetch).
3. **Exact current statutory fine ceiling** for Tw art. 11.7 violations — this research found conflicting figures (€450k-tiered vs. €900k/1%-turnover) and could not fully reconcile which applies today; a lawyer or a clean read of the current art. 15.4 text should confirm.
4. **The sole-proprietorship edge case** (`info@` at a business that is legally a natural person) — how should the software actually distinguish this reliably (KVK API lookup? heuristics? manual flag?), and does GDPR then apply to the *entire* scan/score, not just the contact email?
5. **Whether EDPB Guidelines 1/2024 have been formally adopted in final form**, and if so, on what date — this research found the draft (Oct 2024, consultation to Nov 2024) and secondary references to adoption but could not directly confirm final-adoption date from a primary EDPB page.
6. **Whether a competitor design agency or an aggrieved recipient filing a complaint with a journalist poses meaningfully different risk than ACM/AP enforcement** — this is a reputational/business-judgment question a lawyer can frame but not fully answer; worth a candid conversation with Joshua directly regardless of legal outcome.

---

## 5. Country Risk Ranking (for expansion beyond NL)

Ranked roughly hostile → permissive for exactly this use case (unsolicited B2B cold email using data sourced from the recipient's own public website, no prior relationship). All secondary-source only for non-NL countries — treat as a starting map for prioritization, not a compliance sign-off.

| Rank | Country | Regime | Why | Confidence |
|---|---|---|---|---|
| 1 (most hostile — avoid or deprioritize) | **Germany** | UWG §7(2) Nr.2 + GDPR, both apply cumulatively | Multiple independent sources agree Germany does **not** carve out B2B — "a cold email to geschaeftsfuehrer@unternehmen.de is just as prohibited as one to a personal email address" without prior consent (soft opt-in only for existing customers re similar products). Two separate legal exposure tracks (UWG civil cease-and-desist actions *and* GDPR) — UWG enforcement in Germany is reportedly driven more by competitor/freelancer cease-and-desist letters than by a regulator, which is a different but real risk shape. Fines cited up to €300k (UWG) and GDPR's standard €20M/4% ceiling (rarely reached in practice for this fact pattern, but the exposure exists on paper). | MEDIUM (consistent secondary sources, no primary UWG text read) |
| 2 | **Belgium** | GBA guidance, mixed | One source states Belgium is "comparatively permissive" for B2B email with clear opt-out; another states the GBA has taken a broad view of "direct marketing" covering professional-capacity communications too, and explicitly warns **you may not simply scrape a business registry (like the CBE) or purchase lists for cold email to personalized addresses** — legitimate interest is "very shaky for data you have not collected yourself." This directly implicates a scraping-based approach. Net: moderate risk, genuinely mixed signal between sources. | LOW-MEDIUM (contradictory secondary sources, no primary GBA guidance read directly) |
| 3 | **Netherlands** | Tw 11.7 + GDPR, narrow exemption | See full findings above — opt-out regime with a genuinely narrow published-address exemption, moderate GDPR ambiguity on legitimate interest for new-customer acquisition, low realistic ACM enforcement probability at this volume, real GDPR/reputational exposure. | MEDIUM-HIGH (most-researched jurisdiction in this report) |
| 4 (most permissive) | **United Kingdom** | PECR reg. 22/23 has an explicit corporate-subscriber carve-out | The PECR direct-marketing-by-email rule **does not apply to "corporate subscribers"** (bodies corporate, LLPs, Scottish partnerships, public bodies) — B2B email to a generic company address does not need prior consent under PECR. Caveats: (a) non-LLP partnerships (English/Welsh/NI) are treated as *individual* subscribers, not corporate, so the carve-out doesn't apply to them; (b) emailing a *named individual* at a company may make that individual the relevant "subscriber," pulling it back toward consent requirements; (c) sender-ID and opt-out rules (reg. 23) still apply regardless; (d) UK GDPR still separately requires a lawful basis for any personal data involved, even where PECR doesn't block the send. Net: the most structurally favorable of the four, but not a blanket green light — same named-vs-generic distinction matters here as in NL. UK is no longer EU/EEA post-Brexit, so this needs UK GDPR (not EU GDPR) as the parallel framework, which is materially similar but not identical. | MEDIUM (ICO source material, consistent across multiple secondary summaries) |

**Rest of EU, general:** most EU member states transpose the same underlying e-Privacy Directive (2002/58/EC) framework as the Netherlands, so a Dutch-style "narrow opt-out exemption + GDPR legitimate-interest layer" is the most likely default pattern to expect, but **local transposition varies significantly** (Germany and Belgium already show real divergence from each other and from NL) — do not assume NL's specific exemption text or the UK's corporate-subscriber carve-out generalizes anywhere else without a country-specific check before expanding there. **Recommendation:** treat every new country as requiring its own short legal memo before the first send, gated the same way NL was gated here — this is exactly what requirement #18 above (`spam_law_regime` as config, not code) is for.

---

## 6. Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Tw art. 11.7 statutory text & structure | HIGH | Two independent extractions agree verbatim on the operative clause; primary source (wetten.overheid.nl) confirmed to exist and be current, though full single-page fetch was blocked by length truncation. |
| "Published `info@` is not automatically exempt" | MEDIUM | Statutory text supports this reading directly; only one secondary legal-commentary source found stating it explicitly; no ACM guidance or case law located that addresses it head-on. **Treat as the top item for lawyer verification.** |
| 2009 B2B extension | HIGH | Statutory structure (art. 11.7 lid 2's business-specific carve-out) plus multiple independent, consistent secondary sources. |
| ACM enforcement realism at low volume | MEDIUM-HIGH | Explicit ACM/court policy confirms single-complaint threshold is not enough; no case found matching this project's fact pattern (small, targeted, individually-approved B2B sends). |
| Fine ceiling (exact current figure) | LOW-MEDIUM | Conflicting figures across sources; not independently verified against live statutory text. |
| GDPR legitimate interest for new-B2B-customer acquisition | MEDIUM | Genuinely contested even within Dutch/EU regulatory practice (AP vs. courts vs. EDPB); this research characterizes the dispute rather than resolves it, because it is not resolved. |
| Article 14 notice mechanics | MEDIUM-HIGH | GDPR text plus a directly-analogous enforcement precedent (Polish DPA case) support the "first email = the notice" mechanism strongly; exact wording requirements not independently drafted/verified by a lawyer. |
| Country risk ranking (DE/BE/UK) | LOW-MEDIUM | Secondary sources only, no statute-level verification for any of the three; Belgium sources were internally inconsistent. |

---

## 7. Sources

**Netherlands — statute and regulator**
- [Telecommunicatiewet BWBR0009950, wetten.overheid.nl](https://wetten.overheid.nl/BWBR0009950/2026-07-01/0#Hoofdstuk11_Paragraaf11.1_Artikel11.7) — art. 11.7, current consolidated text
- [Artikel 11.7, PONT Omgevingsweb (statutory text mirror)](https://omgevingsweb.nl/wetgeving/telecommunicatiewet/hoofdstuk-11-bescherming-van-persoonsgegevens-en-de-persoonlijke-levenssfeer/%C2%A7-11-1-algemene-bepalingen/artikel-11-7/)
- [Artikel 15.4, PONT Omgevingsweb (fine ceiling)](https://omgevingsweb.nl/wetgeving/telecommunicatiewet/hoofdstuk-15-handhaving/%C2%A7-15-2-bestuurlijke-boete-en-last-onder-dwangsom/artikel-15-4/)
- [ACM: Spam voorkomen in uw reclame](https://www.acm.nl/nl/verkoop-aan-consumenten/reclame-en-verleiden/spam-voorkomen-uw-reclame)
- [ACM ConsuWijzer / consument.acm.nl: e-mail spam regels](https://consument.acm.nl/telecom-post/internet/veilig-op-internet/welke-regels-zijn-er-voor-het-sturen-van-e-mail-spam)
- [ACM: Rechter — OPTA hoeft geen onderzoek te doen op basis van één spamklacht](https://www.acm.nl/nl/publicaties/publicatie/9739/Rechter-OPTA-hoeft-geen-onderzoek-te-doen-op-basis-van-een-spamklacht)
- [ACM boetebesluiten (Thuiswerkcentrale, Van Leerdam's/Zmart, All4Call)](https://www.acm.nl/nl/publicaties/publicatie/9519/Boetebesluit-Thuiswerkcentrale-voor-overtreding-spamverbod)
- [De Clercq Advocaten: €810.000 boete overtreding spamwetgeving](https://www.declercq.com/kennisblog/2154-acm-geeft-signaal-af-810000-boete-voor-overtreding-spamwetgeving/)
- [ICTRecht: Bedrijfsgerichte koude acquisitie, mag dat?](https://www.ictrecht.nl/blog/bedrijfsgerichte-koude-acquisitie-mag-dat) — the source for the "info@ does not qualify" reading

**GDPR / legitimate interest / AP**
- [DDMA: AP publiceert Normuitleg Gerechtvaardigd Belang](https://ddma.nl/kennisbank/autoriteit-persoonsgegevens-publiceert-normuitleg-gerechtvaardigd-belang/)
- [Ploum: AP (te?) streng over gerechtvaardigd belang en marketing?](https://ploum.nl/en/news/autoriteit-persoonsgegevens-te-streng-over-gerechtvaardigd-belang-en-marketing)
- [Fruytier / flib.nl: Gerechtvaardigd belang en Direct Marketing — wat vindt de AP?](https://www.flib.nl/nieuws/gerechtvaardigd-belang-en-direct-marketing-wat-vindt-de-ap/)
- [DDMA: Rechter vernietigt AP-boete gerechtvaardigd belang voor VoetbalTV](https://ddma.nl/kennisbank/rechter-vernietigt-ap-boete-gerechtvaardigd-belang-voor-voetbaltv/)
- [BG.legal: Rechtbank geeft Autoriteit Persoonsgegevens rode kaart](https://bg.legal/rechtbank-geeft-autoriteit-persoonsgegevens-rode-kaart/)
- [EDPB Guidelines 1/2024 on legitimate interest (Article 6(1)(f))](https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202401_legitimateinterest_en.pdf)
- [Morgan Lewis: EDPB new guidelines on legitimate interests](https://www.morganlewis.com/blogs/sourcingatmorganlewis/2024/10/gdpr-when-can-data-controllers-rely-on-legitimate-interests-for-data-processing-new-guidelines-from-the-edpb)
- [ICTRecht: Legitimately interesting — de nieuwe richtsnoeren van de EDPB](https://www.ictrecht.nl/blog/legitimately-interesting-de-nieuwe-richtsnoeren-van-de-edpb-over-het-gerechtvaardigd-belang)

**Article 14 / indirect collection**
- General GDPR-compliance secondary sources on the Polish DPA data-broker case rejecting "disproportionate effort" where contact details were already held (found via aggregated WebSearch synthesis; recommend direct verification against the Polish UODO decision or EDPB casebook before citing to a lawyer as primary authority)

**Expansion — UK / Germany / Belgium**
- [ICO: Business-to-business marketing guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/) (via secondary summaries)
- [ICO: How do we comply with PECR electronic mail marketing rules](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/)
- Overloop, WBS Legal, CegTec — secondary summaries of UWG §7(2) Nr.2 and German cold-email practice
- [Timelex: Can I send marketing e-mails without consent to former customers?](https://www.timelex.eu/en/blog/can-i-send-marketing-e-mails-without-consent-opt-former-customers)
- [ICT Legal Guide (Belgium): Business e-mail addresses and GDPR — CBE data for B2B marketing](https://www.ictrechtswijzer.be/en/business-e-mail-addresses-and-gdpr-you-may-use-contact-information-from-the-cbe-for-b2b-marketing/)

**Project context**
- `.planning/PROJECT.md` (this repository) — for the pre-existing locked decisions and constraints this research validates/challenges
