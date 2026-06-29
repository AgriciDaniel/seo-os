---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: entity
title: "Google Analytics 4"
created: 2026-05-04
updated: 2026-05-04
tags:
  - google
  - ga4
  - measurement
  - conversion
status: needed
related:
  - "[[{{site_brand}}]]"
  - "[[Google Search Console]]"
  - "[[Booking Attribution Plan]]"
  - "[[Dual Surface Scorecard]]"
  - "[[Open Questions for {{client_name}}]]"
sources: []
aliases:
  - "GA4"
  - "Analytics"
---

# Google Analytics 4

Secondary measurement source for {{site_brand}}. GA4 owns conversion event tracking, on-site engagement, and the per-cluster booking / lead / signup pivot consumed by [[Dual Surface Scorecard]]. GSC owns the visibility layer (impressions, clicks, average position); GA4 owns the engagement and conversion layer downstream.

## Required Access

- Edit access to the GA4 property serving `{{site_url}}`.
- Confirm property ID and stream ID match the live site.
- Confirm Consent Mode v2 is configured if the audience includes EU / Canada / California traffic.

## Critical Configuration

- **Conversion events** named per [[Booking Attribution Plan]] (or the business-type-equivalent decision note). Common names: `lead_form_submit`, `phone_click`, `email_click`, `external_referral`, `trial_signup`, `purchase`, `add_to_cart` — the active business-type overlay names which apply.
- **Custom audience**: "Visitors who converted" — used for retargeting and conversion-path analysis.
- **Saved exploration**: "Conversions by cluster" — pivots conversion events by `source_url` mapped to the cannibalization clusters in [[Site Inventory and Cannibalization Map]].
- **UTM convention** documented — `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`. Set baseline before any campaigns run.

## Required Exports for Day 0

- 90-day session and engagement trend, segmented by traffic source (organic / direct / referral / paid / email / social).
- Year-over-year traffic comparison if the property has 12+ months of data.
- Conversion event volume by event name (90-day rolling).
- Per-page engagement rate for top 20 pages by traffic.

## Privacy Note

- Do not paste GA4 admin credentials into wiki notes.
- Do not commit GA4 measurement-protocol API secrets.
- GA4 collects PII only via configured custom dimensions — confirm none are inadvertently capturing raw email/phone/IP.

## Limitations

- GA4 sampling kicks in on high-traffic explorations; use the standard reports or BigQuery export when sampling distorts the answer.
- Bounce rate is deprecated in GA4; use engagement rate instead.
- Attribution model defaults to data-driven; for marketing-mix work, also pull last-click and first-click for comparison.
