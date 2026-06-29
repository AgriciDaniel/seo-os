---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
source_manifest_id: ""
source_hash: ""
retrieved_at: ""
last_verified: ""
type: source
title: "FLOW Framework Source"
created: 2026-05-04
updated: 2026-05-04
tags:
  - source
  - flow
  - canonical-reference
status: active
related:
  - "[[FLOW Framework]]"
  - "[[Claude SEO Source|Claude SEO]]"
sources:
  - "github.com/AgriciDaniel/flow"
aliases:
  - "FLOW source"
---

# FLOW Framework Source

Canonical-reference pointer for the FLOW (Find / Leverage / Optimize / Win) framework. The conceptual definition lives at [[FLOW Framework]] (`wiki/concepts/FLOW Framework.md`); this note is the **source documentation pointer** that tracks where the canonical text comes from and when it was last ingested.

## Canonical Source

- Repository: `https://github.com/AgriciDaniel/flow`
- License: CC BY 4.0 (framework and prompts © Daniel Agrici)
- Local snapshot: `.raw/sources/flow/flow-framework.md` (ingested by the marketing-brain skill or by `claude-obsidian:wiki-ingest`)

## Why This Note Exists

The `claude-obsidian:wiki` convention separates **concepts** (the dictionary the rest of the vault uses) from **sources** (the documented origin of each concept). When `claude-obsidian:wiki-ingest` re-ingests the FLOW canonical text, it updates the snapshot at `.raw/sources/flow/flow-framework.md` and bumps the ingested-at timestamp in `.raw/.manifest.json`. This note is the wiki-side handle for that source.

## Ingestion Pattern

To re-ingest:

```
claude-obsidian:wiki-ingest <path-to-flow-framework.md>
```

The ingest creates / updates [[FLOW Framework]] (the concept note) with any new claims and updates this source note's `updated` frontmatter to today's date.

## What's In The Canonical FLOW Text

Find / Leverage / Optimize / Win — the 4-leg strategic framework, with sub-prompts and operational guidance for each leg, plus 1700+ pages of source material on modern SEO that the FLOW skill consumes.

For the conceptual summary applied to {{client_name}}'s site, see [[FLOW Framework]] (concept note in `wiki/concepts/`).
