---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Distributed Presence Workflow"
created: 2026-05-04
updated: 2026-05-04
tags:
  - flow
  - leverage
  - distributed-presence
status: active
shipping_status: "pending-input"
related:
  - "[[FLOW Framework]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[HCU Recovery Framework]]"
  - "[[Dual Surface Scorecard]]"
  - "[[Days 25-30 E-E-A-T and Author Signals]]"
  - "[[Business Type Overlay]]"
---

# Distributed Presence Workflow

## 1. Purpose

Off-site corroboration is the load-bearing recovery / growth lever. A site is not trusted because of a generic business directory entry; it is trusted because the named expert is cited by other practitioners, regulators, and authoritative voices in the niche. This workflow operationalizes the Leverage stage of `[[FLOW Framework]]` by activating the off-site categories specific to {{niche}} per the active business-type overlay.

## 2. Cadence

This is NOT a 30-day-sprint flow. This is an ongoing monthly cadence that begins on Day 0 and continues indefinitely. The initial inventory plus the first outreach round happens inside the 30-day sprint (alongside `[[Days 1-5 GSC Diagnostic and Triage]]` and `[[Days 25-30 E-E-A-T and Author Signals]]`); sustained execution continues afterward at the monthly rhythm defined below.

## 3. Three Workstreams

Specifics are defined by the active business-type overlay at `[[Business Type Overlay]]`. The structure is consistent across verticals:

### 3a. Community presence (value-first, no spam)

- Identify 3-5 active niche communities (subreddits, forums, Discord servers, LinkedIn groups, Slack communities — depending on niche).
- Posting policy: respond to other people's questions with genuinely useful answers from the named expert's expertise, without linking back to the site by default. Build credibility first.
- Anti-pattern: link-dropping, self-promotion, "check out my site" replies. Communities ban this fast and the brand suffers.
- Cadence: 2-3 meaningful engagements per week per active community. Track every one.

### 3b. Creator / publication collaboration

- Identify 5-10 niche-relevant creators (YouTube channels, podcasts, newsletters, industry publications) and pursue guest appearances, quote contributions, or collaboration content where the topic aligns with the named expert's stated expertise.
- Provide a 1-paragraph bio plus 3-5 verifiable credentials plus 1-2 high-quality original photos / artifacts as a media kit.
- Anti-pattern: cold pitch with no value-fit, generic "guest appearance" template emails, mass outreach.
- Cadence: 2-4 outreach attempts per month; track responses, conversions, and links/citations earned.

### 3c. Authority citations

- Goal: get cited by the niche's canonical authority sources — regulators, industry bodies, well-known publications, partner brands. These are HIGH-trust links that strongly counteract HCU drag per `[[HCU Recovery Framework]]`.
- Pursuit pattern: identify pages on these properties that link out to relevant resources; ensure {{site_url}} has the canonical resource for what they would link to; reach out via the property's editorial contact when {{client_name}}'s resource is genuinely the best fit.
- Anti-pattern: scraping these properties for backlink contacts at scale, or citation-stuffing techniques. These properties detect and ignore.
- Cadence: 1-2 targeted citation pursuits per month.

## 4. Measurement

Every earned link or community citation is logged with date, source URL, anchor text (if a link), and the destination page on {{site_url}}. The aggregate count and per-class deltas roll up to `[[Dual Surface Scorecard]]` as a Leverage indicator. Monthly review compares delta to the acceptance threshold below.

## 5. What This Workflow Does NOT Do

- Generic business directory citations (Yelp, Yellow Pages, generic "submit your site" services) — defensibly out of scope unless the active business-type overlay specifically calls them out (the local-SEO-services overlay is the one exception — it does call for NAP-consistent citations on local directories).
- Paid links of any kind (per `[[CODEX]]` operating rules).
- Reciprocal-link schemes, link exchanges.
- Private blog network (PBN) placements.
- Mass cold outreach using templated pitches.

## 6. Owner / Verifier / Acceptance / Rollback

- **Owner**: {{client_name}} (or the named expert if different — assigned per the active overlay).
- **Verifier**: {{owner}} (monthly review of earned-link / citation deltas).
- **Acceptance**: monthly delta of at least 3 logged community engagements (3a) plus at least 1 outreach attempt (3b) plus at least 1 citation pursuit (3c); tracking artifact updated within the same month; any new earned link reflected in `[[Dual Surface Scorecard]]`.
- **Rollback**: if a community ban or penalty occurs, retreat from that community immediately, document the lesson, and pause outreach in adjacent communities until the lesson is internalized. Brand-safe and reversible — no on-site change to undo.

## 7. Cross-references

- `[[FLOW Framework]]` — parent framework, Leverage stage adaptation.
- `[[E-E-A-T for {{site_type}}]]` — why Authoritativeness signals matter post-HCU.
- `[[HCU Recovery Framework]]` — recovery mechanism this workflow feeds.
- `[[Dual Surface Scorecard]]` — measurement rollup.
- `[[Days 25-30 E-E-A-T and Author Signals]]` — on-site author-block rollout that surfaces these external signals via `Person` schema sameAs.
- `[[Business Type Overlay]]` — the overlay that names the specific communities, publications, and authority sources for this vertical.
