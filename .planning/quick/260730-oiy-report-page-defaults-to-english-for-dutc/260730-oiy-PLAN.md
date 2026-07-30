---
phase: quick-260730-oiy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - middleware.ts
  - lib/locale-resolution.ts
  - lib/locale-resolution.test.ts
  - lib/report-locale.ts
  - i18n/request.ts
autonomous: false
requirements: [QUICK-260730-oiy]
user_setup: []

must_haves:
  truths:
    - "A Dutch prospect (prospects.country = 'NL') opening /report/<id> with no NEXT_LOCALE cookie sees Dutch copy, and the document renders <html lang=\"nl\">."
    - "A non-Dutch prospect (country not in COUNTRY_LOCALE_MAP) opening /report/<id> with no cookie still sees English."
    - "The EN/NL toggle stays authoritative: a NEXT_LOCALE cookie overrides the prospect country in both directions."
    - "A public scanner visitor with no cookie and no prospect gets their Accept-Language locale, falling back to English."
    - "No request path can make getRequestConfig throw: a Supabase failure, a missing scan, a null prospect_id, or a malformed header degrades to the next signal and ultimately to 'en'."
    - "Middleware runs only on /report/*; every other route on the public scanner is untouched."
  artifacts:
    - middleware.ts
    - lib/locale-resolution.ts
    - lib/locale-resolution.test.ts
    - lib/report-locale.ts
  key_links:
    - "middleware.ts sets x-pathname -> i18n/request.ts reads it via headers() -> reportScanIdFromPathname() extracts the scan id."
    - "lib/report-locale.ts lookupProspectLocale() is injected into resolveVisitorLocale(), so the resolver stays Supabase-free and unit-testable."
    - "lib/report-locale.ts reuses localeForCountry() from lib/draft-prompt.ts, which is what keeps the report language and the outreach email language in lockstep."
    - "i18n/request.ts is the single resolution point, so page copy, <html lang>, and generateMetadata all move together."
---

<objective>
Fix the public scan report defaulting to English for Dutch prospects.

`i18n/request.ts` currently resolves locale from the `NEXT_LOCALE` cookie only,
falling back to `defaultLocale` ("en"). Every symptom (English report copy,
`<html lang="en">`, English metadata) traces to that one resolution. This plan
replaces it with a four-signal chain (cookie, then prospect country, then
Accept-Language, then "en"), extracted into a pure module so the required
behaviours are covered by plain unit tests with no Supabase dependency.

Purpose: a Dutch prospect who just read a Dutch outreach email must land on a
Dutch report. Today the report contradicts the email, which is exactly the open
follow-up recorded in `.planning/STATE.md` line 181.

Output: a scoped `middleware.ts`, a pure `lib/locale-resolution.ts` with its
test file, a fail-open `lib/report-locale.ts` Supabase lookup, and a rewired
`i18n/request.ts`.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md

@i18n/request.ts
@i18n/config.ts
@lib/draft-prompt.ts
@lib/supabase.ts
@lib/triage-eligibility.test.ts
@vitest.config.ts
</context>

<verified_facts>
Do not re-derive these. They were traced end to end before planning.

- `i18n/request.ts` is 14 lines and reads only the `NEXT_LOCALE` cookie. It is
  registered through `createNextIntlPlugin("./i18n/request.ts")` in
  `next.config.mjs`. It already calls `cookies()`, so every route in this app is
  already dynamically rendered; adding `headers()` changes nothing about
  rendering strategy.
- `i18n/config.ts` exports `locales` (`["en", "nl"]`), `type Locale`,
  `defaultLocale` ("en"), `LOCALE_COOKIE` ("NEXT_LOCALE"), and `isLocale()`.
- `lib/draft-prompt.ts` line 33 exports `type Locale = "en" | "nl"`, line 42
  exports `COUNTRY_LOCALE_MAP: Record<string, Locale>` (`{ NL: "nl" }`), and
  line 47 exports `localeForCountry(country: string | null | undefined): Locale`
  which upper-cases and falls back to `"en"`.
- `lib/supabase.ts` line 5 exports `createServerClient()`.
- `app/report/[id]/page.tsx` line 112 calls `await getLocale()` and line 113
  feeds it to `pickLocalizedScan()`. That file needs NO change.
- `lib/i18n-helpers.ts` (`pickLocalizedScan`, `applyIssuesAlt`) is correct as
  written. Do NOT touch it.
- `scans.prospect_id uuid REFERENCES prospects(id)` exists (migration 013).
  `prospects.country text not null` exists (migration 010).
- `scans.locale` is ALWAYS 'en' for bulk prospect scans because
  `lib/bulk-scan-dispatch.ts` never sets it. It is not a usable signal. The
  Dutch content genuinely exists in `ai_content_alt` / `issues_alt`.
- No `middleware.ts` exists at the repo root today.
- `npm test` runs `vitest run`. Unit tests are `*.test.ts` colocated in `lib/`.
  Baseline is 348 passing.
</verified_facts>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: End-to-end Dutch report, one path wired through every layer</name>
  <files>middleware.ts, lib/locale-resolution.ts, lib/report-locale.ts, i18n/request.ts, lib/locale-resolution.test.ts</files>

  <read_first>
    i18n/request.ts, i18n/config.ts, lib/draft-prompt.ts (lines 30-50 for
    `Locale`, `COUNTRY_LOCALE_MAP`, `localeForCountry`), lib/supabase.ts,
    lib/triage-eligibility.test.ts (test file register and import style).
  </read_first>

  <behavior>
    Unit tests in `lib/locale-resolution.test.ts`, all against an injected
    `lookupProspectLocale`, no Supabase:

    - `reportScanIdFromPathname("/report/8f3a-uuid")` returns `"8f3a-uuid"`.
    - `reportScanIdFromPathname` returns null for `"/report"`, `"/reports/x"`,
      `"/report/x/y"`, `""`, `null`, and `undefined`.
    - `reportScanIdFromPathname("/report/8f3a-uuid/")` returns `"8f3a-uuid"`
      (a trailing slash is the same page).
    - REQUIRED TEST 1: Dutch prospect. No cookie, pathname `/report/<id>`,
      lookup resolves `"nl"`. Result is `"nl"`.
    - REQUIRED TEST 2: English prospect. No cookie, pathname `/report/<id>`,
      lookup resolves `"en"` (that is what `localeForCountry("GB")` returns).
      Result is `"en"`.
    - REQUIRED TEST 3a: toggle wins over a Dutch prospect. `cookieLocale: "en"`,
      lookup resolves `"nl"`. Result is `"en"`, and the lookup is never called.
    - REQUIRED TEST 3b: toggle wins over an English prospect.
      `cookieLocale: "nl"`, lookup resolves `"en"`. Result is `"nl"`.
    - A garbage cookie value (`"de"`, `""`, `undefined`) is ignored and the
      chain continues rather than short-circuiting.
    - No cookie, non-report pathname (`/scan/abc`), `acceptLanguage: "nl-NL"`.
      Result is `"nl"` and the lookup is never called.
    - No cookie, no pathname, no Accept-Language. Result is `"en"`.
    - Fail open: lookup returns null. Result falls through to Accept-Language,
      then `"en"`.
    - Fail open: lookup REJECTS with an Error. `resolveVisitorLocale` resolves
      to the next signal and does not reject.
  </behavior>

  <action>
Wire ONE path end to end: a Dutch prospect's `/report/<id>` request resolves to
`nl` through middleware, `getRequestConfig`, the pure resolver, and a real
Supabase lookup. Build all four files as production code, not scaffolding.

**1. `lib/locale-resolution.ts`** (new, pure, no Supabase import, no
`next/headers` import). Give it a header comment in the register used by
`lib/draft-generator.ts`: state that it is the single place visitor locale is
decided, give the precedence order and the reason prospect country outranks
Accept-Language (the report must match the Dutch email the prospect just read,
deterministically, even when their browser is set to English), and state that
nothing here throws. Export, with explicit return types:

  - `parseAcceptLanguage(header: string | null | undefined): Locale | null`.
    Split on commas, strip any `;q=` suffix, lower-case, take the base tag
    before any `-` so `nl-NL` matches `nl`, skip `*`, and return the first tag
    present in `locales` from `@/i18n/config`. Return null for null, empty,
    or unparseable input. Never throw. Full q-value ordering is Task 2.
  - `reportScanIdFromPathname(pathname: string | null | undefined): string | null`.
    Match `/report/<segment>` with an optional single trailing slash and
    nothing after it. Return the decoded segment, or null. Must not match
    `/reports`, `/report`, or `/report/<id>/anything`.
  - `resolveVisitorLocale(input): Promise<Locale>` taking
    `{ cookieLocale?: string | null; pathname?: string | null;
    acceptLanguage?: string | null;
    lookupProspectLocale: (scanId: string) => Promise<Locale | null> }`.
    Order, first hit wins: (a) `cookieLocale` when `isLocale()` accepts it;
    (b) `reportScanIdFromPathname(pathname)` non-null, then
    `await lookupProspectLocale(scanId)` wrapped in try/catch so a rejection
    degrades instead of propagating; (c) `parseAcceptLanguage(acceptLanguage)`;
    (d) `defaultLocale`. Short-circuit before the lookup when the cookie wins,
    so the toggle costs zero DB round trips.

Import `Locale`, `locales`, `isLocale`, and `defaultLocale` from
`@/i18n/config`. Do NOT declare a third `Locale` union. Add a short comment
noting that `lib/draft-prompt.ts` declares a structurally identical `Locale`
and that the two staying identical is what keeps report language and email
language aligned.

**2. `lib/report-locale.ts`** (new, the only Supabase-touching piece). Export
`lookupProspectLocale(scanId: string): Promise<Locale | null>`. Header comment
explains it is the injected dependency for the resolver and that it never
throws to its caller, matching the `lib/draft-generator.ts` convention. Body,
entirely inside one try/catch that returns null on any throw:

  - `const supabase = createServerClient()` from `@/lib/supabase`.
  - Query one: `scans` select `prospect_id` where `id` equals `scanId`,
    `.maybeSingle()`. On error, no row, or a null `prospect_id`, return null.
  - Query two: `prospects` select `country` where `id` equals that
    `prospect_id`, `.maybeSingle()`. On error, no row, or a null `country`,
    return null.
  - Return `localeForCountry(country)` from `@/lib/draft-prompt`.

Use two sequential queries rather than a PostgREST embedded select, so the
returned shape is unambiguous. Note in a comment that a non-uuid `scanId` from
a hand-typed URL makes Postgres error on the uuid comparison, which the catch
turns into null and therefore into the English fallback.

**3. `middleware.ts`** (new, repo root). `getRequestConfig` cannot see the
request path in the Next.js 14 App Router, so middleware forwards it. Keep it
to exactly this and nothing more: copy `request.headers` into a new `Headers`,
`set("x-pathname", request.nextUrl.pathname)`, and
`return NextResponse.next({ request: { headers } })`. No DB access, no auth, no
redirects, no cookie writes. Export
`export const config = { matcher: ["/report/:path*"] }`. The comment must say
why the matcher is narrow: the working public scanner earns revenue and must
not start passing through middleware. Use `set`, not `append`, so a client
cannot smuggle a second `x-pathname` on a report request. Do not reach for
`x-invoke-path` or `next-url`; those are undocumented internals.

**4. `i18n/request.ts`** (modify). Keep `getRequestConfig` and the dynamic
`messages` import exactly as they are. Add `headers` to the `next/headers`
import. Replace the inline cookie-or-default line with one
`await resolveVisitorLocale({ cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
pathname: headerList.get("x-pathname"),
acceptLanguage: headerList.get("accept-language"), lookupProspectLocale })`
call. Keep returning `{ locale, messages }`. Because `resolveVisitorLocale`
never rejects, this function cannot 500 the site.

**5. `lib/locale-resolution.test.ts`** (new). Cover every case in
`<behavior>`. Follow `lib/triage-eligibility.test.ts`: a comment header naming
what is and is not covered here, `import { describe, expect, it } from "vitest"`,
relative import of the module under test, `@/`-aliased imports for shared
types. Build the injected lookup with `vi.fn()` so the "never called" cases
assert on call count.

Do NOT change `app/report/[id]/page.tsx`, `lib/i18n-helpers.ts`,
`app/actions/locale.ts`, `components/layout/language-toggle.tsx`, or any
migration. Nothing here needs a schema change.
  </action>

  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx vitest run lib/locale-resolution.test.ts && npm run build && node -e "const s=require('fs').readFileSync('middleware.ts','utf8'); const m=s.match(/matcher:\s*\[([^\]]*)\]/); if(!m) throw new Error('no config.matcher found'); const e=m[1].split(',').map(x=>x.trim()).filter(Boolean); if(e.length!==1) throw new Error('matcher must have exactly one entry, got '+e.length); if(!e[0].includes('/report/')) throw new Error('matcher not scoped to /report: '+e[0]); console.log('OK: middleware matcher scoped to', e[0]);"</automated>
    <human-check>The automated gate proves the resolver logic, that the wiring compiles under `next build`, and that the middleware matcher is narrow. It does not prove the rendered page, because that needs a real Dutch prospect row in Supabase. Task 3 is the end-to-end proof.</human-check>
  </verify>

  <done>
`npx vitest run lib/locale-resolution.test.ts` passes with every case in
`<behavior>` green, including the three required behaviours and the fail-open
edges. `npm run build` succeeds. `middleware.ts` exports a `config.matcher`
with exactly one entry scoped to `/report/`. `i18n/request.ts` calls
`resolveVisitorLocale` and no longer contains an inline cookie-or-default
branch. `app/report/[id]/page.tsx` and `lib/i18n-helpers.ts` are unchanged in
`git diff`.
  </done>

  <reversibility rating="reversible">
Four self-contained files, one of them a five-line middleware scoped to a
single route prefix. Reverting is a single `git revert`, and the failure mode
if it is wrong is a page in the wrong language, not lost data.
  </reversibility>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Harden Accept-Language negotiation to real q-value ordering</name>
  <files>lib/locale-resolution.ts, lib/locale-resolution.test.ts</files>

  <read_first>
    lib/locale-resolution.ts as written by Task 1.
  </read_first>

  <behavior>
    Additional cases in `lib/locale-resolution.test.ts` for
    `parseAcceptLanguage`:

    - `"nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7"` returns `"nl"`.
    - `"en-US,en;q=0.9,nl;q=0.8"` returns `"en"`.
    - Out-of-order q-values: `"en;q=0.3,nl;q=0.9"` returns `"nl"`. Highest q
      wins regardless of position.
    - Explicit `q=1` beats an implicit default only when higher:
      `"nl;q=0.5,en"` returns `"en"` (a missing q defaults to 1.0).
    - Equal q-values break on document order: `"nl;q=0.8,en;q=0.8"` returns
      `"nl"`.
    - `q=0` means "not acceptable": `"nl;q=0,en;q=0.5"` returns `"en"`, and
      `"nl;q=0"` returns null.
    - Unsupported tags are skipped: `"de-DE,fr;q=0.9,nl;q=0.5"` returns `"nl"`.
    - `"de,fr"` returns null (caller then falls to `defaultLocale`).
    - Wildcard `"*"` is ignored, so `"*"` returns null.
    - Case-insensitive: `"NL-nl"` returns `"nl"`.
    - Malformed input never throws and returns null: `";;;"`, `"nl;q="`,
      `"nl;q=abc"`, `",,"`, `"   "`, a 10000-character junk string.
    - Whitespace tolerance: `" nl-NL , en ; q=0.8 "` returns `"nl"`.
  </behavior>

  <action>
Replace Task 1's first-match-wins `parseAcceptLanguage` body with proper
negotiation. Parse each comma-separated entry into `{ tag, q }`: split the
entry on `;`, take the first part as the tag, find a `q=` parameter and
`parseFloat` it, default `q` to 1.0 when absent, and treat a `NaN` or negative
q as 0. Lower-case and reduce the tag to its base subtag before the first `-`.
Drop `*`, empty tags, tags with `q <= 0`, and tags not in `locales`. Sort the
survivors by q descending using a stable comparison so equal q-values keep
document order (`Array.prototype.sort` is stable in Node 18). Return the first
survivor, or null when none remain. Wrap the parse in try/catch returning null
so no header can throw.

Keep the exported signature identical. `resolveVisitorLocale` and
`reportScanIdFromPathname` are unchanged; do not touch `lib/report-locale.ts`,
`middleware.ts`, or `i18n/request.ts` in this task.

Update the module header comment to state that Accept-Language is negotiated by
q-value and sits BELOW prospect country, with the one-line reason.
  </action>

  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && npx vitest run 2>&1 | tail -20</automated>
  </verify>

  <done>
`npx vitest run` reports zero failing tests across the whole suite. The
previously green 348 tests are all still green, and the file count now includes
`lib/locale-resolution.test.ts` with every case from Task 1 and Task 2. No
integration test was added, so the suite still passes without a local Supabase
running for the unit project.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Visitor locale is now resolved once, in `i18n/request.ts`, from four signals in
order: the `NEXT_LOCALE` cookie, then the prospect's country for `/report/<id>`
requests, then `Accept-Language`, then English. Because the fix lives in
`getRequestConfig`, the page copy, the `<html lang>` attribute, and the
`generateMetadata` output all move together. A five-line `middleware.ts`
forwards the request path and is scoped to `/report/*` only.
  </what-built>

  <how-to-verify>
Run `npm run dev`, then:

1. **Dutch prospect, no cookie.** Clear the `NEXT_LOCALE` cookie for
   localhost (DevTools, Application, Cookies), then open the report URL for a
   prospect whose `prospects.country` is `NL`. Expect Dutch copy. Confirm
   `<html lang="nl">` in DevTools Elements, and check the browser tab title is
   Dutch (that proves `generateMetadata` moved too).
2. **English prospect, no cookie.** Clear the cookie again and open a report
   for a prospect whose country is not `NL` (for example `GB`). Expect English
   and `<html lang="en">`.
3. **Toggle still wins, both directions.** On the Dutch prospect's report,
   click the EN toggle. The page must switch to English and stay English on
   reload. Then click NL on the English prospect's report; it must switch to
   Dutch and stay Dutch on reload.
4. **Public scanner untouched.** Clear the cookie and run a scan from the
   homepage as a normal visitor. The scanner must behave exactly as before,
   and the language must follow your browser's Accept-Language.
5. **Bad URL fails open.** Open `/report/not-a-real-uuid`. It must render the
   normal not-found or unavailable state in English, never a 500 or a blank
   page.

Also confirm in the Network tab that requests to `/`, `/start`, and
`/scan/<id>` are unaffected, since middleware only matches `/report/*`.
  </how-to-verify>

  <resume-signal>Type "approved" or describe what rendered wrong (URL, expected language, what you saw).</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> middleware | The visitor controls every request header, including a forged `x-pathname`. |
| URL path -> Supabase | The `/report/<id>` segment is attacker-controlled and reaches an `.eq()` filter. |
| getRequestConfig -> whole app | This function runs on every request. A throw here is a site-wide 500. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-oiy-01 | Spoofing | forged `x-pathname` on a non-`/report` route | low | accept | Middleware `set`s (not `append`s) the header, so on `/report/*` the real path always wins. On unmatched routes a forged header can only make the attacker's own page render in the other supported locale. No data is exposed: the lookup returns a locale string, never scan or prospect content. |
| T-oiy-02 | Information disclosure | `lookupProspectLocale` on a guessed scan id | low | accept | The function returns only `"en"`, `"nl"`, or null. A correct uuid guess reveals at most one bit about that prospect's country, and report URLs are already shared with prospects by design. |
| T-oiy-03 | Tampering | `scanId` from the URL into a PostgREST filter | low | mitigate | `.eq()` parameterises the value, so no injection. A non-uuid id makes Postgres error, which the try/catch converts to null and therefore to the English fallback. |
| T-oiy-04 | Denial of service | `getRequestConfig` throwing | high | mitigate | `resolveVisitorLocale` catches lookup rejections and `lookupProspectLocale` wraps its whole body in try/catch returning null. Every failure degrades down the chain to `"en"`. Task 1's fail-open tests are the gate. |
| T-oiy-05 | Denial of service | middleware widening the blast radius on the earning public scanner | medium | mitigate | `config.matcher` is pinned to `["/report/:path*"]` and asserted by a build-time check in Task 1's `<automated>` verify. Checkpoint step 4 confirms the scanner path behaves as before. |
| T-oiy-06 | Denial of service | oversized or malformed `Accept-Language` | low | mitigate | Task 2 parses inside try/catch with a bounded linear split, and a 10000-character junk header is an explicit test case. |
</threat_model>

<verification>
1. `npx vitest run` is green with zero failures, including the three required
   behaviours (Dutch prospect resolves `nl`, English prospect resolves `en`,
   the cookie overrides both directions) and the fail-open edges.
2. `npm run build` succeeds.
3. `middleware.ts` has exactly one `config.matcher` entry, scoped to `/report/`.
4. `git diff --name-only` lists only the five files in `files_modified`. In
   particular `app/report/[id]/page.tsx`, `lib/i18n-helpers.ts`, and
   `supabase/migrations/` are untouched.
5. The human checkpoint is approved.
</verification>

<success_criteria>
- A Dutch prospect's report renders Dutch, including `<html lang="nl">` and the
  page title, with no cookie set.
- A non-Dutch prospect's report still renders English.
- The EN/NL toggle overrides the prospect country in both directions and
  survives a reload.
- The public scanner is behaviourally unchanged and never passes through
  middleware.
- No schema change, no migration, no new integration test, and no regression
  against the 348-test baseline.
</success_criteria>

<commits>
Task 1: `fix(i18n): resolve report locale from prospect country, not just cookie`
Task 2: `fix(i18n): negotiate Accept-Language by q-value`
If Task 2's tests land separately: `test(i18n): cover Accept-Language edge cases`
</commits>

<output>
Create `.planning/quick/260730-oiy-report-page-defaults-to-english-for-dutc/260730-oiy-SUMMARY.md` when done.
</output>
