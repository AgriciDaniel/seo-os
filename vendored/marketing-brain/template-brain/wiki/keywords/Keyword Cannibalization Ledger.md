---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
surface: organic-search
funnel_stage: ""
impact_score: 0
effort_score: 0
type: keyword-strategy
title: "Keyword Cannibalization Ledger"
created: 2026-05-04
updated: 2026-05-04
tags:
  - keywords
  - cannibalization
  - content-governance
status: seed
related:
  - "[[Keyword Strategy Framework]]"
  - "[[Keyword Targets and Page Map]]"
  - "[[Seasonal Keyword Playbook]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Content Pruning Decision Framework]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Days 6-12 Content Audit and Prune]]"
sources:
  - "DataForSEO ranked_keywords pull (pending)"
  - "GSC 16-month query export (pending)"
---

# Keyword Cannibalization Ledger

The primary-keyword-to-URL ledger that prevents two pages competing for the same intent. Cannibalization is one of the most common self-inflicted ranking problems in mature sites: years of publishing produce multiple pages targeting the same query, none of them able to fully own the SERP. This ledger is the contract that prevents new cannibalization and the audit lens that finds existing cannibalization.

## Rule

Every primary keyword maps to exactly ONE canonical owner URL. Supporting pages may use the keyword in body copy, FAQs, or natural internal anchors back to the owner page — but never in the title, H1, slug, primary CTA, or first-paragraph keyword target. Violations of this rule are documented, then resolved (merge, redirect, or rewrite).

## Process

1. Before drafting any new or refreshed page, check the ledger.
2. If the keyword has an owner, refresh the owner instead of creating a competitor.
3. If the keyword has no owner and the page being drafted is a credible owner, add the row.
4. If two existing URLs both target the same keyword, resolve via [[Content Pruning Decision Framework]] (usually MERGE then 301).

## Ledger

**Status: seed.** Initial population built by the marketing-brain skill from the DataForSEO `ranked_keywords` pull. Volume + position annotations cite the pull. Where two reservations point at the same owner URL they are intentional variant consolidations; where the ranking page is anomalous (gear page winning a technique term, etc.) the row is flagged in Notes for investigation during Days 13-18.

| Primary Keyword | Owner URL | Intent | Last Verified Date | Notes |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |

## Anomalies surfaced (investigate during Days 13-18)

To be filled by skill. Common categories:

- A page winning a query its slug / structure suggests it shouldn't own.
- A head term (high volume) ranked by a tactical / seasonal page rather than the canonical pillar.
- A site's named pillar URL not ranking for its own head term while sub-pages do.
- Sister-site cannibalization (two of {{client_name}}'s domains both ranking for the same intent).

## Process notes

- Each row is reserved on the date the skill or {{client_name}} adds it. Verified date updates whenever the SERP is rechecked.
- Updates required when GSC data lands during [[Days 1-5 GSC Diagnostic and Triage]] — GSC may reveal queries that DataForSEO missed (long tail) and may correct intent classification.
- Whenever a 301 redirect, merge, or new publish changes ownership, update the relevant row's Owner URL and Last Verified Date.
- The "Anomalies" rows are intentional flags for investigation — NOT errors. Each will be resolved when its owning slice runs.

## Maintenance

Update the ledger any time a 301 redirect, merge, or new publish changes ownership. The ledger is meant to be a living document, not a one-time inventory. A stale ledger is worse than no ledger because it becomes a source of conflicting decisions.

## Pre-Publish Checks

Before publishing or refreshing any page, run through:

1. Normalize the planned primary keyword (lowercase, strip punctuation, singular/plural normalize).
2. Search this ledger for exact and near-match variants.
3. Check current SERP intent for the keyword — if the SERP wants a comparison page and the planned page is a guide, the page type is wrong regardless of cannibalization.
4. Confirm planned title, H1, slug, primary CTA, and first paragraph do not duplicate an owner page's targeting.
5. Require any supporting article to link back to the canonical owner with a natural anchor.

## Rules

- If the keyword is `assigned` to an owner, do not create a new URL for the same intent.
- If SERP overlap with an existing keyword is high (top 5 URLs largely overlap), treat the new idea as a section/refresh of the existing page, not a new page.
- Secondary/supporting keywords may appear in body copy, FAQs, captions, and internal anchors — but not in another page's title/H1/slug/primary CTA.
- Change ownership only after evidence (GSC impressions/clicks) shows the new page is the stronger natural landing page.
- Retire stale rows only after documenting the reason in `[[Log]]`.
