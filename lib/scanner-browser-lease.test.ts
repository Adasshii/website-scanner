/**
 * createBrowserLease() — Chrome lives only while a scan holds a lease
 * (2026-11-16 fix after the Railway scanner's Chrome stopped launching).
 * Lives in the root Vitest tree like lib/scanner-capacity.test.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { createBrowserLease } from "../scanner-service/src/browser-lease";

function fakeChrome() {
  const made: { closed: boolean; connected: boolean }[] = [];
  const launch = vi.fn(async () => {
    const b = { closed: false, connected: true, close: vi.fn(async () => { b.closed = true; b.connected = false; }), isConnected: () => b.connected };
    made.push(b);
    return b;
  });
  return { launch, made };
}

describe("createBrowserLease", () => {
  it("launches Chrome for a scan and closes it when the scan ends", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    await lease.withBrowser(async () => {
      await lease.get();
      await lease.get();
      expect(made[0]?.closed).toBe(false);
    });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(made[0]?.closed).toBe(true);
    expect(lease.users).toBe(0);
  });

  it("closes Chrome even when the scan throws", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    await expect(lease.withBrowser(async () => { await lease.get(); throw new Error("page crashed"); })).rejects.toThrow("page crashed");
    expect(made[0]?.closed).toBe(true);
  });

  it("shares one Chrome between scans that overlap, and closes it after the last one", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    let finishFirst!: () => void;
    const first = lease.withBrowser(async () => { await lease.get(); await new Promise<void>((r) => (finishFirst = r)); });
    await vi.waitFor(() => expect(made).toHaveLength(1));
    await lease.withBrowser(async () => { await lease.get(); });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(made[0]?.closed).toBe(false); // the first scan still runs
    finishFirst();
    await first;
    expect(made[0]?.closed).toBe(true);
  });

  it("launches a fresh Chrome for the next scan", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    await lease.withBrowser(async () => { await lease.get(); });
    await lease.withBrowser(async () => { await lease.get(); });
    expect(launch).toHaveBeenCalledTimes(2);
    expect(made.every((b) => b.closed)).toBe(true);
  });

  it("replaces a Chrome that crashed during a scan", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    await lease.withBrowser(async () => {
      await lease.get();
      made[0]!.connected = false;
      await lease.get();
    });
    expect(launch).toHaveBeenCalledTimes(2);
    expect(made[1]?.closed).toBe(true);
  });

  it("does not leave Chrome open when the launch finishes after the lease ended", async () => {
    let release!: () => void;
    const b = { close: vi.fn(async () => {}), isConnected: () => true };
    const lease = createBrowserLease(() => new Promise<typeof b>((r) => (release = () => r(b))));
    const scan = lease.withBrowser(async () => { void lease.get(); });
    await scan;
    release();
    await vi.waitFor(() => expect(b.close).toHaveBeenCalledTimes(1));
  });

  it("close() shuts Chrome for shutdown", async () => {
    const { launch, made } = fakeChrome();
    const lease = createBrowserLease(launch);
    let finish!: () => void;
    const scan = lease.withBrowser(async () => { await lease.get(); await new Promise<void>((r) => (finish = r)); });
    await vi.waitFor(() => expect(made).toHaveLength(1));
    await lease.close();
    expect(made[0]?.closed).toBe(true);
    finish();
    await scan;
  });
});
