import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

// Mocks are hoisted above imports by vitest regardless of file position —
// written here, at the top, for readability. Neither mock is ever expected
// to be called by anything this file exercises: every scenario below stops
// at the NODE_ENV guard or the admin-secret check, before real work starts.
const createServerClientMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
  createBrowserClient: vi.fn(),
}));

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

type PostHandler = (req: NextRequest) => Promise<Response>;

/**
 * Table-driven guard proving T-ntm-01/02/04 hold on every local-only
 * pipeline route: a bare 404 before auth, before any DB client, and before
 * any child process, whenever NODE_ENV is not "development". Task 1 seeds
 * this with the drain route; Tasks 2 and 3 append one entry each for
 * triage and import. All six assertions run unchanged against every entry.
 */
interface RouteUnderTest {
  name: string;
  importRoute: () => Promise<{ POST: PostHandler }>;
  filePath: string;
}

const ROUTES: RouteUnderTest[] = [
  {
    name: "drain",
    importRoute: () => import("@/app/api/admin/pipeline/drain/route"),
    filePath: path.join(process.cwd(), "app/api/admin/pipeline/drain/route.ts"),
  },
  {
    name: "triage",
    importRoute: () => import("@/app/api/admin/pipeline/triage/route"),
    filePath: path.join(process.cwd(), "app/api/admin/pipeline/triage/route.ts"),
  },
  {
    name: "import",
    importRoute: () => import("@/app/api/admin/pipeline/import/route"),
    filePath: path.join(process.cwd(), "app/api/admin/pipeline/import/route.ts"),
  },
];

// Markers checked by Test 6 (structural). A marker absent from a given
// route's handler body is skipped, not failed — e.g. the drain route never
// calls request.json().
const STRUCTURAL_MARKERS = [
  "ADMIN_SECRET",
  "request.json",
  "createServerClient",
  "spawn",
  "acquirePipelineLock",
];

const CORRECT_SECRET = "correct-secret-for-guard-test";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/admin/pipeline/test", {
    method: "POST",
    headers,
  });
}

describe("pipeline route production guard", () => {
  for (const route of ROUTES) {
    describe(route.name, () => {
      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it("Test 1: production NODE_ENV + CORRECT secret -> bare 404, empty body", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("ADMIN_SECRET", CORRECT_SECRET);
        const { POST } = await route.importRoute();
        const res = await POST(makeRequest({ "x-admin-secret": CORRECT_SECRET }));
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("");
      });

      it("Test 2: production NODE_ENV + WRONG secret -> 404, NOT 401", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("ADMIN_SECRET", CORRECT_SECRET);
        const { POST } = await route.importRoute();
        const res = await POST(makeRequest({ "x-admin-secret": "wrong-secret" }));
        expect(res.status).toBe(404);
      });

      it("Test 3: vitest's default test NODE_ENV -> 404 (proves !== 'development', not === 'production')", async () => {
        // Deliberately no NODE_ENV stub here.
        const { POST } = await route.importRoute();
        const res = await POST(makeRequest());
        expect(res.status).toBe(404);
      });

      it("Test 4: no Supabase client and no child process constructed across every production-NODE_ENV case above", () => {
        expect(createServerClientMock).not.toHaveBeenCalled();
        expect(spawnMock).not.toHaveBeenCalled();
      });

      it("Test 5: development NODE_ENV + WRONG secret -> 401 (guard did not blanket-404 the route)", async () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("ADMIN_SECRET", CORRECT_SECRET);
        const { POST } = await route.importRoute();
        const res = await POST(makeRequest({ "x-admin-secret": "wrong-secret" }));
        expect(res.status).toBe(401);
      });

      it("Test 6 (structural): NODE_ENV check precedes every present guard marker in the POST handler body", () => {
        const source = readFileSync(route.filePath, "utf-8");
        const start = source.indexOf("export async function POST");
        expect(start).toBeGreaterThanOrEqual(0);
        const body = source.slice(start);

        const nodeEnvIndex = body.indexOf("NODE_ENV");
        expect(nodeEnvIndex).toBeGreaterThanOrEqual(0);

        for (const marker of STRUCTURAL_MARKERS) {
          const markerIndex = body.indexOf(marker);
          if (markerIndex === -1) continue; // marker absent from this route — skip, don't fail
          expect(nodeEnvIndex).toBeLessThan(markerIndex);
        }
      });
    });
  }
});
