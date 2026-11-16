import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { writeSuppression } from "@/lib/suppression";
import { normalizeDomain } from "@/lib/domain-normalize";
import { ADASHI_LOGO_SVG } from "@/lib/adashi-logo-svg";

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

/**
 * One Adashi-branded page (brand: #006DFF blue, #001D4E gulf, Helvetica Neue).
 * Plain HTML with inline CSS: no app shell, no scripts, no external requests.
 * All text passed in is fixed copy from this file, never user input.
 */
function renderPage(lang: string, title: string, heading: string, body: string, ok: boolean): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} · Adashi</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#001D4E;color:#001D4E;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;-webkit-font-smoothing:antialiased}
  .logo{color:#fff;width:132px;margin-bottom:32px}
  .logo svg{display:block;width:100%;height:auto}
  .card{background:#fff;border-radius:16px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.25)}
  .mark{width:56px;height:56px;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;background:${ok ? "#006DFF" : "#E8F1FF"};color:${ok ? "#fff" : "#006DFF"}}
  .mark svg{width:28px;height:28px}
  h1{font-size:24px;line-height:1.25;font-weight:700;margin:0 0 12px;letter-spacing:-.01em}
  p{font-size:16px;line-height:1.55;margin:0;color:rgba(0,29,78,.78)}
  .back{display:inline-block;margin-top:28px;color:#006DFF;font-weight:600;text-decoration:none}
  .back:hover,.back:focus-visible{text-decoration:underline}
  .foot{margin-top:24px;font-size:13px;color:rgba(255,255,255,.7)}
</style>
</head>
<body>
<div class="logo">${ADASHI_LOGO_SVG}</div>
<main class="card">
  <div class="mark" aria-hidden="true">${
    ok
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6"/><path d="M12 17h.01"/></svg>'
  }</div>
  <h1>${heading}</h1>
  <p>${body}</p>
  <a class="back" href="https://adashi.io">adashi.io</a>
</main>
<p class="foot">Adashi · scan@adashi.io</p>
</body>
</html>`;
}

function renderConfirmationHtml(countryCode: string | null): string {
  const { heading, body, lang } = unsubscribeCopy(countryCode);
  return renderPage(lang, heading, heading, body, true);
}

function renderInvalidLinkHtml(): string {
  return renderPage(
    "nl",
    "Ongeldige link",
    "Ongeldige link / Invalid link",
    "Deze uitschrijflink is ongeldig. Mail naar scan@adashi.io, dan schrijven we je met de hand uit. / This unsubscribe link is invalid. Email scan@adashi.io and we will unsubscribe you by hand.",
    false
  );
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
