import { afterEach, describe, expect, it, vi } from "vitest";
import { OVERTURE_RELEASE_LISTING_XML } from "@/tests/fixtures/overture-release-listing";
import {
  overtureDivisionsPath,
  overturePlacesPath,
  parseOvertureReleases,
  pickLatestRelease,
  resetOvertureReleaseCache,
  resolveOvertureRelease,
} from "./overture-client";

function okFetch(body: string) {
  return vi.fn(async () => new Response(body, { status: 200 }));
}

afterEach(() => {
  resetOvertureReleaseCache();
  vi.unstubAllEnvs();
});

describe("parseOvertureReleases", () => {
  it("reads every release prefix from the S3 listing", () => {
    expect(parseOvertureReleases(OVERTURE_RELEASE_LISTING_XML).sort()).toEqual([
      "2026-09-23.0",
      "2026-09-23.1",
      "2026-10-21.0",
    ]);
  });

  it("ignores prefixes that are not release versions", () => {
    const xml =
      "<CommonPrefixes><Prefix>release/latest/</Prefix></CommonPrefixes>" +
      "<CommonPrefixes><Prefix>release/2026-10-21.0/</Prefix></CommonPrefixes>";
    expect(parseOvertureReleases(xml)).toEqual(["2026-10-21.0"]);
  });
});

describe("pickLatestRelease", () => {
  it("picks the newest date, then the highest patch number", () => {
    expect(pickLatestRelease(["2026-09-23.1", "2026-10-21.0", "2026-09-23.0"])).toBe(
      "2026-10-21.0"
    );
    expect(pickLatestRelease(["2026-09-23.2", "2026-09-23.10"])).toBe("2026-09-23.10");
  });

  it("fails loudly when there is no release", () => {
    expect(() => pickLatestRelease([])).toThrow(/no Overture release/i);
  });
});

describe("resolveOvertureRelease", () => {
  it("returns the latest release from the S3 listing", async () => {
    vi.stubEnv("OVERTURE_RELEASE", "");
    const fetchImpl = okFetch(OVERTURE_RELEASE_LISTING_XML);
    await expect(resolveOvertureRelease(fetchImpl)).resolves.toBe("2026-10-21.0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("looks the listing up once per process", async () => {
    vi.stubEnv("OVERTURE_RELEASE", "");
    const fetchImpl = okFetch(OVERTURE_RELEASE_LISTING_XML);
    await resolveOvertureRelease(fetchImpl);
    await resolveOvertureRelease(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the OVERTURE_RELEASE env var as a pin and skips the lookup", async () => {
    vi.stubEnv("OVERTURE_RELEASE", "2026-09-23.1");
    const fetchImpl = okFetch(OVERTURE_RELEASE_LISTING_XML);
    await expect(resolveOvertureRelease(fetchImpl)).resolves.toBe("2026-09-23.1");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws on a failed listing and retries on the next call", async () => {
    vi.stubEnv("OVERTURE_RELEASE", "");
    const failing = vi.fn(async () => new Response("denied", { status: 403 }));
    await expect(resolveOvertureRelease(failing)).rejects.toThrow(/403/);
    const ok = okFetch(OVERTURE_RELEASE_LISTING_XML);
    await expect(resolveOvertureRelease(ok)).resolves.toBe("2026-10-21.0");
  });
});

describe("Overture S3 paths", () => {
  it("builds the places and divisions paths for a release", () => {
    expect(overturePlacesPath("2026-10-21.0")).toBe(
      "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*"
    );
    expect(overtureDivisionsPath("2026-10-21.0")).toBe(
      "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=divisions/type=division_area/*"
    );
  });
});
