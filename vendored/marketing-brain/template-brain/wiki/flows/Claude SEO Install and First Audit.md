---
brain_schema: marketing-brain.v1
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: flow
title: "Claude SEO Install and First Audit"
created: 2026-05-04
updated: 2026-05-04
tags:
  - install
  - audit
  - claude-seo
  - flow-framework
status: active
shipping_status: "pending-day-0"
owner: "{{client_name}}"
verifier: "{{owner}}"
acceptance_criteria:
  - "3 audit reports saved to .raw/sources/audits/"
  - "Every Critical finding either fixed or documented as deferred with rationale"
  - "FLOW Framework skill installed and strategy prompt run after audit cycle 3"
rollback_plan: "Skills can be uninstalled with no site impact; audit reports are read-only artifacts."
related:
  - "[[Day 0 Measurement Access Gate]]"
  - "[[30-Day Sprint]]"
  - "[[FLOW Framework]]"
  - "[[Start Here]]"
  - "[[Days 1-5 GSC Diagnostic and Triage]]"
  - "[[Claude SEO Source|Claude SEO]]"
sources:
  - "github.com/AgriciDaniel/claude-seo"
---

# Claude SEO Install and First Audit

First execution flow once [[Day 0 Measurement Access Gate]] passes. Three audit cycles before installing FLOW.

## Install

1. Choose an SEO audit layer: `claude-seo`, Codex SEO skills, Screaming Frog, Sitebulb, GSC exports, or another trusted crawler.
2. Confirm required API access and cost limits.
3. Save the audit output under `.raw/sources/audits/`.

## First Audit Run

1. Run the audit with the site URL `{{site_url}}`.
2. Let the crawl complete. Do not interrupt.
3. Save the report to `.raw/sources/audits/audit-1-YYYY-MM-DD.md` (substitute today's date).

## Triage The Findings

For every finding in the report, assign one of three labels:

- **Critical** — fix before next audit run. Likely contributors to algorithmic demotion, indexation issues, or E-E-A-T / disclosure gaps. Each Critical item gets either a content prune decision (if the fix is "remove or merge") or a technical fix entry (if the fix is "edit code, schema, or config").
- **Important** — fix during the sprint, scheduled into the relevant phase flow.
- **Nice-to-have** — log and defer. Do not let these consume sprint time.

## Repeat Pattern

Standard guidance: "run, fix, repeat at least 3 times."

- Audit 1: capture the full surface. Triage. Fix Critical items.
- Audit 2: re-crawl. Verify Critical items resolved. New issues triaged.
- Audit 3: re-crawl. Confirm stable surface before installing FLOW.

Save each audit report as `audit-N-YYYY-MM-DD.md` in `.raw/sources/audits/`.

## After 3 Audits

1. Install the [[FLOW Framework]] skill from `https://github.com/AgriciDaniel/flow`.
2. Run the strategy prompt — the exact wording lives in [[Start Here]].
3. The output of that prompt seeds the rest of the sprint and feeds into [[Days 1-5 GSC Diagnostic and Triage]].

## Acceptance

3 audit reports saved with date-stamped filenames. Every Critical finding has either a fix commit / config change or a documented deferral with rationale and owner. FLOW Framework installed and strategy prompt run.

## Rollback

Skills can be uninstalled from Claude with no site impact. Audit reports are read-only — they describe state, they do not change it. Any Critical fix that lands on the site itself follows the rollback path of its own phase flow.
