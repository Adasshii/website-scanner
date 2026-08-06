// Local-only GET serving one region's slice of the committed category
// vocabulary cache (Task 2, 260806-p6f; D-03, D-04, T-p6f-01). This route
// ships inside the production bundle but is dead code there — the guard
// below is the literal first statement of the handler and returns a bare
// 404 before auth, before parsing query params, and before any disk read.
// It imports NOTHING from lib/overture-client.ts (transitively
// @duckdb/node-api), lib/supabase.ts, or lib/pipeline-run.ts — this route
// is a read of an already-generated JSON file and must stay callable while
// a pipeline run is in flight, so there is deliberately no
// acquirePipelineLock() here.
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATEGORY_CACHE_FILE, cacheKey, type CategoryCache } from "@/lib/overture-categories";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const country = request.nextUrl.searchParams.get("country");
  const region = request.nextUrl.searchParams.get("region");
  if (!country || !region) {
    return NextResponse.json(
      { error: "Both 'country' and 'region' query params are required" },
      { status: 400 }
    );
  }

  const key = cacheKey(country, region);
  const filePath = path.join(process.cwd(), CATEGORY_CACHE_FILE);

  let cache: CategoryCache;
  try {
    const raw = readFileSync(filePath, "utf-8");
    try {
      cache = JSON.parse(raw) as CategoryCache;
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[admin/pipeline/categories]", msg);
      return NextResponse.json({ error: "Category cache is corrupt", detail: msg }, { status: 500 });
    }
  } catch {
    // Missing file — the feature simply hasn't been seeded for any region
    // yet. 200 with an empty array, same as an unseeded key below.
    return NextResponse.json({ key, categories: [] });
  }

  return NextResponse.json({ key, categories: cache[key] ?? [] });
}
