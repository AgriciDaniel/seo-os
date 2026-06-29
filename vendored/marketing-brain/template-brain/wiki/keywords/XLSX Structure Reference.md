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
type: keyword-strategy
title: "XLSX Structure Reference"
created: 2026-05-04
updated: 2026-05-04
tags:
  - keywords
  - xlsx
  - schema
  - reference
status: active
related:
  - "[[Keyword Strategy Framework]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Opportunity Score Rubric]]"
  - "[[DataForSEO Keyword Exports]]"
sources:
  - "marketing-brain skill — build_keyword_xlsx.py"
---

# XLSX Structure Reference

The marketing-brain skill produces a deduplicated, scored XLSX (`keywords-YYYY-MM-DD.xlsx`) as part of the 6-step research pipeline (Step 3). This note documents the per-sheet schema and how to read it. The companion in-vault view is [[keywords.base|keywords.base]] — same data, queryable inside Obsidian; the XLSX is for Excel power-users and for handing data to {{client_name}} in a familiar format.

## Where the XLSX Lands

Default path: `<vault-parent>/keywords-YYYY-MM-DD.xlsx` — alongside the vault directory, not inside it (so re-running the skill doesn't re-ingest the XLSX as a vault note).

Override with `--xlsx-out <path>` on the skill invocation.

## The 4 Sheets

### Sheet 1 — High Opportunity

The primary attention sheet. Sorted by `opportunity_score` descending. These are the keywords most likely to move the needle.

Filter rule: keywords where (a) the site is not already top 3, AND (b) at least one Tier 1 / Tier 2 competitor ranks top 10 with the keyword (proves the keyword is winnable at the site's authority level), AND (c) volume ≥ a threshold the skill computes from the median volume in the dedup'd pull.

Columns:

| Column | Type | Description |
|---|---|---|
| keyword | string | The dedup'd primary keyword (lowercase, normalized) |
| volume | int | Monthly search volume (DataForSEO `search_volume`) |
| kd | int | Keyword Difficulty (0-100, DataForSEO Labs) |
| our_position | int / null | The site's current SERP position; null if not in top 100 |
| best_competitor_position | int | The lowest (best) SERP position among Tier 1-2 competitors |
| best_competitor_domain | string | The Tier 1-2 competitor domain ranking best for this keyword |
| opportunity_score | float | Per [[Opportunity Score Rubric]] — `volume / (1 + best_competitor_position)`, with penalty if our_position ≤ 10 |
| cluster | string | The cluster assignment per [[Site Inventory and Cannibalization Map]] (e.g., "steelhead", "salmon") |
| intent | enum | informational / commercial / transactional / local |
| sheet | enum | "High Opportunity" — fixed for this sheet |

### Sheet 2 — Hidden Gems

Lower-volume keywords (below the High Opportunity threshold) where competitors are weak. These are the keywords where a single well-built page can dominate fast.

Filter rule: volume between the 10th and median percentile of the dedup'd pull, AND `best_competitor_position` ≥ 5 (meaning no top-5 competitor exists), AND our_position is null or > 30.

Columns: same as High Opportunity, with `sheet = "Hidden Gems"`.

### Sheet 3 — High Volume

The biggest absolute-volume keywords in the dedup'd pull, regardless of difficulty. Used for pillar-page planning and AI-Overview-targeting decisions.

Filter rule: top 10% by volume.

Columns: same as High Opportunity, with `sheet = "High Volume"`.

### Sheet 4 — All Keywords

The full dedup'd dataset. Every keyword that appeared in any of the DataForSEO pulls (site `ranked_keywords` + competitor `ranked_keywords` + `keyword_suggestions` for head seeds), deduped on the normalized keyword string.

Columns: all the columns from sheets 1-3, plus:

| Column | Type | Description |
|---|---|---|
| source_competitor | string | Which competitor's `ranked_keywords` pull surfaced this keyword (or "site" if from {{site_url}}'s own pull) |
| seed | string | Which head-seed `keyword_suggestions` pull surfaced this keyword (if any) |
| serp_features | list | Any SERP features present (AI Overview, People Also Ask, Featured Snippet, Local Pack, Image Pack, Video Carousel, etc.) |
| cpc | float | Cost-per-click (commercial-intent signal) |

## Opportunity Score Formula

Documented in detail in [[Opportunity Score Rubric]]. Quick reference:

```
opportunity_score = volume / (1 + best_competitor_position)
if our_position is not None and our_position <= 10:
    opportunity_score *= 0.3   # we're already there; lower priority for new investment
```

Higher score = better opportunity.

## Reading the XLSX in Tandem with Obsidian

The XLSX is the "spread it out and explore" view. The Obsidian [[keywords.base|keywords.base]] is the "filter and click through to the cluster" view. Use them together:

1. Open the XLSX High Opportunity sheet to scan the top 50 candidates.
2. Pick the candidates that align with {{client_name}}'s capabilities.
3. Open Obsidian, filter [[keywords.base|keywords.base]] by cluster, see which existing pages the cluster maps to.
4. Make refresh / new-page decisions per [[Keyword to URL Map]] and [[Keyword Cannibalization Ledger]].

## Anti-pattern

- Sorting only on volume. The opportunity score weighs volume against the realistic ceiling (best competitor position). High-volume + #1-competitor-Wikipedia = unwinnable; medium-volume + #5-competitor-affiliate = highly winnable.
- Treating "All Keywords" as the action sheet. It's the reference. The first three sheets are the action sheets.
- Ignoring the `serp_features` column. AI Overview presence, Local Pack presence, and Image Pack presence all change what a "ranking" means in 2026.

## Refresh

The XLSX is regenerated whenever the skill re-runs Step 3. Re-run quarterly OR after a major Google update OR when {{client_name}} adds a major new content cluster.
