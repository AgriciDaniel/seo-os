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
type: decision
title: "Content Pruning Decision Framework"
created: 2026-05-04
updated: 2026-05-04
tags:
  - decision
  - pruning
  - content-audit
status: accepted
related:
  - "[[Days 6-12 Content Audit and Prune]]"
  - "[[Content Pruning and Consolidation]]"
  - "[[HCU Diagnostic Checklist]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "[[Recovery Scope and Expectations]]"
  - "[[Pre-Audit Hypothesis]]"
---

# Content Pruning Decision Framework

The operational decision tree applied per URL during the audit and prune phase. Every URL that exists today must end up in one of five buckets. No URL stays in limbo. This framework is the contract that [[Days 6-12 Content Audit and Prune]] and [[Content Pruning and Consolidation]] execute against.

## Decision Tree per URL

- **KEEP**: on-niche, factually current, traffic above threshold OR seasonal page with peak window approaching, has unique information gain or can be refreshed to add it. Default to KEEP only when the page already meets the bar — do not KEEP out of inertia.
- **REWRITE**: on-niche but factually outdated or thin; the primary keyword still has search demand and the current SERP intent matches what the page is trying to be. Rewrite must add original evidence (dated proof, named specifics, real artifacts).
- **MERGE then 301**: two or more URLs target the same intent. Pick the canonical owner (usually the strongest authority or best historical traffic), 301 the others to it, consolidate the best content into the survivor.
- **301 REDIRECT**: the page is being removed but a substantially similar surviving page exists. Redirect to the closest topical match. Never blanket-redirect to the homepage — that signals a quality dump and can amplify trust drag.
- **410 GONE**: off-niche, low-quality, no surviving topical home. Intentionally signal removal. 410 is the right tool when there is nowhere honest to redirect to.

## Decision Inputs

For each URL, gather:

- Impressions and clicks over GSC's full 16-month window (year-over-year, not month-over-month).
- Current average position for the page's primary query.
- Intent match: does the current SERP top 10 match what this page is trying to be? If not, the page is structurally misaligned regardless of content quality.
- Unique information gain present (Y/N) — content the SERP top 10 does not already say.
- Content age and last meaningful update.
- Monetization (per business type — affiliate links, ad density, lead-form, product schema, comparison content).
- {{client_name}}'s confidence in factual accuracy (regulations, prices, dates, technical claims).

## Documentation Required

Per URL, save a `[[content-prune-decision]]` template instance to `wiki/decisions/prunes/` (subfolder created during execution of the prune phase). Each instance records the URL, the bucket assigned, the inputs above, the rationale, and the date executed. This creates an auditable history if {{client_name}} later questions a removal or a redirect.

## Anti-pattern

Using `noindex` as a long-term substitute for pruning. A noindexed page still exists, still consumes crawl budget, still contributes to site-wide quality assessment in some interpretations of the algorithm. Noindex is acceptable as a short-term holding pattern only — within the sprint, every noindexed page must be resolved to one of the five buckets above.

## Related

- Inputs feed from [[HCU Diagnostic Checklist]] and the loss-map produced by [[Days 1-5 GSC Diagnostic and Triage]].
- Ownership conflicts resolved through [[Keyword Cannibalization Ledger]].
- Scope authority from [[Recovery Scope and Expectations]].
