import { describe, expect, it } from "vitest";
import { detectBlockedPage } from "../scanner-service/src/block-page";

describe("detectBlockedPage", () => {
  it.each([401, 403, 429, 503])("flags HTTP %i", (status) => {
    expect(detectBlockedPage(status, "", "")).not.toBeNull();
  });

  it("flags block-page titles", () => {
    expect(detectBlockedPage(200, "403 - Forbidden | Access to this page is forbidden.", "")).not.toBeNull();
    expect(detectBlockedPage(200, "Attention Required! | Cloudflare", "")).not.toBeNull();
    expect(detectBlockedPage(200, "Just a moment...", "")).not.toBeNull();
    expect(detectBlockedPage(200, "Access denied", "")).not.toBeNull();
  });

  it("flags block wording at the start of the body", () => {
    expect(
      detectBlockedPage(200, "", "Please enable cookies. Sorry, you have been blocked You are unable to access asp-bouw.nl")
    ).not.toBeNull();
  });

  it("leaves a normal page alone", () => {
    expect(detectBlockedPage(200, "Loodgieter Utrecht | EW", "Wij lossen elke lekkage op, ook in het weekend.")).toBeNull();
  });

  it("only reads the opening of the body", () => {
    expect(detectBlockedPage(200, "Home", "x".repeat(600) + " access denied")).toBeNull();
  });

  it("does not treat status 0 as blocked", () => {
    expect(detectBlockedPage(0, "", "")).toBeNull();
  });

  it("never echoes page text in the reason", () => {
    const reason = detectBlockedPage(200, "Access denied evil-title", "") ?? "";
    expect(reason).not.toContain("evil-title");
  });
});
