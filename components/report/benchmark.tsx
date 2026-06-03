"use client";

import { useTranslations } from "next-intl";
import type { ScanScores } from "@/types/scanner";

interface BenchmarkProps {
  scores: ScanScores;
}

const BENCHMARKS: Record<string, { typical: number; good: number }> = {
  overall: { typical: 62, good: 85 },
  performance: { typical: 58, good: 85 },
  seo: { typical: 62, good: 85 },
  accessibility: { typical: 60, good: 85 },
  content: { typical: 66, good: 85 },
  design: { typical: 60, good: 85 },
  security: { typical: 55, good: 90 },
};

const ORDER = ["overall", "performance", "seo", "accessibility", "content", "design", "security"];

function barColor(score: number, typical: number, good: number): string {
  if (score >= good) return "bg-green-500";
  if (score >= typical) return "bg-amber-400";
  return "bg-red-400";
}

export function BenchmarkSection({ scores }: BenchmarkProps) {
  const t = useTranslations("benchmark");
  const tCat = useTranslations("benchmark.category");
  const tV = useTranslations("benchmark.verdict");
  const tLeg = useTranslations("benchmark.legend");

  function verdict(score: number, typical: number, good: number) {
    if (score >= good) return { text: tV("strong"), className: "bg-green-100 text-green-700" };
    if (score >= typical) return { text: tV("average"), className: "bg-amber-100 text-amber-700" };
    return { text: tV("behind"), className: "bg-red-100 text-red-600" };
  }

  return (
    <section data-section="benchmark" className="bg-white rounded-2xl shadow-card p-5 sm:p-6 mb-6">
      <h2 className="font-semibold text-adashi-gulf text-base mb-1">{t("heading")}</h2>
      <p className="text-xs text-gray-500 leading-relaxed mb-4">{t("subheading")}</p>

      <div className="space-y-3">
        {ORDER.map((key) => {
          const bench = BENCHMARKS[key];
          const raw = (scores as unknown as Record<string, number | undefined>)[key];
          if (bench === undefined || raw === undefined) return null;
          const score = raw;
          const v = verdict(score, bench.typical, bench.good);

          return (
            <div key={key}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{tCat(key)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">{score}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.className}`}>
                    {v.text}
                  </span>
                </div>
              </div>

              <div className="relative h-2 rounded-full bg-gray-100">
                <div
                  className={`absolute left-0 top-0 h-2 rounded-full ${barColor(score, bench.typical, bench.good)}`}
                  style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
                <div
                  className="absolute top-[-2px] h-3 w-0.5 bg-gray-400"
                  style={{ left: `${bench.typical}%` }}
                  title={tLeg("typicalTooltip", { value: bench.typical })}
                />
                <div
                  className="absolute top-[-2px] h-3 w-0.5 bg-gray-600"
                  style={{ left: `${bench.good}%` }}
                  title={tLeg("wellBuiltTooltip", { value: bench.good })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-gray-400" /> {tLeg("typical")}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-gray-600" /> {tLeg("wellBuilt")}
        </span>
      </div>
    </section>
  );
}
