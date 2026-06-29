---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: entity
title: "Google Search Console"
created: 2026-05-04
updated: 2026-05-04
tags:
  - google
  - gsc
  - measurement
status: needed
related:
  - "[[{{site_brand}}]]"
  - "[[HCU Recovery Framework]]"
  - "[[Tool Limitations]]"
  - "[[Open Questions for {{client_name}}]]"
sources: []
aliases:
  - "GSC"
  - "Search Console"
---

# Google Search Console

Primary measurement source for {{site_brand}}. Without GSC access, every recommendation in this brain is advisory only. Status: access pending from [[{{client_name}}]].

## Required Properties

- Domain property for `{{site_url}}` (preferred — covers all variants).
- Both `http://` and `https://` URL-prefix variants verified (legacy data continuity).
- Both `www.` and apex-domain variants verified.
- Confirm ownership before any recovery work begins.

## Critical Reports

- **Performance** — queries, pages, countries, devices, search appearance. The 16-month rolling export is the diagnostic backbone.
- **Pages** — indexed vs not indexed, with reasons (crawled-not-indexed, discovered-not-indexed, soft 404, duplicate without canonical). Critical for [[Content Pruning and Consolidation|prune decisions]].
- **Core Web Vitals** — field data per URL group. Cross-reference with monetization settings.
- **Manual Actions** — must be clean before recovery work proceeds.
- **Security Issues** — must be clean.
- **Links** — internal link distribution, top external linking sites, top anchor texts.

## Required Exports for Day 0

- 16-month query export (all queries, all pages, all countries, all devices).
- Top losing pages export (compare last 90 days vs same period prior year — accounts for [[Seasonal Search Demand|seasonality]]).
- Indexation status export with reasons.
- Core Web Vitals report snapshot.

## Privacy Note

- Do not paste raw GSC OAuth tokens, refresh tokens, or property IDs into wiki notes.
- Do not commit OAuth credentials to any repository.
- Aggregate query data is fine in notes; raw user-level data is not present in GSC by design.
- See [[Tool Limitations]] for GSC's sampling and 16-month-window caveats.
