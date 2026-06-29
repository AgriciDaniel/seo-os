---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: audit
title: "Pre-Audit Hypothesis"
created: 2026-05-04
updated: 2026-05-04
tags:
  - audit
  - hypothesis
status: seed
related:
  - "[[HCU Diagnostic Checklist]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
sources:
  - "Google Helpful Content Update documentation"
  - "Google Quality Rater Guidelines"
---

# Pre-Audit Hypothesis

## Status

**TBD pending audit.** This note holds the strategic hypothesis BEFORE any data exists for {{site_url}}. It exists so the audit knows what to look for, not to substitute for data. Every claim here is to be confirmed or refuted by the actual diagnostic in [[Days 1-5 GSC Diagnostic and Triage]] and the page-level review in [[Days 6-12 Content Audit and Prune]].

The marketing-brain skill's `vault-synthesizer` subagent will populate this hypothesis with real data after the 6-step research pipeline runs (DataForSEO baseline + competitor pulls + SERP/PAA mining). Until then, the section below is a starting net.

## Hypothesis (initial — to be confirmed or refuted)

The site's traffic posture is one of the following — the audit will resolve which:

- **Recovery posture** — site previously ranked, lost material traffic to a Google update (HCU 2023, March 2024 core, or later). Common cause-net (de-prioritized after data lands):
  - Thin or templated content that reads as filler rather than first-hand reporting.
  - Scraped or AI-rewritten content from competitor sources without unique evidence.
  - Missing or unverifiable author signals (no About page with a real bio, no author block on articles, no proof of practice).
  - Ad / monetization density issues hurting Core Web Vitals.
  - Off-niche content diluting topical authority.
  - Missing original evidence on monetized pages (no dated proof, no named specifics, no testing log).
  - Affiliate / sponsorship disclosure inconsistency or below-FTC-standard placement.
  - Schema fabrication (e.g., aggregateRating where no real reviews exist).
- **Growth posture** — site is greenfield or near-greenfield; the audit will identify which pages should exist and don't, and which keywords are winnable at the site's current authority.
- **Hybrid posture** — partial trust held; substantial keyword footprint exists but cannibalization, page-level demotion, and missing pillar pages explain underperformance versus the realistic ceiling.

The actual posture and cause attribution is **TBD pending audit data**.

## Confirmation Plan

- [[Days 1-5 GSC Diagnostic and Triage]] will identify which content vertical lost the most traffic (recovery posture) or which queries the site has any visibility for (growth posture). Once GSC connects, the dominant pattern declares itself.
- The DataForSEO baseline pull (run by the marketing-brain skill at scaffold time) gives the present-day ranking footprint independent of GSC: count of ranking keywords, position bucket distribution, top quick-win candidates, head terms where the site is invisible.
- The prune phase ([[Days 6-12 Content Audit and Prune]]) will reveal off-niche concentration through inventory categorization.
- A CWV check (PSI on top 10 pages) will reveal whether ad density is part of the picture.
- Manual page review against [[HCU Diagnostic Checklist]] will reveal author/experience signal gaps and disclosure inconsistencies.
- A schema spot-check on monetized pages (gear reviews / product pages / service pages, depending on business type) will reveal fabrication risk.

## Status

Hypothesis-only. All numbers and specific cause attributions are TBD pending:

- [[Claude SEO Install and First Audit]] — first programmatic audit pass via the `claude-seo` skill.
- [[Days 1-5 GSC Diagnostic and Triage]] — GSC export and triage.
- DataForSEO baseline pull (run by the skill).

Once data lands, this note is updated with confirmed/refuted markers per bullet, and the prune and refresh plans are adjusted accordingly.

## Anti-pattern

Treating this hypothesis as fact and acting on it before data lands. Every refresh or prune decision must cite actual diagnostic evidence, not this hypothesis. This note exists to focus the diagnostic, not to replace it.
