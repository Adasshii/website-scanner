import { describe, expect, it } from "vitest";
import { CTA_PATTERN } from "../scanner-service/src/extractor";

describe("CTA_PATTERN", () => {
  it.each([
    "Bel ons", "Bel direct", "Bel nu", "Bellen", "Terugbellen", "Mail ons", "Offerte aanvragen",
    "Vraag een offerte aan", "Plan een afspraak", "Aanvraag", "WhatsApp", "Gratis advies", "Neem contact op",
  ])("matches the Dutch call to action %s", (text) => {
    expect(CTA_PATTERN.test(text)).toBe(true);
  });

  it.each([
    "Get started", "Contact us", "Book a call", "Try it", "Sign up", "Schedule", "Get a quote",
    "Free trial", "Request a demo",
  ])("still matches the English call to action %s", (text) => {
    expect(CTA_PATTERN.test(text)).toBe(true);
  });

  it.each(["Privacybeleid", "Algemene voorwaarden", "Over ons", "Nieuws"])("does not match %s", (text) => {
    expect(CTA_PATTERN.test(text)).toBe(false);
  });
});
