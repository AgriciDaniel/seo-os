---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: overview
title: "Overview"
created: 2026-05-04
updated: 2026-05-04
tags:
  - overview
  - marketing-brain
status: active
related:
  - "[[30-Day Sprint]]"
  - "[[Start Here]]"
  - "[[Day 0 Measurement Access Gate]]"
sources:
  - "[[FLOW Framework]]"
aliases:
  - Overview
---

# Overview

This vault is the strategic brain for **{{client_name}}**'s site `{{site_url}}` — a {{niche}} property operating under a **{{business_type}}** revenue model. The job is to diagnose the site's current state, prune what's dragging it down, refresh what's working, publish new hero content where there's a real gap, and connect every visibility surface (rankings, AI mentions, page experience) to a business surface (revenue, leads, trial signups) via the [[Dual Surface Scorecard]].

The work follows the FLOW framework — Find / Leverage / Optimize / Win — adapted to {{business_type}} via the [[business-types/_index|business-type overlay]]. Each FLOW leg has a default 30-day execution path ([[30-Day Sprint]]) and a measurement spine ([[Dual Surface Scorecard]]).

## Posture

The default starting posture is **diagnose before publishing**. Whether this is recovery (post-algorithmic-demotion) or growth (greenfield or near-greenfield), the failure mode of "publish more" is the same: more pages on a low-trust foundation deepen the trust deficit. The 30-day sprint sequence — Day 0 access → audit → diagnostic → prune → refresh → new hero content → E-E-A-T signals — is deliberate. Do not skip ahead.

The business-type overlay shifts the emphasis (e.g., affiliate content emphasizes E-E-A-T + on-the-ground experience; local SEO services emphasizes NAP consistency + GBP + reviews; SaaS emphasizes BoFu comparison content + integration pages) but the structural sequence is preserved.

## Why this is different from a "publish more" strategy

- The starting posture is **subtractive then additive**, not additive-only. Pages without traffic, intent fit, or evidence go before pages get added.
- New publishing is **gated** on demonstrable E-E-A-T (author identity, real proof). Mass content output without proof is what every modern algorithm demotes.
- Wins are often **lagged**. Recovery realizes at the next Google update window; growth compounds over months, not weeks.
- Monetization is **part of the quality signal**. Aggressive ad density, hidden affiliate intent, dark-pattern lead capture — all read as user-hostile.
- The keyword Find step is **GSC loss-query reconciliation + competitor gap analysis** (what we used to rank for + what competitors rank for that we don't), not net-new keyword discovery from scratch.

## Priority Order

1. [[Day 0 Measurement Access Gate]] — capture GSC, analytics, ad-network/lead-system, CMS baselines.
2. [[Claude SEO Install and First Audit]] — run the selected SEO audit layer and triage findings.
3. [[Days 1-5 GSC Diagnostic and Triage]] — identify lost queries, demoted URLs, intent shifts.
4. [[Days 6-12 Content Audit and Prune]] — keep / rewrite / merge / redirect / delete decisions per URL.
5. [[Days 13-18 Top Pages Refresh]] — refresh the surviving top pages with real evidence.
6. [[Days 19-24 New Hero Content and Information Gain]] — publish a small number of new hero pages built on real proof.
7. [[Days 25-30 E-E-A-T and Author Signals]] — author bio rollout, About page, schema integrity, off-site author footprint.

The [[ULTIMATE BEAST Plan]] is the strategic deliverable that synthesizes everything above into a single ranked action plan.

## FLOW Summary

- **Find**: keyword research output ([[Keyword Targets and Page Map]] + [[Keyword Cannibalization Ledger]] + [[XLSX Structure Reference]]) plus GSC loss-query reconciliation once GSC connects.
- **Leverage**: author trust, proof artifacts (photos / case studies / testimonials per business type), community signals (per [[Distributed Presence Workflow]]).
- **Optimize**: prune / merge / refresh existing pages before publishing anything new. Fix Core Web Vitals impacted by ad density per [[Monetization Density Guardrails]].
- **Win**: visibility-to-revenue linkage measured in [[Dual Surface Scorecard]], segmented by cluster.

## Start Here

Open `[[Start Here]]` for the beginner-friendly setup walkthrough, then `[[Day 0 Measurement Access Gate]]`.

## Caveat

No ranking promises are made. Outcomes are a function of (1) execution quality, (2) competitive movement, and (3) Google's update cadence. The 30-day sprint is a high-intensity diagnose-and-rebuild cycle, not a guaranteed timeline.
