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
title: "Competitor Keyword Research Summary"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - competitors
  - keywords
  - serp-research
status: pending
related:
  - "[[Competitor Landscape Cache]]"
  - "[[Primary Competitors]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[DataForSEO Keyword Exports]]"
  - "[[Information Gain]]"
  - "[[Topical Authority for Niche Sites]]"
sources:
  - "[[DataForSEO Keyword Exports]]"
  - "[[Competitor Landscape Cache]]"
---

# Competitor Keyword Research Summary

**Status: pending.** Synthesis of what the SERPs reveal about keyword theme ownership across {{client_name}}'s competitor set. Filled by the marketing-brain skill from the DataForSEO `domain_intersection` data plus per-keyword SERP top-10 research.

## Theme Ownership Map

For each cluster surfaced in [[Site Inventory and Cannibalization Map]], identify which competitors own the SERP, where {{site_url}} sits relative to them, and what differentiation axis is available.

To be filled. Common categories that surface:

- **Niche head-term cluster** — typically dominated by Tier 1 head-to-head competitors. The play is to consolidate {{client_name}}'s fragmented intent into a single canonical owner page that out-executes on E-E-A-T and Information Gain.
- **Regional / vertical specificity cluster** — often a gap when competitors write generic and {{client_name}} can write specific. This is usually the highest-EV differentiation axis.
- **Regulatory / authority cluster** — held by government / industry sources Google cannot ignore. Cite, do not compete.
- **Aggregator cluster** — held by booking / marketplace / directory aggregators with massive domain authority. Differentiate by depth, not authority.
- **Community / UGC cluster** — held by Reddit / YouTube / forum surfaces. Treat as engagement surfaces per [[Distributed Presence Workflow]], not as adversaries.

## Information Gain Levers Identified

Per [[Information Gain]], these are the differentiation axes where {{client_name}} can ship content competitors literally cannot. To be filled per niche. Generic categories:

1. **Specificity at the entity level** — named locations / techniques / tools / outcomes that competitors keep generic.
2. **Named expert author** — verifiable, dated, on-the-record practice — the biggest E-E-A-T moat.
3. **Time-sensitive precision** — opener / closure / release / pricing dates accurate to the current source.
4. **Original visual proof** — photos / screenshots / videos competitors cannot ship.
5. **Verifiable case-study outcomes** — real client / customer / project results competitors cannot match.

## Cluster Difficulty Inferences

Without DataForSEO volume/KD numbers, qualitative inferences from SERP composition are placeholders. Once DataForSEO data lands the skill replaces the placeholders with real KD scores and competitor-position deltas.

To be filled.

## Caveats

- All theme ownership claims are from public SERP inspection plus DataForSEO `domain_intersection` data — every claim traces to a JSON in `.raw/sources/dataforseo/`.
- Difficulty inferences from SERP composition are NOT a replacement for KD; the skill's `keyword-curator` subagent QAs the dedup'd XLSX before findings get cited downstream.
