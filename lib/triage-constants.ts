// Single tunable constants block for browserless triage (D-03/D-04 —
// "documented in one place"). Every threshold/deduction here is a Claude's-
// discretion default (CONTEXT.md); tune against the real ~30% pass-rate
// target, never hardcode a second copy of these values elsewhere.

// ── Fetch identity & manners (D-12) ────────────────────────────────
// Honest, identifiable UA — a distinct string from the full scanner's own
// UA constant (different tool, no browser spoofing).
export const TRIAGE_USER_AGENT = "AdashiTriage/1.0 (+https://adashi.io/triage)";

// ── Fetch/redirect bounds (T-03-02 DoS caps) ───────────────────────
export const MAX_HOPS = 8; // tunable default — redirect-loop hard cap
export const HOP_TIMEOUT_MS = 5000; // tunable default — per-hop abort timeout
export const MAX_BODY_BYTES = 5 * 1024 * 1024; // tunable default — 5MB body-read cap

// ── Bounded concurrency + spacing (D-12 good-citizen manners) ──────
export const BATCH_SIZE = 5; // tunable default — concurrent fetches in flight
export const BATCH_DELAY_MS = 500; // tunable default — gap between batches

// ── Shortlist query chunking (07-09, closing 07-REVIEW.md WR-02) ───
// getShortlist()'s outreach lookup filters on `.in("prospect_id", ids)`
// against every triaged prospect — a set that only grows. PostgREST
// URL-encodes an `.in()` filter into the request's query string, and this
// project already hit the gateway's URL length limit ("URI too long") with
// the identical query shape in lib/retention.ts at 711 rows in this
// project's own local database (see lib/retention-constants.ts's
// RETENTION_ID_CHUNK_SIZE). This is a separate constant from that one —
// not an import of it — so the two surfaces can be tuned apart rather than
// coupled by an import that also drags retention's RETENTION_MODE config
// resolution into the admin read path.
export const SHORTLIST_ID_CHUNK_SIZE = 150; // tunable default

// ── Cutoff & ceiling (D-03/D-04, TRI-08/TRI-09) ────────────────────
export const DEFAULT_CUTOFF = 60; // tunable default — score <= cutoff is eligible
export const RELEASE_CEILING = 20; // tunable default — hard per-release-invocation cap (D-06)
export const TARGET_PASS_RATE = 0.3; // tunable default — ~30% target, informs cutoff tuning, not enforced in code

// ── Weighted-score bands (Claude's discretion, D-03) ───────────────
// Score direction: starts at 100, deductions only apply when gated===false
// (a gated prospect's score is irrelevant to ranking — sorted purely by
// the gated boolean, never folded into the numeric score — Pitfall 1).
// All values below are tunable defaults, not hand-tuned against real data.

export const VIEWPORT_MISSING_DEDUCTION = 30; // tunable default

export const REDIRECT_HOPS_HIGH_THRESHOLD = 4; // tunable default — hops >= 4
export const REDIRECT_HOPS_HIGH_DEDUCTION = 25; // tunable default
export const REDIRECT_HOPS_LOW_THRESHOLD = 2; // tunable default — hops >= 2 (and < high)
export const REDIRECT_HOPS_LOW_DEDUCTION = 15; // tunable default

export const PAGE_WEIGHT_HIGH_BYTES = 3_000_000; // tunable default — bytes > this (or truncated)
export const PAGE_WEIGHT_HIGH_DEDUCTION = 20; // tunable default
export const PAGE_WEIGHT_LOW_BYTES = 1_000_000; // tunable default — bytes > this (and <= high)
export const PAGE_WEIGHT_LOW_DEDUCTION = 10; // tunable default

export const RESPONSE_TIME_HIGH_MS = 4000; // tunable default — responseMs > this
export const RESPONSE_TIME_HIGH_DEDUCTION = 20; // tunable default
export const RESPONSE_TIME_LOW_MS = 1500; // tunable default — responseMs > this (and <= high)
export const RESPONSE_TIME_LOW_DEDUCTION = 10; // tunable default

// ── Category exclusion (D-4.1-01/D-4.1-02) ─────────────────────────
// Food-service is not a target vertical (low budget, reservation-driven —
// not buyers of Adashi website rebuilds). Configurable list, never inline
// strings at the call site (D-4.1-02) — geography/vertical are project
// parameters. Values are Overture `categories.primary` strings (the exact
// strings prospect-upsert.ts stores on prospects.category), matched
// case-insensitively by lib/triage-eligibility.ts. Seeded with the Overture
// "eat and drink" family; confirm against real data at Plan 02's checkpoint.
export const EXCLUDED_CATEGORIES: readonly string[] = [
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "coffee_shop",
  "fast_food_restaurant",
  "bakery",
  "bistro",
  "brasserie",
  "pizza_restaurant",
  "cafeteria",
  "food_court",
  "ice_cream_shop",
  "diner",
  "wine_bar",
  "tea_room",
  "snack_bar",
  "pancake_restaurant",
];
