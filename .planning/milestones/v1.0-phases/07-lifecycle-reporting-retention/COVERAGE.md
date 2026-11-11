# API Coverage — Phase 7 (Lifecycle, Reporting & Retention)

No external API integration: this phase adds internal Next.js routes
(`/api/admin/reporting`, `/api/cron/retention`), a pure derivation module, and one guarded
post-step inside the **already-integrated** Fillout webhook handler — it onboards no new
external service.

## Why the detector fired

`api-coverage.cjs` matched `(surface) + "api"` on the phrase *"reuse it from both the new
Reporting API route and the Shortlist column"* in `07-RESEARCH.md`. That is an **internal**
Next.js route handler, not an external API surface being integrated.

## Every external service this phase touches, and where it was integrated

| Service | Touched how in Phase 7 | Integrated in |
|---|---|---|
| Fillout | `app/api/webhooks/fillout/route.ts` gains a booking-attribution post-step after the existing `leads` write. Inbound webhook, no new outbound capability consumed. | Prior phase (the `booked_at` signal already exists) |
| Supabase | Reads and writes through the existing `createServerClient()` factory; one new migration. | Phase 1 |
| Vercel Cron | One additional entry in the existing `vercel.json` `crons` array. Platform scheduling, not an API surface. | Phase 1 |

No capability surface is enumerable here because none is being newly consumed. Fabricating
matrix rows for Fillout or Supabase would record decisions this phase is not making, and would
misrepresent a re-decision of an earlier phase's integration scope.

**Seal-time note:** the `api-coverage.verify-pre` gate accepts a reasoned
`No external API integration:` declaration with no rows. If a later phase integrates the
outreach send channel (Phase 8), that phase starts from a full-coverage baseline of its own and
must not inherit this declaration.
