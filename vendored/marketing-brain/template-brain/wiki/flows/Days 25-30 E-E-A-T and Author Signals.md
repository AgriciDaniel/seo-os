---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Days 25-30 E-E-A-T and Author Signals"
created: 2026-05-04
updated: 2026-05-04
tags:
  - eeat
  - author-signals
  - trust
  - schema
status: pending-day-0
shipping_status: "pending-prior-flows"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "About, Contact, and Editorial Standards pages live and verifiable"
  - "Every kept content page shows an author block"
  - "No fabricated review schema remains site-wide"
  - "Updated sitemap submitted to GSC"
  - "Re-indexing requested for top 20 pages"
rollback_plan: "Trust pages can be reverted via CMS revisions. Schema removals are non-destructive. Re-indexing requests cannot be un-requested but cause no harm."
related:
  - "[[30-Day Sprint]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
  - "[[Image and Page Speed Workflow]]"
  - "[[E-E-A-T for {{site_type}}]]"
sources: []
---

# Days 25-30 E-E-A-T and Author Signals

Site-wide trust rebuild. Final phase of the sprint.

## Goal

Raise the site-wide trust signal that algorithmic demotion targeted (or that growth-posture sites need to establish). Individual page quality matters, but site-level signals — author identity, editorial transparency, monetization honesty, schema integrity — also weigh. This phase makes those signals legible to both readers and Google.

## Activities

- Publish or refresh the **About page** with the named expert's verifiable bio: years practicing the niche, regions / industries / accounts known, tools / methods preferred, and photos of the expert in real practice (not stock).
- Add an **author bio block** to every kept content page. Block links to the About page and includes a short experience statement relevant to that page's topic.
- Create or refresh a **Contact page** with a real email and a stated response policy.
- Verify **monetization disclosure** is visible on every monetized page (see [[Affiliate Disclosure Standards]] for affiliate sites; equivalent decision per business type for other verticals).
- Consolidate scattered "as featured in" or community / industry mentions into a **single trust block** on the About page (or a dedicated press / mentions page if the inventory warrants).
- Create or refresh an **Editorial Standards page** explaining how content is researched, tested, dated, and updated. Link from the footer.
- Verify all **commercial pages** show honest pros AND cons. Any page that reads as one-sided sales copy gets revised or pulled.
- Audit **schema** for fabricated review counts, fabricated aggregateRating, or invented author credentials. Remove anything that cannot be substantiated.
- Submit the updated **sitemap to GSC** and request **re-indexing** of the top 20 pages (refreshed pages from [[Days 13-18 Top Pages Refresh]] and new hero pages from [[Days 19-24 New Hero Content and Information Gain]]).

## Owner / Verifier

Owner: {{client_name}}. Verifier: {{owner}}.

## Acceptance

About, Contact, and Editorial Standards pages live. Every kept content page shows an author block with link to About. No fabricated review schema remains site-wide (verified by schema audit). Updated sitemap submitted in GSC. Re-indexing requested via URL Inspection for the top 20 pages.

## Rollback

Trust pages (About, Contact, Editorial Standards) can be reverted via CMS revisions if a fact needs correction. Schema removals are non-destructive — removing fabricated review counts cannot make the site worse. Re-indexing requests cannot be un-requested, but they cause no harm — Google decides whether to honor them.

## Post-Sprint Note

The sprint produces the conditions for HCU recovery; the algorithm decides the timing. Recovery typically realizes at the next core update window. Continue running [[Image and Page Speed Workflow]] on any new or refreshed page after Day 30. Run a fresh `/seo-audit` 30 days after sprint close to measure delta.
