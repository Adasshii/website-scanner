// Shared, dependency-free chunking helper. Moved out of lib/retention.ts
// (07-09, closing 07-REVIEW.md WR-02) so a second call site
// (lib/triage-candidates.ts) can reuse it without importing
// lib/retention-constants.ts, which resolves RETENTION_MODE and can
// console.warn at module scope — that side effect has no business running
// on every admin Shortlist load. This module imports nothing and reads no
// environment variable.
export function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}
