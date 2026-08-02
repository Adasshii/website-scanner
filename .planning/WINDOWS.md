---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-08-02T15:18:53.617Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | deviation | .env.example |  | RETENTION_MODE and RETENTION_MONTHS not documented — global permission settings denied all tool access to .env.* paths this session; needs a 2-line hand-add before Task 3's deploy | open |  | 2026-08-02T14:42:35.119Z |  |
| 2 | 07 | unrun-verify | 07-07-PLAN.md |  | Task 3's deploy/dashboard-cron-confirmation/authenticated-dry-run-read/SQL-cross-check steps were not run before RETENTION_MODE stay-dry-run decision; required before any future move off dry-run | open |  | 2026-08-02T15:18:53.617Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "07",
    "file": ".env.example",
    "line": null,
    "description": "RETENTION_MODE and RETENTION_MONTHS not documented — global permission settings denied all tool access to .env.* paths this session; needs a 2-line hand-add before Task 3's deploy",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-02T14:42:35.119Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "07",
    "file": "07-07-PLAN.md",
    "line": null,
    "description": "Task 3's deploy/dashboard-cron-confirmation/authenticated-dry-run-read/SQL-cross-check steps were not run before RETENTION_MODE stay-dry-run decision; required before any future move off dry-run",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-02T15:18:53.617Z",
    "resolved_at": null
  }
]
````
