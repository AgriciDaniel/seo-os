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
title: "Monetization Density Guardrails"
created: 2026-05-04
updated: 2026-05-04
tags:
  - decision
  - monetization
  - cwv
status: accepted
related:
  - "[[Affiliate Disclosure Standards]]"
  - "[[HCU Diagnostic Checklist]]"
  - "[[Pre-Audit Hypothesis]]"
  - "[[Business Type Overlay]]"
sources:
  - "Google Core Web Vitals documentation"
  - "Active business-type overlay"
---

# Monetization Density Guardrails

Monetization elements (display ads, affiliate slots, lead-capture forms, product upsells, comparison-table CTAs, trial popups — depending on business type) are revenue, but they are also a quality signal. Heavy density that pushes content below the fold or hurts Core Web Vitals is one of the signals HCU classifiers are tuned to. This decision protects the trust signal first and treats monetization yield as a constraint, not the optimization target.

The specific monetization elements vary by business type — the active overlay at `[[Business Type Overlay]]` defines what counts as a "monetization element" for this vertical.

## Density Rules

Universal across business types:

- Monetization elements must NOT push primary content below the fold on mobile.
- Reserved placeholder space is required for every dynamic element to prevent CLS (Cumulative Layout Shift).
- Sticky / anchor / overlay elements are disabled if they obscure the primary CTA, the disclosure block, or in-content navigation.
- In-content monetization must respect a minimum reading-block height between insertions — no two monetization elements inside a single 300-word block.
- If the monetization platform suggests a placement that violates these rules, the rule wins. Document the override in `[[Log]]`.

## Test Cadence

- Run PageSpeed Insights (PSI) on the top 10 pages weekly during the sprint.
- If any Core Web Vital metric (LCP, INP, CLS) moves to "needs improvement" or "poor" on field data, immediately reduce monetization density on the affected pages and re-test.
- Document all adjustments in `[[Log]]` with before/after PSI scores.
- Use field data (CrUX) over lab data when available — field data is what Google ranks on.

## Per-Business-Type Specifics

- **Affiliate / Display ads** — see Ezoic / AdSense / Mediavine guidance via the affiliate-content overlay.
- **Lead-capture forms** — see lead-gen-b2b overlay; forms count as monetization elements for CLS / fold purposes.
- **Product upsells / comparison CTAs** — see ecommerce overlay; these belong inside dedicated comparison or upsell blocks, not interrupting narrative.
- **Trial / signup popups** — see SaaS overlay; popups must respect Google's intrusive interstitial guidelines on mobile (no full-screen popups on first scroll).
- **Sponsored content** — see publisher-news overlay; sponsored posts are clearly labeled per FTC / advertising standards.

## Yield Tradeoff

- Short-term yield gains from heavy density that hurt CWV are a long-term trust loss.
- Protect the trust signal first; let yield normalize as recovery / growth progresses.
- If {{client_name}} observes a temporary yield dip after density reduction, that is expected and acceptable — recovery is the bigger prize.
- Re-evaluate monetization density after the next core update reassesses the site.

## Owner and Verifier

- Owner: {{client_name}} (monetization platform dashboard, placement decisions).
- Verifier: {{owner}} (PSI weekly check during sprint, sanity check on monetization platform recommendations).
- Escalation: any persistent CWV regression after density reduction triggers a hosting / CDN / infrastructure review (see [[Open Questions for {{client_name}}]]).
