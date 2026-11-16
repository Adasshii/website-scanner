/**
 * lib/niche-profile/installers/copy.ts — Phase 9, D-9-10.
 *
 * Report copy the installers profile owns. The approved text is
 * docs/report-copy.md (approved 2026-11-16) and this file transcribes it, so
 * the document is the source of truth. Dutch is the primary, English its
 * counterpart; the type requires both.
 *
 * The public scanner's own UI copy stays in messages/nl.json and
 * messages/en.json and is not touched. Profile copy is a second system, so
 * bilingual handling for it is its own work (Phase 12 renders it).
 *
 * Rules carried from the plan: the report never invents a loss figure
 * (D-9-R7), every number is chosen by code and handed to the template, and
 * nothing promises a measurable outcome.
 *
 * Placeholders are filled by code in Phase 12. `{amount}` is the job value or
 * the owner's own override, `{count}` is a number of nearby installers, and
 * the rest are numbers, dates, a source and a citation. The Dutch half names
 * the business and the place `{bedrijf}` and `{plaats}`; the English half
 * names them `{business}` and `{city}`. That asymmetry is transcribed as the
 * document writes it, not normalised.
 */
import type { ProfileCopy, ProfileLocale } from "../types";

export const INSTALLERS_COPY: Record<ProfileLocale, ProfileCopy> = {
  nl: {
    // Report section 1.
    header: {
      eyebrow: "{bedrijf}, {plaats}",
      heading: "Wat een klant van je vindt voordat hij belt",
      scoreLine: "{score} van 100. {gap} punten te winnen.",
      intro:
        "We hebben je site en je openbare gegevens bekeken zoals een klant dat doet. Hieronder staat wat we vonden, en wat eraan te doen is.",
    },
    // Report section 2.
    whyYouGotThis: {
      heading: "Je hebt dit rapport niet aangevraagd",
      body: [
        "Dat weten we. Adashi bouwt websites voor installatie- en verbouwbedrijven. We kijken zelf welke bedrijven in de regio opvallen, en we maken het rapport voordat we bellen. Zo zie je wat wij zien, en kun je zelf beoordelen of het klopt.",
        "Alles in dit rapport komt van je eigen openbare website en openbare bedrijfsgegevens. We hebben niets ingevuld wat we niet konden lezen.",
      ],
    },
    // Report section 3.
    businessFacts: {
      heading: "Je bedrijfsgegevens op je eigen site",
      frame:
        "Zoekmachines en AI-assistenten lezen je site letterlijk. Wat ze niet kunnen lezen, kunnen ze ook niet doorgeven.",
      foundLabel: "Gevonden",
      notFoundLabel: "Niet gevonden",
    },
    // Report section 4.
    socialProof: {
      heading: "Wat een klant ziet van je reviews",
      frame:
        "Een klant die twijfelt zoekt bewijs van eerder werk. Niet op Google, maar op de pagina waar hij al staat.",
      noneHereOthersDo: "{count} installateurs bij jou in de buurt tonen hun reviews op hun eigen site. Jij niet.",
      noneHereNoneThere:
        "Geen van de {count} bedrijven die we bekeken toont reviews op de eigen site. Hier kun je het verschil maken.",
      visibleNotReadable: "Je reviews staan op je site, maar niet in een vorm die zoekmachines kunnen lezen.",
      visibleAndReadable: "Dit staat goed. {n} reviews op je eigen site, en zoekmachines kunnen ze lezen.",
    },
    // Report section 5: competitors are described, never named (REP-05).
    competitors: {
      heading: "Je positie tussen vergelijkbare bedrijven",
      frame:
        "We hebben {count} bedrijven in de buurt bekeken die hetzelfde werk doen. Ze staan hier zonder naam. Het gaat om je positie, niet om wie het is.",
      standing:
        "Van die {count} bedrijven tonen {withProof} hun reviews op hun eigen site, en hebben {withData} hun gegevens machineleesbaar staan. Jij staat op plek {rank}.",
    },
    // Report section 6.
    websiteOnPhone: {
      heading: "Je site op een telefoon",
      frame:
        "De meeste klanten openen je site op hun telefoon, vaak 's avonds, en vaak terwijl ze er nog twee anderen openhebben.",
      loadTimeLine: "Laadtijd: {seconds} seconden",
      citationLine: "Bron voor de vergelijking: {citation}",
    },
    // Report section 7.
    quoteRequest: {
      heading: "Kan een klant een offerte aanvragen?",
      frame: "Een klant die wil aanvragen, wil dat nu doen. Buiten werktijd is er niemand om te bellen.",
      checklist: {
        quoteForm: "Offerteformulier",
        clickToCall: "Aanklikbaar telefoonnummer",
        projectPhotos: "Projectfoto's",
        certifications: "Certificeringen",
      },
    },
    // Report section 8: a frequency band, never a score (AIV-04).
    aiVisibility: {
      heading: "Noemt ChatGPT jouw bedrijf?",
      frame:
        "Steeds meer mensen vragen een AI-assistent om een aanbeveling in plaats van te zoeken. We hebben drie vragen gesteld die jouw klanten ook stellen, elk vijf keer, op {date}.",
      perQuestionLine: "\"{question}\" → Genoemd in {hits} van de 5 runs.",
      othersNamedLine: "In die runs werden {others} andere installateurs genoemd. We noemen ze niet bij naam.",
    },
    // Report section 9. Plan section 7: the owner can change the number; the default carries its citation.
    moneyLine: {
      line: "Eén extra klus is ongeveer {amount} euro waard.",
      provenance:
        "Dit bedrag komt van {source}, gelezen op {date}. Klopt het niet voor jouw werk? Pas het aan, dan rekent de rest van dit rapport mee.",
      followUp: "Dat is wat één klant waard is. Dit rapport laat zien wat zo'n klant tegenkomt voordat hij belt.",
    },
    // Report section 10. The five item texts are not written yet, see `tips` below.
    todo: {
      heading: "Vijf dingen die je kunt doen",
      ordering: "Op volgorde. Bovenaan staat wat wij als eerste zouden aanpakken.",
    },
    // Report section 11.
    ask: {
      heading: "Zullen we dit samen doorlopen?",
      body: "Plan een gesprek van 15 minuten. We lopen dit rapport door en je hoort wat wij als eerste zouden doen. Geen voorstel, tenzij je erom vraagt.",
      buttonLabel: "Plan een gesprek van 15 minuten",
    },
    // Report section 12. The Article 14 wording is counsel's and does not exist yet.
    footer: {
      provenance:
        "Dit rapport gaat over {bedrijf} en is gemaakt op {date} op basis van je openbare website en openbare bedrijfsgegevens. Het staat op een privélink en is niet vindbaar via Google.",
      optOut: "Wil je dat we dit rapport weghalen en je niet meer benaderen?",
      optOutLinkLabel: "Eén klik, geen uitleg nodig",
      article14: "Juridische tekst volgens artikel 14 AVG: {counsel_wording}",
    },
    adashiFixes: {
      // Report section 3: business facts online.
      businessFacts:
        "Adashi zet je bedrijfsgegevens als gestructureerde data op je site, zodat zoekmachines en AI-assistenten ze kunnen lezen.",
      // Report section 4: social proof.
      socialProof:
        "Adashi toont je reviews op je eigen site en markeert ze zo dat zoekmachines ze kunnen lezen.",
      // Report section 6: website on a phone.
      websiteOnPhone: "Adashi maakt je site snel en prettig bruikbaar op een telefoon.",
      // Report section 7: quote request.
      quoteRequest:
        "Adashi zet een offerteformulier en een aanklikbaar telefoonnummer op de plekken waar een klant ze zoekt.",
      // Report section 8: AI visibility.
      aiVisibility:
        "Adashi zet je bedrijf online zo neer dat een AI-assistent kan zien wat je doet, waar je werkt en wat anderen van je werk vinden.",
    },
    tips: {}, // Empty by decision (D-9-24): the five to-do item texts are not written yet.
  },
  en: {
    header: {
      eyebrow: "{business}, {city}",
      heading: "What a customer finds about you before they call",
      scoreLine: "{score} out of 100. {gap} points to win.",
      intro:
        "We looked at your site and your public details the way a customer does. Below is what we found, and what can be done about it.",
    },
    whyYouGotThis: {
      heading: "You did not ask for this report",
      body: [
        "We know. Adashi builds websites for installation and renovation companies. We pick the businesses in the region that stand out, and we write the report before we call. That way you see what we see, and you can judge for yourself whether it is right.",
        "Everything in this report comes from your own public website and public business records. We filled in nothing we could not read.",
      ],
    },
    businessFacts: {
      heading: "Your business details on your own site",
      frame:
        "Search engines and AI assistants read your site literally. What they cannot read, they cannot pass on.",
      foundLabel: "Found",
      notFoundLabel: "Not found",
    },
    socialProof: {
      heading: "What a customer sees of your reviews",
      frame:
        "A customer who is unsure looks for proof of earlier work, on the page they are already on rather than back on Google.",
      noneHereOthersDo: "{count} installers near you show their reviews on their own site. You do not.",
      noneHereNoneThere:
        "None of the {count} businesses we looked at show reviews on their own site. This is where you can be different.",
      visibleNotReadable: "Your reviews are on your site, but not in a form search engines can read.",
      visibleAndReadable: "This one is fine. {n} reviews on your own site, and search engines can read them.",
    },
    competitors: {
      heading: "Where you stand among similar businesses",
      frame:
        "We looked at {count} businesses nearby doing the same work. They appear here without names. This is about your position, not about who they are.",
      standing:
        "Of those {count}, {withProof} show their reviews on their own site and {withData} publish their details in machine readable form. You are in position {rank}.",
    },
    websiteOnPhone: {
      heading: "Your site on a phone",
      frame:
        "Most customers open your site on a phone, often in the evening, and often with two others open next to it.",
      loadTimeLine: "Load time: {seconds} seconds",
      citationLine: "Source for the comparison: {citation}",
    },
    quoteRequest: {
      heading: "Can a customer request a quote?",
      frame: "A customer who wants a quote wants it now. Outside working hours there is nobody to phone.",
      checklist: {
        quoteForm: "Quote form",
        clickToCall: "Tap to call number",
        projectPhotos: "Project photos",
        certifications: "Certifications",
      },
    },
    aiVisibility: {
      heading: "Does ChatGPT name your business?",
      frame:
        "More people ask an AI assistant for a recommendation instead of searching. We asked three questions your customers also ask, five times each, on {date}.",
      perQuestionLine: "\"{question}\" → Named in {hits} of 5 runs.",
      othersNamedLine: "In those runs {others} other installers were named. We do not name them.",
    },
    moneyLine: {
      line: "One extra job is worth about {amount} euros.",
      provenance:
        "This figure comes from {source}, read on {date}. If it is wrong for your work, change it and the rest of this report follows.",
      followUp: "That is what one customer is worth. This report shows what such a customer runs into before they call.",
    },
    todo: {
      heading: "Five things you can do",
      ordering: "In order. The top one is what we would do first.",
    },
    ask: {
      heading: "Shall we walk through this together?",
      body: "Book a 15 minute call. We go through this report and you hear what we would do first. No proposal unless you ask for one.",
      buttonLabel: "Book a 15 minute call",
    },
    footer: {
      provenance:
        "This report is about {business} and was made on {date} from your public website and public business records. It sits on a private link and cannot be found through Google.",
      optOut: "Want us to take it down and not contact you again?",
      optOutLinkLabel: "One click, no explanation needed",
      article14: "Article 14 GDPR wording: {counsel_wording}",
    },
    adashiFixes: {
      businessFacts:
        "Adashi publishes your business facts as structured data on your site, so search engines and AI assistants can read them.",
      socialProof:
        "Adashi shows your reviews on your own site and marks them up so search engines can read them.",
      websiteOnPhone: "Adashi makes your site fast and easy to use on a phone.",
      quoteRequest:
        "Adashi puts a quote form and a tap-to-call number where a customer looks for them.",
      aiVisibility:
        "Adashi presents your business online so an AI assistant can see what you do, where you work and what others say about your work.",
    },
    tips: {}, // Empty by decision (D-9-24): the five to-do item texts are not written yet.
  },
};
