---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "Seasonal Search Demand"
created: 2026-05-04
updated: 2026-05-04
tags:
  - seasonality
  - demand
  - measurement
status: active
related:
  - "[[{{site_brand}}]]"
  - "[[HCU Recovery Framework]]"
  - "[[Google Search Console]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Seasonal Keyword Playbook]]"
sources: []
aliases:
  - "Seasonality"
---

# Seasonal Search Demand

Many niches have seasonal search demand. Misreading the cycle leads to publishing at the wrong time, refreshing at the wrong time, and worst of all, misdiagnosing recovery (or lack of it) by comparing month-over-month traffic in a seasonal niche.

## Why It Matters

- Publishing a peak-season guide six months before the season leaves money on the table for a quarter; publishing four weeks before catches the rising tide.
- Refreshing a time-sensitive page after the peak misses the demand wave; refreshing 4-6 weeks before the peak hits it.
- A "20% traffic drop month-over-month" in an off-season month may be entirely seasonal and have nothing to do with recovery progress.

## {{niche}} Demand Cycle

To be filled by the active business-type overlay or by [[Seasonal Keyword Playbook]] once {{client_name}}'s GSC data lands. Generic categories:

- **Peak demand windows** — the 1-3 windows per year when search volume spikes for the niche.
- **Trough windows** — when volume bottoms out and refresh investment has lowest expected return.
- **Year-round evergreen** — pages whose demand doesn't cycle (foundational reference content).

The marketing-brain skill's research pipeline pulls year-over-year volume curves where DataForSEO data supports it.

## Implication For Refresh Cadence

- Refresh seasonal pages **4-6 weeks BEFORE** the peak demand window.
- Refreshing during the peak window is too late to be re-crawled, re-evaluated, and ranked in time.

## Implication For Measurement

- **Year-over-year comparison is required.** Month-over-month is misleading in seasonal niches.
- Compare the same calendar window across years (e.g., April 2026 vs April 2025 vs April 2024).
- The 16-month [[Google Search Console]] window covers exactly one year-over-year comparison plus prior peak. Pull and store before the window rolls.
- Segment by content cluster when comparing — a YoY drop in one cluster is different from a YoY drop in another.

## Source of Truth

Where time-sensitive facts live (regulations, prices, schedules) is niche-specific. The active business-type overlay should name the canonical source(s); refresh cycles re-verify against that source on every refresh.
