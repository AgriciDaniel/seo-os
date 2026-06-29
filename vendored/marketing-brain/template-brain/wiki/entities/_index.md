---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Entities Hub"
created: 2026-05-04
updated: 2026-05-04
tags:
  - entities
  - hub
status: active
related:
  - "[[Index]]"
sources: []
aliases:
  - Entities
---

# Entities Hub

People, brands, tools, and competitors relevant to {{client_name}}'s site. Entity notes hold the canonical reference for each — when a flow or decision mentions an entity, the entity note is the single source of truth for who/what they are and why they matter.

## People

- [[{{client_name}}]] — site owner
- (Additional named experts and stakeholders are added by the skill if they surface in audit / SERP data)

## Brands

- [[{{site_brand}}]] — the site itself
- (Sister brands, parent companies, partner brands added as they surface)

## Competitors

- [[Primary Competitors]] — the canonical Tier 1-4 competitor list, populated by the marketing-brain skill from DataForSEO `competitors_domain` data and SERP top-10 evidence.

## Tools and Platforms

- [[Google Helpful Content System]] — the algorithmic system whose suppression posture we reverse.
- [[Google Search Console]] — primary measurement source.
- [[Google Analytics 4]] — secondary measurement source.

## Adding New Entities

When the audit or research surfaces a new entity (a recurring competitor in SERPs, a regulatory body, a key partner, a named expert author), add a note here following the entity frontmatter schema (`type: entity`, plus `tier`, `domain`, `intersection_count`, `etv` for competitors so the [[competitors.base|competitors.base]] view picks them up).
