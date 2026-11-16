import type { TradeConfidence, TradeZones } from "../../scanner-service/src/trade-detection";

/**
 * Regression corpus for trade detection (plan 09-08, 09-RESEARCH.md Pattern 6).
 *
 * Each entry is a small typed object of trimmed zone DATA: a title, an h1, a few
 * headings, a short nav list, a few internal paths and a short body excerpt, plus
 * the trade a person would say the site is. It is data, never saved third-party
 * HTML: the data is what the detector consumes, it stays readable in a diff, and
 * no one else's page is committed into this repo.
 *
 * HONEST PROVENANCE: these are composed from the site classes the 53-homepage
 * research run measured (roofers, heat pump installers, hybrids, plumbers,
 * generic contractors), using the phrasing Dutch installer sites use. They are
 * not captures of named live sites, and the business names are invented. The
 * first real scans are the check on whether the classes behave the same on live
 * pages. What the corpus does guarantee is regression: a later change to a
 * weight, a cap or a seeded term either keeps every entry on its trade or shows
 * exactly which one it broke.
 *
 * "expected" is what a person reading the site would say it is, decided from the
 * description in `note` and not copied from the detector's output.
 */

export interface OwnSiteZoneFixture {
  id: string;
  /** What kind of site this stands for and why it is in the corpus. */
  note: string;
  /** One entry per page read. Most are a homepage alone, as in the research sample. */
  pages: TradeZones[];
  expected: { tradeId: string | null; confidence: TradeConfidence };
}

/** A fixture whose resolution is known to be wrong today, kept so the gap stays visible. */
export interface OwnSiteZoneKnownGap {
  id: string;
  note: string;
  pages: TradeZones[];
  /** What a person would say the site is. */
  shouldBe: string;
  /** What the detector resolves today. The test pins it, so fixing the seed fails the test and moves the entry. */
  currentlyResolvesTo: string | null;
}

/** Zones with every field empty unless the entry names it. */
export function makeZones(overrides: Partial<TradeZones> = {}): TradeZones {
  return { title: "", h1: [], h2h3: [], navTexts: [], internalPaths: [], bodyText: "", ...overrides };
}

/** The same site on seven pages: its nav repeats on every page, its title and h1 change. */
function sevenPageSite(
  navTexts: string[],
  sections: Array<{ title: string; h1: string; bodyText: string }>
): TradeZones[] {
  return sections.map((section) =>
    makeZones({ title: section.title, h1: [section.h1], navTexts, internalPaths: ["/", "/contact"], bodyText: section.bodyText })
  );
}

export const OWN_SITE_ZONE_CORPUS: readonly OwnSiteZoneFixture[] = [
  {
    id: "roofer-clear",
    note: "A roofer who also mentions solar panels once in a heading and once in the body. Roofing wins by a wide margin.",
    pages: [
      makeZones({
        title: "Van Dijk Dakdekkers | Dakreparatie en dakrenovatie in Utrecht",
        h1: ["Uw dakdekker in Utrecht"],
        h2h3: ["Dakreparatie en lekkage", "Platte daken met EPDM", "Bitumen dakbedekking", "Ook zonnepanelen op uw dak"],
        navTexts: ["Home", "Dakwerk", "Dakrenovatie", "Lekkage", "Projecten", "Contact"],
        internalPaths: ["/dakwerk", "/dakrenovatie", "/lekkage", "/projecten", "/contact"],
        bodyText:
          "Al 25 jaar uw vertrouwde dakdekker in Utrecht en omstreken. Wij repareren, renoveren en onderhouden pannendaken en platte daken. Vraag vrijblijvend een offerte aan. Wij plaatsen ook zonnepanelen.",
      }),
    ],
    expected: { tradeId: "roofing", confidence: "clear" },
  },
  {
    id: "roofer-compound-name",
    note: "A roofer whose domain and copy are built on a compound the seeded terms never list (the dakreparatie case). Prefix matching must find it.",
    pages: [
      makeZones({
        title: "Dakreparatie Noord | Snel, schoon en betrouwbaar",
        h1: ["Dakreparatie en daklekkage"],
        h2h3: ["Daklekkage verhelpen", "Dakisolatie"],
        navTexts: ["Dakreparatie", "Daklekkage", "Dakisolatie", "Offerte"],
        internalPaths: ["/dakreparatie", "/daklekkage"],
        bodyText: "Dakreparatie nodig? Bel ons voor een snelle afspraak.",
      }),
    ],
    expected: { tradeId: "roofing", confidence: "clear" },
  },
  {
    id: "roofer-seven-pages-solar-in-nav",
    note: "A 7-page scan of a roofer whose nav names solar panels on every page. The nav counts once, so roofing wins and the nav does not multiply.",
    pages: sevenPageSite(
      ["Home", "Dakwerk", "Zonnepanelen", "Projecten", "Contact"],
      [
        { title: "Dak en Zo Dakwerken | Home", h1: "Uw dakdekker aan huis", bodyText: "Dakwerk door vakmensen, ook zonnepanelen." },
        { title: "Dak en Zo Dakwerken | Dakreparatie", h1: "Dakreparatie door een dakdekker", bodyText: "Wij repareren elk type dak." },
        { title: "Dak en Zo Dakwerken | Dakrenovatie", h1: "Dakrenovatie met garantie", bodyText: "Een nieuw dak, vakkundig gelegd." },
        { title: "Dak en Zo Dakwerken | Lekkage", h1: "Daklekkage verholpen", bodyText: "Lekkage in uw dak? Wij komen snel." },
        { title: "Dak en Zo Dakwerken | Projecten", h1: "Recente dakprojecten", bodyText: "Bekijk ons dakwerk in de regio." },
        { title: "Dak en Zo Dakwerken | Over ons", h1: "Over onze dakdekkers", bodyText: "Een team van vaste dakdekkers." },
        { title: "Dak en Zo Dakwerken | Contact", h1: "Contact met uw dakdekker", bodyText: "Bel of mail voor een offerte." },
      ]
    ),
    expected: { tradeId: "roofing", confidence: "clear" },
  },
  {
    id: "flat-roof-epdm-bitumen",
    note: "A flat-roof specialist described by material: the whole-word EPDM and the substring bitumen carry it.",
    pages: [
      makeZones({
        title: "Platte daken | EPDM en bitumen specialist",
        h1: ["Platte daken vakkundig afgedicht"],
        h2h3: ["EPDM dakbedekking", "Bitumen daken"],
        navTexts: ["EPDM", "Bitumen", "Contact"],
        internalPaths: ["/epdm", "/bitumen"],
        bodyText: "Wij leggen EPDM en bitumen.",
      }),
    ],
    expected: { tradeId: "roofing", confidence: "clear" },
  },
  {
    id: "heat-pump-clear",
    note: "A heat pump installer who mentions replacing a boiler once. Heat pump wins by a wide margin.",
    pages: [
      makeZones({
        title: "Warmtepomp installateur Gelderland | Van Dam Duurzaam",
        h1: ["Duurzaam verwarmen met een warmtepomp"],
        h2h3: ["Lucht-water warmtepomp", "Bodem-water warmtepomp", "ISDE subsidie aanvragen", "Vervanging van uw cv ketel"],
        navTexts: ["Warmtepompen", "Subsidie", "Projecten", "Over ons", "Contact"],
        internalPaths: ["/warmtepompen", "/subsidie-isde", "/contact"],
        bodyText:
          "Wij installeren warmtepompen bij particulieren. Een warmtepomp bespaart gas. Ook uw cv ketel vervangen? Wij adviseren graag.",
      }),
    ],
    expected: { tradeId: "heat_pump", confidence: "clear" },
  },
  {
    id: "hybrid-heat-pump-and-boiler",
    note: "A hybrid installer who sells heat pumps and boilers in exact balance (the research saw two sites tie these two). The scores tie, the lower tieBreakRank (heat pump) takes it, and the reading is narrow. Central heating sorts first by id, so only the rank can produce this answer.",
    pages: [
      makeZones({
        title: "Installatiebedrijf De Vries | Warmtepomp en cv ketel",
        h1: ["Warmtepomp of cv ketel? Wij adviseren eerlijk"],
        h2h3: ["Warmtepomp installatie", "Cv ketel vervangen", "Onderhoud van uw cv ketel", "Hybride warmtepomp"],
        navTexts: ["Warmtepomp", "Cv ketel", "Onderhoud", "Contact"],
        internalPaths: ["/warmtepomp", "/cv-ketel", "/centrale-verwarming", "/onderhoud"],
        bodyText: "Installatiebedrijf De Vries werkt met warmtepompen. Vraag naar een cv ketel of een warmtepomp, wij rekenen het door.",
      }),
    ],
    expected: { tradeId: "heat_pump", confidence: "narrow" },
  },
  {
    id: "solar-clear",
    note: "A solar installer who mentions a heat pump once in the body. Solar wins by a wide margin, and the plural stem is what finds it.",
    pages: [
      makeZones({
        title: "Zonnepanelen installateur Brabant | Zon en Co",
        h1: ["Zonnepanelen laten plaatsen"],
        h2h3: ["Zonnepanelen op maat", "Thuisbatterij", "Omvormer vervangen"],
        navTexts: ["Zonnepanelen", "Thuisbatterij", "Subsidie", "Contact"],
        internalPaths: ["/zonnepanelen", "/thuisbatterij"],
        bodyText: "Wij plaatsen zonnepanelen, omvormers en thuisbatterijen. Ook een warmtepomp is mogelijk.",
      }),
    ],
    expected: { tradeId: "solar", confidence: "clear" },
  },
  {
    id: "solar-and-heat-pump",
    note: "An energy installer that does both. Solar edges ahead and the reading is narrow, which is what a later phase needs to know.",
    pages: [
      makeZones({
        title: "Energie installateur Friesland | Zonnepanelen en warmtepompen",
        h1: ["Zonnepanelen en warmtepompen van een adres"],
        h2h3: ["Zonnepanelen", "Warmtepompen", "Thuisbatterij"],
        navTexts: ["Zonnepanelen", "Warmtepompen", "Thuisbatterij", "Contact"],
        internalPaths: ["/zonnepanelen", "/warmtepompen"],
        bodyText: "Wij plaatsen zonnepanelen en warmtepompen.",
      }),
    ],
    expected: { tradeId: "solar", confidence: "narrow" },
  },
  {
    id: "bathroom-clear",
    note: "A bathroom specialist with a showroom.",
    pages: [
      makeZones({
        title: "Badkamer renovatie Haarlem | Van Leeuwen Badkamers",
        h1: ["Uw nieuwe badkamer in twee weken"],
        h2h3: ["Complete badkamerrenovatie", "Inloopdouche", "Sanitair en tegelwerk"],
        navTexts: ["Badkamers", "Inloopdouche", "Sanitair", "Showroom", "Contact"],
        internalPaths: ["/badkamers", "/inloopdouche"],
        bodyText: "Bezoek onze showroom voor een nieuwe badkamer.",
      }),
    ],
    expected: { tradeId: "bathroom", confidence: "clear" },
  },
  {
    id: "kitchen-clear",
    note: "A kitchen studio that mentions bathrooms once in the body.",
    pages: [
      makeZones({
        title: "Keukenstudio Amstelveen | Keukens op maat",
        h1: ["Uw droomkeuken, ontworpen en geplaatst"],
        h2h3: ["Keukens op maat", "Inbouwapparatuur", "Keuken ontwerpen"],
        navTexts: ["Keukens", "Showroom", "Inbouwapparatuur", "Contact"],
        internalPaths: ["/keukens", "/showroom"],
        bodyText: "Bezoek onze showroom voor een nieuwe keuken. Ook een badkamer nodig? Vraag ernaar.",
      }),
    ],
    expected: { tradeId: "kitchen", confidence: "clear" },
  },
  {
    id: "kitchen-and-bathroom-showroom",
    note: "A showroom that sells kitchens and bathrooms in exact balance. The scores tie, the lower tieBreakRank (bathroom) takes it, and the reading is narrow.",
    pages: [
      makeZones({
        title: "Keuken en badkamershowroom Zwolle",
        h1: ["Keukens en badkamers"],
        h2h3: ["Keukens", "Badkamers"],
        navTexts: ["Keukens", "Badkamers"],
        internalPaths: ["/keukens", "/badkamers"],
        bodyText: "Keukens en badkamers.",
      }),
    ],
    expected: { tradeId: "bathroom", confidence: "narrow" },
  },
  {
    id: "plumber-multi-trade",
    note: "A genuine multi-trade plumber: bathroom, roofing and heat pump all appear. The strongest match is still the trade, and the reading is narrow.",
    pages: [
      makeZones({
        title: "Loodgieter Smit | Badkamer, dakwerk en warmtepomp",
        h1: ["Loodgieter voor badkamer en installatie"],
        h2h3: ["Lekkage verhelpen", "Badkamer renoveren", "Dakgoten en dakwerk", "Warmtepomp advies"],
        navTexts: ["Badkamer", "Dakwerk", "Warmtepomp", "Lekkage", "Contact"],
        internalPaths: ["/badkamer", "/dakwerk", "/warmtepomp"],
        bodyText: "Loodgietersbedrijf Smit helpt met badkamers, dakgoten en warmtepompen.",
      }),
    ],
    expected: { tradeId: "bathroom", confidence: "narrow" },
  },
  {
    id: "central-heating-specialist",
    note: "A boiler service company that writes the singular and uses every seeded central heating term. The trade is central heating.",
    pages: [
      makeZones({
        title: "Mulder CV-ketel service | Onderhoud en vervanging",
        h1: ["CV-ketel vervangen of repareren?"],
        h2h3: ["Gasketel vervangen", "HR-ketel onderhoud", "Centrale verwarming storing"],
        navTexts: ["CV-ketel", "Onderhoud", "Storing", "Contact"],
        internalPaths: ["/cv-ketel", "/onderhoud"],
        bodyText: "Uw cv ketel kapot? Wij vervangen uw gasketel snel.",
      }),
    ],
    expected: { tradeId: "central_heating", confidence: "clear" },
  },
  {
    id: "generic-contractor",
    note: "A general contractor that names no trade at all. The research measured most of these as all zeros: unreadable, which is the intended outcome.",
    pages: [
      makeZones({
        title: "Aannemersbedrijf Jansen | Bouw, verbouw en onderhoud",
        h1: ["Uw aannemer voor elke klus"],
        h2h3: ["Verbouwingen", "Uitbouwen", "Onderhoud"],
        navTexts: ["Home", "Diensten", "Projecten", "Over ons", "Contact"],
        internalPaths: ["/diensten", "/projecten", "/over-ons", "/contact"],
        bodyText: "Wij verzorgen verbouwingen, uitbouwen en onderhoud in heel de regio. Ook voor een nieuwe keuken kunt u bij ons terecht.",
      }),
    ],
    expected: { tradeId: null, confidence: "unreadable" },
  },
  {
    id: "electrician",
    note: "An electrician: a real trade, but not one of the six, so it must not be read as any of them.",
    pages: [
      makeZones({
        title: "Van Berkel Elektrotechniek | Elektricien voor woning en bedrijf",
        h1: ["Uw elektricien in Rotterdam"],
        h2h3: ["Groepenkast vervangen", "Laadpaal installeren", "Storing verhelpen"],
        navTexts: ["Diensten", "Laadpalen", "Storingsdienst", "Contact"],
        internalPaths: ["/diensten", "/laadpalen", "/contact"],
        bodyText: "Wij werken aan installaties in woningen en bedrijfspanden.",
      }),
    ],
    expected: { tradeId: null, confidence: "unreadable" },
  },
  {
    id: "energy-advisor-mentions-only",
    note: "An energy advice company that talks about solar panels and heat pumps but installs nothing. A mention is not an offer, so it stays unreadable.",
    pages: [
      makeZones({
        title: "Energieadvies Zuid | Verduurzaam uw woning",
        h1: ["Onafhankelijk energieadvies voor uw woning"],
        h2h3: ["Isolatie en kierdichting", "Zonnepanelen en warmtepompen: wat past bij u?", "Subsidie aanvragen"],
        navTexts: ["Advies", "Subsidies", "Over ons", "Contact"],
        internalPaths: ["/advies", "/subsidies"],
        bodyText: "Wij adviseren over zonnepanelen, een warmtepomp of een hybride oplossing. Wij installeren zelf niets en verwijzen u door.",
      }),
    ],
    expected: { tradeId: null, confidence: "unreadable" },
  },
  {
    id: "installer-with-vacancies",
    note: "A general installer with a vacancy block full of the abbreviation for curriculum vitae. Central heating must not be read from it.",
    pages: [
      makeZones({
        title: "Mulder Installatietechniek | Loodgieter en monteur",
        h1: ["Installatiebedrijf met een goed team"],
        h2h3: ["Werken bij Mulder", "Vacatures", "Stuur je CV"],
        navTexts: ["Werken bij", "Vacatures", "Contact"],
        internalPaths: ["/vacatures", "/werken-bij"],
        bodyText: "Wij zoeken monteurs. Stuur je cv en motivatie naar info. Solliciteer met je cv.",
      }),
    ],
    expected: { tradeId: null, confidence: "unreadable" },
  },
  {
    id: "central-heating-plurals-only",
    note: "A boiler company that writes only the plural, 'cv ketels'. A person would call this central heating. Held in the corpus so the prefix match on the phrase 'cv ketel' cannot be quietly reverted to a word match.",
    pages: [
      makeZones({
        title: "Mulder Installatie | CV-ketels",
        h1: ["CV-ketels vervangen"],
        h2h3: ["Nieuwe cv ketels"],
        navTexts: ["CV-ketels"],
        internalPaths: ["/cv-ketels"],
        bodyText: "Wij plaatsen cv ketels.",
      }),
    ],
    expected: { tradeId: "central_heating", confidence: "clear" },
  },
  {
    id: "general-builder-trade-word-in-footer",
    note: "A 4-page general builder whose footer, repeated on every page, names a trade (roofing) in passing. A person reads a general builder, not a roofer. The footer counts once, the way the nav does (see roofer-seven-pages-solar-in-nav), so it cannot outweigh the per-page content that names no trade.",
    pages: [
      "Verbouwingen en uitbouwen",
      "Onderhoud aan woningen",
      "Nieuwbouw en renovatie",
      "Contact en werkwijze",
    ].map((heading, index) =>
      makeZones({
        title: `Aannemersbedrijf Jansen | ${heading}`,
        h1: [heading],
        navTexts: ["Home", "Diensten", "Projecten", "Over ons", "Contact"],
        internalPaths: ["/diensten", "/projecten", "/over-ons", "/contact"],
        bodyText: `Wij verzorgen werk in heel de regio, pagina ${index + 1}.\nAannemersbedrijf Jansen, ook dakwerken, dakreparatie en daklekkage`,
      })
    ),
    expected: { tradeId: null, confidence: "unreadable" },
  },
];

/**
 * Entries the detector gets wrong today. Not part of the pass or fail corpus:
 * they are here so the gap is visible, with the fix named in the note.
 *
 * Empty at present: the one gap the first corpus run found (a boiler company
 * writing only the plural) was closed by a prefix match on the phrase terms and
 * moved into OWN_SITE_ZONE_CORPUS. The register stays exported so the next gap
 * has somewhere to go.
 */
export const OWN_SITE_ZONE_KNOWN_GAPS: readonly OwnSiteZoneKnownGap[] = [];
