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
title: "Keyword Strategy Framework"
created: 2026-05-04
updated: 2026-05-04
tags:
  - keywords
  - strategy
status: active
related:
  - "[[Seasonal Keyword Playbook]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[XLSX Structure Reference]]"
  - "[[Opportunity Score Rubric]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
sources:
  - "GSC 16-month query export (pending)"
  - "DataForSEO competitor gap analysis"
  - "[[DataForSEO Keyword Exports]]"
---

# Keyword Strategy Framework

The keyword posture for the sprint. The single most important framing depends on the site's posture (recovery vs growth), set by the active business-type overlay.

## Posture (Recovery vs Growth)

- **Recovery posture** — start by recovering keywords the site once ranked for, before chasing new ones. The site's existing topical authority — even reduced — is leverage. New unrelated keywords stretch authority thinner and slow recovery.
- **Growth posture** — start by reinforcing the site's strongest topical territories before expanding to new ones. The site's natural authority lives in 1-3 clusters; saturate those first, then extend.

In both postures, the order of operations is the same: GSC loss-query mining + DataForSEO competitor gap analysis run in parallel; the dedup'd XLSX organizes the output; the cannibalization ledger reserves owners; the SERP-first gate enforces per-page intent confirmation.

## Keyword Discovery Sources

The marketing-brain skill's 6-step research pipeline produces all of the below; once GSC connects, GSC loss-query mining is added.

- **DataForSEO competitor gap analysis** (always) — what are the surviving competitors ranking for that this site is not? Output: dedup'd XLSX with 4 sheets per [[XLSX Structure Reference]]; in-vault view at [[keywords.base|keywords.base]].
- **GSC 16-month query export** (recovery posture, once GSC connects) — the "losing queries" view: queries where impressions or clicks dropped most year-over-year. These are the recovery candidates.
- **{{client_name}}'s domain knowledge** — underserved {{niche}} combinations the SERP currently fills with weak content because no one with real practice has written the page.
- **PAA + related-search mining** — see [[PAA Mining Digest]]. Surfaces question-format and adjacency keywords the head-term pulls miss.

## Prioritization Heuristic

A keyword is "winnable" when:

- The site once ranked top 20 for it (recovery) OR a competitor we can credibly outpace ranks top 10 for it (growth).
- The current SERP intent matches a page type {{client_name}} can credibly own with real evidence.
- The competition in the current top 10 is not dominated by national authority brands the site cannot realistically displace at the current authority level.
- The keyword serves a real reader / customer intent — not a thin-traffic curiosity query.

The skill's [[Opportunity Score Rubric]] formalizes this into a numeric score: `volume / (1 + best_competitor_position)` with a penalty if the site is already top 10. Pages that satisfy all four heuristics + score in the top quartile are the first refresh / build candidates.

## Cluster Logic

Group queries by topical hub. The specific clustering scheme depends on {{niche}} — common patterns:

1. **By entity** — species / products / locations / personas / industries.
2. **By time / season** — when seasonal demand cycles dominate.
3. **By stage** — informational / commercial / transactional / local — particularly important for comparison and product clusters.
4. **By technique / method / tool** — how-to clusters that link laterally to gear / service / product hubs.

Each cluster has a hub page and supporting pages. Hub pages own the broad cluster term. Supporting pages own specific intersections.

## Anti-pattern

Chasing high-volume generic queries before owning the regional / vertical core. Generic high-volume queries are the most competitive and the slowest to recover; specificity is where most niche sites' natural authority lives and where movement comes fastest.

## Mapping Rule

One primary keyword maps to exactly ONE canonical URL. Always check [[Keyword Cannibalization Ledger]] before assigning a keyword to a page. Multiple URLs competing for the same intent is a self-inflicted ranking problem and a quality signal in the wrong direction.
