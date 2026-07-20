// Fake fetch-response sequences for the DI seam in lib/triage-fetch.ts.
// Mirrors how scripts/import-prospects.test.ts stubs its deps via vi.fn() —
// these fixtures are handed to a stubbed `fetch` (or a TriageDeps fetch
// seam), never a real network call. No live HTTP client, no jsdom/cheerio.

import { vi } from "vitest";
import type { TriageSignals } from "@/types/triage";
import { MAX_HOPS, MAX_BODY_BYTES } from "@/lib/triage-constants";

/** Minimal fetch Response shape the redirect-follow loop + body reader need. */
export interface FakeFetchResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  } | null;
  text(): Promise<string>;
}

function makeFakeResponse(opts: {
  status: number;
  location?: string;
  bodyBytes?: number;
  bodyText?: string;
}): FakeFetchResponse {
  const { status, location = null, bodyText = "" } = opts;
  const bytes = opts.bodyBytes ?? new TextEncoder().encode(bodyText).byteLength;
  let delivered = false;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return name.toLowerCase() === "location" ? location : null;
      },
    },
    body: {
      getReader() {
        return {
          async read() {
            if (delivered) return { done: true, value: undefined };
            delivered = true;
            return { done: false, value: new Uint8Array(bytes) };
          },
        };
      },
    },
    async text() {
      return bodyText;
    },
  };
}

// ── Clean 200 ────────────────────────────────────────────────────────
export const CLEAN_200_RESPONSES = (): FakeFetchResponse[] => [
  makeFakeResponse({ status: 200, bodyText: "<html><body>Hello</body></html>" }),
];

// ── http:// → https:// single-hop upgrade (the common, healthy case) ─
export const HTTP_TO_HTTPS_UPGRADE_RESPONSES = (): FakeFetchResponse[] => [
  makeFakeResponse({ status: 301, location: "https://example.test/" }),
  makeFakeResponse({ status: 200, bodyText: "<html><body>Secure</body></html>" }),
];
export const HTTP_TO_HTTPS_UPGRADE_EXPECTED: Partial<TriageSignals> = {
  reachable: true,
  https: true,
};

// ── Redirect chain exceeding MAX_HOPS (loop) ──────────────────────────
export const REDIRECT_LOOP_EXCEEDS_MAX_HOPS_RESPONSES = (): FakeFetchResponse[] =>
  Array.from({ length: MAX_HOPS + 1 }, (_, i) =>
    makeFakeResponse({ status: 302, location: `https://example.test/hop-${i + 1}` }),
  );
export const REDIRECT_LOOP_EXPECTED: Partial<TriageSignals> = {
  reachable: true,
  https: false,
};

// ── 500 final status (reachable but broken) ───────────────────────────
export const FINAL_STATUS_500_RESPONSES = (): FakeFetchResponse[] => [
  makeFakeResponse({ status: 500, bodyText: "Internal Server Error" }),
];
export const FINAL_STATUS_500_EXPECTED: Partial<TriageSignals> = {
  reachable: true,
  finalStatus: 500,
};

// ── DNS-failure throw (Node fetch/undici classification, Pattern 6) ───
export function makeDnsFailureError(): Error & { cause?: { code: string } } {
  const err = new Error("fetch failed") as Error & { cause?: { code: string } };
  err.cause = { code: "ENOTFOUND" };
  return err;
}
export const fetchThrowsDnsFailure = vi.fn(async () => {
  throw makeDnsFailureError();
});

// ── Redirect Location pointing at a private/metadata IP (per-hop SSRF) ─
export const SSRF_REDIRECT_TO_METADATA_IP_RESPONSES = (): FakeFetchResponse[] => [
  makeFakeResponse({ status: 302, location: "http://169.254.169.254/" }),
];

// ── Oversized (>MAX_BODY_BYTES) body — exercises the truncation path ──
export const OVERSIZED_BODY_RESPONSES = (): FakeFetchResponse[] => [
  makeFakeResponse({ status: 200, bodyBytes: MAX_BODY_BYTES + 1024 }),
];
export const OVERSIZED_BODY_EXPECTED: Partial<TriageSignals> = {
  reachable: true,
  truncated: true,
};
