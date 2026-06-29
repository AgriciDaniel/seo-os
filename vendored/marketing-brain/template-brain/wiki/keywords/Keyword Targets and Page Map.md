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
title: "Keyword Targets and Page Map"
created: 2026-05-04
updated: 2026-05-04
tags:
  - keywords
  - page-map
status: seed
related:
  - "[[Keyword to URL Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Keyword Strategy Framework]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Competitor Landscape Cache]]"
  - "[[XLSX Structure Reference]]"
  - "[[Opportunity Score Rubric]]"
  - "[[Seasonal Keyword Playbook]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[DataForSEO Keyword Exports]]"
sources:
  - "[[DataForSEO Keyword Exports]]"
---

# Keyword Targets and Page Map

The 5-tier prioritization map for {{client_name}}'s sprint. **Rebuilt by the marketing-brain skill from the DataForSEO ranked-keywords data + the dedup'd XLSX** ([[XLSX Structure Reference]]).

The 5-tier structure is organized by where the page currently sits in the SERP, because the typical sprint job is to defend top-3 wins, push 4-10s into top 3, climb 11-20s into top 10, rescue page-2-to-5 pages with refresh or consolidation, and selectively publish net-new for genuine gaps.

**Status: seed.** Skill fills.

## Tier 1 — Top-3 Wins (defend and reinforce)

Already ranking 1-3 with material volume. Action: **defend** — annual refresh, maintain internal link equity, watch for SERP-feature creep (AI Overviews, People Also Ask).

| Keyword | Volume | Pos | Current URL | Action |
| --- | ---: | ---: | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Tier 2 — Top-10 Push (move 4-10 into top 3)

Already top-10, material volume, single-page lift unlocks meaningful traffic. Action: **refresh + information-gain pass + internal-link push from related top-3 pages**.

| Keyword | Volume | Pos | Current URL | Action |
| --- | ---: | ---: | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Tier 3 — Top-20 Climb (move 11-20 into top 10)

On page 2 with material volume. Action: **substantive refresh** — 30-50% new content, updated SERP analysis, fresh internal links.

| Keyword | Volume | Pos | Current URL | Action |
| --- | ---: | ---: | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Tier 4 — Page-2-to-Page-1 (move 21-50 into top 10)

The largest single tier on most sites. Action: **larger refresh OR new dedicated page** when SERP analysis shows the current owner page intent-mismatches the query.

| Keyword | Volume | Pos | Current URL | Action |
| --- | ---: | ---: | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Tier 5 — Net-new Opportunity (no current ranking)

Surfaced from the domain-intersection gap analysis and the keyword-suggestions pulls. Action: **new dedicated content** after passing [[SERP-First Content Creation Gate]].

- TBD per skill output

## Mapping Rule

Every primary keyword owns **exactly ONE URL** per [[Keyword Cannibalization Ledger]]. Satellites use the keyword in body copy, FAQs, and natural internal anchors back to the owner — but never in title, H1, slug, primary CTA, or first-paragraph keyword target.

## Pre-Publish Gate

Before refreshing or creating any of these target pages, complete [[SERP-First Content Creation Gate]]:

1. Pull live SERP top 10 (the DataForSEO digest already covers the priority keywords; rerun via DataForSEO for any keyword not in that set).
2. Confirm page type matches winners (guide vs list vs comparison vs Q&A vs product).
3. Check intent overlap — if SERP is dominated by government / regulation, do not compete head-to-head; differentiate via guide perspective + real evidence.
4. Confirm primary keyword has a single owner in [[Keyword Cannibalization Ledger]].

## Status

Map is **seed** until the skill runs the 6-step research pipeline. Next refresh trigger: after [[Days 1-5 GSC Diagnostic and Triage]] cross-references this list against GSC loss-query data, OR after the next DataForSEO quarterly refresh, whichever comes first.
