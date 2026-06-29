---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "Information Gain"
created: 2026-05-04
updated: 2026-05-04
tags:
  - information-gain
  - content-quality
status: active
related:
  - "[[Google Helpful Content System]]"
  - "[[HCU Recovery Framework]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Topical Authority for Niche Sites]]"
sources: []
aliases:
  - "Info Gain"
---

# Information Gain

Information Gain is what your page adds that the existing top-ranking pages do not. Google increasingly rewards documents that genuinely advance a topic rather than restating the consensus. For a site under recovery (or pursuing growth at scale), every refreshed and new page must clear an explicit information-gain bar — otherwise the work is cosmetic and feeds the [[Google Helpful Content System|HCU]] signal that the site is search-engine-first.

## Definition

Information Gain ≈ the marginal information a document contributes versus the existing corpus available to the searcher. If the top 10 SERP pages all say the same thing and your page says it again, your gain is near zero — even if your version is better written.

## How To Find It

1. Read the top 10 SERP pages for the target query.
2. List every claim, fact, recommendation, and structure each one makes.
3. Identify what is missing across all of them — gaps, contradictions, outdated data, unanswered follow-up questions.
4. Ask what {{client_name}} (or the named expert author) can add from real practice that none of them have.

The output is a short list of additions that would make the page strictly better-informed than any current top-10 result.

## Information Gain Sources by Vertical

The active business-type overlay at `[[Business Type Overlay]]` should name the specific gain sources for this vertical. Generic categories:

- **Original primary data** — surveys, benchmarks, case studies, audits, dated experiments the site ran itself.
- **Time-stamped practice logs** — "as of {{date}}, when we did X, the result was Y, given conditions Z".
- **Visual proof** — photos / screenshots / videos of the actual thing in the actual context (not stock).
- **Specificity** — named tools, named techniques, named locations, named outcomes that the SERP top 10 keep generic.
- **Failure modes / negatives** — "this didn't work, here's why". The SERP top 10 are usually positive-only; honest negatives stand out.
- **Updated facts** — regulation changes, price updates, deprecated features, new platform behavior.

## Anti-pattern

Paraphrasing the existing top results. That is **information loss**, not gain — you lose the specificity of the originals while adding nothing. AI-generated rewrites of competitor content are the canonical anti-pattern and a reliable HCU trigger.

## Test

Before publishing or refreshing a page, name three things on the page that no other top-10 result contains. If you cannot name three, the page is not ready.
