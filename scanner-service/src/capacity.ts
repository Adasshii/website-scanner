// Pure, dependency-free capacity gate for the shared Railway Playwright
// instance (D-08, SCAN-02, T-04-03). No imports at all — this lets the
// module be unit-tested from the root Vitest suite (lib/scanner-capacity.
// test.ts) without pulling scanner-service's Playwright/Gemini dependency
// graph into the test run.

// Tunable default — total concurrent full scans the single Railway
// Playwright instance is trusted with. CONCERNS.md flags the current
// limits as fragile under bulk load; no tested ceiling exists yet.
export const MAX_TOTAL_FULL_SCANS = 3;

// Tunable default (D-08) — permanent headroom the live public scanner
// never competes for. Strictly less than MAX_TOTAL_FULL_SCANS so the bulk
// ceiling always sits below total capacity.
export const RESERVED_FOR_PUBLIC = 1;

// Tunable default — advertised backoff (seconds) in a capacity-refusal body.
export const CAPACITY_RETRY_AFTER_SECONDS = 30;

/**
 * Whether a new full scan should be refused given the current number of
 * active full scans. Bulk callers (`source === "bulk"`) are bounded by
 * `MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC`, reserving headroom the
 * public scanner never has to compete for (D-08, SCAN-02).
 */
export function isAtCapacity(activeCount: number, source?: string): boolean {
  const ceiling =
    source === "bulk" ? MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC : MAX_TOTAL_FULL_SCANS;
  return activeCount >= ceiling;
}
