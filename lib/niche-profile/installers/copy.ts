/**
 * lib/niche-profile/installers/copy.ts — Phase 9, D-9-10.
 *
 * Report copy the installers profile owns. Only the copy that exists today
 * (docs/v2-renewed-scanner-plan.md sections 7 and 8); nothing speculative.
 * Dutch is the primary, English its counterpart; the type requires both.
 *
 * The public scanner's own UI copy stays in messages/nl.json and
 * messages/en.json and is not touched. Profile copy is a second system, so
 * bilingual handling for it is its own work (Phase 12 renders it).
 *
 * Rules carried from the plan: the report never invents a loss figure
 * (D-9-R7), every number is chosen by code and handed to the template, and
 * nothing promises a measurable outcome.
 *
 * Placeholders: `{amount}` is the job value or the owner's own override,
 * `{count}` is the number of nearby installers that show reviews. Both are
 * filled by code in Phase 12.
 */
import type { ProfileCopy, ProfileLocale } from "../types";

export const INSTALLERS_COPY: Record<ProfileLocale, ProfileCopy> = {
  nl: {
    // Plan section 7: the owner can change the number; the default carries its citation.
    moneyLine: "Eén extra klus is ongeveer {amount} euro waard.",
    adashiFixes: {
      // Report section 2: business facts online.
      businessFacts:
        "Adashi zet je bedrijfsgegevens als gestructureerde data op je site, zodat zoekmachines en AI-assistenten ze kunnen lezen.",
      // Report section 3: social proof.
      socialProof:
        "Adashi toont je reviews op je eigen site en markeert ze zo dat zoekmachines ze kunnen lezen.",
      // Report section 5: website on a phone.
      websiteOnPhone: "Adashi maakt je site snel en prettig bruikbaar op een telefoon.",
      // Report section 6: quote request.
      quoteRequest:
        "Adashi zet een offerteformulier en een aanklikbaar telefoonnummer op de plekken waar een klant ze zoekt.",
    },
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
  },
  en: {
    moneyLine: "One extra job is worth about {amount} euros.",
    adashiFixes: {
      businessFacts:
        "Adashi publishes your business facts as structured data on your site, so search engines and AI assistants can read them.",
      socialProof:
        "Adashi shows your reviews on your own site and marks them up so search engines can read them.",
      websiteOnPhone: "Adashi makes your site fast and easy to use on a phone.",
      quoteRequest:
        "Adashi puts a quote form and a tap-to-call number where a customer looks for them.",
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
  },
};
