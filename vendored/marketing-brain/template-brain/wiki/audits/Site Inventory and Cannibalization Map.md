---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: audit
title: "Site Inventory and Cannibalization Map"
created: 2026-05-04
updated: 2026-05-04
tags:
  - audit
  - inventory
  - cannibalization
status: seed
related:
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Content Pruning and Consolidation]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Days 6-12 Content Audit and Prune]]"
sources:
  - "Sitemap pull (pending — populated by skill)"
  - "Direct page parsing (pending — populated by skill)"
---

# Site Inventory and Cannibalization Map

**Status: TBD pending audit.** The marketing-brain skill's `vault-synthesizer` subagent populates this note from the sitemap pull, direct page parsing, and the DataForSEO ranked-keywords data. Until that runs, the table below is the empty schema the skill will fill.

## Vertical Counts

To be filled by the skill from the sitemap + page-type classifier. Example shape (will vary by business type):

- Pillar pages: TBD
- Category / hub pages: TBD
- Product / service / location pages: TBD
- Article / guide pages: TBD
- Comparison pages: TBD
- Utility / about / contact pages: TBD
- Off-niche pages: TBD

## Full URL Inventory

The canonical inventory table. Skill fills one row per URL with its assigned vertical, cannibalization cluster, and initial recommendation.

| URL | Slug | Vertical | Cannibalization Cluster | Initial Recommendation |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

Recommendation values: `KEEP`, `REWRITE`, `MERGE-into <target>`, `301-REDIRECT-to <target>`, `410-GONE`, `TBD-pending-GSC` (when ownership choice between two URLs requires GSC traffic data to decide).

## Cluster Resolutions

Clusters are sets of URLs competing for the same primary intent. The skill identifies clusters from URL-slug similarity + the DataForSEO ranked-keywords data (multiple URLs ranking for the same head keyword = cannibalization signal). Each cluster gets:

- **Owner** — the canonical URL for the cluster's primary intent.
- **Spokes** — URLs that retain distinct intents and stay separate.
- **Merge candidates** — URLs whose intent overlaps the owner; 301 to owner.
- **Off-niche / prune** — URLs that don't belong in any cluster and don't earn standalone keep.

Cluster decisions land as separate notes in `wiki/decisions/` (one per cluster) and feed the [[Keyword to URL Map]].

## Slug Corrections, Off-Niche, and Critical Tech Fixes

Surfaced during inventory; ship early (Days 1-5) rather than waiting for the prune phase. Filed as separate decision notes when found.

- Slug corrections: TBD
- Off-niche prune candidates: TBD
- Critical tech fixes (missing H1, broken canonicals, schema errors): TBD

## Status

This map is the WORKING inventory. All TBD-pending-GSC rows are resolved during [[Days 1-5 GSC Diagnostic and Triage]] and [[Days 6-12 Content Audit and Prune]]. The accepted owner choices flow into [[Keyword to URL Map]] and are enforced by [[Keyword Cannibalization Ledger]].
