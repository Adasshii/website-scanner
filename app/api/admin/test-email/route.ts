import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret");
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "scan@adashi.io";
  const toEmail = process.env.ADMIN_EMAIL || "joshua@adashi.io";

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      error: "RESEND_API_KEY is not set in environment variables",
      env: { fromEmail, toEmail, apiKeySet: false },
    });
  }

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: `Adashi Scanner <${fromEmail}>`,
    to: toEmail,
    subject: "Test email from Adashi Scanner",
    html: `<p>This is a test email sent at ${new Date().toISOString()}.</p><p>If you received this, email sending is working correctly.</p>`,
  });

  if (error) {
    console.error("[test-email] Resend error:", JSON.stringify(error));
    return NextResponse.json({
      ok: false,
      error,
      env: { fromEmail, toEmail, apiKeySet: true },
    });
  }

  return NextResponse.json({
    ok: true,
    emailId: data?.id,
    sentFrom: fromEmail,
    sentTo: toEmail,
  });
}
