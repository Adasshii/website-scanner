---
phase: quick
plan: 261118-lhg
status: complete
subsystem: outreach-draft
tags: [positioning, outreach, cold-email, prompt, copy]
requires: []
provides:
  - the cold email body leads with the moment before a customer makes contact
  - one fixed approved subject line, keyed on the business name
  - docs/outreach-copy.md as the source of truth for the outreach wording
affects: [draft generation, every draft generated from now on]
key-files:
  created:
    - docs/outreach-copy.md
  modified:
    - lib/draft-prompt.ts
    - lib/draft-generator.ts
    - lib/draft-prompt.test.ts
    - lib/draft-generator.test.ts
commits:
  - 4a672f1
  - ae1945f
date: 2026-11-18
branch: copy/outreach-positioning
---

# Lead the cold email with the moment, fix the subject

## What changed

**The body leads with the moment.** `TONE_BRIEF`'s `STRUCTURE` gained a step 2: one sentence
saying that before anyone makes contact, they look the business up first. The finding is step 3
now, the evidence for that moment rather than the opening line. `TONE` states the frame outright
instead of leaving the model to infer it from the worked example, which is the exact failure mode
the 2026-07-28 register fix ran into. Both worked examples were rewritten.

**The subject is one fixed approved line.** `buildDraftSubject()` returns
`Wat {businessName} laat zien voordat iemand contact opneemt`, with the English mirror
`What {businessName} shows before anyone gets in touch`, keyed on `prospect.name` falling back to
`prospect.domain`. The prompt tells the model to write no subject, the output contract asks for a
body only, and `generateDraft()` discards a subject the model writes anyway.

This replaces 2026-07-28's Change B (model-authored subject) and retires the
`Snelle observatie over {domein}` fallback.

## What this cost, stated plainly

06-03's three tests pinned the model-authored subject rule and retire with the mechanism they
guarded. The fault they existed to stop, the model copying the worked example's subject word for
word, cannot recur: no example carries a subject any more.

The trade-off is on record at `buildDraftSubject()` and in section 1 of `docs/outreach-copy.md`.
One fixed line goes to every prospect. At 10 to 50 sends a week that reads as one person writing.
Well above that it reads as a mail merge. Restoring the model-authored subject is one line in
`generateDraft()` plus the SUBJECT rule in `TONE_BRIEF`.

`parseDraftResponse()` is unchanged in behaviour. Its parameter is renamed to `businessName` and
its returned `subject` is now advisory. It survives for one reason: a model that writes a subject
despite the instruction must not have it leak into the body.

## Verification

- `lib/draft-prompt.test.ts` and `lib/draft-generator.test.ts`: 60 pass.
- Plus `draft-metric-selector`, `outreach-isolation` and `outreach-row-panel`: 83 pass in total.
- `npx tsc --noEmit`: two errors, both `Cannot find module 'playwright'` in `scanner-service/`.
  Those are this worktree's missing `scanner-service/node_modules`, not the change. Nothing in
  `lib/`, `app/` or `components/`.
- `npx next lint` on all four changed source files: clean.
- The full suite was deliberately NOT run. Another session works on this machine and the suite
  times out and reports a false failure under that load.
- No live draft was generated. The prompt change is unexercised against the real model.

## Open

- **Counsel's Article 14 wording.** Still DRAFT in `docs/legal/lia/LIA-v1.md`, still the blocker
  on sending anything at all.
- **Generate one real draft and read it.** The 2026-07-28 rewrite happened because Joshua read
  real output and judged it weak. This change has not had that test.
- **`docs/report-copy.md` is not in `main`.** It sits on `gsd/phase-09-niche-profile` with the
  14-field `ProfileCopy`. `docs/outreach-copy.md` references it and lands here first.
- **Four stale test fixtures** carry `"A quick observation about your site"` as arbitrary input.
  Recorded in section 5 of `docs/outreach-copy.md`. No assertion depends on the wording.
- **The homepage hero and the SEO metadata** still carry the old framing.
