---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: audit
title: "HCU Diagnostic Checklist"
created: 2026-05-04
updated: 2026-05-04
tags:
  - audit
  - checklist
  - hcu
  - eeat
status: active
related:
  - "[[Pre-Audit Hypothesis]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Content Pruning Decision Framework]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Days 6-12 Content Audit and Prune]]"
sources:
  - "Google Helpful Content Update documentation"
  - "Google Search Quality Rater Guidelines"
---

# HCU Diagnostic Checklist

The page-level and site-level checklist run during Days 1-5 and Days 6-12. Output feeds directly into [[Content Pruning Decision Framework]] and into the prioritization of prune vs refresh vs keep. Niche-agnostic — applies regardless of {{business_type}}.

## Site-Level Checks

Run once per sprint, repeated at end of sprint to confirm progress.

- Total count of pages (sitemap + crawl + GSC discovered).
- Count of pages categorized as off-niche (anything outside the site's stated topical area).
- About page present, with a real author bio, real photo, and verifiable practice history.
- Contact page present, with a real (monitored) email address.
- Editorial standards page present (how content is created, who writes it, how facts are checked, source attribution).
- Disclosure consistency across all monetized pages (affiliate, sponsored, lead-capture as relevant per business type) — same wording or close variant, same placement (above the fold).
- Schema fabrication check — no `aggregateRating` without real review counts, no `Review` without real author/date/body.
- Ad / monetization density per page type — measured as monetization slots above the fold and slots per 1000 words.
- Core Web Vitals field data scores (LCP, INP, CLS) on top 10 pages — field data, not lab data.
- GSC Manual Action status (none expected; document if any).
- GSC Security Issues status (none expected; document if any).

## Page-Level Checks

Run per URL during the inventory phase. Each row in [[Site Inventory and Cannibalization Map]] carries a Y/N for each item below.

- On-niche (Y/N): is the page about the site's stated topical area?
- Factually current (Y/N): time-sensitive facts (regulations, prices, product availability, year stamps) verified to current source?
- Primary keyword owns intent vs current SERP top 10 (Y/N): does the page type match what Google is currently rewarding?
- Unique information gain (Y/N): does the page contain at least one piece of information the SERP top 10 does not?
- Original evidence present (Y/N): photos / screenshots / dated logs / case studies / data — proof the author/team has actually done the thing claimed?
- Dated experience evidence (Y/N): a clear signal that someone actually practiced/tested/used the technique or product?
- Author block present (Y/N): name, photo, bio link, optionally credentials?
- Disclosure visible above fold (Y/N): see [[Affiliate Disclosure Standards]] (affiliate sites) or the equivalent decision per business type.
- Schema honest (Y/N): no fabricated ratings or counts?
- CWV good (Y/N): all three metrics in the "good" band on field data?

## Output

A scored inventory: every URL ends up with a site-level context flag and a 10-cell page-level fingerprint. The fingerprint feeds directly into [[Content Pruning Decision Framework]]:

- Mostly Y → KEEP candidate.
- On-niche but several N on currency/evidence → REWRITE candidate.
- Off-niche or near-zero traffic with poor fingerprint → 410 GONE candidate.
- On-niche but duplicated by another URL → MERGE candidate (resolve via [[Keyword Cannibalization Ledger]]).
- Removed but with a topical successor → 301 REDIRECT candidate.

## Anti-pattern

Treating any single Y/N as automatically disqualifying. The fingerprint is read holistically. A page can be N on "original photos" and still earn KEEP if it is genuinely useful, on-niche, and replaceable photos are coming.
