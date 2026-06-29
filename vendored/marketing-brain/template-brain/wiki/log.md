---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Log"
created: 2026-05-04
updated: 2026-05-04
tags:
  - log
  - marketing-brain
status: active
related:
  - "[[Index]]"
  - "[[Hot]]"
sources: []
aliases:
  - Log
---

# Log

**Convention**: append-only. **Newest entries at the TOP.** Never edit or delete past entries — if a prior decision was wrong, file a new entry with the correction and a pointer to the prior entry. The log is the auditable history of what happened, when, and why.

Each entry: `## YYYY-MM-DD — <short title>` followed by paragraph(s) of detail.

---

## {{date}} — Vault scaffolded from marketing-brain template

Vault scaffolded from the `marketing-brain` template for **{{client_name}}** and `{{site_url}}` ({{niche}}). Business-type overlay applied: `{{business_type}}`. Placeholders filled across CODEX, hot, index, overview, log, all wiki notes, and the templates folder. `.raw/.manifest.json` initialized with the canonical schema. `.obsidian/` pre-configured (graph filters hide `.raw/`, `_attachments/`, `_templates/`; CSS snippet color-codes wiki folders; community plugins pre-recommended).

Next expected entry: Day 0 baseline capture once {{client_name}} connects measurement surfaces and runs the first `claude-seo` audit. See [[Day 0 Measurement Access Gate]] and [[Open Questions for {{client_name}}]] for the prerequisite list.
