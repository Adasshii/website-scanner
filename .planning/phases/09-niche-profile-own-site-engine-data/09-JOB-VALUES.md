# Phase 9: Job Values per Trade

**Researched:** 2026-11-12
**Status:** the original six approved by Joshua, 2026-11-12; plumbing approved by Joshua, 2026-11-16
**Requirement:** NIC-02, every default job value carries a citation to the source it came from
**Decisions that bind this file:** 09-CONTEXT.md D-9-01 (Claude researches, Joshua approves each),
D-9-02 (the value is the customer invoice total, not the installer's margin), D-9-03 (all six
trades), D-9-04 (no approved value means no money line). D-9-03 scoped Phase 9 to six trades.
Plumbing was added afterwards by quick task 261116-rjk, driven by 49 production scans in which
Dutch plumber sites resolved to roofing.

This file is the source the profile's job values are copied from. Every number here was read from
the URL beside it, on 2026-11-12 for the first six and on 2026-11-16 for plumbing. When a number changes, this file changes first and the profile
follows it.

## What counts as a good source here

Ranked, and the ranking matters because the report is read by someone who does this work for a
living:

1. **Milieu Centraal.** An independent Dutch foundation funded by the ministry, which publishes
   reference prices and dates them. This is the strongest source available and it covers the two
   energy trades.
2. **A quote marketplace that publishes a dated average** (Homedeal, Verbouwkosten). Commercial,
   with an interest in the numbers, but the figures come from real job volume and each page carries
   a last-updated date. This is the best available source for bathroom, kitchen and roofing, which
   Milieu Centraal does not cover.
3. **A single installer's own price page.** Not used. One company's price list is not a market
   figure.

## The seven values

| Trade | Approved value | Source class | Approved |
|---|---|---|---|
| Heat pump | € 12.000 | Milieu Centraal | [x] 2026-11-12 |
| Solar panels | € 3.200, basis stated in copy | Milieu Centraal | [x] 2026-11-12 |
| Bathroom | € 7.500 | Marketplace average | [x] 2026-11-12 |
| Kitchen | € 11.000, midpoint of the source range | Marketplace average | [x] 2026-11-12 |
| Roofing | € 5.700 | Marketplace average | [x] 2026-11-12 |
| Central heating | € 2.100, **no money line** | Milieu Centraal | [x] 2026-11-12 |
| Plumbing | € 300, **no money line** | Marketplace average | [x] 2026-11-16 |

---

## 1. Heat pump — € 12.000

**Source:** Milieu Centraal, "Welke warmtepompen zijn er?"
`https://www.milieucentraal.nl/energie-besparen/duurzaam-verwarmen-en-koelen/welke-warmtepompen-zijn-er/`
**Read:** 2026-11-12
**Basis:** a fully electric (all-electric) air-to-water heat pump, 8 kW, energy label A+++,
including VAT and installation, before the ISDE subsidy of € 3.025. Milieu Centraal also gives
€ 6.200 for a hybrid heat pump at 4 kW, € 8.300 for a hybrid with a new boiler, and € 30.000 for a
ground-source pump.

**Why the pre-subsidy figure.** The installer invoices the full € 12.000. The homeowner claims the
ISDE subsidy back separately from RVO. D-9-02 says the value is what the customer pays the
installer, so € 12.000 is the number, not € 8.975.

**Note:** this is the figure the source plan carried as a placeholder. The research confirms it.

## 2. Solar panels — € 3.200

**Source:** Milieu Centraal, "De voordelen van zonnepanelen"
`https://www.milieucentraal.nl/energie-besparen/zonnepanelen/zonnepanelen-kopen/`
**Read:** 2026-11-12
**Basis:** a set of 8 panels, including installation and the inverter. The page states the price
date itself: January 2026. Quoted: "Zo'n set van 8 panelen kost ongeveer € 3.200 (prijs januari
2026). Dat is inclusief installatie en omvormer."

**One thing to weigh.** Eight panels is a small set by current practice. Commercial comparison
sites put a ten-panel install at € 3.800 to € 5.500, and a fifteen to twenty panel install at
€ 6.000 to € 9.000. So € 3.200 probably understates a typical 2026 job.

Understating is the safer error. An installer reading € 3.200 thinks "mine are bigger". An
installer reading an inflated figure thinks we do not know the trade.

**Approved 2026-11-12: € 3.200, with the basis stated in the copy.** The alternative offered was
€ 4.500 for a ten-panel set from a commercial comparison site; Joshua chose the Milieu Centraal
figure. The report copy for this trade MUST name the basis ("a set of 8 panels"), so the number is
never read as a claim about every job. That wording is a Phase 12 obligation carried from here.

## 3. Bathroom — € 7.500

**Source:** Homedeal, "Badkamer renovatie kosten"
`https://www.homedeal.nl/badkamerspecialist/badkamer-renoveren-kosten/`
**Read:** 2026-11-12. The page's own last-updated date: 23/04/2026.
**Basis:** the page's stated average for a bathroom renovation in the Netherlands. Minimum
€ 3.500, average € 7.500, maximum € 15.000, with "this project usually costs between € 5.000 and
€ 10.000". Per square metre the page gives € 500 to € 1.200, split into basic (€ 500 to € 700),
average (€ 700 to € 1.000) and luxury (€ 1.000 and up).

**Cross-check:** Werkspot gives € 700 to € 1.500 per m²; Verbouwstart gives € 1.800 to € 2.600 per
m² including labour and VAT. At 6 to 9 m², the Homedeal average sits inside the range the other
sources describe. Werkspot's own page returns HTTP 403 to automated reading, so its figures here
come from search results rather than a direct read.

## 4. Kitchen — € 11.000

**Source:** Homedeal, "Kosten van een keuken: wat betaal je écht"
`https://www.homedeal.nl/keukenspecialist/keuken-prijzen/`
**Read:** 2026-11-12. The page's own last-updated date: 05/01/2026.

**The page contradicts itself**, and that has to be recorded rather than smoothed over:

- Its summary block says: minimum € 5.500, **average € 15.000**, maximum € 25.000, "this project
  usually costs between € 12.500 and € 17.500".
- Its body text says: "De gemiddelde kosten voor een nieuwe keuken liggen tussen € 7.000 en
  € 15.000, inclusief montage en apparatuur."
- Its own table gives: budget kitchen € 5.000 to € 8.000, average kitchen € 8.000 to € 15.000,
  luxury € 15.000 to € 25.000 and up, all including fitting.

So the summary's "average" of € 15.000 is the **top** of the same page's own average band.

**Candidate A, € 15.000.** The figure the page calls the average. One citation, no arithmetic by
us. Risk: it is the top of the band, so it probably overstates a typical kitchen.

**Candidate B, € 11.000.** The midpoint of the body's explicit € 7.000 to € 15.000 sentence. A
more honest reading of the same page, but the citation then has to say "midpoint of the range the
source gives", because no source states € 11.000.

**Cross-check:** other sources give € 8.000 to € 25.000 (Werkspot), € 14.000 to € 15.000 as an
average including fitting and appliances (kortkeukens.nl), and € 12.000 to € 20.000 (a third).
They do not settle it.

**Approved 2026-11-12: candidate B, € 11.000.** The citation must read in full: "midpoint of the
€ 7.000 to € 15.000 range Homedeal states for a new kitchen including fitting and appliances, page
last updated 05/01/2026, read 2026-11-12". No source states € 11.000 outright, and the citation
has to say so rather than imply a figure that was never published.

## 5. Roofing — € 5.700

**Source:** Homedeal, "Kosten nieuw dak"
`https://www.homedeal.nl/dakbedekking/nieuw-dak-kosten/`
**Read:** 2026-11-12. The page's own last-updated date: 22/06/2026.
**Basis:** a complete new roof. Minimum € 3.000, average € 5.700, maximum € 9.000, with "this
project usually costs between € 4.500 and € 7.500". The same page's FAQ gives € 50 to € 150 per m²
including removing the old covering, material, labour and VAT, and says a 100 m² roof runs € 5.000
to € 15.000.

**Cross-check:** Verbouwkosten, prices last updated 2026
(`https://www.verbouwkosten.com/dak/dakbedekking/prijzen/`) gives per m²: bitumen € 60, EPDM € 60
to € 80, PVC € 60 to € 70, thatch € 105, roof tiles € 60 to € 140.

**One thing to weigh.** € 5.700 is the stated average but sits at the bottom of the same page's
own 100 m² range. Roof size drives this trade more than finish does, so a single figure carries
less meaning here than in the other five. Keep it, and let the report's adjustable field do the
work for a roofer with bigger jobs.

## 6. Central heating (cv-ketel) — € 2.100

**Source:** Milieu Centraal, "Cv-ketel vervangen"
`https://www.milieucentraal.nl/energie-besparen/verwarmen-met-gas/cv-ketel-vervangen/`
**Read:** 2026-11-12
**Basis:** a new boiler including installation. Quoted: "Een cv-ketel kost gemiddeld € 2.100,
inclusief installatie." Moving the boiler to a different spot adds pipework and a new flue, which
the page says costs extra.

**Cross-check:** Consumentenbond, via a comparison site, gives € 1.600 to € 3.400 including
installation, dated September 2025. Market estimates run € 1.500 to € 3.500. A CW5 combi boiler is
put at € 2.200 to € 3.200; a system boiler with a separate hot-water tank at € 3.000 to € 5.000.

**A problem this number creates, which is not a research problem.** Section 7 of the source plan
wants the report to say "an Adashi website pays for itself with one extra job". An Adashi project
is € 2.500 or more. At € 2.100 a boiler swap does not clear that, so for this one trade the
sentence is false.

**Approved 2026-11-12: central heating carries no money line.** The value € 2.100 is approved and
recorded here, and the trade keeps all six checks and a full score, but the report prints no money
line for it. This is the same behaviour D-9-04 gives a trade with no verified number, reached for a
different reason: the number is known and it does not support the claim. The alternative offered
was an honest "two extra boiler jobs" line; Joshua chose to print nothing. The engine must
therefore carry a per-trade switch that is separate from "has a value", because central heating has
a value and still shows no money line.

## 7. Plumbing (loodgieter): € 300

**Source:** Homedeal, "Lekkage opsporen kosten"
`https://www.homedeal.nl/prijsgidsen/lekkage-opsporen-kosten/`
**Read:** 2026-11-16
**Basis:** leak detection, the page's stated average.

**One thing to weigh.** The page disagrees with itself in three places, and that is recorded here
rather than smoothed over:

- Its header block says: minimum € 150, **average € 300**, maximum € 500.
- Its body text gives a project range of € 200 to € 400.
- Its FAQ gives € 300 to € 500.

The three statements do not agree. The approved number is € 300 because that is the figure the
page itself labels as the average, not because the other two were discounted. The page also happens
to put € 300 inside all three ranges.

**Money line.** An Adashi project is € 2.500 or more. At € 300 the sentence "one extra job pays
for the website" is false by a wider margin than it is for central heating. Plumbing therefore
carries a value AND prints no money line (D-9-21), approved by Joshua on 2026-11-16. This is the
second trade in that state, after central heating, and the two fields stay independent: having a
value never implies printing a money line.

**Page date.** The page shows a publication date of 30/12/2025, not a last-updated label. The
profile citation therefore omits the `pageUpdated` field, which sections 3, 4 and 5 use for a
genuine last-updated date, and carries the publication date inside the citation note instead.
Using a last-updated field to hold a publication date would make `pageUpdated` mean two different
things across the Homedeal-sourced trades.

## What is still owed

- **Nothing on the numbers.** The original six were approved by Joshua on 2026-11-12 and plumbing
  on 2026-11-16.
- **Plumbing is the weakest of the seven.** It is a leak-detection figure standing in for the whole
  trade. A plumber whose work is mostly bathroom or kitchen connection is worth more than € 300,
  so this is the first candidate for a re-read. The source's own header, body and FAQ also
  disagree (see section 7).
- **Phase 12 obligations carried from here:** the solar copy names the 8-panel basis; the kitchen
  citation states that € 11.000 is a midpoint; central heating prints no money line.
- **Re-check date.** These are 2026 figures with their own last-updated dates. Set a re-check when
  the profile is built, so a stale number becomes visible rather than silently wrong.
