---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Day 0 Measurement Access Gate"
created: 2026-05-04
updated: 2026-05-04
tags:
  - day-0
  - measurement
  - access
  - gate
status: active
shipping_status: "blocking"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "Every Required Access item confirmed with screenshot or export saved to .raw/sources/day0/"
  - "Every Required Baseline exported and saved to .raw/sources/day0/"
  - "API key decisions documented (keys themselves are NOT pasted in this vault)"
rollback_plan: "Not applicable — this is a measurement gate. Failing the gate keeps the site in current state."
related:
  - "[[30-Day Sprint]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[Pre-Audit Hypothesis]]"
  - "[[Business Type Overlay]]"
sources: []
---

# Day 0 Measurement Access Gate

Status: blocking. The 30-day sprint cannot start until this gate passes.

This is a measurement gate. No site changes happen here — only access confirmation, baseline capture, and API key decisions. Every Critical row must be Pass with evidence attached, or the sprint stays paused.

## Required Access

| Area | Required | Status |
| --- | --- | --- |
| GSC | Verified domain property for `{{site_url}}` (all variants — apex, www, http, https) | Missing |
| GA4 | Edit access on the property serving the site | Missing |
| Monetization platform | Dashboard access for the primary revenue surface (Ezoic / AdSense / Mediavine for ads, Stripe / Shopify for ecommerce, the lead-gen system / CRM for lead-gen, the trial-signup analytics for SaaS) | Missing |
| CMS | Admin access (publish, edit, delete, revision rollback) | Missing |
| Hosting / CDN | Account access for caching, redirects, headers | Missing |
| DNS | Registrar / DNS provider access for any domain-level changes | Missing |
| Asset library | Source-resolution photo / screenshot / case-study library {{client_name}} controls (for refresh and new hero work) | Missing |
| Business-type-specific | See active overlay at `[[Business Type Overlay]]` for any additional surfaces (GBP for local-SEO; product feed for ecommerce; CRM for lead-gen; trial / billing system for SaaS; CMS publishing system for publisher-news) | Missing |

## Required Baselines

Capture each item once and save to `.raw/sources/day0/`. Date-stamp filenames.

- 16-month GSC query export (full date range available).
- GSC pages export with indexation status.
- GSC Core Web Vitals snapshot (mobile and desktop).
- Monetization-surface 90-day trend export (revenue, RPM, conversion rate — depending on business type).
- Current `sitemap.xml` (saved as-is).
- Current `robots.txt` review (saved as-is, with notes on disallows).
- Current internal link inventory (crawl export — Screaming Frog, Sitebulb, or claude-seo crawl).
- Current redirect map (existing 301/302/410 rules from CMS, hosting, and CDN layers).

## Required API Keys for claude-seo

Decisions are documented here. Keys themselves are NEVER pasted into this vault.

| Key | Required? | Notes |
| --- | --- | --- |
| DataForSEO | RECOMMENDED | Needed for SERP preflight in [[SERP-First Content Creation Gate]]. The marketing-brain skill already used DataForSEO for the baseline pull. |
| PageSpeed Insights API | Optional | Speeds up batch CWV checks; not blocking. |
| GSC OAuth | Optional | Enables programmatic GSC export inside claude-seo. Manual export from the GSC UI is acceptable as a fallback. |

## Acceptance

Every Required Access and Required Baseline row has a screenshot or export saved to `.raw/sources/day0/`. API key decisions are documented (yes / no / deferred) with an owner and date.

## Rollback

Not applicable. Failing this gate means the sprint does not start. No site changes have happened yet, so there is nothing to revert.
