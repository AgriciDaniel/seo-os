---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: question
title: "Open Questions for {{client_name}}"
created: 2026-05-04
updated: 2026-05-04
tags:
  - questions
  - blocking
  - day-zero
status: needed
related:
  - "[[Recovery Scope and Expectations]]"
  - "[[Start Here]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Verifier Cadence]]"
  - "[[Business Type Overlay]]"
sources: []
---

# Open Questions for {{client_name}}

Concrete blocking questions {{owner}} needs {{client_name}} to answer before or during Day 0. Each question has an owner action implied. None of these are optional for the sprint to proceed cleanly. Answers belong in `[[Log]]` with date.

## Access and Tooling

1. **GSC**: is the domain property verified for `{{site_url}}` (and the `www`/non-www and http/https variants)? Can {{client_name}} export the 16-month query report and the 16-month pages report?
2. **GA4**: is GA4 active on the site? What was the historical traffic peak (sessions and page views)? Can {{client_name}} export historical monthly summaries?
3. **Monetization platform**: dashboard access confirmed for the active monetization surface(s)? What's the current 90-day average for the primary revenue metric (RPM for affiliate-content / display; conversion rate for lead-gen / SaaS; AOV for ecommerce; subscriber growth rate for publisher-news)?
4. **CMS**: what platform is the site on (WordPress, Webflow, custom, headless)? What plugins are active (especially SEO, schema, redirect, image, lead-capture, e-commerce)? Does {{client_name}} have admin-level access?
5. **Hosting and CDN**: who is the hosting provider? Is there a CDN (Cloudflare, BunnyCDN, etc.)? Are there edge cache rules that might affect deploy/refresh visibility?
6. **DNS**: who controls DNS? Who manages redirects (host, CDN, plugin)?

## Monetization and Compliance

7. **Active revenue surfaces**: list every monetization stream live on the site today (affiliate networks enrolled in, ad networks running, lead-capture forms, paywalls, e-commerce checkout, etc.). Are sponsored / affiliate disclosures up to current FTC guidance per [[Affiliate Disclosure Standards]] (or business-type-equivalent)?
8. **Manual actions**: any in GSC ever (currently or historically)? Any current Security Issues?
9. **DataForSEO**: will {{client_name}} provide an API key for ongoing SERP work, or run the audit without paid SERP data? Cost-benefit varies — flag in answer. The marketing-brain skill already used DataForSEO for the initial baseline pull.

## Scope and Content History

10. **Other sites**: should {{client_name}}'s other sites come into scope later? What is each one's niche? — out of scope for this 30-day sprint regardless. Recording for future planning.
11. **Author bio / named expert**: is there an existing About page with a real bio and photos? If not, can {{client_name}} draft one with verifiable practice history (specific contexts, dates, outcomes, credentials)?
12. **Original asset library**: how much original photography / screenshots / case-study material does {{client_name}} have, roughly how organized, and where is it stored? This is a load-bearing E-E-A-T input.
13. **Content history**: roughly how many URLs total? Rough split across content vertical (per the active business-type overlay)? Year of first publish?

## Process and Cadence

14. **Scope confirmation**: does {{client_name}} accept the recovery / growth scope and the explicit no-promise on traffic numbers per [[Recovery Scope and Expectations]]? Acknowledgement recorded in [[Log]].
15. **Cadence**: how often will {{client_name}} and {{owner}} sync? Async (DM / email) only, weekly call, ad-hoc as blockers appear? Set a default per [[Verifier Cadence]] and adjust.

## Format

Answer in [[Log]] as a dated entry per question or batched. {{owner}} will move confirmed answers into the relevant decision/audit notes and mark the question as resolved here.

## Why These Are Blocking

- 1-3 gate the diagnostic phase entirely.
- 4-6 gate the technical fix and redirect phases.
- 7 gates the disclosure audit.
- 8 changes the entire posture if a manual action exists.
- 9 affects what [[Claude SEO Install and First Audit]] can do on day one.
- 10-13 shape the prune and refresh budget.
- 14-15 keep the relationship working.

## Business-Type-Specific Questions

The active business-type overlay at `[[Business Type Overlay]]` may add additional blocking questions specific to the vertical (e.g., GBP access for local-services; product feed for ecommerce; CRM access for lead-gen; CMS publishing system for publisher-news). Read the overlay's "Measurement Focus" and "Required Infrastructure" sections; any infrastructure named there but not in the list above gets added.
