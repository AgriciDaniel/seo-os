---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: business-type-overlay
title: "Ecommerce"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - ecommerce
  - product-pages
status: active
related:
  - "[[business-types/_index|Business Type Overlays Hub]]"
  - "[[Product Page Template]]"
  - "[[Comparison Page Template]]"
  - "[[Pillar Page Template]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Seasonal Search Demand]]"
  - "[[E-E-A-T for {{site_type}}]]"
sources: []
aliases:
  - "ecommerce"
  - "e-commerce"
---

# Ecommerce

The e-commerce overlay. Product schema, category hierarchy, review aggregation, faceted nav considerations, seasonal demand peaks.

## 1. When to Use This Overlay

Characteristic patterns:

- Site sells **physical products** (or digital products with inventory) directly to consumers.
- Catalog of **dozens to thousands of SKUs**, each on its own product page.
- Conversion path: SERP / category / search → product page → cart → checkout.
- **Faceted navigation** (color / size / price / brand filters) creates URL-explosion considerations.
- E-E-A-T moat: real product photos, verified-purchaser reviews, transparent shipping / returns / warranty, real customer use-case content.
- **Seasonal demand peaks** dominate (Q4 for most consumer e-commerce; sport-specific for outdoor; back-to-school for office; etc.). See [[Seasonal Search Demand]].

## 2. Revenue Model Implications

Primary stream: **product orders** measured as gross merchandise volume (GMV) × take rate.

Secondary streams:

- Subscription products (recurring orders).
- Wholesale / B2B side-channel.
- Affiliate links to complementary products the store doesn't carry.
- Email marketing revenue (often the highest LTV channel).

Monetization density rules per [[Monetization Density Guardrails]]: cart-abandonment popups, exit-intent overlays, "X people viewing now" widgets count as monetization elements. Honesty matters — fake urgency / fake scarcity is detectable, hurts trust, and may violate consumer protection law in some jurisdictions.

## 3. Content Vertical Priorities

Dominant page templates:

- **[[Product Page Template]]** — the workhorse. One per SKU. Where most direct conversion happens.
- **Category / Collection pages** — hub-and-spoke parent of product pages. Captures broad commercial intent.
- **[[Comparison Page Template]]** — for "X vs Y" product queries (often used for higher-consideration items).
- **[[Pillar Page Template]]** — buying guides, "how to choose" content, how-to / use-case content. Captures top-of-funnel intent and links DOWN to relevant category / product pages.

Cluster pattern: category hierarchy (brand → category → subcategory → product) plus orthogonal use-case clusters (gift guides, occasion guides, persona guides — "best [X] for [persona]").

Required pages beyond the matrix:

- About / brand-story page.
- Shipping & returns policy.
- Sizing / fit / compatibility guide.
- Customer reviews aggregation (separate from individual product page reviews).
- FAQ / customer service page.

## 4. Measurement Focus

Per [[Dual Surface Scorecard]]:

- **Visibility surfaces**: GSC impressions / clicks per category-cluster, AI Overview presence, CWV pass rate (e-commerce sites are particularly punished by slow product pages with heavy image galleries and review widgets).
- **Conversion events**: `add_to_cart`, `begin_checkout`, `purchase`, plus the standard GA4 e-commerce event suite (use enhanced e-commerce / GA4 e-commerce schema).
- **Conversion rate** (28-day rolling) per top-traffic category and per top-converting product. Cohort by acquisition source.
- **Average order value (AOV)** trend — captures upsell / cross-sell health.
- **Cart abandonment rate** — captures conversion-path friction.

Off-site signals tracked monthly:

- Review velocity on the platform's verified-purchaser system.
- New mentions in gift guides / "best of" lists / publisher reviews.
- Influencer mentions / unboxings (especially for new product launches).
- Backlinks from industry / category publications.

## 5. Anti-Patterns Specific to This Vertical

- **Templated product descriptions** — manufacturer-supplied copy verbatim across many retailers. The single biggest signal that distinguishes thin product pages from real ones. Write your own.
- **Fake reviews / inflated review counts** — detectable, policy-violating on every major platform.
- **Hidden shipping costs / surprise fees at checkout** — kills trust and conversion simultaneously. Be transparent on the product page.
- **Faceted nav URL explosion indexed** — every color × size × price filter combination indexed creates duplicate-content nightmare and crawl-budget waste. Use `noindex,follow` on facet URLs + canonical to the un-faceted category page.
- **"Sold out" without offering notify-me or alternatives** — wastes the visit and hurts UX.
- **Auto-playing video / audio on page load** — drives bounce and damages trust.
- **Aggressive popup density** that hurts CWV — especially on mobile.
- **Stale "as low as $X" pricing** when the actual lowest price has moved — schema fabrication risk.

## 6. Cross-references

- [[Product Page Template]] — primary commercial page template.
- [[Comparison Page Template]] — for higher-consideration product comparisons.
- [[Pillar Page Template]] — buying guides and how-to pillars.
- [[Seasonal Search Demand]] — Q4 + category-specific peaks dominate planning.
- [[Monetization Density Guardrails]] — popups / overlays / urgency widgets count.
- `claude-seo:seo-schema` — Product / Offer / Review / AggregateRating / BreadcrumbList schema validation.
