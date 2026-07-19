/**
 * CLI arg-validation and lift-only behavior for scripts/suppression-override.ts.
 *
 * DB-free by design: createServerClient/liftSuppression are stubbed via the
 * OverrideDeps seam — no real Supabase involved.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OverrideArgsError,
  parseOverrideArgs,
  runCli,
  runOverride,
  type OverrideArgs,
  type OverrideDeps,
} from "./suppression-override";

const fakeSupabase = {} as SupabaseClient;

function makeDeps(overrides?: Partial<OverrideDeps>): OverrideDeps {
  return {
    createServerClient: vi.fn(() => fakeSupabase),
    liftSuppression: vi.fn(async () => ({ lifted: true })),
    ...overrides,
  };
}

const baseArgs: OverrideArgs = {
  email: "prospect@example.com",
  reason: "false positive, confirmed opt-in by phone",
};

describe("parseOverrideArgs", () => {
  it("rejects a run missing --email or --reason", () => {
    expect(() => parseOverrideArgs(["--reason=oops"])).toThrow(OverrideArgsError);
    expect(() => parseOverrideArgs(["--email=a@b.test"])).toThrow(OverrideArgsError);
    expect(() => parseOverrideArgs([])).toThrow(OverrideArgsError);
  });

  it("parses both required flags", () => {
    const args = parseOverrideArgs(["--email=a@b.test", "--reason=confirmed opt-in"]);
    expect(args).toEqual({ email: "a@b.test", reason: "confirmed opt-in" });
  });
});

describe("runCli — missing flag has zero DB side effects", () => {
  it("throws before createServerClient or liftSuppression are ever called", async () => {
    const deps = makeDeps();
    await expect(runCli(["--email=a@b.test"], deps)).rejects.toThrow(OverrideArgsError);
    expect(deps.createServerClient).not.toHaveBeenCalled();
    expect(deps.liftSuppression).not.toHaveBeenCalled();
  });
});

describe("runOverride — lifts, never deletes", () => {
  it("calls the injected liftSuppression exactly once with the given email + reason", async () => {
    const deps = makeDeps();
    const result = await runOverride(baseArgs, deps);

    expect(deps.liftSuppression).toHaveBeenCalledTimes(1);
    expect(deps.liftSuppression).toHaveBeenCalledWith(fakeSupabase, {
      email: baseArgs.email,
      reason: baseArgs.reason,
    });
    expect(result).toEqual({ email: baseArgs.email, reason: baseArgs.reason, lifted: true });
  });

  it("reports a clean no-op when no active suppression exists (no error, no crash)", async () => {
    const deps = makeDeps({ liftSuppression: vi.fn(async () => ({ lifted: false })) });
    const result = await runOverride(baseArgs, deps);
    expect(result.lifted).toBe(false);
  });

  it("prints the email, reason, and outcome to the console", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const deps = makeDeps();

    await runOverride(baseArgs, deps);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain(baseArgs.email);
    expect(output).toContain(baseArgs.reason);
    logSpy.mockRestore();
  });
});
