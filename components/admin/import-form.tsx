"use client";

import { useMemo, useState } from "react";
import {
  usePipelineRun,
  PipelineRunPanel,
  type PipelineStreamEvent,
  type RunOutcome,
} from "@/components/admin/pipeline-run";
import { COUNTRY_BBOXES, REGION_BBOXES } from "@/lib/overture-bboxes";

interface ImportResult {
  totalRows: number;
  hasDomainCount: number;
  noWebsiteCount: number;
  dryRun: boolean;
  created: number;
  collapsed: number;
  skipped: number;
}

const COUNTRIES = Object.keys(COUNTRY_BBOXES);

function regionsForCountry(country: string): string[] {
  const prefix = `${country}:`;
  return Object.keys(REGION_BBOXES)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

function toOutcome(
  finalEvent: PipelineStreamEvent | null,
  sawError: boolean,
  category: string
): RunOutcome {
  // "Stream ended with no result event" is itself a failure.
  if (sawError || !finalEvent || finalEvent.t !== "result") {
    return {
      tone: "error",
      headline: "Import failed",
      lines: [finalEvent?.message ?? "The run ended without a result — check the server console."],
    };
  }

  const result = finalEvent.result as ImportResult;

  if (result.totalRows === 0) {
    // The single most probable way this UI wastes time (CONTEXT.md) — must
    // be unmistakable, never confused with either failure or a real write.
    return {
      tone: "empty",
      headline: `The query matched zero places for category "${category}" — nothing was written.`,
      lines: ["Most likely cause: the category string doesn't match Overture's category column exactly."],
    };
  }

  const lines = [
    `with domain=${result.hasDomainCount}`,
    `no website=${result.noWebsiteCount}`,
  ];
  if (!result.dryRun) {
    lines.push(`created=${result.created}`, `collapsed=${result.collapsed}`, `skipped=${result.skipped}`);
  }

  return {
    tone: "ok",
    headline: `${result.totalRows} rows${result.dryRun ? " (dry run)" : ""}`,
    lines,
  };
}

/**
 * Import control — country/region dropdowns read directly from
 * lib/overture-bboxes.ts, the exact tables the importer resolves against
 * (CONTEXT.md: "never a hardcoded copy"). Category is free text — there is
 * no known-good category list in the repo, so a wrong string returns zero
 * rows rather than an error, which is why the zero-row result state below
 * is deliberately loud.
 */
export function ImportForm({ secret }: { secret: string }) {
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState("");
  const [campaignTag, setCampaignTag] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const { status, outcome, progress, logLines, runStream } = usePipelineRun({ secret });
  const running = status === "running";

  const regions = useMemo(() => (country ? regionsForCountry(country) : []), [country]);

  function handleCountryChange(next: string) {
    setCountry(next);
    setRegion(""); // clear a stale region selection when the country changes
  }

  const canSubmit = country.trim() && region.trim() && category.trim() && !running;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const body: {
      country: string;
      region: string;
      category: string;
      dryRun?: boolean;
      limit?: number;
      campaignTag?: string;
    } = { country, region, category };
    if (dryRun) body.dryRun = true;
    if (limit.trim()) body.limit = Number(limit);
    if (campaignTag.trim()) body.campaignTag = campaignTag.trim();

    await runStream("/api/admin/pipeline/import", body, (finalEvent, sawError) =>
      toOutcome(finalEvent, sawError, category)
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
        <label className="text-sm text-gray-600">
          Country
          <select
            value={country}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
          >
            <option value="">Select…</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Region
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={!country}
            className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-50"
          >
            <option value="">Select…</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          Category
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. hair_salon"
            className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Limit (optional)
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
          />
        </label>
        <label className="text-sm text-gray-600">
          Campaign tag (optional)
          <input
            type="text"
            value={campaignTag}
            onChange={(e) => setCampaignTag(e.target.value)}
            className="mt-1 block w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
          />
        </label>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Category is matched exactly against Overture&apos;s runtime-detected category column — a
        wrong string returns zero rows, not an error.
      </p>
      <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
        <input
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="rounded"
        />
        Dry run
      </label>
      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
      >
        {running
          ? progress
            ? `Importing… ${progress.done}/${progress.total}`
            : "Importing…"
          : dryRun
          ? "Import (dry run)"
          : "Import — writes to prospects"}
      </button>
      <PipelineRunPanel status={status} outcome={outcome} progress={progress} logLines={logLines} />
    </form>
  );
}
