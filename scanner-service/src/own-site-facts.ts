import type { OwnSiteFacts, OwnSiteHarvest } from "../../types/own-site";

/** Skeleton for the RED commit: right exports, no extraction yet. */
export function extractOwnSiteFacts(
  harvest: OwnSiteHarvest | null,
  meta: { readAt: string; pagesRead?: number }
): OwnSiteFacts {
  void harvest;
  return {
    schemaVersion: 1,
    readAt: meta.readAt,
    pagesRead: meta.pagesRead ?? 1,
    structuredData: { jsonLdBlocks: 0, jsonLdInvalid: 0, microdataItems: 0 },
    business: { address: { state: "missing", reason: "no_structured_data" } },
  };
}
