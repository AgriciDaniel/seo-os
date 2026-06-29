---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Hot"
created: {{date}}
updated: {{date}}
tags:
  - hot-cache
  - marketing-brain
status: active
related:
  - "[[Overview]]"
  - "[[Start Here]]"
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Implementation Roadmap]]"
  - "[[Open Questions for {{client_name}}]]"
sources:
  - "[[FLOW Framework]]"
aliases:
  - Hot
---

# Hot

## Last Updated

{{date}}

## Key Recent Facts

This vault was scaffolded from the `marketing-brain` template on {{date}} for **{{client_name}}** and the website **{{site_url}}** ({{niche}}). The active business-type overlay is `[[Business Type Overlay]]` — read it to anchor revenue model, content priority, measurement focus, and anti-pattern guardrails before any other note.

Every cell in [[Dual Surface Scorecard]], every quantitative claim in [[Pre-Audit Hypothesis]] / [[Current Site Findings]], and every cluster recommendation in [[Site Inventory and Cannibalization Map]] is **TBD pending Day 0**. The skill (or {{owner}} manually) will populate them as the 6-step research pipeline runs and {{client_name}} grants access to GSC, analytics, ad-network, and CMS.

## Recent Changes

- {{date}} — Vault scaffolded from `marketing-brain` template. Business-type overlay applied: `{{business_type}}`. Placeholders filled. `.raw/.manifest.json` initialized.

## Active Threads

1. **[[Day 0 Measurement Access Gate]]** — connect GSC, GA4, ad networks, CMS, hosting/DNS, and any business-type-specific surfaces (GBP for local-SEO, booking system for lead-gen, product feed for e-commerce). Until this gate closes, every recommendation in this brain is advisory.
2. **[[Open Questions for {{client_name}}]]** — 15 blocking questions covering measurement access, monetization mix, content history, author bio, photo/proof inventory, and cadence preferences. Answers belong in [[Log]].
3. **[[Claude SEO Install and First Audit]]** — run the selected SEO audit layer against `{{site_url}}`; save the report to `.raw/sources/audits/audit-1-{{date}}.md`; triage findings (Critical / Important / Nice-to-have); repeat until critical findings stabilize.
4. **[[Pre-Audit Hypothesis]]** — read it now to know what the audit is looking for. Treat it as a starting net to disconfirm, not a verdict.
5. **[[ULTIMATE BEAST Plan]]** — empty template. `marketing-brain synthesize --vault <path>` fills it after the research pipeline completes (find competitors → pull keywords → dedup XLSX → mine PAA → synthesize the plan).

For any new content request, start with [[SERP-First Content Creation Gate]] and pause if SERP data is unavailable.

## Status Note

This brain is a strategic scaffold. All ranking, traffic, and revenue claims remain TBD until {{client_name}} connects measurement and runs the first technical audit. No ranking, traffic, or revenue outcomes are promised. The job is to diagnose, prune (where applicable), rebuild, measure, and let the next Google update window catch up.
