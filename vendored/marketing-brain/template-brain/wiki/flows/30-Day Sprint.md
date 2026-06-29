---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "30-Day Sprint"
created: 2026-05-04
updated: 2026-05-04
tags:
  - flow
  - sprint
status: active
shipping_status: "pending-verification"
owner: "{{client_name}}"
verifier: "{{owner}}"
related:
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[FLOW Framework]]"
  - "[[Start Here]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Image and Page Speed Workflow]]"
  - "[[Implementation Roadmap]]"
sources:
  - "[[Pre-Audit Hypothesis]]"
---

# 30-Day Sprint

Master sprint document. The framing — recovery vs growth — is set by the active business-type overlay at `[[Business Type Overlay]]`. Whichever framing applies, the sequence is the same: diagnose, prune, refresh, publish narrowly, rebuild trust.

## Sequence

0. [[Day 0 Measurement Access Gate]]
1. [[Claude SEO Install and First Audit]]
2. [[Days 1-5 GSC Diagnostic and Triage]]
3. [[Days 6-12 Content Audit and Prune]]
4. [[Days 13-18 Top Pages Refresh]]
5. [[Days 19-24 New Hero Content and Information Gain]]
6. [[Days 25-30 E-E-A-T and Author Signals]]

Cross-cutting workflows that run inside the sprint:

- [[SERP-First Content Creation Gate]]
- [[Image and Page Speed Workflow]]
- [[Distributed Presence Workflow]]

## Pre-Sprint Posture

Diagnose before publishing. Prune before refreshing. Refresh before publishing new. Rebuild trust signals last.

The instinct to "publish more" is the wrong instinct in almost every starting state — recovery posture (where adding pages compounds the trust deficit) and growth posture (where the site lacks the topical depth to support new pages without first reinforcing the foundation) both punish premature publishing.

The sprint sequence is deliberate. Do not skip ahead.

## Success Targets

- Impressions trend up vs YoY for kept pages (recovery posture) or up vs prior 28-day window (growth posture).
- Click-through rate stable or up for kept pages.
- Core Web Vitals all in the "good" band on field data (PSI/CrUX).
- Monetization-surface metric stable or up — no revenue regression from cleanup. The specific metric depends on business type (Ezoic RPM for affiliate-content; lead-form conversion rate for lead-gen; trial-signup rate for SaaS; etc.).
- No Manual Actions in GSC.
- Prune ratio measurable and documented (e.g. "X% of pages pruned, merged, or 410'd").
- Per-page information gain documented for every refreshed and new hero page.

## Anti-Targets

- Do NOT promise specific traffic recovery numbers. Recovery typically realizes at the next core update window, not on a 30-day clock.
- Do NOT publish bulk thin content during the sprint.
- Do NOT cosmetic-only refresh (date-bumping with no information gain — see [[Days 13-18 Top Pages Refresh]] anti-pattern).
- Do NOT chase a "recovered by day 30" narrative — the sprint produces the conditions for recovery; the algorithm decides the timing.

## Shipping Status

Status: pending-verification.

The sprint cannot start until [[Day 0 Measurement Access Gate]] passes. Every required access item, baseline export, and API key decision must be confirmed and evidenced before any execution flow runs.
