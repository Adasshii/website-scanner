// Canned raw-HTML strings for TRI-04 viewport-regex tests. Raw strings only
// (the phase rejects DOM libraries even in tests — no jsdom/cheerio parsing
// here, just what the regex in lib/triage-fetch.ts sees on the wire).
//
// Mirrors tests/fixtures/overture.ts's "sane, overridable defaults" builder
// shape via a small factory, though these are static HTML documents rather
// than a single overridable record — each export is a distinct, deliberate
// case the viewport regex must handle.

import type { TriageSignals } from "@/types/triage";

/** Expected `hasViewport` verdict per fixture, keyed by export name below. */
export const EXPECTED_VIEWPORT: Record<string, Pick<TriageSignals, "hasViewport">> = {
  HTML_NO_VIEWPORT: { hasViewport: false },
  HTML_VIEWPORT_DOUBLE_QUOTED: { hasViewport: true },
  HTML_VIEWPORT_SINGLE_QUOTED: { hasViewport: true },
  HTML_VIEWPORT_CONTENT_BEFORE_NAME: { hasViewport: true },
  HTML_VIEWPORT_UNQUOTED: { hasViewport: true },
  HTML_JS_INJECTED_VIEWPORT_ABSENT: { hasViewport: false },
};

/** No viewport meta tag anywhere in the document. */
export const HTML_NO_VIEWPORT = `<!DOCTYPE html>
<html>
<head>
  <title>Example</title>
  <meta charset="utf-8">
</head>
<body><h1>Hello</h1></body>
</html>`;

/** Standard viewport meta, double-quoted attributes. */
export const HTML_VIEWPORT_DOUBLE_QUOTED = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Example</title>
</head>
<body><h1>Hello</h1></body>
</html>`;

/** Viewport meta, single-quoted attributes. */
export const HTML_VIEWPORT_SINGLE_QUOTED = `<!DOCTYPE html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
</head>
<body><h1>Hello</h1></body>
</html>`;

/** Viewport meta where content= appears BEFORE name= in the tag. */
export const HTML_VIEWPORT_CONTENT_BEFORE_NAME = `<!DOCTYPE html>
<html>
<head>
  <meta content="width=device-width, initial-scale=1" name="viewport">
</head>
<body><h1>Hello</h1></body>
</html>`;

/** Viewport meta with an unquoted name= value. */
export const HTML_VIEWPORT_UNQUOTED = `<!DOCTYPE html>
<html>
<head>
  <meta name=viewport content="width=device-width, initial-scale=1">
</head>
<body><h1>Hello</h1></body>
</html>`;

/**
 * JS-injected-only page: a client-rendered (SPA) document whose RAW server
 * HTML has no viewport tag at all — it's injected into the DOM by
 * client-side JS after hydration. This is the documented no-browser blind
 * spot (RESEARCH.md Pattern 2): triage sees this exact string and correctly
 * (if pessimistically) reports hasViewport=false, since it never runs JS.
 */
export const HTML_JS_INJECTED_VIEWPORT_ABSENT = `<!DOCTYPE html>
<html>
<head>
  <title>My React App</title>
  <script defer src="/static/js/main.abc123.js"></script>
</head>
<body><div id="root"></div></body>
</html>`;
