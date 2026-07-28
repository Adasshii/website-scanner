/**
 * lib/draft-generator.ts — D-6-R5 / DRA-01 / DRA-02 / DRA-03 / DRA-05: turns
 * one completed scan into a reviewable cold-outreach draft. This is the
 * first Gemini call made from the Next.js/Vercel side of this codebase —
 * every other Gemini call lives in the always-on scanner-service on
 * Railway (scanner-service/src/ai.ts) — so no browser is involved (D-6-R5).
 *
 * Composes 06-01/06-03's pure modules and never reimplements their logic:
 *   - lib/draft-metric-selector.ts's selectCitableMetric() for the DRA-02
 *     evidence number the model must reproduce verbatim.
 *   - lib/draft-prompt.ts's buildDraftPrompt / buildDraftSubject /
 *     appendArticle14Notice / localeForCountry for the D-6-10 pitch and the
 *     D-6-12 legal notice.
 *   - lib/scoring.ts's computeVerdict() (DRA-06), the one consolidated
 *     verdict source.
 *   - lib/i18n-helpers.ts's applyIssuesAlt() so a Dutch draft never quotes
 *     English issue titles (RESEARCH Pitfall 7).
 *
 * Never throws to its caller: a Gemini failure, timeout, or guard failure
 * all resolve to null, matching every other AI call site in this codebase.
 * This module is always awaited by its caller — nothing here is scheduled
 * to run after a response has been sent, since Vercel's execution
 * environment can freeze between the response and a deferred callback.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScanScores, ScanSummary, PageResult, IssuesAlt } from "@/types/scanner";
import { selectCitableMetric } from "@/lib/draft-metric-selector";
import {
  buildDraftPrompt,
  buildDraftSubject,
  appendArticle14Notice,
  localeForCountry,
  type Locale,
} from "@/lib/draft-prompt";
import { computeVerdict } from "@/lib/scoring";
import { applyIssuesAlt } from "@/lib/i18n-helpers";

export interface DraftInput {
  prospect: {
    name: string | null;
    domain: string;
    country: string;
    contact_email: string | null;
  };
  scan: {
    id: string;
    scores: ScanScores | null;
    summary: ScanSummary | null;
    pages: PageResult[];
    /** Applied via lib/i18n-helpers.ts's applyIssuesAlt so drafts never quote the wrong locale's issue titles. */
    issues_alt?: IssuesAlt | null;
  };
}

/** DI seam mirroring lib/bulk-scan-dispatch.ts's DispatchDeps convention — deterministic tests, no live Gemini call. */
export interface DraftDeps {
  generate?: (prompt: string) => Promise<string | null>;
}

export interface GeneratedDraft {
  subject: string;
  body: string;
}

/**
 * Same production host lib/email.ts falls back to (that module's site-URL
 * env var default). Read as a literal constant here rather than via that
 * env var, so this module keeps zero references to any client-exposed
 * environment variable name — the only environment variable this module
 * ever reads is the server-only Gemini API key. This repo has never
 * overridden that public default in practice, so the two hosts cannot drift.
 */
const REPORT_BASE_URL = "https://scan.adashi.io";

/** DRA-03: always code-constructed from BASE_URL + the scan id, never a URL taken from scanned page content. */
export function buildReportUrl(scanId: string): string {
  return `${REPORT_BASE_URL}/report/${scanId}`;
}

// ── Gemini call: lazy client, plain Promise.race timeout, never throws ──

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const GENERATE_TIMEOUT_MS = 45000;
const MODEL_NAME = "gemini-2.5-flash";

/**
 * Default Gemini call. Follows scanner-service/src/ai.ts's withTimeoutLocal
 * convention exactly (plain Promise.race + .catch fallback), not the SDK's
 * own request-timeout option, so failure behaviour matches every other AI
 * call site in this codebase.
 */
async function defaultGeminiGenerate(prompt: string): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  const model = ai.getGenerativeModel({ model: MODEL_NAME });

  const withTimeoutLocal = <T>(p: Promise<T>, fallback: T): Promise<T> => {
    return Promise.race<T>([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), GENERATE_TIMEOUT_MS)),
    ]).catch(() => fallback);
  };

  const result = await withTimeoutLocal(model.generateContent(prompt), null);
  return result ? result.response.text().trim() : null;
}

// ── Locale-correct top issue titles (RESEARCH Pitfall 7) ────────────────

function resolveTopIssueTitles(
  pages: PageResult[],
  summary: ScanSummary | null,
  issuesAlt: IssuesAlt | null | undefined,
  locale: Locale
): string[] {
  if (!summary) return [];
  const localizedPages = applyIssuesAlt(pages, issuesAlt ?? null, locale);
  const titleById = new Map<string, string>();
  for (const page of localizedPages) {
    for (const issue of page.issues) {
      titleById.set(issue.id, issue.title);
    }
  }
  return summary.topIssues.slice(0, 3).map((issue) => titleById.get(issue.id) ?? issue.title);
}

// ── generateDraft ─────────────────────────────────────────────────────

/**
 * Turns a completed scan into a reviewable draft, or null. Order: resolve
 * locale from the prospect's own country, never the scan row's own stored
 * locale field (D-6-09, RESEARCH Pitfall 4 — bulk scans always carry the
 * default 'en' primary locale and put the true target language in
 * issues_alt); localize the top
 * issue titles; compute the one true verdict (DRA-06); pick the DRA-02
 * evidence number (no evidence, no draft); build and send the prompt;
 * verify the number survived verbatim (DRA-02, fails closed — unrepairable)
 * and the report link is present exactly once (DRA-03, repaired if
 * missing); append the Article 14 notice (DRA-05) so no caller can produce
 * a draft without it. Never throws.
 */
export async function generateDraft(
  input: DraftInput,
  deps: DraftDeps = {}
): Promise<GeneratedDraft | null> {
  const generate = deps.generate ?? defaultGeminiGenerate;
  const { prospect, scan } = input;

  const locale = localeForCountry(prospect.country);
  const businessName = prospect.name ?? prospect.domain;

  if (!scan.scores) {
    console.error(`[draft] no scores for scan ${scan.id}, skipping`);
    return null;
  }

  const metric = selectCitableMetric(scan.scores, scan.summary, scan.pages, locale);
  if (!metric) {
    console.error(`[draft] no citable metric for scan ${scan.id}, skipping (no evidence, no draft)`);
    return null;
  }

  const verdict = computeVerdict(scan.scores, scan.summary?.criticalIssues ?? 0);
  const topIssueTitles = resolveTopIssueTitles(scan.pages, scan.summary, scan.issues_alt, locale);
  const reportUrl = buildReportUrl(scan.id);

  const prompt = buildDraftPrompt({
    businessName,
    domain: prospect.domain,
    locale,
    metric,
    verdict,
    topIssueTitles,
    reportUrl,
  });

  let raw: string | null;
  try {
    raw = await generate(prompt);
  } catch (err) {
    console.error(`[draft] generate() threw for scan ${scan.id}:`, err instanceof Error ? err.message : err);
    return null;
  }

  if (!raw || !raw.trim()) {
    console.error(`[draft] empty generation result for scan ${scan.id}`);
    return null;
  }

  // Verbatim guard (DRA-02): a wrong number is unrepairable in code, so a
  // paraphrased/rounded figure is treated exactly like a generation
  // failure. Regenerate (D-6-14) is the recovery path, not a repair here.
  if (!raw.includes(metric.displayValue)) {
    console.error(
      `[draft] verbatim guard failed for scan ${scan.id}: model output did not reproduce "${metric.displayValue}"`
    );
    return null;
  }

  // Report link: unlike the number above, a missing link IS repairable, so
  // this path fixes rather than rejects — deliberately asymmetric with the
  // guard above.
  const body = raw.includes(reportUrl) ? raw : `${raw}\n\n${reportUrl}`;

  return {
    subject: buildDraftSubject(prospect.domain, locale),
    body: appendArticle14Notice(body, locale),
  };
}
