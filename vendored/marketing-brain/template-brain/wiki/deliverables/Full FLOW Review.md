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
title: "Full FLOW Review"
created: 2026-05-04
updated: 2026-05-04
tags:
  - deliverable
  - flow
  - review
status: seed
related:
  - "[[FLOW Framework]]"
  - "[[HCU Recovery Framework]]"
  - "[[Implementation Roadmap]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Current Site Findings]]"
  - "[[Competitor Landscape Cache]]"
  - "[[Competitor Keyword Research Summary]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Recovery Scope and Expectations]]"
  - "[[Days 25-30 E-E-A-T and Author Signals]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Information Gain]]"
  - "[[ULTIMATE BEAST Plan]]"
sources:
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Current Site Findings]]"
  - "[[Competitor Landscape Cache]]"
  - "[[DataForSEO Keyword Exports]]"
  - "[[PAA Mining Digest]]"
---

# Full FLOW Review

The integrated FLOW (Find / Leverage / Optimize / Win) review applied to `{{site_url}}`. Per [[FLOW Framework]], each leg is scored against verified state, not aspiration. Per [[shipping-rules]], every claim below is traced to either the URL inventory, the parsed HTML, the DataForSEO data, or the SERP research. Numerical and ranking claims are marked TBD pending GSC export and DataForSEO pulls.

**Status: seed.** Skill fills.

## Find — What the Site Needs From Search

**Status**: TBD pending DataForSEO baseline + GSC reconciliation.

Activities to complete:

- Inventory cataloged in [[Site Inventory and Cannibalization Map]] with vertical and cannibalization-cluster assignments.
- Cannibalization clusters identified.
- Tier 1 competitors confirmed via SERP and DataForSEO `competitors_domain` data.
- GSC loss-query export pending — gates [[Days 1-5 GSC Diagnostic and Triage]].
- DataForSEO ranked-keywords pull complete — see [[DataForSEO Keyword Exports]].
- Position bucket distribution captured.

To be filled with the actual findings.

## Leverage — Off-Site Corroboration

**Status**: under-leveraged (default for sites at the start of a sprint).

Activities to complete:

- Catalog the named expert's external proof (publications, podcast appearances, conference talks, social presence, mentions on authoritative sites).
- Confirm trust artifacts — verifiable bio, dated practice history, real artifacts the expert has produced.
- Inventory current off-site footprint per [[Distributed Presence Workflow]].
- Plan and execute site-wide author bio rollout per [[Days 25-30 E-E-A-T and Author Signals]].

To be filled with the actual inventory + plan.

## Optimize — Owned-Page Improvements

**Status**: TBD pending site fetch + audit.

Activities to complete:

- Identify content depth assets (substantial pillar pages worth defending and refreshing).
- Identify critical technical gaps (missing H1s, broken canonicals, schema errors).
- Identify structural cannibalization (cluster consolidation decisions in [[Site Inventory and Cannibalization Map]]).
- Identify off-niche dilution.
- Identify stale year markers on commercial / time-sensitive content.
- Verify internal-linking density in CMS.
- Execute the consolidation and refresh plan via [[Implementation Roadmap]].

To be filled.

## Win — Connecting Visibility to Outcomes

**Status**: monetization model defined per active business-type overlay; measurement TBD pending Day 0.

Activities to complete:

- Document the active monetization surfaces per [[Business Type Overlay]].
- Confirm conversion event setup per [[Booking Attribution Plan]] (lead-gen overlay) or the equivalent decision per business type.
- Confirm GA4 per-cluster pivot is configured per [[Dual Surface Scorecard]].
- Capture baselines for every metric in [[Dual Surface Scorecard]] (impressions, clicks, CWV pass rate, monetization-surface metric, conversion event volume per cluster).

To be filled.

## Cross-Cutting Risk Register

To be filled by skill. Common categories:

- HCU recovery realizes at the next core update window — set {{client_name}}'s expectations per [[Recovery Scope and Expectations]].
- Internal-link parser false negatives — verify in CMS before treating as a major issue.
- Seasonal sequencing — peak windows compress refresh cadence.
- Author identity questions — relationship between owner and named expert needs clarification if they differ.
- Competitor refresh cadence — Tier 1 competitors actively refreshing means we can't stand still.
- Cannibalization at scale — failure to execute cluster consolidations leaves most upside unrealized.

## Confidence Calibration

Per [[shipping-rules]], all agent-produced findings are advisory until verified. Sources for every claim land in:

- URL inventory: `.raw/sources/sitemap-urls.txt` (skill captures during scaffold).
- Page-level structural facts: direct fetch and parse output, documented in [[Current Site Findings]].
- Author identification: site fetch + SERP description.
- Tech stack: direct response headers and HTML inspection.
- Competitor list: SERP research + DataForSEO `competitors_domain` data.
- Numerical/ranking claims: DataForSEO `ranked_keywords` + GSC export. Until both land, every numerical claim is TBD.
