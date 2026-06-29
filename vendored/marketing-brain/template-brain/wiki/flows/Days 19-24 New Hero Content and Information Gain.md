---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Days 19-24 New Hero Content and Information Gain"
created: 2026-05-04
updated: 2026-05-04
tags:
  - new-content
  - hero-pages
  - information-gain
  - topical-authority
status: pending-day-0
shipping_status: "pending-prior-flows"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "2-4 hero pages published"
  - "Each page has a completed brief from the relevant template"
  - "Each page passed [[SERP-First Content Creation Gate]] before drafting"
  - "Each page has at least 3 documented information gain items vs current SERP top 10"
rollback_plan: "Each new page can be unpublished or 410'd independently. Cannibalization Ledger reservation can be released."
related:
  - "[[30-Day Sprint]]"
  - "[[Days 13-18 Top Pages Refresh]]"
  - "[[Days 25-30 E-E-A-T and Author Signals]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Pillar Page Template]]"
sources: []
---

# Days 19-24 New Hero Content and Information Gain

First new content publishing window of the sprint. Hero pages only — not bulk content.

## Goal

Publish 2-4 new hero pages that cover real topical gaps with verifiable information gain. The constraint is deliberate: HCU recovery is incompatible with bulk content. Two excellent pages outperform twenty average ones.

## Selection

Use the coverage gap audit in [[Topical Authority for Niche Sites]] to identify missing canonical pages. The active business-type overlay at `[[Business Type Overlay]]` names the strongest candidate categories for this vertical.

Avoid: anything {{client_name}} (or the named expert) hasn't personally practiced or verified. The information gain bar requires evidence the team can produce.

## Required Pre-Flight

Every new page MUST pass these gates BEFORE drafting:

1. [[SERP-First Content Creation Gate]] — full sequence, including DataForSEO SERP capture and intent classification.
2. Reserve the primary keyword to the planned URL in [[Keyword Cannibalization Ledger]].

If either gate fails or is uncertain, do NOT draft the page. Move the slot to a different topic.

## Per-Page Build

Use the appropriate template from `wiki/pages/`:

- [[Pillar Page Template]] — the generic pillar structure; works for any business type.
- [[Gear Review Template]] — affiliate variant.
- [[Location Guide Template]] — local SEO + affiliate variants.
- [[Service Page Template]] — lead-gen + local SEO variants.
- [[Product Page Template]] — e-commerce variant.
- [[Comparison Page Template]] — SaaS variant.

Minimum information gain bar: at least 3 items the current SERP top 10 does not have.

Document each information gain item in the brief — what it is, why the SERP top 10 lacks it, where the evidence lives.

## Owner / Verifier

Owner: {{client_name}} (sprint owner, drafting and publishing). On-the-ground evidence: the named expert (photos, logs, tested artifacts). Verifier: {{owner}} (gate compliance, information gain audit, schema and link hygiene).

## Acceptance

2-4 hero pages published with completed brief templates. Information gain documented per page (minimum 3 items). All pre-flight gates passed and evidenced in the brief.

## Rollback

Each new page can be unpublished, 301'd, or 410'd independently if it underperforms or attracts a quality issue. Cannibalization Ledger reservation can be released if the slot is reassigned.
