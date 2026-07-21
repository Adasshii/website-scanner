# Phase 4: Bulk Scan Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-21
**Phase:** 4-Bulk Scan Queue
**Areas discussed:** Queue state & status, Failure policy, Pacing & blast radius, Report URL & personal data

Architecture was not discussed — ROADMAP.md already locked `SELECT ... FOR UPDATE SKIP LOCKED`
+ Vercel Cron + `p-limit`, extending `activeFullScans`, reusing `scanner-client.ts` and the
`full-async` endpoint (STACK.md and ARCHITECTURE.md converged independently; treated as high
confidence). Discussion covered only the behavioural choices left open.

---

## Queue state & status

| Option | Description | Selected |
|--------|-------------|----------|
| Columns on `prospects` | Status/attempts/scan-ref on the existing row via migration 017; no new table, mirrors Phase 3's `triage_score` choice | ✓ |
| Dedicated `scan_queue` table | Per-attempt rows, cleaner history, natural home for SKIP LOCKED — but new storage + a join on every list view | |
| Derive from `scans` table | Zero new columns via `scans.prospect_id` (migration 013), but "queued" has no scans row yet — blind spot exactly where the queue matters | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extend Shortlist tab | Status column on the table he already uses; one surface | ✓ |
| New Queue tab | Separate view for in-flight/failed; splits attention mid-run | |
| Both | Chip in Shortlist + dedicated tab for detail; more to build | |

| Option | Description | Selected |
|--------|-------------|----------|
| Link to the report | `done` rows link to `/report/[id]` so proof can be eyeballed pre-outreach | ✓ |
| Status only | Report link deferred to the draft-review phase | |

**User's choice:** Columns on `prospects` · Extend Shortlist tab · Link to the report
**Notes:** Consistent with Phase 3's restraint about new storage. Keeps release and observation on one surface.

---

## Failure policy

| Option | Description | Selected |
|--------|-------------|----------|
| One attempt, no retry | Full-scan failures are usually structural; attempt counter still increments for visibility | ✓ |
| Two attempts | One auto-retry catches transient flake, then gives up | |
| Three with backoff | Most resilient, most machinery, and repeatedly hitting a refusing site cuts against SCAN-05/06 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Manually re-queueable | `failed` stays until Joshua explicitly re-queues; human-gated path back | ✓ |
| Terminal — no path back | Simplest, impossible to loop, but a good prospect lost to one bad night is gone | |
| Auto re-queue next run | Close to the indefinite retry SCAN-04 forbids | |

| Option | Description | Selected |
|--------|-------------|----------|
| No report, no pitch | Failed prospects drop out of outreach; the report is the proof the email rests on | ✓ |
| Flagged for manual review | Case-by-case decision on pitching without evidence | |
| Pitched without a report | Reverts to the generic personalisation the project set out to avoid | |

**User's choice:** One attempt · Manually re-queueable · No report, no pitch
**Notes:** Human gate preserved wherever budget or reputation is spent — same shape as Phase 3's Release.

---

## Pacing & blast radius

*The load-bearing area: SCAN-06 makes "the public scanner holds its normal success rate" a pass condition.*

| Option | Description | Selected |
|--------|-------------|----------|
| Manual start + cron drain | Joshua clicks "Run batch", cron drains in paced ticks | ✓ |
| Pure cron drain | Fully hands-off, but a mis-set cutoff quietly becomes 20 real scans | |
| Manual only, no cron | Maximum control, but he'd babysit an hours-long run | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reserve headroom for public | Bulk capped strictly below total capacity; public never competes. Small extension to `activeFullScans` | ✓ |
| Strict priority — public preempts | Strongest guarantee, needs real preemption + resume of half-finished scans | |
| Shared pool, first-come | Simplest, but bulk can starve a paying customer's scan — violates the phase's own criterion | |

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct honest bulk UA | Names Adashi + contact URL; a block on bulk does not block the live public scanner | ✓ |
| Same UA as public scanner | One identity, but any block bulk earns lands on the revenue product (Pitfall 2 coupling) | |
| Reuse triage's UA | Consistent with Phase 3, but that identity was built for a cheap fetch, not a browser scan | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and mark | No scan, reason recorded, drops out of outreach; extends Phase 3 D-12 etiquette | ✓ |
| Skip but flag for review | Case-by-case manual look | |
| Scan the homepage anyway | Cheapest in lost prospects, most reputationally exposed | |

**User's choice:** Manual start + cron drain · Reserve headroom · Distinct bulk UA · Skip and mark
**Notes:** Containment chosen structurally at every turn — capacity reserved rather than raced for, identity separated rather than shared.

---

## Report URL & personal data

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse `/report/[id]` exactly | Same route and components; one renderer keeps DRA-06's single-verdict rule trivially true | ✓ |
| Distinct `/prospect-report/[id]` | Allows later divergence for a cold-email audience, but two surfaces to keep in sync | |
| Same route, prospect-aware variant | Conditional rendering — where subtle divergence hides | |

| Option | Description | Selected |
|--------|-------------|----------|
| Public, unguessable UUID | No auth, no gate; recipient clicks and sees proof immediately | ✓ |
| Signed link that expires | More control, but a dead link makes late-replying prospects hit a broken pitch | |
| Behind the existing email gate | Backwards: asking a cold prospect for their email to see a report we sent them | |

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit no-profiling control | Design-analysis prompt instructed not to describe/identify individuals; nothing person-identifying persisted; recorded in LIA-v1.md | ✓ |
| Documented no-op | Cheapest, but rests on the AI never volunteering a description of a person | |
| Redact faces before storage | Strongest posture, needs face detection — real cost against near-zero-spend | |

**User's choice:** Reuse `/report/[id]` · Public unguessable UUID · Explicit no-profiling control
**Notes:** CMP-17 turned from an assertion into enforced, checkable behaviour.

---

## Claude's Discretion

- Queue drain ordering (worst-first mirroring the shortlist vs FIFO by release time).
- Over-capacity rejection shape for SCAN-02 (status code, retry-after semantics, how `scanner-client.ts` surfaces it).
- Cron cadence, batch size per tick, and inter-scan spacing values, bounded by D-08's reserved-headroom rule.
- Migration number confirmation (`017`), column names, `p-limit` wiring, and where the headroom constant lives.

## Deferred Ideas

- **Mid-run progress and stop control** — surfaced as a candidate gray area, not discussed. Per-prospect status covers visibility for now; revisit if a run ever needs interrupting.
- **Face redaction in screenshots** — considered under CMP-17, rejected as over-cost; revisit only if the LIA position changes.
- Contact extraction (Phase 5), draft generation (Phase 6), review queue (Phase 7), send (Phase 8) — all bounded out.
