import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const tab = url.searchParams.get("tab") || "scans";
  const limit = 20;
  const offset = (page - 1) * limit;

  // Stats
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalScans },
    { count: scansToday },
    { count: scansThisWeek },
    { count: totalLeads },
    { count: leadsThisWeek },
    { count: completedScans },
    { count: failedScans },
    { count: scansWithEmail },
    { count: scansWithEmailThisWeek },
  ] = await Promise.all([
    supabase.from("scans").select("*", { count: "exact", head: true }),
    supabase.from("scans").select("*", { count: "exact", head: true }).gte("created_at", todayStart),
    supabase.from("scans").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    supabase.from("scans").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("scans").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("scans").select("*", { count: "exact", head: true }).not("email", "is", null),
    supabase.from("scans").select("*", { count: "exact", head: true }).not("email", "is", null).gte("created_at", weekAgo),
  ]);

  // Compute average scores
  let averageScore: number | null = null;
  let averageScoreThisWeek: number | null = null;

  const { data: allScores } = await supabase
    .from("scans")
    .select("scores")
    .eq("status", "completed")
    .not("scores", "is", null);

  if (allScores && allScores.length > 0) {
    const sum = allScores.reduce((acc, s) => acc + (s.scores?.overall || 0), 0);
    averageScore = Math.round(sum / allScores.length);
  }

  const { data: weekScores } = await supabase
    .from("scans")
    .select("scores")
    .eq("status", "completed")
    .not("scores", "is", null)
    .gte("created_at", weekAgo);

  if (weekScores && weekScores.length > 0) {
    const sum = weekScores.reduce((acc, s) => acc + (s.scores?.overall || 0), 0);
    averageScoreThisWeek = Math.round(sum / weekScores.length);
  }

  // Conversion rates
  const total = totalScans || 0;
  const totalWeek = scansThisWeek || 0;
  const conversionRate = total > 0 ? Math.round(((scansWithEmail || 0) / total) * 100) : 0;
  const conversionRateThisWeek = totalWeek > 0 ? Math.round(((scansWithEmailThisWeek || 0) / totalWeek) * 100) : 0;

  // Paginated data
  let rows: unknown[] = [];
  let totalRows = 0;

  if (tab === "leads") {
    const { data: leadRows, count } = await supabase
      .from("leads")
      .select("*, scans!inner(id, scores, status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Fetch email events for these leads' scan_ids
    const scanIds = (leadRows || []).map((l: Record<string, unknown>) => l.scan_id as string).filter(Boolean);
    const emailEventsMap: Record<string, Array<{ email_type: string; status: string }>> = {};

    if (scanIds.length > 0) {
      const { data: emailEvents } = await supabase
        .from("email_events")
        .select("scan_id, email_type, status")
        .in("scan_id", scanIds);

      if (emailEvents) {
        for (const ev of emailEvents) {
          if (!emailEventsMap[ev.scan_id]) emailEventsMap[ev.scan_id] = [];
          emailEventsMap[ev.scan_id].push({ email_type: ev.email_type, status: ev.status });
        }
      }
    }

    // Merge email statuses into lead rows
    rows = (leadRows || []).map((lead: Record<string, unknown>) => ({
      ...lead,
      score: (lead.scans as Record<string, unknown>)?.scores ? ((lead.scans as Record<string, unknown>).scores as Record<string, number>)?.overall ?? null : null,
      scanStatus: (lead.scans as Record<string, unknown>)?.status ?? null,
      emailStatuses: emailEventsMap[lead.scan_id as string] || [],
    }));
    totalRows = count || 0;
  } else {
    const { data, count } = await supabase
      .from("scans")
      .select("id, url, domain, type, status, scores, email, created_at, completed_at, error_message", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    rows = data || [];
    totalRows = count || 0;
  }

  return NextResponse.json({
    stats: {
      totalScans: totalScans || 0,
      scansToday: scansToday || 0,
      scansThisWeek: scansThisWeek || 0,
      totalLeads: totalLeads || 0,
      leadsThisWeek: leadsThisWeek || 0,
      completedScans: completedScans || 0,
      failedScans: failedScans || 0,
      averageScore,
      averageScoreThisWeek,
      conversionRate,
      conversionRateThisWeek,
    },
    rows,
    totalRows,
    page,
    totalPages: Math.ceil(totalRows / limit),
  });
}
