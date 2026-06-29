---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: business-type-overlay
title: "Publisher News"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - publisher
  - news
  - editorial
status: active
related:
  - "[[business-types/_index|Business Type Overlays Hub]]"
  - "[[Pillar Page Template]]"
  - "[[Monetization Density Guardrails]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Affiliate Disclosure Standards]]"
  - "[[Distributed Presence Workflow]]"
sources: []
aliases:
  - "publisher-news"
---

# Publisher News

The publisher / news overlay. Topical authority, freshness signals, EEAT-heavy author profiles, news schema, RSS, Google News + Discover surfaces.

## 1. When to Use This Overlay

Characteristic patterns:

- Site is a **content publisher** (online magazine, niche news, trade publication, lifestyle media, industry newsletter).
- Publishing **cadence is high** — multiple articles per week, sometimes daily.
- Multiple **named editorial staff** with bylines, beats, and verifiable credentials.
- Visibility surfaces include **Google News, Discover, AI Overviews** — not just classic SERP.
- Revenue is typically a mix: display ads + affiliate + sponsored content + memberships / subscriptions.
- E-E-A-T moat: editorial standards, named experts with verifiable beats, original reporting / interviews / data.

## 2. Revenue Model Implications

Mix of streams, varies by publication:

- **Display advertising** (programmatic + direct sold) — historically the dominant stream.
- **Affiliate links** in product / gift / "best of" content.
- **Sponsored content** (clearly labeled per FTC / advertising standards).
- **Memberships / paid subscriptions** (paywalls, premium content, newsletters).
- **Events / merchandise / partnerships** (varies).

Monetization density rules per [[Monetization Density Guardrails]]: ad units, sponsored content placements, paywall overlays, newsletter signup popups all count. Paywall implementation is particularly tricky — must be SEO-compliant (Google's flexible sampling / first-click-free guidance).

## 3. Content Vertical Priorities

Dominant page templates:

- **Article / News page** — the main page type. Custom template per publication; the [[Pillar Page Template]] structure adapts.
- **[[Pillar Page Template]]** — evergreen topical pillars that anchor the publication's beats. Critical for topical-authority signal alongside the high-velocity news content.
- **Author / Reviewer profile pages** — one per named contributor. E-E-A-T cornerstone.
- **Topic / category / tag archive pages** — hub navigation.
- **Newsletter signup pages** — subscription funnel.

Cluster pattern: beats × time × content type. Each beat (politics, tech, sports, business — or whatever the publication covers) maintains its own publication cadence and topical-authority signal. Beats × time creates an archive structure; beats × content type creates the per-template page count.

Required pages beyond the matrix:

- Editorial standards / policies page (how content is reported, fact-checked, corrected).
- Corrections / updates page (signals editorial integrity).
- About / masthead with named editors + photos + credentials.
- Diversity / sources statement (for serious news publications).
- Funding / ownership disclosure.

## 4. Measurement Focus

Per [[Dual Surface Scorecard]]:

- **Visibility surfaces**: GSC impressions / clicks per beat-cluster, **plus** Google News presence, **plus** Discover presence (Discover impressions / clicks are a separate report in GSC). AI Overview presence is high-stakes for news content.
- **Freshness signals**: re-crawl frequency, time-to-index for new articles. Publisher News sites need fast indexing.
- **Engagement metrics**: time-on-page (unusually relevant for editorial content), pages-per-session (deeper engagement = healthier signal), scroll depth.
- **Monetization metrics**: per-business-model — RPM for display, EPC for affiliate, sponsored-content sell-through rate, newsletter signup rate, subscriber LTV.
- **Subscriber / member growth** if subscriptions are part of the model.

Off-site signals tracked monthly:

- Backlinks from other publications (citations of original reporting).
- Mentions in roundups / "as covered in" press kits.
- Social-media reach (especially X / LinkedIn for news; TikTok / Instagram for lifestyle).
- Newsletter forward / share rate.

## 5. Anti-Patterns Specific to This Vertical

- **AI-generated news / aggregation content with no original reporting** — the canonical Publisher News HCU trigger. Google's Helpful Content System is particularly tuned against scraped / paraphrased news.
- **Stale "evergreen" content positioned as current news** — articles dated to manipulate freshness. Detectable.
- **Fake bylines / AI-written articles published under real journalist names** — destroys the named-byline trust that anchors the publication's E-E-A-T.
- **Hidden sponsored content** — sponsored content not labeled per FTC standards is both a quality-signal failure and a legal risk.
- **Aggressive paywall on first click with no SEO-compliant sampling** — pages indexed but unreadable to most users. Use Google's flexible sampling guidance.
- **Excessive ad density** — newsroom revenue pressure pushes density up; HCU pushes back. Protect CWV per [[Monetization Density Guardrails]].
- **Clickbait headlines disconnected from article content** — drives short-term CTR, long-term trust loss, and AI Overview demotion.
- **Outdated corrections** — articles factually wrong without correction notices destroy editorial trust.

## 6. Cross-references

- [[Pillar Page Template]] — for evergreen topical pillars alongside high-velocity news.
- [[Affiliate Disclosure Standards]] — applies wherever affiliate links appear.
- [[Topical Authority for Niche Sites]] — beat structure = hub-and-spoke at the publisher scale.
- [[Distributed Presence Workflow]] — social distribution + creator collabs critical for news distribution.
- `claude-seo:seo-content` — content quality + E-E-A-T analysis essential for editorial credibility audits.
- `claude-seo:seo-schema` — `NewsArticle`, `Article`, `Person`, `Organization`, `BreadcrumbList` schema for Google News eligibility.
