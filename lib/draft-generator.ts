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
 *   - lib/draft-prompt.ts's buildDraftPrompt / parseDraftResponse /
 *     appendArticle14Notice / localeForCountry for the D-6-10 pitch, the
 *     model-authored subject (parsed with a buildDraftSubject() fallback,
 *     2026-07-28 Change B), and the D-6-12 legal notice.
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
  parseDraftResponse,
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
 * Same expression lib/email.ts uses, so a report link in a draft and the same
 * link in an email can never point at different hosts. Read from the env var
 * rather than hardcoded: hardcoding made the link unusable outside production,
 * which blocked the cited-number check (06-07 Task 3, check 4) locally.
 *
 * This is the site's own public URL, not a credential — the client-exposed-env
 * concern this module guards against is the Gemini key (T-06-KEY), which is
 * read only via the server-only GEMINI_API_KEY below.
 */
const REPORT_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://scan.adashi.io";

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
 * convention exactly (plain Promise.race), not the SDK's own request-timeout
 * option, so failure behaviour matches every other AI call site in this
 * codebase — but unlike a bare .catch(() => fallback), each of the three
 * failure shapes (no key, timeout, thrown error) logs its own distinct line
 * before returning null, so a config problem (missing GEMINI_API_KEY) is
 * never indistinguishable from a live API failure in the server log again
 * (found during 06 manual verification: all three collapsed into the same
 * "empty generation result" line).
 *
 * Exported (only) so its three failure branches are directly unit-testable
 * against a mocked @google/generative-ai — the DraftDeps.generate seam
 * bypasses this function entirely, so it's the only way to test them.
 */
export async function defaultGeminiGenerate(prompt: string): Promise<string | null> {
  const ai = getClient();
  if (!ai) {
    console.error(
      `[draft] GEMINI_API_KEY is not set in this runtime, so no draft can be generated`
    );
    return null;
  }

  const model = ai.getGenerativeModel({ model: MODEL_NAME });
  const TIMED_OUT = Symbol("draft-generate-timeout");

  let raced: Awaited<ReturnType<typeof model.generateContent>> | typeof TIMED_OUT;
  try {
    raced = await Promise.race([
      model.generateContent(prompt),
      new Promise<typeof TIMED_OUT>((resolve) =>
        setTimeout(() => resolve(TIMED_OUT), GENERATE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.error(`[draft] Gemini call threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  if (raced === TIMED_OUT) {
    console.error(`[draft] Gemini call timed out after ${GENERATE_TIMEOUT_MS}ms`);
    return null;
  }

  return raced.response.text().trim();
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
 * verify the number survived verbatim (DRA-02, fails closed — unrepairable);
 * parse the model's own subject/body out of the raw response, falling back
 * to the code-templated subject when the model ignores the contract
 * (2026-07-28 Change B); make sure the report link is present exactly once
 * (DRA-03, repaired if missing); append the Article 14 notice (DRA-05) so no
 * caller can produce a draft without it. Never throws.
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
  // Checked against the raw response (before SUBJECT/BODY parsing) so a
  // figure the model dropped into the subject line still counts.
  if (!raw.includes(metric.displayValue)) {
    console.error(
      `[draft] verbatim guard failed for scan ${scan.id}: model output did not reproduce "${metric.displayValue}"`
    );
    return null;
  }

  // 2026-07-28 (Change B): the model authors its own subject line per the
  // prompt's OUTPUT CONTRACT; parseDraftResponse() extracts it, falling
  // back to the code-templated buildDraftSubject() when the model ignores
  // the contract or produces something implausible.
  const parsed = parseDraftResponse(raw, prospect.domain, locale);

  // Report link: unlike the number above, a missing link IS repairable, so
  // this path fixes rather than rejects — deliberately asymmetric with the
  // guard above.
  const body = parsed.body.includes(reportUrl) ? parsed.body : `${parsed.body}\n\n${reportUrl}`;

  return {
    subject: parsed.subject,
    body: appendArticle14Notice(body, locale),
  };
}
