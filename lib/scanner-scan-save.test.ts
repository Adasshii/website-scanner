/**
 * saveCompletedScan() and formatDbError() — the completed-scan save reads its
 * returned database error (2026-11-16 production symptom: the scanner logged
 * "[full-scan-async] Completed" but the scans row stayed in a running status,
 * because supabase-js returns DB errors instead of throwing them).
 * markScanFailed() reads and logs the error from a failed-status write too.
 * Lives in the root Vitest tree like lib/scanner-capacity.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COMPLETED_SAVE_REASON_MAX,
  type DbWriteResult,
  formatDbError,
  markScanFailed,
  saveCompletedScan,
} from "../scanner-service/src/scan-save";

const REFUSED = {
  message: "unsupported Unicode escape sequence",
  code: "22P05",
  details: "\\u0000 cannot be converted to text.",
  hint: null,
};

function fakes(result: () => Promise<DbWriteResult>) {
  const write = vi.fn(result);
  const markFailed = vi.fn<(reason: string) => Promise<void>>(async () => {});
  const log = vi.fn<(line: string) => void>();
  return { write, markFailed, log };
}

describe("formatDbError", () => {
  it("returns one JSON line with message, code, details and hint, missing fields as null", () => {
    const line = formatDbError({ message: "boom" });
    expect(line.includes("\n")).toBe(false);
    expect(JSON.parse(line)).toEqual({ message: "boom", code: null, details: null, hint: null });
  });

  it("carries every field Supabase returned", () => {
    expect(JSON.parse(formatDbError(REFUSED))).toEqual(REFUSED);
  });
});

describe("saveCompletedScan", () => {
  it("returns ok when the write has no error, without marking failed or logging", async () => {
    const f = fakes(async () => ({ error: null }));
    const result = await saveCompletedScan("scan-1", f);
    expect(result).toEqual({ ok: true });
    expect(f.write).toHaveBeenCalledTimes(1);
    expect(f.markFailed).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it("logs the full error once and marks the scan failed when the write is refused", async () => {
    const f = fakes(async () => ({ error: REFUSED }));
    const result = await saveCompletedScan("scan-253faef3", f);

    expect(result.ok).toBe(false);
    expect(f.log).toHaveBeenCalledTimes(1);
    const line = f.log.mock.calls[0]![0];
    expect(line).toContain("scan-253faef3");
    expect(line).toContain("22P05");
    expect(line).toContain(REFUSED.message);
    expect(line).toContain("cannot be converted to text");

    expect(f.markFailed).toHaveBeenCalledTimes(1);
    const reason = f.markFailed.mock.calls[0]![0];
    expect(reason.startsWith("Could not save the completed scan:")).toBe(true);
    expect(reason).toContain(REFUSED.message);
    expect(result).toEqual({ ok: false, reason });
  });

  it("keeps details and hint out of the stored reason", async () => {
    const f = fakes(async () => ({ error: { ...REFUSED, hint: "secret-hint" } }));
    const result = await saveCompletedScan("scan-1", f);
    if (result.ok) throw new Error("expected a refused save");
    expect(result.reason).not.toContain("cannot be converted to text");
    expect(result.reason).not.toContain("secret-hint");
  });

  it("clips a 1000-character message to exactly 300 characters ending in an ellipsis, while the log keeps it whole", async () => {
    const long = "x".repeat(1000);
    const f = fakes(async () => ({ error: { message: long, code: "XX000" } }));
    const result = await saveCompletedScan("scan-1", f);
    if (result.ok) throw new Error("expected a refused save");

    expect(COMPLETED_SAVE_REASON_MAX).toBe(300);
    expect(result.reason.length).toBe(COMPLETED_SAVE_REASON_MAX);
    expect(result.reason.endsWith("…")).toBe(true);
    expect(f.log.mock.calls[0]![0]).toContain(long);
  });

  it("falls back to 'unknown error' when the error has no message, and still logs", async () => {
    const f = fakes(async () => ({ error: { code: "XX000" } }));
    const result = await saveCompletedScan("scan-1", f);
    if (result.ok) throw new Error("expected a refused save");
    expect(result.reason.endsWith("unknown error")).toBe(true);
    expect(f.log).toHaveBeenCalledTimes(1);
  });

  it("lets a rejected write reject, without marking failed or logging", async () => {
    const boom = new Error("socket hang up");
    const f = fakes(async () => {
      throw boom;
    });
    await expect(saveCompletedScan("scan-1", f)).rejects.toBe(boom);
    expect(f.markFailed).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });
});

describe("markScanFailed", () => {
  const NOW = () => "2026-11-16T00:00:00.000Z";

  it("writes status failed, the reason and the injected timestamp, without logging", async () => {
    const write = vi.fn<
      (values: { status: "failed"; error_message: string; updated_at: string }) => Promise<DbWriteResult>
    >(async () => ({ error: null }));
    const log = vi.fn<(line: string) => void>();
    await markScanFailed("scan-1", "Service timeout", { write, now: NOW, log });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({
      status: "failed",
      error_message: "Service timeout",
      updated_at: "2026-11-16T00:00:00.000Z",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("logs one [scan-recovery] line with the full error when the write is refused, and resolves", async () => {
    const write = vi.fn(async () => ({ error: REFUSED }));
    const log = vi.fn<(line: string) => void>();
    await expect(markScanFailed("scan-9", "x", { write, now: NOW, log })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0];
    expect(line.startsWith("[scan-recovery] DB update failed for scan-9:")).toBe(true);
    expect(line).toContain(formatDbError(REFUSED));
  });

  it("logs one [scan-recovery] line with the thrown message when the write rejects, and never rejects", async () => {
    const write = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const log = vi.fn<(line: string) => void>();
    await expect(markScanFailed("scan-9", "x", { write, now: NOW, log })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0];
    expect(line.startsWith("[scan-recovery] DB update failed for scan-9:")).toBe(true);
    expect(line).toContain("socket hang up");
  });
});
