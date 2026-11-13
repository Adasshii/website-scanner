/**
 * harvestOwnSite() and its browser function: ENG-01, T-9-09 (DoS caps) and the
 * no-slice path. Lives in the root Vitest tree, not beside
 * scanner-service/src/own-site-harvest.ts: a test under scanner-service/src
 * would be picked up by that directory's own tsc build and fail on the vitest
 * import.
 *
 * The browser function body runs here against a minimal fake document, not a
 * real browser, so the file stays in the `unit` project and runs in well under
 * a second.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HARVEST_CAPS,
  harvestOwnSite,
  harvestOwnSiteInBrowser,
} from "../scanner-service/src/own-site-harvest";
import type { NicheScanSlice } from "../types/niche-scan-slice";
import type { MicrodataItem, MicrodataValue } from "../types/own-site";

// ── Minimal fake DOM ─────────────────────────────────────────────────────

class FakeEl {
  parent: FakeEl | null = null;
  children: FakeEl[] = [];
  constructor(
    readonly tagName: string,
    private readonly attrs: Record<string, string>,
    private readonly ownText: string
  ) {}
  getAttribute(name: string): string | null {
    return name in this.attrs ? this.attrs[name] : null;
  }
  hasAttribute(name: string): boolean {
    return name in this.attrs;
  }
  get textContent(): string {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  querySelectorAll(selector: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (node: FakeEl): void => {
      for (const child of node.children) {
        if (matches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function h(tag: string, attrs: Record<string, string> = {}, ...kids: Array<FakeEl | string>): FakeEl {
  const text = kids.filter((k): k is string => typeof k === "string").join("");
  const el = new FakeEl(tag.toUpperCase(), attrs, text);
  for (const kid of kids) {
    if (typeof kid !== "string") {
      kid.parent = el;
      el.children.push(kid);
    }
  }
  return el;
}

function matchSimple(el: FakeEl, selector: string): boolean {
  const m = /^([a-z0-9]*)((?:\[[^\]]+\])*)$/i.exec(selector.trim());
  if (!m) throw new Error(`fake DOM: unsupported selector ${selector}`);
  if (m[1] && el.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
  for (const a of Array.from(m[2].matchAll(/\[([a-z-]+)(?:(\^?)="([^"]*)")?\]/gi))) {
    const value = el.getAttribute(a[1]);
    if (value === null) return false;
    if (a[3] !== undefined) {
      if (a[2] === "^" ? !value.startsWith(a[3]) : value !== a[3]) return false;
    }
  }
  return true;
}

function matches(el: FakeEl, selector: string): boolean {
  for (const group of selector.split(",")) {
    const parts = group.trim().split(/\s+/);
    const last = parts.pop() as string;
    if (!matchSimple(el, last)) continue;
    let idx = parts.length - 1;
    for (let cur = el.parent; idx >= 0 && cur; cur = cur.parent) {
      if (matchSimple(cur, parts[idx])) idx--;
    }
    if (idx < 0) return true;
  }
  return false;
}

/** Install a fake document built from the given body children. Returns nothing; afterEach unstubs. */
function installDocument(opts: { title?: string; bodyText?: string; body: FakeEl[] }): void {
  const body = h("body", {}, ...opts.body);
  const html = h("html", {}, body);
  vi.stubGlobal("document", {
    title: opts.title ?? "",
    body: Object.assign(body, { innerText: opts.bodyText ?? "" }),
    querySelectorAll: (selector: string) => html.querySelectorAll(selector),
  });
}

const ORIGIN = "https://example.test";
const run = () => harvestOwnSiteInBrowser({ origin: ORIGIN, caps: HARVEST_CAPS });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Caps: each one has an input that exceeds it ──────────────────────────

describe("harvest caps truncate instead of throwing", () => {
  it("keeps at most 20 JSON-LD blocks and still reports how many the page held", () => {
    installDocument({
      body: Array.from({ length: 25 }, (_, i) => h("script", { type: "application/ld+json" }, `{"n":${i}}`)),
    });
    const harvest = run();
    expect(harvest.jsonLdBlocks.length).toBe(20);
    expect(harvest.jsonLdBlocksFound).toBe(25);
  });

  it("cuts a JSON-LD block to 200,000 characters", () => {
    installDocument({ body: [h("script", { type: "application/ld+json" }, "x".repeat(250_000))] });
    expect(run().jsonLdBlocks[0].length).toBe(200_000);
  });

  it("keeps at most 50 microdata items and flags the truncation", () => {
    installDocument({
      body: Array.from({ length: 60 }, () => h("div", { itemscope: "", itemtype: "https://schema.org/Thing" })),
    });
    const harvest = run();
    expect(harvest.microdata.length).toBe(50);
    expect(harvest.microdataCount).toBe(50);
    expect(harvest.microdataTruncated).toBe(true);
  });

  it("stops nesting microdata at depth 4 and flags the truncation", () => {
    let inner = h("span", { itemprop: "name" }, "deep");
    for (let level = 0; level < 6; level++) {
      inner = h("div", { itemscope: "", itemprop: "child", itemtype: "https://schema.org/Thing" }, inner);
    }
    installDocument({ body: [h("div", { itemscope: "", itemtype: "https://schema.org/Thing" }, inner)] });
    const harvest = run();
    let depth = 0;
    for (let item: MicrodataItem | undefined = harvest.microdata[0]; item; ) {
      depth++;
      const next: MicrodataValue | undefined = item.props["child"]?.[0];
      item = typeof next === "object" ? next : undefined;
    }
    expect(depth).toBe(4);
    expect(harvest.microdataTruncated).toBe(true);
  });

  it("stops walking after 5,000 element visits however big the item is", () => {
    const spans = Array.from({ length: 6_000 }, (_, i) => h("span", { itemprop: `p${i % 10}` }, "v"));
    installDocument({ body: [h("div", { itemscope: "", itemtype: "https://schema.org/Thing" }, ...spans)] });
    const harvest = run();
    const kept = Object.values(harvest.microdata[0].props).reduce((sum, v) => sum + v.length, 0);
    expect(kept).toBeLessThanOrEqual(5_000);
    expect(harvest.microdataTruncated).toBe(true);
  });

  it("keeps at most 50 distinct properties per item and 20 values per property", () => {
    const manyNames = Array.from({ length: 80 }, (_, i) => h("span", { itemprop: `name${i}` }, "v"));
    const manyValues = Array.from({ length: 40 }, () => h("span", { itemprop: "same" }, "v"));
    installDocument({
      body: [h("div", { itemscope: "" }, ...manyNames), h("div", { itemscope: "" }, ...manyValues)],
    });
    const harvest = run();
    expect(Object.keys(harvest.microdata[0].props).length).toBe(50);
    expect(harvest.microdata[1].props["same"].length).toBe(20);
  });

  it("cuts a microdata value to 1,000 characters", () => {
    installDocument({
      body: [h("div", { itemscope: "" }, h("span", { itemprop: "description" }, "y".repeat(5_000)))],
    });
    const value = run().microdata[0].props["description"][0];
    expect(typeof value === "string" && value.length === 1_000).toBe(true);
  });

  it("keeps at most 100 internal paths, 100 tel hrefs and 100 nav texts", () => {
    installDocument({
      body: [
        h(
          "nav",
          {},
          ...Array.from({ length: 150 }, (_, i) => h("a", { href: `/page-${i}` }, `Page ${i}`))
        ),
        ...Array.from({ length: 150 }, (_, i) => h("a", { href: `tel:+3130${1000000 + i}` }, "bel")),
      ],
    });
    const harvest = run();
    expect(harvest.internalPaths.length).toBe(100);
    expect(harvest.telHrefs.length).toBe(100);
    expect(harvest.navTexts.length).toBe(100);
  });

  it("keeps at most 100 widget hosts", () => {
    installDocument({
      body: Array.from({ length: 150 }, (_, i) => h("script", { src: `https://cdn${i}.example.org/w.js` })),
    });
    expect(run().widgetHosts.length).toBe(100);
  });

  it("cuts body text to 20,000 characters", () => {
    installDocument({ body: [], bodyText: "z".repeat(30_000) });
    expect(run().bodyText.length).toBe(20_000);
  });

  it("keeps the caps as the one source of truth the evaluate argument carries", () => {
    expect(HARVEST_CAPS.jsonLdBlocks).toBe(20);
    expect(HARVEST_CAPS.jsonLdChars).toBe(200_000);
    expect(HARVEST_CAPS.microdataItems).toBe(50);
    expect(HARVEST_CAPS.microdataDepth).toBe(4);
    expect(HARVEST_CAPS.linkHrefs).toBe(100);
    expect(HARVEST_CAPS.widgetHosts).toBe(100);
    expect(HARVEST_CAPS.bodyText).toBe(20_000);
  });
});

// ── What the harvest reads ───────────────────────────────────────────────

describe("microdata harvest", () => {
  it("reads each value by the HTML specification rule", () => {
    installDocument({
      body: [
        h(
          "div",
          { itemscope: "", itemtype: "https://schema.org/LocalBusiness" },
          h("meta", { itemprop: "telephone", content: " 030 123 4567 " }),
          h("a", { itemprop: "url", href: "https://example.test/" }, "link text"),
          h("img", { itemprop: "image", src: "/logo.png" }),
          h("time", { itemprop: "foundingDate", datetime: "2001-02-03" }, "Feb 2001"),
          h("data", { itemprop: "branchCode", value: "42" }, "forty-two"),
          h("span", { itemprop: "name" }, "  Example Installatie  ")
        ),
      ],
    });
    const props = run().microdata[0].props;
    expect(props["telephone"][0]).toBe("030 123 4567");
    expect(props["url"][0]).toBe("https://example.test/");
    expect(props["image"][0]).toBe("/logo.png");
    expect(props["foundingDate"][0]).toBe("2001-02-03");
    expect(props["branchCode"][0]).toBe("42");
    expect(props["name"][0]).toBe("Example Installatie");
  });

  it("nests an itemprop that is itself an item and does not also list it as a root", () => {
    installDocument({
      body: [
        h(
          "div",
          { itemscope: "", itemtype: "https://schema.org/LocalBusiness" },
          h(
            "div",
            { itemprop: "address", itemscope: "", itemtype: "https://schema.org/PostalAddress" },
            h("span", { itemprop: "streetAddress" }, "Weg 1")
          )
        ),
      ],
    });
    const harvest = run();
    expect(harvest.microdata.length).toBe(1);
    expect(harvest.microdataCount).toBe(2);
    const address = harvest.microdata[0].props["address"][0];
    expect(typeof address === "object" && address.props["streetAddress"][0] === "Weg 1").toBe(true);
  });

  it("keeps a breadcrumb root and a business root as two separate items, in order", () => {
    installDocument({
      body: [
        h("ol", { itemscope: "", itemtype: "https://schema.org/BreadcrumbList" }),
        h("div", { itemscope: "", itemtype: "https://schema.org/LocalBusiness" }),
      ],
    });
    const types = run().microdata.map((m) => m.type);
    expect(types.join("|")).toBe("https://schema.org/BreadcrumbList|https://schema.org/LocalBusiness");
  });

  it("splits a multi-name itemprop and skips a __proto__ property name", () => {
    installDocument({
      body: [
        h(
          "div",
          { itemscope: "" },
          h("span", { itemprop: "name legalName" }, "Example"),
          h("span", { itemprop: "__proto__" }, "polluted")
        ),
      ],
    });
    const props = run().microdata[0].props;
    expect(props["name"][0]).toBe("Example");
    expect(props["legalName"][0]).toBe("Example");
    expect(Object.keys(props).includes("__proto__")).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});

describe("the other harvest zones", () => {
  it("reads title, headings, body text, nav text and internal paths", () => {
    installDocument({
      title: "Example Installatie",
      bodyText: "Welkom bij Example",
      body: [
        h("header", {}, h("a", { href: "/diensten" }, "Diensten")),
        h("h1", {}, " Hoofdkop "),
        h("h2", {}, "Tweede"),
        h("h3", {}, "Derde"),
        h("a", { href: "/contact" }, "Contact"),
        h("a", { href: "/contact" }, "Contact again"),
        h("a", { href: "https://other.example.org/x" }, "Extern"),
        h("a", { href: "mailto:info@example.test" }, "Mail"),
      ],
    });
    const harvest = run();
    expect(harvest.title).toBe("Example Installatie");
    expect(harvest.h1.join("|")).toBe("Hoofdkop");
    expect(harvest.h2h3.join("|")).toBe("Tweede|Derde");
    expect(harvest.bodyText).toBe("Welkom bij Example");
    expect(harvest.navTexts.join("|")).toBe("Diensten");
    expect(harvest.internalPaths.join("|")).toBe("/diensten|/contact");
  });

  it("reads tel hrefs, form summaries, image hints and widget hosts", () => {
    installDocument({
      body: [
        h("a", { href: "tel:+31301234567" }, "Bel"),
        h(
          "form",
          {},
          h("input", { type: "text", name: "naam" }),
          h("input", { type: "email", name: "mail" }),
          h("input", { type: "hidden", name: "token" }),
          h("textarea", { name: "bericht" }),
          h("button", { type: "submit" }, " Offerte aanvragen ")
        ),
        h("img", { src: "/uploads/2024/warmtepomp-binnenunit.jpg?v=2", alt: "Binnenunit" }),
        h("script", { src: "https://widget.reviews.example.org/embed.js" }),
        h("iframe", { src: "https://maps.example.net/frame" }),
        h("script", { src: "/local.js" })
      ],
    });
    const harvest = run();
    expect(harvest.telHrefs.join("|")).toBe("tel:+31301234567");
    expect(harvest.formSummaries.length).toBe(1);
    expect(harvest.formSummaries[0].fieldCount).toBe(3);
    expect(harvest.formSummaries[0].submitLabel).toBe("Offerte aanvragen");
    expect(harvest.imgHints[0].alt).toBe("Binnenunit");
    expect(harvest.imgHints[0].file).toBe("warmtepomp-binnenunit.jpg");
    expect(harvest.widgetHosts.join("|")).toBe("widget.reviews.example.org|maps.example.net|example.test");
  });
});

// ── The slice gate and the failure path ──────────────────────────────────

const SLICE: NicheScanSlice = {
  nicheId: "installers",
  trades: [],
  reviewWidgetHosts: [],
  minTradeScore: 1,
  dominanceRatio: 1.5,
};

describe("harvestOwnSite", () => {
  it("does no own-site work at all when the request carried no slice", async () => {
    const evaluate = vi.fn();
    const url = vi.fn(() => ORIGIN);
    const page = { evaluate, url } as never;
    expect(await harvestOwnSite(page, undefined)).toBeNull();
    expect(await harvestOwnSite(page, null)).toBeNull();
    expect(evaluate).not.toHaveBeenCalled();
    expect(url).not.toHaveBeenCalled();
  });

  it("evaluates once, with the caps and the page origin, when a slice was requested", async () => {
    const harvest = { jsonLdBlocks: [] };
    const evaluate = vi.fn(async () => harvest);
    const page = { evaluate, url: () => `${ORIGIN}/some/page?x=1` } as never;
    const outcome = await harvestOwnSite(page, SLICE);
    expect(outcome?.state).toBe("harvested");
    expect(evaluate).toHaveBeenCalledTimes(1);
    const args = (evaluate.mock.calls[0] as unknown as [unknown, { origin: string; caps: unknown }])[1];
    expect(args.origin).toBe(ORIGIN);
    expect(args.caps).toBe(HARVEST_CAPS);
  });

  it("returns unreadable instead of throwing when the page evaluation rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = {
      evaluate: vi.fn(async () => {
        throw new Error("Execution context was destroyed");
      }),
      url: () => ORIGIN,
    } as never;
    const outcome = await harvestOwnSite(page, SLICE);
    expect(outcome?.state).toBe("unreadable");
  });

  it("returns unreadable when the page url cannot be read either", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const page = {
      evaluate: vi.fn(),
      url: () => {
        throw new Error("page closed");
      },
    } as never;
    const outcome = await harvestOwnSite(page, SLICE);
    expect(outcome?.state).toBe("unreadable");
  });
});
