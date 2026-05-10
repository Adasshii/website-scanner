# Scan Results Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the quick scan results page from a single-column card stack to a two-column layout with a sticky sidebar (overall score + category bars + CTA) and a main content area starting with a live screenshot of the scanned website.

**Architecture:** Add a dedicated `homepage_screenshot_url` column to the `scans` table so any consumer (email, report, results page) can access it without parsing the JSONB `screenshots` blob. Thread the URL through the scan API route into the page, then pass it as a new prop to `ScanResults`. Redesign `ScanResults` with a sticky sidebar (score, six category bars, CTA) and a scrollable main column (screenshot hero, verdict, revenue impact, issues, teasers, email gate).

**Tech Stack:** Next.js 15 (App Router), Tailwind CSS, Supabase (PostgreSQL), TypeScript

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/006_homepage_screenshot.sql` | CREATE — adds `homepage_screenshot_url TEXT` column |
| `types/scanner.ts` | MODIFY — add `homepage_screenshot_url` to `ScanRow` |
| `app/api/scan/route.ts` | MODIFY — extract URL from screenshots, write + return it |
| `app/scan/[id]/page.tsx` | MODIFY — add `homepage_screenshot_url` to `ScanData`, pass as prop |
| `components/scan/scan-results.tsx` | MODIFY — full layout redesign (sidebar + main) |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/006_homepage_screenshot.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/006_homepage_screenshot.sql
ALTER TABLE scans ADD COLUMN IF NOT EXISTS homepage_screenshot_url TEXT;
```

- [ ] **Step 2: Apply the migration to the local/dev database**

```bash
supabase db push
```

Expected: migration applies cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_homepage_screenshot.sql
git commit -m "feat: add homepage_screenshot_url column to scans table"
```

---

## Task 2: Update ScanRow Type

**Files:**
- Modify: `types/scanner.ts` (after line 275, inside `ScanRow`)

Current last field in `ScanRow` (around line 276):
```typescript
  design_ai_analyzed_at: string | null;
}
```

- [ ] **Step 1: Add `homepage_screenshot_url` to `ScanRow`**

In `types/scanner.ts`, find the `ScanRow` interface. Add the new field after `design_ai_analyzed_at`:

```typescript
  /** When the design AI analysis was last generated */
  design_ai_analyzed_at: string | null;
  /** Public URL of the scanned homepage screenshot for display */
  homepage_screenshot_url: string | null;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/scanner.ts
git commit -m "feat: add homepage_screenshot_url to ScanRow type"
```

---

## Task 3: Populate homepage_screenshot_url in the Scan API Route

**Files:**
- Modify: `app/api/scan/route.ts`

The `screenshots` returned from the scanner service is `Record<string, ScreenshotInfo>` where each value has a `.url` string. The first entry is always the scanned homepage.

- [ ] **Step 1: Extract the homepage URL helper**

In `app/api/scan/route.ts`, after the import block, add a one-line helper above the `POST` function:

```typescript
function extractHomepageScreenshotUrl(
  screenshots: Record<string, { url: string }> | null | undefined
): string | null {
  if (!screenshots) return null;
  const first = Object.values(screenshots)[0];
  return first?.url ?? null;
}
```

- [ ] **Step 2: Add to the cached scan SELECT query**

Find the cached scan select (around line 66). Add `homepage_screenshot_url` to the column list:

```typescript
    const { data: cached } = await supabase
      .from("scans")
      .select("id, url, domain, type, status, scores, pages, summary, started_at, completed_at, screenshots, cost_estimate, quick_wins, website_personality, homepage_screenshot_url")
```

- [ ] **Step 3: Include in cached scan response**

Find the `if (cached && cached.scores)` block (around line 74). Add `homepageScreenshotUrl` to the returned object:

```typescript
    if (cached && cached.scores) {
      return NextResponse.json({
        id: cached.id,
        url: cached.url,
        domain: cached.domain,
        type: cached.type as "quick" | "full",
        status: cached.status as "quick_done" | "completed",
        startedAt: cached.started_at,
        completedAt: cached.completed_at,
        scores: cached.scores,
        pages: cached.pages,
        summary: cached.summary,
        screenshots: cached.screenshots,
        costEstimate: cached.cost_estimate,
        quickWins: cached.quick_wins,
        websitePersonality: cached.website_personality,
        homepageScreenshotUrl: cached.homepage_screenshot_url ?? null,
        cached: true,
      });
    }
```

- [ ] **Step 4: Add `homepage_screenshot_url: null` to the INSERT**

Find the `supabase.from("scans").insert({...})` block (around line 98). Add the new column:

```typescript
    const { error: insertError } = await supabase.from("scans").insert({
      id: scanId,
      url,
      domain,
      type: "quick",
      status: "scanning",
      scores: null,
      summary: null,
      pages: [],
      started_at: startedAt,
      completed_at: null,
      ip_hash: ipHash,
      email: null,
      error_message: null,
      updated_at: startedAt,
      screenshots: null,
      cost_estimate: null,
      quick_wins: null,
      website_personality: null,
      sales_brief: null,
      design_ai_analysis: null,
      design_ai_analyzed_at: null,
      homepage_screenshot_url: null,
    } satisfies Omit<ScanRow, "created_at">);
```

- [ ] **Step 5: Compute and write the URL on scan completion**

Find the `supabase.from("scans").update({...})` block (around line 136). Add the computed URL:

```typescript
    const homepageScreenshotUrl = extractHomepageScreenshotUrl(result.screenshots);

    const { error: updateError } = await supabase
      .from("scans")
      .update({
        status: "quick_done",
        scores: result.scores,
        summary: result.summary,
        pages: result.pages,
        screenshots: result.screenshots || null,
        cost_estimate: result.costEstimate || null,
        quick_wins: result.quickWins || null,
        website_personality: result.websitePersonality || null,
        homepage_screenshot_url: homepageScreenshotUrl,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq("id", scanId);
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/scan/route.ts
git commit -m "feat: extract and persist homepage_screenshot_url on scan completion"
```

---

## Task 4: Thread screenshotUrl into the Scan Page

**Files:**
- Modify: `app/scan/[id]/page.tsx`

- [ ] **Step 1: Add `homepage_screenshot_url` to the `ScanData` interface**

Find the `interface ScanData` block (line 8). Add the field:

```typescript
interface ScanData {
  id: string;
  url: string;
  domain: string;
  status: string;
  scores: ScanScores | null;
  summary: ScanSummary | null;
  pages: Array<{ issues: Issue[]; scores: ScanScores }>;
  created_at: string;
  design_ai_analyzed_at: string | null;
  cost_estimate: CostEstimate | null;
  quick_wins: QuickWin[] | null;
  website_personality: string | null;
  homepage_screenshot_url: string | null;
}
```

- [ ] **Step 2: Pass `screenshotUrl` prop to `ScanResults`**

Find the `<ScanResults ... />` JSX (around line 83). Add the new prop:

```tsx
        <ScanResults
          scanId={scanData.id}
          domain={scanData.domain}
          scores={scanData.scores}
          summary={scanData.summary}
          issues={allIssues}
          scannedAt={scanData.created_at}
          status={scanData.status as "quick_done" | "completed"}
          designAnalysisPending={designAnalysisPending}
          costEstimate={scanData.cost_estimate}
          quickWins={scanData.quick_wins}
          websitePersonality={scanData.website_personality}
          screenshotUrl={scanData.homepage_screenshot_url}
        />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: one error — `screenshotUrl` prop not yet on `ScanResultsProps`. That's expected; Task 5 fixes it.

- [ ] **Step 4: Commit after Task 5 makes it type-safe**

Hold this commit until after Task 5.

---

## Task 5: Redesign ScanResults — Two-Column Layout

**Files:**
- Modify: `components/scan/scan-results.tsx`

This is the main visual change. The component gets a sticky sidebar (score + category bars + CTA) on the left at desktop, a scrollable main column on the right. Mobile shows a compact score strip at the top instead of the sidebar.

### Step-by-step

- [ ] **Step 1: Add `screenshotUrl` to the props interface and destructure it**

Replace the `ScanResultsProps` interface (lines 11–23):

```typescript
interface ScanResultsProps {
  scanId: string;
  domain: string;
  scores: ScanScores;
  summary: ScanSummary;
  issues: Issue[];
  scannedAt: string;
  status: ScanStatus;
  designAnalysisPending?: boolean;
  costEstimate?: CostEstimate | null;
  quickWins?: QuickWin[] | null;
  websitePersonality?: string | null;
  screenshotUrl?: string | null;
}
```

Replace the function signature (line 25):

```typescript
export function ScanResults({
  scanId, domain, scores, summary, issues, scannedAt,
  status, designAnalysisPending, costEstimate, quickWins,
  websitePersonality, screenshotUrl,
}: ScanResultsProps) {
```

- [ ] **Step 2: Add two helper functions after the `personalityText` variable**

After the `personalityText` line (around line 65), add:

```typescript
  function barColor(score: number): string {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  }

  function scoreTextColor(score: number): string {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-500";
  }

  const grade = scores.overall >= 80 ? "Good" : scores.overall >= 60 ? "Needs improvement" : "Poor";
  const gradeBadgeClass = scores.overall >= 80
    ? "bg-green-100 text-green-700"
    : scores.overall >= 60
      ? "bg-orange-100 text-orange-700"
      : "bg-red-100 text-red-700";

  const categories = [
    { label: "Usability", score: scores.accessibility },
    { label: "Content", score: scores.content },
    { label: "SEO", score: scores.seo },
    { label: "Performance", score: scores.performance },
    { label: "Security", score: scores.security ?? 0 },
    { label: "Design", score: scores.design ?? 0, pending: designAnalysisPending },
  ];
```

- [ ] **Step 3: Remove unused imports**

`ScoreRing` and `ScoreRingSmall` are no longer used. Remove them from the import on line 4:

```typescript
import { EmailGate } from "@/components/scan/email-gate";
import { BlurredSection } from "@/components/scan/blurred-section";
import { IssueCard } from "@/components/scan/issue-card";
import type { ScanScores, ScanSummary, Issue, ScanStatus, CostEstimate, QuickWin } from "@/types/scanner";
import { useRouter } from "next/navigation";
```

- [ ] **Step 4: Replace the entire JSX return with the new two-column layout**

Replace everything from `return (` to the closing `);` (lines 67–290) with:

```tsx
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">

      {/* Page header */}
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl sm:text-3xl text-adashi-gulf mb-2">Scan Results</h1>
        <p className="text-gray-500">
          <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {domain}
          </a>
          {" "}&middot;{" "}
          Scanned {new Date(scannedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Mobile score strip — visible only below lg */}
      <div className="lg:hidden bg-white rounded-2xl shadow-card p-4 mb-6 flex items-center gap-4">
        <div className="text-center flex-shrink-0">
          <span className={`text-4xl font-bold font-display ${scoreTextColor(scores.overall)}`}>
            {scores.overall}
          </span>
          <span className="text-gray-400 text-xs block">/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${gradeBadgeClass}`}>
            {grade}
          </span>
          <p className="text-xs text-gray-500 leading-snug truncate">{summary.verdict}</p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="lg:flex lg:gap-8 lg:items-start">

        {/* ── Sidebar ─────────────────────────────── */}
        <aside className="hidden lg:block w-64 xl:w-72 flex-shrink-0">
          <div className="sticky top-6 space-y-4">

            {/* Score + category bars */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="text-center mb-5">
                <div className={`text-6xl font-bold font-display ${scoreTextColor(scores.overall)}`}>
                  {scores.overall}
                </div>
                <div className="text-sm text-gray-400 mb-2">/100</div>
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${gradeBadgeClass}`}>
                  {grade}
                </span>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                {categories.map((cat) => (
                  <div key={cat.label} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-[72px] flex-shrink-0">{cat.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      {cat.pending ? (
                        <div className="h-full w-full bg-gray-200 animate-pulse rounded-full" />
                      ) : (
                        <div
                          className={`h-full rounded-full transition-all ${barColor(cat.score)}`}
                          style={{ width: `${cat.score}%` }}
                        />
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-7 text-right">
                      {cat.pending ? "..." : cat.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sidebar CTA */}
            {isQuickDone && (
              <div className="bg-adashi-gulf rounded-2xl p-5 text-center">
                <p className="text-adashi-pastel text-sm mb-3 leading-relaxed">
                  Unlock your full breakdown and all quick wins
                </p>
                <a
                  href="#email-gate"
                  className="block bg-adashi-blue hover:bg-adashi-science text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors"
                >
                  Get full report
                </a>
              </div>
            )}

          </div>
        </aside>

        {/* ── Main content ─────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Scan failure notice */}
          {scanFailed && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 flex gap-3">
              <span className="text-orange-500 text-xl leading-none">&#9888;</span>
              <div>
                <p className="font-semibold text-orange-800 mb-1">We couldn&apos;t fully scan this website</p>
                <p className="text-orange-700 text-sm leading-relaxed">
                  Our scanner wasn&apos;t able to load <strong>{domain}</strong>. This usually happens with very heavy
                  websites, sites that block automated tools, or pages that require a login. The scores below reflect
                  what we could measure before the error occurred.
                </p>
              </div>
            </div>
          )}

          {/* Website screenshot hero */}
          {screenshotUrl && (
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <div className="relative">
                <img
                  src={screenshotUrl}
                  alt={`Homepage of ${domain}`}
                  className="w-full object-cover object-top"
                  style={{ maxHeight: "260px" }}
                />
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent" />
              </div>
              <div className="px-5 py-3 flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400 flex-shrink-0" />
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-400 hover:text-adashi-gulf transition-colors truncate"
                >
                  {domain}
                </a>
              </div>
            </div>
          )}

          {/* Verdict */}
          <div className="bg-white rounded-2xl shadow-card p-6">
            <p className="text-gray-600 leading-relaxed">{summary.verdict}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
              <span>{summary.totalIssues} issues found</span>
              {summary.criticalIssues > 0 && (
                <span className="text-red-600 font-medium">{summary.criticalIssues} critical</span>
              )}
              {summary.majorIssues > 0 && (
                <span className="text-orange-600 font-medium">{summary.majorIssues} major</span>
              )}
            </div>
          </div>

          {/* Revenue Impact */}
          {isQuickDone && costEstimate && (
            <div className="bg-white rounded-2xl shadow-card p-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Revenue impact</p>
              <div className="flex items-end gap-4 mb-2">
                <span className="font-display text-6xl sm:text-7xl font-bold text-red-500 leading-none">
                  {costEstimate.totalLostPercent}%
                </span>
                <span className="text-gray-500 text-sm pb-2 leading-snug">
                  of potential<br />customers lost
                </span>
              </div>
              <p className="text-sm text-gray-400 mb-6">
                Estimated based on your performance, SEO, and usability scores.
              </p>
              <div className="relative">
                <div className="blur-[3px] pointer-events-none select-none space-y-3" aria-hidden="true">
                  {(costEstimate.factors.length > 0 ? costEstimate.factors : [{}, {}, {}]).slice(0, 3).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-3 bg-red-100 rounded-full" style={{ width: `${68 - i * 16}%` }} />
                      <span className="text-sm font-medium text-gray-400 w-12">
                        -{(costEstimate.totalLostPercent * (0.5 - i * 0.13)).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 bg-white/95 border border-gray-200 px-3 py-1.5 rounded-full shadow-sm">
                    <svg className="w-3.5 h-3.5 text-adashi-gulf" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-xs font-medium text-adashi-gulf">Full breakdown below</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top Issues */}
          {topIssues.length > 0 && (
            <div>
              <h2 className="font-semibold text-adashi-gulf text-lg mb-4">
                Top Issues
                {isQuickDone && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    (showing {topIssues.length} of {sortedIssues.length})
                  </span>
                )}
              </h2>
              <div className="space-y-3">
                {topIssues.map((issue, i) => (
                  <IssueCard key={`${issue.id}-${i}`} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Quick Wins + Personality teasers */}
          {isQuickDone && (
            <div className="space-y-4">

              {/* Quick wins tease */}
              <div className="bg-white rounded-2xl shadow-card p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Quick wins</p>
                    <h3 className="font-semibold text-adashi-gulf">{quickWinsData.length} actionable fixes identified</h3>
                  </div>
                </div>
                <div className="space-y-2">
                  {quickWinsData.map((win, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-3 flex items-center gap-3">
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-lg whitespace-nowrap flex-shrink-0">
                        {win.estimatedTime}
                      </span>
                      <p className="flex-1 text-sm font-medium text-adashi-gulf blur-sm select-none" aria-hidden="true">
                        {win.title}
                      </p>
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  ))}
                </div>
              </div>

              {/* Website personality tease */}
              <div className="bg-white rounded-2xl shadow-card p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Website personality</p>
                    <h3 className="font-semibold text-adashi-gulf">How visitors perceive {domain}</h3>
                  </div>
                </div>
                <div className="relative overflow-hidden" style={{ maxHeight: "4.5rem" }}>
                  <p className="text-gray-600 leading-relaxed text-sm">{personalityText.slice(0, 180)}</p>
                  <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent" />
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Full assessment unlocked with your report</span>
                </div>
              </div>

            </div>
          )}

          {/* Email Gate + Blurred Section */}
          {isQuickDone && (
            <div id="email-gate" className="space-y-6">
              <EmailGate
                scanId={scanId}
                onFullScanComplete={() => router.refresh()}
              />
              <BlurredSection issues={teaserIssues} />
            </div>
          )}

          {/* Bottom CTA */}
          <div className="bg-adashi-gulf text-white rounded-2xl p-6 sm:p-8 text-center">
            <h2 className="font-display text-xl sm:text-2xl mb-2">Want help fixing these issues?</h2>
            <p className="text-adashi-pastel mb-4">
              Book a free strategy call with Adashi and we&apos;ll walk you through the fixes.
            </p>
            <a
              href="https://adashi.io/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-adashi-blue hover:bg-adashi-science text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              Book a free call
            </a>
          </div>

        </div>
      </div>
    </div>
  );
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit Tasks 4 + 5 together**

```bash
git add app/scan/[id]/page.tsx components/scan/scan-results.tsx
git commit -m "feat: two-column scan results layout with sidebar scores and screenshot hero"
```

---

## Verification

Run a fresh quick scan and check all of the following:

- [ ] Screenshot appears at the top of the main content column, showing the actual scanned site
- [ ] Sidebar is visible at desktop (lg+) with overall score, grade badge, and six category bars
- [ ] Sidebar is hidden on mobile; compact score strip appears instead
- [ ] Sidebar CTA "Get full report" scrolls to the email gate section
- [ ] Category bars are color-coded: green >= 80, amber 60-79, red < 60
- [ ] Design bar shows animated pulse when `designAnalysisPending` is true, then fills in after polling refresh
- [ ] Revenue Impact, Quick Wins, Personality teasers all render correctly in the main column
- [ ] No TypeScript errors: `npx tsc --noEmit` passes clean
- [ ] On an existing cached scan (no `homepage_screenshot_url` in DB), screenshot section is simply absent (graceful null handling)
- [ ] `supabase/migrations/006_homepage_screenshot.sql` has been applied to production before deploying
