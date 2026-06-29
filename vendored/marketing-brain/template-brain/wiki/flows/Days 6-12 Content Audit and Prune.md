---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Days 6-12 Content Audit and Prune"
created: 2026-05-04
updated: 2026-05-04
tags:
  - prune
  - audit
  - redirects
  - high-blast-radius
status: pending-day-0
shipping_status: "pending-prior-flows"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "Every URL on the site has a documented Keep/Rewrite/Merge/301/410 decision"
  - "All 301s and 410s implemented and verified by HTTP status check"
  - "Sitemap regenerated and submitted to GSC"
  - "Redirect map saved to .raw/sources/redirects/redirect-map-YYYY-MM-DD.csv"
rollback_plan: "CMS revisions saved per page before deletion or rewrite. Redirect rules can be reverted within 24h. Process in batches with verification crawl between batches."
related:
  - "[[30-Day Sprint]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Days 13-18 Top Pages Refresh]]"
  - "[[Content Pruning Decision Framework]]"
sources:
  - ".raw/sources/day0/loss-map.csv"
---

# Days 6-12 Content Audit and Prune

The hardest phase of the sprint. Highest blast radius.

## Goal

Apply [[Content Pruning Decision Framework]] to every URL on the site. Every URL exits this phase with one of these decisions:

- **Keep** — quality bar met or close enough that refresh in [[Days 13-18 Top Pages Refresh]] gets it there.
- **Rewrite** — kept URL, but body and structure replaced.
- **Merge** — content folded into another URL; original 301s to merge target.
- **301-Redirect** — URL removed; redirected to closest relevant kept URL.
- **410-Gone** — URL removed; no relevant redirect target. Returns 410 so Google deindexes cleanly.

## Activities

1. Work through the loss map URL by URL.
2. For each URL, fill out a `[[content-prune-decision]]` template instance — primary keyword, current performance, decision, target URL if 301/merge, rationale, owner, date.
3. Build the redirect map for any 301s. One row per source URL → target URL.
4. Back up CMS revisions before any deletion. Confirm restore path works.

## Pruning Targets

These categories are the strongest prune candidates:

- Off-niche content (anything outside the site's stated topical area).
- Thin AI-feeling content with no first-hand evidence.
- Duplicate intent — multiple URLs targeting the same query.
- Factually outdated content with no refresh ROI (e.g. discontinued products with no successor).
- Dated news / event posts that no longer rank and have no evergreen utility.

## Implementation Order

Batch the work so each batch can be verified before the next starts:

1. **Redirects batch** — implement all 301s and 410s in one batch. Verification crawl after, checking HTTP status on every redirected URL.
2. **Rewrites batch** — schedule rewrites of kept-but-needs-rewrite URLs.
3. **Merges batch** — fold merge sources into merge targets, then 301 the source URLs.
4. **Sitemap update** — regenerate sitemap.xml and submit to GSC.

Do not start a new batch until the previous batch is verified.

## Owner / Verifier

Owner: {{client_name}}. Verifier: {{owner}}.

## Acceptance

Every URL has a documented decision. All 301s and 410s implemented and verified by `curl -I` or equivalent HTTP status check. Sitemap regenerated and submitted. Redirect map saved to `.raw/sources/redirects/redirect-map-YYYY-MM-DD.csv`.

## Rollback

CMS revisions saved per page before any deletion or rewrite. Redirect rules can be reverted within 24h via the same layer (CMS, hosting, or CDN) that added them. If a batch verification fails, roll back that batch before proceeding.

## Risk Note

This is the highest blast radius phase of the sprint. A bad redirect map can deindex kept content or create redirect chains that depress crawl efficiency. Verify each batch with a recrawl before moving on. Do not bulk-delete URLs without redirect targets unless 410 is the deliberate decision.
