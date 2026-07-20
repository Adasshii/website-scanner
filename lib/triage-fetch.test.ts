/**
 * fetchTriageSignals() — reachability, redirect/HTTPS, viewport, weight/
 * TTFB, per-hop SSRF re-validation, and robots.txt homepage-skip coverage
 * (TRI-02..05, D-12). Every fetch is stubbed via the TriageDeps `fetchImpl`
 * seam — no real network call. Fixtures come from tests/fixtures/triage-
 * responses.ts and tests/fixtures/triage-html.ts (Wave 0).
 */
import { describe, expect, it, vi } from "vitest";
import {
  fetchTriageSignals,
  isHomepageDisallowed,
  parseRobotsForRoot,
  readBodyCapped,
  VIEWPORT_RE,
  type TriageFetchImpl,
  type TriageResponseLike,
} from "./triage-fetch";
import {
  CLEAN_200_RESPONSES,
  FINAL_STATUS_500_RESPONSES,
  FINAL_STATUS_500_EXPECTED,
  HTTP_TO_HTTPS_UPGRADE_RESPONSES,
  HTTP_TO_HTTPS_UPGRADE_EXPECTED,
  makeDnsFailureError,
  OVERSIZED_BODY_RESPONSES,
  OVERSIZED_BODY_EXPECTED,
  REDIRECT_LOOP_EXCEEDS_MAX_HOPS_RESPONSES,
  REDIRECT_LOOP_EXPECTED,
  SSRF_REDIRECT_TO_METADATA_IP_RESPONSES,
  type FakeFetchResponse,
} from "@/tests/fixtures/triage-responses";
import {
  EXPECTED_VIEWPORT,
  HTML_JS_INJECTED_VIEWPORT_ABSENT,
  HTML_NO_VIEWPORT,
  HTML_VIEWPORT_CONTENT_BEFORE_NAME,
  HTML_VIEWPORT_DOUBLE_QUOTED,
  HTML_VIEWPORT_SINGLE_QUOTED,
  HTML_VIEWPORT_UNQUOTED,
} from "@/tests/fixtures/triage-html";

const START_URL = "https://example.test/";

/** Robots.txt 404 — the default fail-open case, used by every test below
 * that isn't specifically exercising robots.txt behavior. */
function robots404(): FakeFetchResponse {
  return {
    status: 404,
    ok: false,
    headers: { get: () => null },
    body: null,
    async text() {
      return "";
    },
  };
}

/** Builds a stubbed fetchImpl: robots.txt requests get `robotsResponse`
 * (default: 404 fail-open); every other request pulls the next response
 * off `homepageResponses` in order. */
function makeFetchImpl(
  homepageResponses: FakeFetchResponse[],
  robotsResponse: FakeFetchResponse = robots404(),
): TriageFetchImpl {
  let call = 0;
  return vi.fn(async (url: string) => {
    if (url.endsWith("/robots.txt")) return robotsResponse as unknown as TriageResponseLike;
    const res = homepageResponses[call];
    call++;
    return res as unknown as TriageResponseLike;
  });
}

const alwaysSafe = vi.fn(async (url: string) => url);

describe("fetchTriageSignals — reachability", () => {
  it("is reachable with a clean 200", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(CLEAN_200_RESPONSES()),
    });
    expect(result.reachable).toBe(true);
    expect(result.finalStatus).toBe(200);
  });

  it("a 500 final status is reachable, not unreachable (Pitfall 4)", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(FINAL_STATUS_500_RESPONSES()),
    });
    expect(result.reachable).toBe(FINAL_STATUS_500_EXPECTED.reachable);
    expect(result.finalStatus).toBe(FINAL_STATUS_500_EXPECTED.finalStatus);
  });

  it("classifies a DNS failure as unreachable with gateReason unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw makeDnsFailureError();
    });
    const result = await fetchTriageSignals(START_URL, { validateUrlSafe: alwaysSafe, fetchImpl });
    expect(result.reachable).toBe(false);
    expect(result.gateReason).toBe("unreachable");
  });

  it("a validateUrlSafe() rejection on the starting URL never attempts a fetch", async () => {
    const fetchImpl = vi.fn(async () => robots404() as unknown as TriageResponseLike);
    const validateUrlSafe = vi.fn(async () => {
      throw new Error("blocked");
    });
    const result = await fetchTriageSignals(START_URL, { validateUrlSafe, fetchImpl });
    expect(result.reachable).toBe(false);
    expect(result.gateReason).toBe("unreachable");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchTriageSignals — redirect / HTTPS", () => {
  it("marks https true on an http-to-https upgrade redirect", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(HTTP_TO_HTTPS_UPGRADE_RESPONSES()),
    });
    expect(result.reachable).toBe(HTTP_TO_HTTPS_UPGRADE_EXPECTED.reachable);
    expect(result.https).toBe(HTTP_TO_HTTPS_UPGRADE_EXPECTED.https);
  });

  it("a redirect loop exceeding MAX_HOPS is reachable but not https, chain never dropped", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(REDIRECT_LOOP_EXCEEDS_MAX_HOPS_RESPONSES()),
    });
    expect(result.reachable).toBe(REDIRECT_LOOP_EXPECTED.reachable);
    expect(result.https).toBe(REDIRECT_LOOP_EXPECTED.https);
    expect(result.redirectChain.length).toBeGreaterThan(0);
  });

  it("re-validates every redirect hop and refuses a Location pointing at a metadata IP", async () => {
    const validateUrlSafe = vi.fn(async (url: string) => {
      if (url.includes("169.254.169.254")) throw new Error("blocked: private IP");
      return url;
    });
    const fetchImpl = makeFetchImpl(SSRF_REDIRECT_TO_METADATA_IP_RESPONSES());

    const result = await fetchTriageSignals(START_URL, { validateUrlSafe, fetchImpl });

    expect(result.reachable).toBe(false);
    expect(result.gateReason).toBe("unreachable");
    // validateUrlSafe was invoked for the metadata-IP hop...
    expect(validateUrlSafe).toHaveBeenCalledWith("http://169.254.169.254/");
    // ...but that hop was never actually fetched — only the robots.txt
    // check and the single starting-URL hop (which returned the 302) hit
    // fetchImpl; the metadata-IP target itself is never a fetchImpl call.
    const fetchedUrls = (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (call) => call[0],
    );
    expect(fetchedUrls).not.toContain("http://169.254.169.254/");
  });
});

describe("fetchTriageSignals — viewport", () => {
  const cases: Array<[string, string]> = [
    ["HTML_NO_VIEWPORT", HTML_NO_VIEWPORT],
    ["HTML_VIEWPORT_DOUBLE_QUOTED", HTML_VIEWPORT_DOUBLE_QUOTED],
    ["HTML_VIEWPORT_SINGLE_QUOTED", HTML_VIEWPORT_SINGLE_QUOTED],
    ["HTML_VIEWPORT_CONTENT_BEFORE_NAME", HTML_VIEWPORT_CONTENT_BEFORE_NAME],
    ["HTML_VIEWPORT_UNQUOTED", HTML_VIEWPORT_UNQUOTED],
    ["HTML_JS_INJECTED_VIEWPORT_ABSENT", HTML_JS_INJECTED_VIEWPORT_ABSENT],
  ];

  it.each(cases)("VIEWPORT_RE on %s matches the expected verdict", (name, html) => {
    expect(VIEWPORT_RE.test(html)).toBe(EXPECTED_VIEWPORT[name].hasViewport);
  });

  it("fetchTriageSignals reports hasViewport from the final hop's body", async () => {
    const response: FakeFetchResponse = {
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: {
        getReader() {
          let delivered = false;
          const bytes = new TextEncoder().encode(HTML_VIEWPORT_DOUBLE_QUOTED);
          return {
            async read() {
              if (delivered) return { done: true, value: undefined };
              delivered = true;
              return { done: false, value: bytes };
            },
          };
        },
      },
      async text() {
        return HTML_VIEWPORT_DOUBLE_QUOTED;
      },
    };
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl([response]),
    });
    expect(result.hasViewport).toBe(true);
  });
});

describe("fetchTriageSignals — weight / TTFB", () => {
  it("caps an oversized body and sets truncated true without throwing", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(OVERSIZED_BODY_RESPONSES()),
    });
    expect(result.reachable).toBe(OVERSIZED_BODY_EXPECTED.reachable);
    expect(result.truncated).toBe(OVERSIZED_BODY_EXPECTED.truncated);
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("measures responseMs as a non-negative number, taken before the body read", async () => {
    const result = await fetchTriageSignals(START_URL, {
      validateUrlSafe: alwaysSafe,
      fetchImpl: makeFetchImpl(CLEAN_200_RESPONSES()),
    });
    expect(result.responseMs).not.toBeNull();
    expect(result.responseMs as number).toBeGreaterThanOrEqual(0);
  });
});

describe("readBodyCapped", () => {
  it("returns an empty read when the response has no body", async () => {
    const res: TriageResponseLike = {
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: null,
      async text() {
        return "";
      },
    };
    const result = await readBodyCapped(res, 1000);
    expect(result).toEqual({ bytes: 0, truncated: false, text: "" });
  });
});

describe("robots.txt — isHomepageDisallowed / parseRobotsForRoot", () => {
  it("fails open on a 404", async () => {
    const fetchImpl = vi.fn(async () => robots404() as unknown as TriageResponseLike);
    const blocked = await isHomepageDisallowed("https://example.test", "AdashiTriage", fetchImpl);
    expect(blocked).toBe(false);
  });

  it("fails open on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const blocked = await isHomepageDisallowed("https://example.test", "AdashiTriage", fetchImpl);
    expect(blocked).toBe(false);
  });

  it("blocks the homepage on a well-formed wildcard Disallow: /", async () => {
    const text = "User-agent: *\nDisallow: /\n";
    expect(parseRobotsForRoot(text, "AdashiTriage")).toBe(true);
  });

  it("does not block when Allow: / overrides Disallow: / at equal specificity", async () => {
    const text = "User-agent: *\nDisallow: /\nAllow: /\n";
    expect(parseRobotsForRoot(text, "AdashiTriage")).toBe(false);
  });

  it("does not block on an unrelated Disallow path", async () => {
    const text = "User-agent: *\nDisallow: /admin\n";
    expect(parseRobotsForRoot(text, "AdashiTriage")).toBe(false);
  });

  it("does not block on an empty Disallow value (means nothing disallowed)", async () => {
    const text = "User-agent: *\nDisallow:\n";
    expect(parseRobotsForRoot(text, "AdashiTriage")).toBe(false);
  });

  it("prefers a UA-specific group over the wildcard group", async () => {
    const text = "User-agent: AdashiTriage\nAllow: /\n\nUser-agent: *\nDisallow: /\n";
    expect(parseRobotsForRoot(text, "AdashiTriage")).toBe(false);
  });

  it("skips the homepage GET entirely when robots.txt disallows root", async () => {
    const robotsBlockedResponse: FakeFetchResponse = {
      status: 200,
      ok: true,
      headers: { get: () => null },
      body: null,
      async text() {
        return "User-agent: *\nDisallow: /\n";
      },
    };
    const fetchImpl = makeFetchImpl([], robotsBlockedResponse);

    const result = await fetchTriageSignals(START_URL, { validateUrlSafe: alwaysSafe, fetchImpl });

    expect(result.robotsBlocked).toBe(true);
    expect(result.reachable).toBe(true);
    // Only the robots.txt request happened — no homepage GET.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
