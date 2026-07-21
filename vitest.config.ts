import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Node test environment (no jsdom) — this phase's tests are Node-side logic
// and DB integration, not browser/DOM code.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // No test files exist yet in this plan (01-03/01-04 add them) — vitest
    // exits 1 on an empty suite by default; this plan's acceptance criteria
    // requires a clean exit with 0 tests.
    passWithNoTests: true,
    // ponytail: exclude nested git worktrees under .claude/worktrees/ —
    // without this, vitest's positional-arg filter matches the same test
    // file inside a sibling worktree too, running both copies concurrently
    // against the same shared local Supabase and racing on domain inserts.
    exclude: [...configDefaults.exclude, "**/.claude/worktrees/**"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's `@/*` -> root path alias.
      "@": path.resolve(__dirname, "."),
    },
  },
});
