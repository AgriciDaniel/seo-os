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
title: "Keyword to URL Map"
created: 2026-05-04
updated: 2026-05-04
tags:
  - decision
  - keywords
  - cannibalization
status: seed
related:
  - "[[Keyword Targets and Page Map]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Site Inventory and Cannibalization Map]]"
sources:
  - "[[Keyword Targets and Page Map]]"
  - "[[Competitor Landscape Cache]]"
  - "[[DataForSEO Keyword Exports]]"
---

# Keyword to URL Map

The accepted mapping derived from [[Keyword Targets and Page Map]]. This is the **source of truth** that [[Keyword Cannibalization Ledger]] enforces. Every entry is an accepted owner-URL allocation. Action dates are TBD pending sprint execution.

**Status: seed.** Populated by the marketing-brain skill from the dedup'd keyword XLSX + the DataForSEO ranked-keywords data. The skill assigns one canonical owner URL per primary keyword and flags satellites for MERGE / REDIRECT.

## Map

| Primary Keyword | Canonical Owner URL | Satellites to Merge / Redirect | Action Date |
| --- | --- | --- | --- |
| TBD | TBD | TBD | TBD |

## Decision Log

- {{date}} — Initial map seeded by skill from the DataForSEO ranked-keywords pull and the dedup'd XLSX. Owner choices for any cluster requiring GSC traffic data are flagged TBD-pending-GSC and resolved during [[Days 1-5 GSC Diagnostic and Triage]].

## Maintenance

Update this map any time a 301 redirect, merge, or new publish changes ownership. Stale rows are worse than missing rows because they create conflicting decisions.
