---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: concept
title: "FLOW Framework"
created: 2026-05-04
updated: 2026-05-04
tags:
  - flow
  - framework
status: active
related:
  - "[[HCU Recovery Framework]]"
  - "[[{{site_brand}}]]"
  - "[[{{client_name}}]]"
sources:
  - "github.com/AgriciDaniel/flow"
aliases:
  - "FLOW"
---

# FLOW Framework

Framework and prompts © Daniel Agrici, CC BY 4.0 — github.com/AgriciDaniel/flow

FLOW means Find -> Leverage -> Optimize -> Win.

- **Find**: identify demand and keyword gaps.
- **Leverage**: build off-site corroboration, reviews, citations, and links.
- **Optimize**: improve owned pages for humans, search engines, and AI extraction.
- **Win**: connect visibility to leads and business outcomes.

## Applied to {{client_name}}'s Site

The order of operations and the inputs change depending on the site's posture (recovery vs growth) and business type. The active business-type overlay at `[[Business Type Overlay]]` adapts the FLOW emphasis accordingly.

### Find

Two inputs run in parallel:

1. **GSC loss-query mining** (recovery posture) — the 16-month performance export shows queries the site used to rank for and no longer does. Highest-leverage targets because intent and surface are already proven.
2. **Competitor gap analysis** via DataForSEO (every posture) — what are the top competitors ranking for that this site is not? The marketing-brain skill's 6-step pipeline produces this as a deduplicated XLSX with 4 sheets (High Opportunity, Hidden Gems, High Volume, All Keywords) — see [[XLSX Structure Reference]].

If the site is post-algorithmic-demotion, prioritize loss-query mining over net-new keyword discovery. If the site is greenfield or near-greenfield, the order flips.

### Leverage

The off-site presence work that builds trust signals. Specifics depend on business type — see the active overlay — but the structure is consistent:

- Author trust (verifiable bio, credentials, photos, dated practice history).
- Original proof artifacts (photos / case studies / testimonials / data — whatever the niche makes verifiable).
- Community and authority signals (forums, podcasts, regulatory citations, partner mentions — niche-specific).

See [[Distributed Presence Workflow]] for the operational rhythm.

### Optimize

**Prune, merge, refresh** the existing surface area before publishing anything new. The site is almost always too big for its current trust level — adding more pages compounds the problem. See [[Content Pruning and Consolidation]] and [[HCU Recovery Framework]].

### Win

Visibility-to-revenue linkage. The unit of measurement is the [[Dual Surface Scorecard]] which segments visibility metrics (impressions, clicks, average position, AI Overview presence, Core Web Vitals) and business metrics (display revenue, affiliate revenue, lead-form events, trial signups, product orders — depending on business type) by content cluster.

The Win signal is **both** moving together: visibility up + business up. Visibility moving without business moving means the conversion path is broken (audit it). Business moving without visibility means qualitative attribution (referral / brand / repeat) — capture it via intake question.
