// Single tunable constants block for the bulk scan queue (Phase 4). Every
// concurrency, pacing, ceiling, and identity value used by bulk scanning is
// documented here — never a second inline literal elsewhere in the phase.
// Every value below is a Claude's-discretion default (04-CONTEXT.md); tune
// against real run data, not a tested ceiling (no such ceiling exists yet
// for the single Railway Playwright instance — 04-RESEARCH.md Open
// Question 2).

// ── Bulk fetch identity & manners (D-09) ───────────────────────────
// Honest, identifiable UA naming Adashi with a contact URL — distinct from
// both the public scanner's own UA identity and lib/triage-constants.ts's
// TRIAGE_USER_AGENT. A block earned by bulk prospecting must never land on
// the revenue-earning public scanner.
export const BULK_USER_AGENT =
  "AdashiProspecting/1.0 (+https://adashi.io/contact) — outreach research crawler";

// ── Batch arming & drain pacing (D-07, D-08, SCAN-06) ──────────────
export const BULK_BATCH_SIZE = 2; // tunable default — rows claimed per cron tick
export const BULK_DISPATCH_CONCURRENCY = 2; // tunable default — the p-limit bound; equals MAX_TOTAL_FULL_SCANS - RESERVED_FOR_PUBLIC (scanner-service/src/capacity.ts)
export const BULK_DISPATCH_SPACING_MS = 5000; // tunable default — inter-dispatch spacing within a tick, so a tick does not burst (SCAN-06 / Pitfall 2)
export const BULK_ARM_CEILING = 20; // tunable default — hard cap on prospects one "Run batch" click can arm; mirrors RELEASE_CEILING (D-07)

// ── Scan shape (matches the full-async handler's own ceiling) ─────
export const BULK_MAX_PAGES = 7; // matches the full-async handler's internal Math.min(maxPages, 7) ceiling

// ── Rate-limit isolation (scans.ip_hash is NOT NULL) ───────────────
// A sentinel, never a real or hashed IP. The public scanner's per-IP rate
// limit counts rows by ip_hash, so bulk rows must sit under their own key
// and never inflate a real visitor's count.
export const BULK_SCAN_IP_HASH = "bulk-prospect-scan";

// ── Public scanner health measurement (SCAN-06, plan 04-06) ────────
export const PUBLIC_SCANNER_BASELINE_DAYS = 14; // tunable default — measurement window
export const PUBLIC_SCANNER_TOLERANCE_PP = 5; // tunable default — pass tolerance in percentage points
