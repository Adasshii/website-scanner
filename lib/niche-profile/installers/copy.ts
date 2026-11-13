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
    socialProof: "{count} installateurs bij jou in de buurt tonen hun reviews op hun eigen site. Jij niet.",
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
    socialProof: "{count} installers near you show their reviews on their own site. You do not.",
  },
};
