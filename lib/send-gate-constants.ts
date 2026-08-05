/**
 * lib/send-gate-constants.ts — PREPARED_TTL_MINUTES split out of
 * lib/send-gate.ts into its own zero-dependency module so a client
 * component (components/admin/outreach-row-panel.tsx) can read the TTL
 * without pulling lib/send-gate.ts's `node:crypto` import
 * (computePreparedHash's createHash) into the browser bundle — Next.js's
 * webpack build fails outright on a `node:` scheme import reaching client
 * code. lib/send-gate.ts re-exports this constant, so every existing
 * server-side import site (lib/send-record.ts, the send route, both
 * integration test suites) is unchanged.
 */

/**
 * D-04: a Prepare from days ago must not be treated as still valid.
 * lib/send-gate.ts's isPreparedFresh() is the single definition of the
 * freshness comparison against this constant.
 */
export const PREPARED_TTL_MINUTES = 30;
