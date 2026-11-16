---
quick_id: 261116-fmp
type: quick
---
# Atrium status route: read scans with no-store

The Atrium scan-status route answered "running" for scans the database had as completed (public status route proved it). Next.js served the first Supabase read from its Data Cache.

Task 1 (TDD): lib/supabase-no-store.test.ts asserts every createServerClient request uses cache: no-store; lib/supabase.ts passes a global fetch with cache: "no-store".
Task 2: clear the next lint errors in lib/scanner-scan-save.test.ts so `next build` passes locally.
Verify: npx vitest run --project unit; npx tsc --noEmit; npx next build.
