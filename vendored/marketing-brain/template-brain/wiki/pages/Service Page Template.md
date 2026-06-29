---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
surface: organic-search
funnel_stage: ""
impact_score: 0
effort_score: 0
type: page-brief
title: "Service Page Template"
created: 2026-05-04
updated: 2026-05-04
tags:
  - page-brief
  - template
  - service-page
  - lead-gen
  - local-seo
  - eeat
status: template
related:
  - "[[Pillar Page Template]]"
  - "[[Location Guide Template]]"
  - "[[Comparison Page Template]]"
  - "[[Booking Attribution Plan]]"
  - "[[SERP-First Content Creation Gate]]"
  - "[[Keyword Cannibalization Ledger]]"
sources:
  - "Google Quality Rater Guidelines"
---

# Service Page Template

Canonical structure for service-offering pages — a lead-gen B2B agency's "Conversion Rate Optimization" page, a local plumbing company's "Drain Cleaning" page, a marketing consultant's "SEO Audit" page. Used primarily by the **lead-gen-b2b** and **local-seo-services** business-type overlays.

Service pages carry the highest revenue per converted reader of all page types in those verticals. They must convert without resorting to dark patterns or hidden information.

## Recommended Outline

1. Service Overview (H1 + 2-3 sentence summary) — what the service is, who it's for, what outcome it produces. The first paragraph passes the "Quick Answer" test for AI extraction.
2. ICP / Audience Section — who this service is for, who it's NOT for. Specificity helps conversion AND helps Google match the page to the right query.
3. Problem Framing — the named pain the service solves. Quote the way the ICP describes the problem; don't translate it into industry jargon.
4. What's Included / Deliverables — concrete list of what the customer gets. Avoid "comprehensive" / "best-in-class" / "industry-leading" — say what's in the box.
5. Process / How It Works — step-by-step from inquiry to delivery. Time estimates per step where honest.
6. Pricing Posture — a price band, a starting price, a "request a quote", or a transparent fixed price. NEVER hide pricing entirely — that's an HCU and a CRO failure simultaneously.
7. Case Studies / Proof — at least 2 named results with verifiable details (industry, scope, outcome metric). Link to deeper case-study pages where they exist.
8. FAQ — from People Also Ask plus genuine sales-call questions.
9. Social Proof Block — testimonials with attribution (full name, company, photo if permission granted), industry awards, partner logos with permission.
10. Strong CTA — single primary CTA per page (book a call / request a quote / start trial). Avoid "click here for more info" — be specific about what happens next.
11. Author / Practitioner Bio — the named expert who delivers the service, with credentials.

## Required E-E-A-T Signals

- Named experts who deliver the service (with photos, credentials, links to LinkedIn / external profiles).
- Real client / customer outcomes (named where permission granted; anonymized only where required).
- Honest process documentation — time estimates, deliverables, what's NOT included.
- Visible pricing posture — no "request a quote" black box without giving the reader something to anchor on.
- Testimonials with full attribution.

## Schema

- `Service` (required) with `provider`, `serviceType`, `areaServed`, `offers` (with price or priceRange).
- `LocalBusiness` if the service is delivered locally — full NAP (Name, Address, Phone) consistent with GBP.
- `BreadcrumbList`.
- `FAQPage` for the FAQ section.
- `Review` / `aggregateRating` ONLY if real reviews exist on the page with verifiable authors. No fabricated review counts.
- `Person` for the practitioner bio with `sameAs` linking to LinkedIn / external profiles.

## Conversion Path

Cross-reference [[Booking Attribution Plan]] (lead-gen overlay) for the GA4 event setup that tracks each conversion path:

- Form submission → `lead_form_submit` event.
- Phone click → `phone_click` event.
- Email click → `email_click` event.
- External booker click (e.g., Calendly, FishingBooker) → `external_referral` event.

Without these events configured, the page's conversion contribution is invisible.

## Pre-Flight Checklist

- Passes [[SERP-First Content Creation Gate]] — current SERP rewards service pages at this granularity (vs comparison pages, vs how-to articles).
- Primary keyword reserved in [[Keyword Cannibalization Ledger]] with this URL as owner.
- All testimonials and case studies have permission documented.
- Pricing posture decision made — pricing visible OR clear "request a quote" with specific next-step CTA.
- Conversion events configured in GA4 per [[Booking Attribution Plan]].
- CWV check passes per [[Monetization Density Guardrails]] — lead-capture forms count as monetization elements.

## Anti-pattern

- "Industry-leading" / "best-in-class" / "comprehensive" copy without specifics. Modern algorithms read this as content padding.
- Hidden pricing with no signal at all (not even a band).
- Testimonials without attribution — they read as fabricated.
- Multiple competing CTAs on one page (book a call AND start trial AND download whitepaper) — pick one primary.
- Stock photos posing as team photos. Use real headshots or no headshots.
