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
type: deliverable
title: "ULTIMATE BEAST Plan"
created: 2026-05-04
updated: 2026-05-04
tags:
  - deliverable
  - beast-plan
  - synthesis
status: seed
related:
  - "[[FLOW Framework]]"
  - "[[HCU Recovery Framework]]"
  - "[[Implementation Roadmap]]"
  - "[[Full FLOW Review]]"
  - "[[Dual Surface Scorecard]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Business Type Overlay]]"
sources:
  - "[[FLOW Framework]]"
  - "[[DataForSEO Keyword Exports]]"
  - "[[PAA Mining Digest]]"
---

# ULTIMATE BEAST Plan

**Status: seed.** This is the strategic synthesis deliverable. `marketing-brain synthesize --vault <path>` fills it after research data is present. The synthesis cites FLOW, DataForSEO exports, [[PAA Mining Digest]], [[Site Inventory and Cannibalization Map]], and the active business-type overlay, then produces a ranked action plan for search quality, AI-feature eligibility, and Google SERP execution.

The structure below is the plan template the CLI fills.

## TL;DR

To be filled. 60-second version of the strategy. 3-5 bullets. The first thing AI Overviews can extract.

## Find — what the site needs from search

To be filled. Cite [[Keyword Targets and Page Map]], [[Competitor Landscape Cache]], [[DataForSEO Keyword Exports]]. Headline findings:

- Total ranking-keyword count and position-bucket distribution.
- Top quick-win refresh candidates (positions 4-10 with material volume).
- Pillar-page invisibility findings (the site's named pillar URL doesn't rank for its own head term).
- High-volume regional / specialty terms underperforming.
- Net-new opportunity gaps (Tier 5 in [[Keyword Targets and Page Map]]).

## Leverage — opportunities

To be filled. Cite [[Distributed Presence Workflow]] and the overlay-specific Leverage levers. Headline:

- Author / brand trust signal status — what's surfaced, what's not.
- Off-site footprint inventory — where the named expert already shows up vs where they should.
- Citation pursuit candidates (regulatory / industry / partner sites) — top 5 with rationale.
- Community engagement priorities — which 3-5 communities deserve weekly investment.

## Optimize — prune, refresh, publish

To be filled. Cite [[Site Inventory and Cannibalization Map]], [[Content Pruning Decision Framework]], [[Days 6-12 Content Audit and Prune]], [[Days 13-18 Top Pages Refresh]]. Headline:

- Cluster consolidation decisions — which clusters to consolidate, canonical owner per cluster.
- Critical tech fixes — H1 gaps, slug typos, schema errors that ship Day 1-5.
- Top 10-20 refresh queue per [[Days 13-18 Top Pages Refresh]].
- Net-new hero content list (2-4 pages) per [[Days 19-24 New Hero Content and Information Gain]].

## Win — measurement

To be filled. Cite [[Dual Surface Scorecard]] and the overlay-specific Win metrics. Headline:

- Cluster-by-cluster baseline (from Day 0).
- Visibility-to-revenue mapping — which monetization surface each cluster feeds.
- Conversion event setup status (per business type).
- Weekly check-in cadence per [[Verifier Cadence]].

## 30 / 60 / 90 Day Execution

### Days 0-30 — Sprint

Per [[Implementation Roadmap]]. To be filled with the day-by-day plan from the populated roadmap.

### Days 31-60 — Reinforcement

To be filled. Typical pattern:

- Continue [[Distributed Presence Workflow]] outreach.
- Re-run the selected SEO audit layer and compare delta to baseline.
- Refresh second-tier pages (rows 11-20 from the loss map).
- Net-new publishing: 2-4 more hero pages per the schedule.

### Days 61-90 — Compounding

To be filled. Typical pattern:

- Re-run DataForSEO baseline pull and compare keyword count + position-bucket distribution.
- Update [[Dual Surface Scorecard]] with year-over-year overlay.
- Decide on next-quarter cluster expansion (if topical authority on existing clusters is solid).

## AI Overview Tactics

To be filled. Specifics depend on the SERP feature inventory from [[DataForSEO Keyword Exports]]. Generic levers:

- TL;DR / Quick Answer at the top of every page (the first thing AI Overviews extract).
- Schema markup for `Article`, `FAQPage`, `HowTo`, `Product` as relevant — gives AIO structured signals.
- Original primary data — AIO surfaces sources with novel data more than rehashes.
- Named expert author with verifiable credentials — AIO weights expertise signals.
- Citations to and from authoritative sources — AIO surfaces well-cited pages.

## AI Search Tactics

To be filled. The dominant AI search surfaces (ChatGPT, Perplexity, Claude, Gemini) each weight signals slightly differently, but the durable strategy is:

- Original primary data and case studies — AI search engines surface unique data because the user's intent is "find sources I haven't already seen".
- Comprehensive coverage of question variants — AI search expands queries; pages that answer 5-10 question variants get cited more.
- Author trust signals (LinkedIn / GitHub / publication history) — AI search engines weigh author authority where they can detect it.

## Google SERP Tactics

To be filled. Cite [[Claude SEO Source|Claude SEO]] for the recurring tactical audit. Generic levers:

- Hub-and-spoke topical authority per [[Topical Authority for Niche Sites]].
- Information gain per [[Information Gain]] on every refreshed and new page.
- E-E-A-T signals per [[E-E-A-T for {{site_type}}]] surfaced site-wide via [[Days 25-30 E-E-A-T and Author Signals]].
- CWV and monetization density per [[Monetization Density Guardrails]].

## White-Hat Guardrails (non-negotiable)

- No fabricated stats, no traffic guarantees, no #1 promises.
- No AI-mass-content. No bulk AI-rewritten guides.
- No link buying. No PBNs. No reciprocal-link schemes.
- No incentivized reviews. No requested wording. No review gating.
- No schema fabrication (aggregateRating without real reviews; reviewCount inflation).
- No hidden monetization. Disclosure visible per [[Affiliate Disclosure Standards]] (or business-type equivalent).
- No deceptive comparison content ("we win every category" anti-pattern).
- See [[What Not To Do]] for the full list.

## Citation

This plan synthesizes:

- [[FLOW Framework]] (canonical strategy backbone)
- [[Claude SEO Source|Claude SEO]] (recurring tactical audit tool)
- [[DataForSEO Keyword Exports]] (keyword evidence)
- [[PAA Mining Digest]] (question and adjacency evidence)
- [[Site Inventory and Cannibalization Map]] (current site state)
- [[Competitor Landscape Cache]] + [[Competitor Keyword Research Summary]] (competitive evidence)
- The active business-type overlay at `[[Business Type Overlay]]` (vertical-specific adaptation)

Every numeric claim in the filled plan traces to one of the above. No fabricated numbers.
