import type { Page } from "playwright";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Issue, IssueOverlay } from "../../types/scanner";

/**
 * Upload a screenshot buffer to Supabase Storage.
 * Returns the storage path and public URL.
 */
export async function uploadScreenshot(
  supabase: SupabaseClient,
  scanId: string,
  pageIndex: number,
  buffer: Buffer
): Promise<{ path: string; url: string } | null> {
  const storagePath = `${scanId}/page-${pageIndex}.jpg`;

  const { error } = await supabase.storage
    .from("screenshots")
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    console.error(`[screenshots] Upload failed for ${storagePath}:`, error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("screenshots")
    .getPublicUrl(storagePath);

  return {
    path: storagePath,
    url: urlData.publicUrl,
  };
}

/**
 * Extract overlay positions for issues that have CSS selectors.
 * Must be called while the Playwright page is still open.
 */
export async function buildOverlayData(
  page: Page,
  issues: Issue[]
): Promise<IssueOverlay[]> {
  // Only process issues with selectors
  const issuesWithSelectors = issues.filter((i) => i.selector);
  if (issuesWithSelectors.length === 0) return [];

  try {
    const selectors = issuesWithSelectors.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      severity: i.severity,
      selector: i.selector!,
    }));

    const overlays = await page.evaluate((items) => {
      const results: Array<{
        issueId: string;
        issueTitle: string;
        category: string;
        severity: string;
        rect: { x: number; y: number; width: number; height: number };
        pageWidth: number;
        pageHeight: number;
      }> = [];

      const pageWidth = document.documentElement.scrollWidth;
      const pageHeight = document.documentElement.scrollHeight;

      for (const item of items) {
        try {
          const el = document.querySelector(item.selector);
          if (!el) continue;

          const rect = el.getBoundingClientRect();
          // Convert from viewport-relative to page-absolute
          const scrollX = window.scrollX;
          const scrollY = window.scrollY;

          results.push({
            issueId: item.id,
            issueTitle: item.title,
            category: item.category,
            severity: item.severity,
            rect: {
              x: Math.round(rect.x + scrollX),
              y: Math.round(rect.y + scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            pageWidth,
            pageHeight,
          });
        } catch {
          // Invalid selector — skip
        }
      }

      return results;
    }, selectors);

    return overlays as IssueOverlay[];
  } catch (error) {
    console.error("[screenshots] Failed to extract overlay positions:", error);
    return [];
  }
}
