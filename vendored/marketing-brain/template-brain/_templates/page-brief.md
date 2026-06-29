<%*
const title = await tp.system.prompt("Page brief title");
const primaryKeyword = await tp.system.prompt("Primary keyword");
const ownerUrl = await tp.system.prompt("Owner URL (canonical)");
await tp.file.rename(title);
-%>
---
type: page-brief
title: "<% title %>"
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
tags:
  - page-brief
status: draft
shipping_status: "release-impacting"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria: []
rollback_plan: "Restore prior CMS revision."
related:
  - "[[Pillar Page Template]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "[[DataForSEO Keyword Exports]]"
---

# <% title %>

## Target Keyword

- Primary keyword: `<% primaryKeyword %>`
- Same-intent variants:
- Owner URL (canonical): `<% ownerUrl %>`

## Search Intent

- Classification: informational | commercial | transactional | local
- Reasoning:

## SERP Analysis

- Top 10 result types (guides / videos / forum / retailer / comparison):
- Common subtopics covered by competitors:
- Gaps competitors leave open:
- People Also Ask captured (cite [[PAA Mining Digest]]):
- Related searches captured:

## Content Outline

- H1:
- H2:
- H2:
- H2:
- H2: FAQ
- H2: Author trip / case-study log

## Information Gain Items

What this page adds that competitors do not (minimum 3 for a new hero page):

1.
2.
3.

## E-E-A-T Signals

- Author bio block linked
- Verifiable practice / testing evidence: dates, contexts, outcomes
- Citations to canonical sources where relevant
- Last verified date

## Internal Links

- Companion guides:
- Companion product / service / gear pages:

## Schema

- Article (required)
- Vertical-specific schema per active overlay:

## Image Plan

- Hero image:
- In-content images (3-6, named, dated):
- Private metadata stripped checklist (per [[Image and Page Speed Workflow]])
- Alt text drafted per image (descriptive, not stuffed)

## Pre-Flight Checklist

- [ ] [[SERP-First Content Creation Gate]] passed
- [ ] Primary keyword reserved in [[Keyword Cannibalization Ledger]]
- [ ] E-E-A-T signals present, not aspirational
- [ ] CWV check passes per [[Monetization Density Guardrails]]

## Owner / Verifier

Owner: {{client_name}}
Verifier: {{owner}}
