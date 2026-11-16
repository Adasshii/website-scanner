/**
 * Spot a page that is a block page, not the site itself. Reasons are fixed
 * wording: the page's own title and text belong to a third party and must not
 * reach reports or the admin view.
 */
const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);

// Real cases: EW Loodgieters and F&N Lekdetectie (403 titles), Asp Bouw (Cloudflare body).
const BLOCK_WORDING =
  /403\W*forbidden|access to this page is forbidden|you have been blocked|attention required|just a moment|access denied/i;

const BODY_WINDOW = 500;

export function detectBlockedPage(status: number, title: string, bodyText: string): string | null {
  if (BLOCKED_STATUSES.has(status)) return `The site refused the scanner (HTTP ${status}).`;
  if (BLOCK_WORDING.test(title) || BLOCK_WORDING.test(bodyText.slice(0, BODY_WINDOW))) {
    return "The site served a block page instead of its content.";
  }
  return null;
}
