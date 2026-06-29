---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: entity
title: "{{site_brand}}"
created: 2026-05-04
updated: 2026-05-04
tags:
  - entity
  - site
status: seed
related:
  - "[[{{client_name}}]]"
  - "[[Google Helpful Content System]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[HCU Recovery Framework]]"
  - "[[Business Type Overlay]]"
sources: []
aliases:
  - "{{site_url}}"
---

# {{site_brand}}

Domain: `{{site_url}}`. **Owned by [[{{client_name}}]].** The site operates under the **{{business_type}}** business model — see the active overlay at `[[Business Type Overlay]]` for revenue model details.

**Status: seed.** Real niche scope, content vertical inventory, tech stack, monetization mix, and recovery / growth targets are TBD pending the audit. The marketing-brain skill populates the sections below from direct site fetch + sitemap pull + DataForSEO baseline.

## Niche Definition

- Geographic / market scope: {{niche}} (refine with {{client_name}}).
- Topic scope: TBD — to be inferred from sitemap + page-type analysis, then confirmed with {{client_name}}.
- See [[Topical Authority for Niche Sites]] for the deliberate narrowing rationale.

## Content Verticals

To be filled by the skill from sitemap + page classification. Examples by business type — actual list lands per audit:

- Pillar / hub pages
- Sub-topic guides
- Commercial / conversion pages (gear / product / service / location, depending on overlay)
- Comparison or alternative pages (SaaS overlay)
- Time-sensitive / seasonal content
- Trust / about / regulatory pages

Per-vertical inventory and triage status: see [[Site Inventory and Cannibalization Map]].

## Tech Stack

To be filled from direct fetch + response-header analysis.

- CMS: TBD
- Caching: TBD
- SEO plugin / metadata: TBD
- CDN: TBD

## Monetization Mix

The active business-type overlay defines the canonical revenue stream(s). This section captures what's actually live on the site as of audit date.

- Primary revenue surface: TBD per overlay
- Secondary revenue surfaces: TBD
- Lead-gen / conversion goal events tracked: TBD per [[Booking Attribution Plan]] (lead-gen overlays) or equivalent

## Known Constraints

To be filled. Common constraint patterns:

- Trust deficit (post-algorithmic-demotion vs greenfield).
- Single operator + named expert vs editorial team.
- Seasonal demand cycles compress publishing windows.
- Multi-site portfolio splits operator bandwidth.

## Recovery / Growth Targets

TBD pending GSC baseline. Total pages, indexed pages, traffic peak (if recovery), current traffic, top losing pages (if recovery), monetization-surface trend, conversion rate — all TBD pending audit. Do not write recovery numbers until [[Google Search Console]] export is in hand.
