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
type: deliverable
title: "Booking Attribution Plan"
created: 2026-05-04
updated: 2026-05-04
tags:
  - deliverable
  - measurement
  - lead-gen
  - conversion
status: seed
related:
  - "[[Service Page Template]]"
  - "[[Days 6-12 Content Audit and Prune]]"
  - "[[Dual Surface Scorecard]]"
  - "[[Open Questions for {{client_name}}]]"
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Business Type Overlay]]"
sources:
  - "Active business-type overlay (lead-gen-b2b / local-seo-services / affiliate-content with attached service brand)"
  - "Direct fetch of conversion-flow pages (pending)"
---

# Booking Attribution Plan

**Applies primarily to**: lead-gen B2B, local SEO services, and affiliate-content sites with an attached service brand. For e-commerce / SaaS / publisher-news sites, this note is replaced by the equivalent decision per the active business-type overlay (e.g., trial-signup attribution for SaaS; product-purchase attribution for e-commerce).

## Decision

Before any consolidation or refresh that changes the conversion path ships in [[Days 6-12 Content Audit and Prune]] or [[Days 13-18 Top Pages Refresh]], the brain commits to a booking attribution plan that captures every reader-to-conversion transition with enough detail to measure per-page conversion contribution. Without this plan in place pre-consolidation, the highest-revenue surface on the site becomes unmeasurable across the change.

## Why now

Lead / booking / signup conversions typically have the highest revenue per converted reader of all monetization streams. Consolidations and refreshes that change the conversion path will shift traffic distribution and CTA flow. Without attribution baselined first, {{client_name}} cannot tell if conversions recovered, dropped, or held flat, and the rollback trigger in any consolidation decision (>20% drop within 21 days) cannot be measured. Per [[shipping-rules]], this is the "plan the undo" requirement applied to the consolidation.

## Required Infrastructure (per Pathway)

To be filled per the active business-type overlay's conversion paths. Generic schema:

- **Pathway A — Web form on the conversion page.** GA4 conversion event named (e.g.) `lead_form_submit` with parameters `source_url`, `service_type` (or product / package / variant — depending on niche), `attribution_path` (organic, paid, direct, referral). Form must include a hidden field that captures the originating URL on submit.
- **Pathway B — Phone click-to-call.** GA4 event `phone_click` with `source_url` parameter. Implement as `tel:` link with click tracking via `gtag('event', ...)`.
- **Pathway C — Email click on contact pages.** GA4 event `email_click` with `source_url` parameter. Implement as `mailto:` link with click tracking.
- **Pathway D — Outbound click to third-party booker / scheduler / partner.** GA4 event `external_referral` with parameters `target_platform` and `source_url`. Whether this pathway is live depends on {{client_name}}'s actual booking infrastructure.
- **Pathway E — Direct contact outside web tracking** (referral, repeat client, phone call from a saved contact). Acknowledged as un-attributable at the web layer. Recommend a short intake question — "How did you find us?" — added to the booking flow to capture qualitative attribution.

## UTM Convention for External Campaigns

Document the schema now even if no campaigns are running, to set the baseline before any paid, social, or email push:

- `utm_source` — the originating platform (e.g., `facebook`, `instagram`, `mailchimp`, `youtube`).
- `utm_medium` — the channel class (`cpc`, `social`, `email`, `referral`).
- `utm_campaign` — the campaign name (e.g., `spring-launch-2026`).
- `utm_content` — the specific creative or link variant (e.g., `hero-cta-v1`, `footer-link`).

All UTM-tagged inbound traffic should be visible in GA4 Acquisition reports and join cleanly to the conversion events above via `source_url` lineage.

## GA4 Conversion Configuration

In GA4 admin, mark the relevant pathway events as conversion events. Create a GA4 audience named "Conversion-event visitors" filtering on any of those events with `source_url` matching conversion-page slugs — this enables future retargeting without re-engineering tracking.

## Cluster-Level Reporting

In GA4, create a saved exploration that pivots the conversion events by `source_url` mapped to the cannibalization clusters in [[Site Inventory and Cannibalization Map]]. This produces the per-cluster conversion view consumed by [[Dual Surface Scorecard]]. Cluster-level rollup is the unit of analysis for whether a consolidation moved conversions, since per-URL counts will collapse together by design after the merge.

## Data Privacy and Consent

GA4 must respect cookie consent. Implement Google Consent Mode v2 so events fire only with consent or in a privacy-preserving cookieless mode where required (PIPEDA, GDPR, CCPA, Quebec Law 25, etc., depending on audience). This is a guardrail, not optional — non-compliant tracking is both a legal risk and a quality signal risk.

## Owner / Verifier / Acceptance / Rollback

- **Owner:** {{client_name}} — configures GA4, the form, the click tracking, and the consent layer.
- **Verifier:** {{owner}} — confirms each event fires correctly in GA4 DebugView before any consolidation ships, and confirms the cluster pivot exploration is saved.
- **Acceptance:** each pathway fires its named event with all required parameters in GA4 DebugView; the cluster pivot exploration is created and saved; Consent Mode v2 is active; baseline week of conversion data is captured before any consolidation diff lands.
- **Rollback:** GA4 events can be disabled via admin without code changes; form hidden fields and click trackers can be removed by reverting the page edits. No data destruction risk — historical events remain queryable in GA4.

## Open Dependencies

The following items in [[Open Questions for {{client_name}}]] block full execution of this plan and must be resolved before Acceptance can pass:

- GA4 access and historical baseline.
- Conversion infrastructure inventory (form provider, phone system, email, scheduler / booker / CRM).
- Consent management platform decision (if not already in place).

These are flagged as blocking. Do not assume defaults; confirm with {{client_name}} before configuring.

## Cross-references

- [[Service Page Template]] — the page type whose conversion contribution this plan measures.
- [[Dual Surface Scorecard]] — the Win-stage scorecard that consumes the cluster-level conversion view.
- [[Days 6-12 Content Audit and Prune]] — the flow that executes any consolidation impacting the conversion path.
- [[Open Questions for {{client_name}}]] — where the blocking dependencies live.
- [[Day 0 Measurement Access Gate]] — the upstream gate that must pass before any of this is configurable.
