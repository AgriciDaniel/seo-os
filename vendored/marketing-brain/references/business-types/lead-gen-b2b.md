---
type: concept
title: "Business Type Overlay — Lead Gen B2B"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - lead-gen
  - b2b
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
---

# Lead Gen B2B — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay into
> `wiki/concepts/Business Type Overlay.md`. The `beast-planner.md` subagent
> reads it alongside the FLOW canonical when composing the ULTIMATE BEAST
> plan.

Examples in this category: enterprise software vendors with sales-led
motion, professional services firms (consulting, accounting, legal at the
B2B tier), industry-specific agencies, B2B marketplaces, complex
B2B services (cyber-security, compliance, infrastructure).

---

## 1. When to use

Pick `--business-type lead-gen-b2b` when:

- The buyer is a **business**, not a consumer.
- The sales cycle is **weeks to months**, not minutes-to-hours.
- Revenue is **closed by sales reps after a discovery / demo / proposal**
  cycle — not via self-serve checkout.
- The marketing team's job is to deliver **MQLs / SQLs** to sales, with
  attribution complexity (multi-touch, account-based, intent-data
  enriched).
- LinkedIn and industry analyst coverage materially influence pipeline.

Common-but-wrong picks: a SaaS with a self-serve trial path (use `saas`),
a local services firm whose B2B work is incidental (use
`local-seo-services`).

---

## 2. Revenue model implications

B2B lead-gen revenue is **MQL → SQL → opportunity → closed-won**, with
ACV in the $10K-$1M range and sales cycles in months. SEO contributes by
**filling the top of funnel with the right-fit accounts** and by
**arming sales with content** that shortens the cycle.

### What this changes about the strategy

- **Account-based attribution beats lead-based.** A single decision-
  maker form-fill is part of an account-level conversation; multi-
  touch attribution is closer to truth than last-click.
- **High-intent BoFu pages** (pricing, ROI calculator, comparison,
  case studies) are the SEO surfaces that move pipeline — even
  when the form-fill happens later via a sales conversation.
- **Industry analyst coverage** (Gartner, Forrester, IDC,
  industry-specific equivalents) is the off-site EEAT that B2B
  buyers explicitly look for. Analyst report mentions feed
  AI Overviews on B2B queries.
- **Named-author + named-customer content** carries
  disproportionate weight in B2B trust. A quote from a real
  named buyer at a real named company beats a thousand
  anonymous testimonials.
- **LinkedIn presence (named author bios + cross-posting + thought
  leadership posts)** materially affects branded SEO in B2B.
  AI search increasingly cross-references LinkedIn for author
  credibility.
- **Whitepapers and gated content** still pull contact info but
  must be high-quality enough that the post-download experience
  doesn't poison the relationship.

### Revenue-stream hierarchy to encode in the plan

1. **MQL form-fills** (newsletter signup, content download,
   contact-us, demo-request) attributed to organic.
2. **Sales-accepted leads (SAL)** — conversion from MQL to
   sales engagement.
3. **Sales-qualified opportunities (SQO)** — conversion to
   active pipeline.
4. **Closed-won revenue** by source — the long-tail
   measurement that justifies SEO investment in expensive
   verticals.
5. **Sales-assist content usage** — count of how often the
   sales team sends specific URLs in deal cycles
   (highest-leverage content to refresh first).

---

## 3. Content vertical priorities

| Vertical | Purpose | Pipeline lift | Authority lift |
|---|---|---|---|
| **Pillar guides** ("the X playbook") | ToFu authority + AI Overview citations | Medium | High |
| **Comparison ("X vs Y")** | BoFu evaluation capture | High | Medium |
| **Industry research / data reports** | Analyst-mention bait + backlinks | Medium | High |
| **Case studies (named customer)** | Sales-assist + EEAT | High | High |
| **ROI calculators / tools** | BoFu signup capture | High | Medium |
| **Pricing / product pages** | BoFu evaluation capture | High | Medium |
| **Whitepapers / gated content** | MQL capture | Medium | Medium |
| **Webinar / podcast / event** | Brand authority + lead-gen | Medium | Medium |
| **LinkedIn long-form** | Off-site authority + AI search citation | Low | High |

Hub-and-spoke recommendation:

- **Industry pillar hub** organized by buyer persona / use-case;
  each spoke is a deep-dive guide that ranks for the head term and
  links into product pages.
- **Comparison hub** ("X vs all competitors") with a spoke per
  competitor — same as SaaS overlay.
- **Case-study hub** organized by industry / company-size segment;
  each case study links to the relevant product / service page.
- **Research-report hub** — original data the company collects
  (customer surveys, product-usage statistics, industry benchmarks)
  packaged as annual or quarterly reports. This is the highest-
  quality backlink bait B2B has.
- **ROI calculator hub** when the product's ROI is genuinely
  quantifiable.

---

## 4. Measurement focus

The Dual Surface Scorecard for B2B lead-gen tracks:

### Visibility (the SEO half)

- **GSC impressions + clicks** by URL pattern: pillar /
  comparison / case-study / pricing / blog.
- **Top 100 commercial-investigation + branded-comparison
  queries** rank tracking.
- **Branded SERP defense** — own page-1 for "[your-brand]
  reviews", "[your-brand] alternatives", "[your-brand] vs X".
- **AI Overview presence** on industry-defining queries
  ("best [category] for enterprise", "how to evaluate X
  software").
- **Brand mentions in industry analyst reports** (Gartner
  Magic Quadrant, Forrester Wave, etc.) and on industry-
  publication coverage. Track via Google Alerts +
  monthly manual review.
- **LinkedIn impressions + engagement** on company page +
  named-author posts.

### Revenue (the business half)

- **MQL volume by source** (organic, direct, social, referral)
  with cohort tracking.
- **MQL-to-SQL conversion rate by source** — finds the
  high-quality channels.
- **Sales pipeline created from organic** (multi-touch
  attribution, last-touch as a sanity check).
- **Closed-won revenue from organic-acquired accounts** —
  the long-cycle measurement that justifies SEO spend in
  high-ACV verticals.
- **Sales-assist content usage** — how often each piece
  of content is sent in deals (URL-shortener tracking or
  sales-engagement tool data).
- **Time-to-close trend by entry source** — organic-acquired
  accounts often have shorter sales cycles because the buyer
  self-educates.

### Refresh cadence

- **Weekly** — branded SERP monitoring (catch competitor
  displacement), MQL volume tracking.
- **Monthly** — comparison / pricing / case-study refresh
  queue, AI Overview spot checks on top 20 commercial
  queries.
- **Quarterly** — full DataForSEO competitor re-pull,
  full pipeline-attribution review, full LinkedIn
  thought-leadership audit.

---

## 5. Anti-patterns specific to B2B lead-gen

These are forbidden in the BEAST plan.

- **Aggressive gating of every piece of content** — it
  destroys SEO (gated content can't rank well), trains the
  audience to expect spam after the download, and harms
  reputation. Gate the genuinely-premium artifacts only.
- **"Thought leadership" with no actual original insight** —
  the AI-content era has flooded the channel; recycled
  best-practices content gets ignored or AI-summarized
  away.
- **Industry-folklore stats** ("75% of B2B buyers do X")
  without primary-source citations. Either cite a real
  study (with date and methodology) or remove the stat.
  AI Overviews are now skeptical of unsourced stats.
- **Mass-AI-generated pillar guides** — Google's HCU update
  and increasingly AI Overviews demote AI-recap content in
  B2B verticals where buyers are sophisticated.
- **Fake case studies / anonymous customer quotes that look
  fabricated** — kill trust at the bottom of the funnel
  where it matters most.
- **Buying analyst report inclusions** — most analysts
  reject this; getting caught poisons the analyst
  relationship for years.
- **MQL dumps to sales without qualification** — destroys
  the marketing-sales relationship; rep time wasted on
  bad leads pulls effort from real opportunities.
- **Webinar / event inflation** — running too many low-
  attendance events to claim "engagement" metrics. Quality
  over quantity.
- **Comparison pages that are obvious sales pitches** —
  see the SaaS overlay; the same dynamic applies. Honest
  "where competitor wins" sections actually convert better.
- **LinkedIn engagement-pod participation** — detected by
  LinkedIn, demoted, and increasingly demoted by AI search
  that treats inflated engagement as a trust signal failure.

---

## AI Overview considerations specific to B2B lead-gen

AI Overviews on B2B-evaluation queries pull from analyst
reports, vendor websites, comparison platforms (G2, TrustRadius,
Gartner Peer Insights), industry publications, and increasingly
LinkedIn long-form posts. To get cited:

- **Original research** the vendor publishes annually (state-
  of-the-industry surveys, customer benchmark reports) —
  this is the highest-quality citation bait.
- **Named-author bylines with verifiable industry credentials**
  on every long-form piece. Author archive pages with
  bio + LinkedIn link + speaking history feed AI search
  trust signals.
- **Customer case studies with named buyer + named company**
  + dated results — get excerpted as AI Overview proof.
- **Pricing transparency** where competitive (B2B is moving
  toward more transparent pricing; AI Overviews reward it).
- **Analyst report mentions** referenced on the vendor's
  own pages (e.g., "named a Leader in the 2026 Gartner
  Magic Quadrant for X" linked to the analyst's quote).
- **Compliance / certification badges** (SOC 2, ISO 27001,
  HIPAA, FedRAMP, GDPR) on a dedicated trust page — AI
  Overviews on enterprise queries pull these directly.

The BEAST plan's section 7 (AI Overview tactics) should call
out each of these specifically with example URLs from the
client's site + analyst coverage + LinkedIn presence.
