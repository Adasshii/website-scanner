import type { OverturePlaceRow } from "@/types/scanner";

let counter = 0;

/**
 * Builds a synthetic OverturePlaceRow with sane, overridable defaults, so
 * unit and integration tests need no live Overture/DuckDB access.
 *
 * Each call produces a unique gersId by default so tests can generate
 * distinct rows without colliding — pass a shared `websiteUrl` (or the
 * domain it normalizes to) across two calls to exercise the domain-collapse
 * path, or a differing `country` to exercise the D-13 freeze/flag path.
 */
export function makeOverturePlace(overrides?: Partial<OverturePlaceRow>): OverturePlaceRow {
  counter += 1;
  return {
    gersId: `08f2rt0${counter}gers-fixture-${counter}`,
    name: `Test Business ${counter}`,
    address: "Damrak 1, 1012 Amsterdam",
    category: "professional_services",
    region: "NH",
    country: "NL",
    websiteUrl: `https://example-${counter}.test`,
    confidence: 0.9,
    ...overrides,
  };
}
