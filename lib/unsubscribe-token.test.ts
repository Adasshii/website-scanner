import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const TEST_SECRET = "test-secret-do-not-use-in-prod";
const PROSPECT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("unsubscribe-token", () => {
  const originalSecret = process.env.UNSUBSCRIBE_TOKEN_SECRET;

  beforeEach(() => {
    process.env.UNSUBSCRIBE_TOKEN_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    } else {
      process.env.UNSUBSCRIBE_TOKEN_SECRET = originalSecret;
    }
  });

  it("round-trips a prospect UUID through sign then verify", () => {
    const token = signUnsubscribeToken(PROSPECT_ID);
    expect(verifyUnsubscribeToken(token)).toEqual({ prospectId: PROSPECT_ID });
  });

  it("produces a <payload>.<sig> token with a payload carrying no email or exp", () => {
    const token = signUnsubscribeToken(PROSPECT_ID);
    const [payload, sig] = token.split(".");
    expect(payload).toBeTruthy();
    expect(sig).toBeTruthy();

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(decoded).toEqual({ pid: PROSPECT_ID });
    expect(decoded).not.toHaveProperty("email");
    expect(decoded).not.toHaveProperty("exp");
  });

  it("rejects a token with a tampered signature", () => {
    const token = signUnsubscribeToken(PROSPECT_ID);
    const [payload, sig] = token.split(".");
    const flippedChar = sig[0] === "a" ? "b" : "a";
    const tampered = `${payload}.${flippedChar}${sig.slice(1)}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a malformed token without throwing", () => {
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("no-separator")).toBeNull();
    expect(verifyUnsubscribeToken(".")).toBeNull();
    expect(() => verifyUnsubscribeToken("garbage.garbage")).not.toThrow();
    expect(verifyUnsubscribeToken("garbage.garbage")).toBeNull();
  });

  it("rejects a token whose payload is not valid JSON after a valid signature swap", () => {
    // A payload that doesn't decode to JSON, signed with the real secret,
    // must still be rejected — the parse failure path, not just the sig path.
    const badPayload = Buffer.from("not-json").toString("base64url");
    const token = signUnsubscribeToken(PROSPECT_ID);
    const [, realSig] = token.split(".");
    // Re-derive a valid signature over the bad payload so this actually
    // exercises the JSON.parse catch, not the timingSafeEqual rejection.
    const sig = Buffer.from(
      createHmac("sha256", TEST_SECRET).update(badPayload).digest()
    ).toString("base64url");
    expect(verifyUnsubscribeToken(`${badPayload}.${sig}`)).toBeNull();
    expect(realSig).toBeTruthy();
  });

  it("throws a clear error from both functions when the secret is unset", () => {
    delete process.env.UNSUBSCRIBE_TOKEN_SECRET;
    expect(() => signUnsubscribeToken(PROSPECT_ID)).toThrow("Missing UNSUBSCRIBE_TOKEN_SECRET");
    expect(() => verifyUnsubscribeToken("anything.anything")).toThrow(
      "Missing UNSUBSCRIBE_TOKEN_SECRET"
    );
  });
});
