import { describe, expect, it } from "vitest";
import { isAggregatorDomain, normalizeDomain } from "./domain-normalize";

describe("normalizeDomain", () => {
  it("collapses www + multi-part public suffix + path + case to the registrable domain", () => {
    expect(normalizeDomain("https://WWW.Example.co.UK/path")).toBe("example.co.uk");
  });

  it("accepts a bare domain with no scheme", () => {
    expect(normalizeDomain("example.com")).toBe("example.com");
  });

  it("returns null for an IP address (not a registrable domain)", () => {
    expect(normalizeDomain("http://192.168.1.1")).toBeNull();
  });

  it("returns null for localhost", () => {
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("reduces a subdomain to its registrable domain", () => {
    expect(normalizeDomain("sub.shop.example.com")).toBe("example.com");
  });

  it("returns null for empty or garbage input without throwing", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(() => normalizeDomain("")).not.toThrow();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("not a url at all !!!")).toBeNull();
  });
});

describe("isAggregatorDomain", () => {
  it("flags a full URL on a known aggregator/directory domain", () => {
    expect(isAggregatorDomain("https://www.tripadvisor.com/Restaurant_Review-123")).toBe(true);
  });

  it("flags a subdomain of a known aggregator domain", () => {
    expect(isAggregatorDomain("https://business.facebook.com/some-page")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isAggregatorDomain("https://WWW.TripAdvisor.COM/x")).toBe(true);
  });

  it("returns false for a real business domain", () => {
    expect(isAggregatorDomain("https://real-business.test")).toBe(false);
  });

  it("returns false for null-normalizing input (never throws)", () => {
    expect(isAggregatorDomain("")).toBe(false);
    expect(isAggregatorDomain("not a url at all !!!")).toBe(false);
  });
});
