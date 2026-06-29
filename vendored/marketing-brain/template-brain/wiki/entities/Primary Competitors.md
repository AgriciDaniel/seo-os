---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: entity
title: "Primary Competitors"
created: 2026-05-04
updated: 2026-05-04
tags:
  - competitors
  - serp
status: seed
related:
  - "[[{{site_brand}}]]"
  - "[[Competitor Landscape Cache]]"
  - "[[Competitor Keyword Research Summary]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Information Gain]]"
  - "[[Tool Limitations]]"
  - "[[DataForSEO Keyword Exports]]"
  - "[[Distributed Presence Workflow]]"
sources:
  - "[[DataForSEO Keyword Exports]]"
  - "[[Competitor Landscape Cache]]"
aliases:
  - "Competitor Set"
---

# Primary Competitors

**Status: seed pending DataForSEO baseline pull.** The marketing-brain skill populates this note from the DataForSEO Labs `competitors_domain` endpoint plus per-keyword SERP top-10 results for the priority keyword set. Until that runs, the table below is the empty schema.

## Discovery Method

Identified via the DataForSEO Labs `competitors_domain` endpoint (saved to `.raw/sources/dataforseo/site-competitors-domain-{{date}}.json`) plus per-keyword SERP top-10 results for the priority keyword set. Numerical claims (positions, intersection counts, etv) trace to the digest in `.raw/sources/dataforseo/`.

## Tier 1 — Direct Head-to-Head Competitors

The competitors that show up repeatedly in the SERPs {{client_name}}'s site targets, on the same niche, technique, and location intents.

| Domain | Tier | Common Keywords | ETV | Notes |
| --- | --- | --- | --- | --- |
| TBD | 1 | TBD | TBD | TBD |

## Tier 2 — Regional / Adjacent Strong Domains

Strong domains with overlapping but broader scope.

| Domain | Tier | Common Keywords | ETV | Notes |
| --- | --- | --- | --- | --- |
| TBD | 2 | TBD | TBD | TBD |

## Tier 3 — Conservation / Authority / Specialist

Different business models or narrow scope; occasional SERP overlap. Cite where appropriate; do not compete.

| Domain | Tier | Common Keywords | ETV | Notes |
| --- | --- | --- | --- | --- |
| TBD | 3 | TBD | TBD | TBD |

## Tier 4 — Out-of-Region or Generic

Generic content domains that surface on fringe queries; not a planning priority.

| Domain | Tier | Common Keywords | ETV | Notes |
| --- | --- | --- | --- | --- |
| TBD | 4 | TBD | TBD | TBD |

## Community Surfaces

High SERP frequency in the DataForSEO competitor list (typically `youtube.com`, `reddit.com`, `facebook.com`, `instagram.com`, `tiktok.com`, sometimes `linkedin.com` for B2B), but these are engagement surfaces, not direct content competitors. Treat per [[Distributed Presence Workflow]].

To be filled per audit.

## Strategic Notes

- **Tier 1 is the direct comparison set.** Out-execute on E-E-A-T, Information Gain, and topical depth — see [[Information Gain]] and [[Topical Authority for Niche Sites]].
- **Sister-site / coordinated brands** require coordination, not competition. Two affiliated domains splitting the same SERP intent is a signal-dilution risk. If surfaced, file as an Open Question.
- **Government / aggregator competitors** (regulatory bodies, major aggregators with massive domain authority) are uncatchable on raw authority. Strategy is to win on local Information Gain, not domain rating. Cite where they hold authority; flank with depth where they don't.
- Some competitors may also be in algorithmic recovery — opens windows but means SERPs may be unstable.

## Caveats

- Tier 1 set is grounded in DataForSEO data and per-keyword SERP top-10 evidence; revisit when GSC reveals which queries actually drive {{client_name}}'s residual traffic.
- Theme-ownership analysis lives in [[Competitor Keyword Research Summary]]; full per-competitor strengths and threats live in [[Competitor Landscape Cache]].
