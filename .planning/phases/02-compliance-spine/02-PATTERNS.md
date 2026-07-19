# Phase 2: Compliance Spine - Pattern Map

**Mapped:** 2026-07-19
**Files analyzed:** 15 (2 migrations, 2 lib modules, 1 route, 3 CLI scripts, 7 test files)
**Analogs found:** 15 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/014_create_suppressions.sql` | migration | CRUD | `supabase/migrations/010_create_prospects.sql` | exact (partial unique index) |
| `supabase/migrations/015_create_legal_basis.sql` | migration | CRUD | `supabase/migrations/010_create_prospects.sql` (+ migration 001 `plpgsql` trigger precedent) | role-match |
| `lib/suppression.ts` | service | CRUD | `lib/prospect-upsert.ts` | exact (check-then-write) |
| `lib/unsubscribe-token.ts` | utility | transform | none in-repo (stdlib-only, Pattern 3 in RESEARCH.md) | no analog |
| `app/api/unsubscribe/[token]/route.ts` | route | request-response | `app/api/webhooks/resend/route.ts` | role-match (route shape, not domain) |
| `app/api/webhooks/resend/route.ts` (EXTEND) | route | event-driven | itself (extend in place) | exact |
| `scripts/backfill-suppressions.ts` | utility (CLI, batch) | batch | `scripts/import-prospects.ts` | exact (CLI shape) |
| `scripts/suppression-override.ts` | utility (CLI) | CRUD | `scripts/import-prospects.ts` | exact |
| `scripts/legal-basis.ts` | utility (CLI) | request-response | `scripts/import-prospects.ts` | exact |
| `lib/suppression.test.ts` | test (unit) | — | `scripts/import-prospects.test.ts` | exact (DI-seam) |
| `lib/suppression.integration.test.ts` | test (integration) | — | `lib/prospect-upsert.integration.test.ts` | exact |
| `lib/unsubscribe-token.test.ts` | test (unit) | — | `lib/domain-normalize.test.ts` (pure-function unit test) | role-match |
| `app/api/webhooks/resend/route.integration.test.ts` | test (integration) | — | `lib/prospect-upsert.integration.test.ts` | role-match (new coverage) |
| `scripts/backfill-suppressions.test.ts`, `scripts/suppression-override.test.ts`, `scripts/legal-basis.test.ts` | test (unit) | — | `scripts/import-prospects.test.ts` | exact (DI-seam) |

## Pattern Assignments

### `supabase/migrations/014_create_suppressions.sql` (migration, CRUD)

**Analog:** `supabase/migrations/010_create_prospects.sql` (full file read, 43 lines)

**Partial unique index pattern** (lines 39-40, D-06 comment lines 36-38):
```sql
-- D-06: partial unique index — lets many NULL-domain no-website prospects
-- coexist while has-domain prospects stay unique on domain.
create unique index if not exists prospects_domain_unique_idx
  on prospects (domain) where domain is not null;
```
Apply to `suppressions` per RESEARCH.md Pattern 1 (email active-row uniqueness, D-09):
```sql
create unique index if not exists suppressions_email_active_idx
  on suppressions (email) where lifted_at is null;
```

**Table + check-constraint enum style** (lines 8-32):
```sql
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  domain text,
  ...
  lifecycle_state text not null default 'new'
    check (lifecycle_state in ('new', 'no_website', ...)),
  ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_prospects_lifecycle_state on prospects (lifecycle_state);
alter table prospects enable row level security;
```
Mirror this shape for `suppressions`: `id uuid pk default gen_random_uuid()`, `email text not null`, `domain text`, `reason text not null check (reason in ('bounced','complained','manual_override', ...))`, `source text not null`, `lifted_at timestamptz`, `lifted_by_reason text`, `created_at timestamptz not null default now()`. End with `alter table suppressions enable row level security;` and **no policy** (RLS-enable-no-policy convention — service-role only, per RESEARCH.md Security Domain).

**RLS convention:** `alter table ... enable row level security;` with zero `create policy` statements — verified in `010_create_prospects.sql:43` and reiterated in RESEARCH.md ("service-role bypasses RLS by default, anon gets zero access unless a policy is explicitly added — do not add one").

---

### `supabase/migrations/015_create_legal_basis.sql` (migration, CRUD)

**Analog:** `supabase/migrations/010_create_prospects.sql` (table/index/RLS shape) + migration 001's `plpgsql` function precedent (cited in RESEARCH.md for the immutability trigger, not re-read here — RESEARCH.md already quotes the precedent by name: `delete_expired_scans()`).

**Structure:** two tables, `lia_versions` (version, effective_from, content_hash, created_at) and `legal_regimes` (country_code pk-ish, spam_law_regime with `CHECK (spam_law_regime IN ('opt-out-narrow-exemption','opt-out-broad-corporate-exemption','opt-in-required'))` per RESEARCH.md Open Question 2, notes_url, current_lia_version fk to lia_versions). Follow the same `check (... in (...))` enum convention as `prospects.lifecycle_state` (line 24-27 above) for `spam_law_regime`.

**Immutability trigger (new pattern for this repo, RESEARCH.md Pitfall 6):**
```sql
create or replace function prevent_lia_versions_mutation()
returns trigger as $$
begin
  raise exception 'lia_versions rows are immutable; insert a new version instead';
end;
$$ language plpgsql;

create trigger lia_versions_no_update_delete
  before update or delete on lia_versions
  for each row execute function prevent_lia_versions_mutation();
```
Seed NL row: `insert into legal_regimes (country_code, spam_law_regime, notes_url, current_lia_version) values ('NL', 'opt-out-narrow-exemption', ..., 1);`

---

### `lib/suppression.ts` (service, CRUD)

**Analog:** `lib/prospect-upsert.ts` (full file structure read, lines 1-60+)

**Imports pattern** (lines 1-3):
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OverturePlaceRow } from "@/types/scanner";
import { isAggregatorDomain, normalizeDomain } from "./domain-normalize";
```
For `lib/suppression.ts`: `import type { SupabaseClient } from "@supabase/supabase-js"; import { normalizeDomain } from "@/lib/domain-normalize";`

**Check-then-write pattern** (lines 44-51, the exact convention this codebase uses everywhere instead of `.upsert({onConflict})`):
```typescript
const { data: existingSource, error: sourceLookupError } = await sb
  .from("prospect_sources")
  .select("prospect_id")
  .eq("overture_gers_id", place.gersId)
  .maybeSingle();
if (sourceLookupError) throw sourceLookupError;
```
RESEARCH.md's Code Examples section already gives the direct `lib/suppression.ts` application of this exact pattern (`isSuppressed`, `writeSuppression` check-then-insert) — implement verbatim as shown there, do not switch to `.upsert()`.

**Error handling:** every Supabase call destructures `{ data, error }` and throws immediately on `error` (`if (sourceLookupError) throw sourceLookupError;`) — no try/catch wrapper inside the lib function; the caller (route/script) handles the throw.

**Reuse, do not reimplement:** `normalizeDomain()` from `lib/domain-normalize.ts` (verified — `getDomain` from `tldts`, returns `string | null`, lowercased, never throws). `lib/suppression.ts` must import this, not write a second normaliser.

---

### `lib/unsubscribe-token.ts` (utility, transform)

**No in-repo analog** — RESEARCH.md's own Pattern 3 code block is the direct source (stdlib `node:crypto`, `createHmac` + `timingSafeEqual`). Implement as given in RESEARCH.md lines 186-217 verbatim; this is a pure-function module with no DB/Supabase dependency, consistent with this codebase's `lib/domain-normalize.ts` shape (pure exported functions, `export function`, explicit return types, no class).

---

### `app/api/unsubscribe/[token]/route.ts` (route, request-response)

**Analog:** `app/api/webhooks/resend/route.ts` (full file read, 71 lines) — closest existing route for shape/conventions (runtime export, NextResponse usage, error logging prefix), even though the domain differs (webhook vs. public unsubscribe link).

**Runtime + response conventions** (lines 5, 18-22, 65-70):
```typescript
export const runtime = "nodejs";
...
if (!webhookSecret) {
  console.error("[webhook/resend] RESEND_WEBHOOK_SECRET not configured");
  return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
}
...
} catch (error) {
  console.error("[webhook/resend] Webhook processing failed:", error);
  return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
}
```
Apply the same `[unsubscribe]` log-prefix convention and `NextResponse.json`/`NextResponse` (for HTML) response shape. GET renders bilingual inline-HTML confirmation (RESEARCH.md Open Question 1 recommendation: single `route.ts`, no `next-intl`, no separate `page.tsx`); POST is the RFC 8058 one-click branch — **must return a bare 2xx with no `NextResponse.redirect(...)`** (RESEARCH.md Pitfall 4).

**Env var guard pattern to mirror** (line 18-22 above): check `process.env.UNSUBSCRIBE_TOKEN_SECRET` presence and fail closed with 500 + console.error before doing any work — same shape as the existing `webhookSecret` guard.

---

### `app/api/webhooks/resend/route.ts` (EXTEND in place, event-driven)

**This is the analog for itself** — do not create a second route. Extend the existing `.update()` call to read back the recipient email and call `writeSuppression()`.

**Current update call to extend** (lines 55-63, verified exact text in this repo):
```typescript
const supabase = createServerClient();
const { error } = await supabase
  .from("email_events")
  .update({
    status: newStatus,
    updated_at: new Date().toISOString(),
  })
  .eq("resend_email_id", resendEmailId);

if (error) {
  console.error("[webhook/resend] Failed to update email event:", error);
}
```
**Change required:** add `.select("email")` + `.maybeSingle()` to read the recipient back (payload only carries `email_id`, confirmed at line 44: `const resendEmailId = payload.data?.email_id;` — Pitfall 2 is real and verified), then branch on `newStatus === "bounced" || newStatus === "complained"` and call `writeSuppression()`. RESEARCH.md's Code Examples section gives the exact extended block to use.

---

### `scripts/backfill-suppressions.ts`, `scripts/suppression-override.ts`, `scripts/legal-basis.ts` (CLI, batch / CRUD / request-response)

**Analog:** `scripts/import-prospects.ts` (lines 1-90 read directly)

**File header + usage-string convention** (lines 1-29):
```typescript
/**
 * scripts/import-prospects.ts — the Prospect Radar importer (D-09: a plain
 * tsx-run script, NOT a Vercel route — bulk ... is the wrong shape for a
 * request/response function).
 *
 * Usage:
 *   npx tsx scripts/import-prospects.ts --country=NL --region=<region> ...
 * ...
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
...
const USAGE =
  "Usage: npx tsx scripts/import-prospects.ts --country=<ISO2> --region=<region> " +
  "--category=<category> [--dry-run] [--limit=N] [--campaign-tag=<tag>]";

export class ImportArgsError extends Error {}
```

**Fail-closed required-arg validation** (lines 43-70):
```typescript
export function parseImportArgs(argv: string[]): ImportArgs {
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        country: { type: "string" },
        ...
        "dry-run": { type: "boolean", default: false },
      },
      strict: true,
    });

    const missing: string[] = [];
    if (!values.country) missing.push("--country");
    ...
    if (missing.length > 0) {
      throw new ImportArgsError(`${USAGE}\n\nMissing required flag(s): ${missing.join(", ")}`);
    }
    ...
  }
}
```
Apply directly: `scripts/suppression-override.ts` requires `--email` + `--reason` (no wildcard/bulk mode, per RESEARCH.md's threat-pattern table); `scripts/legal-basis.ts` requires `<domain-or-email>` positional/`--email`; `scripts/backfill-suppressions.ts` takes no required args (queries all `bounced`/`complained` `email_events` rows, no `email_type` filter — Pitfall 5) but should still support `--dry-run` for symmetry.

**Export shape:** export `ImportArgsError`, a `parse*Args()` function, a `run*()` function taking a `Deps` object (DI seam), and a `runCli()` entry — this is what the test analog below stubs against.

---

### `lib/suppression.test.ts`, `scripts/backfill-suppressions.test.ts`, `scripts/suppression-override.test.ts`, `scripts/legal-basis.test.ts` (unit tests, DI-seam)

**Analog:** `scripts/import-prospects.test.ts` (lines 1-70 read directly)

**DI-seam stub pattern** (lines 1-33):
```typescript
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ImportArgsError,
  parseImportArgs,
  ...
  type ImportDeps,
} from "./import-prospects";

const fakeSupabase = {} as SupabaseClient;

function makeDeps(overrides?: Partial<ImportDeps>): ImportDeps {
  return {
    queryOverturePlaces: vi.fn(async () => []),
    upsertOverturePlace: vi.fn(async () => ({ prospectId: "fixture-id", created: true })),
    createServerClient: vi.fn(() => fakeSupabase),
    validateUrlSafe: vi.fn(async (url: string) => url),
    fetchReachability: vi.fn(async () => ({ ok: true, status: 200 })),
    ...overrides,
  };
}
```
Define an equivalent `SuppressionDeps` / `OverrideDeps` / `LegalBasisDeps` interface per file with `vi.fn()` stubs for every external call (`createServerClient`, the relevant `lib/suppression.ts` functions), no real DB. This is the seam `lib/suppression.ts` itself must expose functions compatible with (plain exported functions taking `sb: SupabaseClient` as first arg, per the `lib/prospect-upsert.ts` signature convention — easy to stub).

**Arg-validation test shape** (lines 40-47):
```typescript
describe("parseImportArgs", () => {
  it("rejects a run missing --country, --region, or --category", () => {
    expect(() => parseImportArgs(["--region=NH", "--category=cafe"])).toThrow(ImportArgsError);
    ...
  });
```

---

### `lib/suppression.integration.test.ts`, `app/api/webhooks/resend/route.integration.test.ts` (integration tests)

**Analog:** `lib/prospect-upsert.integration.test.ts` (lines 1-40 read directly)

**Full setup/teardown pattern:**
```typescript
/**
 * Integration suite for ... — asserted against a real Postgres with
 * migrations 010-013 applied.
 *
 * PRECONDITION: a local Supabase stack, NOT production:
 *   supabase start
 *   supabase db reset
 *   npx vitest run lib/prospect-upsert.integration.test.ts
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const CAMPAIGN_TAG = "test-01-03-integration";
let sb: SupabaseClient;

beforeAll(() => {
  sb = createServerClient();
});

afterEach(async () => {
  const { error } = await sb.from("prospects").delete().eq("campaign_tag", CAMPAIGN_TAG);
  if (error) throw error;
});
```
Apply verbatim, swapping `CAMPAIGN_TAG` for a distinctive test-only email/domain prefix (RESEARCH.md's own guidance: e.g. `TEST_EMAIL_PREFIX = "test-suppression-"`) and cleanup query for `.from("suppressions").delete().like("email", "test-suppression-%")`. The hardcoded local demo JWT is Supabase's published local-only default, safe to reuse verbatim (not a real secret) — confirmed by the comment in the analog file itself.

---

### `lib/unsubscribe-token.test.ts` (unit test, pure function)

**No exact analog file was fully re-read** (avoiding a duplicate read of `lib/domain-normalize.test.ts`, which is a straightforward Vitest `describe/it` pure-function suite matching the general project convention already demonstrated above). Structure: `describe("signUnsubscribeToken/verifyUnsubscribeToken")`, test round-trip (sign then verify returns original `prospectId`), test tamper rejection (flip one char of signature, expect `null`), test malformed-token rejection (no `.` separator, expect `null`). No DB, no `vi.fn()` needed — pure function unit tests per RESEARCH.md's Validation Architecture table.

## Shared Patterns

### Service-role Supabase client
**Source:** `lib/supabase.ts` (full file, 22 lines)
```typescript
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```
**Apply to:** every new lib function, route handler, and CLI script that touches `suppressions`, `lia_versions`, or `legal_regimes` — always `createServerClient()`, never `createBrowserClient()` (anon key gets zero access per the RLS-enable-no-policy convention).

### RLS-enable-no-policy convention
**Source:** `supabase/migrations/010_create_prospects.sql:43` — `alter table prospects enable row level security;` with no accompanying `create policy`.
**Apply to:** both new migrations (014, 015). Do not add any policy — service-role bypasses RLS by default; this is the deliberate, repo-wide posture (confirmed again in RESEARCH.md's Security Domain table).

### Registrable-domain normalisation
**Source:** `lib/domain-normalize.ts` — `normalizeDomain(input: string): string | null` (tldts-backed, lowercased, never throws on bad input).
**Apply to:** `lib/suppression.ts` (both `isSuppressed`/`writeSuppression` domain derivation) and `scripts/backfill-suppressions.ts` (per-row domain computation from `email_events.email`). Do not write a second normaliser — this is the exact "two normalisers drift" bug class RESEARCH.md and CONTEXT.md both flag.

### Check-then-write over `.upsert({onConflict})`
**Source:** `lib/prospect-upsert.ts:44-51` (`.select().maybeSingle()` then branch to insert/update).
**Apply to:** `lib/suppression.ts`'s `writeSuppression()` (idempotent no-op if an active row exists, per CMP-04) and `liftSuppression()` (select active row by email, then update `lifted_at`/`lifted_by_reason`).

### CLI script shape (usage string, `parseArgs`, required-flag validation, DI-seam export)
**Source:** `scripts/import-prospects.ts:1-90` + `scripts/import-prospects.test.ts:1-47`.
**Apply to:** all three new CLI scripts and their four corresponding test files.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/unsubscribe-token.ts` | utility | transform | No prior HMAC/token-signing code exists anywhere in this repo; RESEARCH.md's own Pattern 3 code block (stdlib `node:crypto`) is the source of truth, not a codebase analog — implement as specified there. |
| `docs/legal/lia/LIA-v1.md` | content artifact | file-I/O (static) | Not a code file; no code analog applies. Placeholder/skeleton content per CONTEXT.md (counsel finalizes later). |

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/`, `scripts/`, `app/api/webhooks/`, `app/api/` (route conventions)
**Files scanned directly (Read):** `supabase/migrations/010_create_prospects.sql` (full), `app/api/webhooks/resend/route.ts` (full), `lib/domain-normalize.ts` (full), `lib/prospect-upsert.ts` (lines 1-60), `lib/supabase.ts` (full), `scripts/import-prospects.ts` (lines 1-90), `scripts/import-prospects.test.ts` (lines 1-70), `lib/prospect-upsert.integration.test.ts` (lines 1-40)
**Pattern extraction date:** 2026-07-19
</content>
