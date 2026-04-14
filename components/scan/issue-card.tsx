import type { Issue } from "@/types/scanner";

const severityStyles: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  major: "bg-orange-100 text-orange-700 border-orange-200",
  minor: "bg-yellow-100 text-yellow-700 border-yellow-200",
  info: "bg-blue-100 text-blue-700 border-blue-200",
};

const categoryLabels: Record<string, string> = {
  accessibility: "Accessibility",
  content: "Content",
  seo: "SEO",
  performance: "Performance",
};

function stripUrls(text: string): string {
  return text.replace(/Learn more:\s*https?:\/\/\S+/gi, "").replace(/https?:\/\/\S+/g, "").trim();
}

export function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
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
          </div>
          <h3 className="font-semibold text-adashi-gulf text-sm sm:text-base mb-1">
            {issue.title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">{stripUrls(issue.description)}</p>
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
