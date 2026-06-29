---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: business-type-overlay
title: "Affiliate Content"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - affiliate
  - display-ads
  - lead-gen
status: active
related:
  - "[[business-types/_index|Business Type Overlays Hub]]"
  - "[[Affiliate Disclosure Standards]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Gear Review Template]]"
  - "[[Location Guide Template]]"
  - "[[Pillar Page Template]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[HCU Recovery Framework]]"
sources: []
aliases:
  - "affiliate-content"
---

# Affiliate Content

The affiliate-content overlay. Proven on a regional outdoor-recreation affiliate site (affiliate links + display-ad network + lead-gen for an attached service brand). HCU recovery posture is often relevant.

## 1. When to Use This Overlay

Characteristic patterns:

- Site monetization is **affiliate links + display ads** (Ezoic, Mediavine, AdSense, Raptive, etc.), often with a third revenue stream (lead-gen for an attached service brand).
- Niche has identifiable products that can be reviewed / compared.
- The named expert author has hands-on, dated, on-the-ground experience the SERP top 10 typically lacks.
- E-E-A-T moat: real practice — fishing on water, hiking trails, testing gear, cooking recipes, building things. The author can ship photos / videos / dated logs that AI cannot fake.
- Site is often post-HCU (the September 2023 update hit affiliate publishers hardest) — recovery posture dominates.

If the site is purely product-cataloging (no original practice / testing) — that's not the affiliate-content overlay; it's closer to ecommerce-facade or thin-content territory and the playbook is different (and harder).

## 2. Revenue Model Implications

Three streams, in priority order by revenue per converted reader:

1. **Lead-gen for attached service brand** (when present) — a booked service / guide / consultation is worth dozens to hundreds of dollars. Materially the highest-RPM page type.
2. **Affiliate links** — gear retailers, tackle, apparel, equipment. 3-10% commission typical; low-three-digit dollars per conversion in mid-ticket categories.
3. **Display ads** — Ezoic / Mediavine / Raptive sessions worth pennies; volume-sensitive; penalized by [[HCU Recovery Framework|HCU]] when density exceeds quality.

Monetization density rules per [[Monetization Density Guardrails]] apply; affiliate disclosure per [[Affiliate Disclosure Standards]] is mandatory and visible above the fold.

## 3. Content Vertical Priorities

Dominant page templates:

- **[[Pillar Page Template]]** — one canonical owner per major topic (species / activity / category).
- **[[Gear Review Template]]** — high-monetization, high-risk-if-templated. The honest-testing structure is non-negotiable.
- **[[Location Guide Template]]** — regional / location-anchored guides. Honey-hole protection rule applies for outdoor niches.

Cluster pattern: hub-and-spoke per [[Topical Authority for Niche Sites]]. Pillars at the top (species / category), techniques and gear as spokes, location guides linking laterally.

## 4. Measurement Focus

Per [[Dual Surface Scorecard]]:

- **Visibility surfaces**: GSC impressions / clicks per cluster, top-10 keyword count, AI Overview presence, CWV pass rate.
- **Display monetization metric**: session-weighted RPM (Ezoic / Mediavine / Raptive dashboard, 28-day rolling).
- **Affiliate monetization metric**: clicks + conversion rate + EPC, segmented by program.
- **Lead-gen monetization metric** (when an attached service brand exists): conversion event volume per [[Booking Attribution Plan]] — `lead_form_submit`, `phone_click`, `email_click`, `external_referral`.

Off-site signals tracked monthly:

- New backlinks from regional / niche authority sources (regulatory bodies, trade publications, conservation orgs for outdoor; trade journals for industrial; cooking magazines for food).
- Community engagement deltas (subreddit / forum / Discord / Facebook group activity).
- Creator collaboration count (podcast appearances, YouTube features, magazine quotes).

## 5. Anti-Patterns Specific to This Vertical

- **Mass AI-generated reviews** — the canonical HCU trigger. If the named expert can't say "I tested this in [context] in [date]", the product is not in the review.
- **Inflated review schema** — `aggregateRating: 4.8 / reviewCount: 247` when the page has 1 expert review is detectable schema fabrication. See [[Affiliate Disclosure Standards]].
- **Hidden affiliate disclosure** — disclosure buried in the footer or behind a Terms link is a documented HCU signal. Always above the fold, plain language.
- **Ad density chase** — increasing Ezoic / Mediavine density to chase short-term RPM at the cost of CWV is a documented HCU signal. Protect CWV first.
- **Sister-site cannibalization** — if {{client_name}} owns multiple domains targeting overlapping intent, do not let them compete head-to-head on the same SERP. Coordinate intent ownership.
- **Honey-hole burning** for outdoor / location-based affiliate sites — publishing exact GPS coordinates or private-spot specifics damages the resource and reads as low-trust to the community.
- **Spec-sheet-only reviews** — round-up pages compiled from manufacturer specs without firsthand testing. Easiest HCU trigger.

## 6. Cross-references

- [[Affiliate Disclosure Standards]] — disclosure standard mandatory for this overlay.
- [[Monetization Density Guardrails]] — display + affiliate density rules.
- [[Gear Review Template]] — primary commercial page template.
- [[Location Guide Template]] — regional / location-anchored content.
- [[Booking Attribution Plan]] — lead-gen attribution (if attached service brand exists).
- [[E-E-A-T for {{site_type}}]] — the trust dimensions specific to affiliate-content sites.
