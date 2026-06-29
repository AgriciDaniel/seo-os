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
title: "Dual Surface Scorecard"
created: 2026-05-04
updated: 2026-05-04
tags:
  - deliverable
  - measurement
  - flow-win
status: template
related:
  - "[[FLOW Framework]]"
  - "[[Full FLOW Review]]"
  - "[[Implementation Roadmap]]"
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Booking Attribution Plan]]"
  - "[[Seasonal Search Demand]]"
  - "[[Monetization Density Guardrails]]"
  - "[[HCU Recovery Framework]]"
  - "[[Business Type Overlay]]"
sources:
  - "[[FLOW Framework]]"
  - "[[Full FLOW Review]]"
  - "[[Site Inventory and Cannibalization Map]]"
  - "[[Booking Attribution Plan]]"
  - "[[HCU Recovery Framework]]"
---

# Dual Surface Scorecard

## 1. Purpose

The single tracker that connects **visibility surfaces** (search rankings, impressions, AI mentions, page experience) to **business surfaces** (revenue, leads, signups, bookings — depending on business type) for `{{site_url}}`, segmented by the cannibalization clusters from [[Site Inventory and Cannibalization Map]].

Per [[FLOW Framework]] canonical: visibility is meaningless if it does not connect to a business outcome; revenue is unstable if it does not trace to a visibility surface that can be defended or improved. **The Dual-Surface Scorecard IS the Win deliverable** — it is how {{client_name}} (and any future agent) sees the full picture in one place.

## 2. How to Use

- **During the 30-day sprint**: open weekly. Compare to prior week and to the same week prior year (year-over-year matters more than week-over-week in seasonal niches per [[Seasonal Search Demand]]).
- **After the sprint closes**: open every two weeks until [[HCU Recovery Framework]] inflection signals appear, then return to weekly cadence around any Google core update window.
- **Per cluster row**: fill visibility columns from GSC, page-experience columns from PageSpeed Insights and CrUX field data, revenue columns from the active monetization surface (per business type — see [[Business Type Overlay]] and [[Booking Attribution Plan]]).
- **Period framing**: visibility = 7-day rolling deltas; revenue = 28-day rolling (smooths variance). Year-over-year overlay where data exists.
- **Time budget**: 30-45 minutes per weekly fill. If it takes longer, the access gate is incomplete — return to [[Day 0 Measurement Access Gate]].

## 3. The Scorecard

**TEMPLATE — every cell is `_pending day 0_` until baselines land per [[Day 0 Measurement Access Gate]]. The structure is the deliverable; the data lands during execution.**

The skill populates one row per cluster (typically 5-10 clusters per site, derived from [[Site Inventory and Cannibalization Map]]) plus a site-wide rollup row.

| Cluster | Canonical Owner URL | Spokes | Impr WoW | Clicks WoW | Avg Pos | Top-10 Kw | AI Overview / SGE | CWV Pass (CrUX) | Monetization Metric (28d) | Secondary Revenue Surface (28d) | Conversion Events (28d) | Visibility-to-Revenue Note | Decision Flag |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TBD | TBD | TBD | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ |
| **SITE-WIDE ROLLUP** | `{{site_url}}` | All URLs | _pending day 0_ | _pending day 0_ | _n/a (site avg)_ | _pending day 0_ | _count of clusters with AIO presence_ | _% URLs passing CWV_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ | _pending day 0_ |

**Decision Flag legend**: `continue` / `refresh` / `consolidate` / `investigate` / `escalate to {{owner}}`. **Visibility-to-Revenue Note examples**: "impressions up 18%, RPM steady, bookings up 2 — continue" / "impressions up 30% but EPC down — affiliate hygiene check" / "no change visibility, bookings up — capture qualitative source via intake question" / "impressions flat, CWV degraded — reduce ad density per [[Monetization Density Guardrails]]".

## 4. Per-Cluster Baseline Capture Instructions

Cross-reference [[Day 0 Measurement Access Gate]] for access prerequisites. For every cluster: GSC segment is `query OR page in cluster URLs from [[Site Inventory and Cannibalization Map]]`, 16-month range. Monetization surface segment varies by business type — see active overlay.

To be filled per cluster by skill.

## 5. Site-Wide Rollup Row

Already present at the bottom of the scorecard table. The single row that answers **"is the recovery / growth working?"** Aggregations:

- Impressions and clicks: simple sum across all URLs.
- Avg position: not aggregated — site-average is misleading; track at cluster level only.
- Top-10 keyword count: distinct count across clusters.
- AI Overview presence: count of clusters with at least one AIO inclusion this period.
- CWV pass: percentage of URLs passing Core Web Vitals on CrUX field data.
- Monetization metric: per business type (session-weighted RPM for affiliate / display; sum for affiliate clicks; sum for product orders; rate for trial signups).
- Conversion events: sum across event types defined in [[Booking Attribution Plan]] (or business-type equivalent).

## 6. Lead Indicators vs Lag Indicators

Visibility metrics are **LEAD indicators** — they move first when SEO work lands. Rankings, impressions, AI inclusion, and CWV typically respond within 2-6 weeks of consolidation, refresh, and E-E-A-T work.

Business metrics are **LAG indicators** — they move second, sometimes 4-12 weeks later for HCU recovery per [[HCU Recovery Framework]]. Display revenue lags traffic mix shifts. Affiliate revenue lags both traffic and seasonal buying intent. Lead / booking / trial events lag everything because the buyer journey includes off-site research, calendar coordination, planning.

Diagnostic rules:

- **Visibility moves, business doesn't** → investigate the conversion path. Is the affiliate link broken? Is the booking CTA below the fold? Is the cluster pulling wrong-intent traffic?
- **Business moves, visibility doesn't** → capture qualitative attribution. Add an intake question ("how did you find us?"). Source may be brand, referral, or repeat — not search.
- **Both move together** → continue. This is the FLOW Win signal.
- **Neither moves after 12 weeks** → escalate to {{owner}}. Recovery hypothesis may be wrong; revisit [[Full FLOW Review]] and [[HCU Recovery Framework]].

## 7. Alerting Thresholds

**INDICATIVE — not data-derived. Calibrate after 8-12 weeks of baseline data.**

- **Cluster impressions drop >20% week-over-week** → investigate same week. Check for ranking loss on the canonical owner URL, deindexed pages, or seasonal collapse.
- **Site-wide CWV moves to "needs improvement"** → reduce monetization density and re-test per [[Monetization Density Guardrails]].
- **Conversion events flatline for 4+ weeks while impressions on a cluster rise** → conversion path broken. Audit per [[Booking Attribution Plan]] or business-type equivalent.
- **AI Overview inclusion lost on a query that previously had it** → investigate same week. AI surfaces are volatile; treat loss as a signal to check Information Gain and E-E-A-T on the source page.
- **Monetization surface metric drops >30% month-over-month** → hygiene check. Broken links, expired programs, geography mismatch.
- **Site-wide impressions drop >10% week-over-week with no seasonal explanation** → escalate to {{owner}}. Possible algorithmic event.

## 8. What NOT to Put in This Scorecard

Per FLOW, every metric in this scorecard must connect to either a buyer surface (visibility) or a business surface (revenue). Excluded:

- Page views without segment.
- Time on page without an engagement event.
- Bounce rate (GA4 deprecated; engagement rate is the modern equivalent and even that belongs on a UX scorecard).
- Follower counts on social platforms {{client_name}} does not own with intent.
- Domain Authority, Domain Rating, or any third-party authority score (proxy metric, not a buyer or business surface).
- Backlink count without segmentation by referring-domain quality.
- Total keywords ranking (vanity — only Top-10 and AI-surface inclusion belong here).
- Average session duration site-wide.

## 9. Owner / Verifier / Acceptance / Rollback

Per [[shipping-rules]]:

- **Owner**: {{client_name}} — collects data weekly during the 30-day sprint, every two weeks after.
- **Verifier**: {{owner}} — reviews scorecard at weekly check-in during sprint; bi-weekly after.
- **Acceptance criteria**:
  1. Each cluster row has at minimum visibility (impressions WoW, clicks WoW, avg position) + monetization-surface metric + conversion events populated each period.
  2. Site-wide rollup row populated each period.
  3. Week-over-week deltas calculated and marked (up / down / flat with magnitude).
  4. Year-over-year overlay added once 12 months of data exist.
  5. Visibility-to-revenue note written for every row — not left blank.
  6. Decision flag set on every row.
- **Rollback**: not applicable — this is a tracker, not a release-impacting artifact. If the scorecard is wrong, fix the math; no production impact on `{{site_url}}`.

## 10. Cross-references

- [[FLOW Framework]] — canonical definition of the Win leg this scorecard satisfies.
- [[Full FLOW Review]] — the diagnostic the scorecard is designed to track recovery against.
- [[Implementation Roadmap]] — the 30-day sprint whose results show up here.
- [[Day 0 Measurement Access Gate]] — prerequisite access; until closed, every cell stays `_pending day 0_`.
- [[Site Inventory and Cannibalization Map]] — source of the cluster definitions and canonical owner URLs.
- [[Booking Attribution Plan]] — defines the conversion events summed in the conversion-events column (lead-gen overlay).
- [[Seasonal Search Demand]] — overlay required when reading week-over-week deltas in seasonal niches.
- [[Monetization Density Guardrails]] — referenced from the CWV alerting threshold.
- [[HCU Recovery Framework]] — explains why business-surface lag can extend 4-12 weeks past visibility-surface recovery.
