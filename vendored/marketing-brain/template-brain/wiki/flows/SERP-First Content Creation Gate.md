---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "SERP-First Content Creation Gate"
created: 2026-05-04
updated: 2026-05-04
tags:
  - content
  - serp
  - dataforseo
  - cannibalization
  - gate
status: active
shipping_status: "active"
owner: "Brief author ({{client_name}})"
verifier: "{{owner}} (before publish)"
acceptance_criteria:
  - "All 6 Required Steps completed and evidence attached to the brief"
  - "Primary keyword reserved in [[Keyword Cannibalization Ledger]]"
  - "SERP screenshot, intent classification, and information gain list saved with the brief"
rollback_plan: "Failing the gate means the page is not drafted. No site changes to revert. Cannibalization reservation can be released."
related:
  - "[[Keyword Cannibalization Ledger]]"
  - "[[Days 13-18 Top Pages Refresh]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
  - "[[Pillar Page Template]]"
  - "[[PAA Mining Digest]]"
sources:
  - "FLOW Framework — github.com/AgriciDaniel/flow"
---

# SERP-First Content Creation Gate

Reusable gate. Runs BEFORE any new page or refresh.

## Purpose

No content starts without confirming SERP intent and reserving the primary keyword. This gate catches three of the most common failure modes: writing for an intent the SERP no longer rewards, cannibalizing an existing URL, and publishing without measurable information gain.

## Required Steps

1. **Pull current SERP top 10** for the primary keyword. Use DataForSEO via claude-seo, or capture manually with date and location stamped. Save the screenshot.
2. **Classify intent** — informational / commercial / transactional / local. Confirm the planned page type matches.
3. **List every information gain item** the page will add vs the current SERP top 10. Minimum bar from [[Days 19-24 New Hero Content and Information Gain]]: at least 3 items.
4. **Check [[Keyword Cannibalization Ledger]]** — does this primary keyword (or same-intent variant) already have an owner URL? If yes, refresh the owner URL instead of creating new. Resolve cannibalization before drafting.
5. **Reserve the primary keyword** to the planned URL in the ledger. Reservation includes date, owner URL, brief author.
6. **Attach evidence** to the content brief — SERP screenshot, intent classification note, information gain list, ledger reservation reference. Cite the relevant rows from [[PAA Mining Digest]] for FAQ planning.

## Failure Mode

If any step fails or is uncertain, do NOT draft the page. Options:

- Pick a different primary keyword and restart the gate.
- Convert the slot to a refresh of the existing owner URL.
- Defer the page until evidence (e.g. proof artifacts for information gain) exists.

Drafting before the gate passes wastes effort and risks publishing a page that adds noise instead of authority.

## Owner / Verifier

Owner: brief author ({{client_name}} for in-sprint pages). Verifier: {{owner}} before publish — gate evidence is reviewed alongside the draft.

## Acceptance

All 6 Required Steps completed with evidence attached to the brief. Cannibalization Ledger updated with the reservation.

## Rollback

Failing the gate means no page was drafted. No site changes to revert. If a reservation was made and the page is later abandoned, release the reservation in the ledger so a future page can claim the keyword.
