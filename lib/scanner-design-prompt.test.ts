/**
 * buildDesignAnalysisPrompt() — CMP-17 no-profiling control (D-13). Lives in
 * the root Vitest tree, not beside scanner-service/src/design-prompt.ts: root
 * Vitest picks up this file, scanner-service's own `tsc` build does not (its
 * tsconfig only includes src/**\/*), so the service ships no test-only
 * dependency (same placement rationale as lib/scanner-capacity.test.ts).
 */
import { describe, expect, it } from "vitest";
import { buildDesignAnalysisPrompt } from "../scanner-service/src/design-prompt";

describe("buildDesignAnalysisPrompt", () => {
  it("contains the domain it was given", () => {
    expect(buildDesignAnalysisPrompt("example.nl")).toContain("example.nl");
  });

  it("forbids describing, naming, or identifying any person visible in the screenshot", () => {
    const prompt = buildDesignAnalysisPrompt("example.nl");
    expect(prompt).toMatch(/do not describe|not describe|forbid/i);
    expect(prompt.toLowerCase()).toContain("person");
  });

  it("still contains all five scoring dimensions and the JSON-only response instruction", () => {
    const prompt = buildDesignAnalysisPrompt("example.nl");
    expect(prompt).toContain("visualHierarchy");
    expect(prompt).toContain("whitespace");
    expect(prompt).toContain("typography");
    expect(prompt).toContain("ctaProminence");
    expect(prompt).toContain("professionalism");
    expect(prompt).toMatch(/JSON only/i);
  });

  it("places the no-profiling instruction after the dimension list and before the 'Also identify' sentence", () => {
    const prompt = buildDesignAnalysisPrompt("example.nl");
    const dimensionListEnd = prompt.indexOf("professionalism:");
    const noProfilingIndex = prompt.search(/person/i);
    const alsoIdentifyIndex = prompt.indexOf("Also identify up to 4 specific visual issues");

    expect(dimensionListEnd).toBeGreaterThan(-1);
    expect(noProfilingIndex).toBeGreaterThan(-1);
    expect(alsoIdentifyIndex).toBeGreaterThan(-1);
    expect(noProfilingIndex).toBeGreaterThan(dimensionListEnd);
    expect(alsoIdentifyIndex).toBeGreaterThan(noProfilingIndex);
  });
});
