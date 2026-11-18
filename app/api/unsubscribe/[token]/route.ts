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

type Lang = "nl" | "en";

type PageCopy = { title: string; heading: string; body: string; help: string };

// One language per page, as on the scanner site (NL / EN switch). Joshua, 2026-11-16.
const COPY: Record<Lang, { ok: PageCopy; invalid: PageCopy; back: string; switchLabel: string }> = {
  nl: {
    ok: {
      title: "Je bent afgemeld",
      heading: "Je bent afgemeld",
      body: `Je krijgt geen e-mails meer van ${SENDER_NAME} op dit adres.`,
      help: "Was dit een vergissing? Mail naar <a href=\"mailto:scan@adashi.io\">scan@adashi.io</a>.",
    },
    invalid: {
      title: "Deze link werkt niet",
      heading: "Deze link werkt niet",
      body: "We konden je met deze link niet afmelden.",
      help: "Mail naar <a href=\"mailto:scan@adashi.io\">scan@adashi.io</a>, dan melden we je met de hand af.",
    },
    back: "Naar adashi.io",
    switchLabel: "Taal",
  },
  en: {
    ok: {
      title: "You are unsubscribed",
      heading: "You are unsubscribed",
      body: `You will not get any more emails from ${SENDER_NAME} at this address.`,
      help: "Was this a mistake? Email <a href=\"mailto:scan@adashi.io\">scan@adashi.io</a>.",
    },
    invalid: {
      title: "This link does not work",
      heading: "This link does not work",
      body: "We could not unsubscribe you with this link.",
      help: "Email <a href=\"mailto:scan@adashi.io\">scan@adashi.io</a> and we will unsubscribe you by hand.",
    },
    back: "Go to adashi.io",
    switchLabel: "Language",
  },
};

/** ?lang= wins (the switch), then the prospect's country, then the browser's language. */
function pickLang(request: NextRequest, countryCode: string | null): Lang {
  const asked = request.nextUrl.searchParams.get("lang");
  if (asked === "nl" || asked === "en") return asked;
  if (countryCode === "NL") return "nl";
  if (countryCode) return "en";
  return /^nl\b/i.test(request.headers.get("accept-language") ?? "") ? "nl" : "en";
}

/**
 * One Adashi-branded page (brand: #006DFF blue, #001D4E gulf, Helvetica Neue).
 * Plain HTML with inline CSS: no app shell, no scripts, no external requests.
 * All text is fixed copy from this file, never user input. The switch links
 * reload the same URL with ?lang=; the opt-out write is idempotent (D-02).
 */
function renderPage(lang: Lang, ok: boolean): string {
  const c = COPY[lang];
  const t = ok ? c.ok : c.invalid;
  const sw = (["nl", "en"] as const)
    .map((l) =>
      l === lang
        ? `<span class="on" aria-current="true">${l.toUpperCase()}</span>`
        : `<a href="?lang=${l}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`
    )
    .join("");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title} · Adashi</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#001D4E;color:#001D4E;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;-webkit-font-smoothing:antialiased}
  .top{width:100%;max-width:480px;display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .logo{color:#fff;width:120px}
  .logo svg{display:block;width:100%;height:auto}
  .switch{display:inline-flex;gap:2px;padding:2px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:600}
  .switch a,.switch span{padding:5px 11px;border-radius:999px;text-decoration:none;line-height:1}
  .switch a{color:rgba(255,255,255,.75)}
  .switch a:hover,.switch a:focus-visible{color:#fff}
  .switch .on{background:#006DFF;color:#fff}
  .card{background:#fff;border-radius:16px;max-width:480px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.25)}
  .mark{width:56px;height:56px;border-radius:50%;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;background:${ok ? "#006DFF" : "#E8F1FF"};color:${ok ? "#fff" : "#006DFF"}}
  .mark svg{width:28px;height:28px}
  h1{font-size:26px;line-height:1.2;font-weight:700;margin:0 0 12px;letter-spacing:-.01em}
  p{font-size:16px;line-height:1.55;margin:0;color:rgba(0,29,78,.78)}
  p.help{margin-top:16px;font-size:14px;color:rgba(0,29,78,.65)}
  p.help a{color:#006DFF}
  .back{display:inline-block;margin-top:28px;padding:12px 20px;border-radius:999px;background:#006DFF;color:#fff;font-weight:600;font-size:15px;text-decoration:none}
  .back:hover,.back:focus-visible{background:#0056E4}
</style>
</head>
<body>
<div class="top">
  <div class="logo">${ADASHI_LOGO_SVG}</div>
  <nav class="switch" aria-label="${c.switchLabel}">${sw}</nav>
</div>
<main class="card">
  <div class="mark" aria-hidden="true">${
    ok
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6"/><path d="M12 17h.01"/></svg>'
  }</div>
  <h1>${t.heading}</h1>
  <p>${t.body}</p>
  <p class="help">${t.help}</p>
  <a class="back" href="https://adashi.io">${c.back}</a>
</main>
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
  request: NextRequest,
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
      return htmlResponse(renderPage(pickLang(request, null), false), 400);
    }

    return htmlResponse(renderPage(pickLang(request, result.country), true), 200);
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
