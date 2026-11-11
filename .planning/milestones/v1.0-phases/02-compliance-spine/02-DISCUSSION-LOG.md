# Phase 2: Compliance Spine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-18
**Phase:** 2-Compliance Spine
**Areas discussed:** Unsubscribe experience, Auto-suppression rules, Override & lookup surface, LIA artifact & versioning

---

## Unsubscribe experience

### When the suppression is written
| Option | Description | Selected |
|--------|-------------|----------|
| Instant on visit | Opening the link suppresses immediately (sync write, then confirmation) + RFC 8058 one-click POST | ✓ |
| Confirm button | Link opens a page; suppression writes on the button POST (guards against prefetch) | |
| You decide | Claude picks | |

**User's choice:** Instant on visit
**Notes:** Over-suppression from mail-scanner prefetch accepted at 10–50/week; logged override undoes false positives.

### Confirmation page design
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal, bilingual | Plain NL/EN page, sender name, no CTA/tracking | |
| Branded Adashi page | Styled Adashi goodbye page | |
| You decide | Claude picks and documents | ✓ |

**User's choice:** You decide → Claude selected minimal bilingual page (NL first, parameterised), no CTA/resubscribe/tracking.

### Unsubscribe link host
| Option | Description | Selected |
|--------|-------------|----------|
| Domain-agnostic route | `/unsubscribe` in Next.js, no hardcoded host; host decided in send phase | ✓ |
| Main scanner domain now | Commit to production domain today | |
| Outreach subdomain now | Set up `out.` subdomain alias today | |

**User's choice:** Domain-agnostic route
**Notes:** No outreach emails exist until the gated send phase, so host choice isn't locked early.

### Opt-out data capture
| Option | Description | Selected |
|--------|-------------|----------|
| Capture nothing | Suppression record only (address, domain, source, timestamp) | ✓ |
| Optional reason dropdown | One optional select | |

**User's choice:** Capture nothing
**Notes:** GDPR minimisation; feedback meaningless at this volume.

---

## Auto-suppression rules

### Bounce vs complaint scope
| Option | Description | Selected |
|--------|-------------|----------|
| Both domain-wide | Matches roadmap criterion; one rule, one path | ✓ |
| Bounce = address only | Complaint domain-wide, bounce address-only | |
| You decide | Claude picks | |

**User's choice:** Both domain-wide

### Backfill historical events
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, one-time backfill | Seed suppressions from existing bounced/complained email_events | ✓ |
| No, start empty | Accumulate from new events only | |

**User's choice:** Yes, one-time backfill
**Notes:** Protects people who already flagged the shared Resend account; spine starts complete.

### Suppression → prospect linkage
| Option | Description | Selected |
|--------|-------------|----------|
| Pure lookup | Separate table consulted at boundaries; no lifecycle mutation | ✓ |
| Mark the prospect too | Also flip prospect to suppressed state | |
| You decide | Claude picks | |

**User's choice:** Pure lookup
**Notes:** One source of truth; Phase 3 admin list may join for a badge.

---

## Override & lookup surface

### Where the CMP-06 override lives
| Option | Description | Selected |
|--------|-------------|----------|
| CLI script | `scripts/suppression-override.ts`, import-prospects.ts pattern | ✓ |
| Small admin page now | Protected admin route with override form | |
| You decide | Claude picks | |

**User's choice:** CLI script
**Notes:** Phase 3 admin surface layers UI later; no throwaway UI now.

### What an override does to the record
| Option | Description | Selected |
|--------|-------------|----------|
| Lift, never delete | Record stays with lifted_at/reason; matching ignores lifted | ✓ |
| Delete with log entry | Remove row, write separate log | |
| You decide | Claude picks | |

**User's choice:** Lift, never delete
**Notes:** Full audit trail; aligns with CMP-15 indefinite retention.

### Legal-basis lookup (CMP-08/16)
| Option | Description | Selected |
|--------|-------------|----------|
| CLI lookup script | `scripts/legal-basis.ts <domain-or-email>` resolves country→regime→LIA + suppression status | ✓ |
| SQL view only | A DB view queried in Supabase Studio | |
| You decide | Claude picks | |

**User's choice:** CLI lookup script
**Notes:** Same resolution logic becomes API/UI in Phase 3.

---

## LIA artifact & versioning

### Storage & versioning
| Option | Description | Selected |
|--------|-------------|----------|
| Immutable files + DB registry | `docs/legal/lia/LIA-vN.md` immutable + `lia_versions` table | ✓ |
| Single file, git history | One `LIA.md`, version = git commit/tag | |
| You decide | Claude picks | |

**User's choice:** Immutable files + DB registry
**Notes:** App/lookup resolve "current version" without shelling into git.

### One LIA vs per-country
| Option | Description | Selected |
|--------|-------------|----------|
| One LIA, per-country regimes | Single versioned LIA; per-country differences in `legal_regimes` config pointing at LIA version | ✓ |
| Per-country LIA documents | Each country its own LIA file from the start | |
| You decide | Claude picks | |

**User's choice:** One LIA, per-country regimes
**Notes:** LIA is an EU-wide GDPR instrument; seed the NL regime row now; future country can reference its own artifact without schema change.

---

## Claude's Discretion

- Confirmation page design (minimal bilingual, no CTA/tracking).
- Unsubscribe token scheme, table/column names, migration structure, email-address normalisation for matching.

## Deferred Ideas

None — discussion stayed within phase scope. Adjacent compliance requirements (CMP-02, 09–15, 17) were bounded out to their owning phases.
