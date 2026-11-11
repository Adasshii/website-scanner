# Deploy Evidence: `/api/cron/retention` in production

**Date gathered:** 2026-08-03 (schedule fix decided 2026-08-02, see `07-DECISION-RECORD.md` §
"D-7-20 superseded")
**Deployed mode:** `dry-run` (the non-writing default). `RETENTION_MODE` is unset in the repository
and, per Evidence 3 below, unset in the Vercel project environment. No write of any kind occurred.

This is the durable record plan 07-10 exists to produce: the four evidence steps 07-07's Task 3
named but never ran, gathered against real production infrastructure for the first time.

---

## Evidence 1 — Deploy

Two production deploys ran during this evidence pass.

**First deploy** (`website-scanner-p4fp9z72a-adashis-projects.vercel.app`) shipped `vercel.json`
with the original `0 3 1 * *` monthly schedule. Vercel's Cron Jobs view registered only four of the
five entries — `/api/cron/retention` was silently dropped. This falsified `07-RESEARCH.md`'s
resolution that Vercel Hobby accepts a genuine monthly (day-of-month) cron expression. See
`07-DECISION-RECORD.md` § "D-7-20 superseded" for the full finding and the schedule change this
triggered (`0 3 1 * *` → `0 3 * * *`, daily).

**Second deploy** (the one this evidence file otherwise describes):

- **Deployment id:** `dpl_DNNMtUqWo3Ku5T9QSoBKVjt8oW95`
- **Deployment URL:** `https://website-scanner-ndgtg3fk6-adashis-projects.vercel.app`
- **readyState:** `READY`
- **target:** `production`
- **Alias:** `https://scan.adashi.io`

---

## Evidence 2 — Schedule confirmed in the Vercel Cron Jobs view

Read after the second deploy. Cron feature toggle: **Enabled**. Five entries, all present — no
displacement of the four pre-existing crons:

| path | schedule |
|---|---|
| `/api/cron/drain-scan-queue` | `0 7 * * *` |
| `/api/cron/follow-up` | `0 10 * * *` |
| `/api/cron/keepalive` | `0 9 * * 1` |
| `/api/cron/retention` | `0 3 * * *` |
| `/api/cron/send-pending-reports` | `0 8 * * *` |

`/api/cron/retention` is now registered at the daily schedule set by the D-7-20 supersede, confirmed
in Vercel's own dashboard rather than inferred from the committed `vercel.json`.

---

## Evidence 3 — Authenticated read

**Request:** `GET https://scan.adashi.io/api/cron/retention`, with an `Authorization` header
carrying the production auth token (supplied from a shell environment variable — never typed
inline, never transcribed).

**Response:** HTTP 200 in 2.287731s.

```json
{
  "mode": "dry-run",
  "months": 12,
  "cutoff": "2025-08-03T10:19:34.966Z",
  "candidates": 0,
  "expiring": 0,
  "prospectsAnonymized": 0,
  "prospectsDeleted": 0,
  "outreachAnonymized": 0,
  "scansAnonymized": 0,
  "scansDeleted": 0,
  "sourcesAnonymized": 0
}
```

`mode` reads `dry-run`, the non-writing default — confirming `RETENTION_MODE` is unset in the
Vercel project environment, not only in the repository.

## Evidence 3b — Auth gate, unauthenticated call

**Request:** same URL, no `Authorization` header.
**Response:** HTTP 401, body `{"error":"Unauthorized"}`.

Vercel runtime logs show `source: serverless` for this request, confirming the refusal came from
the route's own token-authorization check running before any query — not from an edge-level block
that would give a false sense of coverage — and that the gate is live in production, not only in
the test suite (closes T-07-10-01's evidence requirement).

---

## Evidence 4 — SQL cross-check

**Query run:** Supabase Dashboard SQL Editor, against production, "Primary Database":

```sql
SELECT count(*) FROM prospects WHERE created_at < '2025-08-03T10:19:34.966Z';
```

**Result:** `0`

**Evidence 4b — agreement:** `0` agrees with the route's `candidates: 0` and `expiring: 0`.

**Magnitude:** `0` is a legitimate, recognisable answer at this project's scale — prospects have
been imported for well under 12 months, so nothing yet crosses the retention window. Not a failure.

### This cross-check is weak evidence and must be read as such

The query above filters on `prospects.created_at` alone. It does **not** reproduce D-7-15's
three-source clock — the latest of a prospect's last `sent` outreach `sent_at`, its last scan
`created_at` where `prospect_id` is not null, and its own `created_at` — because the route's own
pre-filter already returned zero candidates before any of the other two sources could matter. A
`created_at`-only query agreeing with the route here proves only that no prospect predates the
cutoff by any measure; it proves nothing about whether the clock correctly advances the cutoff for
a prospect who has been scanned or emailed since import, which is the entire reason the three-source
definition exists.

**The retention clock therefore remains unproven against production data.** Evidence 1-3 establish
that the schedule is live, the route is authenticated correctly, and the job runs without writing.
Evidence 4 does not establish that `lib/retention.ts`'s clock computation is correct at production
scale — only local fixture tests do that today.

**Trigger for redoing this check properly:** the first day the route's `expiring` figure is
non-zero. At that point, re-run Step 4 with the full three-source query:

```sql
SELECT count(*) FROM prospects p
WHERE GREATEST(
  COALESCE((SELECT max(sent_at) FROM outreach_messages WHERE prospect_id = p.id AND status = 'sent'), '-infinity'::timestamptz),
  COALESCE((SELECT max(created_at) FROM scans WHERE prospect_id = p.id), '-infinity'::timestamptz),
  p.created_at
) < '<route-reported-cutoff>';
```

and compare against the route's `expiring`. On current growth (10-50 prospects/week, imports
started well under a year ago) the earliest a non-zero figure is expected is roughly July 2027.

---

## Debugging note (client-side, not a route defect — do not re-investigate)

Early authenticated attempts against Evidence 3 failed with `HTTP 000` and an HTTP/2
`PROTOCOL_ERROR`. Vercel runtime logs showed no serverless invocation for those requests at
all — they never reached the function. Cause: the production auth token had been pasted by hand
and captured roughly 400 characters of contaminated input instead of the real 64-character value.
A clean token pulled via `vercel env pull` resolved it immediately. No code was involved and no
route behavior needs revisiting because of this.

---

## What is not decided here

`RETENTION_MODE` was not set, changed, or removed in the Vercel project environment by any step of
this evidence pass. It stays unset (dry-run) by deliberate standing decision, recorded here for a
future decision to move off it. That decision, per Joshua:

- CMP-13's 12-month window is a placeholder pending the LIA, not a legal fact. Arming an
  irreversible job on an unconfirmed number is the wrong order of operations.
- `candidates: 0` means a live run today would delete nothing — there is nothing to prove by
  arming the write path yet.
- The write path itself is already covered by 39 integration tests against real Postgres,
  including FK delete ordering, the `prospect_sources` decision (07-08), and suppression survival
  (CMP-15).
- The dry-run job now runs **daily** (per the D-7-20 supersede) and reports. The first non-zero
  `expiring` becomes the natural prompt to revisit this decision with the LIA answer in hand, and
  to re-run the three-source SQL cross-check for real this time.

Nothing about the LIA or the 12-month `RETENTION_MONTHS` window is decided here either — when
counsel answers, that value changes and no code does.

## Open follow-up (logged, not built)

The dry-run result currently lands only in Vercel function logs, which nobody reads on a routine
basis. A daily job that reports into a void is not a monitor. Surfacing `expiring` somewhere Joshua
actually looks — most likely the Reporting tab — is a real gap, tracked as `WINDOWS.md` entry #3
rather than left in this file's prose.
