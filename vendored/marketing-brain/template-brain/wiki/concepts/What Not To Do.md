---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "What Not To Do"
created: 2026-05-04
updated: 2026-05-04
tags:
  - guardrails
  - risk
  - anti-patterns
status: active
related:
  - "[[HCU Recovery Framework]]"
  - "[[Google Helpful Content System]]"
  - "[[Affiliate Disclosure Standards]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Tool Limitations]]"
  - "[[Log]]"
sources: []
aliases:
  - "Anti-patterns"
  - "Guardrails"
---

# What Not To Do

Explicit anti-patterns for {{site_url}}. These are not preferences — they are tripwires that compound the [[Google Helpful Content System|HCU]] signal or trigger adjacent penalties (link spam, deceptive practices, structured data abuse).

## Content

- Do not mass-publish AI-generated pillar / guide / case-study content. AI-bulk patterns are a reliable HCU trigger.
- Do not refresh pages cosmetically — changing dates, swapping intro paragraphs, inserting "updated 2026" badges — without adding real [[Information Gain]].
- Do not compete with yourself by publishing variant pages targeting the same primary keyword. Cannibalization is read as low-quality output.
- Do not chase generic high-volume terms before owning the regional / vertical core.

## Monetization

- Do not increase ad density to chase short-term RPM at the cost of [[Monetization Density Guardrails|Core Web Vitals]].
- Do not bury or obscure monetization disclosure to "look more editorial". The disclosure is a trust signal, not a tax.
- Do not fabricate aggregate review counts or product ratings in schema. Schema fabrication is detected.

## Privacy and Safety

- Do not strip private metadata only after publishing — strip **before**. Once private data is public, it cannot be unpublished.
- Honour any niche-specific privacy / safety conventions in published content (specifics live in the active business-type overlay).

## Technical

- Do not delete pages without a redirect map and CMS revision backup. Pruning is reversible only with effort.
- Do not noindex as a long-term prune substitute. Noindex does not remove the site-wide trust drag — see [[Content Pruning and Consolidation]].
- Do not buy links, scrape competitor content, or use private blog networks. The HCU and link-spam systems compound penalties — a site already in HCU suppression that catches a link-spam action is much harder to recover.

## Process

- Do not promise {{client_name}} specific traffic recovery numbers or timelines. Recovery is non-deterministic and tied to core update windows.
- Do not run any "fix" without recording it in [[Log]] so we can correlate with later GSC data. Untracked changes destroy the ability to learn from the recovery.
- Do not skip the [[Google Search Console]] baseline export. Every diagnostic depends on it.

## Cred Safety

- Do not paste API keys, OAuth tokens, ad-network auth, or CMS-admin passwords into wiki notes. Use environment variables; rotate after one-off pulls.
- Do not commit any `.env` file to git. The `.gitignore` template ships with `.env` and `.raw/sources/dataforseo/` excluded.
