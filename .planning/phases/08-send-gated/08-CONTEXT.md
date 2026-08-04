# Phase 8: Send — GATED - Context

**Gathered:** 2026-08-04
**Status:** Ready for planning
**Source:** Decisions settled directly with Joshua on 2026-08-04, in place of a discuss-phase run.

<domain>
## Task Boundary

Phase 8 delivers the send step of the outreach funnel. Phases 1 to 7 already produce a qualified prospect, a real scan report, a resolved and classified contact address, a drafted message, and a human approval queue. Phase 8 is the last link: getting an approved draft out the door and recording, immutably, why sending it was allowed.

The send itself is manual. There is no automated dispatch. What this phase builds is the gate and the record around a human action, not a mailer.
</domain>

<decisions>
## Implementation Decisions

### Channel: manual send, no provider

Locked 2026-08-04. There is no third-party dispatch provider. Prospect Radar generates, renders, and gates the approved draft. Joshua sends it by hand from his own mailbox, at 10 to 50 sends per week.

This closed the provider half of the Phase 8 gate. The evidence trail is `.planning/research/SEND-CHANNEL.md`, which is also the SND-04 artifact: it holds the provider comparison that ruled out every tier, including the finding that the whole transactional-ESP category (Mailgun, SendGrid, Brevo, Amazon SES, Resend) prohibits this activity by contract, so switching providers was never a fix.

Consequences that bind the plan:

- No SMTP client, no mail API client, no new dependency, no new environment variable for a mail provider.
- Resend is never imported, referenced, or configured anywhere in the outreach path. SND-03 is satisfied structurally rather than by configuration, and the plan should include a check that keeps it that way.
- No outreach domain, no SPF/DKIM/DMARC setup, no warmup. Those were provider-era concerns and are now moot.

### Draft handoff: copy subject, copy body

Two copy-to-clipboard actions, one for the subject and one for the body. Joshua pastes into his mail client.

Rejected: a `mailto:` link, because URL length limits would be exceeded by the scan-report link plus the Article 14 notice, and formatting does not survive. Rejected: an `.eml` download, because it is awkward in webmail, which is the likely destination.

The opt-out link (see SND-02 below) must be inside the copied body, not rendered beside it. If it can be left behind by copying, it will eventually be left behind.

### Send recording: two steps, unsent items resurface

Two distinct actions, not one:

1. **Prepare.** Runs the gates (see below), renders the final message, reveals the copy actions.
2. **Mark as sent.** Writes the immutable per-send record and advances lifecycle.

Anything prepared but never marked as sent must resurface in the queue as unresolved. It must not sit silently in an ambiguous state.

A single combined action was rejected on purpose: it would write a record asserting a send happened at a moment when nothing had been sent, and CMP-11's whole value is that the record is true.

### The gates, and when they run

Both gates run at Prepare, and both refuse rather than warn:

- **CMP-02, suppression.** Checked at Prepare, against live state, not against anything cached at draft time.
- **CMP-10, Article 14 notice.** A first-touch send is refused unless the notice flag is true.

Known and accepted limitation: a residual window exists between Prepare and the actual manual send, during which suppression state could change. This window is smaller than the status quo it replaces, where a draft could sit in the approval queue for days. The plan should keep the prepared state short-lived and re-run the gates on any re-prepare, rather than treating a Prepare from days ago as still valid.

### Opt-out: a body link, not a header

SND-02 was rewritten on 2026-08-04. It no longer requires RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers, because those cannot be set from a manual mail client and were never a legal requirement. `LEGAL.md` §2.4 requires the opt-out to be fast ("snel") and free ("gratis") and present in every message, and never mentions the headers.

The opt-out is a plain link in the message body, pointing at the unsubscribe endpoint Phase 2 already built and already ships. That endpoint already implements the one-click POST path correctly, so if an automated channel is ever adopted the headers come back cheaply.
</decisions>

<scope_fence>
## Out of Scope, Explicitly

**Do not author legal content.** This is the hard fence. The legal half of the Phase 8 gate is still open, pending counsel on the Telecommunicatiewet art. 11.7 question, the Legitimate Interest Assessment, and the Article 14 notice wording. The plan must not:

- Write or draft Article 14 notice wording.
- Author, version, or populate an LIA document.
- Default `tw_exemption_claimed` to true, or infer a value for it.
- Assert a `legal_basis` value as correct.

Those are counsel's outputs. Build the fields, the storage, and the gates that consume them. Leave the values to be supplied. The mechanism ships; the send stays shut by its own gates until the legal inputs exist.

**Also out of scope:**

- Any automated dispatch, scheduling, batching, or queue-draining of sends.
- Bounce handling, reply detection, and delivery confirmation. All three are lost by choosing manual send, accepted deliberately, and manageable by hand at 10 to 50 per week.
- Changes to the Phase 2 suppression or unsubscribe implementation. It carries over unchanged and stays the single source of truth.
- Changes to Phase 6 drafting or the approval queue's approve/reject semantics. Phase 8 begins at an already-approved draft.
- Bulk or multi-select send preparation. The human gate is the compliance posture; Phase 6 already refused bulk-approve for this reason and Phase 8 inherits that.
</scope_fence>

<specifics>
## Specific Ideas

The audit record (CMP-09, CMP-11, CMP-12) must answer one question in seconds: "why were we allowed to email this business?" It holds the prospect, the resolved address and its classification, the timestamp, the message content actually sent, the legal basis, the LIA version, whether a Tw exemption was claimed, the approver, and the suppression-check result.

What manual send costs here, and it is worth naming so nobody later mistakes it for a bug: there is no provider message ID, so the record rests on Joshua's mark-as-sent action rather than on delivery confirmation. Delivery proof is genuinely lost. Legal-basis proof is not, and success criterion 5 only ever asked for legal-basis proof.
</specifics>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md`, the Phase 8 section: success criteria, the notes block, and the narrowed block directive that authorizes planning the mechanism while shipping stays gated.
- `.planning/REQUIREMENTS.md`: SND-01 to SND-04 with their 2026-08-04 annotations, and CMP-02, CMP-09, CMP-10, CMP-11, CMP-12.
- `.planning/research/LEGAL.md`: §2.4 for required opt-out mechanics, §3 for the required software behaviours including the first-email Article 14 content and the `first_contact_notice_included` enforcement point.
- `.planning/research/SEND-CHANNEL.md`: the SND-04 artifact and provider comparison.
- Phase 2 artifacts for the suppression spine and the existing unsubscribe endpoint, including its one-click POST path.
- Phase 6 artifacts for the approval queue this phase reads from.
</canonical_refs>
