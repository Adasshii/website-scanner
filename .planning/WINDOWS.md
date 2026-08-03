---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 2
total_count: 4
last_updated: 2026-08-03T13:52:30.813Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | deviation | .env.example |  | RETENTION_MODE and RETENTION_MONTHS not documented — global permission settings denied all tool access to .env.* paths this session; needs a 2-line hand-add before Task 3's deploy | fixed |  | 2026-08-02T14:42:35.119Z | 2026-08-03T10:29:23.979Z |
| 2 | 07 | unrun-verify | 07-07-PLAN.md |  | Task 3's deploy/dashboard-cron-confirmation/authenticated-dry-run-read/SQL-cross-check steps were not run before RETENTION_MODE stay-dry-run decision; required before any future move off dry-run | fixed |  | 2026-08-02T15:18:53.617Z | 2026-08-03T10:29:24.064Z |
| 3 | 07 | deviation | app/api/cron/retention/route.ts |  | Daily dry-run retention job reports expiring/candidates only into Vercel function logs, which nobody reads routinely — a job reporting into a void is not a monitor. Surface the expiring figure somewhere Joshua actually looks (likely the Reporting tab) before RETENTION_MODE is ever considered for a writing value. | open |  | 2026-08-03T10:29:34.333Z |  |
| 4 | quick-260803-lh0 | deviation | lib/outreach-queue.integration.test.ts | 44 | afterEach discards every select/delete error (never checked); a latest_scan_id/scans FK NO ACTION violation silently aborts cleanup and every fixture row survives permanently -- 1101 leaked test-outreach-queue-* prospects found in shared local DB, likely the real reason prospects crossed the 1000-row PostgREST cap this quick task fixes. Same bug class already fixed once in reporting-aggregates.integration.test.ts (2026-08-02). Not fixed here: out of scope (different file); mass-delete of leaked rows was blocked by the permission classifier. | open |  | 2026-08-03T13:52:30.813Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "07",
    "file": ".env.example",
    "line": null,
    "description": "RETENTION_MODE and RETENTION_MONTHS not documented — global permission settings denied all tool access to .env.* paths this session; needs a 2-line hand-add before Task 3's deploy",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-02T14:42:35.119Z",
    "resolved_at": "2026-08-03T10:29:23.979Z"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "07",
    "file": "07-07-PLAN.md",
    "line": null,
    "description": "Task 3's deploy/dashboard-cron-confirmation/authenticated-dry-run-read/SQL-cross-check steps were not run before RETENTION_MODE stay-dry-run decision; required before any future move off dry-run",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-02T15:18:53.617Z",
    "resolved_at": "2026-08-03T10:29:24.064Z"
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "07",
    "file": "app/api/cron/retention/route.ts",
    "line": null,
    "description": "Daily dry-run retention job reports expiring/candidates only into Vercel function logs, which nobody reads routinely — a job reporting into a void is not a monitor. Surface the expiring figure somewhere Joshua actually looks (likely the Reporting tab) before RETENTION_MODE is ever considered for a writing value.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-03T10:29:34.333Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "quick-260803-lh0",
    "file": "lib/outreach-queue.integration.test.ts",
    "line": 44,
    "description": "afterEach discards every select/delete error (never checked); a latest_scan_id/scans FK NO ACTION violation silently aborts cleanup and every fixture row survives permanently -- 1101 leaked test-outreach-queue-* prospects found in shared local DB, likely the real reason prospects crossed the 1000-row PostgREST cap this quick task fixes. Same bug class already fixed once in reporting-aggregates.integration.test.ts (2026-08-02). Not fixed here: out of scope (different file); mass-delete of leaked rows was blocked by the permission classifier.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-03T13:52:30.813Z",
    "resolved_at": null
  }
]
````
