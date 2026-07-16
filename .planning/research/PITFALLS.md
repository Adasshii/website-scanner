# Pitfalls Research

**Domain:** B2B cold-outreach prospecting layer added to an existing website-scanner product (Next.js/Vercel + Express/Playwright/Railway + Supabase + Resend + Gemini)
**Researched:** 2026-07-17
**Confidence:** HIGH (hard blocker verified against primary source; deliverability and scraping findings cross-checked across multiple independent sources)

Scope note: NL/EU legal consent basis (Telecommunicatiewet, GDPR) is owned by a separate researcher and is intentionally not covered here. This file covers provider policy, deliverability mechanics, scraping/bot-defense mechanics, data quality, cost, and message-craft pitfalls.

---

## HARD BLOCKER — Resend's Acceptable Use Policy prohibits this project outright

### Pitfall 0: Sending cold outreach through Resend violates Resend's own AUP and risks account termination

**What goes wrong:**
Resend's Acceptable Use Policy states, verbatim: *"You are prohibited from sending unsolicited messages of any kind, including cold outreach, purchased lists, or scraped contact data"* and *"all mail must be sent to recipients who have explicitly opted in to receive communications."* Resend also enforces hard sending-quality thresholds independent of intent: complaint rate must stay under 0.08% and bounce rate under 4%, and breaching either can shut the account down without warning, with no refund. Resend runs on shared AWS SES-derived infrastructure — it is built and priced for transactional mail (password resets, receipts, report-ready notifications), not outbound prospecting, and its AUP draws that line explicitly rather than leaving it ambiguous. This is not a gray area requiring interpretation; the current `scan@adashi.io` Resend account is contractually the wrong tool for the Active requirement "Send approved outreach via Resend."

**Why it happens:**
The PROJECT.md constraints ("no new infrastructure," "everything already paid for") pull toward reusing Resend because it already handles the scanner's transactional mail. That instinct is correct for report-ready and follow-up email, and wrong for cold outreach — the two are governed by different sections of the same provider's policy.

**How to avoid:**
Do not send the first cold-outreach message through the existing Resend account/domain. Two real options, in order of fit for this project's constraints:
1. **Ask Resend directly** whether a dedicated sending identity for low-volume (10–50/week), individually-approved, non-bulk B2B outreach is permitted under an exception — some ESPs distinguish "unsolicited bulk" from "targeted, human-reviewed, low-volume" sending in practice even when the AUP text reads categorically. Get this in writing before relying on it. Do not assume; the AUP text as published is categorical.
2. **Use a separate provider built for this**, on a separate domain, and keep Resend exclusively for transactional mail (confirmation, report-ready, follow-up to opted-in `leads`). This is the safer default given the AUP language leaves little room for a "small volume, human-approved" carve-out to be read in. It also happens to solve Pitfall 1 (domain reputation isolation) for free, since the outreach domain would already be architecturally separate.
Either way, this decision blocks the "Send approved outreach via Resend" requirement as literally scoped in PROJECT.md and must be resolved before that phase is planned, not discovered mid-build.

**Warning signs:**
- Building the send pipeline against the existing `RESEND_API_KEY` / `scan@adashi.io` identity without first re-reading this AUP section.
- Treating "Resend already works for transactional mail" as evidence it's fine for outreach — it is evidence of the opposite.
- Any plan phase named "send outreach via Resend" that doesn't first have a phase or task resolving provider/domain choice.

**Phase to address:** Must be resolved in the earliest planning phase, before "queue and send outreach" is designed. This is a decision-and-provider-selection task, not an implementation detail to defer.

---

## Critical Pitfalls

### Pitfall 1: Domain/IP reputation bleed between transactional and outreach mail

**What goes wrong:**
Even once outreach moves off Resend (or off `scan@adashi.io`), sending cold email from any identity that shares a root domain with the product's transactional mail (`adashi.io`) risks bleeding reputation both ways. Subdomains share Postmaster Tools reputation tracking with the root domain in Gmail's system — a spike in spam complaints or hard bounces on an outreach subdomain can measurably degrade inbox placement for the same root domain's transactional mail (report-ready emails, admin notifications), and vice versa. A single root domain running both transactional and cold streams is the most common cause of "our whole company's email stopped working" incidents in postmortems on this topic.

**Why it happens:** Reusing `adashi.io` (or a subdomain of it) feels free and consistent with "no new infrastructure." The cost is invisible until a complaint spike or bounce spike happens, at which point it's already spread.

**How to avoid:**
Use a fully separate domain for cold outreach (not merely a subdomain of `adashi.io`), with its own SPF, DKIM, and DMARC records, warmed up before any real sending starts. Domain warmup (starting at ~15–20 sends/day, ramping over 3–4 weeks) matters even at this project's target volume (10–50/week), because a cold, unauthenticated new domain lands 60–80% in spam in its first week regardless of message quality. At 10–50/week the warmup period is cheap relative to the damage of skipping it.

**Warning signs:** Outreach sent from `outreach@adashi.io` or `sales.adashi.io`; no SPF/DKIM/DMARC set up before first send; first outreach batch sent at full target volume instead of ramped.

**Phase to address:** Same phase as Pitfall 0 (provider/domain decision), before any send capability is built. Verification: dig the new domain's SPF/DKIM/DMARC records exist and pass before enabling sends; confirm root `adashi.io` Postmaster Tools reputation is unaffected after the first outreach batches.

---

### Pitfall 2: Bulk scanning shares infrastructure with the live production scanner — one gets the other blacklisted

**What goes wrong:**
The scanner service runs as a single Railway instance/IP that both (a) serves real, consenting visitors of the public lead-magnet product today, and (b) would now run bulk automated scans against dozens of businesses per week who never asked to be scanned. Automated, non-consented traffic hitting many different target sites from one IP is exactly the pattern WAFs (Cloudflare, Akamai, etc.) are built to fingerprint and blacklist — via TLS/HTTP2 fingerprinting, JS challenges, and IP reputation databases that are shared across sites using the same WAF vendor. If enough target sites flag that Railway IP, the *same* IP that serves the legitimate public scanner could be blacklisted broadly, degrading or breaking the existing production product for real customers. This is a shared-fate risk the codebase audit didn't flag because it predates the bulk-scanning use case.

**Why it happens:** The scanner-service was built and tuned for "one visitor scans their own site, occasionally," not "the operator scans dozens of strangers' sites per week without their knowledge." Reusing the same Railway deployment for both is the path of least resistance and directly conflicts with the "no new infrastructure" constraint versus this risk.

**How to avoid:**
- Rate-limit and randomize scan timing so bulk scans don't look like a burst attack (spread 10–50 scans over the week, not run back-to-back).
- Use a realistic, honest user-agent string (don't spoof a browser identity to evade detection — that's the line between "polite crawler" and "adversarial scraper" in most WAF and ToS enforcement decisions).
- Respect `robots.txt` on target sites for the scanning crawl itself, even though it's not legally binding — it is evidence of good-faith behavior if a target ever disputes being scanned, and ignoring it increases both block rate and reputational/legal exposure.
- Consider whether bulk prospecting scans should run through a separate outbound path (different egress IP, or throttled queue) from the path serving live public scan requests, so a target-site block doesn't touch the production identity. This does not necessarily require new infrastructure — Railway supports this without a new provider — but it is a real design decision, not a no-op.
- Treat "target site blocks/fails the scan" as an expected outcome, not an error: triage should classify unreachable/blocked targets as "skip," not retry aggressively (retries amplify the fingerprint that gets an IP blocked).

**Warning signs:** Scan success rate on new bulk-imported prospects drops over time (a sign the IP is getting recognized and challenged); the *public* scanner's own scan success rate degrades in parallel; Playwright screenshots start showing CAPTCHA/challenge pages instead of target content.

**Phase to address:** The bulk-scan-queue phase (per CONCERNS.md, "no bulk import or queueing anywhere in the codebase" already needs building) — bake rate-limiting, backoff-not-retry, and robots.txt respect into that queue from the start rather than retrofitting after the production scanner degrades.

---

### Pitfall 3: Overture Maps data quality — the false positive already happened once, and the funnel doesn't currently defend against it happening again

**What goes wrong:**
PROJECT.md documents that the initial Overture read of Amsterdam suggested 98% brand affiliation in the no-website segment — wrong, corrected to ~2,147 actionable prospects. That is direct evidence this dataset produces confidently-wrong aggregate signals, not just occasional bad rows. At the individual-record level, Overture (and any map/places dataset, including OSM which Overture partly derives from) has documented issues: closed businesses still listed as open, duplicate records for the same physical business, bad geocoding, incorrect category tagging (a common failure: retail/franchise businesses mistagged as something else, or vice versa), and website URLs that are stale, dead, or point to a directory/aggregator page rather than the business's own site. Overture does attach a confidence score and dedupes via its GERS ID system, but confidence scores are not correctness guarantees, and the project's own prior research already showed the aggregate-level read can be badly wrong even with that scoring in place.

**Why it happens:** Map/places datasets are compiled from multiple upstream sources (OSM, commercial feeds, web crawls) on different update cadences; "closed" status lags reality, and category taxonomies don't map cleanly across sources. Treating a row in the dataset as ground truth (rather than a lead to verify) is the default failure mode.

**How to avoid:**
- Never treat "has a `website` field in Overture" as "has a live, correct website." The triage stage (reachability check) is exactly the right place to catch this — but only if it's actually run against every imported prospect, not skipped for prospects that "look" qualified from Overture metadata alone.
- Add a dedup pass keyed on domain (not just Overture GERS ID) before triage — the same business can appear as multiple Overture records with different IDs but the same website, especially for franchises/chains.
- Flag and route "unreachable during triage" separately from "reachable but bad" — an unreachable site in triage is ambiguous between "business closed," "website genuinely down," and "our scanner got blocked" (see Pitfall 2). Conflating these will misclassify closed businesses as "great prospect, terrible website" and waste a full scan + drafted email on a dead business.
- Sample-audit a batch of Overture imports by hand (Joshua manually checking a sample of 20-30) before trusting the pipeline at 10-50/week scale — cheap insurance given the proven false-positive history.

**Warning signs:** A drafted email references a business that turns out to be closed; triage "qualified" rate is suspiciously high or suspiciously uniform across a category; multiple prospects resolve to the same domain.

**Phase to address:** The Overture import phase itself — dedup-by-domain and a "verify reachable + verify not obviously a directory/parked page" step belong in that phase, not deferred to triage as an afterthought, since triage's whole design assumes it's working from a reasonably clean candidate set.

---

### Pitfall 4: A too-permissive triage stage defeats the entire point of having a two-stage funnel

**What goes wrong:**
The two-stage funnel exists specifically so Playwright + Lighthouse + Gemini (the expensive stage) only runs on prospects worth pitching. Lighthouse audits are CPU/memory-heavy and slow (45s timeout per page in the existing scanner), Playwright multi-page crawls are the largest cost driver in wall-clock/compute time (not API-metered dollars, since it's self-hosted on Railway, but Railway compute has real limits — CONCERNS.md already flags the single-instance browser concurrency as fragile even at today's volume), and Gemini calls add both latency and a real per-call cost. If the triage stage's bar is set too low (e.g., "has HTTPS and loads in under 5s" as the only gate), most imported prospects pass through to full scan, and the funnel's entire cost-control premise collapses — full scans run for the full weekly cohort by category (potentially hundreds if `import` isn't itself throttled), not the shortlisted subset.
Gemini's per-call token cost is genuinely cheap in isolation (roughly $0.10/$0.40 per million input/output tokens on current flash-tier models) — the trap is not "Gemini is expensive per call," it's "an over-permissive triage multiplies call volume by 10-50x against a Railway browser instance that's already documented as unable to handle bulk load."

**Why it happens:** Triage criteria get designed against a handful of manually-checked example sites where the signal is obvious, then don't hold up against the long tail of real prospects where signals are ambiguous (site loads fine but is visually terrible, or fails intermittently). The natural fix under uncertainty is "let it through to the full scan, that'll sort it out" — which is exactly the leak that defeats triage's purpose.

**How to avoid:**
- Set and test the triage pass-rate as an explicit target (e.g., "triage should qualify roughly 20-30% of imports for full scan," tuned against the target of 10-50 prospects/week actually contacted) rather than leaving the bar purely qualitative.
- Cap full-scan throughput explicitly (a hard ceiling per week/day independent of how many prospects triage marks qualified) as a backstop against a triage bug or a bad batch of imports silently blowing past the intended volume.
- Log and periodically review the triage pass/fail distribution — a shifting pass rate over time is the earliest signal that triage criteria (or the underlying site population) have drifted.

**Warning signs:** Full-scan queue depth grows faster than the weekly 10-50 target; Railway resource usage/costs climb without a corresponding rise in usable prospects; triage "qualified" rate creeps upward over consecutive weeks without a deliberate criteria change.

**Phase to address:** The triage-and-shortlist phase — ship the pass-rate target and the hard full-scan ceiling in the same phase as the triage logic itself, not as a later tuning pass.

---

### Pitfall 5: "I audited your website" personalization reads as confrontational, not helpful — and it compounds the deliverability risk

**What goes wrong:**
Cold email that leads with "I found problems with your website" is adversarial by default; the recipient did not ask for a critique and the framing can register as insulting rather than useful, particularly for a business owner who has real pride in something they built or paid for. Cold email response rates are already low in general (roughly 0.1% is cited as a realistic baseline), and a confrontational framing pushes further toward spam-report territory rather than reply territory. This matters more here than in generic cold-email advice because a spam-report spike on a freshly separated, freshly warmed outreach domain (Pitfall 1) is exactly the kind of event that can re-poison a domain that was just carefully isolated to avoid that outcome — the personalization failure mode and the deliverability failure mode are the same failure, wearing two hats.

**Why it happens:** The scan report is the most concrete, personalized asset available, so it's tempting to lead with it as proof of effort. But "proof of effort" and "here's what's wrong with you" read identically from the recipient's side unless the framing is deliberately reframed around value, not deficiency.

**How to avoid:**
- Lead with something specific and true that is *not* a criticism (a genuine observation about the business, or one concrete quick win framed as opportunity, not failure) before referencing the scan at all.
- Frame the scan as something already done and given away free ("I ran a free scan / put together a quick report") rather than something done *to* them ("I found issues with your site").
- Keep the critique itself business-impact framed ("this is likely costing you mobile visitors") rather than technical-jargon framed ("your LCP is 4.2s") — the sales-brief generation prompt to Gemini should be told this explicitly, since the existing scanner's sales-brief output was built for a self-service visitor context, not a cold-outreach one, and may default to a more clinical tone.
- Single message, no aggressive follow-up cadence — PROJECT.md already scopes out automated sequences; keep that boundary specifically because doubling down on an unanswered "I audited your site" message is a documented pattern that increases spam reports rather than replies.

**Warning signs:** Reply rate stays near zero while open rate is normal (message is being read and rejected, not ignored); any reply containing words like "who are you" / "didn't ask" / "unsubscribe" in the first line; spam-complaint rate ticking up even at low volume.

**Phase to address:** The drafted-email-generation phase — the Gemini prompt for cold-outreach copy needs an explicit tone/framing brief distinct from the existing self-service sales-brief prompt, reviewed by Joshua on the first several drafts before trusting the pattern at volume.

---

### Pitfall 6: No reply/bounce handling means the tool silently keeps talking to people who already answered

**What goes wrong:**
The existing Resend webhook (`/api/webhooks/resend`) tracks `email.bounced` and `email.complained` events into `email_events`, but nothing in the current codebase suppresses future sends based on those events (CONCERNS.md doesn't flag this because it wasn't a problem for a single confirmation+follow-up flow to opted-in leads). For cold outreach specifically, two gaps become load-bearing:
1. **Bounce handling**: hard bounces must be permanently suppressed — re-sending to a hard-bounced address is itself a signal inbox providers use to detect spammy list hygiene, and it directly damages the reputation this project is otherwise trying hard to protect (Pitfall 1). Bounce-rate thresholds matter quantitatively at this volume too: providers begin throttling around 2% sustained bounce rate and reject/block around 5% — at 10-50 sends/week, that's as few as 1-2 bad addresses before the domain shows a problem.
2. **Reply handling**: cold outreach (unlike the existing confirmation/report-ready flow) expects replies as the entire point of the exercise, but there is no inbox-monitoring or reply-capture mechanism anywhere in the current integration set (Resend's webhook events don't include inbound replies; that requires either a separate inbound-parsing setup or a real mailbox Joshua checks manually). Without it, someone who replies "not interested, please remove me" gets no acknowledgment in the system, and a later phase (or a manual re-import) could re-contact them — which is both a trust failure and, if it recurs, a complaint-rate risk.

**Why it happens:** The existing product's email flows are entirely one-directional (system sends, tracks delivery/opens/clicks) because the only reply channel it needed was the Fillout booking webhook. Cold outreach breaks that assumption and nothing in the current architecture was built to expect replies as a primary signal.

**How to avoid:**
- Wire `email.bounced` (hard bounce specifically — Resend's webhook payload distinguishes bounce types) directly into the suppression table as an automatic, immediate write — not a manual review step. This is the single highest-leverage integration given PROJECT.md already commits to "Suppression list in Supabase as the source of truth, checked before every send."
- Wire `email.complained` into suppression the same way, immediately, no human gate — a complaint is the strongest possible signal and delaying suppression on it defeats the point of tracking it.
- Decide explicitly whether reply-handling is manual (Joshua checks a real inbox and updates lifecycle status by hand — plausible at 10-50/week) or needs inbound email parsing wired into the system. Given the stated scale, manual is likely sufficient and cheaper than building inbound parsing — but it must be a deliberate decision recorded, not a gap nobody noticed, because "no reply handling" silently breaks the lifecycle tracking requirement ("new → qualified → contacted → replied → booked") the project already commits to.
- Treat "replied" as a state that must block any future automated contact (there are none planned per PROJECT.md's "no automated sequences" boundary, but if that boundary is ever revisited, replied/complained/bounced must gate it first).

**Warning signs:** Suppression table isn't updated after a real bounce or complaint event fires on the webhook; a lifecycle status stays stuck at "contacted" for a prospect who visibly replied; the same person gets contacted twice across separate weekly batches.

**Phase to address:** The suppression-and-audit-trail phase — this is explicitly called out as "compliance in v1, not v2" in PROJECT.md's Key Decisions, so hard-bounce and complaint auto-suppression belongs in that same phase, wired to the webhook that already exists rather than treated as new integration work.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reuse `scan@adashi.io` / Resend for outreach "just to get started" | No new provider setup | Account termination risk under Resend's AUP; reputation bleed onto transactional mail | Never — this is the hard blocker (Pitfall 0), not a tradeoff |
| Skip domain warmup, send target volume immediately | Faster to first real send | 60-80% spam-folder placement in week 1, poisoning the very domain being isolated for this purpose | Never for the outreach domain; acceptable only for genuinely disposable test sends to Joshua's own inbox |
| Manual reply-checking instead of inbound email parsing | Zero build cost | Missed opt-outs if Joshua is inconsistent about checking; not documented in the system | Acceptable at 10-50/week if paired with a recorded standing habit, not silently assumed |
| Retry blocked/failed scans aggressively to "make sure" data isn't missing | Slightly more complete data | Amplifies the WAF fingerprint that gets the Railway IP blocked, hurting the production scanner too | Never — treat a blocked scan as a terminal "skip," not a retry candidate |
| Trust Overture's `website` field without a liveness/dedup check | Faster to a usable prospect list | Repeats the exact 98%-false-positive failure mode already documented in this project's own prior research | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Resend | Assuming "already integrated for transactional" means "fine for outreach" | Read the AUP (`resend.com/legal/acceptable-use`) before scoping any send phase; it explicitly bans cold outreach |
| Resend webhooks | Tracking bounce/complaint events without acting on them | Wire `email.bounced` (hard) and `email.complained` directly into the suppression table as an automatic write |
| Overture Maps | Treating a returned record as verified/live | Dedup by domain, cross-check reachability in triage, sample-audit manually before trusting the pipeline |
| Railway/Playwright vs target sites | Scanning strangers' sites with the same crawler behavior used for consenting self-service scans | Rate-limit, honest user-agent, respect robots.txt, treat blocks as skip-not-retry |
| Gemini (sales-brief / drafted email) | Reusing the existing self-service sales-brief prompt tone for cold outreach copy | Write a distinct tone/framing brief for cold-outreach generation; review first N drafts by hand |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Triage bar too permissive | Full-scan queue grows faster than the 10-50/week target implies | Explicit pass-rate target + hard full-scan ceiling per week | As soon as triage criteria drift or a bad import batch lands |
| Full scans running on the same single Railway browser instance serving live public traffic | Public scanner slows/fails during bulk-scan runs | Separate the bulk-scan queue's concurrency budget from the public-facing scan path, per existing CONCERNS.md throughput recommendation | Immediately at any meaningful bulk volume — CONCERNS.md already documents this breaks at ~100 queued scans |
| Aggressive retries on blocked/failed target sites | Same domain hit repeatedly in logs; scan success rate on bulk imports drops over successive weeks | Terminal "skip" classification for blocked scans, no auto-retry | As soon as any target site's WAF starts fingerprinting the Railway IP |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sending outreach that references detailed personal/technical scan data over an unauthenticated report link | Report URL could be forwarded or guessed, exposing another business's audit to a third party | Keep report links unguessable (existing pattern) and confirm they aren't indexable/discoverable; don't put more sensitive detail in the email body than in the linked report |
| No suppression check enforced at the DB layer (only at application logic) | A future code path (manual re-import, ad-hoc admin action) could bypass suppression and re-contact a bounced/complained/opted-out prospect | Enforce suppression as a hard constraint at send-time (e.g., a check that can't be skipped by a new caller), not just a convention followed by one send function |
| Admin secret (flagged in CONCERNS.md) now guards a private prospect list with names, scan critiques, and contact emails, not just public lead data | A leaked `ADMIN_SECRET` exposes a curated private target list plus every drafted critique of it | Prioritize the CONCERNS.md admin-auth recommendation before or alongside this milestone, since the sensitivity of what's behind that secret changes materially |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Drafted email leads with criticism | Prospect feels insulted, reports as spam instead of replying | Lead with a genuine positive/opportunity framing; critique is business-impact-framed, not technical-jargon-framed |
| Review queue shows no signal on *why* a prospect was triaged in | Joshua can't sanity-check triage quality, approves/rejects blind | Surface the triage signal (what failed, how badly) next to each drafted email in the review queue |
| No indication a full scan hit AI-analysis fallback (known gap from CONCERNS.md) | Drafted email could reference a design critique that was actually just an HTML-only fallback score | Surface `design_ai_skipped` (per CONCERNS.md's own recommendation) in the review queue so Joshua knows when a claim in the draft is thinner than it looks |

## "Looks Done But Isn't" Checklist

- [ ] **Send pipeline "works":** Verify it's not still pointed at the transactional Resend identity/domain — check the sending domain in the actual API call, not just that email arrives in a test inbox.
- [ ] **Suppression list "checked before every send":** Verify hard-bounce and complaint webhook events actually *write* to the suppression table automatically, not just log to `email_events` for later review.
- [ ] **Triage "filters correctly":** Verify against a known-bad Overture batch (including closed businesses / dead links) that the false-positive pattern already seen once doesn't recur, not just against a handful of manually-picked good examples.
- [ ] **Bulk scan queue "respects concurrency":** Verify under an actual 10-50-prospect batch, not a 2-3-item smoke test — CONCERNS.md's existing 15-minute-timeout math only leaves buffer at small batch sizes.
- [ ] **Drafted email "personalized":** Verify a sample of drafts read as helpful, not clinical/insulting, before the first real send — this needs a human read, not just confirmation the template renders.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Resend account flagged/terminated for AUP breach (if this blocker is missed) | HIGH | No stated appeal guarantee; migrate all transactional mail to a new provider under time pressure, likely with delivery disruption to the live public scanner during the transition |
| Domain reputation damaged (blacklisted, spam-foldered) | HIGH | $500-2,000 in typical consultant/re-warmup cost cited industry-wide, plus 3-6 months of degraded deliverability; cheapest real fix is often abandoning the domain and re-warming a new one |
| Railway IP blacklisted by a WAF vendor, degrading the public scanner | MEDIUM-HIGH | Railway IP reassignment (if available) or migrating the scanner-service deployment; in the meantime the live public product is degraded, which is a business cost beyond this milestone |
| Overture false-positive batch produces bad prospects mid-week | LOW | Manual review before send catches this if the human-approval gate (already a hard requirement) is actually exercised carefully — this is the cheapest of the recovery scenarios precisely because the human gate exists |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 0. Resend AUP hard blocker | Provider/domain decision phase (before any send capability is built) | Written confirmation of chosen provider's policy on this exact use case, or a fully separate domain/provider selected |
| 1. Domain reputation bleed | Same phase as above | SPF/DKIM/DMARC verified on the new domain; warmup schedule executed before target volume |
| 2. Bulk scanning gets shared IP blacklisted | Bulk-scan-queue phase | Public scanner's own success rate monitored alongside bulk-scan success rate; no shared degradation observed |
| 3. Overture data quality | Overture import phase | Dedup-by-domain implemented; manual sample audit performed before trusting pipeline at scale |
| 4. Triage too permissive → cost blowout | Triage-and-shortlist phase | Explicit pass-rate target set; hard full-scan ceiling enforced independent of triage output |
| 5. Personalization backfires | Drafted-email-generation phase | Distinct cold-outreach tone brief in the Gemini prompt; first N drafts reviewed by Joshua before trusting the pattern |
| 6. Reply/bounce handling gaps | Suppression-and-audit-trail phase | Hard-bounce and complaint webhook events verified to write to suppression table automatically, not just log |

## Sources

- [Resend Acceptable Use Policy](https://resend.com/legal/acceptable-use) — HIGH confidence, primary source, directly quoted: cold outreach explicitly prohibited, 0.08% complaint / 4% bounce thresholds, termination without warning
- [Resend Terms of Service](https://resend.com/legal/terms-of-service) — HIGH confidence, referenced alongside AUP
- [Mission Inbox — "Resend: Beautiful Developer UX. Wrong Tool for Cold Email"](https://missioninbox.com/compare/resend) — MEDIUM confidence, third-party but consistent with primary source
- Subdomain vs. separate domain reputation isolation (Suped, ReviewMyEmails, Allegrow deliverability knowledge bases) — MEDIUM confidence, industry-consensus deliverability practice, cross-checked across multiple independent sources
- Domain warmup timelines and spam-folder placement rates (Smartlead 2025/2026 benchmarks as cited by MailReach, LiteMail, Woodpecker) — MEDIUM confidence, industry benchmark data, not a single authoritative source
- Bounce-rate thresholds and reputation damage (LiteMail, MailValid, Overloop, industry deliverability blogs) — MEDIUM confidence, consistent figures across sources but no single primary authority (Google/Yahoo postmaster guidelines are the underlying primary source these derive from)
- Cloudflare/WAF bot-detection mechanics (ZenRows, ScrapeOps, Scrapfly, Browserless technical guides) — HIGH confidence for the mechanism (TLS/JS fingerprinting, IP reputation databases), MEDIUM for specific bypass-technique claims (not needed/used here — this project should not be evading detection, only avoiding triggering it)
- robots.txt legal status and ethical scraping norms (ScrapingBee, PromptCloud, Browserless legal guides; eBay v. Bidder's Edge, LinkedIn v. Proxycurl as cited precedent) — MEDIUM confidence, consistent legal-commentary consensus, not case law analysis
- [Overture Maps Places Guide](https://docs.overturemaps.org/guides/places/) and [Overture Foundation places-freshness blog post](https://overturemaps.org/blog/2025/reaching-billions-with-up-to-date-places-information-in-overture/) — MEDIUM confidence, vendor's own documentation, cross-checked against this project's own prior research (which already found a real false positive) rather than taken at face value
- [OvertureMaps GitHub Discussion #206 — data quality](https://github.com/orgs/OvertureMaps/discussions/206) — MEDIUM confidence, community-reported issues (duplication, inconsistent naming, geocoding errors)
- Cold-email response-rate and "audit-style" cold email framing (AISO Studio, CXL, Troy Harrison, Crunchbase Blog) — MEDIUM confidence, marketing-industry commentary, directionally consistent across sources but not empirically rigorous
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) — HIGH confidence, primary source; confirms per-call token cost is not the binding cost constraint for this project (Railway/Playwright compute and volume-through-triage are)
- `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/INTEGRATIONS.md` (this project, 2026-07-16) — HIGH confidence, primary source for existing architecture and prior findings

---
*Pitfalls research for: B2B cold-outreach prospecting layer on an existing website-scanner product*
*Researched: 2026-07-17*
