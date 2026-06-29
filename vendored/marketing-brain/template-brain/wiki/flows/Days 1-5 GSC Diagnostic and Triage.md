---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Days 1-5 GSC Diagnostic and Triage"
created: 2026-05-04
updated: 2026-05-04
tags:
  - diagnostic
  - gsc
  - loss-map
  - triage
status: pending-day-0
shipping_status: "pending-prior-flows"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "Loss map complete for every URL with at least 100 impressions in any 28-day window during the 16-month GSC period"
  - "Loss map saved to .raw/sources/day0/loss-map.csv"
  - "First-pass prune candidate list produced"
  - "Pre-Audit Hypothesis updated with actual data replacing TBD entries"
rollback_plan: "Diagnostic phase — no site changes. Outputs are spreadsheets and notes."
related:
  - "[[30-Day Sprint]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[Days 6-12 Content Audit and Prune]]"
  - "[[Pre-Audit Hypothesis]]"
  - "[[Content Pruning Decision Framework]]"
sources:
  - ".raw/sources/day0/"
---

# Days 1-5 GSC Diagnostic and Triage

First measurement-driven phase. Build the loss map (recovery posture) or the visibility map (growth posture).

## Goal

Every URL with material traffic loss vs the prior peak (recovery) — or every URL with any visibility (growth) — is identified, segmented by content vertical, and flagged as a prune candidate or keep candidate. No fixes happen here — this is the data layer the rest of the sprint runs on.

## Activities

1. Export 16-month query data from GSC (saved during [[Day 0 Measurement Access Gate]]).
2. Export top losing pages (largest absolute and largest percentage drop vs prior peak window) for recovery posture, OR top pages with any impressions for growth posture.
3. Cross-reference with current monetization-surface revenue per page if per-page reporting is available (varies by business type).
4. Build the loss-map / visibility-map spreadsheet with these columns:

| Column | Description |
| --- | --- |
| URL | Full URL |
| Content vertical | Pillar / sub-topic / product / service / location / utility (per business type) |
| Peak impressions | Best 28-day window in the 16-month range |
| Current impressions | Most recent 28-day window |
| Peak clicks | Best 28-day window |
| Current clicks | Most recent 28-day window |
| Peak avg position | At peak window |
| Current avg position | Most recent window |
| Monetization type | Per business type (affiliate / display / lead-form / product / trial / etc.) |
| Prune candidate Y/N | First-pass call |

## Diagnostic Questions Per Page

For each URL flagged as a candidate, answer:

- Is this on-niche?
- Is the content factually still accurate (regulations, prices, product availability, dates)?
- Is information gain present vs the current SERP top 10?
- Are there real evidence signals (original photos, dated logs, named specifics, case studies)?
- Is the disclosure visible above the fold (per [[Affiliate Disclosure Standards]] for affiliate sites; equivalent for other business types)?
- Is there a material monetization density issue (ads / lead-capture / popups crowding content)?

A "no" on any of the first three questions is a strong prune signal.

## Outputs

- `loss-map.csv` saved to `.raw/sources/day0/`.
- First-pass prune candidate list (subset of the loss map flagged Y).
- Refreshed [[Pre-Audit Hypothesis]] with actual data replacing TBD entries.

## Owner / Verifier

Owner: {{client_name}}. Verifier: {{owner}}.

## Acceptance

Complete loss map for all URLs with at least 100 impressions in any 28-day window during the 16-month period. Loss map saved. Prune candidate list produced. Pre-Audit Hypothesis updated.

## Rollback

Diagnostic phase only. No site changes to revert.
