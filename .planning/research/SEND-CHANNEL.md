# Send-Channel Research: Provider AUP Comparison (SND-01, SND-04)

Companion to `LEGAL.md`. That file answers "does the law permit this send?" This file answers "does the provider's own contract permit this send?" Those are two separate gates and both must pass. Resend already fails the second one, which is why Phase 8 is blocked.

Research date: 2026-08-04. All AUP quotes below are verbatim from the primary source, fetched on that date.

---

## 0. Status: superseded by the manual-send decision

**Status of this document.**
The comparison below stands. It is the SND-04 artifact: the full provider comparison
that ruled out every tier. The recommendation in section 3, a dedicated Google Workspace
mailbox on a separate tenant, does not stand. Nothing is built against it.

**The decision.**
Decided 2026-08-04. There is no third-party dispatch provider. Prospect Radar generates,
renders, and gates the approved draft. Joshua sends it by hand from his own mailbox, at
10 to 50 sends per week.

**Why it beats every tier below it.**

1. It removes the acceptable-use question entirely rather than answering it, since every
   tier below is an argument about whether someone else's contract permits this send.
2. It costs nothing, against €40 to €250 per month for Tier 2 and roughly €7 per month
   plus a domain for the section 3 recommendation.
3. It needs no warmup and no new domain, because at this volume there is no
   deliverability problem to solve.
4. The Phase 2 suppression spine stays the single source of truth, with nothing to sync
   and no consistency window, which is the exact objection section 2 raised against
   Tier 2.
5. The Phase 6 human gate is untouched, since approval was always manual and now
   dispatch is too.

**What it costs.**
Automated bounce handling, reply detection, and delivery confirmation are gone. All
manageable by hand at this volume.

---

## 1. Bottom Line Up Front

**Transactional email providers are closed to this project as a category, not one by one.** Resend is not an outlier. Mailgun, SendGrid, Brevo, and Amazon SES all prohibit the same activity, and Mailgun's wording is stricter than Resend's. Switching between them is not a fix.

**The deciding number is volume: 10 to 50 sends per week** (from `LEGAL.md` §2.2). At that scale the cold-outreach industry's answer, meaning sequencing platforms and dedicated sending infrastructure, is machinery built for thousands of sends per day. Buying it would mean paying €40 to €250 per month for warmup, inbox rotation, and campaign sequencing this project does not use, and handing over the suppression list and unsubscribe endpoint that Phase 2 already owns.

**Superseded 2026-08-04, see §0.** The manual-send decision replaces the recommendation below; nothing is built against it.

**Recommendation: send from one Google Workspace mailbox on a separate outreach domain, in a separate Workspace tenant, dispatched over SMTP or the Gmail API directly from the app.** Cost is roughly €7 per month. It is the only option where all four SND requirements are met natively, with no third-party system of record and no change to what Phases 2, 6, and 7 already built.

**This closes SND-01 and SND-04. It does not touch the legal gate.** The Telecommunicatiewet art. 11.7 question and the LIA are unaffected by provider choice, exactly as the roadmap note says. Counsel stays on the critical path.

---

## 2. The Three Tiers

Providers sort into three groups, and the group decides the outcome. Comparing individual vendors within a group is wasted effort.

### Tier 1: Transactional ESPs. Ruled out by contract.

These providers forbid the act of sending. The breach happens at send time regardless of whether Dutch law permits the message.

**Mailgun (Sinch Email)**, [AUP](https://www.mailgun.com/legal/aup/) §1b and §1c:

> **1b** Acquiring or sending to a third-party mailing list is prohibited. Use of contact lists that are bought, rented or scraped from third-parties is prohibited by law in most countries, and is absolutely prohibited on Sinch Email servers.

> **1c** Emails and SMS (unless transactional) can only be sent where permission has been expressly obtained in nature, and can only be sent to recipients who have granted clear, explicit and provable consent to receive communication. This consent should be granted through a confirmed single or double opt-in system that clearly expresses the topic of the subscription on an online or offline form via an unmarked by default checkbox.

§1c is fatal on its own. This project has no opt-in and by design never will. Mailgun also sets a spam-complaint ceiling of 0.08%, which is roughly one complaint per 1,250 sends.

**Amazon SES**, [AWS AUP](https://aws.amazon.com/aup/) (last updated 1 July 2021), prohibits use of the services:

> to distribute, publish, send, or facilitate the sending of unsolicited mass email or other messages, promotions, advertising, or solicitations (or "spam").

The text is narrower than Mailgun's. It bars unsolicited *mass* email and does not impose an opt-in requirement. On wording alone SES is arguable at 10 to 50 per week. Two things kill it anyway: SES's sending-review process enforces an opt-in standard in practice regardless of the AUP text, and an SES abuse finding puts the whole AWS account at risk, not just the mail service.

**SendGrid** prohibits purchased or rented lists and requires that consent was obtained by the sender directly. **Brevo** requires documented consent. Both fail the same way Mailgun does.

**Resend** stays where it is: transactional mail for the public scanner, untouched. SND-03 exists to keep it that way.

### Tier 2: Cold-outreach platforms. Permitted, but they take over the pipeline.

Instantly and Smartlead permit cold outreach and push legal responsibility onto the customer.

**Instantly**, [Terms of Service](https://instantly.ai/terms) (last updated 23 July 2026), §14, on permitted use of EU data:

> to provide business-to-business, i.e., "B2B" entities with information or an offer in a situation where Subscriber has a good faith reason to believe that the recipient has a demonstrated interest in receiving the information or offer, such as where such offer or information would assist the recipient in its performance of their job (such as, based on their job title), or in educating themselves about their industry.

That is written permission for this exact use case, and it would satisfy SND-04. One caveat on scope: the clause governs *EU Output Data*, meaning contacts sourced from Instantly's own lead database, not a list built from Overture. It shows Instantly's posture rather than granting blanket permission for our own data.

Instantly's own disclaimer sets the boundary: "SUBSCRIBER IS SOLELY RESPONSIBLE FOR DETERMINING THE LAWFULNESS OF USING ANY SUCH DATA." Their contract permits the send. The law is still Joshua's problem.

**Smartlead**'s public legal set is a [Fair Use Policy](https://www.smartlead.ai/fair-use-policy) about volume and abuse. It imposes no consent requirement.

**Why this tier is still wrong for Phase 8.** These are campaign platforms, and this project already has a campaign platform. It owns drafting and the approval queue (Phase 6), suppression (Phase 2), lifecycle and reporting (Phase 7), and it needs to own the per-send audit record (CMP-09, CMP-11, CMP-12). A platform duplicates all of it.

The concrete collision is the unsubscribe endpoint. Smartlead adds `List-Unsubscribe` and `List-Unsubscribe-Post` to every send, and the URL points at Smartlead's centralised endpoint. An unsubscribe would then land in Smartlead's database, not in the suppression table that CMP-02 checks immediately before dispatch. Closing that gap means syncing the two through the `LEAD_UNSUBSCRIBED` webhook and living with a consistency window on the one mechanism the entire compliance posture depends on. That is a bad trade for a system whose suppression spine was deliberately built first.

Phase 8's roadmap note says the suppression design and `List-Unsubscribe` pattern carry over to whatever channel is chosen, and only the dispatcher changes. In Tier 2 that is not true. The unsubscribe moves.

### Tier 3: Cold-email infrastructure. Permitted, right shape, wrong size.

Mailreef, Infraforge, Maildoso, and Mailforge sell mailbox slots with dedicated or shared IPs, domains, and SMTP or IMAP access plus an API. They are built and sold for cold outreach. Because the interface is raw SMTP, we keep full header control, our own unsubscribe endpoint, and our own audit record. That is the correct architectural shape: a dispatcher, not a platform.

It is sized wrong. Mailreef is $240 to $249 per month plus $0.001 per email. Infraforge is $4 per mailbox slot per month plus $14 per year per .com domain. These exist because senders run thousands per day across dozens of rotating inboxes. At 10 to 50 per week, one mailbox covers it and IP rotation is pointless.

There is also an SND-04 problem. Neither Infraforge nor Mailreef publishes an AUP at a discoverable URL. Both `/terms-of-service` and `/terms` returned 404. A vendor whose acceptable-use terms cannot be found is a vendor whose terms cannot be verified in writing, and SND-04 requires exactly that.

---

## 3. Recommendation: self-hosted mailbox, separate tenant

> **Superseded 2026-08-04.** This recommendation does not stand; see §0 for the decision that replaced it.

Send from one Google Workspace mailbox on a dedicated outreach domain, in a Workspace tenant separate from the one running Adashi's business mail, dispatched over SMTP or the Gmail API from the Next.js app.

**Against the requirements:**

| Requirement | How it is met |
|---|---|
| SND-01 (channel permits it) | Google's AUP bars "unsolicited mass email"; see the analysis below |
| SND-02 (RFC 8058 headers) | Full header control over SMTP or Gmail API, pointing at our own endpoint |
| SND-03 (isolated from Resend) | Different provider, different domain, different tenant, different credentials |
| CMP-09/11/12 (audit record) | Written by our code at dispatch; no third-party system of record |
| CMP-02 (suppression at send) | Phase 2 spine unchanged; nothing to sync |

**On SND-01.** The [Google Cloud AUP](https://workspace.google.com/terms/use_policy/) (last modified 13 October 2025) prohibits using the services "to generate, distribute, publish or facilitate unsolicited mass emails, promotions, advertisements or other solicitations ('spam')." It uses the same "mass" wording as AWS and imposes no opt-in requirement, which puts it a long way from Mailgun's §1c.

At 10 to 50 per week, individually approved by a human, each carrying a scan report specific to that recipient's own website, this is not mass email under any ordinary reading. For scale: Google's bulk-sender guidelines start at 5,000 messages per day to Gmail addresses, roughly 1,000 times the target volume, and apply to personal Gmail addresses rather than Workspace ones. Most Dutch business prospects will be on their own domains.

This is an argument, not a guarantee. Google enforces at its discretion. It is a materially better position than Mailgun or SendGrid, where sending is a plain breach.

**On the separate tenant.** This is the part worth being deliberate about. If the outreach domain is added to Adashi's existing Workspace, a suspension could take out Joshua's primary business mail. A separate tenant means the worst case costs an outreach domain and nothing else. SND-03 names Resend, and the same isolation logic applies here with higher stakes.

**Cost:** about €7 per month for one Workspace seat, plus the domain. Against €40 to €250 per month for Tier 2 or Tier 3.

**Limits:** Workspace allows 2,000 sends per day; practical cold-outreach limits run 50 to 100 per inbox per day after warmup. Target volume sits far below both. Warmup is manual, starting at 10 to 20 per day and building over three to four weeks, which at this volume is close to just sending normally from the start.

**When to revisit:** if volume ever goes past roughly 100 per day, or expansion beyond NL multiplies the domains. At that point Tier 3 becomes proportionate, and the dispatcher built here still works, since both speak SMTP.

---

## 4. What this does not fix

Restating the roadmap note, because it has been conflated twice already.

Provider choice closes SND-01 and SND-04 only. It has no effect on:

- **Telecommunicatiewet art. 11.7.** The statute is indifferent to who carried the message. `LEGAL.md` §1 finds the B2B published-address exemption is narrow and probably does not cover a generic `info@` scraped from a contact page. That finding is unchanged.
- **The LIA and CMP-13.** Still blocked on counsel. Still gates `RETENTION_MODE`.
- **CMP-10, the Article 14 notice.** Independent of channel.

One thing does connect the two gates. This project's contacts come from the prospect's own published website (Phase 5), not a purchased list. That is fatal under Mailgun §1b and §1c, and it is the favourable fact under Tw 11.7, where the exemption turns on whether the business published the address for this purpose. The same sourcing decision reads opposite ways in the two gates.

---

## 5. Open items

1. **Joshua decides the tier.** Everything below assumes Tier 3b (Google Workspace mailbox).
2. **Register the outreach domain and stand up a separate Workspace tenant** with SPF, DKIM, and DMARC. Already on the Parallel Track.
3. **SND-04 deliverable.** For Google Workspace this is the AUP quote in §3 above plus the retrieval date. Record it in the phase artifacts before building against it.
4. **Verify header pass-through before committing.** Send one message through the chosen path and confirm `List-Unsubscribe-Post: List-Unsubscribe=One-Click` survives to the received message. Testable in an hour, and it is the assumption SND-02 rests on.
5. **Counsel.** Unchanged and still the long pole.

---

## 6. Sources

Primary (fetched 2026-08-04):

- [Mailgun Acceptable Use Policy](https://www.mailgun.com/legal/aup/)
- [AWS Acceptable Use Policy](https://aws.amazon.com/aup/)
- [Google Cloud / Workspace Acceptable Use Policy](https://workspace.google.com/terms/use_policy/)
- [Instantly Terms of Service](https://instantly.ai/terms)
- [Smartlead Fair Use Policy](https://www.smartlead.ai/fair-use-policy)

Secondary, used for volume limits and enforcement patterns only. These are cold-email vendor blogs with a commercial interest in the answer, and none of the AUP findings above rest on them:

- [SendGrid: Email Opt-in and Opt-out Requirements](https://support.sendgrid.com/hc/en-us/articles/4404315959835-Email-Opt-in-and-Opt-out-Requirements)
- [Brevo Anti-spam policy](https://www.brevo.com/legal/antispampolicy/)
- [Gmail email sender guidelines](https://support.google.com/a/answer/81126?hl=en)
- [Infraforge](https://www.infraforge.ai/), [Mailreef review via Maildoso](https://maildoso.ai/blog/tools/mailreef)
- [Smartlead API documentation](https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation)

---

*Research completed: 2026-08-04. Closes the provider half of the Parallel Track send-path decision. The legal half remains open.*
