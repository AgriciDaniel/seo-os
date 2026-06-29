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
title: "PAA Mining Digest"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - paa
  - serp
  - related-searches
status: pending
related:
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
sources:
  - "DataForSEO SERP endpoint with people_also_ask + related_searches elements (pending)"
---

# PAA Mining Digest

**Status: pending.** People-Also-Ask and related-searches digest for the top 100 highest-volume keywords surfaced in [[DataForSEO Keyword Exports]]. The marketing-brain skill's `mine_paa_serps.py` runs the DataForSEO SERP endpoint with `people_also_ask` and `related_searches` SERP elements enabled, then aggregates the results into this note.

## Why PAA Mining

- **PAA questions** are the canonical "what users actually ask" mapped directly to a keyword. They are the highest-leverage source of FAQ section content and information-gain opportunities.
- **Related searches** are Google's expansion of the keyword universe. They surface adjacencies the head-term research misses.
- Both are zero-cost differentiators: every page can include them, but most sites do not.

## Per-Keyword Digest

For each of the top 100 keywords:

- **Primary keyword**: the seed.
- **PAA questions**: the 4-8 questions Google surfaced in PAA for this seed.
- **Related searches**: the 6-10 query expansions Google surfaced.
- **Page assignment**: which {{site_url}} page (per [[Keyword to URL Map]]) should own the FAQ answers.

To be filled by the skill. Schema:

| Seed Keyword | PAA Questions | Related Searches | Owner Page |
| --- | --- | --- | --- |
| TBD | TBD | TBD | TBD |

## Aggregate Patterns

The skill summarizes recurring patterns across the 100-seed pull:

- **Most common question stems** (e.g., "how to", "best", "vs", "near me") — informs page-template selection.
- **Most common related-search modifiers** (e.g., year, location, persona) — informs internal-link planning.
- **Question clusters that map to a single new page** — a candidate hero-page topic surfaces when 5+ different seeds all PAA the same underlying question with no canonical answer on the SERP.

## How This Feeds the Sprint

- [[Days 13-18 Top Pages Refresh]] — every refreshed page adds an FAQ section answering at least 3 PAA questions for its primary keyword.
- [[Days 19-24 New Hero Content and Information Gain]] — net-new pages target the question clusters that surface as recurring PAA patterns with no canonical SERP answer.
- [[SERP-First Content Creation Gate]] — every new page brief cites the relevant PAA + related-search rows from this digest.

## Refresh Trigger

Re-run quarterly alongside the DataForSEO baseline refresh, or whenever a major Google update changes SERP composition.
