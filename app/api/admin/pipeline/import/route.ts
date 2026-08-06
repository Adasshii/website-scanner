// Local-only trigger for scripts/import-prospects.ts (see
// scripts/pipeline-runner.ts, spawned by streamPipelineRun). Same
// production guard as the drain/triage routes: a bare 404 before auth,
// before body parsing, before any child process (T-ntm-01). This route
// performs no validation of its own — parseImportArgs, inside the spawned
// runner, is the single validator; an invalid value reaches it and comes
// back as an `error` NDJSON event, exactly as it does in the terminal.
//
// This route never imports @/scripts/import-prospects or
// @/lib/overture-client as a value — only path strings cross into
// streamPipelineRun. A value import would pull @duckdb/node-api into the
// Next server bundle and defeat the whole reason this route spawns a
// child process instead of calling the script in-process (see
// lib/overture-client.ts's doc comment).
import { NextRequest, NextResponse } from "next/server";
import { acquirePipelineLock, releasePipelineLock, streamPipelineRun } from "@/lib/pipeline-run";

export const runtime = "nodejs";

interface ImportRequestBody {
  country?: string;
  region?: string;
  category?: string;
  dryRun?: boolean;
  limit?: number;
  campaignTag?: string;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!acquirePipelineLock()) {
    return NextResponse.json(
      { error: "A pipeline run is already in progress" },
      { status: 409 }
    );
  }

  let body: ImportRequestBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const flags: string[] = [];
  if (body.country) flags.push(`--country=${body.country}`);
  if (body.region) flags.push(`--region=${body.region}`);
  if (body.category) flags.push(`--category=${body.category}`);
  if (body.dryRun) flags.push("--dry-run");
  if (body.limit !== undefined) flags.push(`--limit=${body.limit}`);
  if (body.campaignTag) flags.push(`--campaign-tag=${body.campaignTag}`);

  try {
    return streamPipelineRun("import", flags);
  } catch (e) {
    releasePipelineLock();
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/pipeline/import] error:", msg);
    return NextResponse.json({ error: "Import failed to start", detail: msg }, { status: 500 });
  }
}
