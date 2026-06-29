---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Business Type Overlays Hub"
created: 2026-05-04
updated: 2026-05-04
tags:
  - business-types
  - overlays
  - hub
status: active
related:
  - "[[Index]]"
  - "[[Affiliate Content]]"
  - "[[Local SEO Services]]"
  - "[[SaaS]]"
  - "[[Ecommerce]]"
  - "[[Lead Gen B2B]]"
  - "[[Publisher News]]"
sources: []
aliases:
  - Business Types
  - Overlays
---

# Business Type Overlays Hub

Adaptable strategy variants. The same template-brain skeleton works across six verticals; the active overlay defines what changes for the specific revenue model, content priority, measurement focus, and anti-pattern guardrails. Read the active overlay before starting any sprint work.

## How Overlays Work

The marketing-brain skill takes a `--business-type` flag at scaffold time:

```
/marketing-brain new <client-slug> <site-url> --business-type <type>
```

Where `<type>` is one of the kebab-case slugs below. The skill:

1. Loads `wiki/business-types/<Title Case File>.md` as the active overlay (slot-fills any references throughout the rest of the vault).
2. Renames niche-specific files where the overlay calls for it (e.g., for lead-gen overlays, `Affiliate Disclosure Standards.md` may be augmented with or replaced by `Lead Capture Disclosure.md`).
3. Removes files that don't apply to the chosen vertical (e.g., `Booking Attribution Plan.md` is preserved for lead-gen overlays but removed or marked N/A for SaaS and e-commerce, where conversion attribution is plan-equivalent but pathway-different).

The user can manually swap the overlay later by editing `CODEX.md`'s `{{business_type}}` reference and re-running the skill's slot-fill pass.

## Slug → File Mapping

| CLI slug | Wiki file |
|---|---|
| `affiliate-content` | [[Affiliate Content]] |
| `local-seo-services` | [[Local SEO Services]] |
| `saas` | [[SaaS]] |
| `ecommerce` | [[Ecommerce]] |
| `lead-gen-b2b` | [[Lead Gen B2B]] |
| `publisher-news` | [[Publisher News]] |

Filenames stay Title Case with spaces (per Obsidian wikilink resolution requirements). The CLI accepts kebab-case for shell-friendliness.

## Overlay Structure (consistent across all 6)

Every overlay has the same 5 sections, in the same order, so cross-referencing is trivial:

1. **When to use this overlay** — characteristic patterns of the business type. Helps the chair decide whether the chosen overlay is right.
2. **Revenue model implications** — what the primary and secondary monetization surfaces look like. Drives the [[Dual Surface Scorecard]] columns and the [[Monetization Density Guardrails]] specifics.
3. **Content vertical priorities** — which page templates dominate ([[Pillar Page Template]] / [[Gear Review Template]] / [[Location Guide Template]] / [[Service Page Template]] / [[Product Page Template]] / [[Comparison Page Template]]) and which clusters carry the topical-authority load.
4. **Measurement focus** — which conversion events, which monetization-surface metrics, which off-site signals. Drives the [[Booking Attribution Plan]] (or equivalent) configuration.
5. **Anti-patterns specific to this vertical** — failure modes that don't apply (or apply differently) to other business types. Read this before any sprint decision that touches monetization or content type.

## How to Add a New Vertical

1. Copy an existing overlay file as `<New Vertical>.md`.
2. Fill the 5 sections per the structure above.
3. Add the slug → file mapping to the table in this `_index.md`.
4. Add the `<new-slug>` to the `--business-type` choices list in the marketing-brain skill's CLI.
5. Add `<new-slug>` to the `_vault_renderer.py` slug → file lookup.

Constrain to 6-10 verticals max. Beyond that, overlays start overlapping and the maintenance burden compounds — better to extend an existing overlay with a sub-mode than to add a new top-level vertical.
