# Scanner — What's Missing

Current scanner checks: Accessibility (axe-core), Content (H1, word count, headings), SEO (title, meta, alt, lang, viewport, canonical), Performance (page size, image dimensions, load time).

---

## Performance

| Check | Notes |
|---|---|
| Core Web Vitals: LCP, CLS, INP | What Google actually ranks on. Biggest gap. |
| Image format (WebP/AVIF) | Flag old-format images |
| Render-blocking scripts/stylesheets | Scripts in `<head>` without `async`/`defer` |
| Compression (Gzip/Brotli) | Check response headers |
| Caching headers | `Cache-Control` on static assets |

---

## Security

| Check | Notes |
|---|---|
| HTTPS / SSL validity | Is the site on HTTPS? |
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| Mixed content | HTTP assets loaded on HTTPS pages |

---

## Technical SEO

| Check | Notes |
|---|---|
| Robots.txt presence | Does `/robots.txt` exist and return 200? |
| Sitemap presence | Does `/sitemap.xml` exist? |
| Broken links / 404s | Internal links that return errors |
| Redirect chains | Multiple hops before final URL |
| Open Graph tags | `og:title`, `og:description`, `og:image` |
| Twitter Card tags | `twitter:card`, `twitter:title`, etc. |
| Structured data / Schema.org | JSON-LD or microdata present |

---

## Content

| Check | Notes |
|---|---|
| Missing favicon | No `<link rel="icon">` in `<head>` |
| Readability score | Word complexity / Flesch reading ease |

---

## Accessibility (beyond axe-core)

axe-core already covers WCAG color contrast, ARIA, keyboard traps, and form labels. These are the gaps:

**Easy wins — detectable in HTML:**

| Check | What to look for |
|---|---|
| Skip navigation link | No `<a href="#main">` or "skip to content" near top of page |
| Vague link text | Links with text: "click here", "read more", "here", "learn more" |
| Video without captions | `<video>` with no `<track kind="captions">` |
| Audio without transcript | `<audio>` elements present (flag for manual review) |
| Form autocomplete missing | Name/email/phone inputs without `autocomplete` attribute |
| iframes without titles | `<iframe>` missing a `title` attribute |
| Tables without headers | `<table>` with no `<th>` elements |
| Empty buttons | `<button>` with no text content or `aria-label` |

**Harder — require CSS or visual analysis:**

| Check | Why it's hard |
|---|---|
| Focus indicator removed | Requires CSS parsing (`outline: none`) |
| Colour as sole differentiator | Requires visual/render analysis |
| Target size < 24×24px | Requires layout data |
| Reading level | Needs NLP / readability scoring |
