/**
 * CLI arg-validation and NL-fixture resolution for scripts/legal-basis.ts.
 *
 * DB-free by design: createServerClient/lookupProspect/lookupLegalRegime/
 * lookupLiaVersion/isSuppressed are all stubbed via the LegalBasisDeps seam —
 * no real Supabase involved.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LegalBasisArgsError,
  parseLegalBasisArgs,
  runCli,
  runLegalBasis,
  type LegalBasisArgs,
  type LegalBasisDeps,
} from "./legal-basis";

const fakeSupabase = {} as SupabaseClient;

const NL_PROSPECT = { country: "NL", domain: "example.nl", contactEmail: "prospect@example.nl" };
const NL_REGIME = {
  countryCode: "NL",
  spamLawRegime: "opt-out-narrow-exemption",
  notesUrl: ".planning/research/LEGAL.md",
  currentLiaVersion: 1,
};
const LIA_V1 = { version: 1, effectiveFrom: "2026-07-20", contentHash: "abc123" };

function makeDeps(overrides?: Partial<LegalBasisDeps>): LegalBasisDeps {
  return {
    createServerClient: vi.fn(() => fakeSupabase),
    isSuppressed: vi.fn(async () => false),
    lookupProspect: vi.fn(async () => NL_PROSPECT),
    lookupLegalRegime: vi.fn(async () => NL_REGIME),
    lookupLiaVersion: vi.fn(async () => LIA_V1),
    ...overrides,
  };
}

describe("parseLegalBasisArgs", () => {
  it("rejects a run with neither --email nor --domain", () => {
    expect(() => parseLegalBasisArgs([])).toThrow(LegalBasisArgsError);
  });

  it("accepts --email alone", () => {
    expect(parseLegalBasisArgs(["--email=a@example.nl"])).toEqual({
      email: "a@example.nl",
      domain: null,
    });
  });

  it("accepts --domain alone", () => {
    expect(parseLegalBasisArgs(["--domain=example.nl"])).toEqual({
      email: null,
      domain: "example.nl",
    });
  });
});

describe("runCli — missing arg has zero DB side effects", () => {
  it("throws before createServerClient is ever called", async () => {
    const deps = makeDeps();
    await expect(runCli([], deps)).rejects.toThrow(LegalBasisArgsError);
    expect(deps.createServerClient).not.toHaveBeenCalled();
  });
});

describe("runLegalBasis — NL fixture resolution (CMP-08/CMP-16, D-10)", () => {
  const args: LegalBasisArgs = { email: "prospect@example.nl", domain: null };

  it("resolves country NL, opt-out-narrow-exemption regime, LIA v1, and suppression status in one output", async () => {
    const deps = makeDeps();
    const result = await runLegalBasis(args, deps);

    expect(result.country).toBe("NL");
    expect(result.spamLawRegime).toBe("opt-out-narrow-exemption");
    expect(result.liaVersion).toBe(1);
    expect(result.liaEffectiveFrom).toBe("2026-07-20");
    expect(result.suppressed).toBe(false);
  });

  it("looks up the regime for whatever country is resolved — never a hardcoded NL branch", async () => {
    const deDeps = makeDeps({
      lookupProspect: vi.fn(async () => ({ country: "DE", domain: "example.de", contactEmail: null })),
      lookupLegalRegime: vi.fn(async () => ({
        countryCode: "DE",
        spamLawRegime: "opt-in-required",
        notesUrl: null,
        currentLiaVersion: 1,
      })),
    });

    const result = await runLegalBasis({ email: null, domain: "example.de" }, deDeps);

    expect(result.country).toBe("DE");
    expect(result.spamLawRegime).toBe("opt-in-required");
    expect(deDeps.lookupLegalRegime).toHaveBeenCalledWith(fakeSupabase, "DE");
  });

  it("reports suppressed=true when isSuppressed resolves true", async () => {
    const deps = makeDeps({ isSuppressed: vi.fn(async () => true) });
    const result = await runLegalBasis(args, deps);
    expect(result.suppressed).toBe(true);
  });

  it("checks suppression on the resolved domain when only --domain is given", async () => {
    const deps = makeDeps({
      lookupProspect: vi.fn(async () => ({ country: "NL", domain: "example.nl", contactEmail: null })),
    });

    await runLegalBasis({ email: null, domain: "example.nl" }, deps);

    expect(deps.isSuppressed).toHaveBeenCalledWith(fakeSupabase, "example.nl");
  });

  it("resolves gracefully with unknown fields when no prospect is found (no crash)", async () => {
    const deps = makeDeps({ lookupProspect: vi.fn(async () => null) });
    const result = await runLegalBasis({ email: "nobody@nowhere.test", domain: null }, deps);

    expect(result.country).toBeNull();
    expect(result.spamLawRegime).toBeNull();
    expect(deps.lookupLegalRegime).not.toHaveBeenCalled();
  });
});
