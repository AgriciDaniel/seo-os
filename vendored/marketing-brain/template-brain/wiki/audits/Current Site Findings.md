---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: audit
title: "Current Site Findings"
created: 2026-05-04
updated: 2026-05-04
tags:
  - audit
  - current-site
  - technical
status: seed
related:
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[HCU Recovery Framework]]"
  - "[[E-E-A-T for {{site_type}}]]"
  - "[[Topical Authority for Niche Sites]]"
  - "[[Image and Page Speed Workflow]]"
  - "[[DataForSEO Keyword Exports]]"
sources:
  - "Direct fetch and parse (pending — populated by skill)"
  - "claude-seo audit reports (pending)"
  - "[[DataForSEO Keyword Exports]]"
---

# Current Site Findings

**Status: TBD pending audit.** The marketing-brain skill populates this note from direct site fetch + parse, the `claude-seo` audit reports, and the DataForSEO ranked-keywords data. Findings frame the priority order of fixes during the [[30-Day Sprint]].

## Critical Findings (Fix Day 1-5)

To be filled. Examples of the kinds of findings that surface here:

> [!note]+ Common critical findings by category
> - Missing H1 tags on top-traffic pages.
> - Broken canonical configuration (multiple canonicals, self-referencing canonical missing).
> - Schema errors that block rich-result eligibility.
> - Slug typos on URLs that already rank.
> - Pages indexed against `noindex` directives or vice versa.
> - Critical CWV regressions (LCP > 4s, CLS > 0.25, INP > 500ms) on top-traffic pages.

## Findings (post-DataForSEO baseline)

To be filled by the skill. Position bucket distribution, top quick-win candidates, anomalies (page that ranks for a keyword its slug suggests it shouldn't own), sister-site / brand cannibalization findings, competitor reframing.

### Position bucket distribution

| Position bucket | Keyword count |
|---|---:|
| 1-3 | TBD |
| 4-10 | TBD |
| 11-20 | TBD |
| 21-50 | TBD |
| 51-100 | TBD |
| >100 | TBD |
| **Total** | **TBD** |

### Top quick-win refresh candidates

To be filled — typically the keywords sitting at positions 4-10 with material volume, where a single refresh moves them into top 3.

### Anomalies worth investigating

Pages ranking for keywords their structure/slug suggests they shouldn't own. These are signals about how Google reads the site's topical weight; the audit should resolve whether to repoint internal links, accept the de facto winner, or migrate the keyword target.

### Sister-site / brand cannibalization

If {{client_name}} owns multiple domains targeting overlapping intent, surface the coordination question here.

## High Findings (Fix Day 6-12)

- Internal linking density per page (verify in CMS — parser false negatives are common).
- Title freshness on commercial / time-sensitive pages.
- Duplicated intent across multiple URLs (mapped in [[Site Inventory and Cannibalization Map]]).

## Medium Findings

- Schema audit — verify the actual schema types output by the CMS / SEO plugin.
  - Person/Author schema present and points to the right author.
  - Product/Review schema present on commercial pages with HONEST counts.
  - LocalBusiness or Service schema for service pages routing to the lead-gen funnel.
  - No fabricated `aggregateRating`, no inflated `reviewCount`.
- Off-niche content diluting topical signal.

## Strong Signals (Defensible Foundation)

To be filled — the audit should also surface what's working. Strong tech stack, healthy sitemap, solid pillar content, defensible top-3 rankings on core terms — anything that argues for "consolidate and reinforce" rather than "rebuild from zero".

## Cause Hypothesis

To be filled by the skill once data lands. Default cause-net per [[HCU Recovery Framework]]:

1. E-E-A-T weakness — author signal under-surfaced.
2. Cannibalized intent — multiple URLs competing for the same query.
3. Off-niche dilution — topical authority signal weakened.
4. Internal linking sparse — hub-and-spoke fails without dense linking.
5. Outdated year stamps on commercial content.

The actual cause-mix for {{site_url}} is TBD pending audit.

## Validation Caveats

- All findings are from a single direct fetch on the audit date. Re-verify if pages are edited between fetch and decision.
- Internal-link counts from parsers can be false negatives — VERIFY in CMS before treating as a real issue.
- Schema block content needs full JSON-LD inspection, not just block count.
- GSC data will refine which findings actually correlate with ranking loss vs which are non-issues.
