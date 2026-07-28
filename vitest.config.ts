import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// ponytail: exclude nested git worktrees under .claude/worktrees/ — without
// this, vitest's positional-arg filter matches the same test file inside a
// sibling worktree too, running both copies concurrently against the same
// shared local Supabase and racing on domain inserts.
const sharedExclude = [...configDefaults.exclude, "**/.claude/worktrees/**"];

// Every *.integration.test.ts file talks to the SAME local Supabase Postgres
// (127.0.0.1:54321). Their fixture prefixes are disjoint, but the functions
// under test read those tables globally — getTriageCandidates() selects every
// prospect with a null scan_released_at, the drain and outreach queues claim
// whatever is queued — so one file's fixtures land in another file's
// assertions whenever the two run at the same time. Vitest runs test files in
// parallel by default, which is what made the suite fail intermittently on a
// random subset of the integration files.
const INTEGRATION_GLOB = "**/*.integration.test.ts";

// Node test environment (no jsdom) — these tests are Node-side logic and DB
// integration, not browser/DOM code.
const sharedTestConfig = {
  environment: "node" as const,
  globals: false,
};

export default defineConfig({
  test: {
    // Root-only option (cannot be set per project). Vitest exits 1 on an
    // empty suite by default; 01-02's acceptance criteria requires a clean
    // exit with 0 tests.
    passWithNoTests: true,
    projects: [
      {
        // `extends: true` inherits this file's resolve.alias, so `@/...`
        // imports keep resolving inside both projects.
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "unit",
          exclude: [...sharedExclude, INTEGRATION_GLOB],
        },
      },
      {
        extends: true,
        test: {
          ...sharedTestConfig,
          name: "integration",
          include: [INTEGRATION_GLOB],
          exclude: sharedExclude,
          // The fix: one integration file at a time against the shared DB.
          // Scoped to this project so the unit files keep running in
          // parallel — serialising the whole suite costs several times the
          // wall clock of the fast unit tests.
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's `@/*` -> root path alias.
      "@": path.resolve(__dirname, "."),
    },
  },
});
