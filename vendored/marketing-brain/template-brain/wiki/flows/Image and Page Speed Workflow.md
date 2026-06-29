---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Image and Page Speed Workflow"
created: 2026-05-04
updated: 2026-05-04
tags:
  - images
  - core-web-vitals
  - exif
  - performance
status: active
shipping_status: "active"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "Every image on a touched page passes the checklist"
  - "PSI run after publish; field-data CWV recorded in the page note"
  - "Private metadata (GPS, camera serials) stripped from every image before upload (verified, not assumed)"
rollback_plan: "Image swaps reversible via CMS media library. Originals retained in the source asset library."
related:
  - "[[Days 13-18 Top Pages Refresh]]"
  - "[[Days 19-24 New Hero Content and Information Gain]]"
  - "[[Monetization Density Guardrails]]"
sources: []
---

# Image and Page Speed Workflow

Per-page image and Core Web Vitals checklist. Run on every page touched during the sprint.

## Image Capture

- Use real practice photos / screenshots / case-study artifacts where possible. They are the strongest information-gain signal a niche site can produce.
- No stock photos pretending to be original. If a stock image is necessary (e.g. a generic illustration), label it accordingly in caption or alt text.
- Prefer the named expert's own photos / artifacts with date and rough conditions noted.

## Private Metadata Stripping

- Strip private metadata BEFORE upload. Categories vary by niche:
  - **Photos**: GPS coordinates, camera serial numbers, personal author metadata.
  - **Screenshots**: customer / employee names, internal account IDs, billing details.
  - **Documents**: track-changes history, comment threads, redacted-but-still-recoverable text.
- Verification step: open the uploaded asset's metadata after publish and confirm sensitive fields are absent. Do not assume the upload pipeline stripped them.

## Format and Compression

- Convert to WebP or AVIF where the CMS supports it.
- Serve appropriate `srcset` for responsive sizes.
- Target hero LCP image under 100KB after compression.
- No upscaling — compress, don't enlarge.

## Alt Text

- Accurate descriptive alt text. No keyword stuffing.
- Describe what is in the image: subject, general context (region / industry), conditions, tools if relevant.
- Examples vary by niche — see active business-type overlay for niche-specific alt-text conventions.

## Schema for Images

- `ImageObject` in page schema where it adds value (hero image on a guide page, for example).
- Do NOT fabricate license metadata. If the named expert took the photo, attribute the expert. If the image is licensed, reflect the real license.

## CWV Targets

Field data via PSI / CrUX:

- LCP < 2.5s.
- INP < 200ms.
- CLS < 0.1.

Lab data (Lighthouse) is a debugging tool, not a target. Field data is what counts.

## Monetization Interaction

- Reserved ad / lead-capture / popup placeholder space to prevent CLS when scripts load.
- Lazy-load below-the-fold monetization elements.
- No above-fold monetization element that pushes the hero image down or competes with the LCP element.

## Validation

Run PSI on the page after publish. Record the field-data score (and the lab data if field data is sparse) in the page note. If any CWV target fails, file a fix item before considering the page done.

## Owner / Verifier

Owner: {{client_name}}. Verifier: {{owner}}.

## Acceptance

Every image on a touched page passes the checklist. PSI run after publish, field data recorded. Private metadata stripped and verified — not assumed.

## Rollback

Image swaps reversible via CMS media library. Originals retained in the named expert's source library. Schema additions are non-destructive removals.
