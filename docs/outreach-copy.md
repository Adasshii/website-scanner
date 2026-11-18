# Outreach copy: the cold email and the call

**Status:** approved by Joshua, 2026-11-18. This file is the source of truth for the outreach
wording, the way `docs/report-copy.md` is for the report.

**Positioning:** direction A, logged 2026-11-16 in `decisions/log.md`. The promise leads with the
moment before a customer makes contact, not with the craft. The email and the call are written
from that frame.

The six findings a prospect reads are sections 3 to 8 of `docs/report-copy.md`: business facts
online, social proof, position among similar businesses, website on a phone, quote request, AI
visibility.

---

## 1. The subject line

Approved 2026-11-16. Lives in `buildDraftSubject()` in `lib/draft-prompt.ts`.

| Locale | Line |
| --- | --- |
| NL | `Wat {businessName} laat zien voordat iemand contact opneemt` |
| EN | `What {businessName} shows before anyone gets in touch` |

`businessName` is `prospect.name`, falling back to `prospect.domain` when a prospect has no name.

**What this replaced.** Until 2026-11-18 the model wrote its own subject per the prompt's output
contract: at most six words, naming the concrete finding. That rule was added on 2026-07-28 and
fixed a real fault, because the model kept copying the worked example's subject word for word.
The retired code fallback was `Snelle observatie over {domein}`.

**Trade-off on record.** One fixed line goes to every prospect. At 10 to 50 sends a week that
reads as one person writing. Much above that it starts to look like a mail merge. Restoring the
model-authored subject is one line in `generateDraft()` plus the SUBJECT rule in `TONE_BRIEF`.

The example-copying fault cannot recur: no worked example carries a subject any more.

---

## 2. The email body

Generated per business by Claude from `TONE_BRIEF` in `lib/draft-prompt.ts`. This file records
the frame and the approved worked examples; the prompt is the implementation.

### Structure

1. `Hi,` alone on its line, then a blank line.
2. The moment. One sentence: before anyone makes contact, they look the business up first.
3. One finding from the scan, with the exact figure, character for character.
4. What it costs, in plain terms: visitors leaving, enquiries not arriving, being hard to find.
5. The `[RAPPORT]` token once, framed as what that visitor runs into.
6. One ask. A short reply, or fifteen minutes. Offered, not pushed.

Step 2 is the change. The body used to open on the finding, which is the old framing: a technical
audit. The finding is now the evidence for the moment rather than the opening line.

### Worked example, Dutch

> Hi,
>
> Voordat iemand contact met je opneemt, kijkt hij eerst even op je site. Bij Fysio Van Dijk
> duurt het 6,4 seconden voordat de grootste afbeelding op je homepage zichtbaar is. Op mobiel
> haken de meeste mensen na drie seconden af, dus je verliest waarschijnlijk aanvragen voordat
> iemand je aanbod ziet. Ik heb op een rij gezet wat zo'n bezoeker bij je tegenkomt: [RAPPORT].
> Als het nuttig lijkt, laat het weten, dan loop ik er in een kwartier met je doorheen. Geen
> verplichting.

82 words.

### Worked example, English

> Hi,
>
> Before anyone contacts you, they check you online first. On Van Dijk Physio the largest image
> on your homepage takes 6.4 seconds to appear. Most mobile visitors leave after three seconds,
> so you are probably losing enquiries before anyone sees what you offer. I put together what a
> visitor like that runs into on your site: [RAPPORT]. If it looks useful, let me know and I
> will walk you through it in fifteen minutes. No obligation.

76 words. The limit is 70 to 120, so it did not move.

### What did not change

- One finding only, never a list. A laundry list is what made the first drafts read weak.
- The figure is reproduced exactly. A paraphrased or rounded number fails the verbatim guard in
  `generateDraft()` and the draft is discarded rather than repaired.
- The model writes `[RAPPORT]` and never a URL of its own. `resolveReportLink()` puts the real
  link in and strips any other URL.
- The model writes no legal text, no privacy notice and no opt-out. Code appends those.
- Dutch is informal: je, jij, jouw. Never u or uw.
- No em dashes, no exclamation marks, no bullet lists, no urgency, no closing hard sell.
- No promise of rankings, revenue or guarantees.

---

## 3. The call

Not in code. Joshua reads this.

### Opening

Approved 2026-11-16, word for word.

> Hoi, je spreekt met Joshua van Adashi. Ik heb gekeken naar wat iemand van [bedrijf] ziet in de
> dertig seconden voordat hij kiest. Zes dingen kwamen eruit. Heb je twee minuten?

### The scope line, said early

This is the line that makes the honest report work. Option 3 settled that the report tells the
truth about all six findings while Adashi sells the website ones. Said early, it is honesty. Said
at the end, it is bad news.

> Van die zes zitten er vier aan je website vast. Dat deel pak ik aan. Reviews en hoe je het doet
> tegenover anderen doe ik niet, daar vertel ik je hoe je het zelf aanpakt.

### The split, approved 2026-11-18

| The finding | Adashi does it? |
| --- | --- |
| Website on a phone | Yes |
| Quote request | Yes |
| Business facts online | The part on the site, yes. The Google profile itself, no. |
| AI visibility | The part on the site, yes. The rest, no. |
| Social proof | No. The owner asks his own customers for reviews. |
| Position among similar businesses | No. That is context, not a job. |

Four of the six touch the website. Two of those four only in part, which is why the scope line
says "dat deel" and not "die vier".

### Walking the finding

Use the one finding from the email. Use the figure as the report prints it. Never add a number
that is not in the report.

### Their turn

> Wat hiervan stoort jou het meest?

Then stop talking.

### Close

> Als je wil, zet ik op papier wat het kost om de site-kant aan te pakken. Geen verplichting.

### Never say

- Anything that promises leads, rankings, revenue or compliance. No evidence, no claim.
- A competitor's name. The report never prints one, and neither does the call.
- A price that is not already agreed. The pricing in the screenshot is illustrative.

---

## 4. The legal lines, untouched

Nothing above changes any of these.

- The Article 14 notice is appended by code after generation, from `ARTICLE_14_NOTICE_NL` and
  `ARTICLE_14_NOTICE_EN` in `lib/draft-prompt.ts`. Both carry the status "DRAFT, pending counsel
  review", inherited from `docs/legal/lia/LIA-v1.md`. **This is still open and it still gates
  sending.**
- Every send passes a human gate.
- Every send carries an opt-out that is one step, free and fast (`lib/opt-out-link.ts`).
- Every address is checked against the suppression list before a send.

---

## 5. Known cosmetic staleness

Four test files still use `"A quick observation about your site"` as a stored `draft_subject`
fixture: `components/admin/outreach-row-panel.test.tsx`, `lib/send-gate.integration.test.ts`,
`lib/send-record.integration.test.ts` and `lib/outreach-queue.integration.test.ts`. Those are
arbitrary input strings, not calls to `buildDraftSubject()`, and no assertion depends on the
wording. They were left alone to keep this change inside the pitch itself.
