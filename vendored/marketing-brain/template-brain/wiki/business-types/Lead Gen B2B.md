---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: business-type-overlay
title: "Lead Gen B2B"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - lead-gen
  - b2b
status: active
related:
  - "[[business-types/_index|Business Type Overlays Hub]]"
  - "[[Service Page Template]]"
  - "[[Pillar Page Template]]"
  - "[[Comparison Page Template]]"
  - "[[Booking Attribution Plan]]"
  - "[[Monetization Density Guardrails]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Distributed Presence Workflow]]"
sources: []
aliases:
  - "lead-gen-b2b"
---

# Lead Gen B2B

The B2B lead-generation overlay. Whitepapers, gated content, booking funnels, ABM signals, LinkedIn + sales-assist content.

## 1. When to Use This Overlay

Characteristic patterns:

- Site sells **B2B products or services** with high deal size ($10K+ ACV typical).
- Conversion path: long, multi-touch — typically content download → email nurture → demo / discovery call → opportunity → close. Sometimes 3-12 months from first touch.
- Multiple buyer personas per account (technical evaluator, economic buyer, end user, procurement).
- **Account-based marketing (ABM)** signals matter alongside organic.
- E-E-A-T moat: deployed enterprise case studies, named customer logos, industry analyst recognition, named experts who publish independently.

## 2. Revenue Model Implications

Primary stream: **closed-won deals** measured as new ARR.

Secondary streams:

- Expansion revenue (existing customers).
- Partner / referral revenue.
- Services revenue (implementation, onboarding, training).

The entire site is a top-of-funnel for sales. Self-serve revenue is rare. Monetization density rules per [[Monetization Density Guardrails]]: lead-capture forms, demo-request popups, chat widgets count as monetization elements. Be deliberate about gating — too aggressive damages SEO; too permissive damages lead capture.

## 3. Content Vertical Priorities

Dominant page templates:

- **[[Service Page Template]]** — one canonical page per service / product / offering. The most direct lead-capture page.
- **[[Pillar Page Template]]** — topical-authority pillars on the categories where the buyer searches. ToFu / MoFu intent.
- **[[Comparison Page Template]]** — "X vs Y" / "best alternatives to X" content. BoFu intent — buyer is in active evaluation.
- **Case study pages** — one per named customer with named outcomes / metrics. Highest-converting content type for B2B.
- **Whitepaper / report landing pages** — gated downloads (with a FORM, not a paywall — Google penalizes paywalled-but-indexed content).

Cluster pattern: category × persona × stage. Each cell is a candidate page. The buyer journey requires content for ToFu (educational pillars), MoFu (comparison + buying guides), and BoFu (case studies + ROI calculators + service pages).

Required pages beyond the matrix:

- Customer story library with filters (industry, size, use case).
- Pricing page — even when "talk to sales" is the CTA, provide price bands. Hidden pricing kills conversion.
- About / leadership team page with named executives + credentials.
- Security / compliance page (SOC2, ISO 27001, GDPR — depending on category).
- Integration ecosystem page.

## 4. Measurement Focus

Per [[Dual Surface Scorecard]]:

- **Visibility surfaces**: GSC impressions / clicks per cluster (with BoFu cluster broken out separately), AI Overview presence (high stakes for B2B comparisons), CWV pass rate.
- **Conversion events** per [[Booking Attribution Plan]]: `lead_form_submit`, `whitepaper_download`, `demo_request`, `pricing_page_view`, `case_study_view`, `phone_click`, `email_click`.
- **Marketing-Qualified Lead (MQL) → Sales-Qualified Lead (SQL) → opportunity → closed-won** funnel rates. Lag indicators (4-12 weeks for SQL→opp; 1-12 months for opp→close).
- **Account engagement signals** (when ABM is in play) — multi-touch counts per account, content engagement depth, demo-request from target account.

Off-site signals tracked monthly:

- LinkedIn impressions / engagement on owned company page + named-expert profiles.
- Industry analyst mentions (Gartner, Forrester, IDC — depending on category).
- Conference / podcast / webinar appearances by named experts.
- Backlinks from industry publications and partner / customer sites.
- G2 / Capterra / TrustRadius review velocity (if applicable to category).

## 5. Anti-Patterns Specific to This Vertical

- **Over-gated content** — gating every blog post behind a form kills SEO. Reserve gating for high-value assets (full reports, ROI calculators, benchmark studies). Long-form guides and pillar pages should be ungated.
- **Paywalled-but-indexed content** — content visible to Googlebot but hidden behind a form for users. Google penalizes; flag as cloaking.
- **Hidden pricing entirely** — even enterprise B2B should provide price bands. "Contact sales" with zero anchor reads as evasive.
- **Generic "industries" / "use cases" pages** — templated page per industry with no real customer proof. Either ship case studies or don't claim the industry.
- **Fake LinkedIn engagement** — bought connections, automated messages, fake comments. Detectable; damages brand.
- **Stale case studies** — a case study from 2019 on a 2026 product page reads as decay. Refresh or rotate.
- **AI-generated thought leadership under a real executive's byline** without their involvement. The byline credibility is the entire point; faking it destroys it.
- **Buyer-persona-segmented landing pages all generated programmatically** with no unique content per persona — classic HCU trigger.

## 6. Cross-references

- [[Service Page Template]] — primary lead-capture page template.
- [[Comparison Page Template]] — BoFu comparison content.
- [[Pillar Page Template]] — ToFu / MoFu topical authority.
- [[Booking Attribution Plan]] — full conversion attribution mandatory for this overlay.
- [[Distributed Presence Workflow]] — LinkedIn + industry-publication outreach is the primary off-site channel.
- `claude-seo:seo-content` — content quality + E-E-A-T analysis particularly important for case studies and pillar content.
