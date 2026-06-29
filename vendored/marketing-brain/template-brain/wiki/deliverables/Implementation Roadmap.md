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
title: "Implementation Roadmap"
created: 2026-05-04
updated: 2026-05-04
tags:
  - deliverable
  - roadmap
  - 30-day-sprint
status: seed
related:
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Days 6-12 Content Audit and Prune]]"
  - "[[Days 13-18 Top Pages Refresh]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
  - "[[Days 25-30 E-E-A-T and Author Signals]]"
  - "[[30-Day Sprint]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Current Site Findings]]"
  - "[[Pre-Audit Hypothesis]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[ULTIMATE BEAST Plan]]"
sources:
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Current Site Findings]]"
  - "[[Competitor Landscape Cache]]"
---

# Implementation Roadmap

## Header Note

This roadmap assumes **Day 0 starts the day {{client_name}} completes [[Day 0 Measurement Access Gate]]**. All downstream dates shift if Day 0 slips. Days are working-days indicative, not strict calendar days — if {{client_name}} is part-time, the calendar window stretches accordingly.

Owner per slice is named below. Verifier is {{owner}} for every slice unless otherwise specified. Acceptance criteria carry from each linked flow.

**Status: seed.** Skill fills the per-day specifics from the populated [[Site Inventory and Cannibalization Map]], [[Current Site Findings]], and [[Keyword Targets and Page Map]]. The structure below is the empty schema.

## Day 0 — Measurement Access

**Flow**: [[Day 0 Measurement Access Gate]]

- Connect Google Search Console; export 16-month performance data (queries, pages, dates).
- Capture monetization-surface baseline (per business type — Ezoic / GA4 e-commerce / lead-gen system / trial-signup analytics).
- Capture affiliate / partner / network baselines as applicable.
- Save raw exports + screenshots into `.raw/sources/day0/`.

Owner: {{client_name}}. Until this gate closes, every recommendation in this brain is advisory.

## Day 0 + 1 — Claude SEO Install (parallel)

**Flow**: [[Claude SEO Install and First Audit]]

- Install `claude-seo`.
- Run `/seo-audit` against `{{site_url}}`.
- Save report to `.raw/sources/day0/seo-audit-1.md`.
- Re-run 2 more times across days 1-5 to capture variance and confirm consistent findings.

Owner: {{client_name}} (with {{owner}} scaffolding). Parallel to GSC export — does not block the loss-map work.

## Days 1-5 — GSC Diagnostic and Triage

**Flow**: [[Days 1-5 GSC Diagnostic and Triage]]

- Build the loss map: top losing queries + URLs (impressions/clicks delta vs prior 16 months).
- Refine [[Pre-Audit Hypothesis]] against actual loss data.
- Validate [[Site Inventory and Cannibalization Map]] against GSC: confirm which URLs in each cannibalization cluster actually receive impressions, and which were always zero.
- Resolve TBD-pending-GSC owner choices in [[Site Inventory and Cannibalization Map]] and [[Keyword Targets and Page Map]].
- Run **critical-fix tickets in parallel** during this slice (do not wait for the audit-and-prune phase) — typically: missing H1s, slug typos, broken canonicals, schema errors. Specifics filled by skill from [[Current Site Findings]].

Owner: {{owner}} (analysis), {{client_name}} (CMS fixes).

## Days 6-12 — Content Audit and Prune

**Flow**: [[Days 6-12 Content Audit and Prune]]

- Execute cluster consolidation decisions from [[Site Inventory and Cannibalization Map]] — designate canonical owners; reassign spoke primary keywords in [[Keyword Cannibalization Ledger]]; merge overlapping URLs.
- Prune off-niche / low-quality / 410-candidate URLs.
- Build the **redirect map** with old URL → new URL mapping. Implement 301s/410s in batches; verify each with `curl -I` and update GSC re-submission queue.
- Update internal links throughout the site to point at canonical URLs (not the merged ones).

Owner: {{client_name}} (CMS execution), {{owner}} (verification).

## Days 13-18 — Top Pages Refresh

**Flow**: [[Days 13-18 Top Pages Refresh]]

- Refresh the 8-15 highest-leverage surviving pages (priority order = highest-impressions losers from Days 1-5 GSC analysis + Tier 2 + Tier 3 from [[Keyword Targets and Page Map]]).
- Apply [[Image and Page Speed Workflow]] per page.
- Add named-expert author block to every refreshed page.

Owner: {{client_name}} (with named expert input on first-person passages and proof artifacts).

## Days 19-24 — New Hero Content and Information Gain

**Flow**: [[Days 19-24 New Hero Content and Information Gain]]

- Publish 2-4 new hero pages targeting Tier 5 net-new opportunities from [[Keyword Targets and Page Map]].
- Each MUST pass [[SERP-First Content Creation Gate]] before publish.
- Confirm spokes link back; confirm pillar links into spokes.

Owner: {{client_name}} + named expert.

## Days 25-30 — E-E-A-T and Author Signals

**Flow**: [[Days 25-30 E-E-A-T and Author Signals]]

- Site-wide named-expert author bio rollout — every kept content page gets the author block.
- Rebuild About page profiling the named expert.
- Publish Editorial Standards page (review process, fact-check policy, monetization disclosure summary).
- Schema audit — confirm no fabricated `Review` or `AggregateRating` fields anywhere on the site.
- Resubmit sitemap to GSC.
- Request re-indexing for top 20 URLs via GSC URL Inspection.
- Final 30-day measurement check-in: GSC impressions/clicks delta by cluster, monetization-surface trend, conversion event volume per [[Booking Attribution Plan]].

Owner: {{client_name}} + {{owner}}.

## Critical Fixes — Ship Early, Not Late

Critical-tier fixes from [[Current Site Findings]] ship inside Days 1-5 alongside the diagnostic, NOT waiting for the late phases. To be filled by skill from the populated findings.

## Measurement Check-Ins

- **Weekly**: GSC impressions/clicks tracked at the cluster level.
- **Monthly**: monetization-surface trend per [[Dual Surface Scorecard]].
- **End of Day 30**: full review per [[Days 25-30 E-E-A-T and Author Signals]] + summary back to [[Hot]] and [[Log]].

## Carry-Forward Notes

- HCU recovery typically realizes at the next Google core update window. Per [[Recovery Scope and Expectations]], do not promise a date — set {{client_name}}'s expectations correctly.
- The internal-link parser flagging 0 links per page is a common false negative — verify in CMS during Days 6-12 before treating as a major issue.
- Seasonal sequencing matters per [[Seasonal Search Demand]] — schedule peak-window refreshes 4-6 weeks ahead of demand.
