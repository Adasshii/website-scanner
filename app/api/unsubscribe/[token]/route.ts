import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { writeSuppression } from "@/lib/suppression";
import { normalizeDomain } from "@/lib/domain-normalize";

export const runtime = "nodejs";

const SENDER_NAME = "Adashi";

type ResolveResult = { ok: true; country: string | null } | { ok: false };

/**
 * Verifies the token, resolves the prospect's email server-side (the email
 * never appears in the request), and writes the suppression synchronously —
 * the caller only gets `ok: true` after the write completes (D-01). A bad
 * token, an unknown prospect, or a prospect with no contact_email all fail
 * closed with no write (D-07: this route never touches prospects itself).
 */
async function resolveAndSuppress(token: string): Promise<ResolveResult> {
  const verified = verifyUnsubscribeToken(token);
  if (!verified) return { ok: false };

  const sb = createServerClient();
  const { data: prospect, error } = await sb
    .from("prospects")
    .select("contact_email, country")
    .eq("id", verified.prospectId)
    .maybeSingle();

  if (error || !prospect || !prospect.contact_email) return { ok: false };

  const email = prospect.contact_email as string;
  const domain = normalizeDomain(email);

  // D-02: check-then-write inside writeSuppression makes this idempotent —
  // a second click for the same email is a no-op that still succeeds.
  await writeSuppression(sb, {
    email,
    domain,
    reason: "unsubscribe",
    source: "unsubscribe_link",
  });

  return { ok: true, country: (prospect.country as string | null) ?? null };
}

function unsubscribeCopy(countryCode: string | null): { heading: string; body: string; lang: string } {
  const nl = {
    heading: "Je bent uitgeschreven",
    body: `Je ontvangt geen verdere berichten meer van ${SENDER_NAME}.`,
  };
  const en = {
    heading: "You've been unsubscribed",
    body: `You will not receive any further messages from ${SENDER_NAME}.`,
  };
  const [primary, secondary] = countryCode === "NL" ? [nl, en] : [en, nl];
  return {
    heading: `${primary.heading} / ${secondary.heading}`,
    body: `${primary.body} ${secondary.body}`,
    lang: countryCode === "NL" ? "nl" : "en",
  };
}

function renderConfirmationHtml(countryCode: string | null): string {
  const { heading, body, lang } = unsubscribeCopy(countryCode);
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${heading}</title></head>
<body>
<h1>${heading}</h1>
<p>${body}</p>
</body>
</html>`;
}

function renderInvalidLinkHtml(): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Invalid link</title></head>
<body>
<h1>Ongeldige link / Invalid link</h1>
<p>Deze uitschrijflink is ongeldig. / This unsubscribe link is invalid.</p>
</body>
</html>`;
}

function htmlResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
    console.error("[unsubscribe] UNSUBSCRIBE_TOKEN_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const { token } = await params;
    const result = await resolveAndSuppress(token);

    if (!result.ok) {
      return htmlResponse(renderInvalidLinkHtml(), 400);
    }

    return htmlResponse(renderConfirmationHtml(result.country), 200);
  } catch (error) {
    console.error("[unsubscribe] GET failed:", error);
    return NextResponse.json({ error: "Unsubscribe failed" }, { status: 500 });
  }
}

/**
 * RFC 8058 one-click List-Unsubscribe-Post: Gmail/Yahoo POST here with no
 * further confirmation step. Must return a bare 2xx and never redirect
 * (Pitfall 4) — mail clients treat a redirect as a broken one-click target.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
    console.error("[unsubscribe] UNSUBSCRIBE_TOKEN_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  try {
    const { token } = await params;
    const result = await resolveAndSuppress(token);

    return new NextResponse(null, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[unsubscribe] POST failed:", error);
    return new NextResponse(null, { status: 500 });
  }
}
