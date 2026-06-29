---
name: marketing-brain
description: >
  Source-available SEO and content marketing strategy brain. Use when the user
  wants to scaffold or operate a Marketing Brain vault, run DataForSEO competitor
  and keyword research, build a keyword workbook, synthesize a source-cited
  BEAST plan, render a client report, or decide the next marketing action.
version: 0.1.5
license: Proprietary source-available
argument-hint: "[command or site URL]"
metadata:
  author: AgriciDaniel
  category: marketing
---

# Marketing Brain

Marketing Brain ships two artifacts:

1. `assets/template-brain/` — an Obsidian vault template for SEO/content strategy.
2. `marketing-brain` CLI plus `scripts/` — the operator layer used by Codex, Claude, or a shell.

The product is read-only/advisory. It does not mutate Search Console, GA4, CMS,
DNS, GBP, or publishing systems. It does not guarantee rankings, traffic, or AI
Overview inclusion.

## Read Order

When opening a vault:

1. Read `CODEX.md`.
2. Read `wiki/hot.md`.
3. Read `wiki/index.md`.
4. Open the relevant note or hub.

Keep `wiki/hot.md`, `wiki/index.md`, `wiki/overview.md`, and `wiki/log.md`
current after meaningful work.

## Commands

```bash
marketing-brain new <client-slug> --site <url> --business-type <type> --owner <name> --niche <text>
marketing-brain competitors --vault <path> --site <url> [--seed-keywords <csv> --dry-run]
marketing-brain keywords --vault <path> [--dry-run]
marketing-brain xlsx --vault <path>
marketing-brain paa --vault <path> [--dry-run]
marketing-brain synthesize --vault <path>
marketing-brain report --vault <path> [--html-only]
marketing-brain next --vault <path>
marketing-brain lint --vault <path> [--template]
marketing-brain demo
```

Backwards-compatible scripts remain available under `scripts/`.

## Business Types

Valid `--business-type` values:

- `affiliate-content`
- `local-seo-services`
- `saas`
- `ecommerce`
- `lead-gen-b2b`
- `publisher-news`

## Safety Rules

- Never write credentials into vault notes, manifests, reports, fixtures, or ZIPs.
- Raw paid-data responses under `.raw/` must be immutable and private (`0600`).
- No implementation recommendation is approved until source, confidence, owner,
  approval status, and rollback note are present.
- Do not promise rankings, traffic, recovery dates, or AI Overview inclusion.
- Treat AI-assisted content as draft support only; scaled content without added
  value can violate Google spam policies.

## Current Search Rules

Use `references/current-search-requirements-2026-05-11.md` for current official
Google/DataForSEO/Obsidian claims. In short:

- Google says standard SEO fundamentals apply to AI Overviews and AI Mode.
- There are no additional technical requirements, special schema, or AI text files required for AI features.
- Search Console reports AI feature traffic in the overall Web performance data.
- DataForSEO endpoint claims must match the official endpoint docs.

## Release Gates

Before calling a release market-ready, run:

```bash
python -m compileall scripts marketing_brain tests
python scripts/generate_editorial_assets.py
python scripts/lint_vault.py --vault assets/template-brain --template
python tests/test_pipeline.py
python scripts/build_demo_vault.py
python scripts/package_release.py --version 0.1.5
```

If live DataForSEO credentials are present, run a capped live verification path.
If credentials are missing, mark live verification as blocked rather than passed.
