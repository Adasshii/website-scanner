/**
 * DI-seam unit tests for scripts/backfill-suppressions.ts — arg parsing,
 * dedupe-by-email, domain normalisation, dry-run, and the D-06/Pitfall 5
 * "no email_type filter" guarantee. DB-free by design: createServerClient
 * and writeSuppression are both stubbed via the BackfillDeps seam.
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BackfillArgsError,
  parseBackfillArgs,
  runBackfill,
  runCli,
  type BackfillDeps,
} from "./backfill-suppressions";

interface EmailEventRow {
  email: string;
  status: string;
}

/**
 * Stubs the exact chain runBackfill() calls: sb.from("email_events")
 * .select("email, status").in("status", [...]). Exposes `eq` as a spy too
 * so tests can assert it is never invoked — that's the "no email_type
 * filter" guarantee (Pitfall 5).
 */
function makeSupabaseStub(rows: EmailEventRow[]) {
  const eq = vi.fn();
  const inFn = vi.fn(async () => ({ data: rows, error: null }));
  const select = vi.fn(() => ({ in: inFn, eq }));
  const from = vi.fn(() => ({ select }));
  const sb = { from } as unknown as SupabaseClient;
  return { sb, from, select, inFn, eq };
}

function makeDeps(overrides?: Partial<BackfillDeps>): BackfillDeps {
  return {
    createServerClient: vi.fn(() => ({}) as SupabaseClient),
    writeSuppression: vi.fn(async () => ({ created: true })),
    ...overrides,
  };
}

describe("parseBackfillArgs", () => {
  it("defaults dryRun to false when omitted", () => {
    expect(parseBackfillArgs([])).toEqual({ dryRun: false });
  });

  it("parses --dry-run", () => {
    expect(parseBackfillArgs(["--dry-run"])).toEqual({ dryRun: true });
  });

  it("rejects an unknown flag", () => {
    expect(() => parseBackfillArgs(["--bogus"])).toThrow(BackfillArgsError);
  });
});

describe("runBackfill", () => {
  it("writes one suppression per distinct bounced/complained email across mixed email_types, with normalised domain", async () => {
    const rows: EmailEventRow[] = [
      { email: "A@Example.com", status: "bounced" },
      { email: "a@example.com", status: "complained" }, // same email, different case — must collapse
      { email: "other@sub.example.co.uk", status: "complained" },
    ];
    const { sb, inFn, eq } = makeSupabaseStub(rows);
    const writeSuppression = vi.fn(async () => ({ created: true }));
    const deps = makeDeps({ createServerClient: () => sb, writeSuppression });

    const result = await runBackfill(deps, { dryRun: false });

    expect(writeSuppression).toHaveBeenCalledTimes(2);
    expect(writeSuppression).toHaveBeenCalledWith(sb, {
      email: "a@example.com",
      domain: "example.com",
      reason: "bounced", // first status seen for this email wins
      source: "backfill",
    });
    expect(writeSuppression).toHaveBeenCalledWith(sb, {
      email: "other@sub.example.co.uk",
      domain: "example.co.uk",
      reason: "complained",
      source: "backfill",
    });
    expect(result).toEqual({
      rowsScanned: 3,
      distinctEmails: 2,
      created: 2,
      alreadyActive: 0,
      dryRun: false,
    });
    expect(inFn).toHaveBeenCalledWith("status", ["bounced", "complained"]);
    expect(eq).not.toHaveBeenCalled();
  });

  it("--dry-run scans and reports but performs zero writes", async () => {
    const rows: EmailEventRow[] = [{ email: "x@example.com", status: "bounced" }];
    const { sb } = makeSupabaseStub(rows);
    const writeSuppression = vi.fn(async () => ({ created: true }));
    const deps = makeDeps({ createServerClient: () => sb, writeSuppression });

    const result = await runBackfill(deps, { dryRun: true });

    expect(writeSuppression).not.toHaveBeenCalled();
    expect(result).toEqual({
      rowsScanned: 1,
      distinctEmails: 1,
      created: 0,
      alreadyActive: 0,
      dryRun: true,
    });
  });

  it("counts an already-active row (writeSuppression no-op) separately from created", async () => {
    const rows: EmailEventRow[] = [{ email: "already@example.com", status: "complained" }];
    const { sb } = makeSupabaseStub(rows);
    const writeSuppression = vi.fn(async () => ({ created: false }));
    const deps = makeDeps({ createServerClient: () => sb, writeSuppression });

    const result = await runBackfill(deps, { dryRun: false });

    expect(result.created).toBe(0);
    expect(result.alreadyActive).toBe(1);
  });

  it("Pitfall 5: applies no email_type filter — only status IN (bounced, complained)", async () => {
    const { sb, select, eq } = makeSupabaseStub([]);
    const deps = makeDeps({ createServerClient: () => sb });

    await runBackfill(deps, { dryRun: false });

    expect(select).toHaveBeenCalledWith("email, status");
    expect(eq).not.toHaveBeenCalled();
  });
});

describe("runCli", () => {
  it("parses argv then runs the backfill", async () => {
    const { sb } = makeSupabaseStub([{ email: "y@example.com", status: "bounced" }]);
    const writeSuppression = vi.fn(async () => ({ created: true }));
    const deps = makeDeps({ createServerClient: () => sb, writeSuppression });

    const result = await runCli(["--dry-run"], deps);

    expect(result.dryRun).toBe(true);
    expect(writeSuppression).not.toHaveBeenCalled();
  });

  it("rejects an unknown flag before touching Supabase", async () => {
    const createServerClient = vi.fn();
    const deps = makeDeps({ createServerClient });

    await expect(runCli(["--not-a-flag"], deps)).rejects.toThrow(BackfillArgsError);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
