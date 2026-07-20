// Browserless triage fetch (TRI-01..05). One manual-redirect-follow GET per
// prospect produces reachability, HTTPS availability, the full redirect
// chain, mobile-viewport presence, page weight, and TTFB — no Playwright,
// no Lighthouse, no jsdom/Cheerio, no AI. Adapted from the proven redirect-
// follow loop in scanner-service/src/scanner.ts's checkInternalLinks()
// (GET instead of HEAD so the body is readable), with one addition beyond
// that existing code: validateUrlSafe() is re-run on every redirect hop,
// not just the starting URL (closes the SSRF gap RESEARCH.md Pitfall 2
// flags — scanner.ts's own loop only guards the start).
import type { TriageSignals } from "@/types/triage";
import { MAX_HOPS, HOP_TIMEOUT_MS, MAX_BODY_BYTES, TRIAGE_USER_AGENT } from "@/lib/triage-constants";

/** Minimal Response shape this module needs — matches global fetch's Response
 * structurally, so tests can inject plain-object fakes without a real
 * network call or a jsdom/undici Response construction. */
export interface TriageResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?(): unknown;
    };
  } | null;
  text(): Promise<string>;
}

export type TriageFetchImpl = (input: string, init?: RequestInit) => Promise<TriageResponseLike>;

export interface TriageDeps {
  validateUrlSafe(url: string): Promise<string>;
  /** DI seam for tests — defaults to global fetch. */
  fetchImpl?: TriageFetchImpl;
}

const defaultFetchImpl = fetch as unknown as TriageFetchImpl;

/** Case-insensitive meta-viewport detector — double/single-quoted, unquoted,
 * and content-before-name attribute order (RESEARCH.md Pattern 2). Presence
 * only; a JS-injected-only SPA viewport tag is an inherent no-browser blind
 * spot, not a regex bug (see lib/triage-scorer.ts's comment on the same). */
export const VIEWPORT_RE =
  /<meta\s+(?:[^>]*?\s+)?name\s*=\s*(?:"viewport"|'viewport'|viewport\b)[^>]*>/i;

function emptySignals(overrides: Partial<TriageSignals> = {}): TriageSignals {
  return {
    reachable: false,
    https: false,
    finalStatus: null,
    redirectChain: [],
    hasViewport: false,
    bytes: null,
    truncated: false,
    responseMs: null,
    robotsBlocked: false,
    gateReason: null,
    ...overrides,
  };
}

function decodeChunks(chunks: Uint8Array[]): string {
  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk)).join("");
}

/** Reads a response body capped at `capBytes`, cancelling the stream (never
 * throwing) once the cap is exceeded — a tripped cap IS the "heavy page"
 * signal, not a failure (RESEARCH.md Pattern 3). */
export async function readBodyCapped(
  res: TriageResponseLike,
  capBytes: number,
): Promise<{ bytes: number; truncated: boolean; text: string }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: 0, truncated: false, text: "" };

  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    total += value.byteLength;
    if (total > capBytes) {
      await reader.cancel?.();
      return { bytes: total, truncated: true, text: decodeChunks(chunks) };
    }
    chunks.push(value);
  }
  return { bytes: total, truncated: false, text: decodeChunks(chunks) };
}

interface RobotsRule {
  type: "allow" | "disallow";
  path: string;
}
interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

function parseRobotsGroups(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const field = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines belong to the same group (RFC 9309
      // 2.2.1); a User-agent line after any rule starts a new group.
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ type: field, path: value });
    }
  }
  return groups;
}

/**
 * Radically simplified robots.txt evaluation (RESEARCH.md Pattern 5) —
 * triage only ever requests one path, the homepage (`/`), so the entire
 * rule set collapses to: does the matching UA-or-wildcard group contain
 * `Disallow: /`, with no overriding `Allow: /` at equal specificity
 * (RFC 9309 §2.2.2 — Allow wins ties)? Any other Disallow path (or an
 * empty `Disallow:` value, which means nothing is disallowed) is
 * irrelevant to the homepage and never blocks it.
 */
export function parseRobotsForRoot(text: string, uaToken: string): boolean {
  const groups = parseRobotsGroups(text);
  const token = uaToken.toLowerCase();

  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const group = specific ?? wildcard;
  if (!group) return false; // no matching group at all -> fail open

  const disallowsRoot = group.rules.some((r) => r.type === "disallow" && r.path === "/");
  if (!disallowsRoot) return false;

  const allowsRoot = group.rules.some((r) => r.type === "allow" && r.path === "/");
  return !allowsRoot;
}

/** Homepage-only robots.txt check — fails OPEN (proceeds with the GET) on
 * any 404/timeout/network error/malformed content, matching checkSiteFiles's
 * existing 5s-timeout fetch shape. Only a well-formed root Disallow blocks. */
export async function isHomepageDisallowed(
  origin: string,
  uaToken: string,
  fetchImpl: TriageFetchImpl = defaultFetchImpl,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
    let res: TriageResponseLike;
    try {
      res = await fetchImpl(`${origin}/robots.txt`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return false;
    const text = await res.text();
    return parseRobotsForRoot(text, uaToken);
  } catch {
    return false;
  }
}

/**
 * One GET-with-manual-redirect-follow pass producing all TRI-02..05
 * signals. validateUrlSafe() gates the starting URL AND every redirect
 * Location before it is followed (per-hop SSRF re-validation — the one
 * addition beyond scanner.ts's existing, start-only-guarded loop).
 */
export async function fetchTriageSignals(startUrl: string, deps: TriageDeps): Promise<TriageSignals> {
  const fetchImpl = deps.fetchImpl ?? defaultFetchImpl;

  let current: string;
  try {
    current = await deps.validateUrlSafe(startUrl);
  } catch {
    // Private IP / metadata / malformed / unresolvable — never attempt a
    // fetch at all (Pattern 6: an SSRF-refused prospect is, practically,
    // unreachable from the outreach funnel's perspective).
    return emptySignals({ gateReason: "unreachable" });
  }

  const origin = new URL(current).origin;
  const robotsBlocked = await isHomepageDisallowed(origin, TRIAGE_USER_AGENT, fetchImpl);
  if (robotsBlocked) {
    // The homepage GET is deliberately skipped, not failed — distinct from
    // "unreachable" (D-02: Joshua should see "we chose not to fetch this
    // one", not a misleading unreachable/no-https gate).
    return emptySignals({
      reachable: true,
      https: new URL(current).protocol === "https:",
      robotsBlocked: true,
    });
  }

  const chain: Array<{ url: string; status: number }> = [];
  let finalStatus = 0;
  const t0 = performance.now();

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HOP_TIMEOUT_MS);
    let res: TriageResponseLike;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": TRIAGE_USER_AGENT },
      });
    } catch {
      clearTimeout(timer);
      // DNS failure / connection refused/reset / our own timeout — all
      // route to the same D-01 gate at the scoring layer (Pattern 6).
      return emptySignals({ redirectChain: chain, gateReason: "unreachable" });
    }
    clearTimeout(timer);

    chain.push({ url: current, status: res.status });
    finalStatus = res.status;

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break; // 3xx with no Location — nothing more to follow

      let next: string;
      try {
        next = new URL(loc, current).toString();
      } catch {
        break;
      }

      try {
        // Per-hop SSRF re-validation (Pitfall 2) — the redirect-hop gap
        // scanner.ts's own loop lacks.
        current = await deps.validateUrlSafe(next);
      } catch {
        return emptySignals({ redirectChain: chain, gateReason: "unreachable" });
      }
      continue;
    }

    // Final (non-redirect) hop — any status (2xx-5xx) counts as reachable
    // (Pitfall 4: a 500 is reachable, not unreachable).
    const responseMs = Math.round(performance.now() - t0);
    const { bytes, truncated, text } = await readBodyCapped(res, MAX_BODY_BYTES);
    return {
      reachable: true,
      https: new URL(current).protocol === "https:",
      finalStatus,
      redirectChain: chain,
      hasViewport: VIEWPORT_RE.test(text),
      bytes,
      truncated,
      responseMs,
      robotsBlocked: false,
      gateReason: null,
    };
  }

  // MAX_HOPS exhausted (or a 3xx with a missing/malformed Location) without
  // reaching a terminal response — a redirect loop is itself a "neglected
  // site" signal, never silently dropped (Pattern 1 failure mode).
  return emptySignals({ reachable: true, https: false, finalStatus, redirectChain: chain });
}
