"use client";

import { DrainButton } from "@/components/admin/drain-button";

/**
 * The Pipeline tab body — the sixth admin tab (CONTEXT.md), local-only.
 * Lays the three controls out in pipeline order (Import -> Triage ->
 * Drain), each in its own bordered card. Task 1 wires only Drain; the
 * Import and Triage cards are placeholders here until Tasks 2 and 3 wire
 * scripts/pipeline-runner.ts through.
 *
 * The dev gate on this tab's *button* (app/admin/page.tsx) is cosmetic
 * defence only — it stops the buttons being visible on the deployed admin
 * page. The route-level NODE_ENV 404 in each of the three routes is the
 * real guard and holds on its own regardless of whether this tab renders.
 */
export function PipelineTab({ secret }: { secret: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        These controls only exist on the local development server (`next dev`). They 404 in
        production regardless of whether this tab is visible.
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="font-display text-lg text-adashi-gulf mb-1">Import prospects</h2>
        <p className="text-sm text-gray-500 mb-4">
          Pull businesses from Overture for a country/region/category. Coming in the next step.
        </p>
        <p className="text-xs text-gray-400">Not wired yet.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="font-display text-lg text-adashi-gulf mb-1">Run triage</h2>
        <p className="text-sm text-gray-500 mb-4">
          Score every untriaged prospect that has a domain. Coming in the next step.
        </p>
        <p className="text-xs text-gray-400">Not wired yet.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6">
        <h2 className="font-display text-lg text-adashi-gulf mb-1">Drain scan queue</h2>
        <p className="text-sm text-gray-500 mb-4">
          Run one paced drain tick — the same work Vercel Cron does every 10 minutes in
          production.
        </p>
        <DrainButton secret={secret} />
      </div>
    </div>
  );
}
