---
phase: quick
plan: 261114-olb
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/outreach-queue.integration.test.ts
  - components/admin/shortlist-table.test.tsx
  - lib/outreach-queue.ts
  - components/admin/shortlist-table.tsx
  - lib/scoreability-refresh.ts
autonomous: true
requirements: [ENG-06, QT-261114-olb]

estimate:
  tokens: 46000
  raw_tokens: 23000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "A prospect with scan_released_at set, a completed scan, not_scoreable_reason null and columns that fail the scoreable rule is refused by generateDraftForProspect, and no outreach_messages row is created for it."
    - "A prospect that still carries a stored not_scoreable_reason is refused on the manual route exactly as it is today."
    - "A scoreable prospect with a completed scan and a contact email still gets a draft on the manual route — the gate is not over-tightened."
    - "The Shortlist offers no Generate draft button for a not-scoreable row, whether or not it carries a stored marker, and still offers it for a scoreable row."
    - "The unwrapped verdict function in lib/triage-eligibility.ts keeps exactly one production caller: scoreableFailureReason."
    - "lib/scoreability-refresh.ts's header describes the code as it is now: both the dispatch route and the manual draft route compute the verdict fresh."
  artifacts:
    - "lib/outreach-queue.ts — generateDraftForProspect reads the rule's columns and refuses on a fresh scoreableFailureReason verdict"
    - "lib/outreach-queue.integration.test.ts — the legacy released-and-scanned case, asserted refused against a real Postgres"
    - "components/admin/shortlist-table.tsx — canGenerateDraft carries the scoreability condition"
    - "components/admin/shortlist-table.test.tsx — button-visibility cases for scoreable, unmarked-not-scoreable and marked-not-scoreable rows"
    - "lib/scoreability-refresh.ts — header comment corrected, filter and logic unchanged"
  key_links:
    - "generateDraftForProspect's prospects select must carry website_url, address, latitude, longitude AND the prospect_sources embed. Miss one and scoreableFailureReason reads an undefined field; its fail-closed checks then refuse every prospect, turning a narrow fix into a dead manual route."
    - "ShortlistRow already extends ScoreableRow and getShortlist already selects every field the rule reads, so the button condition calls the same wrapper with no query, row-shape or API-route change. Verify this before editing; do not widen the query on assumption."
    - "The integration suite's seedProspect currently produces a row that FAILS the rule (no website_url, no address, no prospect_sources). It must produce a scoreable row by default, or the two existing passing manual-generate tests start failing for the wrong reason."
---

<objective>
Close the ENG-06 hole 09-VERIFICATION.md found: on the manual draft route a prospect that
the scoreable rule refuses can still be drafted, and the admin Shortlist offers the button
for it.

Purpose: ENG-06 says a business that is not scoreable can never be emailed. Dispatch honours
that by computing the verdict fresh from prospect_sources before any network call. The manual
route gates only on the STORED marker, and the marker refresh deliberately never writes a
first marker onto a released prospect (D-9-17). A prospect released AND scanned before
migration 022 therefore carries not_scoreable_reason = null for good, never re-enters dispatch
because it already has its scan, and passes the manual gate. The path from the admin UI is one
click.

Output: the same fresh-verdict shape dispatch already uses, applied to the manual route and to
the button condition, each proven by a test written first; plus the stale header comment in
lib/scoreability-refresh.ts corrected to describe the code as it now stands.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/09-niche-profile-own-site-engine-data/09-VERIFICATION.md

@lib/triage-eligibility.ts
@lib/bulk-scan-dispatch.ts
@lib/outreach-queue.ts
@lib/triage-candidates.ts
@components/admin/shortlist-table.tsx
@lib/scoreability-refresh.ts
</context>

<constraints>
Every path below is repo-root-relative and every command assumes cwd at the repo root.

- Branch `gsd/phase-09-niche-profile`. Do not switch branches.
- Do not touch the three uncommitted plan files in
  `.planning/phases/09-niche-profile-own-site-engine-data/` (09-03, 09-06, 09-09),
  nor `.planning/milestone.lock`, nor `.planning/state.json`. Another session owns them.
- Do not touch `scanner-service/Dockerfile`, `scanner-service/tsconfig.json` or
  `.planning/config.json` (D-9-13).
- Do NOT widen `lib/scoreability-refresh.ts`'s `.is("scan_released_at", null)` filter. It was
  considered and rejected: widening it writes markers onto released history. The fix belongs in
  the draft gate.
- No locked decision is revisited. D-9-17 stands: the stored marker stays the Shortlist's
  readable explanation, and released history is not relabelled.
- Test-driven: in Task 1 both new tests must be seen to FAIL before Task 2 writes a line of
  production code.
</constraints>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write the two failing tests — the legacy server case and the button condition</name>
  <precondition>The local Supabase stack is running at 127.0.0.1:54321 with supabase/migrations applied (`supabase start`, then `supabase db reset` if the schema is behind); the integration vitest project points there by design and must never be run against production.</precondition>
  <files>lib/outreach-queue.integration.test.ts, components/admin/shortlist-table.test.tsx</files>
  <behavior>
    - Server: a prospect with scan_released_at set, latest_scan_id pointing at a completed scan,
      not_scoreable_reason null, and no qualifying prospect_sources row -> generateDraftForProspect
      returns ok false and outreach_messages holds zero rows for it. Fails today: the draft is created.
    - Server (unchanged, must stay green): a prospect carrying a stored not_scoreable_reason is refused.
    - Server (unchanged, must stay green): a scoreable named-person prospect with a completed scan gets a draft.
    - UI: a row with scan_status "done", has_contact_email true, has_outreach_draft false and an empty
      sources list renders no Generate draft button. Fails today: the button renders.
    - UI: the same row carrying a stored reason code renders no button.
    - UI: a scoreable row with those three flags still renders the button.
  </behavior>
  <action>
In lib/outreach-queue.integration.test.ts: the current seedProspect inserts no website_url, no
address and no prospect_sources row, so every prospect it makes already fails the rule. Give it a
scoreable default. Add a website_url built from the generated test domain and a street address to
the insert, and give the helper a second parameter holding the prospect_sources rows to create,
defaulting to a single row with raw_confidence 0.9 and a null raw_operating_status. Each source row
needs its own overture_gers_id, which migration 011 makes not-null and unique; copy the seeding
shape from lib/bulk-scan-dispatch.integration.test.ts lines 44-81, which already solves this. The
afterEach needs no change: prospect_sources cascades on the prospects delete.

Then add one case to the existing describe("generateDraftForProspect"), named so that
`-t "released and scanned before the rule"` selects it: a prospect seeded with scan_released_at set
to a past timestamp and an empty source list, with a completed scan linked through latest_scan_id,
asserted refused with zero outreach_messages rows. This is the exact row 09-VERIFICATION.md's gap
describes. Leave the two existing cases in that block untouched — they are the regression guard that
the gate is not over-tightened, and they now run through the widened fixture.

In components/admin/shortlist-table.test.tsx: makeRow already produces a scoreable row (website_url,
address, one 0.9 source), so add one describe block named so that `-t "Generate draft button"`
selects it, with the three cases listed in behavior. Query the button by its visible label the way
the existing NOT SCOREABLE cases query their pill, and keep the explicit afterEach cleanup the file
already relies on. Build the rows with makeRow overrides only; do not add a second row factory.
  </action>
  <verify>
    <automated>! npx vitest run --project integration lib/outreach-queue.integration.test.ts -t "released and scanned before the rule" && ! npx vitest run --project component components/admin/shortlist-table.test.tsx -t "Generate draft button"</automated>
  </verify>
  <done>Both new tests exist and fail, and each fails on its assertion (a draft row was created; the button was rendered), not on a fixture, import or type error. The three pre-existing manual-generate cases still pass under the widened fixture.</done>
</task>

<task type="auto">
  <name>Task 2: Compute the verdict fresh on the manual route and in the button condition</name>
  <precondition>The local Supabase stack from Task 1 is still running at 127.0.0.1:54321.</precondition>
  <files>lib/outreach-queue.ts, components/admin/shortlist-table.tsx</files>
  <action>
In lib/outreach-queue.ts, generateDraftForProspect: widen the existing prospects select to also read
website_url, address, latitude, longitude and prospect_sources(raw_confidence, raw_operating_status)
— the identical shape dispatchOne reads at lib/bulk-scan-dispatch.ts:90-96. Keep the single
`.single()` read and its existing error branch: an error or a missing row already returns an error
outcome, which is the fail-closed path, and no second round trip is needed. Map a missing embed to
an empty source list exactly as dispatch does at lib/bulk-scan-dispatch.ts:105-108, so absent
evidence is refused rather than read as a pass.

Immediately after the existing stored-marker check, add a second refusal computed by
scoreableFailureReason over those freshly read columns. Keep BOTH checks: per D-9-17 the stored
marker is the recorded explanation the Shortlist shows, while the fresh verdict is what catches a
prospect released and scanned before the rule existed, which by design never receives a marker.
Route the check through scoreableFailureReason only — it is the single production caller of the
unwrapped verdict function in lib/triage-eligibility.ts, and that must stay true. Evaluate no
condition of the rule in this file. Keep the refusal literal and per-handler, matching the
rejected-prospect check directly above it, and say in a short comment why the manual route needs a
fresh verdict when dispatch already has one.

In components/admin/shortlist-table.tsx, canGenerateDraft: add the scoreability condition using the
same wrapper. Confirm first, do not assume: ShortlistRow extends ScoreableRow and getShortlist
already selects website_url, address, latitude, longitude and the mapped sources, so the component
can call the wrapper on the row directly and no query, row-shape or API-route change is needed. The
file already imports isReleasable from the same module, so this follows how the table derives its
other conditions. Leave the NOT SCOREABLE pill, which reads the stored marker, exactly as it is:
pill and button answer different questions.
  </action>
  <verify>
    <automated>npx vitest run --project integration lib/outreach-queue.integration.test.ts && npx vitest run --project component components/admin/shortlist-table.test.tsx && npx vitest run --project unit lib/triage-eligibility.test.ts && [ "$(grep -rn 'scoreableVerdict(' lib app components scripts | grep -v '\.test\.' | wc -l | tr -d ' ')" = "2" ] && npx tsc --noEmit</automated>
  </verify>
  <done>Both test files are green, the whole eligibility suite is green, tsc is clean, and the invariant grep returns exactly two lines: the declaration in lib/triage-eligibility.ts and its single call inside scoreableFailureReason.</done>
</task>

<task type="auto">
  <name>Task 3: Correct the stale header comment in lib/scoreability-refresh.ts</name>
  <files>lib/scoreability-refresh.ts</files>
  <action>
Rewrite the clause in the header comment (lines 11-14) that describes what the dispatch route does.
It still claims dispatch depends on the stored marker and is therefore blind to a prospect released
before migration 022. Commit 5cad85f replaced that with a fresh verdict at
lib/bulk-scan-dispatch.ts:90-118, and Task 2 gives the manual draft route the same treatment, so the
sentence now contradicts both.

Keep the half that is still true and load-bearing — a released prospect never receives a first
marker from this module, so its history is not rewritten (D-9-17) — then name the two routes that
compute the verdict fresh and cite their files: lib/bulk-scan-dispatch.ts and lib/outreach-queue.ts.
Comment only. Do not change the filter, the paging, the chunking or any behaviour in this module,
and do not evaluate any condition of the rule here.
  </action>
  <verify>
    <automated>[ "$(grep -c 'cannot, on its own, catch such a prospect' lib/scoreability-refresh.ts || true)" = "0" ] && grep -q 'bulk-scan-dispatch' lib/scoreability-refresh.ts && grep -q 'outreach-queue' lib/scoreability-refresh.ts && grep -q 'scan_released_at' lib/scoreability-refresh.ts && npx vitest run --project integration lib/scoreability-refresh.integration.test.ts && npm run lint</automated>
  </verify>
  <done>The stale clause is gone, the header names both fresh-verdict routes by file, the released-prospect filter is untouched, the refresh integration suite is green and lint is clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admin UI -> POST manual draft generation | An admin click crosses here and, once approved, a draft can be sent to a real business |
| prospects + prospect_sources -> the scoreable rule | Third-party Overture data decides whether a business may ever be contacted |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-olb-01 | Repudiation | lib/outreach-queue.ts generateDraftForProspect | high | mitigate | A business the ENG-06 rule refuses can today be drafted and, after human approval, emailed — the exact outcome the requirement forbids and the one a complaint would be about. Task 2 computes the verdict fresh from the prospect's own columns before any draft is generated |
| T-olb-02 | Elevation of privilege | an unreadable prospects row or a missing prospect_sources embed | high | mitigate | Fail closed both ways: the existing `.single()` error branch refuses on an unreadable row, and a missing embed maps to an empty source list, which is not one match and so fails condition 2 of the rule (Task 2) |
| T-olb-03 | Tampering | a second copy of the rule drifting from the first | medium | mitigate | The check goes through scoreableFailureReason only; the invariant grep in Task 2's verify fails the task if the unwrapped verdict function gains a second production caller |
| T-olb-04 | Information disclosure | ShortlistRow reaching the browser | low | accept | No new field is added to the row or the API payload — every field the condition reads is already selected and already sent (T-9-08 mapped the source rows to confidence and status only) |
| T-olb-SC | Tampering | npm/pip/cargo installs | high | mitigate | Not applicable — this plan installs zero new packages. vitest, @testing-library/react and @supabase/supabase-js are all present and previously human-approved |
</threat_model>

<verification>
Run the targeted files, not the full suite. The full `npx vitest run` times out on a busy machine
and reports a false failure (recorded in project memory); every command here names its file and its
vitest project.

1. `npx vitest run --project integration lib/outreach-queue.integration.test.ts` — green, including
   the new legacy case and the three pre-existing manual-generate cases.
2. `npx vitest run --project component components/admin/shortlist-table.test.tsx` — green.
3. `npx vitest run --project integration lib/scoreability-refresh.integration.test.ts` — green; the
   refresh is unchanged apart from its header.
4. `npx vitest run --project unit lib/triage-eligibility.test.ts` — green; the rule itself is untouched.
5. `grep -rn "scoreableVerdict(" lib app components scripts | grep -v "\.test\."` — exactly two lines.
6. `npx tsc --noEmit` and `npm run lint` — clean.
7. `git status --short` shows exactly the five files in `files_modified` and nothing else; in
   particular none of the three uncommitted 09-* plan files, `.planning/milestone.lock` or
   `.planning/state.json`.

Open for Joshua, not for this plan: whether any affected row exists in production —
`select count(*) from prospects where scan_released_at is not null and latest_scan_id is not null and not_scoreable_reason is null;`
then check those rows against the four conditions. The fix is correct either way.
</verification>

<success_criteria>
- The manual draft route refuses a prospect that fails the scoreable rule, including one released and
  scanned before the rule existed, and creates no outreach_messages row for it.
- The manual route still drafts for a scoreable prospect with a completed scan and a contact email.
- The Shortlist offers no Generate draft button for a not-scoreable row, marked or unmarked.
- scoreableFailureReason remains the only production caller of the unwrapped verdict function.
- lib/scoreability-refresh.ts's behaviour is byte-for-byte unchanged and its header is true.
- ENG-06's gap in 09-VERIFICATION.md is closed on all three routes.
</success_criteria>

<output>
Create `.planning/quick/261114-olb-close-the-eng-06-manual-draft-scoreabili/261114-olb-SUMMARY.md` when done
</output>
