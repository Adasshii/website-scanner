# Phase 2: Compliance Spine - Research

**Researched:** 2026-07-19
**Domain:** Suppression list (source of truth), idempotent unsubscribe endpoint, Resend webhook auto-suppression, CLI override/lookup tooling, versioned legal-basis config — all on the existing Next.js/Supabase stack.
**Confidence:** HIGH (this phase is almost entirely a codebase-grounded design problem — every load-bearing claim was verified by reading the actual files, not by external research)

## Summary

Phase 2 adds two new schema areas (`suppressions`, and a legal-basis pair — `lia_versions` + `legal_regimes`) plus one extension to an existing route (`app/api/webhooks/resend/route.ts`) and two new CLI scripts. Nothing in this phase requires a new npm dependency — `tldts` (domain normalisation), `svix` (webhook verification), `@supabase/supabase-js`, and Node's built-in `crypto` module cover every technical need, including the unsubscribe token.

The single most important design decision this research surfaced, which is **not yet resolved by CONTEXT.md and must be locked in the plan**: the prior architecture draft (`.planning/research/ARCHITECTURE.md`) sketched `suppressions.email` as a plain `UNIQUE` column, but the locked decision D-09 ("override *lifts*, never deletes... a later re-suppression adds a new row") requires the same email to be able to appear in more than one row over time. A hard `UNIQUE` constraint on `email` and D-09 are mutually exclusive. The fix is the same pattern this codebase already uses for exactly this shape of problem — `prospects.domain` uses a **partial unique index** (`... where domain is not null`, migration 010). `suppressions` needs the same idea: a partial unique index on `email` scoped to `where lifted_at is null`, so at most one *active* suppression exists per email at a time, while lifted rows remain forever as history and a fresh row can be added after a lift.

Domain-wide blocking (CMP-01/03/05: one row blocks the whole domain) falls out of the schema for free — every suppression row stores both the exact `email` and its registrable `domain` (via the existing `normalizeDomain()` in `lib/domain-normalize.ts`), and the lookup checks `email = X OR domain = Y` in one query. No separate "domain suppression" table or flag is needed.

The unsubscribe token should be an HMAC-signed reference to a `prospect_id` (a UUID, not personally identifying on its own), never the raw email address. This satisfies D-03 ("self-contained") without putting an email address in a URL that ends up in server access logs, browser history, and mail-client link-preview requests. Verification is `crypto.createHmac` + `crypto.timingSafeEqual` — both stdlib, matching the project's existing zero-extra-dependency posture.

**Primary recommendation:** Two migrations (`014_create_suppressions.sql`, `015_create_legal_basis.sql`), a `lib/suppression.ts` (`isSuppressed`, `writeSuppression`, `liftSuppression`) and `lib/unsubscribe-token.ts` (`signUnsubscribeToken`, `verifyUnsubscribeToken`), one route handler `app/api/unsubscribe/[token]/route.ts` (GET + POST, RFC 8058 one-click), an in-place extension of the existing Resend webhook route, a Node backfill script (not raw SQL — domain normalisation needs `tldts`), and two CLI scripts following the `scripts/import-prospects.ts` pattern exactly.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Suppression storage & domain-wide matching | Database / Storage (Supabase `suppressions` table) | API/Backend (`lib/suppression.ts` query helper) | Table is the explicit source of truth per ARCHITECTURE.md/CONTEXT.md; the helper is a thin, reusable query wrapper the future send route also calls (CMP-02, later phase) |
| Unsubscribe write + confirmation render | API/Backend (`app/api/unsubscribe/[token]/route.ts`) | — | Domain-agnostic Next.js route handler per D-03; no separate page.tsx needed since POST (RFC 8058) and GET must share one path |
| Unsubscribe token signing/verification | API/Backend (`lib/unsubscribe-token.ts`) | — | Pure function, stdlib `crypto`, called by both the (future) send layer to mint tokens and this route to verify them |
| Auto-suppression from Resend events | API/Backend (existing `app/api/webhooks/resend/route.ts`, extended in place) | Database (`email_events` read-back for the recipient address) | CMP-07 explicitly reuses the existing, already-Svix-verified route — do not create a second webhook endpoint |
| Historical bounce/complaint backfill | API/Backend (one-time Node script, not raw SQL) | Database (`suppressions`, `email_events` read) | Domain normalisation requires `tldts` (JS); SQL-only backfill cannot correctly compute registrable domains (multi-part TLDs) |
| Override & legal-basis lookup | API/Backend (CLI scripts, `scripts/*.ts`) | Database | D-08/D-10 explicitly scope this phase's operator surface to CLI, not UI — Phase 3 promotes the same resolution logic to API/UI |
| LIA artifact + versioning | Database / Storage (`lia_versions` registry) | Repo files (`docs/legal/lia/LIA-v*.md`, static, not a runtime tier) | D-11: immutable files are the content; the DB row is a queryable, hash-verifiable pointer to "current version" |
| Per-country legal regime config | Database / Storage (`legal_regimes`) | — | CMP-16: must never be hardcoded logic; a config table is required so expansion to a new country is a data change, not a code change |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.99.3 (already installed) | All reads/writes to `suppressions`, `lia_versions`, `legal_regimes` | Already the sole DB client in this codebase `[VERIFIED: package.json]` |
| `tldts` | ^7.4.9 (already installed) | Registrable-domain normalisation for suppression matching | Already vetted and approved by Joshua in Phase 1 (`STATE.md`: "Human approved... tldts as legitimate") `[VERIFIED: STATE.md decision log]`; reused via the existing `lib/domain-normalize.ts` — do not add a second normaliser |
| `svix` | 1.89.0 (already installed) | Webhook signature verification, already wired into `app/api/webhooks/resend/route.ts` | No change needed; this phase only adds logic *after* verification succeeds `[VERIFIED: app/api/webhooks/resend/route.ts]` |
| `node:crypto` (Node stdlib) | Node 18+ | HMAC-SHA256 signing/verification for the unsubscribe token | No new dependency; `createHmac` + `timingSafeEqual` is the standard, unforgeable pattern for a signed, non-expiring, self-contained token at this scale — a JWT library would be strictly more code and more risk surface for one boolean-shaped claim (`prospectId`) `[VERIFIED: crypto is a Node builtin, no install needed]` |
| `node:util` `parseArgs` | Node 18+ | CLI arg parsing for the two new scripts | Already the established pattern in `scripts/import-prospects.ts` — do not add `commander`/`yargs` `[VERIFIED: scripts/import-prospects.ts:1,52-68]` |

### Supporting
None required. Every capability in this phase is covered by an already-installed dependency or Node's standard library.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:crypto` HMAC token | `jsonwebtoken` / `jose` | JWT adds a dependency, an expiry model this phase explicitly doesn't want (unsubscribe must never expire), and claims/algorithm-negotiation surface that is pure attack surface for a single-field payload. Rejected — stdlib HMAC is simpler and sufficient. |
| SQL-only backfill (D-06) | A Node script using `normalizeDomain()` | Raw SQL substring-after-`@` domain extraction is wrong for multi-part public suffixes (e.g. `.co.uk`) and would silently under-block domain-wide suppression. Rejected in favor of the Node script that reuses the existing, tested normaliser. |
| Separate `suppression_overrides` audit table (D-08's "logged override") | `lifted_at` / `lifted_by_reason` columns on the same `suppressions` row (D-09) | D-09 already specifies the audit trail lives on the row itself — a second table would duplicate what the lifted row + the fact a fresh row appears after re-suppression already proves. Matches the codebase's existing "no speculative `audit_log` table" stance (`ARCHITECTURE.md` §`outreach_messages`). |

**Installation:**
```bash
# No new packages. Everything is already in package.json or Node stdlib.
```

**Version verification:** All four dependencies used by this phase (`@supabase/supabase-js`, `tldts`, `svix`, Node's `crypto`/`util`) are already installed and were verified against `package.json` directly — no registry lookup was needed since no new package is introduced.

## Package Legitimacy Audit

**Not applicable — this phase installs zero new external packages.** Every requirement (CMP-01, 03, 04, 05, 06, 07, 08, 16) is satisfiable with dependencies already present in `package.json` (`@supabase/supabase-js`, `tldts`, `svix`) plus Node's `crypto` and `util` standard-library modules. `tldts` was already run through the Package Legitimacy process in Phase 1 and human-approved (`STATE.md` decision log, Phase 01-02).

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                    ┌───────────────────────────────────────────┐
                    │  Existing Resend transactional email flow  │
                    │  (report-ready / follow-up / confirmation) │
                    └───────────────────┬─────────────────────────┘
                                         │ Resend fires webhook event
                                         ▼
                    ┌───────────────────────────────────────────┐
                    │ app/api/webhooks/resend/route.ts (EXTENDED)│
                    │  1. Svix-verify signature (unchanged)      │
                    │  2. UPDATE email_events SET status=...     │
                    │     RETURNING email  (read-back, new)      │
                    │  3. if status in (bounced, complained):    │
                    │       normalizeDomain(email) → domain      │
                    │       lib/suppression.writeSuppression()   │
                    └───────────────────┬─────────────────────────┘
                                         ▼
                    ┌───────────────────────────────────────────┐
                    │        suppressions (source of truth)      │
                    │  email · domain · reason · source ·        │
                    │  lifted_at · lifted_by_reason · created_at │
                    └───────────▲──────────────────────▲─────────┘
                                │                        │
        (write)                │                        │  (read)
┌───────────────────────────────┴──┐        ┌────────────┴──────────────────┐
│ app/api/unsubscribe/[token]/     │        │ scripts/legal-basis.ts (CLI)   │
│ route.ts                         │        │ scripts/suppression-override.ts│
│  GET  → verify token → write     │        │  (CLI, D-08/D-10, operator use)│
│         suppression → render     │        └─────────────────────────────────┘
│         bilingual confirmation   │
│  POST → RFC 8058 one-click →     │        ┌─────────────────────────────────┐
│         write suppression → 200  │        │  legal_regimes ⟷ lia_versions    │
└───────────────────────────────────┘        │  (country_code → regime →       │
         ▲                                    │   current LIA version)          │
         │ token minted by (future,           └─────────────────────────────────┘
         │ Phase 8) send layer via
         │ lib/unsubscribe-token.ts
   [out of scope this phase — send
    layer does not exist yet]

One-time, migration-adjacent step (D-06):
  scripts/backfill-suppressions.ts
    SELECT email FROM email_events WHERE status IN ('bounced','complained')
    → normalizeDomain() per row → writeSuppression() (idempotent, skips
      rows that already have an active suppression)
```

### Recommended Project Structure
```
supabase/migrations/
├── 014_create_suppressions.sql     # suppressions table + partial unique index + RLS enable
└── 015_create_legal_basis.sql      # lia_versions + legal_regimes + immutability trigger + NL seed row

lib/
├── suppression.ts                  # isSuppressed(email), writeSuppression(), liftSuppression()
├── suppression.test.ts             # unit tests, DI-stubbed Supabase client (mirrors import-prospects.test.ts)
└── unsubscribe-token.ts            # signUnsubscribeToken(prospectId), verifyUnsubscribeToken(token)
├── unsubscribe-token.test.ts

app/api/
├── unsubscribe/[token]/route.ts    # GET (render + write) + POST (RFC 8058 one-click)
└── webhooks/resend/route.ts        # EXTENDED in place — do not create a second webhook route

scripts/
├── suppression-override.ts         # D-08: CLI, lifts an active suppression, logs reason
├── suppression-override.test.ts
├── legal-basis.ts                  # D-10: CLI, resolves country → regime → current LIA version + suppression status
├── legal-basis.test.ts
└── backfill-suppressions.ts        # D-06: one-time, idempotent, Node (not SQL) — needs tldts

docs/legal/lia/
└── LIA-v1.md                       # D-11: immutable artifact, content owned by counsel on a parallel track
```

### Pattern 1: Partial unique index for "at most one active row"
**What:** A unique index scoped with a `WHERE` clause so uniqueness only applies to rows matching a condition — already used in this exact codebase for `prospects.domain`.
**When to use:** Any time a table needs "at most one active X" while preserving history rows that fall outside the condition.
**Example:**
```sql
-- Source: supabase/migrations/010_create_prospects.sql:39-40 (existing pattern in this repo)
create unique index if not exists prospects_domain_unique_idx
  on prospects (domain) where domain is not null;

-- Applied to suppressions (this phase):
create unique index if not exists suppressions_email_active_idx
  on suppressions (email) where lifted_at is null;
```
This is the mechanism that reconciles CMP-04 (idempotent double-unsubscribe: second click finds the existing active row, no-ops) with D-09 (a later re-suppression, after a lift, is allowed to insert a fresh row — the index only blocks a *second concurrently-active* row for the same email).

### Pattern 2: Check-then-write, not Postgres `ON CONFLICT` upsert
**What:** `SELECT ... maybeSingle()` first, then branch to `insert` or `update` in application code.
**When to use:** Every existing write path in this codebase (`lib/prospect-upsert.ts`) uses this shape rather than `.upsert({ onConflict })`.
**Example:**
```typescript
// Source: lib/prospect-upsert.ts:44-47 (existing pattern to mirror)
const { data: existingSource } = await sb
  .from("prospect_sources")
  .select("prospect_id")
  .eq("overture_gers_id", place.gersId)
  .maybeSingle();

// Applied to lib/suppression.ts (this phase) — writeSuppression():
const { data: active } = await sb
  .from("suppressions")
  .select("id")
  .eq("email", normalizedEmail)
  .is("lifted_at", null)
  .maybeSingle();
if (active) return { created: false }; // CMP-04: idempotent no-op, still a success
```

### Pattern 3: Signed, self-contained, non-PII unsubscribe token
**What:** HMAC-SHA256 over a UUID reference (`prospect_id`), never the raw email, base64url-encoded payload + signature, no expiry.
**When to use:** The unsubscribe link embedded in outbound emails (minted by the future send layer, Phase 8) and verified by this phase's route.
**Example:**
```typescript
// lib/unsubscribe-token.ts — new file, this phase
import { createHmac, timingSafeEqual } from "node:crypto";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signUnsubscribeToken(prospectId: string): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) throw new Error("Missing UNSUBSCRIBE_TOKEN_SECRET");
  const payload = b64url(JSON.stringify({ pid: prospectId }));
  const sig = b64url(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): { prospectId: string } | null {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) throw new Error("Missing UNSUBSCRIBE_TOKEN_SECRET");
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(createHmac("sha256", secret).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { pid } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof pid === "string" ? { prospectId: pid } : null;
  } catch {
    return null;
  }
}
```
No expiry field by design — D-05/LEGAL.md §3.12 require unsubscribes to be honored permanently, and art. 21(2) is an absolute right with no "processing window."

### Anti-Patterns to Avoid
- **Raw email in the unsubscribe URL:** puts PII in server access logs, Referrer headers, and mail-client link-prefetch requests. Sign a UUID reference instead (Pattern 3).
- **Plain `UNIQUE` on `suppressions.email`:** contradicts D-09's "re-suppression adds a new row." Use the partial unique index (Pattern 1).
- **Flipping `prospects.lifecycle_state` to `'suppressed'` from this phase's code:** D-07 is explicit — suppression is a pure lookup, never a prospect mutation. The `'suppressed'` enum value already exists in `prospects.lifecycle_state` (migration 010) but this phase must not write to it.
- **A second Resend webhook route for compliance:** CMP-07 explicitly extends the existing route. A parallel route would double-process the same events and risk drifting Svix-verification logic.
- **SQL-only backfill for D-06:** cannot correctly compute registrable domains for multi-part TLDs; use the Node script that calls `normalizeDomain()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Registrable-domain extraction | A regex/string-split domain parser | `lib/domain-normalize.ts`'s `normalizeDomain()` (tldts-backed) | Already exists, already tested (`lib/domain-normalize.test.ts`), already handles multi-part public suffixes and IP/localhost edge cases. A second implementation is exactly the "two normalisers drift apart" bug class CONTEXT.md's canonical refs warn against. |
| Webhook authenticity | A new HMAC verification scheme for Resend payloads | `svix` (`Webhook.verify`), already wired in `app/api/webhooks/resend/route.ts` | Resend uses Svix for webhook delivery; the existing route already does this correctly. Nothing to add. |
| Signed token | A JWT library or a custom encryption scheme | `node:crypto` HMAC + `timingSafeEqual` (Pattern 3) | One boolean-shaped claim (a UUID) doesn't need JWT's header/claims/algorithm-negotiation surface — that surface is attack surface, not a feature, at this scope. |
| CLI argument parsing | A hand-rolled `process.argv` parser | `node:util` `parseArgs` | Already the established, tested pattern (`scripts/import-prospects.ts`). |
| "Which country's legal rules apply" logic | Hardcoded `if (country === 'NL')` branches anywhere in app code | `legal_regimes` config table (CMP-16) | The whole point of CMP-16 is that adding a country is a data change (`INSERT INTO legal_regimes`), never a code change. |

**Key insight:** Every technical building block this phase needs already exists in this codebase or Node's standard library. The actual engineering work is schema design (the partial-unique-index reconciliation) and correctly wiring one existing route — not introducing new tooling.

## Common Pitfalls

### Pitfall 1: `suppressions.email` as a plain UNIQUE column
**What goes wrong:** A second suppression event for a previously-lifted email fails with a unique-constraint violation instead of recording a fresh, distinct suppression.
**Why it happens:** The prior architecture sketch (`.planning/research/ARCHITECTURE.md:311`) predates D-09 and specified a plain `unique` column; a planner copying that draft verbatim would violate the locked decision.
**How to avoid:** Use the partial unique index scoped to `where lifted_at is null` (Pattern 1), mirroring `prospects.domain`'s existing partial-unique convention.
**Warning signs:** Any migration for this table containing the bare word `unique` next to the `email` column definition (not `create unique index ... where ...`).

### Pitfall 2: Treating the webhook payload as if it carries the recipient address
**What goes wrong:** Code tries to read `payload.data.email` or similar and gets `undefined`, silently skipping auto-suppression.
**Why it happens:** Resend's webhook payload (`{ type, data: { email_id } }`) only carries Resend's internal message ID, not the recipient — confirmed directly in the current route (`app/api/webhooks/resend/route.ts:41,44`).
**How to avoid:** Read the recipient back from `email_events.email` using `resend_email_id` — either via a `.select("email")` on the existing `.update()` call (Supabase returns the updated row) or a follow-up `.select()`.
**Warning signs:** Suppression rows created with a `null`/empty email, or auto-suppression silently never firing despite real bounces landing in `email_events`.

### Pitfall 3: Mutating `prospects.lifecycle_state` on suppression
**What goes wrong:** Suppression writes also `UPDATE prospects SET lifecycle_state = 'suppressed'`, creating a second, driftable source of truth.
**Why it happens:** The enum value `'suppressed'` already exists on `prospects.lifecycle_state` (migration 010, line 26), which looks like an invitation to use it.
**How to avoid:** D-07 is explicit: suppression is a pure lookup. Leave `lifecycle_state` untouched from this phase; a later phase (admin UI, Phase 3) may *read* the suppression table to render a badge, but does not need this column to do so.
**Warning signs:** Any `UPDATE prospects` statement inside `lib/suppression.ts` or the unsubscribe route.

### Pitfall 4: RFC 8058 one-click POST that redirects or requires extra steps
**What goes wrong:** Gmail/Yahoo's automated one-click unsubscribe fails silently because the endpoint redirects (302) or expects a second confirmation click — mail clients POST directly to the `List-Unsubscribe` URL with body `List-Unsubscribe=One-Click` and expect a direct 2xx, no navigation `[CITED: mailmodo.com/guides/rfc-8058, captaindns.com/en/blog/gmail-one-click-unsubscribe-rfc8058]`.
**Why it happens:** It's tempting to reuse the GET handler's "render a confirmation page" logic for POST too.
**How to avoid:** The POST branch of `app/api/unsubscribe/[token]/route.ts` must write the suppression and return a bare `200` (or `202`) with no redirect and no HTML body requirement. The URL used in `List-Unsubscribe` and `List-Unsubscribe-Post` must also be HTTPS — HTTP endpoints are ignored by Gmail/Yahoo `[CITED: mailmodo.com/guides/rfc-8058]`. (Setting the headers on outbound sends is Phase 8's job; this phase only has to make sure the POST *handler* itself is one-click-correct so Phase 8 can wire it without revisiting this route.)
**Warning signs:** Any `NextResponse.redirect(...)` in the POST branch.

### Pitfall 5: Backfilling the wrong `email_events` rows
**What goes wrong:** The D-06 backfill script scopes its query to a specific `email_type` (e.g. only rows that look like "outreach"), missing the point of the requirement.
**Why it happens:** `email_events.email_type` currently only contains `('confirmation', 'report_ready', 'follow_up', 'admin_notification')` — no outreach email has ever been sent (Phase 8 is gated) — so it's tempting to think there's nothing meaningful to backfill yet.
**How to avoid:** D-06's intent is explicit: seed `suppressions` from **every** existing `bounced`/`complained` row regardless of type, "so anyone who already signalled 'stop' on the shared Resend account is protected from day one." Query `WHERE status IN ('bounced', 'complained')` with no `email_type` filter.
**Warning signs:** A `WHERE email_type = ...` clause anywhere in `scripts/backfill-suppressions.ts`.

### Pitfall 6: `lia_versions` rows mutated after creation
**What goes wrong:** A future edit (accidental UPDATE via an admin tool, a "fix a typo" migration) silently changes what a past send's `lia_version` foreign key actually points to, breaking the audit-trail guarantee CMP-08/CMP-12 depend on.
**Why it happens:** Nothing in a plain table definition stops an `UPDATE`; "immutable" is often treated as an app-level convention that erodes over time.
**How to avoid:** Enforce it at the DB level with a `BEFORE UPDATE OR DELETE` trigger on `lia_versions` that raises an exception — this codebase already has precedent for small `plpgsql` functions in migrations (`delete_expired_scans()`, migration 001).
**Warning signs:** Any code path (app or script) that calls `.update()` on `lia_versions`.

## Code Examples

### Extending the existing Resend webhook for auto-suppression (CMP-07)
```typescript
// Source: app/api/webhooks/resend/route.ts (existing, lines 56-68) — extend, don't replace
const supabase = createServerClient();
const { data: updated, error } = await supabase
  .from("email_events")
  .update({ status: newStatus, updated_at: new Date().toISOString() })
  .eq("resend_email_id", resendEmailId)
  .select("email")
  .maybeSingle(); // read the recipient back — payload never carries it

if (error) {
  console.error("[webhook/resend] Failed to update email event:", error);
}

// NEW (this phase): CMP-07 auto-suppression, both hard bounce and complaint
// suppress domain-wide (D-05) — one rule, one code path.
if (updated?.email && (newStatus === "bounced" || newStatus === "complained")) {
  const domain = normalizeDomain(updated.email);
  await writeSuppression(supabase, {
    email: updated.email.toLowerCase(),
    domain,
    reason: newStatus, // 'bounced' | 'complained'
    source: "resend_webhook",
  });
}
```

### Suppression matching (domain-wide, single query)
```typescript
// lib/suppression.ts — new file, this phase
export async function isSuppressed(
  sb: SupabaseClient,
  email: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizeDomain(normalizedEmail);
  const { data, error } = await sb
    .from("suppressions")
    .select("id")
    .is("lifted_at", null)
    .or(`email.eq.${normalizedEmail},domain.eq.${domain}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `mailto:` List-Unsubscribe as sufficient | URL (`https://`) List-Unsubscribe + List-Unsubscribe-Post required for Gmail/Yahoo bulk-sender compliance | 2024 Gmail/Yahoo sender requirements `[CITED: mailmodo.com/guides/rfc-8058]` | Not directly load-bearing this phase (sending is Phase 8), but the route this phase builds must be one-click-correct now so Phase 8 doesn't have to revisit it. |

**Deprecated/outdated:** none specific to this phase's scope — the RFC 8058 mechanics are stable since 2017; the 2024 change is about *which senders* Gmail/Yahoo require it from, not the protocol itself.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A new dedicated `UNSUBSCRIBE_TOKEN_SECRET` env var (not reusing `CRON_SECRET`/`ADMIN_SECRET`) is the right convention | Code Examples / Pitfall 9 | Low — if the planner prefers reusing an existing secret, the token design still works; only the env var name changes. Recommend a dedicated secret so rotating one doesn't invalidate the other, but this is Claude's-discretion territory per CONTEXT.md, not a hard requirement. |
| A2 | `lia_versions` immutability should be enforced with a DB trigger rather than app-level-only discipline | Pitfall 6 | Low-medium — CONTEXT.md says "immutable files + a DB registry" but doesn't specify DB-level enforcement mechanics; a trigger is the interpretation that actually survives a careless future migration, but the planner could reasonably choose app-level-only if time-boxed. |
| A3 | `docs/legal/lia/LIA-v1.md` content can ship as a placeholder/skeleton this phase, since CONTEXT.md explicitly says content review runs on a parallel track and the mechanism must not wait | LIA artifact | Low — explicitly confirmed by CONTEXT.md `<domain>` section ("LIA legal content — counsel reviews... does not wait for review"). Flagging only because the plan must not accidentally block on counsel sign-off. |

**If this table is empty:** N/A — three low-risk assumptions logged above; none affect the phase's core schema/architecture decisions, which are all `[VERIFIED]` against the codebase.

## Open Questions

1. **Does the unsubscribe confirmation page need a real Next.js page component, or is an inline-HTML response from the route handler sufficient?**
   - What we know: D-01/D-03 require a domain-agnostic route with no hardcoded host, and a minimal bilingual confirmation with no CTA. The existing `next-intl` locale mechanism is cookie-based (`i18n/config.ts`, `LOCALE_COOKIE`), which doesn't apply to a cold, unauthenticated email-link visit — there's no cookie to read.
   - What's unclear: whether the planner prefers a `NextResponse` with inline HTML (simplest, matches ARCHITECTURE.md's `app/api/unsubscribe/[token]/route.ts` sketch, no `next-intl` involvement) or a proper `app/unsubscribe/[token]/page.tsx` (more idiomatic App Router, but then POST for RFC 8058 still needs a separate `route.ts`, splitting the write logic across two files).
   - Recommendation: inline-HTML `NextResponse` from a single `route.ts` handling both GET and POST — one file, one write path, no `next-intl` dependency for a two-line bilingual static message (D-01's own example: "Je bent uitgeschreven / You've been unsubscribed"). This is Claude's discretion per CONTEXT.md; flagging so the planner makes it a deliberate call rather than defaulting to whatever's fastest to type.

2. **Should `legal_regimes.spam_law_regime` use the three-value enum LEGAL.md's country-ranking table implies (`opt-out-narrow-exemption` / `opt-out-broad-corporate-exemption` / `opt-in-required`), or a freer text field?**
   - What we know: LEGAL.md §5 ranks NL as "narrow exemption," UK as having a "corporate-subscriber carve-out" (closer to broad exemption), and describes Germany as requiring prior consent in practice.
   - What's unclear: whether a `CHECK` constraint enum is worth the rigidity for a table that will only ever hold a handful of rows (one country at a time, NL first).
   - Recommendation: use a `CHECK (spam_law_regime IN (...))` constraint seeded with the three values LEGAL.md's own framing implies — matches the codebase's existing convention of `CHECK`-constrained enums on every other status/type column (`scans.type`, `email_events.status`, `prospects.lifecycle_state`).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CMP-01 | A suppression list in Supabase is the source of truth for who must not be contacted | `suppressions` table (migration 014), single source of truth, no other table mirrors it (D-07) |
| CMP-03 | Suppression matches on both email address and domain | Single `isSuppressed()` query checks `email = X OR domain = Y` (Code Examples) |
| CMP-04 | Unsubscribe endpoint writes synchronously before returning success, and is idempotent | Write-before-respond route handler + partial-unique-index check-then-write pattern (Pattern 1, Pattern 2) |
| CMP-05 | Unsubscribes take effect permanently and by the next send cycle, no delay language | No-expiry token (Pattern 3); D-01 confirmation copy has no "processing may take" language |
| CMP-06 | No code path can re-add a suppressed record without an explicit, logged manual override | Partial unique index blocks silent re-insertion while active; only `scripts/suppression-override.ts` can set `lifted_at` (D-08) |
| CMP-07 | Hard bounces and spam complaints automatically suppress, wired to the existing Resend event webhook | In-place extension of `app/api/webhooks/resend/route.ts` (Code Examples, Pitfall 2) |
| CMP-08 | A versioned Legitimate Interest Assessment lives in the repo, referenced by version | `docs/legal/lia/LIA-v1.md` + `lia_versions` registry table (migration 015, Pitfall 6) |
| CMP-16 | Legal-basis rules live in a per-country config table, never hardcoded NL logic | `legal_regimes` table, NL row seeded, `scripts/legal-basis.ts` reads it (Don't Hand-Roll) |
</phase_requirements>

## Runtime State Inventory

> This phase creates new tables and extends one existing route; it is not a rename/refactor/migration phase, so the full inventory protocol is not triggered. One item is genuinely relevant and is covered below rather than omitted silently.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (historical) | Existing `email_events` rows with `status IN ('bounced','complained')` from the live transactional flow (report-ready/follow-up/confirmation emails) predate this phase and are NOT yet reflected in any suppression mechanism | Data migration: `scripts/backfill-suppressions.ts` (D-06), a one-time Node script, run once after migration 014 is applied |
| Live service config | Resend account itself has no server-side suppression list Joshua controls beyond what this phase builds — Resend's own Suppressions API is explicitly a backstop only, never authoritative (ROADMAP.md phase notes) | None — no action needed against Resend's dashboard/API this phase |
| OS-registered state | None — no cron/task-scheduler registration needed; the backfill is a one-time manual script run, not a recurring job | None |
| Secrets/env vars | New: `UNSUBSCRIBE_TOKEN_SECRET` (does not exist yet) | Must be added to the deployment environment (Vercel) before the route can verify tokens; not a rename of an existing secret |
| Build artifacts | None — no compiled/installed package state affected | None |

## Common Pitfalls

*(see full pitfalls list above — six pitfalls documented with root cause, avoidance, and warning signs)*

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.10 (`[VERIFIED: package.json]`) |
| Config file | `vitest.config.ts` (node environment, `passWithNoTests: true`, `@/*` alias) |
| Quick run command | `npx vitest run <path/to/file>.test.ts` |
| Full suite command | `npx vitest run` |

Two existing test conventions to follow exactly (both verified in the current codebase):
- **Unit tests** (`*.test.ts`): dependency-injection stubs, no real DB — see `scripts/import-prospects.test.ts`'s `ImportDeps` seam and `vi.fn()` stubs.
- **Integration tests** (`*.integration.test.ts`): run against a real local Supabase instance (`supabase start && supabase db reset`), using the published local-only demo service-role JWT hardcoded at the top of the file — see `lib/prospect-upsert.integration.test.ts:6-27`. Cleanup via `afterEach` scoped delete (that file uses a `campaign_tag` marker; this phase's suppression tests should use a distinctive test-only email/domain prefix for the same scoped-cleanup purpose).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CMP-01/03 | `isSuppressed()` matches exact email AND matches any address on a suppressed domain (the "suppression-blocks-entire-domain" property) | unit | `npx vitest run lib/suppression.test.ts -t "domain"` | ❌ Wave 0 |
| CMP-04 | Calling the unsubscribe write path twice for the same email both succeed, and only one active row exists afterward (idempotent double-unsubscribe property) | integration | `npx vitest run lib/suppression.integration.test.ts -t "idempotent"` | ❌ Wave 0 |
| CMP-05 | A freshly-lifted-then-re-suppressed email is blocked by the new row, not the lifted one | integration | `npx vitest run lib/suppression.integration.test.ts -t "re-suppression"` | ❌ Wave 0 |
| CMP-06 | Direct insert of a duplicate active row for an already-suppressed, non-lifted email fails at the DB (partial unique index) or is treated as a no-op by `writeSuppression()`, never silently creating a second active row | integration | `npx vitest run lib/suppression.integration.test.ts -t "no re-add"` | ❌ Wave 0 |
| CMP-07 | Simulated `email.bounced` / `email.complained` Svix-verified payload results in a new active `suppressions` row with the correct domain | integration | `npx vitest run app/api/webhooks/resend/route.integration.test.ts -t "auto-suppress"` | ❌ Wave 0 |
| CMP-07 (backfill) | Running `backfill-suppressions.ts` against a fixture set of pre-existing `bounced`/`complained` `email_events` rows produces one active suppression row per distinct email, domain correctly normalised | integration | `npx vitest run scripts/backfill-suppressions.test.ts` | ❌ Wave 0 |
| CMP-08/16 | `scripts/legal-basis.ts` resolves an NL-country prospect fixture to the seeded `legal_regimes` row and the current `lia_versions` row | integration | `npx vitest run scripts/legal-basis.test.ts` | ❌ Wave 0 |
| CMP-08 (immutability) | Attempting to `UPDATE` an existing `lia_versions` row raises a DB error (immutable-LIA-versioning property) | integration | `npx vitest run supabase/migrations/015.integration.test.ts -t "immutable"` | ❌ Wave 0 |
| CMP-04 (token) | `verifyUnsubscribeToken` rejects a tampered signature, rejects a malformed token, and round-trips a valid `signUnsubscribeToken` output | unit | `npx vitest run lib/unsubscribe-token.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the quick-run command scoped to the file(s) the task touched.
- **Per wave merge:** `npx vitest run` (full suite).
- **Phase gate:** full suite green, plus a manual local click-test of `/api/unsubscribe/[token]` (GET renders confirmation, POST returns 200 empty) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `lib/suppression.test.ts` — unit coverage for `isSuppressed()` domain-matching logic (DI-stubbed, no DB)
- [ ] `lib/suppression.integration.test.ts` — idempotency, re-suppression, no-re-add-without-override properties (real local Supabase, migrations 014-015 applied)
- [ ] `lib/unsubscribe-token.test.ts` — HMAC sign/verify round-trip + tamper rejection (pure unit, no DB)
- [ ] `app/api/webhooks/resend/route.integration.test.ts` — auto-suppression on bounced/complained events (extends whatever test coverage, if any, currently exists for this route — none was found in the current codebase, so this is new coverage, not just an addition)
- [ ] `scripts/backfill-suppressions.test.ts`, `scripts/suppression-override.test.ts`, `scripts/legal-basis.test.ts` — CLI script tests, DI-seam pattern per `scripts/import-prospects.test.ts`
- [ ] `supabase/migrations/015.integration.test.ts` (or equivalent) — asserts the `lia_versions` immutability trigger actually raises on UPDATE
- [ ] Framework install: none — Vitest is already configured project-wide

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Single-tenant tool, no user auth model touched by this phase |
| V3 Session Management | No | Unsubscribe route is stateless, no session involved |
| V4 Access Control | Partial | CLI scripts (`suppression-override.ts`, `legal-basis.ts`) are operator-only by virtue of requiring shell access to the deploy environment — same posture as `scripts/import-prospects.ts`, no new access-control primitive needed |
| V5 Input Validation | Yes | Token format validation (`lib/unsubscribe-token.ts`), required-arg validation on CLI scripts (mirrors `parseImportArgs`'s fail-closed pattern), `CHECK` constraints on new enum columns |
| V6 Cryptography | Yes | HMAC-SHA256 via `node:crypto`, constant-time comparison via `timingSafeEqual` — never hand-roll signature comparison with `===` (timing side-channel) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Unsubscribe token forgery (attacker suppresses an arbitrary prospect) | Tampering | HMAC-SHA256 signature over the payload, verified with `timingSafeEqual`; secret never leaves the server (`UNSUBSCRIBE_TOKEN_SECRET`) |
| Timing side-channel on signature comparison | Information Disclosure | `crypto.timingSafeEqual`, not `===` or string comparison (Pattern 3 code example already uses this) |
| Email/PII leakage via URL (server logs, Referrer headers, link-preview crawlers) | Information Disclosure | Token encodes only a UUID `prospect_id`, never the raw email (Pattern 3, Anti-Pattern list) |
| Webhook forgery (fake bounce/complaint events triggering false suppression) | Spoofing | Already mitigated by existing Svix signature verification in `app/api/webhooks/resend/route.ts` — this phase adds logic strictly after verification succeeds, no new trust boundary introduced |
| Accidental mass-override via CLI script | Tampering / Repudiation | `suppression-override.ts` requires explicit required args (email + reason, no wildcard/bulk mode) and prints exactly what it did, mirroring `import-prospects.ts`'s fail-closed required-flag validation |
| RLS bypass / accidental anon read access to `suppressions` or `legal_regimes` | Information Disclosure | Follow the existing convention exactly: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with **no** policies defined — service-role bypasses RLS by default, anon gets zero access unless a policy is explicitly added (do not add one) |

## Sources

### Primary (HIGH confidence — verified directly against this codebase)
- `app/api/webhooks/resend/route.ts` — existing Resend webhook handler, Svix verification, event map, `email_id`-only payload
- `supabase/migrations/001_create_scans_and_leads.sql`, `003_features_v3.sql` — `email_events` schema, existing `plpgsql` function precedent
- `supabase/migrations/010_create_prospects.sql` through `013_add_prospect_id_to_scans.sql` — prospects schema, partial unique index precedent, RLS-enable-no-policy convention
- `lib/domain-normalize.ts`, `lib/domain-normalize.test.ts` — the registrable-domain normaliser to reuse
- `lib/supabase.ts` — `createServerClient()` / `createBrowserClient()`
- `lib/prospect-upsert.ts`, `lib/prospect-upsert.integration.test.ts` — check-then-write convention, integration test convention
- `scripts/import-prospects.ts`, `scripts/import-prospects.test.ts` — CLI script pattern, DI-seam unit test pattern
- `lib/email.ts` — existing email-sending pattern, `email_events` insert shape
- `lib/i18n-helpers.ts`, `i18n/config.ts` — confirms `next-intl` locale resolution is cookie-based (informs Open Question 1)
- `package.json` — confirmed no new dependency is needed
- `.planning/phases/02-compliance-spine/02-CONTEXT.md` — locked decisions D-01 through D-12
- `.planning/research/LEGAL.md` — Telecommunicatiewet/GDPR analysis underpinning CMP-08/16 and the LIA content requirements
- `.planning/research/ARCHITECTURE.md` — prior architecture draft (source of the `suppressions.email UNIQUE` conflict this research flags, and the `/api/unsubscribe/[token]` route sketch this research follows)

### Secondary (MEDIUM confidence)
- RFC 8058 / Gmail-Yahoo one-click unsubscribe requirements — WebSearch, cross-referenced across mailmodo.com and captaindns.com summaries (both consistent on the core requirement: HTTPS, no redirect, `List-Unsubscribe=One-Click` POST body)

### Tertiary (LOW confidence)
- None used as load-bearing claims in this research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every dependency already installed and verified against `package.json`; zero new packages
- Architecture: HIGH — schema and route design verified directly against existing migrations/routes; the one open design tension (partial unique index vs. D-09) was caught by reading the actual files, not assumed
- Pitfalls: HIGH — all six pitfalls are grounded in specific line-level codebase facts or explicit CONTEXT.md decisions, not speculative

**Research date:** 2026-07-19
**Valid until:** 2026-08-19 (30 days — stable domain, no fast-moving external dependency; re-check only if RFC 8058 / Gmail-Yahoo bulk-sender policy changes before Phase 8 implements the send side)
</content>
