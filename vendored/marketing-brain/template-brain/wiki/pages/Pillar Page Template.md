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
type: page-brief
title: "Pillar Page Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - pillar
  - eeat
status: template
related:
  - "[[Gear Review Template]]"
  - "[[Location Guide Template]]"
  - "[[Service Page Template]]"
  - "[[Product Page Template]]"
  - "[[Comparison Page Template]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Topical Authority for Niche Sites]]"
sources:
  - "Google Quality Rater Guidelines"
---

# Pillar Page Template

The generic pillar-page structure. Works for any business type — pillar pages are the canonical owners of a topic cluster regardless of vertical.

When the business type calls for a more specific structure, use the per-type template instead ([[Gear Review Template]], [[Location Guide Template]], [[Service Page Template]], [[Product Page Template]], [[Comparison Page Template]]).

## Recommended Outline

1. Hero — a 1-2 sentence promise + an original visual (photo / screenshot / artifact). The visual proves the page is not generic.
2. Quick Answer / TL;DR — 2-3 sentence answer to the primary search query. The first thing AI Overviews can extract.
3. Topic Definition — what the topic is, who it's for, what's in / out of scope. Anchors the rest of the page and helps with topical-authority signals.
4. Sub-topic Sections — 4-8 H2 sections, each linking out to a deeper sub-topic page (the "spokes" in [[Topical Authority for Niche Sites|hub-and-spoke]]). Each section is 200-400 words: enough to stand on its own, with a clear wikilink to the deeper guide.
5. Real Practice / Evidence Section — dated proof: case study, photo log, screenshot, deliverable. The information-gain hook.
6. FAQ — drawn from People Also Ask in the current SERP plus genuine reader questions. Cite [[PAA Mining Digest]] when the FAQs are skill-sourced.
7. Internal Link Cluster — explicit list of related guides, sub-topic pages, and supporting content. Every spoke linked at least once.
8. Author bio block at end — name, photo, brief practice history, link to About page.

## Required E-E-A-T Signals

- Original visual at the top (photo / screenshot / case-study artifact).
- Named expert author with verifiable credentials (per [[E-E-A-T for {{site_type}}]]).
- Dated practice / verification timestamps.
- At least one piece of original primary data, original observation, or original artifact the SERP top 10 lacks.

## Required Information Gain

At least 3 items not present in the current SERP top 10. Examples:

- Original primary data (survey result, benchmark, audit finding).
- Time-stamped practice log specific to {{niche}}.
- Visual proof (photo / screenshot / video).
- Specificity (named tools, named outcomes) that competitors keep generic.
- Failure modes or honest negatives.

## Schema

- `Article` (required) with author, datePublished, dateModified, image (original artifact).
- `FAQPage` for the FAQ section.
- `BreadcrumbList` for site navigation.
- Vertical-specific schema per business-type overlay (e.g., `HowTo` for technique-heavy pillars; `Product` if commercial; `Service` if lead-gen).

## Internal Links

- Every named sub-topic links out to its dedicated page.
- Link UP to the topic hub if this pillar is one of several pillars on a parent topic.
- Link DOWN to specific guides, products, or case studies where they form the natural reader journey.
- Use Obsidian display-text wikilink syntax for internal links so the displayed anchor matches the on-page voice while the wikilink resolves to the canonical owner.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — page type matches current SERP intent.
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- All E-E-A-T signals listed above are present, not aspirational.
- Disclosure block present per [[Affiliate Disclosure Standards]] (or business-type equivalent) if any monetization is included.
- CWV check passes per [[Monetization Density Guardrails]].
