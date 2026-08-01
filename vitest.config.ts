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

// JSX tests need a DOM (jsdom). The `unit` and `integration` projects stay
// deliberately `environment: "node"` — this glob is excluded from `unit`
// below so a `.test.tsx` file is never collected and run without a
// `document` (07-01).
const COMPONENT_GLOB = "**/*.test.tsx";

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
          // COMPONENT_GLOB excluded here too — without it, `unit` (no
          // `include`) would collect every `.test.tsx` file and run it under
          // `environment: "node"`, failing on a missing `document`.
          exclude: [...sharedExclude, INTEGRATION_GLOB, COMPONENT_GLOB],
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
      {
        // Do NOT spread sharedTestConfig here — its environment is "node"
        // and would override jsdom below.
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          include: [COMPONENT_GLOB],
          exclude: sharedExclude,
          globals: false,
          // globals: false means RTL's automatic per-test cleanup never
          // registers. Every component test MUST import `cleanup` from
          // "@testing-library/react" and call it in an explicit afterEach,
          // or DOM nodes leak across tests in the same file.
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
  // tsconfig.json sets "jsx": "preserve" (Next.js does its own JSX
  // transform at build time). This Vite version transforms via oxc (not
  // esbuild) and reads that same tsconfig, so it also leaves JSX
  // untransformed — crashing the "component" project's parser on the first
  // `.tsx` test file. Overriding oxc's jsx mode here is test-only — next
  // build never reads vitest.config.ts.
  oxc: {
    // rolldown's JsxOptions type dropped the bare `"automatic"` string
    // shorthand in favor of `{ runtime: "automatic" }` since this override
    // was first added (07-01) — a transitive dependency bump between then
    // and now (npm install pulled a newer rolldown/vite under the same
    // semver range) changed the accepted shape and broke `tsc --noEmit` /
    // `next build`'s type-check step. Same effect, current shape.
    jsx: { runtime: "automatic" },
  },
});
