# Phase 5: Contact Extraction & Classification - Research

**Researched:** 2026-07-24
**Domain:** Server-side DOM extraction (Playwright/Node), regex-based email/PII pattern matching, NL business-form heuristics, Postgres/Supabase idempotent migrations
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by ROADMAP (do not re-litigate):**
- **D-5-R1: No second fetch.** The extractor runs inside the existing scan; re-fetching the site for contacts is an explicit anti-pattern.
- **D-5-R2: Legal posture is legitimate interest + Article 14 notice.** Preferring `info@` is a GDPR-minimisation choice, NOT a Telecommunicatiewet safe harbour. CON-06 defaults to "no" and the pipeline proceeds on LI+notice regardless.

**Locked by Joshua (2026-07-24):**
- **D-5-01: CON-07 eenmanszaak detection uses on-page signals only.** Detect from what the scan already sees ("eenmanszaak" mentions, KVK/BTW-id patterns on the page). Imperfect by design: uncertain cases are stored as unknown and treated cautiously (as if personal data). No KVK API, no new external dependency.
- **D-5-02: CON-05 named-person-only review happens in the existing Shortlist.** A pill/filter on the current admin Shortlist tab, following the CRITICAL/UNREACHABLE pill pattern from Phase 4.1. No separate review queue or new admin surface.

### Claude's Discretion
- Extraction implementation details (mailto parsing, body-text regex, Cloudflare `data-cfemail` decoding) and where in the scan lifecycle contact data is persisted, provided no second fetch.
- Schema shape for the new contact fields (new columns on prospects vs a contacts table), shipped as an idempotent migration applied by Joshua via the dashboard SQL Editor.
- Exact on-page signal set and confidence handling for D-5-01.
- Test approach per project conventions (vitest + local Supabase pinned to 127.0.0.1).

### Deferred Ideas (OUT OF SCOPE)
- KVK API lookup for authoritative legal-form data — explicitly rejected 2026-07-24 (new external dependency).
- Separate review-queue admin surface — rejected in favor of Shortlist flag.
- Any outreach/drafting behavior — Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CON-01 | Contact email extracted during the existing scan, no second crawl | `reconcileInFlightScans()` already reads a completed scan's `pages` JSONB from the DB — see Architecture Patterns; zero new fetches |
| CON-02 | `mailto:`, body-text, and Cloudflare `data-cfemail` addresses all found | See Code Examples — three extraction techniques, all inside the existing `page.evaluate()` in `extractor.ts` |
| CON-03 | Every address classified `generic` or `named-person`, stored on the prospect | See Common Pitfalls + classification algorithm; existing `contact_email_type` column is the target |
| CON-04 | Generic preferred over named-person when both exist | See aggregation/selection algorithm in Architecture Patterns |
| CON-05 | Named-person-only prospect flagged for manual review, stays out of default outreach | See D-5-02 — Shortlist pill, mirrors CRITICAL/UNREACHABLE pattern in `shortlist-table.tsx` |
| CON-06 | Records whether the source page invited commercial contact, defaults "no" | See Pitfall/keyword-match section — low-investment keyword match, D-5-R2 makes this non-blocking |
| CON-07 | Sole-proprietorship (eenmanszaak) generic address treated as personal data | See D-5-01 three-state signal design in Architecture Patterns |
</phase_requirements>

## Summary

Phase 5 is almost entirely new logic layered onto infrastructure that already exists and is already reserved for it. `prospects.contact_email` and `prospects.contact_email_type` were created in migration 010 (2026, Phase 1) and are explicitly documented in `lib/prospect-upsert.ts` as "NEVER written by any branch here except the brand-new INSERT" — i.e. this phase is their first real writer. The scan lifecycle already has the exact hook this phase needs without a second fetch: `lib/scan-queue.ts`'s `reconcileInFlightScans()` reads a completed scan's `pages` JSONB column (the full `PageResult[]`, including every page's `PageData`) when it flips a prospect to `scan_status: 'done'`. Extending that one read and that one `.update()` call is the entire integration point — no new webhook, no new cron, no service-to-service call.

The extraction work itself is three small, independent DOM techniques added to `extractPageData()` in `scanner-service/src/extractor.ts`, all attribute/element-based (not dependent on CSS visibility) except the plain body-text regex pass, which reuses the `innerText` variable the file already computes for `hasContactInfo`. Classification (generic vs named-person) is best implemented as a negative-space rule — anything not matching a curated generic-local-part list is named-person — rather than attempting to positively parse Dutch name structures (double surnames, initials), which is fragile and unnecessary for a binary classification. The eenmanszaak signal should stay literal-string-only per D-5-01: three states (yes/no/unknown) driven by "eenmanszaak" / company-form-suffix string matches, explicitly not combining KVK-number-only or BTW-id-only signals into an inference (both appear on BV sites too, so neither alone means sole proprietorship).

**Primary recommendation:** Extend `PageData` with a `contactCandidates` array (raw, per-page, untagged as to winner) captured inside the existing `page.evaluate()`; aggregate + classify + apply the eenmanszaak/commercial-invite heuristics in a new pure module `lib/contact-extraction.ts`; wire that module into `reconcileInFlightScans()`'s existing done-transition update; add two new prospect columns (`commercial_contact_invited`, `sole_proprietorship`) plus a check constraint on the pre-existing `contact_email_type` column via one idempotent migration (018). No new npm packages.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw contact candidate capture (mailto, body-text, cfemail) | Browser DOM extraction (inside Playwright's `page.evaluate`) | — | Must ride the existing page load; DOM APIs only exist in that browser context (D-5-R1) |
| Cross-page aggregation, generic/named-person classification, eenmanszaak/commercial-invite heuristics | API/Backend (Next.js `lib/` tier) | — | Pure business logic over already-fetched data (`scans.pages` JSONB); needs no browser, must be unit-testable per project vitest convention |
| Persisting the winning contact + classification onto `prospects` | API/Backend (`lib/scan-queue.ts`) | Database (Postgres via Supabase) | Mirrors the existing pattern — `reconcileInFlightScans()` is the only place scan completion becomes prospect state |
| CON-05 manual-review surfacing | Frontend Server (Next.js Admin, SSR) | — | Existing Shortlist page (`components/admin/shortlist-table.tsx`) already renders pills from server-fetched rows |
| Schema (new columns, constraints) | Database (Supabase Postgres) | — | Idempotent DDL applied by Joshua via dashboard SQL Editor (project convention, never `supabase db push`) |

## Standard Stack

### Core

No new libraries. Every technique below is regex/string logic or DOM API calls already available inside the existing Playwright page context or Node runtime.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tldts` | 7.4.9 (already installed, `lib/domain-normalize.ts`) | Registrable-domain extraction, used to compare an extracted email's domain against the prospect's own website domain | Already the project's sole domain-parsing dependency (`normalizeDomain()`); reusing it avoids a second domain parser with different edge-case behavior [VERIFIED: package.json] |
| `playwright` | 1.58.2 (already installed) | Runs `page.evaluate()` where all DOM extraction (mailto, cfemail, body text) executes | Already the extraction engine for the whole scanner; no substitute needed [VERIFIED: package.json] |

### Supporting

None needed. Cloudflare cfemail decoding is a 6-line XOR loop (see Code Examples) — small enough that adding a package (e.g. `cf-email-decode` on npm) for it would be the exact over-engineering the project's ponytail convention flags on sight for a problem this size.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled generic-local-part word list | An NLP/name-entity library to detect "is this a person's name" | Massive overkill for 10-50 prospects/week; negative-space classification (not-generic ⇒ named-person) is simpler, more auditable, and matches the existing codebase's plain-regex conventions (`extractor.ts`'s own `emailPattern`/`phonePattern`) |
| npm package for cfemail decode | Inline 6-line XOR function | No dependency, no version to track, trivially auditable |
| KVK API for eenmanszaak ground truth | On-page string signals only | Explicitly rejected by Joshua (D-5-01) — new external dependency, against milestone's no-new-infrastructure constraint |

**Installation:** None required — no `npm install` for this phase.

## Package Legitimacy Audit

No external packages are introduced by this phase. `tldts` and `playwright` are pre-existing dependencies already vetted and in production use elsewhere in the codebase; no new legitimacy check is required for them.

**Packages removed due to [SLOP] verdict:** none — none proposed.
**Packages flagged as suspicious [SUS]:** none — none proposed.

## Architecture Patterns

### System Architecture Diagram

```text
                    ┌─────────────────────────────────────────────┐
                    │  scanner-service (Railway) — existing scan   │
                    │                                               │
  Playwright page   │  extractPageData(page, url)                  │
  already loaded  ─▶│    ├─ existing extraction (title, links, ...) │
  (D-5-R1: same     │    └─ NEW: contactCandidates[] capture        │
  page.evaluate)    │         ├─ mailto: hrefs (attribute scan)     │
                    │         ├─ data-cfemail (attribute + XOR)     │
                    │         ├─ body-text regex (innerText)        │
                    │         └─ obfuscated "[at]/[dot]" patterns   │
                    │                                               │
                    │  scanner-service writes scans.pages (JSONB)   │
                    │  — UNCHANGED write path, just richer PageData │
                    └───────────────────┬───────────────────────────┘
                                        │ (existing: scan status polling,
                                        │  no new callback)
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │  Next.js app (Vercel) — daily drain cron      │
                    │  app/api/cron/drain-scan-queue/route.ts       │
                    │                                               │
                    │  reconcileInFlightScans(sb)  [lib/scan-queue] │
                    │    ├─ reads scans.status + NEW: scans.pages   │
                    │    ├─ calls NEW lib/contact-extraction.ts:    │
                    │    │    aggregateContacts(pages) →            │
                    │    │      { contactEmail, contactEmailType,   │
                    │    │        commercialContactInvited,         │
                    │    │        soleProprietorship }              │
                    │    └─ ONE update: prospects SET scan_status=  │
                    │         'done', contact_email=..., ...        │
                    └───────────────────┬───────────────────────────┘
                                        │
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │  Admin Shortlist (SSR)                        │
                    │  getShortlist() adds contact_email_type       │
                    │  shortlist-table.tsx renders NAMED-PERSON pill│
                    │  (D-5-02, mirrors CRITICAL/UNREACHABLE)       │
                    └─────────────────────────────────────────────┘
```

A reader can trace the primary path left-to-right: the page is loaded once (already happening for every other extraction), raw candidates ride along in the existing `scans.pages` JSONB write, the already-scheduled daily cron reads that same column once more to derive one winning, classified contact per prospect, and the admin UI surfaces the one case (named-person-only) that needs a human.

### Recommended Project Structure

```
scanner-service/src/
├── extractor.ts          # MODIFIED — add contactCandidates[] capture to PageData
types/
├── scanner.ts            # MODIFIED — add ContactCandidate type, extend PageData
lib/
├── contact-extraction.ts # NEW — pure aggregation + classification (no I/O, fully unit-testable)
├── scan-queue.ts         # MODIFIED — reconcileInFlightScans() selects `pages`, calls
│                         #   contact-extraction, extends the done-transition update
├── triage-candidates.ts  # MODIFIED — getShortlist() selects contact_email_type
components/admin/
├── shortlist-table.tsx   # MODIFIED — NAMED-PERSON pill (D-5-02)
supabase/migrations/
├── 018_add_contact_classification.sql  # NEW — idempotent, dashboard-applied
```

### Pattern 1: Raw candidate capture inside the existing `page.evaluate()`

**What:** Three DOM-level extraction techniques added as one additional block inside the same `page.evaluate()` call `extractPageData()` already runs — not a second call, not a second navigation.
**When to use:** Every page the scan already visits (home + up to 9 more via `discoverPages()` for full scans).
**Example:**
```typescript
// Source: pattern derived from scanner-service/src/extractor.ts's existing
// bodyText/visibleText computation (line 94, 241) — same page.evaluate scope.

// 1. mailto: hrefs — attribute-based, unaffected by CSS visibility/cookiewalls
const mailtoEmails = Array.from(doc.querySelectorAll('a[href^="mailto:"]'))
  .map((a) => {
    const href = (a as HTMLAnchorElement).getAttribute("href") || "";
    const withoutScheme = href.replace(/^mailto:/i, "");
    const withoutQuery = withoutScheme.split("?")[0];
    try {
      return decodeURIComponent(withoutQuery).trim().toLowerCase();
    } catch {
      return withoutQuery.trim().toLowerCase();
    }
  })
  .filter((e) => /.+@.+\..+/.test(e));

// 2. Cloudflare data-cfemail — attribute-based, XOR-decoded inline (no library)
function decodeCfEmail(encoded: string): string {
  const key = parseInt(encoded.substring(0, 2), 16);
  let out = "";
  for (let i = 2; i < encoded.length; i += 2) {
    out += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key);
  }
  return out;
}
const cfEmails = Array.from(doc.querySelectorAll("[data-cfemail]"))
  .map((el) => {
    const encoded = el.getAttribute("data-cfemail") || "";
    try {
      return decodeCfEmail(encoded).trim().toLowerCase();
    } catch {
      return "";
    }
  })
  .filter((e) => /.+@.+\..+/.test(e));

// 3. Body-text regex + obfuscated variants — reuses the SAME innerText the
// file already computes (visibleText), so cookiewalls/hidden-until-consent
// content that already defeats hasContactInfo also defeats this — documented
// limitation, not a new gap.
const deobfuscated = visibleText
  .replace(/\s*\[at\]\s*|\s*\(at\)\s*|\s+at\s+/gi, "@")
  .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*|\s+dot\s+/gi, ".");
const bodyEmailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const bodyTextEmails = [
  ...(visibleText.match(bodyEmailPattern) || []),
  ...(deobfuscated.match(bodyEmailPattern) || []),
].map((e) => e.toLowerCase());
```

### Pattern 2: Aggregation + classification as a pure, injectable function

**What:** `lib/contact-extraction.ts` exports `aggregateContacts(pages: PageResult[], siteDomain: string | null): ContactResult` — no Supabase client, no I/O, mirrors the testability pattern already used by `lib/bulk-scan-dispatch.ts` and `scripts/legal-basis.ts` (deps object / pure functions injectable for tests).
**When to use:** Called once, from `reconcileInFlightScans()`, right before the `scan_status: 'done'` update.
**Example:**
```typescript
// Source: pattern mirrors scripts/legal-basis.ts's pure-function/deps-object
// style and lib/domain-normalize.ts's normalizeDomain() reuse.

const GENERIC_LOCALS = new Set([
  "info", "contact", "contactus", "hello", "hallo", "welkom", "mail",
  "admin", "administratie", "kantoor", "receptie", "secretariaat",
  "verkoop", "sales", "support", "klantenservice", "service", "help",
  "vragen", "afspraak", "afspraken", "aanmelden", "inschrijven",
  "boekingen", "reserveren", "reservations", "bookings", "praktijk",
  "office", "team", "general", "algemeen", "privacy", "marketing",
]);
// Excluded entirely — never a business contact address, regardless of match:
const EXCLUDED_LOCALS = new Set(["noreply", "no-reply", "postmaster", "webmaster", "mailer-daemon"]);

export type ContactEmailType = "generic" | "named-person";

export function classifyLocalPart(localPart: string): ContactEmailType {
  const normalized = localPart.toLowerCase().split("+")[0]; // strip +tag
  // Negative-space rule: NOT positively parsing "firstname.lastname" (fragile
  // for NL double surnames like "van der berg") — anything not on the
  // curated generic list is treated as identifying a person.
  if (GENERIC_LOCALS.has(normalized)) return "generic";
  if ([...GENERIC_LOCALS].some((g) => normalized.startsWith(`${g}-`) || normalized.startsWith(`${g}.`))) {
    return "generic"; // e.g. "info-verkoop", "contact.nl"
  }
  return "named-person";
}
```

### Pattern 3: Priority-ordered selection across pages (CON-04)

**What:** When multiple candidates exist, prefer (1) same-registrable-domain over cross-domain, (2) generic over named-person, (3) contact/kontakt-page origin over other pages, (4) `mailto:`/`cfemail` sources over bare body-text matches (structural markup is a stronger signal than a text pattern that could be a customer's email quoted in a testimonial).
**When to use:** Inside `aggregateContacts()`, after classification.
**Example:**
```typescript
// Reuses discovery.ts's own contact-page detection vocabulary (no second
// regex invented) — see scanner-service/src/discovery.ts pagePriority().
const CONTACT_PAGE_PATTERN = /\/(contact|kontakt|contacto|reach|get-in-touch)/i;

function scoreCandidate(c: ContactCandidate, pageUrl: string, siteDomain: string | null): number {
  let score = 0;
  const emailDomain = normalizeDomain(c.email.split("@")[1] ?? "");
  if (siteDomain && emailDomain === siteDomain) score += 100; // same-domain
  if (classifyLocalPart(c.email.split("@")[0]) === "generic") score += 50; // CON-04
  if (CONTACT_PAGE_PATTERN.test(new URL(pageUrl).pathname)) score += 20;
  if (c.source === "mailto" || c.source === "cfemail") score += 10;
  return score;
}
// Winning candidate = highest score; ties broken by first-seen (home page
// crawled first per discoverPages()'s [startUrl, ...sorted candidates]).
```

### Anti-Patterns to Avoid
- **Re-fetching the site to check for a contact page more thoroughly:** explicit anti-pattern per D-5-R1/ARCHITECTURE.md. Whatever the existing full-scan crawl already visited (up to 10 pages via `discoverPages()`) is the entire universe of evidence.
- **Positively parsing Dutch name structures to detect "named-person":** fragile (double surnames, particles like "van der", initials) and unnecessary — negative-space classification against a curated generic list is simpler and equally correct for a binary decision.
- **Combining KVK-number-only or BTW-id-only presence into an eenmanszaak inference:** both numbers appear on BV/NV sites too; treat them only as supporting context, never as the deciding signal (D-5-01's "imperfect by design").
- **A new contacts table for a single chosen contact per prospect:** over-normalized for CON-04's "where both exist the generic one is chosen" — the milestone stores one winning contact, not a full contact list; the pre-existing two columns are exactly sized for that.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Registrable-domain comparison (email domain vs. site domain) | A second regex-based domain parser | `normalizeDomain()` from `lib/domain-normalize.ts` (wraps `tldts`, already installed) | Already handles public-suffix edge cases the codebase has already hit (aggregator domains, multi-part TLDs); a second parser risks disagreeing with the one the rest of the app trusts |
| Cloudflare email deobfuscation | An npm package (`cf-email-decode` et al.) | Inline 6-line XOR function (Pattern 1 above) | The whole algorithm is a documented, publicly reverse-engineered XOR-with-embedded-key scheme; a dependency for 6 lines of pure arithmetic is the over-engineering ponytail exists to flag |
| Email syntax validation | A validator library (e.g. `validator.js`, `email-validator`) | The same lightweight regex `extractor.ts` already uses for `hasContactInfo` (`/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i`) | This phase only needs "looks like an email, worth storing" — full RFC 5322 validation is out of scope and the project has zero precedent for a validation library |

**Key insight:** Every piece of this phase is either (a) already-installed tooling (`tldts`), (b) an already-computed variable in the file being extended (`visibleText`/`bodyText`), or (c) a small, auditable, well-documented algorithm (cfemail XOR). There is no genuinely novel technical problem here — the work is connecting existing signals to the two already-reserved prospect columns.

## Common Pitfalls

### Pitfall 1: Image filename / asset-URL false positives (`@2x`, `@3x`)
**What goes wrong:** A naive regex scan of raw HTML (`outerHTML`) would match strings like `logo@2x.png` as a candidate email (`logo` + `@` + `2x.png`, and `png` satisfies the 2+ letter TLD check).
**Why it happens:** `@2x`/`@3x` retina-asset naming conventions look structurally identical to `local@domain.tld`.
**How to avoid:** Scan only `document.body.innerText` (rendered visible text) for the body-text/obfuscated pass — image `src`/`srcset` attributes never appear in `innerText`. This mirrors the existing `hasContactInfo` computation in `extractor.ts`, which already made this same choice.
**Warning signs:** A candidate email whose domain ends in `.png`, `.jpg`, `.svg`, `.webp`, or `.css`/`.js` — an easy denylist filter as a second line of defense even though `innerText` scoping should prevent it entirely.

### Pitfall 2: Third-party / placeholder emails that aren't the business's own
**What goes wrong:** Web-builder footer credits ("Site by webagency@example.nl"), cookie-consent vendor boilerplate, or demo/placeholder content from page builders (Wix, WordPress themes) get captured as if they were the prospect's contact.
**Why it happens:** These addresses are structurally valid and often sit in the same footer region as the real contact info.
**How to avoid:** Score same-registrable-domain candidates higher (Pattern 3) and treat cross-domain matches as fallback-only, never automatic winners when a same-domain candidate exists.
**Warning signs:** A winning email whose domain doesn't match the prospect's `domain` column — worth a lightweight sanity check/log at write time, not a hard block (some legitimate businesses run mail on a different domain, e.g. a subsidiary).

### Pitfall 3: JS-rendered or click-to-reveal contact info
**What goes wrong:** Some sites hide the real email behind a "click to reveal" button that injects it via a later script/AJAX call rather than rendering it in initial DOM.
**Why it happens:** A deliberate anti-scraping technique, sometimes combined with Cloudflare's own obfuscation.
**How to avoid:** No extra handling needed beyond what the scan already does — `extractPageData()` runs after Playwright's page load (`waitUntil: "domcontentloaded"`, confirmed in `scanner-service/src/scanner.ts`), so DOM content injected after a user click is never captured. Accept as a documented miss; simulating clicks would require app-specific logic per site, which is out of scope and would risk triggering unintended side effects (forms, modals) on prospects' live sites.
**Warning signs:** A prospect's `contact_email` stays null despite `hasContactInfo: true` on the page — expected for this class of site, not a bug to chase.

### Pitfall 4: PDF-only contact pages
**What goes wrong:** Some (mostly older/smaller) NL business sites link a downloadable PDF instead of an HTML contact page.
**Why it happens:** Legacy site-builder patterns, especially for eenmanszaak/freelancer sites.
**How to avoid:** Out of scope by design — Playwright's DOM extraction doesn't parse PDF content, and fetching+parsing the PDF would be a second fetch (violates D-5-R1). Document as an accepted miss.

### Pitfall 5: Cookiewalls hiding all page content until consent
**What goes wrong:** A full-page consent modal that CSS-hides the underlying page (rare — most NL cookie banners only block scripts/trackers, not the initial HTML) could theoretically make `innerText` empty for the whole body.
**Why it happens:** Some heavy CMPs (OneTrust, Cookiebot) inject the banner but do not typically `display:none` the entire body; this is a low-probability edge case, not the common case.
**How to avoid:** No new special-case handler — the existing `hasCookieBanner`/`cookieBannerBlocksFold` detection already tells you when a banner is present; if `contact_email` comes back null AND `hasCookieBanner: true`, that's diagnostic information worth surfacing in logs, not a reason to add interactive consent-clicking (which risks site-specific breakage across an unbounded set of CMPs for a small edge case at 10-50 prospects/week).
**Warning signs:** Contact miss rate correlating with `hasCookieBanner: true` across a batch — revisit only if this shows up as a real pattern in production data, not preemptively.

### Pitfall 6: Over-combining KVK/BTW patterns into a false eenmanszaak positive
**What goes wrong:** A BV or stichting site also displays its KVK number and BTW-id (all Dutch registered entities do) — treating "KVK number found" as a sole-proprietorship signal would produce false positives on the majority of business sites.
**Why it happens:** KVK-nummer and BTW-id are universal Dutch business identifiers, not sole-proprietorship-specific ones [CITED: business.gov.nl — "LEI, RSIN, KVK, VAT" reference].
**How to avoid:** Keep D-5-01's design literal — only the string "eenmanszaak" itself is a positive signal; "B.V."/"N.V." presence is a negative signal; everything else (including bare KVK/BTW numbers) stays `unknown`, treated cautiously per the locked decision.

## Code Examples

### Cloudflare `data-cfemail` decode (verified algorithm)

```typescript
// Source: cross-verified against multiple independent technical writeups —
// https://blog.jse.li/posts/cloudflare-scrape-shield/ and
// https://antonvroemans.medium.com/expand-your-spam-mailing-list-with-cloudflares-poor-obfuscation-fdc3cc8f4ccd
// First byte pair is the XOR key; every subsequent byte pair is XORed against it.
function decodeCfEmail(encoded: string): string {
  const key = parseInt(encoded.substring(0, 2), 16);
  let email = "";
  for (let i = 2; i < encoded.length; i += 2) {
    const charCode = parseInt(encoded.substring(i, i + 2), 16) ^ key;
    email += String.fromCharCode(charCode);
  }
  return email;
}
// decodeCfEmail("6e4b454541414f645f634d6e64604066786d") -> a decoded address.
// Cloudflare typically renders the visible span as "[email protected]" with
// the real address only in the data-cfemail attribute — this is why a plain
// innerText regex pass never finds these; querySelectorAll('[data-cfemail]')
// is a separate, required extraction path (CON-02's explicit third case).
```

### Dutch business-number patterns (context only — not sufficient alone, see Pitfall 6)

```typescript
// KVK-nummer: always 8 digits. On its own this is too ambiguous (could be a
// phone number fragment or postal reference) without adjacent context —
// require a nearby label.
const KVK_PATTERN = /kvk[\s\-]?(?:nummer|nr\.?|number)?[:\s]*?(\d{8})\b/i;

// BTW-id: NL + 9 digits + "B" + 2 digits (the VAT-ID format all NL
// businesses use, replacing the RSIN-based scheme for sole proprietors too).
// Source: https://business.gov.nl/starting-your-business/registering-your-business/lei-rsin-vat-and-kvk-number-which-is-which/
const BTW_ID_PATTERN = /NL\d{9}B\d{2}/i;

// The ONLY positive eenmanszaak signal (D-5-01): literal string match.
const EENMANSZAAK_PATTERN = /eenmanszaak/i;
// Negative signal (counter-evidence): explicit company form.
const COMPANY_FORM_PATTERN = /\b(B\.?V\.?|N\.?V\.?|besloten vennootschap|naamloze vennootschap)\b/i;
```

### Three-state eenmanszaak resolution (D-5-01)

```typescript
export type SoleProprietorshipSignal = "yes" | "no" | "unknown";

export function detectSoleProprietorship(allPagesText: string): SoleProprietorshipSignal {
  if (EENMANSZAAK_PATTERN.test(allPagesText)) return "yes";
  if (COMPANY_FORM_PATTERN.test(allPagesText)) return "no";
  return "unknown"; // treated cautiously — as if personal data, per D-5-01
}
```

## State of the Art

Not applicable in the conventional sense — this is greenfield logic within an established codebase, not a library/framework upgrade. The one relevant shift: Cloudflare's email obfuscation script has had at least one public revision cycle (see `corewebvitals.io` source below, "Cloudflare Fixed Their Email Obfuscation Script"), so the decode function should be treated as best-effort against the currently-observed scheme, not a permanent guarantee — if a batch's cfemail decode starts producing garbage, that's a signal the scheme changed, not a bug in the aggregation logic.

**Deprecated/outdated:** None — no prior contact-extraction code exists in this codebase to deprecate.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The curated `GENERIC_LOCALS` word list (info, contact, hallo, welkom, administratie, praktijk, etc.) is complete enough for NL physiotherapy/small-business prospects | Pattern 2 / Code Examples | A real named-person address gets misclassified as generic (or vice versa) — low-harm since CON-04 just changes preference order, but CON-05's manual-review flag could under- or over-fire. Recommend the planner add a "review first N batches" checkpoint rather than treating the list as final on day one |
| A2 | `waitUntil: "domcontentloaded"` (confirmed in `scanner.ts`) captures footer/contact-page DOM reliably without needing `networkidle` for lazy-loaded footers | Pitfall 3 | If a meaningful share of prospects render contact info via late JS, contact_email recall will be lower than expected — but changing wait strategy is an existing-behavior change affecting every other extraction (scores, issues), out of this phase's scope to alter unilaterally |
| A3 | Cloudflare's XOR-with-embedded-key scheme (first-byte-is-key) is still the current implementation | Code Examples / State of the Art | If Cloudflare has changed the scheme, cfemail decoding silently produces garbage strings — mitigate with a sanity check (`/.+@.+\..+/` on the decoded result) before accepting it as a candidate, already included above |

**If this table is empty:** N/A — see rows above; all three are reasonable defaults consistent with the codebase's existing conventions, not high-risk guesses.

## Open Questions

1. **What should happen to `contact_email`/`contact_email_type` on a re-scan (requeue) of a prospect that already has a value?**
   - What we know: `lib/prospect-upsert.ts` documents contact_email/contact_email_type as fields Phase 5 is the first writer of; `reconcileInFlightScans()` is the only writer path this research identifies.
   - What's unclear: whether a later successful re-scan (via the Shortlist's "Re-queue" button on a `failed` row) should overwrite a previously-found contact, or only fill it when currently null.
   - Recommendation: overwrite on every successful `done` transition (latest scan wins, consistent with `latest_scan_id` semantics elsewhere) — but flag this explicitly for the planner to confirm, since it's a one-line difference (`.update()` unconditionally vs. conditioned on `contact_email IS NULL`).

2. **Does CON-05's "stays out of the default outreach flow automatically" need any Phase-5-side enforcement, or is the Shortlist pill sufficient for this phase's scope?**
   - What we know: Phase 6 (Draft Generation & Approval Queue) doesn't exist yet — there's no "default outreach flow" to gate today.
   - What's unclear: whether Phase 5 should still store the classification in a way that makes future Phase-6 filtering trivial (it does — `contact_email_type = 'named-person'` is a simple, one-column `WHERE` filter), or whether any other Phase-5-visible surface (e.g. the release/scan queue) should also respect it.
   - Recommendation: Phase 5 scope = store the classification + Shortlist pill only. Leave a comment at the Phase 6 boundary (e.g. in `contact-extraction.ts`) noting that draft-eligibility filtering on `contact_email_type` is Phase 6's responsibility, matching how DRA-06/scoring-consolidation notes are already threaded through the roadmap for cross-phase handoffs.

## Environment Availability

Skipped — this phase adds no new external tool, service, runtime, or CLI dependency. Playwright, Node, and Supabase are already provisioned and exercised by every prior phase.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (root `vitest.config.ts`, `environment: "node"`, `passWithNoTests: true`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run lib/contact-extraction.test.ts` |
| Full suite command | `npm test` (root) — runs `vitest run` across all `*.test.ts` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CON-02 | cfemail XOR decode produces a valid-looking email from a known encoded fixture | unit | `npx vitest run lib/contact-extraction.test.ts -t "cfemail"` | ❌ Wave 0 |
| CON-02 | mailto href with query string (`?subject=...`) strips correctly | unit | `npx vitest run lib/contact-extraction.test.ts -t "mailto"` | ❌ Wave 0 |
| CON-02 | Obfuscated `[at]`/`(dot)` body text normalizes and matches | unit | `npx vitest run lib/contact-extraction.test.ts -t "obfuscated"` | ❌ Wave 0 |
| CON-03/CON-04 | Generic beats named-person when both present on different pages | unit | `npx vitest run lib/contact-extraction.test.ts -t "aggregateContacts"` | ❌ Wave 0 |
| CON-03 | Classification: `info@`, `hallo@`, `praktijk@` -> generic; `jan.devries@`, `m.bakker@` -> named-person | unit | `npx vitest run lib/contact-extraction.test.ts -t "classifyLocalPart"` | ❌ Wave 0 |
| CON-05 | Shortlist row with `contact_email_type: "named-person"` renders the pill | unit/component | `npx vitest run components/admin/shortlist-table.test.tsx` (if component tests exist for this file) or a `deriveChips`-style pure function test | ❌ Wave 0 (check whether `shortlist-table.tsx` has any existing test file first — none found as of this research) |
| CON-06 | Commercial-invite keyword match on positive and negative fixtures | unit | `npx vitest run lib/contact-extraction.test.ts -t "commercialInvite"` | ❌ Wave 0 |
| CON-07 | Three-state resolution: "eenmanszaak" -> yes; "B.V." -> no; neither -> unknown | unit | `npx vitest run lib/contact-extraction.test.ts -t "detectSoleProprietorship"` | ❌ Wave 0 |
| CON-01 | `reconcileInFlightScans()` writes contact fields only on the `done` transition, using `scans.pages`, with no additional fetch | integration | `npx vitest run lib/scan-queue.integration.test.ts -t "contact"` (extends existing integration test against local Supabase) | ❌ Wave 0 (extends existing `scan-drain.integration.test.ts` pattern) |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/contact-extraction.test.ts` (fast, pure-function, no DB)
- **Per wave merge:** `npm test` (full suite, includes the local-Supabase integration test extending `reconcileInFlightScans`)
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally, a manual/`checkpoint:human-verify` pass against the 11 live physiotherapy prospects already queued (per 05-CONTEXT.md "Specific Ideas") to sanity-check real-world extraction recall, since `extractor.ts`'s DOM-evaluate code itself (as opposed to the pure classification logic) has no Playwright-driven test harness in this repo today.

### Wave 0 Gaps
- [ ] `lib/contact-extraction.ts` — the module itself doesn't exist yet; created and tested in the same wave (covers CON-02/03/04/06/07)
- [ ] `lib/contact-extraction.test.ts` — new unit test file, no fixtures/mocking needed (pure functions over literal strings and small `PageResult[]` arrays)
- [ ] Extend `lib/scan-queue.integration.test.ts` (or add a sibling) — covers CON-01's "no second fetch, only reads `scans.pages`" behavior against local Supabase
- [ ] No Playwright/DOM-level test harness exists for `extractor.ts` changes — treat the `page.evaluate()` wiring as thin glue over already-unit-tested pure logic (decode/classify functions duplicated as literal inline code inside the evaluate callback, since code cannot cross the Node/browser boundary by reference), verified manually against the live batch rather than via a new test framework addition (adding Playwright component/fixture testing infra is disproportionate to this phase's scope)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no new auth surface |
| V3 Session Management | No | No new session concern |
| V4 Access Control | No | Reuses existing admin-session-gated Shortlist and existing `x-admin-secret` bearer pattern; no new endpoint introduced |
| V5 Input Validation | Yes | Every regex-extracted string (email, KVK, BTW-id) is DATA extracted from an untrusted third-party website — treat as untrusted input: bound string length before storing (a malicious/broken page could inject an absurdly long "email-looking" string via body text), and never `eval`/interpolate extracted text into any query or shell command. Store via parameterized Supabase `.update()` calls only (already the project's universal pattern) |
| V6 Cryptography | No | The Cloudflare XOR "decode" is obfuscation-reversal of publicly-known, non-secret data (the business's own public email), not a cryptographic operation on secret data — no key management concern |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A hostile/compromised prospect site injects an oversized or malformed string via `data-cfemail`, a `mailto:` href, or body text, aimed at bloating the `prospects` row or breaking downstream email-sending (Phase 6) | Tampering / Denial of Service | Cap stored `contact_email` length (e.g. reject/discard candidates over 254 chars, the RFC 5321 max) before writing; the existing lightweight regex already constrains character classes, limiting most injection shapes |
| A prospect site embeds a crafted string designed to look like a *different* prospect's suppressed email, attempting to bypass suppression checks via typo/lookalike domains | Spoofing | Out of scope for this phase — `lib/suppression.ts`'s exact-match + domain-match check runs at send time (Phase 8), unaffected by what Phase 5 stores; Phase 5 only needs to store what it finds, not validate deliverability or ownership |
| Regex-based email extraction is run against the full page repeatedly across many prospects — a pathological page (e.g. deeply nested obfuscation patterns) could cause catastrophic regex backtracking (ReDoS) | Denial of Service | All patterns recommended here (mailto, cfemail, generic email regex, KVK/BTW/eenmanszaak) are simple, non-nested, linear-time patterns with no catastrophic-backtracking shapes (no nested quantifiers over overlapping character classes) — verified by inspection; if the planner introduces any new pattern, run it through a ReDoS checker (e.g. `safe-regex` mentally or via a quick fuzz) before merging |

## Sources

### Primary (HIGH confidence)
- `scanner-service/src/extractor.ts`, `scanner-service/src/discovery.ts`, `scanner-service/src/scanner.ts`, `scanner-service/src/index.ts` — read directly, ground truth for extraction/aggregation/write points
- `types/scanner.ts`, `supabase/migrations/010_create_prospects.sql`, `013_add_prospect_id_to_scans.sql`, `017_add_scan_status.sql`, `008_add_locale.sql` — read directly, schema and migration-idempotency conventions
- `lib/prospect-upsert.ts`, `lib/scan-queue.ts`, `lib/bulk-scan-dispatch.ts`, `lib/triage-candidates.ts`, `components/admin/shortlist-table.tsx`, `components/admin/signal-chips.tsx`, `scripts/legal-basis.ts`, `lib/suppression.ts`, `lib/domain-normalize.ts` — read directly, existing patterns this phase must match
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/05-contact-extraction-classification/05-CONTEXT.md` — read directly, locked decisions and requirement text

### Secondary (MEDIUM confidence)
- [An Analysis of Cloudflare's Email Address Obfuscation](https://blog.jse.li/posts/cloudflare-scrape-shield/) — cfemail XOR-with-embedded-key algorithm, cross-verified against a second independent source
- [Why CloudFlare's e-mail protection is no longer safe](https://antonvroemans.medium.com/expand-your-spam-mailing-list-with-cloudflares-poor-obfuscation-fdc3cc8f4ccd) — corroborates the same decode algorithm
- [Dutch business numbers: LEI, RSIN, KVK, VAT, VAT-ID — business.gov.nl](https://business.gov.nl/starting-your-business/registering-your-business/lei-rsin-vat-and-kvk-number-which-is-which/) — KVK 8-digit format, BTW-id `NL#########B##` format, official government source

### Tertiary (LOW confidence)
- [Cloudflare Fixed Their Email Obfuscation Script](https://www.corewebvitals.io/pagespeed/say-goodbye-to-cloudflare-email-obfuscation) — noted for State of the Art context only (scheme has revised before, treat decode as best-effort)
- `GENERIC_LOCALS` word list (Code Examples) — built from training-data knowledge of common NL/EN business email conventions, not verified against an external authoritative list; flagged in Assumptions Log (A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, every technique verified directly against the existing codebase
- Architecture: HIGH — the integration point (`reconcileInFlightScans`) was found by direct code reading, not inferred
- Pitfalls: MEDIUM — DOM/extraction pitfalls are well-grounded in the existing `extractor.ts` conventions; the NL-specific classification word list (A1) and eenmanszaak recall/precision (D-5-01's own "imperfect by design" framing) carry inherent uncertainty until run against real batches

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 days — stable domain; the one fast-moving risk is Cloudflare's obfuscation scheme, flagged in Assumptions Log A3 and State of the Art)
