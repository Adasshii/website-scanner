import { createServerClient } from "@/lib/supabase";

export default async function EmbedBadge({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  const supabase = createServerClient();
  const { data: scan } = await supabase
    .from("scans")
    .select("id, scores, status, created_at")
    .eq("domain", decodedDomain)
    .in("status", ["quick_done", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const score = scan?.scores?.overall ?? null;
  const scanId = scan?.id ?? null;
  const scanDate = scan
    ? new Date(scan.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const scoreColor =
    score === null
      ? "#94a3b8"
      : score >= 80
      ? "#16a34a"
      : score >= 50
      ? "#ca8a04"
      : "#dc2626";

  const bgColor =
    score === null
      ? "#f8fafc"
      : score >= 80
      ? "#f0fdf4"
      : score >= 50
      ? "#fefce8"
      : "#fef2f2";

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scan.adashi.io";
  const reportUrl = scanId ? `${baseUrl}/report/${scanId}` : `${baseUrl}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: transparent; }
        `}</style>
      </head>
      <body>
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            padding: "10px 16px",
            background: bgColor,
            border: `1px solid ${scoreColor}30`,
            borderRadius: "12px",
            textDecoration: "none",
            color: "#1e293b",
            transition: "box-shadow 0.2s",
          }}
        >
          {/* Score circle */}
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: `${scoreColor}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: scoreColor,
              }}
            >
              {score !== null ? score : "?"}
            </span>
          </div>

          {/* Text */}
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#001D4E" }}>
              {score !== null ? (
                <>
                  Website Score: <span style={{ color: scoreColor }}>{score}/100</span>
                </>
              ) : (
                "Not yet scanned"
              )}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {scanDate ? `Scanned ${scanDate}` : "Scan free at scan.adashi.io"}
              {" · "}
              <span style={{ color: "#006DFF" }}>Powered by Adashi</span>
            </div>
          </div>
        </a>
      </body>
    </html>
  );
}
