---
type: concept
title: "Business Type Overlay — Publisher / News"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - publisher
  - news
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
---

# Publisher / News — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay
> into `wiki/concepts/Business Type Overlay.md`. The `beast-planner.md`
> subagent reads it alongside the FLOW canonical when composing the
> ULTIMATE BEAST plan.

Examples in this category: independent niche publications, magazine sites
(digital-first or print-and-digital), local news outlets, industry trade
publications, opinion sites, expert-author blogs that have grown into
small editorial operations.

---

## 1. When to use

Pick `--business-type publisher-news` when:

- The site is **editorial-first** — articles, reporting, opinion,
  reviews — with **multiple named authors / contributors**.
- Revenue is **ad-driven, subscription-driven, or membership-driven**
  (Mediavine / Raptive / Substack / Patreon-tier paid newsletters /
  paywalled archive).
- **Topical authority** in a defined subject area is the brand's moat.
- **Freshness** is a meaningful ranking signal (news cycle, market
  moves, seasonal coverage).
- The site is or could be eligible for **Google News, Top Stories, and
  Google Discover**.

Common-but-wrong picks: an affiliate site that publishes weekly content
(use `affiliate-content` if affiliate revenue dominates), a SaaS company
blog that wants to be a publication (use `saas` and treat the blog as
top-of-funnel).

---

## 2. Revenue model implications

Publisher revenue is **sessions × pages-per-session × RPM**, plus
**subscription / membership LTV** for paywalled sites. Top-of-funnel
discovery happens through Google News / Discover, organic search, and
social referral. Bottom-of-funnel happens through newsletter signup
and subscription conversion.

### What this changes about the strategy

- **EEAT carries disproportionate weight.** Named author profiles with
  bios, credentials, social links, and consistent bylines are
  table stakes — not optional. Anonymous publisher content has been
  systematically demoted across HCU updates.
- **Editorial standards page is a trust signal.** "How we report",
  "corrections policy", "ethics statement" — Google's quality
  raters explicitly look for these on news / publisher sites.
- **Topical authority compounds.** A site that publishes 100 deeply-
  researched pieces in a single niche outranks a site that
  publishes 1000 surface-level pieces across ten niches. Stay in
  lane.
- **Freshness signals matter more here than anywhere.** Recently-
  updated articles, dateline-prominent metadata, and `Article`
  schema with `datePublished` + `dateModified` all feed Google
  News + Top Stories eligibility.
- **Newsletter is the moat against algorithm dependency.** Email
  subscribers can't be deplatformed by a Core Update; the plan
  must include newsletter-growth tactics as a parallel revenue
  stream.

### Revenue-stream hierarchy to encode in the plan

1. **Display-ad RPM** (Mediavine / Raptive / direct-sold; volume
   game; each new ranking compounds).
2. **Newsletter signups → subscription / membership conversion**
   (highest-LTV; the paywalled tier).
3. **Sponsorship / branded content** (must be clearly disclosed,
   never disguised as editorial — Google's spam policies are
   explicit).
4. **Affiliate / commerce content** (if any; secondary; held to
   the affiliate-content overlay's standards on disclosure).
5. **Events / merch / tip-jar** (small but real for some
   publications).

---

## 3. Content vertical priorities

| Vertical | Purpose | Discovery surface | Authority lift |
|---|---|---|---|
| **News / breaking** ("what just happened") | Top Stories + Discover | High | Medium |
| **Analysis / explainer** ("what it means") | Organic search + AI Overviews | Medium | High |
| **Original reporting / investigation** | Citation bait + backlinks | Low (volume) | High |
| **Opinion / column** | Subscription LTV + brand voice | Medium | Medium |
| **Reviews (products, services, experiences)** | Commercial-investigation + AI Overviews | Medium | Medium |
| **Newsletter exclusives** | Subscription LTV | N/A | High |
| **Evergreen pillars** ("how X works") | Long-tail organic + AI Overviews | High | High |
| **Seasonal / event coverage** | Freshness signal + Discover | Medium | Medium |

Hub-and-spoke recommendation:

- **Topic hubs** organized by primary subject area (one hub per
  beat / vertical the publication covers). Each hub is the
  canonical landing page for the topic; spokes are individual
  articles.
- **Author archive pages** as a parallel hub structure — each
  named author has a profile page, a bibliography, and a
  byline-aggregator that ranks for "[author-name] [topic]".
- **Newsletter / subscription page** as a single high-converting
  spoke linked from every article footer.
- **Topic landing pages** ("everything we've published on X")
  for evergreen subjects — these accumulate links and rank for
  the head term over time.

---

## 4. Measurement focus

The Dual Surface Scorecard for publishers tracks:

### Visibility (the SEO half)

- **GSC impressions + clicks** by URL pattern: news vs analysis
  vs evergreen.
- **Google News + Discover traffic** (separate dashboards in
  GSC) — leading indicator of EEAT health.
- **Top Stories carousel inclusion** for breaking-news queries
  in the publication's beat.
- **Returning-visitor rate** by URL — finds the articles that
  pull repeat readers vs one-shot Google traffic.
- **AI Overview presence** on the publication's defining
  topical queries.
- **Brand mentions** in other publications (citation count
  feeds AI search trust signals + Google News authority).

### Revenue (the business half)

- **Display-ad RPM trend** (90-day rolling, by URL pattern).
- **Newsletter signup rate** by URL — finds the articles
  that convert one-shot readers into subscribers.
- **Subscription / membership conversion rate** from
  newsletter cohort.
- **Subscriber LTV** by acquisition source.
- **Sponsored-content revenue** with clear FTC compliance
  metadata.
- **Direct-sold ad CPM trend** if applicable (premium
  inventory often outperforms programmatic).

### Refresh cadence

- **Daily** — Top Stories + Discover monitoring during
  active news cycles.
- **Weekly** — top-loss queries, RPM trend, newsletter
  signup conversion rate.
- **Monthly** — author archive audit (every author
  publishes consistently?), AI Overview spot checks on
  top 20 evergreen queries.
- **Quarterly** — full DataForSEO competitor re-pull,
  full editorial standards / corrections policy
  refresh, full backlink + brand-mention audit.

---

## 5. Anti-patterns specific to publishers

These are forbidden in the BEAST plan.

- **Anonymous bylines on opinionated / news content.** EEAT
  failure. Every piece of editorial gets a named author with
  a bio.
- **AI-generated articles published under human bylines.**
  Detectable, deceptive, and an explicit Google spam policy
  violation. The plan never recommends this.
- **Sponsored content not labeled as such.** FTC violation,
  Google News disqualification, AI Overview demotion. Use
  `<meta name="robots" content="sponsored">` and visible
  "Sponsored" label.
- **Clickbait headlines that mislead about article
  content.** Google's spam policies have explicit language
  on misleading titles. AI Overviews stop citing.
- **Content farming for low-volume long-tail queries** with
  thin articles. HCU update target.
- **Republishing wire copy without unique value-add** —
  duplicate-content liability without the AP-style
  syndication agreements that protect actual newsrooms.
- **Pop-up / interstitial chaos** that destroys CWV — RPM
  gains get cancelled by ranking losses, and Discover
  eligibility is increasingly CWV-sensitive.
- **Paywalled content marked `noindex`** — locks Google out
  of the canonical version. Use Subscription/Paywall schema
  + `meta` tags so Google indexes preview content while
  respecting the paywall.
- **Comments sections left unmoderated** — spam in comments
  signals low editorial quality to Google and is
  increasingly cross-checked by AI Overviews.
- **Fake social-share counts / engagement bots** — manual
  action risk, AI search trust signal failure.
- **Off-topic SEO grabs** — publishing pieces outside the
  publication's defined beat to chase a trending query.
  Dilutes topical authority; HCU consequence.

---

## AI Overview considerations specific to publishers

AI Overviews on news / topical queries currently pull from
established publications, well-credentialed authors, and
schema-rich articles. To get cited:

- **Article schema completeness** — `Article` (or
  `NewsArticle` for true news), `Person` (for the
  author), `Organization` (for the publisher),
  `datePublished`, `dateModified`, `headline`,
  `image`, `articleSection`.
- **Named-author bylines with credentialed bios** — bio
  pages linked from every article, with verifiable
  external profiles (LinkedIn, professional org
  membership, university faculty page).
- **Editorial standards / corrections policy / ethics
  statement** as dedicated indexable pages —
  quality-rater signals that AI Overviews increasingly
  cross-reference.
- **Original reporting + primary-source citations**
  inside the article — gets excerpted as AI Overview
  citations.
- **Datelines + dateModified prominence** — AI
  Overviews on time-sensitive queries privilege fresh
  content; missing datelines disqualify.
- **External brand mentions** — citations of the
  publication on other reputable sites build the
  AI-search trust graph. Track via Google Alerts +
  manual monthly review.

The BEAST plan's section 7 (AI Overview tactics) should
call out each of these specifically with example URLs
from the publication's article archive + author profile
pages.
