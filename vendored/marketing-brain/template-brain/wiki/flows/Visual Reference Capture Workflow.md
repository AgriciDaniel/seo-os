---
brain_schema: marketing-brain.v1
type: flow
title: "Visual Reference Capture Workflow"
created: 2026-05-06
updated: 2026-05-06
tags:
  - visual-reference
  - screenshots
  - images
  - evidence
status: active
shipping_status: "active"
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Remove the capture folder and generated source note if a source was collected by mistake."
risk_level: medium
business_type: {{business_type}}
verifier: "{{owner}}"
acceptance_criteria:
  - "Desktop and mobile screenshots captured for the source page"
  - "Owned or licensed source images separated from public-reference-only images"
  - "A style note records palette, composition, image treatment, and reuse boundaries"
rollback_plan: "Reference captures are non-production raw evidence. Remove the capture folder and generated source note if a source was collected by mistake."
related:
  - "[[Image and Page Speed Workflow]]"
  - "[[Information Gain]]"
  - "[[SERP-First Content Creation Gate]]"
sources: []
---

# Visual Reference Capture Workflow

Use this before refreshing page imagery, planning a new hero visual, or generating images that should match the client's existing style. The goal is to build a dated proof and style bank, not a folder of random inspiration images.

## When To Run

- Day 0, after the asset-library access check in [[Day 0 Measurement Access Gate]].
- Before [[Days 13-18 Top Pages Refresh]] when a page needs new visual proof.
- Before [[Days 19-24 New Hero Content and Information Gain]] when a generated visual must match an existing site, brand, product, venue, or project.
- Before competitor comparison work when the visual style of competing pages is part of the critique.

## Capture Command

From the `marketing-brain` repository root:

```bash
python scripts/capture_visual_references.py \
  --vault ~/marketing-brain-vaults/{{client}} \
  --url {{site_url}} \
  --name {{client}}-homepage
```

To also pull images from a local project:

```bash
python scripts/capture_visual_references.py \
  --vault ~/marketing-brain-vaults/{{client}} \
  --url {{site_url}} \
  --project-dir /path/to/project \
  --name {{client}}-homepage-and-project
```

For local dev or private staging URLs, add `--allow-private-url` deliberately. Public URLs are validated by default so the capture command does not accidentally fetch loopback, private-network, or cloud-metadata addresses.

## Output Contract

Each run writes to `.raw/sources/visuals/YYYY-MM-DD-<slug>/`:

- `screenshots/` — desktop and mobile screenshots, if Playwright is available.
- `web-images/` — images referenced by the page HTML, Open Graph tags, `srcset`, and favicons.
- `project-images/` — copied image assets from the local project directory.
- `manifest.json` — source URL, final URL, paths, statuses, and skipped/error items.
- `wiki/sources/Visual Reference Capture - <slug>.md` — source note summarizing the run.
- `.raw/.manifest.json` — updated with the capture manifest hash and source note link.

## Reuse Rules

- Treat downloaded web images as reference evidence unless ownership or license is verified.
- Keep raw captures in `.raw/sources/visuals/`; move only selected, publishable assets into `_attachments/` or the CMS media library.
- For generated images, extract style constraints rather than copying the source: palette, crop ratio, lighting, texture, icon language, typography tone, density, and composition.
- For screenshots of private tools, redact customer names, internal account IDs, billing data, and email addresses before sharing or publishing.

## Prompt Recipe For Future Generated Images

Every generated-image request should cite the source note and include:

- Subject: what must appear in the image.
- Style: palette, lighting, framing, texture, and density extracted from the visual reference capture.
- Evidence: what real artifact, page state, product, place, or process the image must communicate.
- Boundaries: what not to copy, what must not appear, and whether the source assets are owned, licensed, or reference-only.
- Output constraints: aspect ratio, safe crop area, target file size, and where the image will be used.

## Validation

Open the generated source note and confirm the manifest path exists, screenshots are viewable, and every production-bound asset has an ownership or license note. Then run [[Image and Page Speed Workflow]] before publishing.
