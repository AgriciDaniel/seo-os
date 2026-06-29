<%*
const title = await tp.system.prompt("Prune decision title (e.g. URL or topic)");
const url = await tp.system.prompt("Full URL");
await tp.file.rename(title);
-%>
---
type: prune-decision
title: "<% title %>"
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
tags:
  - prune-decision
status: draft
shipping_status: "release-impacting"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria: []
rollback_plan: "Restore prior CMS revision; remove redirect rule if applied."
related:
  - "[[Content Pruning Decision Framework]]"
  - "[[HCU Diagnostic Checklist]]"
  - "[[Days 6-12 Content Audit and Prune]]"
sources:
  - "GSC Export"
---

# <% title %>

## URL

- Full URL: `<% url %>`
- Page type (per active business-type overlay):
- First published:
- Last updated:

## Current Status (from GSC)

- Reporting window:
- Impressions (last 28 / 90 / 365 days):
- Clicks (last 28 / 90 / 365 days):
- Average position:
- Top queries (with impressions):
- Indexation status (indexed / discovered / crawled-not-indexed / excluded):

## Quality Diagnosis

- Word count and substance:
- E-E-A-T signals present (author bio, dated practice, original evidence): yes/no
- Monetization density:
- CWV impact:
- Duplicate or near-duplicate of: `Other Page`
- Keyword cannibalization with: `Other Page`
- Original assets vs templated:
- Last verified accuracy:

## Decision

Choose one:

- [ ] Keep as-is
- [ ] Rewrite (substantial refresh, same URL)
- [ ] Merge into another URL
- [ ] Redirect (301) to another URL
- [ ] Delete and return 410 Gone
- [ ] Noindex (short-term holding only — must resolve before sprint close)

## Rationale

Why this decision over the alternatives. Cite the GSC numbers and quality signals above.

## Target URL (if Merge / Redirect)

- Target canonical URL:
- Content to migrate:
- Internal links pointing here that must be updated:

## Acceptance Criteria

- [ ] Decision applied in CMS
- [ ] Internal links updated
- [ ] Redirect tested (301 chain length = 1) via `curl -I`
- [ ] GSC URL inspection requested where relevant
- [ ] Sitemap updated

## Owner / Verifier

Owner: {{client_name}}
Verifier: {{owner}}

## Rollback

Restore from CMS revision. If a redirect was applied, remove the redirect rule and re-enable the original URL. Document rollback timestamp in [[Log]].
