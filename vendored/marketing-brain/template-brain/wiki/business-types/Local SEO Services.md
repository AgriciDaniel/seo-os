---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: business-type-overlay
title: "Local SEO Services"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - local-seo
  - service-business
status: active
related:
  - "[[business-types/_index|Business Type Overlays Hub]]"
  - "[[Service Page Template]]"
  - "[[Location Guide Template]]"
  - "[[Booking Attribution Plan]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Distributed Presence Workflow]]"
  - "[[E-E-A-T for {{site_type}}]]"
sources: []
aliases:
  - "local-seo-services"
---

# Local SEO Services

The local-services overlay. Proven on a metro-area digital marketing / SEO agency vault. Local prominence + GBP optimization + NAP consistency + reviews + service-area-page architecture.

## 1. When to Use This Overlay

Characteristic patterns:

- Site sells **services delivered locally** (agency, contractor, dentist, lawyer, restaurant, gym, salon, plumber, real-estate broker).
- Defined **service area** — typically a city, metro, region, or set of named neighborhoods. The geographic constraint is part of the SEO strategy, not an obstacle to it.
- **Google Business Profile** is a primary visibility surface alongside organic results.
- Conversion path is typically: SERP / GBP → website → contact form / phone call / booking.
- E-E-A-T moat: real local presence, real customer outcomes, real local authority signals (reviews, citations from local press, partnerships with local businesses).

## 2. Revenue Model Implications

Single primary stream: **booked services** (per consultation / per project / per recurring engagement). Revenue per converted reader is high — typically tens to thousands of dollars depending on service category.

Secondary streams (rare for pure local):

- Affiliate / partner commissions (e.g., a dentist recommending a specific toothbrush).
- Display ads (almost never appropriate — ads on a local-services site read as low-trust).
- Info-product / course (when the practitioner has built personal brand authority).

Monetization density rules per [[Monetization Density Guardrails]]: forms / popups / chat widgets count as monetization elements for CWV purposes. No ads.

## 3. Content Vertical Priorities

Dominant page templates:

- **[[Service Page Template]]** — one canonical page per service offering. Highest-conversion page type.
- **[[Location Guide Template]]** — service-area pages (one per city / neighborhood / region the business serves). Critical for capturing "[service] near me" / "[service] in [location]" intent.
- **[[Pillar Page Template]]** — informational guides that establish expertise (e.g., "Complete Guide to Drain Cleaning" for a plumber).

Cluster pattern: services × locations matrix. Each service × each served location = a candidate page. Avoid templated programmatic pages — each service-area combo needs unique local proof (photos of jobs done in that neighborhood, named local reviews, references to local landmarks).

Required pages beyond the matrix:

- About / team page with named practitioners + credentials + photos.
- Reviews page (real reviews; never fabricated; never gated for positive only).
- Case studies / project gallery.
- Contact page with NAP, hours, service area map.

## 4. Measurement Focus

Per [[Dual Surface Scorecard]]:

- **Visibility surfaces**: GSC impressions / clicks per service-cluster, **plus** GBP impressions / actions / direction requests / phone calls. The Local Pack (Map Pack) is a third visibility surface that doesn't show up in GSC; track separately via GBP Insights.
- **Geo-grid rank tracking** for the top 10 commercial keywords across the service area (the `claude-seo:seo-maps` skill or equivalent). This is the local-SEO-specific measurement that doesn't apply to other overlays.
- **Conversion events** per [[Booking Attribution Plan]]: `lead_form_submit`, `phone_click`, `email_click`, `external_referral` (to Calendly / scheduler / partner platforms).
- **Review velocity**: new reviews per week on Google + Yelp + industry-specific platforms. Review count is a Local Pack ranking factor.

Off-site signals tracked monthly:

- NAP consistency check across major citation sources (Yelp, Yellow Pages, Bing Places, Apple Maps, industry-specific directories).
- New citations from local press, community organizations, partner businesses.
- Review sentiment trend — not just count.

## 5. Anti-Patterns Specific to This Vertical

- **Templated programmatic service-area pages** — generating "Plumber in [neighborhood]" for every neighborhood with no unique content. This is the canonical local-SEO HCU trigger.
- **NAP inconsistency** — even small variations (suite numbers, abbreviations, phone formatting) across citations damage Local Pack ranking. Audit and standardize.
- **Review gating** — only soliciting reviews from happy customers, suppressing or hiding negative reviews. Violates Google policy and detected.
- **Fake addresses / virtual offices** for service areas the business doesn't actually serve. Detected via GBP verification process.
- **Bought reviews / review swap schemes** — incentivized reviews are policy-violating and detected.
- **Hidden pricing entirely** — service businesses that show no pricing signal at all (no "starting at", no "request a quote with timeline") read as evasive. Provide an anchor.
- **Stock photos as team photos** — destroys trust on a service-business page.

## 6. Cross-references

- [[Service Page Template]] — primary conversion page template.
- [[Location Guide Template]] — service-area pages.
- [[Booking Attribution Plan]] — conversion attribution mandatory for this overlay.
- [[Distributed Presence Workflow]] — community + creator + authority outreach (the Yelp / chamber / local-press surface set).
- `claude-seo:seo-maps` — geo-grid rank tracking + GBP audit + review intelligence (the local-specific tooling).
