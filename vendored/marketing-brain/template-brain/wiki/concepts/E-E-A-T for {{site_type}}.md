---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "E-E-A-T for {{site_type}}"
created: 2026-05-04
updated: 2026-05-04
tags:
  - eeat
  - trust
status: active
related:
  - "[[Google Helpful Content System]]"
  - "[[HCU Recovery Framework]]"
  - "[[Information Gain]]"
  - "[[{{client_name}}]]"
  - "[[Business Type Overlay]]"
sources:
  - "Google Search Quality Rater Guidelines"
aliases:
  - "EEAT"
  - "E-E-A-T"
---

# E-E-A-T for {{site_type}}

Experience, Expertise, Authoritativeness, Trust — the dimensions Google's Search Quality Rater Guidelines use. Heaviest for YMYL (Your Money or Your Life) topics, and material for any site where bad advice or hidden monetization can mislead users. For {{site_url}} specifically, the active business-type overlay at `[[Business Type Overlay]]` defines what "experience" and "expertise" look like in this vertical.

## Experience

Verifiable practice. The signal that AI cannot fake.

Generic markers (refine per business type):

- Dated proof of doing the thing the site claims to teach (photos, screenshots, deliverables, case studies).
- Conditions / context logged (when, where, with what tools).
- Real artifacts produced — not theoretical descriptions of artifacts.
- Named subjects, locations, or accounts the author has actually worked with.
- "Last practiced / tested / verified" timestamps on relevant pages.

## Expertise

Demonstrated domain knowledge.

- Ability to explain technique with rationale, not generic copy. Specificity beats summarization.
- Knowledge tied to the site's actual operating context (regional / industry / use-case specifics).
- Recommendations explained by use case, not by spec sheet.
- Time-sensitive knowledge accurate to current source (regulations, prices, product availability, platform versions).

## Authoritativeness

Recognition by others in the niche.

- Author bio with credentials, photo, real name, contact path.
- About page that explains who runs the site, why, and what their qualifications are.
- Contributor credits if any guest material exists.
- Mentions on other sites, podcasts, conferences, or industry publications relevant to the niche.

## Trust

The structural signals that say "this is a real publisher".

- Clear monetization disclosure (above the fold, plain language).
- Transparent contact, About, and Privacy pages.
- Accurate time-sensitive facts sourced to authoritative origins with link.
- No clickbait headlines.
- Honest reviews / case studies / testimonials — including negatives, including "do not buy" / "did not work for us".
- Visible publish date and last-updated date on every article.

## Verifiable Artifacts Checklist

Each dimension must produce a verifiable artifact on-page. A claim of "experience" with no dated proof is not E-E-A-T — it is a claim. The audit task is to inventory existing pages against this checklist and flag every gap.

## Vertical-Specific Adaptation

The active business-type overlay at `[[Business Type Overlay]]` should specify:

- What "experience" means in this vertical (real on-water trip logs for fishing affiliate; deployed case studies for SaaS; before/after job photos for local service; audited financial outcomes for B2B lead-gen).
- What "expertise" looks like (named techniques, named tools, named outcomes).
- What "authoritativeness" channels exist (which podcasts, forums, publications, conferences are the trust currency).
- What "trust" structures the vertical demands (FTC affiliate disclosure / GDPR consent / FDA-compliant claims / SOC2 transparency — depending on niche).

If the overlay does not define these, file an Open Question and add the answer to the overlay.
