---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "Topical Authority for Niche Sites"
created: 2026-05-04
updated: 2026-05-04
tags:
  - topical-authority
  - niche
  - structure
status: active
related:
  - "[[{{site_brand}}]]"
  - "[[Information Gain]]"
  - "[[Content Pruning and Consolidation]]"
  - "[[HCU Recovery Framework]]"
sources: []
aliases:
  - "Topical Authority"
---

# Topical Authority for Niche Sites

Niche sites win by covering a small topic deeply rather than a large topic shallowly. For {{site_url}}, the winning shape is "the most complete resource for {{niche}}" — not "a {{niche}}-adjacent site that also covers {{niche}}".

## Definition

Topical authority is Google's site-level read on whether a domain is a credible source for a topic cluster. It accumulates from depth of coverage, internal linking density within the cluster, and external citations within the cluster. It decays when off-topic content dilutes the signal.

## Why It Matters Post-HCU

The [[Google Helpful Content System|HCU]] amplifies topical signals. A tightly focused site recovers faster than a sprawling one because the trust calculation has fewer noisy inputs. Off-topic content does not just fail to help — it actively suppresses the site-wide signal.

## Hub-and-Spoke Structure

The target architecture for any niche site:

- **Pillar topics** — the 5-10 broad topics the site claims as its territory.
- **Per-pillar canonical owners** — one canonical owner page per pillar.
- **Sub-topic spokes** — narrower pages that link up to their pillar and laterally to siblings.
- **Technique / how-to spokes** — methodology pages linked from both sub-topics and product/service pages.
- **Commercial / conversion pages** — product, service, gear, or comparison pages linked from technique pages where the offering naturally serves the reader's stated need.

Every page belongs to exactly one cluster. Every page links up to its pillar and laterally to siblings.

## Coverage Gap Audit Method

1. List every entity in the niche (species / locations / tools / techniques / use cases — depending on vertical).
2. List every cross-cutting dimension (season / region / use case / persona).
3. For each cell in the entity × dimension grid, ask: is there a canonical owner page? Is it the best one on the SERP?

The gaps become the publishing roadmap. The duplicates become the [[Content Pruning and Consolidation|merge]] candidates.

## Pruning Implication

Off-topic content — anything outside the named pillars — may be hurting the topical signal even if individual pages perform fine. Candidates for prune, merge, or **move to other site** if {{client_name}} owns multiple domains and a more relevant home exists. See [[Content Pruning and Consolidation]].
