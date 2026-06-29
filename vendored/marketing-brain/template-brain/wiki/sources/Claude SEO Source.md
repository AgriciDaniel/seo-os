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
title: "Claude SEO Source"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - tool
status: active
related:
  - "[[Claude SEO Install and First Audit]]"
  - "[[FLOW Framework]]"
  - "[[Tool Limitations]]"
sources:
  - "github.com/AgriciDaniel/claude-seo"
aliases:
  - claude-seo
  - claude seo
---

# Claude SEO Source

`claude-seo` is an optional SEO audit companion that can run live SEO audits referenced throughout this brain. Marketing Brain can also use Codex SEO skills, Screaming Frog, Sitebulb, GSC exports, or another trusted audit source.

## What It Does

- Crawls a site (up to 500 pages) respecting `robots.txt`.
- Detects business type and dispatches specialist sub-agents: `seo-technical`, `seo-content`, `seo-schema`, `seo-sitemap`, `seo-performance`, `seo-visual`, `seo-geo`, `seo-local`, `seo-google`, `seo-backlinks`, `seo-dataforseo`.
- Aggregates an SEO Health Score (0-100) and a prioritized action plan (Critical / High / Medium / Low).
- Optionally enriches with live data: DataForSEO MCP (SERP, keyword, backlinks), Google Search Console (indexation, search performance), Google PageSpeed Insights / CrUX (Core Web Vitals field data), Moz / Bing Webmaster (backlinks).

## How {{client_name}} Uses It

Per [[Start Here]] and [[Claude SEO Install and First Audit]]:

1. Install or open the SEO audit layer you trust.
2. Run an audit for `{{site_url}}` and let it complete.
3. Save the report into `.raw/sources/audits/audit-N-YYYY-MM-DD.md`.
4. Triage findings into Critical / Important / Nice-to-have.
5. Repeat at least 3 times — the standard pattern is "run, fix, repeat".
6. Once the audit stabilizes, review [[FLOW Framework]] and synthesize the plan.

## How It Integrates with marketing-brain

The SEO audit layer supplies technical evidence. `marketing-brain` is the strategic synthesizer and vault. The flow:

1. `marketing-brain` scaffolds the vault and runs the DataForSEO research pipeline.
2. The vault recommends running a technical SEO audit inside [[Day 0 Measurement Access Gate]].
3. Audit reports land in `.raw/sources/audits/` and feed the [[Pre-Audit Hypothesis]] / [[Current Site Findings]] update.
4. The [[ULTIMATE BEAST Plan]] cites the audit source as recurring evidence throughout the 30-day sprint.

## Limitations to Note

See [[Tool Limitations]]. Audit quality depends on which APIs are connected. With no DataForSEO key, competitor SERP data falls back to web-search and is less precise. With no GSC OAuth, indexation diagnostics rely on inference rather than property data.
