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
title: "Comparison Page Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - comparison
  - saas
  - eeat
status: template
related:
  - "[[Pillar Page Template]]"
  - "[[Service Page Template]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "Google Quality Rater Guidelines"
---

# Comparison Page Template

Canonical structure for "X vs Y" pages and "best alternatives to X" pages. Used primarily by the **SaaS** business-type overlay (where comparison content is the dominant BoFu format) and selectively by **affiliate-content** and **ecommerce** when comparing products.

Comparison pages convert exceptionally well at the bottom of the funnel because they intercept buyers in the active-evaluation stage. They also fail exceptionally hard when they read as marketing-team copy that biases toward "our product wins all categories" — both Google and buyers detect this.

## Recommended Outline

1. Comparison Headline (H1) — clean "X vs Y: <year>" or "Best Alternatives to X for <use case>".
2. TL;DR Comparison — 2-3 sentences naming the actual differentiator. The first thing AI Overviews can extract. **No "they're both great in different ways" hedging** — the SERP penalizes vague comparisons.
3. Feature Comparison Table — clean side-by-side comparison across 8-15 dimensions that actually matter to the buyer (not 50 marginal features). Use checkmarks / values, not vague "yes/depends/it varies".
4. Decision Criteria Section — explicit "choose X if you... / choose Y if you...". Be specific about use cases. **Honest about when the competitor wins.**
5. Per-Tool Deep Dive (one section per tool) — strengths, real limitations, ideal customer profile, pricing.
6. When to Choose Each — explicit recommendation tied to use case. Do NOT recommend "our tool" in every category; that's the failure mode.
7. Migration / Switching Notes — if comparison includes alternatives to the user's current tool, what's involved in switching.
8. Sponsorship Transparency — clearly disclose if the page is published by one of the tools being compared. Buyers need to know which "vs" page they're reading.
9. FAQ — drawn from PAA and from real sales-call questions.
10. Author / Reviewer Bio — the named expert who reviewed the tools, with credentials.

## Required E-E-A-T Signals

- The author actually used both / all tools being compared. The page documents the use period and use case.
- Honest negatives on every tool, including the publisher's own tool if the publisher is one of the comparators.
- Pricing accurate to the date of the comparison (with a "last verified" timestamp).
- Feature claims accurate — no claiming a competitor lacks a feature it has.

## Schema

- `Article` (required) with author, datePublished, dateModified.
- `Review` schema is appropriate per tool reviewed, with honest individual `Review.reviewRating`.
- `aggregateRating` only when based on real review aggregation, not invented.
- `BreadcrumbList`.
- `FAQPage` for the FAQ section.
- `SoftwareApplication` (for SaaS comparisons) per tool.

## Sponsorship Transparency

If the comparison is published by one of the tools being compared:

- Disclose this **above the fold** in plain language: "This comparison is published by <Tool X>. We've tried to be honest about where competitors do better."
- Honest negatives on Tool X are non-negotiable. A "we win every category" page is worse than no comparison page.
- Consider publishing under an "unbiased third party" reviewer name only when that reviewer is genuinely independent — fake third-party voices are detected and penalized.

If the comparison is published by an unrelated affiliate / publisher:

- Disclose the affiliate relationship per [[Affiliate Disclosure Standards]].
- Disclose any sponsored / paid placement in the page comparison.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — SERP for "X vs Y" / "X alternatives" rewards comparison format (vs single-tool review, vs general guide).
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- Author has used all tools being compared.
- Honest negatives present on every tool.
- Pricing verified within the last 30 days.
- Schema validates in Google's Rich Results Test.
- CWV check passes per [[Monetization Density Guardrails]].

## Anti-pattern

- "Our tool wins every category" — the canonical comparison-page failure mode. Buyers see through it; algorithms see through it.
- Comparing your $99/mo tool against a $9/mo tool and concluding "you should pay more". Comparisons must be like-for-like or honestly acknowledge the segment difference.
- Outdated pricing — comparison pages decay faster than other content. Set a refresh cadence (quarterly minimum).
- Fake third-party reviewer voice. The named reviewer must be a real person who actually used the tools.
- Comparing your tool against a competitor that doesn't actually compete (different category, different ICP) just to capture comparison search traffic.
