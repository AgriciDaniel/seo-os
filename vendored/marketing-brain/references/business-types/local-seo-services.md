---
type: concept
title: "Business Type Overlay — Local SEO Services"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-type
  - overlay
  - local-seo
status: mature
related:
  - "[[FLOW Framework]]"
  - "[[beast-plan-prompt]]"
---

# Local SEO Services — Strategy Overlay

> **How this is used.** During scaffolding, the skill copies this overlay into
> `wiki/concepts/Business Type Overlay.md`. The `beast-planner.md` subagent
> reads it alongside the FLOW canonical when composing the ULTIMATE BEAST
> plan.

Examples in this category: a metro-area digital marketing or SEO agency,
dental practices, law firms, plumbers, HVAC, photographers, fitness studios,
restaurants. Service-area businesses (SAB) and brick-and-mortar both count.

---

## 1. When to use

Pick `--business-type local-seo-services` when:

- The client serves customers **in a defined geographic area** (a metro,
  a county, a service-radius around a physical location).
- The **Google Business Profile** is a (or the) primary discovery
  channel — not just the website.
- Revenue happens through **local prominence** (calls, direction
  requests, walk-ins, bookings), not nationwide search traffic.
- Reviews on Google, Yelp, and industry-specific platforms (Healthgrades,
  Avvo, Houzz, etc.) materially affect new-customer acquisition.

Common-but-wrong picks: a national/multi-location chain (use a hybrid plan
with a local component per location), or a B2B firm whose buyers don't
search by location (use `lead-gen-b2b`).

---

## 2. Revenue model implications

Local services revenue is **prominence × proximity × relevance × intent**
(Google's local-pack ranking factors), monetized as direct-customer
contact (call, form, booking). The CAC math is different from a content
site: a single new customer often pays back a year of SEO work.

### What this changes about the strategy

- **GBP completeness is non-negotiable.** A 100% complete profile (name,
  address, phone, hours, services menu, attributes, products, photos
  weekly, posts weekly, Q&A managed) is the floor, not the goal.
- **NAP (name, address, phone) consistency across the web** is a
  measurable trust signal. Inconsistencies on Yelp, Apple Maps, Bing
  Places, industry directories silently suppress local-pack rankings.
- **Reviews are the moat AND the conversion lever.** Recency, count,
  rating, response rate all feed the local algo. Review acquisition
  needs a process (request after every job, never gate, respond to
  every one).
- **Service area pages and location pages** carry the website's local
  organic story — but they only work when each one has unique
  content (not template-stuffed).
- **"Near me" intent and proximity bias** mean rankings vary by where
  the searcher physically is. Geo-grid rank tracking (multi-point
  scrape) is more honest than single-point rank checks.

### Revenue-stream hierarchy to encode in the plan

1. **GBP-driven calls + direction requests + website clicks** (highest
   intent, shortest path to revenue).
2. **Organic search to service-area / location pages** (cheaper-CAC
   than ads, builds long-term equity).
3. **Review-platform discovery** (Yelp, industry-specific platforms;
   harder to control, still real).
4. **Referral / word-of-mouth** (offline; track via "how did you hear
   about us" intake question).

---

## 3. Content vertical priorities

| Vertical | Purpose | Local-pack lift | Organic lift |
|---|---|---|---|
| **GBP profile** (services menu, photos, posts, Q&A) | Local-pack ranking | High | Indirect |
| **Service pages** (one per service, on-site) | Relevance signal + conversion | Medium | High |
| **Location pages** (one per service-area city/neighborhood) | Proximity-keyword coverage | Medium | High |
| **Review-collection workflow** | Prominence signal | High | Medium |
| **Citations** (NAP-consistent listings) | Prominence signal | Medium | Low |
| **Local news / press / partnerships** | Authority + brand mentions | Low | Medium |
| **Educational / pillar content** | E-E-A-T + AI Overview citations | Low | High |

Hub-and-spoke recommendation:

- One **service hub** per top-revenue service. Hub = the canonical URL
  with the full service explanation, FAQ, pricing transparency where
  possible, named provider, before/after evidence.
- **Location pages as spokes** off the service hubs (e.g.,
  `/dentist-st-paul/` linking back to `/cosmetic-dentistry/`). Each
  location page must have unique local content — neighborhood
  references, real local photos, local press citations, parking notes.
- **Educational content** as a separate top-of-funnel hub — AI Overviews
  pick up educational content first, branded service content second.

---

## 4. Measurement focus

The Dual Surface Scorecard for local services tracks:

### Visibility (the SEO half)

- **Local-pack rank** for top 10 service+geo queries — measured via
  geo-grid (a 5×5 grid centered on the service location with rank
  pulled at each cell — single-point checks lie).
- **GSC impressions + clicks** for service-page + location-page URLs.
- **GBP insights** — profile views, search vs maps, photo views, post
  views, Q&A engagement.
- **Citation count + NAP consistency** (BrightLocal-style audit; can
  be done manually monthly for small geographies).

### Revenue (the business half)

- **GBP actions** — calls, direction requests, website clicks,
  bookings (the four GBP "actions" metrics, weekly trend).
- **Form fills + call tracking** on the website (CallRail / similar
  to attribute calls to source).
- **Booking events** if the practice uses an online booking tool
  (Calendly, Acuity, Square, OpenTable, etc.).
- **Review velocity** (count of new Google reviews per week) and
  **average rating trend** (90-day rolling).
- **Cost-per-acquired-customer** by source — paid vs organic vs
  referral. Local SEO often has the lowest CAC; the plan should
  measure this so the user can defend the spend.

### Refresh cadence

- **Daily** — Google review monitoring + response (response rate is a
  ranking factor).
- **Weekly** — GBP post + Q&A check + call/form review.
- **Monthly** — geo-grid rank pull, citation consistency check,
  service-page refresh queue.
- **Quarterly** — full DataForSEO re-pull, full review audit, full
  competitor radius map (top 20 competitors within service radius).

---

## 5. Anti-patterns specific to local services

These are forbidden in the BEAST plan.

- **Buying reviews / review swaps / fake reviews.** Google detects
  patterns and removes them, often with the listing. Long-term
  damage is catastrophic for local services.
- **Review gating** — surveying customers, then only inviting the
  satisfied ones to leave a public review. Google's policies forbid
  this; many platforms (Yelp especially) flag it aggressively.
- **Fake addresses / virtual office spam in GBP.** Manual action
  risk. GBP suspensions can take months to recover.
- **Keyword stuffing in the GBP business name** ("Best Dentist
  example city/service combinations). Suspendable.
- **Identical content across location pages** (template stuffing).
  Google's HCU update specifically targets this; pages get
  deindexed in clusters.
- **Citations on low-quality / spammy directories.** No NAP-
  consistency benefit; possible negative signal. Stick to industry-
  specific + tier-1 generic directories.
- **Hidden service-area scope** — claiming a service area you can't
  actually service. Hurts conversions and trust.
- **PBNs / link buying / private-link networks.** Same as anywhere
  else. The plan never recommends this.
- **Schema with fabricated review counts** or **wrong NAP** in
  LocalBusiness schema. Manual action risk.
- **Auto-generated "we serve [X] cities" pages** with no real
  on-site differentiation. Either the page has unique local
  content or it's a 410.

---

## AI Overview considerations specific to local services

Local-intent queries trigger AI Overviews that pull from a mix of
GBP data, the website, and review platforms. To rank inside them:

- **GBP data must be complete and correct** — AI Overviews cite GBP
  attributes (hours, services, accepting-new-patients flags, etc.)
  directly.
- **Service pages should answer the most common customer questions**
  in the first paragraph (e.g., "how much does X cost", "do you
  accept Y insurance", "how soon can I get an appointment").
- **Named provider + real-photo + credentials** (DDS, MD, RMT, J.D.,
  whatever applies) on every service page — AI Overviews surface
  named-provider snippets when they exist.
- **Review snippets in schema** that match real reviews on GBP and
  Yelp — inconsistency is a quiet demotion.
- **External citations** to local news, industry-association
  membership pages, professional licensing boards — these signal
  that the practice is a real, recognized local entity.

The BEAST plan's section 7 (AI Overview tactics) should call out
each of these specifically with example URLs from the client's
website + their GBP profile fields.
