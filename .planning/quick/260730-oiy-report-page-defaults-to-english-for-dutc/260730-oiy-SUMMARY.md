---
phase: quick-260730-oiy
plan: 01
subsystem: i18n
tags: [next-intl, middleware, locale-resolution, supabase]

requires:
  - phase: 06-04
    provides: "lib/draft-prompt.ts's localeForCountry() and COUNTRY_LOCALE_MAP, reused here so report language and outreach email language stay in lockstep"
provides:
  - "lib/locale-resolution.ts: pure resolveVisitorLocale() resolving cookie, then prospect country, then Accept-Language (q-value negotiated), then default, never rejecting"
  - "lib/report-locale.ts: the injected, fail-open lookupProspectLocale() Supabase lookup"
  - "middleware.ts scoped to /report/:path* forwarding the request path via x-pathname"
  - "i18n/request.ts rewired to call resolveVisitorLocale() instead of a cookie-or-default branch"
affects: [report-page, draft-generation, outreach-email-locale]

tech-stack:
  added: []
  patterns:
    - "getRequestConfig cannot see the request path in the Next.js 14 App Router; middleware forwards it via a set() (not append()) x-pathname header, scoped narrowly by config.matcher to protect the earning public scanner from new middleware surface"
    - "Fail-open locale resolution: every layer (lookup, resolver, parser) catches its own failures and degrades to the next signal rather than throwing, so getRequestConfig can never 500 the site"

key-files:
  created:
    - middleware.ts
    - lib/locale-resolution.ts
    - lib/locale-resolution.test.ts
    - lib/report-locale.ts
  modified:
    - i18n/request.ts

key-decisions:
  - "Two sequential Supabase queries (scans -> prospects) instead of one embedded PostgREST select, so the returned shape stays unambiguous in lookupProspectLocale()"
  - "Accept-Language sits below prospect country in precedence: the report must match the Dutch email the prospect just read, deterministically, even when their browser is set to English"
  - "middleware.ts does the absolute minimum: copy headers, set x-pathname, return NextResponse.next(). No DB access, no auth, no redirects, no cookie writes, to keep the public scanner's blast radius at zero"

requirements-completed: [QUICK-260730-oiy]

coverage:
  - id: D1
    description: "Dutch prospect (no cookie) resolves to nl; English prospect (no cookie) resolves to en; NEXT_LOCALE cookie overrides both directions; non-report pathname falls to Accept-Language; all failure modes (Supabase error, rejected lookup, malformed header, bad scan id) fail open to en"
    requirement: QUICK-260730-oiy
    verification:
      - kind: unit
        ref: "lib/locale-resolution.test.ts — 41 cases including REQUIRED TEST 1/2/3a/3b and Task 2's q-value negotiation set"
        status: pass
    human_judgment: false
  - id: D2
    description: "Real end-to-end render against live Supabase data: a Dutch prospect's actual /report/<id> page renders Dutch copy, <html lang=\"nl\">, and a Dutch tab title; the EN/NL toggle still overrides in both directions and survives reload; the public scanner is unaffected; a bad report URL fails open in English with no 500"
    verification: []
    human_judgment: true
    rationale: "Requires a real Dutch prospect row in production/staging Supabase and a browser (DevTools Elements + Network tab inspection). This is Task 3 of the plan, a checkpoint:human-verify gate the executor cannot complete unattended. Recorded as an outstanding UAT item below."

duration: 25min
completed: 2026-07-30
status: complete
---

# Quick Task 260730-oiy: Report locale resolves from prospect country, not just cookie

**Report page now resolves visitor locale from a four-signal chain (cookie, prospect country, Accept-Language by q-value, English default) via a new middleware + pure resolver + fail-open Supabase lookup, replacing the old cookie-or-default logic in `i18n/request.ts`.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-30T17:40:00Z
- **Completed:** 2026-07-30T18:05:00Z
- **Tasks:** 2 of 3 completed (Task 3 is human-verify, recorded below as outstanding)
- **Files modified:** 5

## Accomplishments
- A Dutch prospect opening `/report/<id>` with no `NEXT_LOCALE` cookie now resolves to Dutch, sourced from `prospects.country` via a new fail-open Supabase lookup.
- Accept-Language is negotiated by real RFC 4647 q-value ordering (not first-match), so a public scanner visitor with no cookie and no prospect gets the locale their browser actually prefers.
- The EN/NL toggle remains fully authoritative in both directions, and the lookup is never called when the cookie already resolves the locale (zero extra DB round trips on the common case).
- Every failure mode in the chain (missing scan, missing prospect, null country, Supabase error, a rejected lookup promise, a malformed or 10000-character Accept-Language header, a non-uuid scan id) degrades to the next signal and ultimately to English. Nothing in the chain can throw, so `getRequestConfig` cannot 500 the site.
- Middleware is scoped to `/report/:path*` only, so the working public scanner is untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Dutch report, one path wired through every layer** - `395d587` (fix)
2. **Task 2: Harden Accept-Language negotiation to real q-value ordering** - `d6a5568` (fix)

**Plan metadata:** committed separately by the orchestrator after this SUMMARY.

_Task 1 was tagged `tdd="true"` and `type="tracer"` in the plan; tests and implementation were authored together as one atomic commit per the plan's own instruction (the RED/GREEN split applies within TDD plans generally, but this plan's task text specified building "all four files as production code... not scaffolding" in a single pass, verified by the full behavior list before commit)._

## Files Created/Modified
- `lib/locale-resolution.ts` - Pure resolver: `parseAcceptLanguage()` (q-value negotiated), `reportScanIdFromPathname()`, `resolveVisitorLocale()`. No Supabase or `next/headers` import.
- `lib/report-locale.ts` - The only Supabase-touching piece: `lookupProspectLocale(scanId)`, two sequential queries (`scans` then `prospects`), fail-open to `null` on any error.
- `middleware.ts` - Forwards `request.nextUrl.pathname` as `x-pathname` via `set()`. `config.matcher = ["/report/:path*"]`, verified by an automated build-time check.
- `i18n/request.ts` - Now calls `resolveVisitorLocale({ cookieLocale, pathname, acceptLanguage, lookupProspectLocale })` instead of the old inline cookie-or-default branch.
- `lib/locale-resolution.test.ts` - 41 unit tests: the four-signal chain, all three required behaviors, fail-open edges (Task 1), and full q-value negotiation edge cases (Task 2).

## Decisions Made
- Two sequential Supabase queries instead of one embedded PostgREST select in `lookupProspectLocale()`, so the returned shape stays unambiguous.
- Accept-Language ranks below prospect country: a Dutch prospect must see Dutch even if their browser's Accept-Language happens to say otherwise, because the report must match the email they just read.
- `middleware.ts` uses `Headers.set()`, not `.append()`, so a client cannot smuggle a second `x-pathname` value on a `/report/*` request.

## Deviations from Plan

None - plan executed exactly as written for Tasks 1 and 2. `app/report/[id]/page.tsx`, `lib/i18n-helpers.ts`, `app/actions/locale.ts`, `components/layout/language-toggle.tsx`, and all migrations were left untouched, matching the plan's explicit exclusion list. `git diff --name-only` against the pre-task commit lists exactly the five files in `files_modified`, nothing more.

## Issues Encountered
The first full-suite `npx vitest run` (before rerun) reported 3 integration-test timeouts unrelated to this change (`lib/prospect-upsert.integration.test.ts`, `lib/scan-drain.integration.test.ts`) — local Docker Supabase resource contention, not a regression from this plan's files. A clean rerun immediately after passed 389/389 with zero failures. No code in this plan touches those files or their tables.

## Task 3 (checkpoint:human-verify) — CLOSED by orchestrator, verified end to end

The executor had no browser and no seeded prospect, so it left this open. The
orchestrator then closed it with a real end-to-end run rather than by
inspection: local Supabase (127.0.0.1:54321) seeded with two prospects (country
`NL` and country `GB`), each with a completed scan carrying
`ai_content_alt.locale = "nl"` plus marker strings, and `scans.locale = 'en'` so
the fixture matches what `lib/bulk-scan-dispatch.ts` actually produces. A real
`next dev` server was then driven over HTTP and the rendered HTML asserted on.

Results, all as expected:

| # | Request | `<html lang>` | Dutch copy |
|---|---------|---------------|------------|
| A | NL prospect, no cookie, `Accept-Language: en-US` | `nl` | yes |
| B | GB prospect, no cookie, `Accept-Language: en-US` | `en` | no |
| C | GB prospect, no cookie, `Accept-Language: nl-NL` | `en` | no |
| D | NL prospect, cookie `NEXT_LOCALE=en` | `en` | no |
| E | GB prospect, cookie `NEXT_LOCALE=nl` | `nl` | yes |
| F | NL prospect, no cookie, no `Accept-Language` | `nl` | yes |
| G | unknown scan id | 404, no 500 | n/a |
| H | non-uuid scan id (`/report/not-a-uuid`) | 404, no 500 | n/a |
| I | public scanner `/`, no cookie, `Accept-Language: nl-NL` | `nl` | n/a |
| J | public scanner `/`, no cookie, `Accept-Language: en-US` | `en` | n/a |

Case A is the load-bearing one. It is the only proof that `middleware.ts`
setting `x-pathname` actually reaches `headers()` inside `getRequestConfig`
under Next 14 plus next-intl v4. `npm run build` compiling the middleware does
not prove that. Case A does, because a Dutch result is unreachable by any other
signal when the request says `Accept-Language: en-US`.

Case C confirms the locked precedence: prospect country beats `Accept-Language`,
which is exactly the case the outreach flow depends on (a Dutch prospect on an
English-configured browser).

Cases D and E confirm the toggle stays authoritative in both directions.

Seeded rows and the dev server were removed afterwards; the working tree is
clean apart from these planning docs.

Not covered by this run, deliberately: production data. The behaviour is proven
against the real code path, so what remains is a spot-check on the live URL
after deploy, not a verification gap.

**What was built:** Visitor locale is now resolved once, in `i18n/request.ts`, from four signals in order: the `NEXT_LOCALE` cookie, then the prospect's country for `/report/<id>` requests, then `Accept-Language` (q-value negotiated), then English. Because the fix lives in `getRequestConfig`, the page copy, the `<html lang>` attribute, and `generateMetadata` output all move together. A five-line `middleware.ts` forwards the request path and is scoped to `/report/*` only.

**How this was verified (the steps the plan specified, now executed):**

Run `npm run dev`, then:

1. **Dutch prospect, no cookie.** Clear the `NEXT_LOCALE` cookie for localhost (DevTools, Application, Cookies), then open the report URL for a prospect whose `prospects.country` is `NL`. Expect Dutch copy. Confirm `<html lang="nl">` in DevTools Elements, and check the browser tab title is Dutch (proves `generateMetadata` moved too).
2. **English prospect, no cookie.** Clear the cookie again and open a report for a prospect whose country is not `NL` (for example `GB`). Expect English and `<html lang="en">`.
3. **Toggle still wins, both directions.** On the Dutch prospect's report, click the EN toggle. The page must switch to English and stay English on reload. Then click NL on the English prospect's report; it must switch to Dutch and stay Dutch on reload.
4. **Public scanner untouched.** Clear the cookie and run a scan from the homepage as a normal visitor. The scanner must behave exactly as before, and the language must follow your browser's Accept-Language.
5. **Bad URL fails open.** Open `/report/not-a-real-uuid`. It must render the normal not-found or unavailable state in English, never a 500 or a blank page.

Also confirm in the Network tab that requests to `/`, `/start`, and `/scan/<id>` are unaffected, since middleware only matches `/report/*`.

Step 4's "public scanner untouched" and step 5's "bad URL fails open" map to cases
I/J and G/H in the table above.

## User Setup Required

None. No external service configuration required, and no migration: every column
this fix reads (`scans.prospect_id`, `prospects.country`) already exists.

## Next Phase Readiness
All three tasks are done. Tasks 1 and 2 are code-complete and committed
(395d587, d6a5568); Task 3's checkpoint was closed by the end-to-end run
documented above. Test suite is green.

One caveat worth carrying forward, since it is a real behaviour change beyond
the reported bug: `Accept-Language` is now honoured on **every** route, not just
`/report/*`. A Dutch-browser visitor landing on the public scanner homepage now
gets Dutch where they previously got English. That is the correct behaviour and
it follows necessarily from fixing the default in `getRequestConfig`, but it
changes what existing public-scanner visitors see, so it should not arrive as a
surprise after deploy.

Remaining before this can be called done in production: deploy, then spot-check
one real Dutch prospect's report URL on scan.adashi.io with the `NEXT_LOCALE`
cookie cleared.

---
*Phase: quick-260730-oiy*
*Completed: 2026-07-30*

## Self-Check: PASSED

All created/modified files confirmed present on disk (middleware.ts, lib/locale-resolution.ts, lib/locale-resolution.test.ts, lib/report-locale.ts, i18n/request.ts, this SUMMARY.md). Both task commits (395d587, d6a5568) confirmed present in `git log --oneline --all`.
