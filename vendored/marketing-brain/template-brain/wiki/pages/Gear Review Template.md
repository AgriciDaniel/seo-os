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
title: "Gear Review Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - gear-review
  - affiliate
  - eeat
status: template
related:
  - "[[Pillar Page Template]]"
  - "[[Location Guide Template]]"
  - "[[Affiliate Disclosure Standards]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "US FTC Endorsement Guides"
  - "Google Quality Rater Guidelines"
---

# Gear Review Template

Canonical structure for honest gear reviews (e.g., "Best Steelhead Float Rods Under $300"). Used primarily by the **affiliate-content** business-type overlay. Gear reviews are the highest-monetization pages on most affiliate sites and therefore the highest-risk for HCU demotion if they read as monetization-first rather than helpful-first. This template inverts the usual gear-review failure mode by making the disclosure, the testing log, and the honest negatives non-optional.

## Recommended Outline

1. Disclosure block first — visible, above the fold, before any affiliate link. See [[Affiliate Disclosure Standards]].
2. Buyer Intent statement — who this guide is for, who it is NOT for, what budget tier, what use case.
3. What I Tested — list of products tested, with dates, conditions, and use cases for each.
4. Comparison Table — at-a-glance specs and prices; affiliate links live here.
5. Per-Product Pros, Cons, Best For — honest negatives required; no product gets only pros.
6. My Top Pick — single rec with rationale tied to the testing log.
7. Honorable Mentions — products that nearly made the top pick.
8. "Skip these" — products tested that do not meet the bar, with rationale.
9. Borrow-Before-You-Buy or non-affiliate alternative — at least one path that doesn't require a purchase via the site.
10. FAQ — from People Also Ask plus genuine reader questions.
11. Author bio at end with link to About page.

## Required E-E-A-T Signals

- Real testing photos showing the gear in use — fish caught with the rod, fly tied with the materials, etc.
- Dated testing log (a sentence or short table per product: "tested March 2024 in 4C water").
- Honest negatives — every product gets at least one real "Cons" item from actual use.
- A "Skip these" section — proves the review is not just monetization-driven.

## Schema

- `Article` (required) with author, datePublished, dateModified.
- `Product` for each product reviewed.
- `Review` with HONEST `aggregateRating` only when based on real testing — never fabricate counts.
  - If only the named expert reviewed it, `reviewCount: 1`, `Review.author: <expert>`.
  - If reviewBody contradicts on-page content, fix one of them.
- See [[Affiliate Disclosure Standards]] for schema honesty rules.

## Affiliate Hygiene

Every gear review passes through these checks before publish:

- All affiliate links carry `rel="sponsored nofollow"`.
- Disclosure block placement verified.
- Schema verified to match on-page content.
- No inflated reviewCount or aggregateRating.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — current SERP rewards comparison/list-style gear pages at this query.
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- E-E-A-T signals above are present, not aspirational.
- All products listed have actually been tested by the named expert — no untested products in any list.
- CWV check passes per [[Monetization Density Guardrails]].

## Anti-pattern

Round-up pages that compile competitor reviews without firsthand testing. These are the canonical HCU target. If the named expert can't say "I used this in [context] in [date]", the product is not in the review.
