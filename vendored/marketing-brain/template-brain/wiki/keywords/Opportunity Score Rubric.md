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
title: "Opportunity Score Rubric"
created: 2026-05-04
updated: 2026-05-04
tags:
  - keywords
  - scoring
  - rubric
status: active
related:
  - "[[XLSX Structure Reference]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Strategy Framework]]"
  - "[[DataForSEO Keyword Exports]]"
sources:
  - "marketing-brain skill — build_keyword_xlsx.py"
---

# Opportunity Score Rubric

The formula and rubric the marketing-brain skill uses to rank keywords in the dedup'd XLSX (Sheet 1: High Opportunity). Tunable. The default below works for most niches; per-niche tuning is documented under "When to Tune" at the bottom.

## The Formula

```
opportunity_score = volume / (1 + best_competitor_position)

if our_position is not None and our_position <= 10:
    opportunity_score *= 0.3   # already-ranking penalty
```

Higher score = better opportunity to invest refresh / new-page effort.

### Why this shape

- **Numerator (volume)** — bigger keyword = bigger ceiling. Self-evident.
- **Denominator (1 + best_competitor_position)** — proves the keyword is winnable. If a Tier 1 competitor ranks #1, the realistic ceiling is `volume / 2`. If the best competitor ranks #5, the ceiling is `volume / 6`. The "+1" prevents division by zero and softens the curve so position-1 doesn't dominate.
- **Already-ranking penalty (×0.3)** — if the site is already top 10, the marginal investment to push from (say) #6 to #3 is real but smaller than the investment to take a brand-new keyword from #25 to #5. The penalty redirects attention to keywords with bigger position deltas available.

## Worked Examples

### Example 1 — High volume, weak competitor

- Keyword: "best wading boots for steelhead"
- Volume: 1300
- Best competitor position: 5 (Tier 2 affiliate site at #5; Tier 1 competitors don't rank in top 10)
- Our position: null (we don't rank top 100)
- Score: `1300 / (1 + 5)` = `1300 / 6` = **216.67**

Read: high-priority opportunity. A well-built gear-review page (per [[Gear Review Template]]) can plausibly land top 5 → top 3 → #1.

### Example 2 — High volume, strong competitor

- Keyword: "trout fishing"
- Volume: 5400
- Best competitor position: 1 (Wikipedia at #1)
- Our position: null
- Score: `5400 / (1 + 1)` = `5400 / 2` = **2700**

Read: looks high but read the SERP carefully — Wikipedia + government regulators + national media at the top means the realistic ceiling is much lower than the score suggests. Score gives the upper bound; SERP quality determines whether to chase it. The High Opportunity sheet filter (requires a Tier 1 / Tier 2 competitor in top 10 — government and Wikipedia don't qualify by default) usually catches this and demotes it.

### Example 3 — Medium volume, we're already top 10

- Keyword: "winter steelhead fishing"
- Volume: 720
- Best competitor position: 4
- Our position: 7 (already top 10)
- Score before penalty: `720 / (1 + 4)` = `720 / 5` = **144**
- Score after penalty: `144 × 0.3` = **43.2**

Read: lower priority for the High Opportunity sheet. Still worth a refresh per [[Days 13-18 Top Pages Refresh]] (Tier 2 in [[Keyword Targets and Page Map]] — push 4-10 into top 3), but not the same investment as Example 1.

## When to Tune

The default formula assumes:

- Standard SERP composition (10 organic results).
- Competitor authority is the dominant ranking factor.
- The site has the resources to build the page well; opportunity score predicts the ceiling, not whether you'll execute well.

Tune when:

- **AI Overview presence dominates** — adjust the formula to weight AIO presence (zero-click impact). Default doesn't see AIO; if `serp_features` includes "ai_overview", consider a 0.7 multiplier.
- **Local Pack dominates** — for local-SEO sites, the Local Pack typically pushes organic results below the fold. Score the Local Pack-affected keywords separately (via the local-seo-services overlay).
- **Niche has unusual SERP density** — e.g., recipes / lyrics / dictionary pages often have non-standard SERPs. Score these clusters separately or exclude.
- **Site has unusual authority profile** — a brand-new site in a high-authority niche needs a stricter "winnable" filter; an established site with strong topical authority can chase higher-difficulty keywords than the default suggests.

## Anti-pattern

Treating the score as the final word. The score is the **filter** — what to look at first. The decision still requires reading the SERP, confirming page-type fit, checking [[Keyword Cannibalization Ledger]], and passing [[SERP-First Content Creation Gate]]. A high-score keyword whose SERP wants a comparison page and whose intent doesn't match what {{client_name}} can credibly produce is not actually a high-priority target.
