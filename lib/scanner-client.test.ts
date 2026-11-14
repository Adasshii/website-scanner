/**
 * ScannerClient.fullScanBulk: the request contract (plan 09-09, D-9-12).
 *
 * The slice is the only way the niche profile reaches the Railway scanner, so
 * the body it posts is the contract. fetch is stubbed; nothing leaves the
 * machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScannerClient } from "./scanner-client";
import { INSTALLERS_PROFILE, toScannerSlice } from "./niche-profile";

const OPTS = { scanId: "scan-1", prospectId: "p-1", userAgent: "BulkUA/1.0" };

function stubFetch(status = 200) {
  const fetchStub = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ accepted: true }), { status })
  );
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

function postedBody(fetchStub: ReturnType<typeof stubFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchStub.mock.calls[0][1].body));
}

describe("ScannerClient.fullScanBulk: the nicheSlice request field", () => {
  beforeEach(() => {
    process.env.SCANNER_SERVICE_URL = "https://scanner.test/";
    process.env.SCANNER_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the slice in the request body when one is given", async () => {
    const fetchStub = stubFetch();
    const nicheSlice = toScannerSlice(INSTALLERS_PROFILE);
    await new ScannerClient().fullScanBulk("https://prospect.test", { ...OPTS, nicheSlice });
    const body = postedBody(fetchStub);
    expect(JSON.stringify(body.nicheSlice)).toBe(JSON.stringify(nicheSlice));
    expect(body.source).toBe("bulk");
    expect(body.scanId).toBe("scan-1");
  });

  it("omits the key entirely when no slice is given, so the request is the one sent before Phase 9", async () => {
    const fetchStub = stubFetch();
    await new ScannerClient().fullScanBulk("https://prospect.test", OPTS);
    const body = postedBody(fetchStub);
    expect("nicheSlice" in body).toBe(false);
    expect(Object.keys(body).sort().join(",")).toBe("maxPages,prospectId,scanId,source,url,userAgent");
  });

  it("keeps the structural 503 refusal and its abort signal", async () => {
    const fetchStub = stubFetch(503);
    const result = await new ScannerClient().fullScanBulk("https://prospect.test", { ...OPTS, nicheSlice: toScannerSlice(INSTALLERS_PROFILE) });
    expect(result.accepted).toBe(false);
    expect(fetchStub.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(String(fetchStub.mock.calls[0][0])).toBe("https://scanner.test/api/scan/full-async");
  });

  it("still throws on a non-503 error response", async () => {
    stubFetch(500);
    await expect(new ScannerClient().fullScanBulk("https://prospect.test", OPTS)).rejects.toThrow("Scanner service error (500)");
  });

  it("the posted slice is small enough that the scanner route's body limit is never the constraint", async () => {
    const fetchStub = stubFetch();
    await new ScannerClient().fullScanBulk("https://prospect.test", { ...OPTS, nicheSlice: toScannerSlice(INSTALLERS_PROFILE) });
    expect(String(fetchStub.mock.calls[0][1].body).length).toBeLessThan(20 * 1024);
  });
});
