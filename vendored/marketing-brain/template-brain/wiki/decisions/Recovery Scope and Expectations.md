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
title: "Recovery Scope and Expectations"
created: 2026-05-04
updated: 2026-05-04
tags:
  - decision
  - expectations
status: accepted
related:
  - "[[30-Day Sprint]]"
  - "[[Pre-Audit Hypothesis]]"
  - "[[Open Questions for {{client_name}}]]"
  - "[[Business Type Overlay]]"
sources: []
---

# Recovery Scope and Expectations

This decision sets the boundary for what the [[30-Day Sprint]] will and will not promise. Whether the framing is "recovery" (post-algorithmic-demotion) or "growth" (greenfield / near-greenfield) — set by the active business-type overlay at `[[Business Type Overlay]]` — the same guardrails apply: improvement is real, but visible payoff usually does not arrive on a 30-day clock. Setting expectations early prevents bad mid-sprint decisions like cosmetic refreshes chasing weekly traffic deltas.

## Scope

- One site only: `{{site_url}}`.
- Any other sites {{client_name}} owns are explicitly out of scope for this sprint, regardless of niche or condition.
- Time horizon: a 30-day operational sprint covering diagnostic, prune, refresh, and the start of a publishing cadence.
- Monetization in scope: the existing revenue surfaces (per the active business-type overlay). No new monetization layers introduced during the sprint.

## Goal

- (Recovery posture) Recover the trust signal demoted by HCU. Restore impressions and clicks back toward the prior-peak baseline as Google re-evaluates the site.
- (Growth posture) Establish topical authority on the site's named pillars. Push the highest-EV winnable keywords from invisibility into top-20 / top-10.
- Protect the active monetization surface through the prune and refresh phases — do not break monetization while fixing quality.
- Establish E-E-A-T signals (author identity, real evidence, honest disclosures) that survive future core updates.

## Explicitly NOT Promised

- No specific traffic numbers (sessions, clicks, impressions).
- No specific timeline for full recovery / full launch — Google's update cadence is not under our control.
- No guaranteed rankings on any keyword.
- No promise that pruning will not cause a temporary impressions dip before recovery — short-term loss is sometimes the price of removing trust drag.

## Why

- Recovery and early growth dynamics are fundamentally different from "publish and rank". Sites that have been algorithmically demoted often see fixes accumulate without visible movement until the next core update reassesses site-level quality signals. Greenfield sites face a credibility cold-start that domain-rating and impression curves do not show in real time.
- Over-promising specific numbers erodes trust between {{client_name}} and {{owner}} and pushes the work toward cosmetic refreshes that look productive but do not address the underlying trust drag.
- Honest scope-setting upfront also gives {{client_name}} permission to prune aggressively when the audit calls for it, instead of hoarding off-niche pages out of fear of losing residual traffic.

## Acceptance

{{client_name}} acknowledges this scope before the sprint starts. Acknowledgement recorded in `[[Log]]` with date.

## Related

- Operational decision tree: [[Content Pruning Decision Framework]]
- Hypothesis driving the diagnostic: [[Pre-Audit Hypothesis]]
- Onboarding sequence {{client_name}} follows: [[Start Here]]
