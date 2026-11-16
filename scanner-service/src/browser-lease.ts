// One Chrome for the scans that are running, and no Chrome when none are.
//
// The service used to keep one Playwright browser open for its whole life and
// relaunch it only after a crash. After about three months on Railway
// (2026-11-14) every launch died with SIGTRAP and every scan failed until the
// container restarted. A scan now holds a lease: the first lease launches
// Chrome, scans running at the same time share it, and the last one to finish
// closes it, so Chrome never outlives the work. Pure apart from the injected
// launcher, so the root Vitest suite tests it without a browser.

export interface LeasableBrowser {
  close(): Promise<void>;
  isConnected(): boolean;
}

export interface BrowserLease<B extends LeasableBrowser> {
  /** The open browser, launched on first use. Call it inside withBrowser so the scan holds a lease. */
  get(): Promise<B>;
  /** Runs fn while holding a lease. When the last lease ends, Chrome is closed. */
  withBrowser<T>(fn: () => Promise<T>): Promise<T>;
  /** Closes Chrome now, leases or not. For shutdown. */
  close(): Promise<void>;
  /** How many leases are held. For tests and logs. */
  readonly users: number;
}

export function createBrowserLease<B extends LeasableBrowser>(launch: () => Promise<B>): BrowserLease<B> {
  let browser: B | null = null;
  let launching: Promise<B> | null = null;
  let closing: Promise<void> = Promise.resolve();
  let users = 0;

  async function shut(): Promise<void> {
    const b = browser;
    browser = null;
    if (!b) return;
    closing = b.close().catch(() => {
      /* a crashed browser cannot be closed twice; nothing left to do */
    });
    await closing;
  }

  async function get(): Promise<B> {
    await closing;
    if (browser && browser.isConnected()) return browser;
    if (!launching) {
      launching = launch()
        .then(async (b) => {
          browser = b;
          // Every lease ended while Chrome was starting: close it at once.
          if (users === 0) await shut();
          return b;
        })
        .finally(() => {
          launching = null;
        });
    }
    return launching;
  }

  async function withBrowser<T>(fn: () => Promise<T>): Promise<T> {
    users++;
    try {
      return await fn();
    } finally {
      users--;
      if (users === 0) await shut();
    }
  }

  return {
    get,
    withBrowser,
    close: shut,
    get users() {
      return users;
    },
  };
}
