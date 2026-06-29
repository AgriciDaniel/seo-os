---
type: concept
title: "Business Type Overlay — Affiliate Content"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - affiliate
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
  - "[[Opportunity Score Rubric]]"
---

# Affiliate Content — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay into
> `wiki/concepts/Business Type Overlay.md` so the vault carries the right
> strategic depth for the client's revenue model. The `beast-planner.md`
> subagent reads the overlay alongside the FLOW canonical when composing the
> ULTIMATE BEAST plan.

Examples in this category: outdoor-recreation affiliate sites (fishing,
hunting, camping — affiliate links + display ads + lead-gen to a sister
service brand), large recipe blogs, gear-review sites, niche how-to sites
monetized through Amazon + Mediavine/Ezoic + occasional sponsorships.

---

## 1. When to use

Pick `--business-type affiliate-content` when:

- The site monetizes primarily through **affiliate commissions**
  (Amazon Associates, REI, Bass Pro, ShareASale, Impact, CJ, etc.) and/or
  **display-ad RPM** (Mediavine, Raptive, Ezoic, AdThrive).
- There is **no direct e-commerce checkout** on the site itself.
- A real human author with **on-the-water / hands-on / first-person
  experience** is the brand's moat (this is the E-E-A-T story affiliate
  sites that survive the HCU 2023+ updates have in common).
- The lead-gen surface, if any, is a **secondary revenue stream**
  (e.g., the affiliate site funnels to a guide-service sister brand or to
  a course/digital product).

Common-but-wrong picks: an e-commerce store with an affiliate-style blog
(use `ecommerce` and treat the blog as a top-of-funnel asset), or a SaaS
product with a comparison-content blog (use `saas`).

---

## 2. Revenue model implications

The plan must respect that **affiliate revenue is impressions × CTR ×
conversion-rate × commission**, and **display-ad revenue is sessions × pages
per session × RPM**. These two stacks fight each other for screen real estate
and reader attention.

### What this changes about the strategy

- **Information gain is the moat, not keyword density.** Reviews need real
  hands-on testing notes (date, conditions, what broke, what surprised) —
  this is what AI-generated competitor content cannot fake and what
  Google's HCU rewards.
- **Disclosure is a ranking + AI-citation signal.** Visible affiliate
  disclosures at the top of every monetized page (FTC-compliant, not
  buried in the footer) are now read by AI scrapers — undisclosed
  affiliate content gets quietly demoted in AI Overviews.
- **Author bios with verifiable credentials** matter more than ever.
  Named author + dated experience + real photos > company-style
  voiceless content.
- **Commercial-investigation content** (comparison, "best", "vs", "review")
  is the highest-EPC content; **informational pillars** (how-to, species
  guides, technique pillars) feed display-ad RPM and AI Overview
  citations. Both are needed; they get measured differently.

### Revenue-stream hierarchy to encode in the plan

1. **Affiliate clicks → external commission** (highest EPC, hardest to
   improve once stable; focus on conversion-rate optimization, not
   traffic chasing).
2. **Display-ad RPM** (volume game; each new top-10 ranking compounds).
3. **Lead-gen / sister-site referrals** (long sales cycles, high LTV;
   measured as assisted conversions, not last-click).
4. **Direct revenue** (digital products, sponsorships, paid newsletter)
   — only if the audience is substantial enough.

---

## 3. Content vertical priorities

The keyword XLSX usually shows a clear split — encode it in the plan:

| Vertical | Purpose | EPC tier | RPM tier |
|---|---|---|---|
| **Gear reviews** ("best X", "X review", "X vs Y") | Affiliate clicks | High | Medium |
| **Species / category pillars** ("ontario steelhead", "best wading boots") | Topical authority + display ads | Medium | High |
| **How-to / technique** ("how to centerpin", "tying a stonefly") | Display ads + AI Overview citations | Low | High |
| **Location / destination guides** ("fishing the credit river") | Local intent + lead-gen funnel | Medium | High |
| **News / seasonal updates** ("2026 trout opener report") | Returning-visitor RPM + AI freshness signals | Low | High |

Hub-and-spoke recommendation:

- One **species pillar** per top-volume cluster (steelhead, salmon, brown
  trout). Pillar = the canonical hub URL, all spokes link to it, it links
  to the top-converting affiliate review pages.
- One **technique pillar** per top-search-volume technique. Same
  structure.
- **Location guides** as dedicated spokes off the species pillars (not
  a separate hub) — this is where lead-gen / guide-service referrals
  convert.

The cannibalization clusters in `Keyword Cannibalization Ledger.md`
typically show that affiliate sites have **3-9 pages competing per
intent** because the writer didn't have a pillar map. The plan's
Optimize section is mostly cluster-resolution work.

---

## 4. Measurement focus

The Dual Surface Scorecard for affiliate sites tracks:

### Visibility (the SEO half)

- **GSC impressions + clicks** by URL and by query, with the 16-month
  history split out (catches HCU drops).
- **DataForSEO ranked-keywords** count, especially the **top 10** and
  **positions 11-50** (the conversion band — where refresh work has the
  highest expected value).
- **AI Overview presence** for top commercial-investigation queries
  (manually checked monthly on the top 20 keywords; automated check via
  DataForSEO `serp/google/ai_overview/live` if budget permits).
- **Brand mentions on third-party sites** (the citation count that AI
  search uses to decide source credibility).

### Revenue (the business half)

- **Display-ad RPM trend** (Mediavine / Ezoic / Raptive dashboard,
  90-day rolling).
- **Affiliate EPC by network** (Amazon, REI, etc.) — not the same as
  conversion rate; EPC normalizes for click volume.
- **Affiliate clicks per pageview** by URL — finds the underperforming
  monetized pages.
- **Assisted conversions** to any sister-brand lead-gen (booking events,
  email signups, course signups) — these are the long-LTV referrals
  that look small day-to-day but compound.

### Refresh cadence

- **Weekly** — GSC top-loss queries (catches Core Update fallout fast).
- **Monthly** — RPM trend, EPC by network, AI Overview spot-checks.
- **Quarterly** — full DataForSEO re-pull, full cannibalization scan,
  competitor refresh.

---

## 5. Anti-patterns specific to affiliate sites

These are forbidden in the BEAST plan. The plan must not recommend any of
them, and should explicitly call them out as forbidden if the user later
asks about them.

- **Mass AI rewrites of existing content.** Detectable by Google,
  destroys the E-E-A-T moat that real-author affiliate sites rely on.
  If an old post needs updating, refresh it with new dated experience —
  don't pipe it through Claude.
- **Hidden / footer-only disclosures.** FTC requires "clear and
  conspicuous" — visible at the top of any monetized page, not buried.
  AI scrapers now read disclosure signals; missing them quietly demotes
  the page in AI Overviews.
- **Review gating** — never filter out negative reviewers before
  collecting their reviews. Honest review distribution beats fake
  five-stars in both Google and AI search.
- **"Best of" lists with no real testing.** If the author hasn't used
  the products, the page won't rank past the HCU update window.
  Recommend either real hands-on testing or removing the page.
- **Aggressive interstitial / vignette ads** that hurt LCP and
  drive bounce rate up. Display-ad RPM gains get cancelled by
  ranking losses. Mediavine Pro, Ezoic Premium, etc. all support
  ad-density throttling — use it.
- **Buying links / link exchanges / PBNs.** Long-term ranking
  collapse. The plan never recommends this.
- **Product schema with fake aggregate review counts.** Manual
  action risk. The plan validates schema honesty as part of the
  refresh checklist.
- **Affiliate-link redirect chains** through cloaking subdomains
  designed to hide the affiliate target — most networks now ban
  this; AI search treats it as a trust signal failure.
- **Stuffing the H1 with keyword variants.** Use one clear H1 that
  reads like a sentence; let H2/H3 hierarchy carry the keyword
  spread. AI Overviews extract H1+first-paragraph as the citation
  candidate; a stuffed H1 disqualifies the page.

---

## AI Overview considerations specific to affiliate

AI Overviews currently lean toward editorial-feeling content with
visible primary-source signals. For affiliate sites this means:

- **Visible affiliate disclosure at the top of monetized pages** is
  read as a trust signal, not penalized.
- **Named-author bio + credentials + dated experience** are the
  difference between getting cited as a source and being summarized
  away.
- **Direct-answer paragraph in the first 60 words after the H1** is
  the AI Overview extraction target. Save the affiliate CTAs for
  below the first answer.
- **Schema honesty** — if the site uses Product or Review schema,
  the aggregate review count must reflect real reviews. Inflated
  schema is a quiet AI Overview demotion.
- **External citations** to primary sources (manufacturer specs,
  scientific studies, conservation authority pages) signal that the
  page is itself citation-worthy.

The BEAST plan's section 7 (AI Overview tactics) should call out
each of these specifically with example URLs from the client's site.
