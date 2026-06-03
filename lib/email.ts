import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";
import type { EmailType, QuickWin, Issue } from "@/types/scanner";

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "scan@adashi.io";
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://scan.adashi.io";

type Locale = "en" | "nl";

function normalizeLocale(locale?: string | null): Locale {
  return locale === "nl" ? "nl" : "en";
}

// ── Email event tracking ──────────────────────────────────────────────

async function trackEmailEvent(params: {
  scanId: string;
  email: string;
  emailType: EmailType;
  resendEmailId: string;
}): Promise<void> {
  try {
    const supabase = createServerClient();
    await supabase.from("email_events").insert({
      scan_id: params.scanId,
      email: params.email,
      email_type: params.emailType,
      resend_email_id: params.resendEmailId,
      status: "sent",
    });
  } catch (error) {
    console.error("[email] Failed to track email event:", error);
  }
}

// ── Localized strings ────────────────────────────────────────────────

const TEXT = {
  en: {
    confirmation: {
      subject: (domain: string) => `Your scan of ${domain} is running`,
      heading: (domain: string) => `Quick scan complete for ${domain}`,
      lead: (score: number, color: string) =>
        `Your quick score is <strong style="color:${color}">${score}/100</strong>. The full multi-page analysis is running in the background.`,
      reassurance: `You don't need to keep a page open. We'll email you the moment the full report is ready.`,
      cta: "View your report",
      footerScanned: (domain: string, url: string) =>
        `You're getting this because you scanned ${domain} on <a href="${url}" style="color:#006DFF;text-decoration:none;">scan.adashi.io</a>.`,
      footerQuestions: `Questions? Reply to this email or visit <a href="https://adashi.io" style="color:#006DFF;text-decoration:none;">adashi.io</a>.`,
    },
    reportReady: {
      subject: (domain: string) => `Your full report for ${domain} is ready`,
      heading: (domain: string) => `Your full report for ${domain} is ready`,
      summary: (pages: number, issues: number, criticalLine: string, score: number, color: string) =>
        `We scanned <strong>${pages} page${pages !== 1 ? "s" : ""}</strong> and found <strong>${issues} issue${issues !== 1 ? "s" : ""}</strong> (${criticalLine}). Your overall score is <strong style="color:${color}">${score}/100</strong>.`,
      criticalLabel: (n: number) => `${n} critical`,
      noCritical: "0 critical",
      statPages: "Pages scanned",
      statIssues: "Issues found",
      statScore: "Overall score",
      cta: "View full report",
      help: `Want help fixing these? <a href="https://adashi.io/contact" style="color:#006DFF;text-decoration:none;font-weight:600;">Book a free 15-min walkthrough</a> and we'll show you what to fix first.`,
    },
    followUp: {
      subject: (domain: string) => `One quick win to start with for ${domain}`,
      heading: "Reviewed your report yet?",
      intro: (domain: string) =>
        `We sent you a website report for <strong>${domain}</strong> a few days ago. Here's your #1 quick win:`,
      cta: "View your report",
      bookLink: "Book a free 15-min walkthrough →",
      help: "Want help implementing the fixes? We're here.",
    },
  },
  nl: {
    confirmation: {
      subject: (domain: string) => `Je scan van ${domain} draait`,
      heading: (domain: string) => `Snelle scan voltooid voor ${domain}`,
      lead: (score: number, color: string) =>
        `Je snelle score is <strong style="color:${color}">${score}/100</strong>. De volledige multi-pagina analyse draait nu op de achtergrond.`,
      reassurance: `Je hoeft geen pagina open te houden. Zodra je volledige rapport klaar is, ontvang je een e-mail.`,
      cta: "Bekijk je rapport",
      footerScanned: (domain: string, url: string) =>
        `Je ontvangt deze e-mail omdat je ${domain} hebt gescand op <a href="${url}" style="color:#006DFF;text-decoration:none;">scan.adashi.io</a>.`,
      footerQuestions: `Vragen? Beantwoord deze e-mail of bezoek <a href="https://adashi.io" style="color:#006DFF;text-decoration:none;">adashi.io</a>.`,
    },
    reportReady: {
      subject: (domain: string) => `Je volledige rapport voor ${domain} is klaar`,
      heading: (domain: string) => `Je volledige rapport voor ${domain} is klaar`,
      summary: (pages: number, issues: number, criticalLine: string, score: number, color: string) =>
        `We hebben <strong>${pages} pagina${pages !== 1 ? "'s" : ""}</strong> gescand en <strong>${issues} ${issues === 1 ? "probleem" : "problemen"}</strong> gevonden (${criticalLine}). Je totaalscore is <strong style="color:${color}">${score}/100</strong>.`,
      criticalLabel: (n: number) => `${n} kritiek`,
      noCritical: "0 kritiek",
      statPages: "Pagina's gescand",
      statIssues: "Problemen gevonden",
      statScore: "Totaalscore",
      cta: "Bekijk volledig rapport",
      help: `Hulp nodig bij het oplossen? <a href="https://adashi.io/contact" style="color:#006DFF;text-decoration:none;font-weight:600;">Boek een gratis kennismaking van 15 min</a> en we laten zien wat als eerste opgepakt moet worden.`,
    },
    followUp: {
      subject: (domain: string) => `Een quick win om mee te beginnen voor ${domain}`,
      heading: "Je rapport al doorgenomen?",
      intro: (domain: string) =>
        `Een paar dagen geleden hebben we je een website-rapport gestuurd voor <strong>${domain}</strong>. Dit is je belangrijkste quick win:`,
      cta: "Bekijk je rapport",
      bookLink: "Boek een gratis kennismaking van 15 min →",
      help: "Hulp nodig bij het doorvoeren van de fixes? We staan klaar.",
    },
  },
} as const;

// ── Confirmation email (sent when user submits email) ───────────────

export async function sendConfirmationEmail(params: {
  to: string;
  domain: string;
  scanId: string;
  quickScore: number;
  locale?: string;
}): Promise<string | null> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping confirmation email");
    return null;
  }

  const locale = normalizeLocale(params.locale);
  const { to, domain, scanId, quickScore } = params;
  const reportUrl = `${BASE_URL}/report/${scanId}`;

  const scoreColor =
    quickScore >= 80 ? "#16a34a" : quickScore >= 50 ? "#ca8a04" : "#dc2626";

  const { data, error } = await resend.emails.send({
    from: `Adashi Scanner <${FROM_EMAIL}>`,
    to,
    subject: TEXT[locale].confirmation.subject(domain),
    html: confirmationTemplate({ domain, reportUrl, quickScore, scoreColor, locale }),
  });

  if (error || !data?.id) {
    console.error("[email] Failed to send confirmation email:", JSON.stringify(error));
    return null;
  }

  await trackEmailEvent({
    scanId,
    email: to,
    emailType: "confirmation",
    resendEmailId: data.id,
  });

  console.log(`[email] Confirmation sent to ${to} for ${domain} (${locale})`);
  return data.id;
}

// ── Report-ready email (sent when full scan completes) ──────────────

export async function sendReportReadyEmail(params: {
  to: string;
  domain: string;
  scanId: string;
  overallScore: number;
  totalPages: number;
  totalIssues: number;
  criticalIssues: number;
  locale?: string;
}): Promise<string | null> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping report email");
    return null;
  }

  const locale = normalizeLocale(params.locale);
  const { to, domain, scanId, overallScore, totalPages, totalIssues, criticalIssues } = params;
  const reportUrl = `${BASE_URL}/report/${scanId}`;

  const scoreColor =
    overallScore >= 80 ? "#16a34a" : overallScore >= 50 ? "#ca8a04" : "#dc2626";

  const { data, error } = await resend.emails.send({
    from: `Adashi Scanner <${FROM_EMAIL}>`,
    to,
    subject: TEXT[locale].reportReady.subject(domain),
    html: reportReadyTemplate({
      domain,
      reportUrl,
      overallScore,
      scoreColor,
      totalPages,
      totalIssues,
      criticalIssues,
      locale,
    }),
  });

  if (error || !data?.id) {
    console.error("[email] Failed to send report-ready email:", JSON.stringify(error));
    return null;
  }

  await trackEmailEvent({
    scanId,
    email: to,
    emailType: "report_ready",
    resendEmailId: data.id,
  });

  console.log(`[email] Report-ready sent to ${to} for ${domain} (${locale})`);
  return data.id;
}

// ── Follow-up email (sent 3 days after report delivery) ─────────────

export async function sendFollowUpEmail(params: {
  to: string;
  domain: string;
  scanId: string;
  topQuickWin: QuickWin;
  locale?: string;
}): Promise<string | null> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping follow-up email");
    return null;
  }

  const locale = normalizeLocale(params.locale);
  const { to, domain, scanId, topQuickWin } = params;
  const reportUrl = `${BASE_URL}/report/${scanId}`;

  const { data, error } = await resend.emails.send({
    from: `Adashi Scanner <${FROM_EMAIL}>`,
    to,
    subject: TEXT[locale].followUp.subject(domain),
    html: followUpTemplate({ domain, reportUrl, topQuickWin, locale }),
  });

  if (error || !data?.id) {
    console.error("[email] Failed to send follow-up email:", error);
    return null;
  }

  await trackEmailEvent({
    scanId,
    email: to,
    emailType: "follow_up",
    resendEmailId: data.id,
  });

  console.log(`[email] Follow-up sent to ${to} for ${domain} (${locale})`);
  return data.id;
}

// ── Admin notification email (always in English) ────────────────────

export async function sendAdminNotificationEmail(params: {
  leadEmail: string;
  domain: string;
  scanId: string;
  leadId: string;
  overallScore: number;
  topIssues: Issue[];
  salesBrief: string;
}): Promise<string | null> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set, skipping admin notification");
    return null;
  }

  const adminEmail = process.env.ADMIN_EMAIL || "joshua@adashi.io";
  const { leadEmail, domain, scanId, leadId, overallScore, topIssues, salesBrief } = params;
  const reportUrl = `${BASE_URL}/report/${scanId}`;
  const adminUrl = `${BASE_URL}/admin/lead/${leadId}`;
  const adminSecret = process.env.ADMIN_SECRET_KEY || "";

  const { data, error } = await resend.emails.send({
    from: `Adashi Scanner <${FROM_EMAIL}>`,
    to: adminEmail,
    subject: `New lead: ${domain}, Score: ${overallScore}/100`,
    html: adminNotificationTemplate({
      leadEmail,
      domain,
      reportUrl,
      adminUrl: `${adminUrl}?key=${adminSecret}`,
      overallScore,
      topIssues,
      salesBrief,
    }),
  });

  if (error || !data?.id) {
    console.error("[email] Failed to send admin notification:", JSON.stringify(error));
    return null;
  }

  await trackEmailEvent({
    scanId,
    email: adminEmail,
    emailType: "admin_notification",
    resendEmailId: data.id,
  });

  console.log(`[email] Admin notification sent for ${domain}`);
  return data.id;
}

// ── HTML Templates ──────────────────────────────────────────────────

function confirmationTemplate(params: {
  domain: string;
  reportUrl: string;
  quickScore: number;
  scoreColor: string;
  locale: Locale;
}) {
  const { domain, reportUrl, quickScore, scoreColor, locale } = params;
  const T = TEXT[locale].confirmation;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="text-align:center;margin-bottom:32px;">
        <span style="font-size:24px;font-weight:700;color:#001D4E;">Adashi</span>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:80px;height:80px;line-height:80px;border-radius:50%;background:${scoreColor}15;color:${scoreColor};font-size:28px;font-weight:700;">
          ${quickScore}
        </div>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;color:#001D4E;text-align:center;">
        ${T.heading(domain)}
      </h1>
      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6;">
        ${T.lead(quickScore, scoreColor)}
      </p>

      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6;">
        ${T.reassurance}
      </p>

      <div style="text-align:center;margin-bottom:32px;">
        <a href="${reportUrl}" style="display:inline-block;background:#006DFF;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;">
          ${T.cta}
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
        ${T.footerScanned(domain, reportUrl)}
        <br>${T.footerQuestions}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function reportReadyTemplate(params: {
  domain: string;
  reportUrl: string;
  overallScore: number;
  scoreColor: string;
  totalPages: number;
  totalIssues: number;
  criticalIssues: number;
  locale: Locale;
}) {
  const { domain, reportUrl, overallScore, scoreColor, totalPages, totalIssues, criticalIssues, locale } = params;
  const T = TEXT[locale].reportReady;
  const Tc = TEXT[locale].confirmation;

  const criticalLine =
    criticalIssues > 0
      ? `<span style="color:#dc2626;font-weight:600;">${T.criticalLabel(criticalIssues)}</span>`
      : `<span style="color:#16a34a;font-weight:600;">${T.noCritical}</span>`;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="text-align:center;margin-bottom:32px;">
        <span style="font-size:24px;font-weight:700;color:#001D4E;">Adashi</span>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;width:80px;height:80px;line-height:80px;border-radius:50%;background:${scoreColor}15;color:${scoreColor};font-size:28px;font-weight:700;">
          ${overallScore}
        </div>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;color:#001D4E;text-align:center;">
        ${T.heading(domain)}
      </h1>
      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6;">
        ${T.summary(totalPages, totalIssues, criticalLine, overallScore, scoreColor)}
      </p>

      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background:#f8fafc;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#001D4E;">${totalPages}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${T.statPages}</div>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#001D4E;">${totalIssues}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${T.statIssues}</div>
        </div>
        <div style="flex:1;background:#f8fafc;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:${scoreColor};">${overallScore}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">${T.statScore}</div>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="${reportUrl}" style="display:inline-block;background:#006DFF;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;">
          ${T.cta}
        </a>
      </div>

      <p style="margin:0 0 24px;color:#64748b;text-align:center;font-size:14px;line-height:1.6;">
        ${T.help}
      </p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
        ${Tc.footerScanned(domain, reportUrl)}
        <br>${Tc.footerQuestions}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function followUpTemplate(params: {
  domain: string;
  reportUrl: string;
  topQuickWin: QuickWin;
  locale: Locale;
}) {
  const { domain, reportUrl, topQuickWin, locale } = params;
  const T = TEXT[locale].followUp;
  const Tc = TEXT[locale].confirmation;

  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="text-align:center;margin-bottom:32px;">
        <span style="font-size:24px;font-weight:700;color:#001D4E;">Adashi</span>
      </div>

      <h1 style="margin:0 0 16px;font-size:22px;color:#001D4E;text-align:center;">
        ${T.heading}
      </h1>

      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6;">
        ${T.intro(domain)}
      </p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="font-weight:700;color:#166534;margin-bottom:8px;">${topQuickWin.title}</div>
        <div style="color:#15803d;font-size:14px;line-height:1.5;margin-bottom:8px;">${topQuickWin.description}</div>
        <div style="display:flex;gap:12px;font-size:12px;">
          <span style="background:#dcfce7;color:#166534;padding:4px 8px;border-radius:6px;">${topQuickWin.estimatedTime}</span>
          <span style="color:#15803d;">${topQuickWin.expectedImpact}</span>
        </div>
      </div>

      <p style="margin:0 0 24px;color:#64748b;text-align:center;line-height:1.6;">
        ${T.help}
      </p>

      <div style="text-align:center;margin-bottom:16px;">
        <a href="${reportUrl}" style="display:inline-block;background:#006DFF;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:16px;">
          ${T.cta}
        </a>
      </div>

      <div style="text-align:center;margin-bottom:24px;">
        <a href="https://adashi.io/contact" style="color:#006DFF;text-decoration:none;font-weight:600;font-size:14px;">
          ${T.bookLink}
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">

      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;line-height:1.5;">
        ${Tc.footerScanned(domain, reportUrl)}
        <br>${Tc.footerQuestions}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function adminNotificationTemplate(params: {
  leadEmail: string;
  domain: string;
  reportUrl: string;
  adminUrl: string;
  overallScore: number;
  topIssues: Issue[];
  salesBrief: string;
}) {
  const { leadEmail, domain, reportUrl, adminUrl, overallScore, topIssues, salesBrief } = params;

  const scoreColor =
    overallScore >= 80 ? "#16a34a" : overallScore >= 50 ? "#ca8a04" : "#dc2626";

  const issuesList = topIssues
    .slice(0, 3)
    .map((i) => `<li style="margin-bottom:4px;color:#334155;">[${i.severity}] ${i.title}</li>`)
    .join("");

  const salesBriefHtml = salesBrief
    .split("\n")
    .map((line) => `<p style="margin:0 0 6px;color:#334155;font-size:14px;line-height:1.5;">${line}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:16px;padding:40px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:24px;font-weight:700;color:#001D4E;">Adashi</span>
        <span style="font-size:14px;color:#64748b;display:block;margin-top:4px;">New Lead Alert</span>
      </div>

      <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:700;color:#001D4E;font-size:18px;">${domain}</div>
            <div style="color:#64748b;font-size:14px;margin-top:2px;">${leadEmail}</div>
          </div>
          <div style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:${scoreColor}15;color:${scoreColor};font-size:22px;font-weight:700;text-align:center;">
            ${overallScore}
          </div>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-weight:600;color:#001D4E;margin-bottom:8px;">Top Issues</div>
        <ul style="margin:0;padding-left:20px;font-size:14px;">
          ${issuesList}
        </ul>
      </div>

      <div style="margin-bottom:24px;">
        <div style="font-weight:600;color:#001D4E;margin-bottom:8px;">Sales Brief</div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px;">
          ${salesBriefHtml}
        </div>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <a href="${reportUrl}" style="flex:1;display:block;background:#006DFF;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 16px;border-radius:12px;font-size:14px;text-align:center;">
          View full report
        </a>
        <a href="${adminUrl}" style="flex:1;display:block;background:#001D4E;color:#ffffff;font-weight:600;text-decoration:none;padding:14px 16px;border-radius:12px;font-size:14px;text-align:center;">
          Open admin
        </a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
