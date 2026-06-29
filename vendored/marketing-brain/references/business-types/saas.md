---
type: concept
title: "Business Type Overlay — SaaS"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - saas
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
---

# SaaS — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay into
> `wiki/concepts/Business Type Overlay.md`. The `beast-planner.md` subagent
> reads it alongside the FLOW canonical when composing the ULTIMATE BEAST
> plan.

Examples in this category: horizontal SaaS (Linear, Notion, Stripe-style),
vertical SaaS (industry-specific tools), developer tools, API-first
platforms, mid-market business software.

---

## 1. When to use

Pick `--business-type saas` when:

- The product is **subscription software** (free trial → paid tier or
  freemium → paid tier).
- Revenue depends on **trial-to-paid conversion** and
  **expansion / retention**, not one-time purchases or services.
- The buyer **researches and compares before signing up** — meaning
  comparison content, alternative pages, and integration pages
  materially influence the funnel.
- Self-serve signup is at least one path to revenue (even if sales-
  assist is the main path for enterprise tier).

Common-but-wrong picks: agency / services firm with a SaaS-style site
(use `lead-gen-b2b`); a dev tool with no commercial product (treat as
publisher / open-source — different overlay needed if added later).

---

## 2. Revenue model implications

SaaS revenue is **MRR/ARR**, driven by **trial signups × activation rate
× trial-to-paid conversion × retention**. SEO contributes mostly at the
top of the funnel (signups) and at the bottom (comparison / vs / migrate
content captures buyers in evaluation).

### What this changes about the strategy

- **Branded vs non-branded SEO are separate games.** Branded protects
  what already works (don't let competitors win "your-brand vs
  competitor"). Non-branded is the growth lever.
- **Comparison content is the highest-LTV content.** "X vs Y", "best X
  for Y use case", "X alternatives" pages catch buyers in active
  evaluation — conversion rates 5-10× higher than top-of-funnel
  blog posts.
- **Free tools / calculators / mini-apps** are programmatic SEO at
  scale — they capture a long tail of high-intent queries and feed
  signup conversion better than blog posts.
- **Integration pages** ("X for Y" — your tool for their workflow)
  rank for branded competitor + integration queries and convert
  exceptionally well.
- **Bottom-of-funnel pages** (pricing, trial signup, demo request)
  must be SEO-clean — pricing pages especially are AI Overview
  citation magnets when they're transparent.

### Revenue-stream hierarchy to encode in the plan

1. **Self-serve trial signups → paid conversion** (track signup
   source attribution).
2. **Demo requests → SQL → closed-won** (sales-assist tier; longer
   cycle, higher ACV).
3. **Expansion / upsell** (existing customer → higher tier; SEO
   contributes via help-center + new-feature pages).
4. **Reverse trials / freemium → paid conversion** (in-product
   conversion; SEO sets up the front door).

---

## 3. Content vertical priorities

| Vertical | Purpose | Conversion lift | Authority lift |
|---|---|---|---|
| **Comparison ("X vs Y")** | BoFu evaluation capture | High | Medium |
| **Alternatives ("X alternatives")** | BoFu competitor displacement | High | Medium |
| **Integration pages ("X for Y workflow")** | BoFu + branded co-occurrence | High | Medium |
| **Free tools / calculators** | ToFu signup capture at scale | High | High |
| **Use-case pages** ("X for [persona]") | MoFu segmentation | Medium | Medium |
| **Help-center / docs** | Retention + SEO long-tail | Low | High |
| **Educational pillars** | ToFu authority + AI Overview citations | Low | High |
| **Customer stories / case studies** | Sales-assist + EEAT | Medium | Medium |

Hub-and-spoke recommendation:

- One **comparison hub** ("X vs all competitors") with one spoke per
  competitor; each spoke ranks for that specific comparison query.
- One **integrations hub** with one spoke per integration (the page
  itself signals product surface area to Google + AI search).
- **Use-case hub** organized by persona / industry, each spoke a
  full landing page with proof.
- **Docs** as a separate hub on a `docs.` subdomain or `/docs/`
  path — Google treats well-structured documentation as a strong
  authority signal for the parent product.
- **Programmatic SEO** for the free-tools layer if the ICP search
  pattern fits (e.g., one calculator per use case × per industry).

---

## 4. Measurement focus

The Dual Surface Scorecard for SaaS tracks:

### Visibility (the SEO half)

- **Branded vs non-branded GSC split** — separate dashboards. Branded
  protects share-of-voice; non-branded measures growth.
- **Top 100 commercial-investigation queries** — comparison /
  alternative / "best [category]" — with rank tracking.
- **Integration-page visibility** for "[your-tool] [partner-tool]"
  queries.
- **Docs traffic** as a separate stream — docs traffic correlates
  with retention more than with new-signup conversion.
- **AI Overview presence** on "best [category] software" queries —
  AI Overviews are increasingly the first-touch for SaaS evaluation.

### Revenue (the business half)

- **Trial signups attributed to organic** (GA4 event +
  multi-touch attribution model — last-click lies for SaaS).
- **Trial-to-paid conversion** by signup source (organic blog vs
  comparison page vs integration page vs free tool).
- **Branded organic CTR** — defends the brand from competitor
  "X alternatives" pages.
- **MQL / demo-request volume by source** for the sales-assist
  tier.
- **Expansion revenue from organic-acquired customers** — long-term
  signal for whether the SEO is bringing in good-fit users.

### Refresh cadence

- **Weekly** — branded SERP monitoring (catch competitor displacement
  fast), trial signup attribution.
- **Monthly** — comparison / alternatives page refresh queue, AI
  Overview spot checks on top 20 commercial queries.
- **Quarterly** — full DataForSEO competitor re-pull, full
  cannibalization scan, integration-page coverage review.

---

## 5. Anti-patterns specific to SaaS

These are forbidden in the BEAST plan.

- **Mass-AI-generated comparison pages** — Google's HCU update has
  been quietly demoting AI-generated "X vs Y" pages all year.
  Comparison pages need real product knowledge, real screenshots,
  and honest "where competitor wins" sections.
- **Programmatic SEO without product-market fit** — auto-generating
  thousands of pages (city × use-case combinations) without
  evidence of demand creates a thin-content liability that
  outweighs the long-tail capture.
- **Hiding the pricing page or making it require contact-sales for
  self-serve tiers.** Hurts trial conversion AND signals to AI
  Overviews that the page is not citation-worthy. Pricing
  transparency is increasingly an AI Overview requirement.
- **Fake or stale integration pages** — listing integrations that
  don't actually work, or that have been deprecated. AI search
  catches this and demotes.
- **Branded SERP defense via paid only** without owning the
  organic SERP for "[your-brand]" + "[your-brand] reviews" +
  "[your-brand] alternatives". Competitors will eat that SERP
  if you don't own it.
- **Buying G2 / Capterra reviews** — most platforms flag and
  remove; reputation cost > the perceived benefit.
- **Stuffing schema with wrong product / aggregate-rating data.**
  Manual action risk; AI Overviews stop citing.
- **Comparison pages that are obvious sales pitches** — they get
  ranked, but conversion is low because buyers detect the
  bias. Honest "where competitor wins" sections actually
  convert better.
- **Docs hidden from Google indexing** — many SaaS teams
  inadvertently `noindex` docs; this kills a major SEO + AI
  search authority signal. Docs should index unless they
  contain truly private content.

---

## AI Overview considerations specific to SaaS

AI Overviews on SaaS-evaluation queries pull from comparison sites
(G2, Capterra, TrustRadius), the vendor's own pages, and
independent reviews. To get cited inside them:

- **Pricing transparency on the pricing page** — explicit tier
  prices, what's included, no "contact us" for self-serve.
- **Comparison pages with honest scoring** — "where they win,
  where we win" — the AI Overview will excerpt the honest
  paragraph.
- **Integration directory** with direct links to partner
  brand pages — increases the brand co-occurrence signal AI
  search uses to recommend you.
- **Named-customer case studies** with attribution-permitted
  quotes — these get excerpted as AI Overview proof.
- **Help-center articles that answer common pre-purchase
  questions** ("how does X work", "is X compliant with Y") —
  these are AI Overview gold for buyers in evaluation.
- **External citations** on review platforms (G2, Capterra)
  with response from the vendor — signals recognized vendor
  status.

The BEAST plan's section 7 (AI Overview tactics) should call
out each of these specifically with example URLs from the
client's site + the vendor profiles on G2/Capterra/TrustRadius.
