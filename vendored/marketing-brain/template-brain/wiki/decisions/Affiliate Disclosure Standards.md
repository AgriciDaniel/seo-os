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
type: decision
title: "Affiliate Disclosure Standards"
created: 2026-05-04
updated: 2026-05-04
tags:
  - decision
  - affiliate
  - disclosure
  - eeat
status: accepted
related:
  - "[[Gear Review Template]]"
  - "[[Product Page Template]]"
  - "[[Comparison Page Template]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Business Type Overlay]]"
sources:
  - "US FTC Endorsement Guides"
  - "Canadian Competition Bureau guidance"
  - "EU Unfair Commercial Practices Directive"
---

# Affiliate Disclosure Standards

Hidden monetization is one of the clearest signals quality raters and the HCU classifier are tuned to detect. This decision sets the disclosure bar for every page on `{{site_url}}` that contains an affiliate link.

If the active business-type overlay is **not** affiliate-content, this decision still applies wherever affiliate links appear (even one) — but the overlay may swap in a complementary disclosure standard (e.g., "Lead Capture Disclosure" for lead-gen sites that capture personal data; "Sponsored Content Disclosure" for publisher-news sites that run sponsored articles). Read the overlay first.

## Required Format

A visible, plain-language disclosure appears above the fold and BEFORE the first affiliate link on the page. Example wording:

> "This page contains affiliate links. If you buy through these links, this site may earn a small commission at no extra cost to you. The products below are recommended only when they have been actually used / tested by the named expert."

Wording may be adapted page-to-page but must keep three properties: it identifies the relationship, it is in plain language, and it makes a credibility claim only when true (only the "actually used / tested" sentence if the named expert has actually used the product).

## Placement

- Top of the page, in a standalone visible block.
- NOT buried in the footer.
- NOT hidden behind a Terms or Privacy link.
- NOT collapsed inside an accordion that requires interaction to read.
- On long-form pages, repeat near the comparison table or "My Top Pick" section as a courtesy.

## Per-Link Hygiene

- Every affiliate link carries `rel="sponsored nofollow"`.
- `target="_blank"` is fine but not required.
- Link text is descriptive, not "click here".
- Deep links to specific products preferred over generic store landing pages.

## Schema Honesty

- No fabricated `aggregateRating`. If the named expert has not collected real reviews, the field is omitted entirely.
- No inflated `reviewCount`. If only the expert reviewed it, `reviewCount` is 1 and the `Review` author is the expert.
- `Review` schema requires a real author identity, a real `datePublished`, and a `reviewBody` that matches the on-page content.
- See [[Gear Review Template]] for the canonical schema pattern.

## FTC and International Reference

- US FTC Endorsement Guides as the baseline standard — most audiences include US visitors, and the FTC standard is the strictest commonly-cited bar.
- Canadian Competition Bureau guidance for Canadian audiences.
- EU Unfair Commercial Practices Directive for EU audiences.
- When standards diverge, follow the stricter rule.

## Why

- HCU and the quality rater guidelines both penalize hidden monetization intent and content that exists primarily to monetize rather than to help.
- Visible disclosure signals editorial honesty and helps establish the trust signal {{client_name}} is trying to build / recover.
- Consistent disclosure across the site is also a site-wide quality signal — inconsistent disclosure looks like the site is hiding monetization on some pages.

## Owner and Verifier

- Owner: {{client_name}} (executes on every affiliate page).
- Verifier: {{owner}} (spot-checks during refresh phase).
- Audit cadence: every refreshed or rewritten page passes through this standard before publish.
