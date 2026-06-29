<%*
const title = await tp.system.prompt("Audit finding title");
const severity = await tp.system.suggester(
  ["Critical", "High", "Medium", "Low"],
  ["critical", "high", "medium", "low"]
);
await tp.file.rename(title);
-%>
---
type: audit
title: "<% title %>"
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
tags:
  - audit
  - finding
  - <% severity %>
status: open
severity: <% severity %>
verification_status: unverified
related:
  - "[[Pre-Audit Hypothesis]]"
  - "[[HCU Diagnostic Checklist]]"
  - "[[Current Site Findings]]"
sources:
  - "claude-seo audit (cite report path)"
---

# <% title %>

## Severity

**<% severity.toUpperCase() %>** — fix during the indicated phase.

## Finding

What the audit found. State the observable fact, not the interpretation.

## Affected URLs

- URL 1
- URL 2

## Evidence

- Source (claude-seo report / direct fetch / DataForSEO / GSC export):
- File path:
- Date observed:

## Verification

Per [[shipping-rules|shipping rules]], every finding gets a verification pass before action.

- [ ] Independently verified (open the file / page / report)
- [ ] Cross-checked against a second source
- [ ] Confirmed with {{client_name}} where the finding affects business context

Verification status: unverified | verified | refuted

## Recommendation

What to do about it. Cite the relevant flow / decision / template.

## Owner / Verifier

Owner:
Verifier:

## Status

- [ ] Open
- [ ] In progress
- [ ] Resolved (link to fix)
- [ ] Deferred (with rationale)
