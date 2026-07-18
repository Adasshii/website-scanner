import path from "node:path";
import { defineConfig } from "vitest/config";

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
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's `@/*` -> root path alias.
      "@": path.resolve(__dirname, "."),
    },
  },
});
