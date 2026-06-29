---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "HCU Recovery Framework"
created: 2026-05-04
updated: 2026-05-04
tags:
  - hcu
  - recovery
  - framework
status: active
related:
  - "[[Google Helpful Content System]]"
  - "[[Content Pruning and Consolidation]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Information Gain]]"
  - "[[FLOW Framework]]"
  - "[[What Not To Do]]"
sources:
  - "[[Google Helpful Content System]]"
aliases:
  - "Recovery Framework"
  - "HCU Playbook"
---

# HCU Recovery Framework

The operational model for moving a site out of [[Google Helpful Content System|HCU]] suppression — or, more generally, any algorithmic quality demotion. Six steps, in order. None can be skipped.

This framework applies even when the site is not formally in recovery — every "growth" sprint is a "recovery from invisibility" sprint, and the same diagnose-then-publish posture wins.

## The Six Steps

1. **Diagnose** — Pull [[Google Search Console]] 16-month performance. Identify pages with the largest impression and click drops (or, for greenfield: pages that have any impressions at all). Segment by content vertical. Year-over-year comparison only — see [[Seasonal Search Demand]].
2. **Cluster** — Group dropped (or low-performing) pages by intent and topic. Map to verticals. Identify cannibalizing pairs and orphan topics.
3. **Triage per page** — Assign one of: **Keep / Rewrite / Merge / Redirect / Delete-and-410**. The 410-and-redirect rate often needs to be material — a recovered site is usually a smaller site. Decision tree lives in [[Content Pruning and Consolidation]].
4. **Rebuild** — Refresh kept pages with real evidence: original proof, dated practice logs, accurate time-sensitive data, internal linking from related survivors. No cosmetic edits. See [[Information Gain]].
5. **Trust signals** — Visible author bio with credentials, real proof artifacts, dated content updates ("last verified: 2026-04-12"), transparent monetization disclosure, ad density that does not bury content. See [[E-E-A-T for {{site_type}}]] and [[Monetization Density Guardrails]].
6. **Patience** — Helpful Content recovery typically only realizes at the next core update window. No premature pivots. No "it didn't work after 30 days" rewrites.

## Counter-intuitive Truths

- **Less is more.** Removing pages beats adding pages for HCU recovery.
- **Removing beats adding.** A 410 on a thin page does more than a fresh post.
- **Recovery realizes in jumps, not curves.** Expect a flat line followed by a step change at a core update — or no change, in which case round 2 of pruning.

## Anti-patterns

- Cosmetic edits — changing dates, swapping intro paragraphs, inserting "updated 2026" badges with no real change.
- AI rewriting at scale — Google detects this pattern and the trust deficit deepens.
- Dropping monetization to "look helpful" while changing nothing substantive — the system reads structure and language, not link counts.

See [[What Not To Do]] for the full list.

## Measurement Cadence

- **Weekly** — impressions and clicks tracking, segmented by content cluster.
- **Monthly** — business metrics per [[Dual Surface Scorecard]] (revenue / leads / signups, depending on business type).
- **Quarterly** — site-wide trust review (author signals, disclosure, ad density, page count vs indexed count).
