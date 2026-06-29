---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "Content Pruning and Consolidation"
created: 2026-05-04
updated: 2026-05-04
tags:
  - pruning
  - consolidation
  - content-ops
status: active
related:
  - "[[HCU Recovery Framework]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Google Helpful Content System]]"
  - "[[Content Pruning Decision Framework]]"
  - "[[Google Search Console]]"
sources: []
aliases:
  - "Pruning"
  - "Content Consolidation"
---

# Content Pruning and Consolidation

Pruning is the act of removing or merging weak pages so they stop dragging site-wide trust signals. For most mature sites, pruning is the single highest-leverage recovery action — bigger than any rewrite, bigger than any new publishing.

## When To Prune

A page is a prune candidate when one or more of:

- Low impressions and low average position over 90+ days (segment by [[Seasonal Search Demand|season-adjusted]] window).
- Thin content or duplicate intent vs another page on the site (cannibalization).
- Off-topic for the niche (see [[Topical Authority for Niche Sites]]).
- Factually outdated — wrong regulations, dead links, discontinued products / dropped features — and not worth refreshing.
- AI-generated bulk content with no original evidence and no [[Information Gain]].

## Decision Tree

For each candidate, choose exactly one:

- **Keep** — Page has impressions, intent matches, no duplicate exists, content is defensible. Refresh if needed but do not remove.
- **Rewrite** — Intent and URL are right, content is weak. Rewrite to the [[E-E-A-T for {{site_type}}|E-E-A-T]] bar with [[Information Gain]] additions.
- **Merge** — Two or more pages target the same intent. Combine the strongest signals into one canonical page; 301 the others to it.
- **301-Redirect** — Page is being removed but a substantially similar page covers the same intent. Redirect to that page.
- **410-Gone** — Page is being intentionally removed and no replacement page covers the intent. Use **410**, not 404 — 410 signals intentional removal and is processed faster by Google.

## Implementation Notes

- Use **410** not 404 for intentional removal. 404 implies "missing"; 410 implies "gone on purpose".
- Use **301** only when the target page substantially covers the same intent. Redirecting an unrelated page to a hub is a soft-404 trap.
- **Never noindex as a long-term prune substitute** — noindex still loads the page into Google's site-wide quality calculation. It does not remove the trust drag. Use noindex only as a short-term staging step.
- Maintain a redirect map (CSV: old URL, action, target URL, date, reason).
- Maintain CMS revision backups for every removed/merged page — pruning is reversible only with effort.

## Risk

Over-pruning is reversible only with effort. Under-pruning is the more common failure mode for HCU recovery. When in doubt on a thin page, prune. When in doubt on a survivor, keep and refresh.

## Reference

See [[Content Pruning Decision Framework]] for the per-page operational template.
