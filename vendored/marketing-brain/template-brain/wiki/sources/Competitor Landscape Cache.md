---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
source_manifest_id: ""
source_hash: ""
retrieved_at: ""
last_verified: ""
type: source
title: "Competitor Landscape Cache"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - competitors
  - serp-research
status: pending
related:
  - "[[Competitor Keyword Research Summary]]"
  - "[[Primary Competitors]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[HCU Recovery Framework]]"
  - "[[Topical Authority for Niche Sites]]"
sources:
  - "DataForSEO competitors_domain pull (pending)"
  - "Direct SERP research (pending)"
---

# Competitor Landscape Cache

**Status: pending.** This note becomes the snapshot of {{site_url}}'s competitive landscape once the marketing-brain skill runs the DataForSEO `competitors_domain` pull plus per-keyword SERP top-10 research. Tiered by direct keyword and intent overlap with {{client_name}}'s site.

The canonical Tier 1-4 list lives in [[Primary Competitors]] (entity note); this cache holds the per-competitor profile detail (focus area, content strength, authority signal, threat assessment, suggested response).

## Tier 1 — Direct Niche Overlap

The closest competitors. They target the same intent and share most of {{client_name}}'s priority SERPs.

| Domain | Focus Area | Content Strength | Authority Signal | Threat | Suggested Response |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

## Tier 2 — Broader / Adjacent Coverage

Strong domains with overlapping but broader scope. Compete via vertical-specific information gain.

| Domain | Focus Area | Content Strength | Authority Signal | Threat | Suggested Response |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

## Tier 3 — Adjacent / Specialist / Aggregator

Operators in adjacent business models. They compete for some intents but rarely for the site's core content.

| Domain | Focus Area | Content Strength | Authority Signal | Threat | Suggested Response |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

## Tier 4 — General / Weak Overlap

Generic content domains that surface for some fringe queries.

| Domain | Focus Area | Content Strength | Authority Signal | Threat | Suggested Response |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

## Authority Sources (Citation Targets, Not Competitors)

Government / regulatory / industry-canonical domains that hold authority on niche-specific queries. Cite from owned pages; do not compete.

To be filled per niche by the skill (e.g., regulatory bodies, official industry publications, well-known trade associations).

## Caveats

- This list is enriched from DataForSEO competitor-intersection runs — every claim traces to a JSON file in `.raw/sources/dataforseo/`.
- Tier assignments may shift after [[Days 1-5 GSC Diagnostic and Triage]] reveals which queries actually drive {{client_name}}'s residual traffic.
- Some competitors may also be in algorithmic recovery; this opens windows but means SERPs may be unstable.
