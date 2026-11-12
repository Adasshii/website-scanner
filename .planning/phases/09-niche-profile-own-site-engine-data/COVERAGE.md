# API Coverage — Phase 9: Niche Profile & Own-Site Engine Data

No external API integration: this phase calls no external API, SDK or service; it extends the
existing in-repo engine (the niche profile module, the releasability predicate, the Overture import
query that already runs, and the Playwright scan that is already loading the page) and ships the
ENG-07 guard that will forbid Google Places content before Phase 12 makes the first such call.

## Why the detector fires on this phase anyway

The deterministic detector reports `detected: true` over the PLAN bodies because the plans discuss
an API at length without integrating one. The signals are all descriptive rather than constructive:

- `lib/google-content-guard.ts` enumerates Google Places API field names and endpoint hosts as a
  **ban list**. Naming a field in order to forbid it is the opposite of integrating against it, and
  the guard's own test asserts that no file in the repo contains any of those tokens
  (`ALLOWED_GOOGLE_CLIENT_FILES` is an empty array).
- The plans quote the Maps Platform policy page to justify D-9-R4.
- The scanner's existing `/api/scan/full-async` route and the `express.json()` body limit are
  discussed because the profile slice travels in that **internal** request between two of our own
  deployables (Vercel to Railway), not to a third party.

Confirmed against the phase scope by re-reading it, not by preference: 09-CONTEXT.md D-9-R4 states
in full that "No Google call exists in this phase at all; the guard ships before Phase 12 writes the
first one", and 09-RESEARCH.md's "Standard Stack" section recommends no new runtime package and no
new service.

## The integration this phase defers, and who owns its matrix

Phase 12 adds the live Google Places band and is the phase that genuinely integrates an external
API. Three vendor overrides are still owed for v2.0 (OpenAI in Phase 10, Google Places live-only in
Phase 12, a send provider in Phase 13), each listed in the ROADMAP Parallel Track table, and each
needs a written override and a spend cap before it is built against. The capability matrix for the
Places surface belongs to Phase 12, where the capability list can be decided against a real use,
and it inherits the constraint this phase enforces in code: only `place_id` may be stored, so every
other Place field is already an `OPT-OUT` by legal constraint rather than by preference.
