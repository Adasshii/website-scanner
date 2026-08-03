# Fix Report-Ready Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every lead receives the report-ready email after their full scan completes, both by fixing the production callback URL and adding a cron safety net for missed deliveries.

**Architecture:** The scanner service on Railway calls back to `/api/internal/scan-complete` when a full scan finishes. That endpoint sends the report-ready email via Resend. If `CALLBACK_URL` is wrong or the HTTP call fails, the email is silently dropped. This plan fixes the env var and adds a cron that catches any slipped-through cases.

**Tech Stack:** Next.js 14 (App Router), Railway (scanner service), Vercel (Next.js app), Supabase, Resend, TypeScript

---

## Context: The Three-Email Sequence

| # | Email | Trigger | Status |
|---|-------|---------|--------|
| 1 | Confirmation | User submits email gate | Working |
| 2 | Report-ready | Scanner service POST `/api/internal/scan-complete` | Broken in prod |
| 3 | Follow-up | Cron — 3 days after report_ready delivered | Working (but depends on #2) |

**Root cause of #2 being broken:** `CALLBACK_URL` in Railway env vars points to `http://localhost:3002` (local dev value). In production it must be `https://scan.adashi.io`.

---

## File Structure

- **Modify:** `scanner-service/.env` — document the required prod var (local dev only, not deployed)
- **Create:** `app/api/cron/send-pending-reports/route.ts` — safety net cron
- **Modify:** `vercel.json` — add the new cron schedule

---

## Task 1: Fix CALLBACK_URL in Railway

This is an environment variable change in the Railway dashboard, not a code change.

- [ ] **Step 1: Open Railway dashboard**

  Go to your Railway project → the scanner service → Variables tab.

- [ ] **Step 2: Set the variable**

  Add or update:
  ```
  CALLBACK_URL=https://scan.adashi.io
  ```

  The scanner service reads this at line 624 of `scanner-service/src/index.ts`:
  ```ts
  const callbackUrl = process.env.CALLBACK_URL;
  const apiKey = process.env.SCANNER_API_KEY;
  if (callbackUrl && apiKey) {
    fetch(`${callbackUrl.replace(/\/$/, "")}/api/internal/scan-complete`, { ... })
  }
  ```
  If `CALLBACK_URL` is unset or wrong, the block is silently skipped.

- [ ] **Step 3: Redeploy the scanner service**

  Railway auto-deploys on variable changes. Confirm the deploy completes.

- [ ] **Step 4: Smoke test**

  Run a scan at `https://scan.adashi.io`, submit an email, wait 5-10 minutes, and confirm you receive the report-ready email. Check Supabase `email_events` table for a row with `email_type = 'report_ready'`.

- [ ] **Step 5: Update local .env comment**

  In `scanner-service/.env`, update the comment so future devs know what to set in prod:

  ```
  # Callback URL for email notifications (Next.js app URL)
  # Local dev: http://localhost:3002
  # Production (Railway): https://scan.adashi.io
  CALLBACK_URL=http://localhost:3002
  ```

---

## Task 2: Safety-net cron for missed report emails

The callback can still fail (network timeout, Railway restart mid-scan, Vercel cold start). This cron runs hourly, finds completed scans with no report_ready email event, and sends those emails.

**Files:**
- Create: `app/api/cron/send-pending-reports/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Check the vercel.json crons config**

  Read `vercel.json` to see the existing cron format before editing.

  Expected output: a `crons` array with at least the follow-up cron entry.

- [ ] **Step 2: Create the cron route**

  Create `app/api/cron/send-pending-reports/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { createServerClient } from "@/lib/supabase";
  import { sendReportReadyEmail } from "@/lib/email";

  export const runtime = "nodejs";
  export const maxDuration = 60;

  /**
   * Safety-net cron: send report-ready emails for completed scans
   * that never triggered the callback (e.g. Railway restart, network timeout).
   *
   * Runs hourly. Only processes scans completed in the last 24 hours
   * to avoid spamming old leads.
   */
  export async function GET(request: NextRequest) {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerClient();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      // Find completed scans with an email but no report_ready event
      const { data: completedScans } = await supabase
        .from("scans")
        .select("id, email, domain, scores, summary, locale")
        .eq("status", "completed")
        .not("email", "is", null)
        .not("scores", "is", null)
        .not("summary", "is", null)
        .gte("completed_at", oneDayAgo);

      if (!completedScans || completedScans.length === 0) {
        return NextResponse.json({ sent: 0, message: "No pending reports" });
      }

      // Filter out scans that already have a report_ready email event
      const scanIds = completedScans.map((s) => s.id);
      const { data: existingEvents } = await supabase
        .from("email_events")
        .select("scan_id")
        .eq("email_type", "report_ready")
        .in("scan_id", scanIds);

      const alreadySent = new Set((existingEvents || []).map((e) => e.scan_id));
      const pending = completedScans.filter((s) => !alreadySent.has(s.id));

      if (pending.length === 0) {
        return NextResponse.json({ sent: 0, message: "All reports already sent" });
      }

      // Limit to 10 per run to stay within maxDuration
      const batch = pending.slice(0, 10);
      let sentCount = 0;

      for (const scan of batch) {
        if (!scan.email || !scan.scores || !scan.summary) continue;

        await sendReportReadyEmail({
          to: scan.email,
          domain: scan.domain,
          scanId: scan.id,
          overallScore: scan.scores.overall,
          totalPages: scan.summary.totalPages,
          totalIssues: scan.summary.totalIssues,
          criticalIssues: scan.summary.criticalIssues,
          locale: scan.locale ?? "en",
        });

        sentCount++;
      }

      return NextResponse.json({
        sent: sentCount,
        pending: pending.length,
        message: `Sent ${sentCount} pending report emails`,
      });
    } catch (error) {
      console.error("[cron/send-pending-reports] Error:", error);
      return NextResponse.json(
        { error: "Pending reports cron failed" },
        { status: 500 }
      );
    }
  }
  ```

- [ ] **Step 3: Add the cron to vercel.json**

  In `vercel.json`, add to the `crons` array:

  ```json
  {
    "path": "/api/cron/send-pending-reports",
    "schedule": "0 * * * *"
  }
  ```

  This runs every hour at :00. The 24-hour lookback window in the query ensures it only catches recent scans.

- [ ] **Step 4: Commit**

  ```bash
  git add app/api/cron/send-pending-reports/route.ts vercel.json scanner-service/.env
  git commit -m "feat(email): add safety-net cron for missed report-ready emails"
  ```

- [ ] **Step 5: Verify cron registered on Vercel**

  After deploying, go to Vercel dashboard → your project → Settings → Crons. Confirm `/api/cron/send-pending-reports` appears with an hourly schedule.

- [ ] **Step 6: Manual test**

  Trigger the cron manually via the Vercel dashboard or:

  ```bash
  curl -X GET https://scan.adashi.io/api/cron/send-pending-reports \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

  Expected response: `{ "sent": 0, "message": "All reports already sent" }` if all existing completed scans already have events (good). If it finds missed ones, it will send them.

---

## Self-Review

**Spec coverage:**
- [x] Fix `CALLBACK_URL` in Railway — Task 1
- [x] Two-email sequence preserved — Tasks 1 & 2 together restore it
- [x] Safety net for callback failures — Task 2
- [x] No duplicate emails — query filters by existing `email_events` rows before sending

**Placeholder scan:** No placeholders found. All steps have exact values or explicit "read this file first" instructions.

**Type consistency:** `sendReportReadyEmail` params in Task 2 match the function signature in `lib/email.ts:168-177`.
