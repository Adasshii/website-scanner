---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-02T14:42:35.119Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 07 | deviation | .env.example |  | RETENTION_MODE and RETENTION_MONTHS not documented — global permission settings denied all tool access to .env.* paths this session; needs a 2-line hand-add before Task 3's deploy | open |  | 2026-08-02T14:42:35.119Z |  |

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
  }
]
````
