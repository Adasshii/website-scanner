---
quick_id: 261118-lhg
slug: land-the-approved-direction-a-outreach-c
date: 2026-11-18
branch: copy/outreach-positioning
---

# Land the approved direction-A outreach copy

## Why

Direction A was logged 2026-11-16: the promise leads with the moment before a customer makes
contact, not with the craft. The report heading and the site header already carry it (quick task
`261116-tog`). The cold email still led with the technical finding, which is the old framing.

Joshua approved the copy and the six-way call split on 2026-11-18. The approved wording and the
reasoning are in `docs/outreach-copy.md`.

## Scope

| File | Change |
| --- | --- |
| `lib/draft-prompt.ts` | `TONE_BRIEF` structure and tone, both worked examples, the output contract, `buildDraftSubject`, `parseDraftResponse` parameter |
| `lib/draft-generator.ts` | the subject is code-owned now, keyed on the business name |
| `lib/draft-prompt.test.ts` | the assertions pinning the model-authored subject and the old opening |
| `lib/draft-generator.test.ts` | the two Change B subject cases |
| `docs/outreach-copy.md` | new, the source of truth for the outreach wording |

## The two substantive changes

1. **The body leads with the moment.** `STRUCTURE` gains a step 2: one sentence saying that
   before anyone makes contact, they look the business up first. The finding moves to step 3 as
   the evidence for that. Both worked examples were rewritten to open that way.

2. **The subject is one fixed approved line.** `buildDraftSubject()` returns
   `Wat {businessName} laat zien voordat iemand contact opneemt` (EN mirror), keyed on the
   business name instead of the domain. The prompt now tells the model to write no subject, and
   `generateDraft()` discards one if it writes it anyway.

## Out of scope

- The Article 14 notice. Still DRAFT pending counsel, and it still gates sending.
- The four test fixtures carrying the retired subject string as arbitrary input. Recorded in
  section 5 of `docs/outreach-copy.md`.
- The homepage hero and the SEO metadata, which still carry the old framing.

## Verification

- `lib/draft-prompt.test.ts` and `lib/draft-generator.test.ts` pass.
- Every other draft and outreach test file passes.
- `npx tsc --noEmit` reports nothing in `lib/`, `app/` or `components/`.
- `npx next lint` clean on all four changed source files.
- The full suite is deliberately NOT run: another session works on this machine and it times out.
