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
title: "DataForSEO Keyword Exports"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - dataforseo
  - keywords
  - exports
status: pending
related:
  - "[[Competitor Landscape Cache]]"
  - "[[Competitor Keyword Research Summary]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[XLSX Structure Reference]]"
  - "[[Opportunity Score Rubric]]"
  - "[[Claude SEO Install and First Audit]]"
sources:
  - "DataForSEO Labs API (pending)"
---

# DataForSEO Keyword Exports

**Status: pending.** This note becomes the canonical reference for the DataForSEO baseline pull once the marketing-brain skill runs the 6-step research pipeline. Until then, the structure below is the empty schema; the skill fills it.

## Pull Summary

- **API calls**: TBD
- **Total cost**: TBD (capped at the `--cost-cap` value, default $5.00)
- **Location**: TBD per `--location` flag
- **Language**: TBD per `--language` flag
- **Date**: TBD

## What Was Pulled

Raw JSON outputs all live under `.raw/sources/dataforseo/`. Schema:

- `site-ranked-keywords-<domain>-YYYY-MM-DD.json` — full ranked-keyword set for {{site_url}}
- `site-competitors-domain-YYYY-MM-DD.json` — top 30 organic competitors by overlap
- `competitor-ranked-keywords-<domain>-YYYY-MM-DD.json` — one per Tier 1 competitor
- `domain-intersection-<domain>-YYYY-MM-DD.json` — head-to-head shared keyword universe per Tier 1 competitor
- `serp-<keyword-slug>-YYYY-MM-DD.json` — SERP top-10 result files for each priority keyword
- `keyword-overview-priority-YYYY-MM-DD.json` — volume / CPC / KD / intent for the priority list
- `keyword-suggestions-<seed>-YYYY-MM-DD.json` — keyword expansions per head seed

The deduplicated, scored, 4-sheet XLSX produced from these JSONs lives at `keywords-YYYY-MM-DD.xlsx` (in the parent of the vault, alongside the brain folder). See [[XLSX Structure Reference]] for the per-sheet schema and [[Opportunity Score Rubric]] for the scoring formula.

The companion in-vault view is `[[keywords.base|keywords.base]]` — same data, queryable inside Obsidian.

## Headline Findings

To be filled by the skill. Categories surfaced from real pulls in prior client work:

- Total ranking-keyword count and position-bucket distribution.
- Sister-site or coordinated-brand discovery (when the same owner ranks for overlapping intent on multiple domains).
- Competitor reframing (when initial Tier 1 list turns out to be wrong — e.g., a domain assumed to be a head-to-head competitor turns out to be off-region).
- Single biggest volume × position gap on the site.
- Pillar-page invisibility findings (the site's named pillar URL doesn't rank for its own head term).
- High-volume regional / specialty terms underperforming.
- Top quick-win refresh candidates (keywords at positions 4-10 with material volume).

## Position Bucket Distribution

| Bucket | Count | Share |
|---|---:|---:|
| 1-3 | TBD | TBD |
| 4-10 | TBD | TBD |
| 11-20 | TBD | TBD |
| 21-50 | TBD | TBD |
| 51-100 | TBD | TBD |
| >100 | TBD | TBD |

## Cred Rotation Note

If temporary DataForSEO credentials were used for the initial pull, recommend rotating the password once {{client_name}} verifies the pull. The vault never persists credentials per [[CODEX|CODEX rule]].

## Trigger to Refresh

Refresh quarterly OR after any major Google update (HCU re-runs, Core Updates) per [[HCU Recovery Framework]] guidance, OR before launching a new content sprint that targets new clusters.
