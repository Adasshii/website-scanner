# Report copy

For the installers niche. Dutch is primary, English is its counterpart.

Placeholders in `{braces}` are filled by code. Nothing here invents a number.

Status: approved by Joshua on 2026-11-16. No open decisions.

---

## 1. Header

**NL**

- Boven: `{bedrijf}, {plaats}`
- Kop: **Wat een klant van je vindt voordat hij belt**
- Score: `{score} van 100. {gap} punten te winnen.`
- Onder: We hebben je site en je openbare gegevens bekeken zoals een klant dat doet. Hieronder staat wat we vonden, en wat eraan te doen is.

**EN**

- Above: `{business}, {city}`
- Heading: **What a customer finds about you before they call**
- Score: `{score} out of 100. {gap} points to win.`
- Below: We looked at your site and your public details the way a customer does. Below is what we found, and what can be done about it.

Why this heading and not a score question: the score is the hook, but the frame has to be the customer's decision, not our audit. Six checks sit under it and they only have one thing in common, which is what a customer sees.

---

## 2. Why you got this

New section. Not in the plan's ten. The report arrives by cold email, so the first question in the reader's head is "who are you and why do you have a page about my company". Sous never needs this, because their visitor typed their own name into a box.

**NL**

Kop: **Je hebt dit rapport niet aangevraagd**

Dat weten we. Adashi bouwt websites voor installatie- en verbouwbedrijven. We kijken zelf welke bedrijven in de regio opvallen, en we maken het rapport voordat we bellen. Zo zie je wat wij zien, en kun je zelf beoordelen of het klopt.

Alles in dit rapport komt van je eigen openbare website en openbare bedrijfsgegevens. We hebben niets ingevuld wat we niet konden lezen.

**EN**

Heading: **You did not ask for this report**

We know. Adashi builds websites for installation and renovation companies. We pick the businesses in the region that stand out, and we write the report before we call. That way you see what we see, and you can judge for yourself whether it is right.

Everything in this report comes from your own public website and public business records. We filled in nothing we could not read.

---

## 3. Business facts online

**NL**

Kop: **Je bedrijfsgegevens op je eigen site**

Zoekmachines en AI-assistenten lezen je site letterlijk. Wat ze niet kunnen lezen, kunnen ze ook niet doorgeven.

- Labels: `Gevonden` / `Niet gevonden`
- Adashi lost dit op: Adashi zet je bedrijfsgegevens als gestructureerde data op je site, zodat zoekmachines en AI-assistenten ze kunnen lezen. *(bestaat al in copy.ts)*

**EN**

Heading: **Your business details on your own site**

Search engines and AI assistants read your site literally. What they cannot read, they cannot pass on.

- Labels: `Found` / `Not found`
- Adashi fixes this: Adashi publishes your business facts as structured data on your site, so search engines and AI assistants can read them. *(already in copy.ts)*

---

## 4. Social proof

**NL**

Kop: **Wat een klant ziet van je reviews**

Een klant die twijfelt zoekt bewijs van eerder werk. Niet op Google, maar op de pagina waar hij al staat.

Vier varianten, afhankelijk van wat we vonden:

1. Geen reviews op de site, en anderen wel: `{count} installateurs bij jou in de buurt tonen hun reviews op hun eigen site. Jij niet.` *(bestaat al)*
2. Geen reviews op de site, en anderen ook niet: Geen van de `{count}` bedrijven die we bekeken toont reviews op de eigen site. Hier kun je het verschil maken.
3. Reviews zichtbaar, niet machineleesbaar: Je reviews staan op je site, maar niet in een vorm die zoekmachines kunnen lezen.
4. Reviews zichtbaar en machineleesbaar: Dit staat goed. `{n}` reviews op je eigen site, en zoekmachines kunnen ze lezen.

Variant 2 bestaat omdat variant 1 breekt bij `{count}` is 0. Zonder die vierde staat zou het rapport "0 installateurs bij jou in de buurt tonen hun reviews. Jij niet." printen.

Adashi lost dit op: Adashi toont je reviews op je eigen site en markeert ze zo dat zoekmachines ze kunnen lezen. *(bestaat al)*

**EN**

Heading: **What a customer sees of your reviews**

A customer who is unsure looks for proof of earlier work, on the page they are already on rather than back on Google.

1. Nothing shown, and others do: `{count} installers near you show their reviews on their own site. You do not.` *(already in copy.ts)*
2. Nothing shown, and nor do the others: None of the `{count}` businesses we looked at show reviews on their own site. This is where you can be different.
3. Visible but not machine readable: Your reviews are on your site, but not in a form search engines can read.
4. Both: This one is fine. `{n}` reviews on your own site, and search engines can read them.

Adashi fixes this: Adashi shows your reviews on your own site and marks them up so search engines can read them. *(already in copy.ts)*

Variant 4 matters. A report where every section says "you are failing" reads like a sales letter. One honest "this is fine" buys the rest of the page its credibility.

---

## 5. Competitors

Competitors are described, never named. That is the plan's rule and it is also the safe one.

**NL**

Kop: **Je positie tussen vergelijkbare bedrijven**

We hebben `{count}` bedrijven in de buurt bekeken die hetzelfde werk doen. Ze staan hier zonder naam. Het gaat om je positie, niet om wie het is.

Van die `{count}` bedrijven tonen `{withProof}` hun reviews op hun eigen site, en hebben `{withData}` hun gegevens machineleesbaar staan. Jij staat op plek `{rank}`.

**EN**

Heading: **Where you stand among similar businesses**

We looked at `{count}` businesses nearby doing the same work. They appear here without names. This is about your position, not about who they are.

Of those `{count}`, `{withProof}` show their reviews on their own site and `{withData}` publish their details in machine readable form. You are in position `{rank}`.

---

## 6. Website on a phone

**NL**

Kop: **Je site op een telefoon**

De meeste klanten openen je site op hun telefoon, vaak 's avonds, en vaak terwijl ze er nog twee anderen openhebben.

- Laadtijd: `{seconds} seconden`
- Bron voor de vergelijking: `{citation}` *(citaat verplicht, geen eigen stelling)*
- Adashi lost dit op: Adashi maakt je site snel en prettig bruikbaar op een telefoon. *(bestaat al)*

**EN**

Heading: **Your site on a phone**

Most customers open your site on a phone, often in the evening, and often with two others open next to it.

- Load time: `{seconds} seconds`
- Source for the comparison: `{citation}` *(a citation is required, never our own assertion)*
- Adashi fixes this: Adashi makes your site fast and easy to use on a phone. *(already in copy.ts)*

---

## 7. Quote request

**NL**

Kop: **Kan een klant een offerte aanvragen?**

Een klant die wil aanvragen, wil dat nu doen. Buiten werktijd is er niemand om te bellen.

- Labels: `Offerteformulier`, `Aanklikbaar telefoonnummer`, `Projectfoto's`, `Certificeringen`
- Adashi lost dit op: Adashi zet een offerteformulier en een aanklikbaar telefoonnummer op de plekken waar een klant ze zoekt. *(bestaat al)*

**EN**

Heading: **Can a customer request a quote?**

A customer who wants a quote wants it now. Outside working hours there is nobody to phone.

- Labels: `Quote form`, `Tap to call number`, `Project photos`, `Certifications`
- Adashi fixes this: Adashi puts a quote form and a tap to call number where a customer looks for them. *(already in copy.ts)*

---

## 8. AI visibility

Reads as a frequency band, never as a score. That is requirement AIV-04.

**NL**

Kop: **Noemt ChatGPT jouw bedrijf?**

Steeds meer mensen vragen een AI-assistent om een aanbeveling in plaats van te zoeken. We hebben drie vragen gesteld die jouw klanten ook stellen, elk vijf keer, op `{date}`.

- Per vraag: `"{question}"` → Genoemd in `{hits}` van de 5 runs.
- Als anderen wel genoemd werden: In die runs werden `{others}` andere installateurs genoemd. We noemen ze niet bij naam.
- Adashi lost dit op: **nieuw, nog niet in copy.ts.** Voorstel: Adashi zet je bedrijf online zo neer dat een AI-assistent kan zien wat je doet, waar je werkt en wat anderen van je werk vinden.

**EN**

Heading: **Does ChatGPT name your business?**

More people ask an AI assistant for a recommendation instead of searching. We asked three questions your customers also ask, five times each, on `{date}`.

- Per question: `"{question}"` → Named in `{hits}` of 5 runs.
- When others were named: In those runs `{others}` other installers were named. We do not name them.
- Adashi fixes this: **new, not in copy.ts yet.** Proposed: Adashi presents your business online so an AI assistant can see what you do, where you work and what others say about your work.

---

## 9. The money line

Never a loss figure. That rule stays.

**NL**

Eén extra klus is ongeveer `{amount}` euro waard. *(bestaat al)*

Dit bedrag komt van `{source}`, gelezen op `{date}`. Klopt het niet voor jouw werk? Pas het aan, dan rekent de rest van dit rapport mee.

Dat is wat één klant waard is. Dit rapport laat zien wat zo'n klant tegenkomt voordat hij belt.

**EN**

One extra job is worth about `{amount}` euros. *(already in copy.ts)*

This figure comes from `{source}`, read on `{date}`. If it is wrong for your work, change it and the rest of this report follows.

That is what one customer is worth. This report shows what such a customer runs into before they call.

Not used: "Een website van Adashi betaalt zich terug met één extra klus." Reasoning in the settled decisions below.

---

## 10. The to-do list

**NL**

Kop: **Vijf dingen die je kunt doen**

Op volgorde. Bovenaan staat wat wij als eerste zouden aanpakken.

**EN**

Heading: **Five things you can do**

In order. The top one is what we would do first.

---

## 11. The ask

**NL**

Kop: **Zullen we dit samen doorlopen?**

Plan een gesprek van 15 minuten. We lopen dit rapport door en je hoort wat wij als eerste zouden doen. Geen voorstel, tenzij je erom vraagt.

Knop: `Plan een gesprek van 15 minuten`

**EN**

Heading: **Shall we walk through this together?**

Book a 15 minute call. We go through this report and you hear what we would do first. No proposal unless you ask for one.

Button: `Book a 15 minute call`

"Geen voorstel, tenzij je erom vraagt" earns the click from someone who did not ask for any of this.

---

## 12. Footer: where this came from, and how to stop it

**NL**

Dit rapport gaat over `{bedrijf}` en is gemaakt op `{date}` op basis van je openbare website en openbare bedrijfsgegevens. Het staat op een privélink en is niet vindbaar via Google.

Wil je dat we dit rapport weghalen en je niet meer benaderen? `[Eén klik, geen uitleg nodig]`

Juridische tekst volgens artikel 14 AVG: `{counsel_wording}`

**EN**

This report is about `{business}` and was made on `{date}` from your public website and public business records. It sits on a private link and cannot be found through Google.

Want us to take it down and not contact you again? `[One click, no explanation needed]`

Article 14 GDPR wording: `{counsel_wording}`

The opt-out has to be fast, free and one step. That is the project's own legal constraint, not a nicety.

---

## Decisions settled, 2026-11-16

1. **No money line for central heating.** Joshua confirmed D-9-21 holds. A boiler swap at about 2,100 euros does not clear an Adashi project, so the trade keeps its cited job value and the report prints no money line for it. Sections 9 and the `showMoneyLine` flag already match this.
2. **Never print a competitor's name.** Joshua confirmed. This now applies to the whole report, not only section 5. Section 8 says how many other installers an AI assistant named, never which. The raw names stay in the stored response for audit and never reach the page.

3. **"Pays for itself with one extra job" is not used.** Joshua delegated this one. Two reasons to leave it out. It promises the job, not the arithmetic: the true part is that one such job is worth more than a website costs, and the untrue part is the implied certainty that the website produces that job. And the honest version of it needs a price, which would put Adashi's starting figure on a page sent to someone who never asked, anchoring the number before the call. Instead the money section ends with "Dat is wat één klant waard is. Dit rapport laat zien wat zo'n klant tegenkomt voordat hij belt." That ties the money to the findings, claims nothing, and leaves the sum to the reader.

   Worth recording: wherever the money line prints at all, the claim would in fact have been true. The money line only shows for trades whose job value clears an Adashi project, which is the same rule that hides it for central heating. The arithmetic was sound. The promise was the problem.
4. **Four social proof variants, not three.** Joshua delegated this one. Variant 1 breaks when no nearby business shows reviews either: the report would print "0 installateurs bij jou in de buurt tonen hun reviews. Jij niet." Variant 2 covers that state and turns it into the one place in the report where being first is the point. Variants 3 and 4 stand as drafted, and variant 4 is the one honest pass that keeps the page from reading as a sales letter.

---

## 13. Tips, one per section

Approved 2026-11-16. Each tip sits under its section: a fact the owner can check, which happens to point at the fix. No promises, no outcome claims.

| Section | NL | EN |
|---|---|---|
| Business facts | Een zoekmachine leest je openingstijden alleen als ze in de code staan. Staat het alleen in een afbeelding, dan telt het niet mee. | A search engine reads your opening hours only when they are in the code. If they live only in an image, they do not count. |
| Social proof | Je reviews staan op je Google-profiel. Een bezoeker die al op je site is, ziet ze daar niet. | Your reviews are on your Google profile. A visitor already on your site does not see them there. |
| Website on a phone | Google meet je site op een telefoon, niet op een computer. Een site die op kantoor snel voelt, kan op 4G traag zijn. | Google measures your site on a phone, not on a computer. A site that feels fast at the office can be slow on 4G. |
| Quote request | Een bezoeker die 's avonds op je site komt, kan niet bellen. Met een formulier kan hij wel iets achterlaten. | A visitor who lands on your site in the evening cannot call. With a form, they can still leave something. |
| AI visibility | Een AI-assistent leest geen afbeeldingen en belt niemand. Alles wat hij over je weet, staat ergens als tekst. | An AI assistant reads no images and phones nobody. Everything it knows about you exists somewhere as text. |

The website-on-a-phone tip asserts that Google measures on mobile. It needs the same citation treatment as the load-time line in section 6: a named source read on a date, never our own assertion.

## Open decisions

None. Four of four settled on 2026-11-16.

## What this means for the code

The typed home for this copy landed on 2026-11-16 in `lib/niche-profile/types.ts` and `lib/niche-profile/installers/copy.ts`, filled for both locales from this document. Phase 12 renders it and may reshape the fields, so the field names follow the sections above and are not a contract. This document is the copy; the plan that landed it holds the mapping.

One thing is still missing:

- **Counsel's Article 14 wording.** Section 12 carries the label and the `{counsel_wording}` placeholder. No legal sentence exists yet.

The report's to-do list is not missing copy. Section 10 gives the heading and the ordering line, and that is all it needs: the five actions are written per business by the model from that business's own findings, with every number in them chosen by code. There are no five fixed sentences to write. What that list still needs is a generation rule, which belongs with Phase 11 and Phase 12 where the drafting lives.
