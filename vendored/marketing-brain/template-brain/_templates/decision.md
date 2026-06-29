<%*
const title = await tp.system.prompt("Decision title");
const owner = await tp.system.prompt("Owner (who executes)", "{{client_name}}");
const verifier = await tp.system.prompt("Verifier (who gates acceptance)", "{{owner}}");
await tp.file.rename(title);
-%>
---
type: decision
title: "<% title %>"
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
tags:
  - decision
status: proposed
shipping_status: "release-impacting"
owner: "<% owner %>"
verifier: "<% verifier %>"
acceptance_criteria: []
rollback_plan: ""
related:
  - "[[shipping-rules|shipping rules]]"
  - "[[Content Pruning Decision Framework]]"
sources: []
---

# <% title %>

## Decision

State the decision in one sentence.

## Why

Why this decision over the alternatives. Cite the evidence.

## Alternatives Considered

- Option A: <description, why rejected>
- Option B: <description, why rejected>

## Owner

<% owner %>

## Verifier

<% verifier %>

## Acceptance Criteria

- [ ]
- [ ]

## Validation Evidence

- File path / URL / GSC export / SERP screenshot:
- Date verified:

## Rollback / Undo Plan

How to revert this decision if it turns out wrong. Per [[shipping-rules|shipping rules]] every release-impacting change has a rollback path.

## Shipping Status

- [ ] Drafted
- [ ] Reviewed by verifier
- [ ] Acceptance criteria met
- [ ] Shipped
- [ ] Verified post-ship

## Related

- [[shipping-rules|shipping rules]]
