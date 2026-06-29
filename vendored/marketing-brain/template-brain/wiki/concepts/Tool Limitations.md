---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "Tool Limitations"
created: 2026-05-04
updated: 2026-05-04
tags:
  - limitations
  - tools
  - measurement
status: active
related:
  - "[[Google Search Console]]"
  - "[[Google Analytics 4]]"
  - "[[HCU Recovery Framework]]"
  - "[[What Not To Do]]"
  - "[[Claude SEO Source|Claude SEO]]"
sources: []
aliases:
  - "Limitations"
---

# Tool Limitations

Every recommendation in this brain is advisory until verified against live data and {{client_name}}'s confirmation. Below are the known limitations of the tools the audit will rely on.

## claude-seo

- Optional audit skill/tool. Quality of the audit depends on {{client_name}} configuring API access.
- Required: DataForSEO API key, [[Google Search Console]] OAuth, optionally PageSpeed Insights API.
- If no API access is configured, the audit falls back to qualitative checks (on-page review, structural inventory) and cannot quantify SERP position, search volume, or backlink profile.

## DataForSEO

- Paid API; per-call cost. Track in cost log.
- Returns SERP and keyword data — useful but not perfect.
- Sample sizes vary by locale. Some country-specific data is shallower than US data — keyword volumes for long-tail regional queries may be reported as 0 even when the query has real traffic.
- SERP data is a snapshot at the time of the call; positions move daily.
- Always preserve the SERP timestamp, location, language, device, and depth in the export.

## GSC

- 16-month rolling window only. Data older than 16 months is gone unless previously exported.
- **Sampled query data when traffic is high** — top queries are reported, long-tail "(other)" bucket can be material on a hobby site or any site with many low-volume queries.
- The "(other)" bucket is opaque; cannot be drilled into.
- URL Inspection API has daily quotas.
- Performance data lags by ~2-3 days.

## Ad Network / Monetization Analytics

- Proprietary metrics; not directly comparable to GA4 or GSC.
- Session and revenue attribution definitions differ from other analytics platforms.
- Useful for trend analysis; treat absolute numbers as platform-internal.

## AI Generation

- Cannot replace verifiable practice for niches whose moat is real experience.
- Using AI to write expertise-claiming copy is detectable and risks further [[Google Helpful Content System|HCU]] drag.
- AI is acceptable for: outlining, fact-checking against sources, draft polish on human-authored content, structured data generation.
- AI is NOT acceptable for: generating pillar pages, location guides, gear reviews, case studies, or anything that asserts experience.
- See [[What Not To Do]].

## This Brain

- Built before any audit data exists for {{site_url}}.
- Every page count, traffic figure, competitor name, and revenue number is TBD pending audit.
- Recommendations are strategic kernels, not operational instructions.
- Anything claimed here that is contradicted by live data must be updated — the brain is wrong, not the data.
