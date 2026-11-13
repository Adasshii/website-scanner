import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { errorMessage, isUuid, rejectIfNotAdmin } from "./atrium-admin";

const ORIGINAL = process.env.ADMIN_SECRET;

afterEach(() => {
  process.env.ADMIN_SECRET = ORIGINAL;
});

function request(secret?: string) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers["x-admin-secret"] = secret;
  return new NextRequest("http://localhost/api/admin/atrium/suppressions", { headers });
}

describe("rejectIfNotAdmin", () => {
  it("returns 401 when ADMIN_SECRET is not set, even with a header", async () => {
    delete process.env.ADMIN_SECRET;
    const res = rejectIfNotAdmin(request("anything"));
    expect(res?.status).toBe(401);
    expect(await res!.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when the header is missing", () => {
    process.env.ADMIN_SECRET = "s3cret";
    expect(rejectIfNotAdmin(request())?.status).toBe(401);
  });

  it("returns 401 when the header is wrong", () => {
    process.env.ADMIN_SECRET = "s3cret";
    expect(rejectIfNotAdmin(request("nope"))?.status).toBe(401);
  });

  it("returns null when the header matches", () => {
    process.env.ADMIN_SECRET = "s3cret";
    expect(rejectIfNotAdmin(request("s3cret"))).toBeNull();
  });
});

describe("isUuid", () => {
  it("accepts a UUID in either case", () => {
    expect(isUuid("3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f")).toBe(true);
    expect(isUuid("3F2B9C1E-8A4D-4F6B-9C2E-1A2B3C4D5E6F")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("reads an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("reads a Supabase error object", () => {
    expect(errorMessage({ message: "duplicate key", code: "23505" })).toBe("duplicate key");
  });

  it("falls back to String()", () => {
    expect(errorMessage("plain")).toBe("plain");
  });
});
