---
type: concept
title: "Business Type Overlay — Ecommerce"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - ecommerce
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
---

# Ecommerce — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay into
> `wiki/concepts/Business Type Overlay.md`. The `beast-planner.md` subagent
> reads it alongside the FLOW canonical when composing the ULTIMATE BEAST
> plan.

Examples in this category: Shopify / WooCommerce / BigCommerce / Magento
storefronts, DTC brands, niche retailers, headless commerce builds.

---

## 1. When to use

Pick `--business-type ecommerce` when:

- The site **directly sells physical or digital products with checkout**.
- Revenue happens through **product-page conversion** (not affiliate
  commission, not lead-gen).
- **Google Merchant Center / Shopping** is or could be a meaningful
  channel.
- Product schema, faceted navigation, and category hierarchy all
  materially affect indexation and ranking.

Common-but-wrong picks: a site that reviews products it doesn't sell
(use `affiliate-content`); a brand with a content marketing arm that
out-traffics the store (still `ecommerce`, but the plan needs to
prioritize product-led SEO over editorial).

---

## 2. Revenue model implications

Ecommerce revenue is **sessions × add-to-cart rate × cart-completion
rate × AOV**, which means SEO must drive **buying-intent sessions** —
not just any traffic. A 100K-visitor blog with no commercial intent
loses to a 10K-visitor product page with high purchase intent.

### What this changes about the strategy

- **Product schema is non-negotiable.** Product, Offer, AggregateRating
  (only when honest), Review schema. Merchant Center cross-checks
  product schema against the feed; mismatches suppress free Shopping
  listings.
- **Category hierarchy is the SEO spine.** Categories rank for
  head terms ("running shoes"), products rank for long-tail
  product-specific terms ("nike pegasus 41 mens 10.5"). A
  flat catalog with no category structure leaves the head-term
  traffic on the table.
- **Faceted navigation is a double-edged sword.** Faceted URLs
  (color × size × material) explode the indexable URL count;
  most need to be `noindex` or canonicaled to the parent
  category — only the high-search-volume facet combinations
  should be indexable landing pages.
- **Product-page content depth matters.** AI Overviews on
  commercial queries pull from product descriptions that are
  unique, specific, and answer the actual buyer questions
  (sizing, materials, return policy, comparison to similar
  products). Manufacturer-default copy gets demoted.
- **Inventory honesty is a ranking signal.** Out-of-stock
  pages should signal `https://schema.org/OutOfStock`, not
  serve a 404 — indexed equity is preserved while the user
  is sent to alternatives.

### Revenue-stream hierarchy to encode in the plan

1. **Product-page organic** (highest intent; the conversion event
   is on-page).
2. **Category-page organic** (head-term traffic; converts via
   internal navigation to product pages).
3. **Merchant Center / Shopping** (free + paid; product feed
   quality is the gate).
4. **Editorial / blog** (top-of-funnel; converts via internal
   linking + remarketing pixel capture).
5. **Email / SMS** (own-channel; SEO contributes by surfacing
   newsletter signup on every category and product page).

---

## 3. Content vertical priorities

| Vertical | Purpose | Conversion lift | Authority lift |
|---|---|---|---|
| **Category pages** | Head-term capture + product distribution | High | High |
| **Product pages** | BoFu purchase capture | High | Medium |
| **Buying guides ("best X for Y")** | MoFu education + cross-sell | Medium | High |
| **How-to / use-case content** | ToFu + AI Overview citations | Low | High |
| **Comparison ("X vs Y")** | MoFu evaluation capture | Medium | Medium |
| **Customer reviews + UGC** | E-E-A-T + conversion | High | High |
| **Help-center / size guides / returns policy** | Conversion + AI Overview | Medium | Medium |

Hub-and-spoke recommendation:

- **Category as hub**, product pages as spokes. Each category
  page should link to its top 12-20 products plus 2-3 "best of"
  buying guides.
- **Buying guides** as a separate editorial hub linking back
  into categories AND specific products with clear context
  ("best for X scenario").
- **Brand pages** (when the store carries multiple brands) as
  a parallel hub — captures branded-search demand.
- **UGC / review hubs** when the catalog is large enough to
  support them — review pages indexable by product.

---

## 4. Measurement focus

The Dual Surface Scorecard for ecommerce tracks:

### Visibility (the SEO half)

- **GSC impressions + clicks** by URL pattern: category pages,
  product pages, blog/editorial.
- **Indexation health** — Google Search Console index coverage
  by URL pattern (faceted navigation usually generates the
  largest indexation surprises).
- **Merchant Center disapprovals** — product feed errors that
  suppress free Shopping listings.
- **Product schema validation** — Rich Results Test on the top
  100 product pages monthly.
- **Top 100 commercial-investigation queries** rank tracking.
- **AI Overview presence** on "best [category] for [use-case]"
  queries.

### Revenue (the business half)

- **Organic-attributed revenue** by URL pattern (category vs
  product vs editorial) — different SEO investments justify
  different effort.
- **Add-to-cart rate** by landing-page URL — finds product
  pages with high traffic but low conversion (descriptions
  need work) or low traffic but high conversion (worth
  scaling traffic to).
- **Cart-completion rate** trend — separate from SEO but
  worth surfacing because traffic improvements get cancelled
  by checkout regressions.
- **AOV by source** — organic vs paid vs email; helps justify
  SEO investment in higher-AOV product categories.
- **Returning-buyer rate from organic-acquired customers** —
  long-term signal that the SEO is bringing in good-fit
  buyers, not bargain-hunters.

### Refresh cadence

- **Daily** — Merchant Center disapproval check (lost
  Shopping listings cost money fast).
- **Weekly** — top-loss queries, indexation coverage spike
  monitoring.
- **Monthly** — product-schema validation, AI Overview
  spot-checks on top categories, faceted-URL audit.
- **Quarterly** — full DataForSEO category-rank pull,
  full competitor product-coverage map, full cannibalization
  scan.

---

## 5. Anti-patterns specific to ecommerce

These are forbidden in the BEAST plan.

- **Manufacturer-default product descriptions on every
  product page.** Duplicate content liability across
  thousands of stores selling the same SKUs. Unique
  descriptions are SEO + AI-Overview table stakes.
- **Faceted-navigation URL explosion** — every color × size
  combination indexed. Crawl-budget waste, thin content
  liability. Canonical or `noindex` everything that isn't
  a high-volume search target.
- **Fake aggregate review counts in Product schema.**
  Manual action risk. Schema must reflect actual review
  count from the actual review platform.
- **Hiding return / shipping / sizing information** in
  modal pop-ups or separate pages. AI Overviews pull the
  return policy and sizing chart as direct citations on
  product queries; hiding this content costs visibility.
- **Out-of-stock products served as 404.** Destroys
  indexed equity. Use `OutOfStock` schema and surface
  alternatives on the page.
- **Mass-discount / coupon farm content** that doesn't
  match reality (claiming "30% off" in title tags when
  the discount expired months ago).
- **Pagination / sort-order URL chaos** — `/category?sort=price-asc&color=red&page=3`
  indexed as a unique page. Self-cannibalization at scale.
- **Buying low-quality backlinks for product pages** —
  manual action risk, undermines the entire domain.
- **Auto-generated blog content to chase informational
  queries the brand has no authority on.** ToFu content
  needs to genuinely match the brand's expertise; off-niche
  blog farms get demoted under HCU.
- **Image SEO failures at scale** — descriptive alt text
  matters more on ecommerce than anywhere because Google
  Image Search drives meaningful product discovery.

---

## AI Overview considerations specific to ecommerce

AI Overviews on commercial queries currently lean toward
buying guides and review-aggregator content (Wirecutter,
NYT-style editorial, niche review sites). To get cited:

- **Buying guides on the store's own site** (well-structured,
  honest about trade-offs, named-author with credentials)
  can be cited if the editorial quality is high enough.
- **Product pages with unique, depth-rich descriptions**
  including specs, materials, sizing, and real customer
  quotes get cited as primary sources.
- **Schema honesty** is required — Product, Offer,
  AggregateRating must match reality.
- **External citations** to manufacturer brand pages,
  testing labs, certification bodies (UL, FDA, USDA,
  GOTS, etc.) signal product legitimacy.
- **Customer review schema** must reflect actual review
  data — Google cross-checks against the review widget.

The BEAST plan's section 7 (AI Overview tactics) should
call out each of these specifically with example URLs from
the client's category and product pages.
