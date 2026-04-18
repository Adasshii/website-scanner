import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data: scan, error } = await supabase
      .from("scans")
      .select("status, error_message, updated_at, design_ai_analyzed_at, scores")
      .eq("id", id)
      .single();

    if (error || !scan) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    return NextResponse.json({
      status: scan.status,
      error_message: scan.error_message,
      updated_at: scan.updated_at,
      designReady: scan.design_ai_analyzed_at !== null,
      scores: scan.scores,
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
