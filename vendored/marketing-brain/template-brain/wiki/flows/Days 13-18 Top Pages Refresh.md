---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Days 13-18 Top Pages Refresh"
created: 2026-05-04
updated: 2026-05-04
tags:
  - refresh
  - top-pages
  - information-gain
  - eeat
status: pending-day-0
shipping_status: "pending-prior-flows"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "Per-page refresh checklist complete for every selected page"
  - "Screenshots of refreshed pages saved to .raw/sources/refreshes/"
  - "Information gain item documented per page (what was added that the SERP top 10 lacks)"
rollback_plan: "CMS revisions saved before each edit. Each refresh can be reverted independently."
related:
  - "[[30-Day Sprint]]"
  - "[[Days 6-12 Content Audit and Prune]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Image and Page Speed Workflow]]"
  - "[[SERP-First Content Creation Gate]]"
sources:
  - ".raw/sources/day0/loss-map.csv"
---

# Days 13-18 Top Pages Refresh

Refresh the survivors. Raise the quality bar on kept pages.

## Goal

For the pages that survived [[Days 6-12 Content Audit and Prune]], raise the quality bar — original photos / screenshots / case studies, dated practice logs, accurate seasonal calendars, transparent disclosure, clean schema, honest author attribution. Modern algorithms reward demonstrable first-hand experience; this phase manufactures the proof that it exists.

## Selection

Refresh these pages first:

- Top 10-20 pages by current traffic (kept after prune).
- Any seasonal pages with peak window approaching in the next 4-6 weeks (time-locked refresh windows — miss the window and the refresh gets no measurement signal until next year).

## Per-Page Refresh Checklist

For every selected page, complete every item below. Screenshot the finished page and save to `.raw/sources/refreshes/`.

- Verify primary keyword still owns intent vs current SERP top 10. If intent has shifted, flag for [[SERP-First Content Creation Gate]] re-evaluation before editing.
- Check [[Keyword Cannibalization Ledger]] — confirm this URL is the assigned owner for its primary keyword. If a competing URL exists, resolve cannibalization first.
- Add at least one new information gain item the current SERP top 10 does not have. Examples by business type — see active overlay at `[[Business Type Overlay]]`.
- Add or refresh author bio block at top of the page (the named expert's verifiable experience).
- Verify monetization disclosure visible above the fold (per [[Affiliate Disclosure Standards]] or equivalent).
- Run [[Image and Page Speed Workflow]] on every image touched.
- Update `dateModified` schema honestly (only after substantive edit, never as a cosmetic bump).

## Anti-Pattern

Cosmetic-only refresh — bumping `dateModified` without adding information gain — is detectable by Google and counter-productive in HCU recovery. If a page does not warrant a real information gain addition, leave it alone or move it to the prune queue.

## Owner / Verifier

Owner: {{client_name}}. Verifier: {{owner}}.

## Acceptance

Per-page refresh checklist complete and screenshotted to `.raw/sources/refreshes/` for every selected page. Information gain item documented per page in the refresh log.

## Rollback

CMS revisions saved before each edit. Each refresh can be reverted independently if a page regresses on CWV or starts losing impressions after refresh.
