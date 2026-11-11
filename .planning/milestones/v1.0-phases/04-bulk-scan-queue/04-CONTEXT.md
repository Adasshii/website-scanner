# Phase 4: Bulk Scan Queue - Context

**Gathered:** 2026-07-21
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase drains the prospects Phase 3 marked with `scan_released_at` through the
**existing** full scan, at controlled concurrency, giving each a visible status and a
hosted report — without degrading the live public scanner. It delivers, and only
delivers:

- A queue that pulls released prospects and dispatches them to the existing
  scanner-service `full-async` endpoint at a capped concurrency (SCAN-01).
- Capacity refusal: the scanner service rejects work above its limit rather than
  accepting it and timing out (SCAN-02).
- A visible per-prospect scan status — queued, scanning, done, failed (SCAN-03).
- Bounded failure handling: a failed scan is skipped, not retried indefinitely (SCAN-04).
- Good-citizen bulk scanning: honest self-identification, robots.txt respected,
  rate-limited so it cannot get the Railway IP blacklisted and take the live public
  scanner down with it (SCAN-05, SCAN-06).
- A hosted report per scanned prospect, the same artefact the public scanner already
  produces (SCAN-07), with incidental personal data in screenshots never separately
  indexed, profiled, or reused (CMP-17).

**Architecture already locked by ROADMAP.md — not re-litigated here:**
Postgres `SELECT ... FOR UPDATE SKIP LOCKED` + Vercel Cron + `p-limit` (already
installed at 3.1.0). No job-queue library. No new infrastructure. The concurrency gate
**extends** the scanner-service's existing `activeFullScans` map rather than replacing
it. Dispatch reuses `lib/scanner-client.ts` and the existing `full-async` endpoint — no
new scanner-service endpoint.

**Explicitly NOT in this phase** (owned elsewhere, do not build here):
- Contact extraction and classification — Phase 5 (CON-01..07).
- Draft generation — Phase 6 (DRA-01..06). Phase 4 produces the report the draft will
  later cite; it does not write any outreach copy.
- Review queue and send — Phases 7/8 (QUE-*, SND-*).
- Any change to triage or the shortlist's selection logic — Phase 3, closed.

</domain>

<decisions>
## Implementation Decisions

### Queue state & status (SCAN-01, SCAN-03)
- **D-01:** Scan status lives as columns on the existing `prospects` row (`scan_status`, an attempt counter, and a reference to the produced scan), added via migration `017`. No new queue table. This mirrors Phase 3's choice to hang `triage_score` off the prospect rather than spin up storage; at 10–50 prospects/week a dedicated queue table earns nothing and costs a join on every list view.
- **D-02:** Status surfaces by extending the **existing admin Shortlist tab** with a status column, not a separate Queue tab. Joshua releases from that surface, so he watches from that surface — one place, no new navigation, no split attention mid-run.
- **D-03:** A `done` row links directly to its hosted report at `/report/[id]`. He can eyeball the actual proof before it is ever used in outreach, which is the point of producing it.

### Failure policy (SCAN-04)
- **D-04:** One attempt, no automatic retry. A full scan that fails usually fails structurally (headless blocked, JS wall, dead domain) and retrying rarely changes that. The attempt counter still increments so the count is visible rather than implicit.
- **D-05:** A failed prospect is **manually re-queueable** from the Shortlist and nothing re-queues it automatically. This satisfies "skipped rather than retried indefinitely" while keeping a human-gated path back for a prospect worth chasing. Consistent with the project's standing preference for a human gate wherever budget or reputation is spent.
- **D-06:** No report means no pitch. A prospect whose scan failed drops out of the outreach flow rather than proceeding without evidence — the hosted report is the proof the entire cold email rests on, and pitching without it is exactly the generic personalisation this project set out to avoid.

### Pacing & blast radius (SCAN-02, SCAN-05, SCAN-06)
- **D-07:** A bulk run is **started manually** ("Run batch", mirroring Phase 3's Release button) and then **drained by Vercel Cron** in paced ticks. The human decides when scan budget is spent; the machine handles pacing. A pure cron drain would let a mis-set cutoff quietly turn into 20 real scans with nobody in the loop.
- **D-08:** Bulk concurrency is capped **strictly below** the scanner-service's total capacity, reserving permanent headroom for the live public scanner so the two never compete. This makes SCAN-06's "public scanner holds its normal success rate" structural rather than hopeful, and is a small extension to the existing `activeFullScans` gate rather than a preemption system.
- **D-09:** Bulk scans identify with a **distinct, honest user agent** naming Adashi and a contact URL — separate from the public scanner's identity. Honest per SCAN-05, and the containment win is the real reason: a site that blocks the bulk UA does not thereby block the revenue-earning public scanner. Blast-radius protection by identity, not only by rate.
- **D-10:** A prospect whose robots.txt disallows crawling is **skipped and marked**, with the reason recorded, and drops out of outreach. Reads SCAN-05 literally and extends the good-citizen posture already locked in Phase 3 (D-12).

### Report exposure & incidental personal data (SCAN-07, CMP-17)
- **D-11:** Prospect scans reuse **`/report/[id]` exactly** — same route, same components, no prospect-specific variant. SCAN-07 asks for the same artefact the public scanner produces, and one renderer keeps DRA-06's "same verdict in list, report, and email" rule trivially true instead of something to police across two surfaces.
- **D-12:** The report is **publicly reachable at an unguessable UUID** — no auth, no email gate, no expiry. The cold email links to it as proof; friction there kills the pitch, and asking a cold prospect to hand over their email to view a report we sent them unprompted is backwards. The UUID keeps reports non-enumerable.
- **D-13:** CMP-17 is enforced, not asserted: the design-analysis prompt is explicitly instructed not to describe or identify individuals, and nothing person-identifying derived from screenshots is persisted. The control is recorded in `docs/legal/lia/LIA-v1.md` so the compliance claim is checkable behaviour rather than a documented hope. Face redaction was considered and rejected as over-cost against the near-zero-spend constraint.

### Claude's Discretion
- Queue drain ordering (worst-first mirroring the shortlist vs FIFO by release time).
- The exact over-capacity rejection shape for SCAN-02 (status code, retry-after semantics, how `scanner-client.ts` surfaces it).
- Cron cadence, batch size per tick, and inter-scan spacing values — subject to D-08's reserved-headroom rule and the 10–50/week scale.
- Migration number confirmation (`017` expected), column names, and the `p-limit` wiring.
- Where the reserved-headroom constant lives (a single tunable constants block is the Phase 3 precedent).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — SCAN-01..07 (full wording; the capacity-refusal and rate-limit clauses are precise) and CMP-17 (incidental personal data).
- `.planning/ROADMAP.md` §"Phase 4: Bulk Scan Queue" — goal, the 5 success criteria, and the locked architecture notes (SKIP LOCKED + Vercel Cron + p-limit; extend `activeFullScans`; reuse `scanner-client.ts` + `full-async`; blast-radius verification watches the public scanner's success rate).

### Architecture & known risks
- `.planning/codebase/ARCHITECTURE.md` — scan lifecycle, the `activeFullScans` crash-recovery map, and the deliberate no-job-queue constraint.
- `.planning/codebase/STACK.md` — the SKIP LOCKED + Vercel Cron + p-limit design that converged independently with ARCHITECTURE.md (treat as high confidence).
- `.planning/codebase/CONCERNS.md` — browser-concurrency limits that break under bulk load, thin cron reliability, and the duplicated/diverged scoring between `scanner-service/src/scoring.ts` and `lib/scoring.ts`.
- `.planning/research/PITFALLS.md` — Pitfall 2, WAF fingerprinting from bulk-scanning strangers' sites off the same Railway IP that serves the live scanner. This is the risk D-08 and D-09 exist to contain.

### Phase 3 → Phase 4 contract
- `.planning/phases/03-triage-shortlist/03-CONTEXT.md` — D-08 (release is the single state change; Phase 3 marks, Phase 4 owns the queue and concurrency), D-06/D-09 (released prospects never re-release, re-triage skips them), D-12 (good-citizen fetch etiquette).
- `supabase/migrations/016_add_scan_release_marker.sql` — `prospects.scan_released_at` + its partial index; the marker this phase drains. Applied to production 2026-07-21.
- `supabase/migrations/013_add_prospect_id_to_scans.sql` — the `scans.prospect_id` link already exists; no new join table needed.

### Reusable code (reuse, don't reinvent)
- `lib/scanner-client.ts` — the dispatch client; bulk reuses it against the existing `full-async` endpoint.
- `scanner-service/src/index.ts` — the `activeFullScans` concurrency map (9 references) that D-08's reserved-headroom cap extends.
- `app/report/[id]/page.tsx` — the report renderer reused verbatim per D-11.
- `app/admin/page.tsx` — the admin dashboard and Shortlist tab that D-02 extends; `x-admin-secret` gate and StatCard/TabButton patterns.
- `vercel.json` — existing cron entries (keepalive, follow-up, send-pending-reports); the drain cron joins these.

### Compliance
- `docs/legal/lia/LIA-v1.md` — the legitimate-interest assessment; D-13's no-profiling control is recorded here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `p-limit` **3.1.0 is already installed** — the roadmap's chosen concurrency primitive needs no new dependency (project constraint: no new infrastructure).
- `lib/scanner-client.ts` + the scanner-service `full-async` endpoint — the full dispatch path already exists and is proven by the public scanner.
- `activeFullScans` (`scanner-service/src/index.ts`) — already tracks in-flight full scans for crash recovery; it is the natural place for the bulk cap and already holds exactly the state needed.
- `app/report/[id]` — the complete report renderer, reused unchanged.
- Admin surface: `x-admin-secret` gate, `StatCard`/`TabButton`, and the Phase 3 Shortlist tab that gains a status column.

### Established Patterns
- Migration convention `NNN_name.sql`; next number is `017`. Live migrations are **human-gated** via the Supabase dashboard SQL Editor (the convention held for 010–016).
- DB writes use `.update().eq()` / `.update().in()` and **never `.upsert()`** — `prospects.country` is `NOT NULL` with no default, so an upsert fails even on update-only intent (Pitfall 3).
- Budget-spending actions live in the admin UI behind a human click (Phase 3 D-11 precedent: Release); routine operator actions are CLI scripts. D-07 follows the former.
- Tunable constants live in a single block rather than inline literals (Phase 3 `lib/triage-constants.ts`).

### Integration Points
- **Reads:** `prospects` where `scan_released_at is not null` and the scan is not yet done/failed — the single Phase 3 → Phase 4 contract.
- **Writes:** `scan_status`, the attempt counter, and the scan reference on `prospects`; the scan row itself is written by the existing scanner-service path with `scans.prospect_id` linking back.
- **Dispatches:** to scanner-service `full-async` via `lib/scanner-client.ts`, under the reserved-headroom cap.
- **Hands off:** a `done` prospect with a hosted report at `/report/[id]` — the artefact Phase 5 (contact extraction) and Phase 6 (draft generation) build on.

</code_context>

<specifics>
## Specific Ideas

- The through-line across every decision this phase: **containment by structure, not by care.** Reserved capacity rather than hoping the public scanner wins a race; a separate bulk identity rather than a shared one; an enforced prompt control rather than a documented assertion. Same instinct that made Phase 3's release ceiling non-overridable.
- The bulk user agent should name Adashi and carry a contact URL — honest and reachable, not a spoofed browser, and deliberately distinct from the public scanner's UA so a block earned by prospecting cannot land on the product that earns money.
- "Run batch" should feel like Phase 3's Release button: an explicit, confirmable click that shows what is about to be spent before it is spent.
- Verification should watch the live public scanner's success rate *during* a bulk run — the roadmap calls no-shared-degradation a pass condition, so it needs observing, not assuming.

</specifics>

<deferred>
## Deferred Ideas

- **Mid-run progress and stop control** — a visible progress indicator and an abort button for an in-flight bulk run. Raised as a candidate gray area but not discussed; the phase ships with per-prospect status (D-02) which covers visibility. Revisit if a run ever needs interrupting.
- **Face redaction in screenshots** — considered under CMP-17 and rejected for now as over-cost against the near-zero-spend constraint (needs face detection). D-13's no-profiling control is the chosen posture. Revisit only if the LIA position changes.
- **Contact extraction** (CON-01..07) → Phase 5. **Draft generation** (DRA-01..06) → Phase 6. **Review queue** (QUE-*) → Phase 7. **Send** → Phase 8. Phase 4 produces the report these later phases cite; it writes no outreach copy and extracts no contacts.

</deferred>

---

*Phase: 4-Bulk Scan Queue*
*Context gathered: 2026-07-21*
