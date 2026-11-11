---
phase: 05-contact-extraction-classification
reviewed: 2026-07-26T22:31:06Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - supabase/migrations/018_add_contact_classification.sql
  - types/scanner.ts
  - lib/contact-extraction.ts
  - lib/contact-extraction.test.ts
  - scanner-service/src/extractor.ts
  - lib/scan-queue.ts
  - lib/scan-drain.integration.test.ts
  - lib/scan-queue.test.ts
  - lib/triage-candidates.ts
  - components/admin/shortlist-table.tsx
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-07-26T22:31:06Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the contact-extraction pure module, its scanner-service harvester, the
reconciler that writes classification fields onto `prospects`, the migration
that adds the storage contract, and the admin surface that displays it.

The classification heuristics (`classifyLocalPart`, `detectSoleProprietorship`,
`detectCommercialInvite`) are sound and match their unit tests. The migration's
CHECK constraints and defaults line up with the TypeScript unions
(`ContactEmailType`, `SoleProprietorshipSignal`) that `contact-extraction.ts`
produces.

The main concern is the one the task called out directly: the "fill-only-when-
null" invariant in `reconcileInFlightScans()` is enforced by an in-memory
snapshot read at the top of the function, not by a predicate on the write
itself — so it is advisory, not structural, unlike every other write in that
file (`armBatch`, `requeueProspect` both use DB-level filters for exactly this
reason). There are also two real parsing/classification correctness gaps in
`contact-extraction.ts` (a mailto multi-recipient string can be stored as a
single "email", and body-text obfuscation decoding can manufacture a false
email out of ordinary prose like "back at 5.pm"), plus one place where the
harvester's own stated DoS-guard comment doesn't fully hold.

## Critical Issues

### CR-01: `reconcileInFlightScans` fill-only-when-null is a stale read, not an atomic write guard

**File:** `lib/scan-queue.ts:189-222`
**Issue:**
The function selects `contact_email` once, in the initial batch query
(`lib/scan-queue.ts:161-166`), then later branches on that in-memory value:

```ts
for (const id of doneIds) {
  const row = rows.find((r) => r.id === id)!;
  if (row.contact_email) {
    // Already has a contact — fill-only-when-null, never overwrite.
    const { error } = await sb.from("prospects").update({ scan_status: "done" }).eq("id", id);
    ...
    continue;
  }
  ...
  const { error } = await sb
    .from("prospects")
    .update({
      scan_status: "done",
      contact_email: contact.contactEmail,
      contact_email_type: contact.contactEmailType,
      commercial_contact_invited: contact.commercialContactInvited,
      sole_proprietorship: contact.soleProprietorship,
    })
    .eq("id", id);
```

Neither branch's `.eq("id", id)` filter re-checks `contact_email` (or
`scan_status`) at write time. If `contact_email` (or `scan_status`) changes
between the initial SELECT and this UPDATE — e.g. a concurrent admin edit, or
a second overlapping reconcile tick — the write silently overwrites whatever
is in the DB, contradicting the invariant this same function's docstring
claims ("fill-only-when-null, so a re-scan can never clobber a value a human
may already be reviewing"). Every *other* write in this file makes its
guarantee structural rather than advisory (`armBatch`'s comment explicitly
says "structural rather than advisory"; `requeueProspect` chains
`.eq("scan_status", "failed")` on the update itself so a non-failed row is a
provable no-op). This function is the odd one out: it proves the guarantee
against a variable in memory instead of a predicate in the query.

**Fix:** Push the null-check into the update predicate so the guarantee holds
regardless of what happened between the read and the write:

```ts
const { error, count } = await sb
  .from("prospects")
  .update({
    scan_status: "done",
    contact_email: contact.contactEmail,
    contact_email_type: contact.contactEmailType,
    commercial_contact_invited: contact.commercialContactInvited,
    sole_proprietorship: contact.soleProprietorship,
  })
  .eq("id", id)
  .is("contact_email", null); // atomic fill-only-when-null guard
if (error) throw error;
if (count === 0) {
  // Someone set contact_email concurrently — still needs scan_status flipped.
  const { error: statusError } = await sb.from("prospects").update({ scan_status: "done" }).eq("id", id);
  if (statusError) throw statusError;
}
```

(Requires `.select()` or the `count: "exact"` option depending on the
supabase-js version in use to get a row count back from `.update()`.)

## Warnings

### WR-01: `parseMailtoHref` accepts multi-recipient mailto hrefs and stores the whole string as one "email"

**File:** `lib/contact-extraction.ts:96-108`
**Issue:** The validation is `/.+@.+\..+/.test(email)` with no anchors and no
rejection of separator characters. A real-world `mailto:info@x.nl,sales@x.nl`
(comma-separated recipients — valid in `mailto:` hrefs) decodes to
`"info@x.nl,sales@x.nl"`, which *passes* this test (the `.+` groups are happy
to span the comma), so the composite string becomes `ContactCandidate.email`
and can win as `contactEmail` — a value that is not a deliverable address and
will break Phase 6's outreach send.
**Fix:**
```ts
const email = decoded.trim().toLowerCase();
if (/[,;]/.test(email)) return null; // multiple recipients — not a single address
return /^[^\s@]+@[^\s@]+\.[^\s@,;]+$/.test(email) ? email : null;
```

### WR-02: Body-text "at"/"dot" deobfuscation can manufacture a false email from ordinary prose

**File:** `lib/contact-extraction.ts:117-138`
**Issue:** `extractEmailsFromText` rewrites every bare `" at "` and `" dot "`
occurrence (not just the bracketed `[at]`/`(at)` forms) in the *entire* page
text to `@`/`.` before re-scanning for the email pattern. Ordinary sentences
like "Open Monday, back at 5.pm" become "Open Monday, back@5.pm" — which
matches `BODY_EMAIL_PATTERN` (`5` + `.pm`, and `pm` satisfies
`[a-zA-Z]{2,}`) and is emitted as a real candidate. On a site with no
published email address, this manufactured value can become the winning
`contactEmail`.
**Fix:** Drop the bare `\s+at\s+` / `\s+dot\s+` alternatives and keep only the
explicitly-marked obfuscation forms (`[at]`/`(at)`, `[dot]`/`(dot)`) — genuine
obfuscation almost always uses a visual delimiter; bare "at"/"dot" in running
text is the common case and the risky one:
```ts
const deobfuscated = text
  .replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, "@")
  .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, ".");
```

### WR-03: `mailtoHrefs`/`cfemailTokens` are count-bounded but not length-bounded per item

**File:** `scanner-service/src/extractor.ts:255-262`
**Issue:** The comment above this block states the bounded counts (50) and
`contactText` length (50k) "guard against a pathological page (Security
V5/DoS)". `contactText` is indeed truncated (`.slice(0, 50_000)`), but the
individual `mailtoHrefs`/`cfemailTokens` strings are not — a single crafted
page could set one `href` or `data-cfemail` attribute to an arbitrarily large
value, which then flows unbounded into `decodeCfEmail`/`parseMailtoHref` and
into the `scans.pages` JSONB column.
**Fix:**
```ts
const mailtoHrefs = Array.from(doc.querySelectorAll('a[href^="mailto:"]'))
  .slice(0, 50)
  .map((a) => (a.getAttribute("href") || "").slice(0, 500));
const cfemailTokens = Array.from(doc.querySelectorAll("[data-cfemail]"))
  .slice(0, 50)
  .map((el) => (el.getAttribute("data-cfemail") || "").slice(0, 500));
```

### WR-04: `commercial_contact_invited`/`sole_proprietorship` are frozen forever once `contact_email` is set

**File:** `lib/scan-queue.ts:201-208`
**Issue:** The "already has a contact" branch writes `scan_status` only and
skips `commercial_contact_invited`/`sole_proprietorship` entirely. Those two
fields are gated by the *same* `contact_email`-nullness check as the human-
reviewed `contact_email` itself, but they are not human-edited values — they
are page-content-derived signals (CON-06/CON-07) that can legitimately change
between scans (a site could add a new "vraag een offerte aan" CTA, or an
"eenmanszaak" disclosure, on a later re-scan). Once any scan fills
`contact_email`, every subsequent re-scan silently stops refreshing these two
fields, even though nothing about them needs "never overwrite" protection.
**Fix:** Decouple the two independent-signal fields from the contact_email
fill-only gate — recompute and write them on every `done` transition
regardless of whether `contact_email` was already set:
```ts
const contact = aggregateContacts((scan.pages as PageResult[] | null) ?? [], row.domain);
const update: Record<string, unknown> = {
  scan_status: "done",
  commercial_contact_invited: contact.commercialContactInvited,
  sole_proprietorship: contact.soleProprietorship,
};
if (!row.contact_email) {
  update.contact_email = contact.contactEmail;
  update.contact_email_type = contact.contactEmailType;
}
const { error } = await sb.from("prospects").update(update).eq("id", id);
```

## Info

### IN-01: `ProspectRow.contact_email_type`/`sole_proprietorship` are typed as bare `string`

**File:** `types/scanner.ts:424,428`
**Issue:** `contact_email_type: string | null` and `sole_proprietorship: string`
don't reuse `ContactEmailType`/`SoleProprietorshipSignal` from
`lib/contact-extraction.ts`, so a typo or drift (e.g. `"named_person"` vs
`"named-person"`) would type-check even though it violates the DB CHECK
constraint. Understandable given `types/scanner.ts` is shared with
`scanner-service` (which can't resolve `@/lib/*`), but worth a local type
alias in this file so at least app-side consumers get the narrower type.
**Fix:** Declare the two literal unions directly in `types/scanner.ts` (no
cross-boundary import needed) and use them for both fields, e.g.
`export type ContactEmailType = "generic" | "named-person";`.

### IN-02: Duplicated email-shape regex between `extractor.ts` and `contact-extraction.ts`

**File:** `scanner-service/src/extractor.ts:242`, `lib/contact-extraction.ts:68`
**Issue:** `extractPageData()`'s `emailPattern` (`/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i`)
and `contact-extraction.ts`'s `BODY_EMAIL_PATTERN`
(`/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g`) are the same shape
expressed twice with different flags, in two files that already share a type
boundary (`types/scanner.ts`). Low risk today, but a future tightening of one
(e.g. WR-02/WR-01 fixes above) won't propagate to the other.
**Fix:** Not urgent; note for a future pass rather than block on it.

---

_Reviewed: 2026-07-26T22:31:06Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
