import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendConfirmationEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { email, consent, company_size } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (!consent) {
      return NextResponse.json(
        { error: "Please accept the privacy policy to continue." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Fetch the scan
    const { data: scan, error: fetchError } = await supabase
      .from("scans")
      .select("id, url, domain, status, scores")
      .eq("id", id)
      .single();

    if (fetchError || !scan) {
      return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    }

    if (scan.status !== "quick_done") {
      return NextResponse.json(
        { error: "This scan is not ready for email submission." },
        { status: 400 }
      );
    }

    // Save email on the scan row
    await supabase
      .from("scans")
      .update({
        email,
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Create lead with GDPR consent timestamp
    const { error: leadError } = await supabase.from("leads").insert({
      scan_id: id,
      email,
      domain: scan.domain,
      gdpr_consent: true,
      consent_timestamp: new Date().toISOString(),
      ...(company_size ? { company_size } : {}),
    });

    if (leadError) {
      console.error("Failed to create lead:", leadError);
    }

    // Send confirmation email (fire-and-forget)
    sendConfirmationEmail({
      to: email,
      domain: scan.domain,
      scanId: id,
      quickScore: scan.scores?.overall ?? 0,
    }).catch((err) => console.error("Failed to send confirmation email:", err));

    // Trigger async full scan — must be awaited so Vercel doesn't terminate
    // the function before the request reaches Railway. The scanner returns
    // { accepted: true } immediately so this completes in < 2s.
    const scannerUrl = process.env.SCANNER_SERVICE_URL;
    const scannerKey = process.env.SCANNER_API_KEY;

    if (scannerUrl && scannerKey) {
      try {
        const triggerRes = await fetch(`${scannerUrl.replace(/\/$/, "")}/api/scan/full-async`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${scannerKey}`,
          },
          body: JSON.stringify({
            url: scan.url,
            scanId: id,
            maxPages: 10,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!triggerRes.ok) {
          throw new Error(`Scanner returned ${triggerRes.status}`);
        }
      } catch (err) {
        console.error("Failed to trigger full scan:", err);
        // Revert status so the user can retry — nothing is running
        await supabase
          .from("scans")
          .update({ status: "quick_done", updated_at: new Date().toISOString() })
          .eq("id", id);
        return NextResponse.json(
          { error: "Could not start the full scan. Please try again in a moment." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email submission error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
