---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
surface: organic-search
funnel_stage: ""
impact_score: 0
effort_score: 0
type: page-brief
title: "Product Page Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - product-page
  - ecommerce
  - eeat
status: template
related:
  - "[[Pillar Page Template]]"
  - "[[Comparison Page Template]]"
  - "[[Affiliate Disclosure Standards]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "Schema.org Product specification"
  - "Google Merchant guidelines"
---

# Product Page Template

Canonical structure for e-commerce product pages. Used primarily by the **ecommerce** business-type overlay.

Product pages carry both monetization weight (direct revenue per visit) and significant SEO weight (product schema, review aggregation, faceted nav considerations). Modern algorithms reward product pages that look like real shopping experiences and demote the thin / templated product-page pattern that affiliate sites sometimes try to mimic.

## Recommended Outline

1. Product Title (H1) + breadcrumbs.
2. Image Gallery — multiple high-resolution images covering different angles, in-use shots, scale references. Lazy-load past the first 2-3.
3. Price + Availability + Variant Selector — visible above the fold. Variants (size, color, configuration) update price without page reload.
4. Short Description — 2-3 sentences. The first thing AI Overviews can extract.
5. Reviews + Aggregate Rating — real reviews with verified-purchaser badges where the platform supports it. NEVER fabricate counts — if the product has only 3 reviews, the schema says 3.
6. Technical Specs — a clean table of dimensions, materials, compatibility, requirements. Links to spec sheets / manuals / docs where they exist.
7. In Use / Lifestyle Section — original photos / videos of the product in real use. The information-gain hook.
8. FAQ — drawn from PAA and from real customer-service questions logged.
9. Related Products — internal links to companion / alternative products.
10. Conversion Optimizers — abandoned cart hooks, "X people viewing now" (only if real), shipping calculator, return policy summary.

## Required E-E-A-T Signals

- Real reviews from verified purchasers (platform-verified where possible).
- Honest review distribution — do not hide negatives. A product with 3.7 stars from real reviews is more trustworthy than a product with 5.0 from suspicious reviews.
- Original in-use photography or video — not just manufacturer renders.
- Honest stock / availability — no "in stock" when the product is on backorder.
- Transparent shipping, returns, warranty information.

## Schema

- `Product` (required) with `name`, `image`, `description`, `sku`, `brand`, `gtin13` / `mpn` where available.
- `Offer` with `price`, `priceCurrency`, `availability`, `priceValidUntil`, `seller`, `shippingDetails`, `hasMerchantReturnPolicy`.
- `aggregateRating` ONLY when based on real reviews. `reviewCount` matches the actual review count visible on page.
- `Review` for individual reviews with real author / datePublished / reviewBody.
- `BreadcrumbList`.
- `FAQPage` for the FAQ section.

## Faceted Navigation Considerations

E-commerce sites often have faceted nav (color / size / price filters) that creates infinite URL combinations. The active business-type overlay (`Ecommerce`) defines the canonical strategy: typically `noindex,follow` on facet URLs + canonical to the un-faceted category page. Confirm the site's actual implementation matches this pattern before any pruning decisions.

## Conversion Optimizers (use sparingly, must be honest)

- "X people are viewing this" — only if real-time data supports it.
- Cart abandonment recovery — fine when consented.
- "Limited stock" badges — only when actually limited.
- Countdown timers — only when there's a real deadline.

Fake urgency / fake scarcity is detectable, hurts trust, and may violate consumer protection law in some jurisdictions.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — SERP for the product / category / variant query rewards product-page format.
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- Schema validates in Google's Rich Results Test.
- All conversion optimizers reflect real data.
- Review counts are honest and match the on-page review list.
- Images are real product photos with appropriate alt text.
- CWV check passes per [[Monetization Density Guardrails]].

## Anti-pattern

- Templated product descriptions (manufacturer-supplied copy verbatim across many retailers) — this is the biggest single signal that distinguishes thin product pages from real ones.
- Fake reviews / inflated review counts.
- Hidden shipping costs / surprise fees at checkout — kills trust and conversion simultaneously.
- "Sold out" without offering notify-me or alternatives.
- Auto-playing video on page load.
