/**
 * Unit tests for lib/opt-out-link.ts (SND-02, D-06). Pure module, no
 * Supabase, no fetch — the only external dependency is
 * lib/unsubscribe-token.ts's signUnsubscribeToken(), which needs
 * UNSUBSCRIBE_TOKEN_SECRET set. Set here as a literal test-only value so
 * this suite never depends on .env.local's real secret.
 */
process.env.UNSUBSCRIBE_TOKEN_SECRET = "test-secret-for-opt-out-link-unit-tests";

import { describe, expect, it } from "vitest";
import { signUnsubscribeToken } from "./unsubscribe-token";
import { appendArticle14Notice, ARTICLE_14_NOTICE_EN } from "./draft-prompt";
import {
  buildUnsubscribeUrl,
  buildOptOutLine,
  renderSendableBody,
  OPT_OUT_LABEL_EN,
  OPT_OUT_LABEL_NL,
} from "./opt-out-link";

const PROSPECT_ID = "11111111-1111-4111-8111-111111111111";

describe("opt-out-link", () => {
  it("buildUnsubscribeUrl returns the production unsubscribe URL for the token signUnsubscribeToken mints", () => {
    const url = buildUnsubscribeUrl(PROSPECT_ID);
    const expectedToken = signUnsubscribeToken(PROSPECT_ID);
    expect(url).toBe(`https://scan.adashi.io/api/unsubscribe/${expectedToken}`);
  });

  it("the returned URL contains no email address and no '@' beyond what the base64url token may carry", () => {
    const url = buildUnsubscribeUrl(PROSPECT_ID);
    expect(url).not.toContain("@example.com");
    // base64url never produces '@' at all, so the URL should contain none.
    expect(url).not.toContain("@");
  });

  it('buildOptOutLine returns "Unsubscribe: {url}" for locale "en"', () => {
    const line = buildOptOutLine(PROSPECT_ID, "en");
    expect(line).toBe(`${OPT_OUT_LABEL_EN}: ${buildUnsubscribeUrl(PROSPECT_ID)}`);
    expect(line.startsWith("Unsubscribe: ")).toBe(true);
  });

  it('buildOptOutLine returns "Afmelden: {url}" for locale "nl"', () => {
    const line = buildOptOutLine(PROSPECT_ID, "nl");
    expect(line).toBe(`${OPT_OUT_LABEL_NL}: ${buildUnsubscribeUrl(PROSPECT_ID)}`);
    expect(line.startsWith("Afmelden: ")).toBe(true);
  });

  it("renderSendableBody appends the draft body, right-trimmed, a blank line, then the opt-out line", () => {
    const body = "Hi,\n\nThis is the draft body.   \n\n  ";
    const rendered = renderSendableBody(body, PROSPECT_ID, "en");
    const optOutLine = buildOptOutLine(PROSPECT_ID, "en");
    expect(rendered).toBe(`Hi,\n\nThis is the draft body.\n\n${optOutLine}`);
  });

  it("renderSendableBody is idempotent: calling it on its own output returns the same output with exactly one opt-out line", () => {
    const body = "Hi,\n\nThis is the draft body.";
    const once = renderSendableBody(body, PROSPECT_ID, "en");
    const twice = renderSendableBody(once, PROSPECT_ID, "en");
    expect(twice).toBe(once);

    const optOutLine = buildOptOutLine(PROSPECT_ID, "en");
    const occurrences = twice.split(optOutLine).length - 1;
    expect(occurrences).toBe(1);
  });

  it("never mutates or reorders an existing Article 14 notice: the opt-out line lands after it", () => {
    const withNotice = appendArticle14Notice("Hi,\n\nThis is the draft body.", "en");
    const rendered = renderSendableBody(withNotice, PROSPECT_ID, "en");

    expect(rendered).toContain(ARTICLE_14_NOTICE_EN);

    const noticeIndex = rendered.indexOf(ARTICLE_14_NOTICE_EN);
    const optOutIndex = rendered.indexOf(buildOptOutLine(PROSPECT_ID, "en"));
    expect(optOutIndex).toBeGreaterThan(noticeIndex);
  });
});
