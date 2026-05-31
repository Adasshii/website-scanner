import type { Issue } from "@/types/scanner";

const severityStyles: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  info: "bg-blue-50 text-blue-400 border-blue-100",
};

const difficultyStyles: Record<string, string> = {
  easy: "bg-green-50 text-green-600 border-green-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  hard: "bg-red-50 text-red-500 border-red-200",
};

const categoryLabels: Record<string, string> = {
  accessibility: "Accessibility",
  content: "Content",
  seo: "SEO",
  performance: "Performance",
  security: "Security",
  design: "UX & Conversion",
};

function stripUrls(text: string): string {
  return text.replace(/Learn more:\s*https?:\/\/\S+/gi, "").replace(/https?:\/\/\S+/g, "").trim();
}

export function IssueCard({ issue }: { issue: Issue }) {
  const isInfo = issue.severity === "info";

  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-5 ${isInfo ? "border-gray-100 opacity-80" : "border-gray-200"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${
                severityStyles[issue.severity] || severityStyles.info
              }`}
            >
              {issue.severity}
            </span>
            <span className="text-xs text-gray-400 font-medium">
              {categoryLabels[issue.category] || issue.category}
            </span>
            {issue.impact > 0 && (
              <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                -{issue.impact} pts
              </span>
            )}
            {issue.difficulty && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${difficultyStyles[issue.difficulty]}`}>
                {issue.difficulty.charAt(0).toUpperCase() + issue.difficulty.slice(1)} fix
              </span>
            )}
          </div>
          <h3 className={`font-semibold text-sm sm:text-base mb-1 ${isInfo ? "text-gray-400" : "text-adashi-gulf"}`}>
            {issue.title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">{stripUrls(issue.description)}</p>
          {issue.whyItMatters && (
            <p className="mt-2 text-sm text-gray-500 italic leading-relaxed">
              {issue.whyItMatters}
            </p>
          )}
          {issue.recommendation && (
            <p className="mt-2 text-sm text-adashi-blue/80 leading-relaxed">
              {stripUrls(issue.recommendation)}
            </p>
          )}
          {issue.axeRuleId && (
            <a
              href={`https://dequeuniversity.com/rules/axe/4.9/${issue.axeRuleId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-xs font-medium px-3 py-1 rounded-full border border-adashi-blue text-adashi-blue hover:bg-adashi-blue hover:text-white transition-colors"
            >
              Learn more
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
