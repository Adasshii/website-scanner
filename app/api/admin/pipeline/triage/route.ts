// Local-only trigger for scripts/triage-prospects.ts (see
// scripts/pipeline-runner.ts, spawned by streamPipelineRun). Same
// production guard as app/api/admin/pipeline/drain/route.ts: a bare 404
// before auth, before body parsing, before any child process (T-ntm-01).
// This route performs no validation of its own — parseTriageArgs, inside
// the spawned runner, is the single validator; an invalid flag value
// reaches it and comes back as an `error` NDJSON event, exactly as it does
// in the terminal.
import { NextRequest, NextResponse } from "next/server";
import { acquirePipelineLock, releasePipelineLock, streamPipelineRun } from "@/lib/pipeline-run";

export const runtime = "nodejs";

interface TriageRequestBody {
  dryRun?: boolean;
  limit?: number;
  cutoff?: number;
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

  let body: TriageRequestBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const flags: string[] = [];
  if (body.dryRun) flags.push("--dry-run");
  if (body.limit !== undefined) flags.push(`--limit=${body.limit}`);
  if (body.cutoff !== undefined) flags.push(`--cutoff=${body.cutoff}`);

  try {
    return streamPipelineRun("triage", flags);
  } catch (e) {
    releasePipelineLock();
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/pipeline/triage] error:", msg);
    return NextResponse.json({ error: "Triage failed to start", detail: msg }, { status: 500 });
  }
}
