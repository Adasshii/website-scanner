# Phase 3: Triage & Shortlist - Research

**Researched:** 2026-07-20
**Domain:** Browserless HTTP triage (native `fetch()` + regex), Postgres worst-first ranking with a hard release ceiling
**Confidence:** HIGH (mechanics verified against this codebase's own existing patterns; no external libraries needed or recommended)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: Gate, then weighted score.** Unreachable OR no-HTTPS (served over plain HTTP) hard-gates a prospect straight to the top of the worst-first shortlist. The remaining signals — redirect-chain health, mobile-viewport presence, HTML page weight, response time — form a weighted score below the gate.
- **D-02: Store score + full signal breakdown.** `prospects.triage_score` (jsonb) holds the numeric score AND every raw signal (reachable, https, redirectChain, hasViewport, bytes, responseMs).
- **D-03: Cutoff is a default constant, previewable live in the shortlist.** A sane default lives in a constants block; the admin shortlist view takes a cutoff parameter. The release step accepts an explicit `--cutoff`. No new config table.
- **D-04: Hard ceiling ~= 20 full scans per run; target ~= 30% pass-rate.**
- **D-05: Overflow releases worst-N up to the ceiling.** The rest stay shortlisted and roll into the next run.
- **D-06: Ceiling is per release invocation, and released prospects never re-release.**
- **D-07: Eligibility is a pure query, not a state flip.** Triage writes only `triage_score` + `triage_checked_at`; it never touches `lifecycle_state`.
- **D-08: Release is the single state change; Phase 3 marks, Phase 4 queues.**
- **D-09: Re-triage overwrites for un-released prospects, skips released ones.**
- **D-10: Triage execution is a CLI script, run as `npm run triage`.** `scripts/triage-prospects.ts` follows the importer pattern (`--dry-run`, `--limit`, `--cutoff`, printed summary). Runs locally, off the production Vercel/Railway IP.
- **D-11: Release is triggered from the admin shortlist UI.**
- **D-12: Good-citizen fetch manners.** Truthful identifiable User-Agent, robots.txt check before homepage fetch, self-rate-limit (small concurrency + spacing). Reachability/HTTPS/redirect signals reuse `validateUrlSafe()` rather than a second fetch guard.

### Claude's Discretion

Exact signal weights within the weighted band, the "bad" threshold band values for page weight and response time, the `triage_score` jsonb key names, the release-marker column name (e.g. `scan_released_at`) and its migration (next number is `016`), the shortlist query/sort SQL, and the admin shortlist UI layout — all Claude's call as long as D-01…D-12 hold.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. The bulk scan queue, its concurrency control, and per-site scan rate-limiting are bounded OUT to Phase 4; contact extraction, draft generation, and send stay in their later owning phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRI-01 | Cheap triage pass, plain fetch, no Playwright/Lighthouse/AI | §Architecture Patterns — single-GET-per-scheme-attempt design; §Package Legitimacy Audit confirms zero new deps |
| TRI-02 | Records reachability | §Pattern 1 (redirect-chain capture) + §Error Taxonomy — DNS/connect/timeout/HTTP-status classification |
| TRI-03 | Records HTTPS availability + full redirect chain | §Pattern 1 + §HTTPS-availability rule |
| TRI-04 | Records mobile viewport meta presence | §Pattern 2 — viewport regex + failure modes |
| TRI-05 | Records HTML page weight + response time | §Pattern 3 (page weight) + §Pattern 4 (response time) |
| TRI-06 | Single triage score, ranks prospects | §Scorer design + §Validation Architecture (determinism/monotonicity tests) |
| TRI-07 | Admin shortlist ranked worst-first | §Shortlist query shape, §UI notes |
| TRI-08 | Configurable cutoff controls eligibility | §Cutoff & ceiling query |
| TRI-09 | Hard ceiling caps releases per run, independent of cutoff | §Ceiling query (atomic worst-N) + §Validation Architecture (ceiling-never-exceeded test) |
</phase_requirements>

## Summary

Triage is one server-side script (`scripts/triage-prospects.ts`, thin orchestrator) plus one pure-logic module (`lib/triage-scorer.ts` for scoring, `lib/triage-fetch.ts` for the network call) that follows exactly the split already established by `scripts/import-prospects.ts` + `lib/prospect-upsert.ts`. The whole signal set — reachability, HTTPS availability, the full redirect chain, page weight, response time — comes from **one GET request per prospect** with `redirect: "manual"` and a manual follow loop, because this codebase already has that exact pattern proven and working in `scanner-service/src/scanner.ts`'s `checkInternalLinks()` (lines 79–101). Triage does not need a second fetch primitive; it needs that same loop shape, pointed at the homepage instead of internal links, doing a GET instead of a HEAD so it can also read the body for weight and run the viewport regex.

One correction to CONTEXT.md's framing: `validateUrlSafe()` (`lib/url-validation.server.ts`) does **not** perform a fetch or follow redirects itself — it only validates URL format and resolves DNS to block private/reserved IPs (SSRF protection on the *starting* URL). D-12's "reuse `validateUrlSafe()`, not a second fetch guard" is satisfied by calling it once before the fetch loop starts, and — this is the one addition this research recommends beyond what D-12 states literally — re-running its IP-block check (or the DNS-resolve step inside it) against each redirect hop's `Location` before following it, because a compromised or malicious site's redirect chain is a real SSRF vector that the initial-URL-only check does not close. This still "reuses validateUrlSafe(), not a second guard" in spirit; it just calls the same function more than once.

The scorer is a small, pure, deterministic function operating on the signal object the fetch step produces — never a browser DOM, never `lib/scoring.ts` (that module operates on `PageResult[]` from a full scan and must stay untouched per CONTEXT.md's own warning). The ceiling and cutoff are enforced by one SQL shape: rank eligible (cutoff-passing OR gated) un-released prospects worst-first, `LIMIT` the ceiling, mark `scan_released_at`. At this project's scale (10–50/week, one human operator clicking Release), a single-statement Postgres RPC is not required for correctness — two sequential Supabase JS calls (SELECT the worst-N ids, then UPDATE...IN) are simpler, sufficient, and avoid inventing new SQL-function infrastructure for a solo-admin button click.

**Primary recommendation:** One GET-with-manual-redirect-follow per prospect (reusing the exact loop shape from `scanner-service/src/scanner.ts:79-101`), a hand-rolled bounded-concurrency batch loop (reusing the shape from `checkInternalLinks`'s `for (i += 5) Promise.all(batch)`, with an added inter-batch delay that the existing code lacks), a pure `computeTriageScore()` function with a gate-then-weighted-band design, and a two-step (SELECT worst-N, then UPDATE) release query — zero new npm dependencies anywhere in this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Redirect-chain fetch + reachability/HTTPS/weight/timing signals | Local script (`scripts/triage-prospects.ts`, Node CLI) | — | D-10 locks this off the production IP; no browser tier, no server-route tier involved |
| SSRF guard on starting URL + each redirect hop | Shared lib (`lib/url-validation.server.ts`, reused) | Local script (re-invoked per hop) | Existing function is server-only utility code, safe to call from a Node CLI script (it's not Next.js-route-bound) |
| Triage scoring (gate + weighted band) | Shared lib (`lib/triage-scorer.ts`, pure function) | — | Must be importable by both the script (compute) and any future admin preview endpoint (D-03 "previewable live") without duplicating logic |
| Storage of triage results | Database / Supabase (existing `prospects.triage_score` jsonb + `triage_checked_at`) | — | Columns already provisioned in migration 010; no new table |
| Shortlist display + cutoff slider | API / Backend (admin route, server component reading Supabase) | Browser (client component for the slider interaction) | D-07: eligibility is a live query, so the slider re-queries or re-filters client-side against already-fetched rows — no new mutation |
| Release action (worst-N + ceiling, mark `scan_released_at`) | API / Backend (new admin route, service-role write) | Database (the SELECT+UPDATE pair) | D-11 locks this to the admin UI, which must call a server route (service-role key never reaches the browser) |
| robots.txt check | Local script (same fetch pass as the homepage GET, same process) | — | D-12 scopes this to the triage script's own outbound fetch, not a separate service |

## Package Legitimacy Audit

No external packages are installed in this phase. Every mechanic below (redirect-chain following, robots.txt parsing, bounded concurrency, page-weight measurement) is hand-rolled from Node's native `fetch()`/`AbortController`/`ReadableStream` and plain string/regex parsing, matching D-12's "no new dependency" instruction and the roadmap's explicit rejection of jsdom/Cheerio. `package.json` (root) was checked directly — it carries `@duckdb/node-api`, `@supabase/supabase-js`, `next`, `next-intl`, `react`, `react-dom`, `resend`, `svix`, `tldts` and no HTTP client, no robots.txt parser, and no concurrency-limiter library. Nothing to audit; nothing to install.

**Packages removed due to [SLOP] verdict:** none — none proposed.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
scripts/triage-prospects.ts (CLI, npm run triage)
        │
        │ 1. parse --dry-run / --limit / --cutoff
        │ 2. loadLocalEnv() (mirrors import-prospects.ts)
        ▼
lib/triage-candidates.ts
   SELECT prospects WHERE domain IS NOT NULL
                       AND scan_released_at IS NULL     (D-09: released never re-triaged)
        │
        ▼  (bounded-concurrency batch loop, batch=5, delay between batches)
lib/triage-fetch.ts :: fetchTriageSignals(url)
        │
        ├─ validateUrlSafe(url)  ──throws──▶  gated=true, gateReason="blocked"/"unreachable"
        │
        ├─ robots.txt GET (same-process, 5s timeout)
        │        │
        │        └─ Disallow:/ for our UA or "*" ──▶ gated? NO — robotsBlocked=true, homepage GET skipped
        │
        ▼
   homepage GET, redirect:"manual", loop ≤8 hops
        │  each hop: re-run SSRF IP-check on Location before following
        │  final hop: read body via reader, cap at 5MB, count bytes, run viewport regex
        ▼
   { reachable, https, redirectChain[], hasViewport, bytes, responseMs, finalStatus, robotsBlocked }
        │
        ▼
lib/triage-scorer.ts :: computeTriageScore(signals) → { score, gated, gateReason, ...signals }
        │
        ▼
   sb.from("prospects").update({ triage_score, triage_checked_at }).eq("id", prospect.id)
        │
        ▼
   printed summary: "42 triaged, 13 clear the cutoff, 0 unreachable"

──────────────────────────────────────────────────────────────────

app/admin/prospects/shortlist (new admin view, extends app/admin/page.tsx pattern)
        │
        │ GET eligible/all prospects ORDER BY gated DESC, score ASC
        ▼
   shortlist table + cutoff slider (client-side re-filter, D-07 — no server round-trip per slide)
        │
        │ Joshua clicks "Release" with current cutoff value
        ▼
app/api/admin/release-prospects/route.ts (new, service-role)
        │
        │ SELECT worst-N eligible & un-released, ORDER BY gated DESC, score ASC, LIMIT ceiling
        │ UPDATE ... SET scan_released_at = now() WHERE id IN (worst-N ids)
        ▼
   scan_released_at set → Phase 4 drains this set (out of scope here)
```

### Recommended Project Structure

```
lib/
├── triage-fetch.ts          # fetchTriageSignals(url, deps) — the redirect-chain GET + robots.txt check
├── triage-scorer.ts         # computeTriageScore(signals) — pure, gate-then-weighted-band
├── triage-candidates.ts     # eligible-for-triage query (domain not null, not released)
├── triage-release.ts        # worst-N + ceiling query (select + update pair)
scripts/
├── triage-prospects.ts      # thin CLI orchestrator, mirrors import-prospects.ts
app/api/admin/
├── release-prospects/route.ts   # D-11: release action, service-role
app/admin/
├── prospects/shortlist/     # or a new tab on app/admin/page.tsx — UI-SPEC gate applies (roadmap "UI hint: yes")
supabase/migrations/
├── 016_add_scan_release_marker.sql
tests/fixtures/
├── triage-html.ts           # canned HTML strings (viewport variants), mirrors tests/fixtures/overture.ts
├── triage-responses.ts      # fake redirect-chain response sequences for the fetch DI seam
```

### Pattern 1: Redirect-chain capture with a single manual-redirect GET loop

**What:** Fetch the prospect's `website_url` (already has a scheme from Overture/import) with `redirect: "manual"`, and manually follow `Location` headers in a loop, recording each hop's URL and status. The **final** hop's scheme determines HTTPS availability; the full array is the redirect chain; the final hop's status/body/timing produce the remaining TRI-05 signals. This is one request sequence producing five of the nine TRI-0x signals.

**When to use:** Every prospect with a non-null `domain` that is not yet released.

**Why one pass, not two:** The naive approach — probe `https://{domain}` first, fall back to `http://{domain}` on failure — requires guessing a URL Overture didn't give you and doubles the request count for no signal gain. `prospects.website_url` already has the scheme the business actually advertises. Following redirects from *that* URL captures the real-world path a visitor's browser would take, including the extremely common `http://` → `https://` upgrade redirect, in one pass.

**Concrete pattern (adapted from the codebase's own proven redirect-follow loop):**

```typescript
// Source: adapted from scanner-service/src/scanner.ts checkInternalLinks()
// (lines 79-101), which already proves Node's native fetch exposes
// status + Location header under redirect:"manual" (no CORS opacity —
// that only applies to browser fetch, not Node's undici-backed fetch).
const MAX_HOPS = 8;
const HOP_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5MB cap — do not download a huge file

async function fetchTriageSignals(startUrl: string, deps: TriageDeps) {
  const chain: Array<{ url: string; status: number }> = [];
  let current = await deps.validateUrlSafe(startUrl); // SSRF gate on the STARTING url
  let finalStatus = 0;
  const t0 = performance.now();

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": TRIAGE_USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }
    chain.push({ url: current, status: res.status });
    finalStatus = res.status;

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      const next = new URL(loc, current).toString();
      // Close the redirect-hop SSRF gap: re-validate EVERY hop, not just
      // the starting URL (D-12 says "reuse validateUrlSafe(), not a
      // second guard" — this still reuses it, just per-hop).
      current = await deps.validateUrlSafe(next);
      continue;
    }

    // Final hop reached (non-redirect status). Read body here (Pattern 3)
    // and stop the loop.
    const ttfbMs = performance.now() - t0;
    const { bytes, truncated } = await readBodyCapped(res, MAX_BODY_BYTES);
    return { chain, finalStatus, reachable: true, https: new URL(current).protocol === "https:",
             responseMs: Math.round(ttfbMs), bytes, truncated, html: /* string, capped */ };
  }
  // MAX_HOPS exhausted without terminating — treat as unhealthy chain,
  // not a hard failure (still "reachable", just a redirect loop).
  return { chain, finalStatus, reachable: true, https: false, responseMs: null, bytes: null,
            truncated: false, redirectLoopDetected: true, html: "" };
}
```

**HTTPS-availability rule (concrete, for TRI-03 / D-01's gate):**
`httpsAvailable = new URL(finalHopUrl).protocol === "https:"`. This single rule correctly covers all four cases: an `https://` URL with no redirects (true), an `http://` URL that upgrades via redirect (true — the common, healthy case), an `http://` URL that never upgrades (false — the D-01 gate case), and an `https://` URL that somehow downgrades via redirect to `http://` (false — also a legitimate gate case; a real downgrade redirect is itself a red flag). Compute this from the same fetch pass; never issue a second request to check it.

**Failure modes / what to log:** `MAX_HOPS` exhausted (redirect loop) — record as `reachable: true, https: false` (never silently drop this prospect), since an endless redirect loop is itself a strong "neglected site" signal worth surfacing, not an error to swallow.

### Pattern 2: Mobile viewport meta detection

**What:** Case-insensitive regex over the raw HTML string already downloaded in Pattern 1's final hop — no second request.

**Recommended pattern:**
```typescript
// Matches a <meta> tag containing name="viewport" regardless of where
// that attribute sits relative to `content=`, handles single/double
// quotes and (rarely) unquoted values.
const VIEWPORT_RE = /<meta\s+(?:[^>]*?\s+)?name\s*=\s*(?:"viewport"|'viewport'|viewport\b)[^>]*>/i;
const hasViewport = VIEWPORT_RE.test(html);
```

**Known failure modes (document these for Joshua, don't try to fix all of them — presence-only check is what TRI-04 asks for):**
- **JS-injected viewport tags (SPA false negative):** A React/Vue/Next.js client-rendered site may inject the viewport meta tag via client-side JS after hydration; the raw server HTML this regex runs against won't contain it. This is an inherent no-browser blind spot, not a regex bug — a JS-heavy site could score "no viewport" here while actually being mobile-friendly once rendered. Acceptable for a triage pass (TRI-01 explicitly forbids a browser); worth a one-line comment in the scorer so a future reader isn't surprised.
- **Malformed/truncated HTML near the 5MB body cap:** if the body is truncated before the `<head>` closes (unlikely — `<meta viewport>` is almost always in the first few KB — but a pathological page could have a huge inline `<script>` before `<head>` ends), the regex could miss a present-but-late tag. Non-issue in practice; note it, don't engineer around it.
- **Content validity is NOT checked:** a `<meta name="viewport" content="">` (empty) or a nonsensical `content` value still matches — matches TRI-04's literal wording ("presence of a mobile viewport meta tag"), not "a *correct* viewport tag." Do not scope-creep into validating the `content` attribute's actual values.

### Pattern 3: Page weight = raw HTML body bytes, capped read

**What:** TRI-05's "page weight" is the byte size of the final hop's HTML *document* response body only — never sub-resources (CSS/JS/images), matching the phase's no-browser scope (a browser would need to load those; triage doesn't).

**`Content-Length` header — advisory only, not authoritative:** Servers using chunked transfer-encoding (very common, especially behind a CDN/reverse proxy) omit `Content-Length` entirely; when present alongside `Content-Encoding: gzip`/`br`, it reflects the *compressed* wire bytes, not decompressed size — which is actually the more relevant number for "how heavy is this page for a visitor" (it's what their connection actually downloads). Recommendation: read `Content-Length` if present as a fast first estimate, but always fall back to counting bytes from the body stream directly, since it's frequently absent.

**Capped stream-read pattern:**
```typescript
async function readBodyCapped(res: Response, capBytes: number) {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: 0, truncated: false, text: "" };
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > capBytes) {
      await reader.cancel(); // stop downloading — do not pull a 50MB file
      return { bytes: total, truncated: true, text: decodeChunks(chunks) };
    }
    chunks.push(value);
  }
  return { bytes: total, truncated: false, text: decodeChunks(chunks) };
}
```
A page that trips the cap already IS the signal ("this homepage is unusually heavy") — record `bytes: total-so-far, truncated: true` rather than treating it as a fetch failure. The scorer should treat `truncated: true` as at least as bad as the worst weight band.

### Pattern 4: Response time = TTFB, not full-download time

**What:** Measure `performance.now()` immediately before `fetch()` and again the instant the `fetch()` promise **resolves** (i.e. when headers arrive — this is Time To First Byte; the body read in Pattern 3 happens *after* this timestamp is taken, inside the same function, so it doesn't pollute the timing).

**Why TTFB and not total time:** Total time conflates two different signals TRI-05 already separates — page weight and response time. A large-but-fast-server page and a small-but-slow-server page should score differently on responsiveness; TTFB isolates "is the host/backend slow" from "is the page heavy," which matches having both as independent stored signals per D-02.

```typescript
const t0 = performance.now();
const res = await fetch(url, { redirect: "manual", signal: controller.signal });
const ttfbMs = performance.now() - t0; // headers received; body not yet read
```

### Pattern 5: robots.txt — homepage-only check, radically simplified parsing

**What:** D-12 requires checking robots.txt before fetching a homepage — this is a much narrower requirement than general crawler compliance, because triage only ever requests exactly one path: `/` (the homepage). That collapses "parse robots.txt" into a much smaller problem: **is there a `Disallow` rule under a group matching our User-Agent (or the wildcard `*` group) whose path is a prefix of `/`?** Per RFC 9309 §2.2.2 (verified via web search, current spec — see Sources), only the empty path or the literal `/` can be a prefix-match of `/` itself; any `Disallow: /admin` or similar does not affect the homepage. So the entire check reduces to: does the matching group contain `Disallow: /` (or `Disallow:` with empty value meaning nothing is disallowed) with no more-specific `Allow: /` overriding it (Allow beats Disallow at equal specificity, per RFC 9309 §2.2.2).

```typescript
async function isHomepageDisallowed(origin: string, userAgentToken: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return false; // 404/non-200 → fail-open, no restrictions
    const text = await res.text();
    return parseRobotsForRoot(text, userAgentToken); // pure, testable
  } catch {
    return false; // timeout/network error → fail-open (Pitfall 2 posture)
  }
}
```

**Fail-open vs fail-closed — recommendation: fail-open on ambiguity/errors, fail-closed only on an explicit root Disallow.** Fetch failure, timeout, 404, or malformed content → proceed with the homepage GET (fail-open). A parsed, well-formed `Disallow: /` under a matching group → skip the homepage GET, classify the prospect distinctly as `robotsBlocked: true` (not `unreachable` — Joshua should be able to tell "we chose not to fetch this one" apart from "the fetch failed"). This matches `PITFALLS.md`'s posture that robots.txt is "evidence of good-faith behavior," not a legal requirement to fail closed against ambiguity.

**Nothing in package.json already does this** — confirmed by direct read; hand-roll the single-path check above, no `robots-parser` install needed. This mirrors the existing `checkSiteFiles()` in `scanner-service/src/scanner.ts:14-43`, which already fetches `/robots.txt` with the same 5s-timeout pattern (though it only checks *existence*, not rules — triage's `isHomepageDisallowed` is new, small, and testable in isolation).

### Pattern 6: Reachability + error taxonomy

TRI-02's "reachable" must mean **"the server responded with any HTTP status,"** not **"responded 2xx."** A homepage that 500s or 404s still proves DNS+TCP+TLS all worked — that's a `reachable: true` with a bad `finalStatus`, and a strong pitch signal in its own right (worth storing in the jsonb even though not separately named in TRI-05, since D-02 asks for "every raw signal").

Node's native `fetch()` (undici) surfaces network-level failures as a rejected promise; classify by cause:

| Failure | How it surfaces | Classification |
|---|---|---|
| DNS resolution failure | `TypeError`, `err.cause?.code === "ENOTFOUND"` | `reachable: false`, `gateReason: "unreachable"` (dns-fail) |
| Connection refused | `err.cause?.code === "ECONNREFUSED"` | `reachable: false` (connect-refused) |
| Connection reset mid-request | `err.cause?.code === "ECONNRESET"` | `reachable: false` (reset) |
| AbortController fired (our timeout) | `err.name === "AbortError"` | `reachable: false` (timeout) |
| TLS/certificate failure on an `https://` hop | `err.cause?.code` like `CERT_HAS_EXPIRED`, `ERR_TLS_CERT_ALTNAME_INVALID`, `SELF_SIGNED_CERT_IN_CHAIN` | Treat as `https: false` for that hop; the chain loop naturally continues only if a redirect target changes scheme — a broken cert on the only URL means `reachable: false` unless import stored a separate http fallback URL (it doesn't) |
| Any HTTP status, 2xx–5xx | `fetch()` resolves normally, `res.ok` may be false | `reachable: true` regardless of status; store `finalStatus` |
| `validateUrlSafe()` throws (private IP, malformed, unresolvable) | `UrlValidationError` | `gated: true, gateReason: "blocked"` — never attempt the fetch |

All of the above route to the **same D-01 gate** at the scoring layer: `gated = !reachable || !httpsAvailable`. Do not create a third bucket for "blocked by SSRF guard" at the gate level — D-01 only names two gate conditions (unreachable, no-HTTPS); a `validateUrlSafe()` rejection is itself a form of "unreachable" from the outreach funnel's perspective (a business whose stored URL points somewhere triage refuses to fetch is, practically, unreachable) and should gate the same way. Preserve the finer-grained `gateReason` in the jsonb for debugging/audit, but do not add scoring branches for it.

### Pattern 7: Bounded concurrency + spacing (hand-rolled, no `p-limit`)

**What already exists that's close, and why it's not quite enough:** `scanner-service/src/scanner.ts:73-109` (`checkInternalLinks`) already has a `for (i += 5) { await Promise.all(batch.map(...)) }` batching loop — proven, working, in this exact codebase. But it has **zero delay between batches** — it limits *concurrency* (5 in flight at once) without *spacing* (a gap between waves). D-12 explicitly asks for both ("small concurrency + spacing"), so triage's version needs one addition the existing pattern doesn't have: an `await sleep(ms)` between batches.

Triage cannot import that function directly — it lives in `scanner-service/` (a separate deployable Express service on Railway), while triage runs as a root-level Node script. Reimplement the ~10-line loop shape in `lib/triage-fetch.ts`; it's small enough that duplicating the *pattern* (not the code) is correct, not a DRY violation worth a shared package for.

```typescript
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 500;

async function triageAll(prospects: Prospect[], deps: TriageDeps) {
  const results: TriageResult[] = [];
  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((p) => triageOne(p, deps)));
    results.push(...batchResults);
    if (i + BATCH_SIZE < prospects.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return results;
}
```
At 10–50 prospects/run and batch=5, this is 2–10 batches with a 500ms gap between them — the whole run finishes in well under a minute even with per-hop 5s timeouts on the unhappy path, and reads as a polite, spread-out crawl rather than a burst, consistent with Pitfall 2's blast-radius posture (even though this script runs off the production IP per D-10, the target sites still see a burst-vs-spread difference).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSRF protection on the starting URL | A new DNS-resolve + private-IP-block function | `validateUrlSafe()` (`lib/url-validation.server.ts`) — call it once per hop | D-12 explicit; it already exists, is tested, and duplicating it is the exact trap CONTEXT.md warns against for scoring |
| Registrable-domain extraction | Custom hostname parsing | `normalizeDomain()` (`lib/domain-normalize.ts`, `tldts`-backed) | Already the shared normaliser across import/suppression; triage should never re-derive a domain independently |
| Full scan scoring | Reusing `lib/scoring.ts`'s `aggregateScores()`/`buildSummary()` on triage signals | A new, separate `computeTriageScore()` in `lib/triage-scorer.ts` | `lib/scoring.ts` operates on `PageResult[]` from a browser scan; triage has no `PageResult`. CONTEXT.md flags this exact coupling trap explicitly |
| Full robots.txt parser (groups, wildcards, `$` anchors, sitemap directives) | A general-purpose robots.txt library or a hand-rolled full parser | The single-path (`/`) reduction in Pattern 5 | Triage only ever checks one path; a general parser is solving a problem this phase doesn't have |
| Concurrency limiting | `p-limit` or similar npm package | The hand-rolled batch loop in Pattern 7 (already proven in-codebase at `scanner-service/src/scanner.ts:73`) | 10–50 items/run does not justify a dependency; the existing pattern already does 90% of the work |

**Key insight:** Every "don't hand-roll" temptation in this phase (robots.txt, concurrency, SSRF, domain parsing) already has a correct, small, in-codebase answer. The phase's actual net-new code is small: one fetch-and-follow loop, one regex, one scorer function, one SQL shape.

## Common Pitfalls

### Pitfall 1: Treating the D-01 gate as "a very low score" instead of a real boolean short-circuit
**What goes wrong:** If `gated` is implemented by just subtracting a large penalty (e.g. -1000) from the weighted score instead of an explicit boolean sorted ahead of the numeric score, a sufficiently bizarre combination of weighted-band inputs could theoretically still outrank a gated prospect, or a future weight-tuning pass could silently erode the gate's dominance.
**Why it happens:** "Subtract a big number" feels like less code than "add a boolean and a two-key ORDER BY."
**How to avoid:** Store `gated: boolean` in the jsonb explicitly and sort `ORDER BY gated DESC, score ASC` (or equivalent in JS if sorting client-side) — never fold the gate into the numeric score. This is directly testable (see Validation Architecture) and matches CONTEXT.md's own wording: "cannot be diluted by a fast, light, otherwise-tidy plain-HTTP site."
**Warning signs:** A weight-tuning change to the non-gate signals changes gate ordering.

### Pitfall 2: Re-validating only the starting URL, not each redirect hop
**What goes wrong:** A compromised or adversarial site's redirect chain points at `169.254.169.254` (cloud metadata) or a private RFC1918 address on a later hop; `validateUrlSafe()` only ran on the original URL, so the manual-follow loop happily fetches the internal address.
**Why it happens:** D-12's wording ("reuse `validateUrlSafe()`... rather than a second fetch guard") reads as "call it once," and it's the natural first implementation.
**How to avoid:** Call `validateUrlSafe()` (or at minimum its private-IP-check logic) on every `Location` header before following it, as shown in Pattern 1. This still satisfies D-12 — same function, called per-hop rather than once.
**Warning signs:** A redirect chain fixture pointing at `http://169.254.169.254/` in a test would currently be followed without this fix.

### Pitfall 3: Upsert-ing triage results with a partial row and hitting `country NOT NULL`
**What goes wrong:** `prospects.country` is `NOT NULL` with no default (migration 010). A naive `sb.from("prospects").upsert([{ id, triage_score, triage_checked_at }])` builds a real `INSERT ... ON CONFLICT DO UPDATE` under the hood — Postgres validates the `INSERT` tuple's `NOT NULL` constraints *before* the conflict path runs, so an upsert omitting `country` fails even though the row already exists and the operation only intends to update two columns.
**Why it happens:** `upsert()` looks like the "efficient batch write" pattern and is tempting given item 9 of the additional context ("efficient service-role pattern").
**How to avoid:** Use `.update({ triage_score, triage_checked_at }).eq("id", prospect.id)` per prospect (never `.upsert()` for existing rows with columns you don't have to hand). At 10–50 rows/run this is fast enough that no batching optimization is needed — one `.update()` call per prospect, issued right after that prospect's fetch+score completes, mirrors `import-prospects.ts`'s existing per-row sequential loop with individual try/catch (skip-and-log, never abort the whole run on one bad row).
**Warning signs:** A triage run throws a `null value in column "country" violates not-null constraint` error the first time it touches a real row.

### Pitfall 4: Treating "response received with a 4xx/5xx status" as unreachable
**What goes wrong:** If `reachable` is computed from `res.ok` instead of "did `fetch()` resolve at all," a homepage that 500s (arguably the *most* pitch-worthy kind of neglected site — the server is up but broken) gets miscategorized as `unreachable`, which under D-01 still gates it to the top — so the practical scoring impact is small, but the *jsonb signal breakdown* (D-02's whole point — "the shortlist shows why a prospect ranks badly") becomes misleading: Joshua sees "unreachable" in the UI when the real story is "the site is up and broken."
**How to avoid:** `reachable = (fetch() resolved at all)`; store `finalStatus` separately; let a bad `finalStatus` feed the weighted score (or at minimum be visible in the jsonb) rather than collapsing it into the same signal as a DNS failure.
**Warning signs:** The shortlist shows "unreachable" for a domain that resolves fine in a browser.

### Pitfall 5: Ceiling enforcement done in application code with a fetch-then-loop instead of `LIMIT`
**What goes wrong:** Pulling *all* eligible prospects into JS, sorting them there, then `.slice(0, ceiling)` works but silently invites a future refactor to add filtering logic in JS that forgets to re-apply the ceiling, or to paginate the initial SELECT and lose ordering guarantees across pages.
**How to avoid:** Enforce the ceiling with a SQL `LIMIT` in the SELECT itself (see §Cutoff & ceiling query below), not a JS-side slice. The database, not application code, should be the thing that makes TRI-09 impossible to exceed — that's what "independent of TRI-08's cutoff" (Pitfall 4 in PITFALLS.md) is really asking for: even a maximally permissive cutoff that makes thousands of rows "eligible" cannot produce more than `LIMIT ceiling` released rows, because the database never returns more than that.

## Code Examples

### Cutoff & ceiling query (two-step, Supabase JS, no new Postgres function)

```typescript
// Source: this codebase's own migration/query conventions (010, 014) —
// prospects table + partial index pattern. No new deps.
// Step 1: select the worst-N ELIGIBLE, UN-RELEASED prospects.
// "Eligible" = gated (always eligible, D-01) OR score <= cutoff (D-03/TRI-08).
const { data: worstN } = await sb
  .from("prospects")
  .select("id, triage_score")
  .not("domain", "is", null)
  .not("triage_score", "is", null)
  .is("scan_released_at", null)                                    // D-06
  .or(`triage_score->>gated.eq.true,triage_score->>score.lte.${cutoff}`) // D-01 gate always eligible
  .order("triage_score->>gated", { ascending: false })              // gated rows first
  .order("triage_score->>score", { ascending: true })               // then worst (lowest) score first
  .limit(ceiling);                                                  // D-04/TRI-09 — the ceiling, enforced in SQL

// Step 2: mark exactly those rows released. Single-tenant, human-triggered
// (D-11 — clicked from the admin UI), so a two-step select-then-update is
// correct at this concurrency profile; an atomic single-statement RPC is
// an available upgrade if concurrent release ever becomes a real risk,
// not a requirement at this scale.
const ids = (worstN ?? []).map((r) => r.id);
if (ids.length > 0) {
  await sb.from("prospects").update({ scan_released_at: new Date().toISOString() }).in("id", ids);
}
```

Note: Supabase JS's `jsonb ->> key` filter syntax (`triage_score->>gated`, `triage_score->>score`) operates on text-cast jsonb values — `score` must be compared with `.lte()` against a string-cast numeric, which works correctly for zero-padded or plain-integer scores in the 0–100 range but is worth a unit/integration test (see Validation Architecture) rather than assumed correct from documentation alone, since Postgres text-cast numeric comparison (`'9' > '10'` as text) can silently misorder unpadded numbers. **Recommendation: store `score` as a JSON number, and when filtering/sorting on it from Supabase JS, cast explicitly via a Postgres view or a small RPC function instead of relying on `->>'` text comparison for anything beyond equality** — or simpler still, given the scale (10-50 rows), pull all un-released triaged prospects into JS (a handful of rows) and sort/filter/slice there with real numeric comparison, skipping the jsonb text-cast footgun entirely. **This second option is the recommended default** — it trades a theoretical "let the DB do it" purity for avoiding a real, easy-to-miss correctness bug, and at this row count the performance difference is unmeasurable.

```typescript
// Recommended default: fetch un-released triaged prospects (small N),
// filter/sort/slice with real numbers in JS. Avoids the jsonb ->>
// text-comparison footgun above entirely.
const { data: candidates } = await sb
  .from("prospects")
  .select("id, triage_score")
  .not("domain", "is", null)
  .not("triage_score", "is", null)
  .is("scan_released_at", null);

const eligible = (candidates ?? []).filter(
  (p) => p.triage_score.gated || p.triage_score.score <= cutoff
);
eligible.sort((a, b) => {
  if (a.triage_score.gated !== b.triage_score.gated) return a.triage_score.gated ? -1 : 1;
  return a.triage_score.score - b.triage_score.score;
});
const worstN = eligible.slice(0, ceiling); // TRI-09 ceiling enforced here, in JS, with real numbers
```

### Migration 016 (release marker)

```sql
-- 016_add_scan_release_marker.sql
-- D-08: the single Phase 3 -> Phase 4 state change. NULL = not yet
-- released to the scan queue; set = released, excluded from every future
-- release (D-06) and from future re-triage (D-09).
alter table prospects add column if not exists scan_released_at timestamptz;

-- Speeds the "not yet released" eligibility filter (partial index,
-- matches the convention already used in migrations 010/014 for
-- domain-uniqueness and active-suppression lookups).
create index if not exists idx_prospects_scan_released_at_null
  on prospects (scan_released_at) where scan_released_at is null;
```

### Proposed `triage_score` jsonb shape (Claude's discretion, D-02)

```typescript
interface TriageScore {
  score: number;              // 0-100, LOWER = worse (mirrors lib/scoring.ts's existing direction convention)
  gated: boolean;              // true if unreachable OR https unavailable (D-01)
  gateReason: "unreachable" | "no-https" | null;
  reachable: boolean;
  https: boolean;
  finalStatus: number | null;  // HTTP status of the last hop (D-02: "every raw signal")
  redirectChain: Array<{ url: string; status: number }>;
  hasViewport: boolean;
  bytes: number | null;
  truncated: boolean;          // true if body-read hit the 5MB cap
  responseMs: number | null;   // TTFB
  robotsBlocked: boolean;      // homepage GET was skipped due to robots.txt Disallow:/
}
```

### Proposed default weighted-score bands (Claude's discretion — plan/planner may tune)

Starting at 100, apply deductions only when `gated === false` (a gated prospect's numeric score is irrelevant to ranking — sorted purely by the `gated` boolean — but still computed for display consistency):

| Signal | Threshold | Deduction |
|---|---|---|
| No viewport meta | `hasViewport === false` | -30 |
| Redirect chain length | `redirectChain.length - 1 >= 4` hops | -25 |
| Redirect chain length | `redirectChain.length - 1 >= 2` hops (and < 4) | -15 |
| Page weight | `bytes > 3_000_000` or `truncated === true` | -20 |
| Page weight | `bytes > 1_000_000` (and ≤ 3MB) | -10 |
| Response time | `responseMs > 4000` | -20 |
| Response time | `responseMs > 1500` (and ≤ 4000) | -10 |

Clamp result to `[0, 100]`. Default cutoff (D-03) recommendation: `score <= 60` — this is a starting constant Joshua tunes live via the shortlist slider against D-04's ~30% target pass rate; it is explicitly not meant to be exact on day one.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.10 (already configured, `vitest.config.ts`) |
| Config file | `vitest.config.ts` — `environment: "node"`, `passWithNoTests: true`, `@/*` path alias |
| Quick run command | `npx vitest run lib/triage-scorer.test.ts lib/triage-fetch.test.ts` |
| Full suite command | `npm run test` (`vitest run`) |

No jsdom, no DOM library, even in tests — matches the phase's own DOM-library rejection (raw HTML strings as fixtures, not a parsed DOM). All triage tests are either pure-function unit tests or Supabase-integration tests following the existing `*.integration.test.ts` naming convention (see `lib/prospect-upsert.integration.test.ts`, `lib/suppression.integration.test.ts`).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRI-01 | Zero Playwright/Lighthouse/AI imports in the triage path | static/grep gate | `grep -rE "playwright|lighthouse|@google/generative-ai" lib/triage-*.ts scripts/triage-prospects.ts` (expect no matches) | ❌ Wave 0 |
| TRI-02 | Reachability classification (DNS fail, timeout, 4xx/5xx = reachable) | unit | `npx vitest run lib/triage-fetch.test.ts -t reachability` | ❌ Wave 0 |
| TRI-03 | Redirect chain capture + HTTPS-availability rule | unit (DI-seam, fake fetch responses) | `npx vitest run lib/triage-fetch.test.ts -t redirect` | ❌ Wave 0 |
| TRI-04 | Viewport regex — present/absent/attribute-order/quote variants | unit, table-driven | `npx vitest run lib/triage-fetch.test.ts -t viewport` | ❌ Wave 0 |
| TRI-05 | Page weight cap + TTFB timing | unit | `npx vitest run lib/triage-fetch.test.ts -t weight` | ❌ Wave 0 |
| TRI-06 | Scorer determinism + monotonicity + gate-always-tops | unit, table-driven | `npx vitest run lib/triage-scorer.test.ts` | ❌ Wave 0 |
| TRI-07 | Shortlist query returns worst-first order | integration (local Supabase) | `npx vitest run lib/triage-release.integration.test.ts -t shortlist-order` | ❌ Wave 0 |
| TRI-08 | Cutoff changes eligible set | integration | `npx vitest run lib/triage-release.integration.test.ts -t cutoff` | ❌ Wave 0 |
| TRI-09 | Ceiling never exceeded, independent of cutoff permissiveness | integration | `npx vitest run lib/triage-release.integration.test.ts -t ceiling-never-exceeded` | ❌ Wave 0 |
| D-06/D-09 | Released prospects never re-release, never re-triaged | integration | `npx vitest run lib/triage-release.integration.test.ts -t idempotency` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run command above (scoped to the file(s) touched)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/fixtures/triage-html.ts` — canned HTML strings covering: no viewport, viewport with double quotes, single quotes, `content=` before `name=`, unquoted value, JS-injected-only (absent from raw HTML) — mirrors `tests/fixtures/overture.ts`'s "sane, overridable defaults" pattern
- [ ] `tests/fixtures/triage-responses.ts` — fake fetch-response sequences for the DI seam: a clean 200, an `http→https` single-hop upgrade, a >8-hop redirect loop, a 500 final status, a DNS-failure throw, a private-IP `Location` (SSRF-hop test), an oversized body (>5MB) to exercise the truncation path
- [ ] `lib/triage-fetch.ts` + `lib/triage-fetch.test.ts` — new
- [ ] `lib/triage-scorer.ts` + `lib/triage-scorer.test.ts` — new
- [ ] `lib/triage-release.ts` + `lib/triage-release.integration.test.ts` — new (needs local Supabase, per existing integration-test convention)
- [ ] `scripts/triage-prospects.test.ts` — CLI arg-parsing + dry-run tests, mirrors `scripts/import-prospects.test.ts`'s `ImportDeps`-style injectable-dependency seam (a `TriageDeps` interface exposing `validateUrlSafe`, `fetchTriageSignals`, `createServerClient` as swappable functions)

### Concrete test shapes for the four invariants named in the phase brief

**1. Scorer is deterministic:**
```typescript
it("is deterministic — same signals in, same score out", () => {
  const signals = { reachable: true, https: true, hasViewport: false, bytes: 500_000, responseMs: 800, redirectChain: [{url:"...",status:200}] };
  expect(computeTriageScore(signals)).toEqual(computeTriageScore(signals));
});
```

**2. Scorer is monotonic per signal (table-driven, not a generative property library — no new dependency):**
```typescript
it("never scores a heavier page better than an otherwise-identical lighter page", () => {
  const base = { reachable: true, https: true, hasViewport: true, responseMs: 500, redirectChain: [] };
  const light = computeTriageScore({ ...base, bytes: 200_000 });
  const heavy = computeTriageScore({ ...base, bytes: 4_000_000 });
  expect(heavy.score).toBeLessThanOrEqual(light.score);
});
// Repeat the same shape for responseMs and redirectChain.length.
```

**3. D-01 gate always tops the worst-first order regardless of secondary signals:**
```typescript
it("ranks a gated (unreachable) prospect ahead of a non-gated prospect with objectively worse secondary signals", () => {
  const gated = computeTriageScore({ reachable: false, https: false, hasViewport: true, bytes: 50_000, responseMs: 100, redirectChain: [] });
  const notGatedButBad = computeTriageScore({ reachable: true, https: true, hasViewport: false, bytes: 9_000_000, responseMs: 9000, redirectChain: Array(10).fill({url:"x",status:301}) });
  expect(gated.gated).toBe(true);
  expect(notGatedButBad.gated).toBe(false);
  // Sort order (gated DESC, score ASC) must place gated first regardless of scores.
  const sorted = [notGatedButBad, gated].sort((a, b) => (a.gated === b.gated ? a.score - b.score : a.gated ? -1 : 1));
  expect(sorted[0]).toBe(gated);
});
```

**4. Ceiling is never exceeded, independent of cutoff (TRI-09/D-06, integration, local Supabase):**
```typescript
it("releases at most `ceiling` prospects even with a maximally permissive cutoff", async () => {
  // Seed 30 prospects, all with score=90 (well under a cutoff=100 — everyone eligible).
  await seedTriagedProspects(sb, 30, { score: 90, gated: false });
  const released = await releaseWorstN(sb, { cutoff: 100, ceiling: 20 });
  expect(released.length).toBe(20); // never more than the ceiling, despite 30 eligible
  const { count } = await sb.from("prospects").select("id", { count: "exact", head: true }).not("scan_released_at", "is", null);
  expect(count).toBe(20);
});
```

**5. Worst-N selection correctness:**
```typescript
it("releases the N lowest-scoring eligible prospects, not an arbitrary subset", async () => {
  await seedTriagedProspects(sb, [10, 20, 5, 80, 45].map((score) => ({ score, gated: false })));
  const released = await releaseWorstN(sb, { cutoff: 50, ceiling: 2 });
  expect(released.map((r) => r.triage_score.score).sort()).toEqual([5, 10]);
});
```

**6. Re-triage idempotency (D-09):**
```typescript
it("skips already-released prospects on re-triage, refreshes un-released ones", async () => {
  const released = await seedProspect(sb, { scan_released_at: new Date().toISOString(), triage_score: { score: 42 }, triage_checked_at: "2026-01-01T00:00:00Z" });
  const unreleased = await seedProspect(sb, { triage_score: { score: 42 }, triage_checked_at: "2026-01-01T00:00:00Z" });
  await runTriage({ deps: fakeDeps /* returns a different score, e.g. 10 */ });
  const releasedAfter = await getProspect(sb, released.id);
  const unreleasedAfter = await getProspect(sb, unreleased.id);
  expect(releasedAfter.triage_checked_at).toBe("2026-01-01T00:00:00Z"); // unchanged — skipped
  expect(unreleasedAfter.triage_checked_at).not.toBe("2026-01-01T00:00:00Z"); // refreshed
});
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node native `fetch`/`AbortController`/`ReadableStream` | All triage fetching | ✓ | Node 18+ (project requires 18+, uses `process.loadEnvFile` elsewhere which is Node 20.6+ — confirm actual runtime; either way `fetch` is available) | — |
| Local Supabase (for integration tests) | Wave 0 test infra | ✓ (established in Phase 1/2 — `supabase/seed.sql`, `.branches/` gitignored) | — | — |
| Production Supabase (for the real migration 016 push) | Live release query | ✓ (existing convention: dashboard SQL Editor push, per STATE.md Phase 01-01 decision) | — | Same manual-push convention as migrations 010-015 |

No new external dependency, service, or CLI tool is introduced by this phase.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (this phase adds no new auth surface; the existing shared-secret admin auth from `CONCERNS.md` is a known, separately-tracked gap, not this phase's job to fix) | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Release route must check the same `x-admin-secret` gate as every other `app/api/admin/*` route (existing convention) — do not add a new, weaker auth path for this one route |
| V5 Input Validation | yes | `--cutoff`/`--limit` CLI args validated the same way `import-prospects.ts` validates `--limit` (positive-number check before any DB/network call); URL inputs go through `validateUrlSafe()` before any fetch, per hop (Pitfall 2 above) |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via a malicious/compromised redirect chain pointing at cloud metadata or a private IP on a later hop | Tampering / Information Disclosure | Re-run `validateUrlSafe()`'s IP-block check on every `Location` header before following it (Pattern 1, Pitfall 2) — the single most important new security behavior this phase adds beyond what already exists |
| Unbounded body download (a target site serving a multi-GB response to exhaust local disk/memory on Joshua's machine, since D-10 runs this locally) | Denial of Service | Hard 5MB read cap with stream cancellation (Pattern 3) |
| Redirect loop / resource exhaustion from a pathological target site | Denial of Service | `MAX_HOPS = 8` hard cap (Pattern 1), per-hop `AbortController` timeout |
| WAF fingerprinting from a burst of automated requests against strangers' sites | (blast-radius / reputational, not a STRIDE category, per `PITFALLS.md` Pitfall 2) | Honest User-Agent, robots.txt respect, bounded concurrency + inter-batch spacing (Pattern 7) — even though this runs off the production IP (D-10), it's still good-citizen behavior worth keeping |

## Sources

### Primary (HIGH confidence)
- `scanner-service/src/scanner.ts` (this codebase) — `checkInternalLinks()` (lines 45-112) and `checkSiteFiles()` (lines 13-43): the proven, working redirect-chain-follow and robots.txt-fetch patterns this research adapts directly. Confirms Node's native `fetch()` under `redirect: "manual"` exposes real `status` + `Location` header (no browser-style CORS opacity).
- `lib/url-validation.server.ts`, `lib/url-validation.ts`, `lib/domain-normalize.ts`, `lib/supabase.ts` (this codebase) — read in full; confirms `validateUrlSafe()`'s actual behavior (DNS + private-IP check only, no fetch) versus CONTEXT.md's shorthand description of it.
- `scripts/import-prospects.ts`, `scripts/import-prospects.test.ts`, `tests/fixtures/overture.ts` (this codebase) — the CLI-script shape, DI-seam (`ImportDeps`) testing pattern, and fixture-builder convention this phase's `triage-prospects.ts`/`TriageDeps`/`tests/fixtures/triage-html.ts` should mirror.
- `supabase/migrations/010_create_prospects.sql`, `014_create_suppressions.sql`, `015_create_legal_basis.sql` (this codebase) — confirms `triage_score`/`triage_checked_at` already exist, the partial-unique-index and RLS-enable-no-policy conventions, and the immutability-trigger pattern (referenced as an available-but-not-recommended alternative to the two-step release query).
- `package.json` (this codebase) — direct read confirming zero existing HTTP-client, robots-parser, or concurrency-limiter dependencies.
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html) — verified via web search 2026-07-20; grounds the group-matching and Allow/Disallow specificity rules behind Pattern 5's simplified single-path check.

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONCERNS.md` — browser-concurrency and duplicated-scoring findings, informs why triage must have its own scorer and run as a local script.
- `.planning/research/PITFALLS.md` — Pitfall 2 (blast-radius/WAF fingerprinting) and Pitfall 4 (too-permissive triage) directly shape D-12's fetch etiquette and the ceiling-independent-of-cutoff design.

### Tertiary (LOW confidence / [ASSUMED])
- The specific weighted-score deduction values in §Code Examples ("Proposed default weighted-score bands") are `[ASSUMED]` — reasonable small-business-site defaults reasoned from the codebase's existing scoring conventions (`lib/scoring.ts`'s 0-100/higher-is-better direction) and D-04's ~30% target pass rate, but not empirically validated against real triaged data. CONTEXT.md explicitly leaves these to Claude's discretion and expects tuning.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Default weighted-score deduction values (viewport -30, weight/time/chain bands) | §Code Examples, Proposed default weighted-score bands | Low — explicitly a tunable default per D-03/CONTEXT.md; wrong values just mean the cutoff needs re-tuning against the real ~30% pass-rate target, not a redesign |
| A2 | `score` direction (lower = worse) mirrors `lib/scoring.ts`'s existing 0-100/higher-is-better convention | §Proposed `triage_score` jsonb shape | Low — internal convention choice, does not affect correctness of the gate/ceiling/cutoff mechanics, only the sign of comparisons in the release query (documented consistently throughout this doc) |
| A3 | A `validateUrlSafe()` rejection should gate the same way as `unreachable` rather than getting a third gate bucket | §Pattern 6 | Low-Medium — if the planner disagrees, this is a one-line change to `gateReason` handling, not a structural rework |
| A4 | Two-step (SELECT then UPDATE) release query is sufficient versus an atomic single-statement RPC, given single-tenant/human-triggered concurrency | §Cutoff & ceiling query | Low — correct at current scale (D-11: one admin clicking one button); if multi-operator or automated release is ever added, upgrade path to an RPC is documented inline |

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, all mechanics verified against this codebase's own existing, working code (`scanner.ts`'s redirect-follow and robots.txt-fetch patterns)
- Architecture: HIGH — directly derived from the established `scripts/*.ts` + `lib/*.ts` split already used by Phase 1/2
- Pitfalls: HIGH for the SSRF-per-hop and upsert/NOT-NULL findings (both verified against actual code behavior, not guessed); MEDIUM for the jsonb `->>'` text-comparison footgun (reasoned from general Postgres behavior, not reproduced against this specific schema in this session)

**Research date:** 2026-07-20
**Valid until:** 30 days (stable domain — native fetch/Postgres/RFC 9309 mechanics do not shift on a fast cadence; re-verify sooner only if `lib/url-validation.server.ts` or the `prospects` schema changes before this phase is planned)
