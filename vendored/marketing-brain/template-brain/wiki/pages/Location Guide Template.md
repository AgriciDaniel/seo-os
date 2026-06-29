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
title: "Location Guide Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - location-guide
  - eeat
status: template
related:
  - "[[Pillar Page Template]]"
  - "[[Gear Review Template]]"
  - "[[Service Page Template]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "Google Quality Rater Guidelines"
---

# Location Guide Template

Canonical structure for location-anchored guides (rivers / lakes / regions for an outdoor affiliate site; neighborhoods / cities / service areas for a local-services business). Used by the **affiliate-content** and **local-seo-services** business-type overlays.

Location guides carry a particular ethical weight in some niches: they reveal where to go / where the service operates, and the line between helpful access information and revealing private specifics is real. This template draws the line on the side of helpful-without-burning-the-resource.

## Recommended Outline

1. Introduction with an original on-location photo from this specific place and a 1-2 sentence author note.
2. Location Overview — map at a useful but not granular scale; access points (parking, public-access trails, common entry points); landmarks; basic geography.
3. What's Here / What's Offered — the substantive content the location supports (species present for outdoor; services offered for local-services; cuisine for restaurant; etc.).
4. Seasonal Calendar specific to THIS location — peak windows, openings, closures, demand cycles.
5. Recommended Approach — what actually works at this location, not generic advice.
6. Local Regulations / Permits / Requirements — current canonical-source link; location-specific rules.
7. Etiquette — how locals do this; what behavior the location needs from visitors.
8. Recommended Gear / Services / Tools — affiliate or service slots placed where they serve the visit; link to deeper reviews / service pages.
9. Author bio with verifiable visits to the location (dates, what happened, what conditions).

## Required E-E-A-T Signals

- Photos taken AT the location (recognizable landmarks, dated).
- Dated visits — explicit "I was at this location in March 2024" or equivalent.
- Regulation / permit / requirement accuracy verified to current canonical source; do not copy from older guides.
- No revealing of private specifics that would harm the location (honey holes for fishing; private operator details for local-services; etc.).

## Schema

- `Article` (required) with author, datePublished, dateModified.
- `Place` with geo coordinates at the appropriate scale (location-level, not honey-hole-level).
- `FAQPage` for the FAQ section if present.
- `LocalBusiness` if the page is a service-anchored location guide for a local-services business — see [[Service Page Template]] for the canonical structure in that case.
- No `Review` schema — a location guide is not a review.

## Internal Links

- Companion guides for the named entities (species / services / etc.).
- Companion gear or service reviews for items recommended.
- Link to the regional hub page if one exists.
- Link to nearby locations' guides where they form a natural day-trip / multi-stop cluster.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — current SERP rewards location guides at this granularity.
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- E-E-A-T signals above are present, not aspirational.
- Resource-protection check: the page does not give away specifics that locals would not give away.
- Disclosure block present per [[Affiliate Disclosure Standards]] if affiliate links are included.
- CWV check passes per [[Monetization Density Guardrails]].

## Anti-pattern

Generic "best places to [activity] in [region]" lists with no original photos and no dated visits. These pages historically read as scraped or templated and are exactly the kind of page HCU is tuned against. If the named expert hasn't been to a location, that location doesn't appear in a location guide as if they have.
