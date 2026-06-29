---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Start Here"
created: 2026-05-04
updated: 2026-05-04
tags:
  - meta
  - onboarding
  - playbook
status: active
related:
  - "[[Overview]]"
  - "[[Day 0 Measurement Access Gate]]"
  - "[[Claude SEO Install and First Audit]]"
  - "[[30-Day Sprint]]"
  - "[[Open Questions for {{client_name}}]]"
  - "[[Onboarding Canvas.canvas|Onboarding Canvas]]"
  - "[[Verifier Cadence]]"
  - "[[Hot]]"
  - "[[Log]]"
sources:
  - "github.com/AgriciDaniel/claude-seo"
  - "github.com/AgriciDaniel/flow"
  - "github.com/AgriciDaniel/marketing-brain"
---

# Start Here

Welcome, {{client_name}}. This is the plain-language sequenced playbook to follow. It is written for someone new to agent-assisted SEO. Take it one step at a time. Nothing here needs to be done in a single sitting.

This brain is the strategic scaffold. `marketing-brain` creates the vault, runs research, synthesizes the plan, and renders reports. Use any available SEO audit layer for technical crawl findings; `claude-seo` is an optional companion, not a required runtime.

For a visual version of this same checklist, open `[[Onboarding Canvas.canvas|Onboarding Canvas]]` (it's an Obsidian Canvas file — pan and zoom).

## Step 1 — Get Your Agent Runtime Set Up

- Use Codex, Claude, or a shell workflow.
- Install Marketing Brain with `./install.sh --target codex`, `--target claude`, `--target agents`, or `--target all`.
- Open the folder you choose for this work.

## Step 2 — Install marketing-brain (you may already have it)

If this vault was scaffolded for you, the skill is already installed. Confirm from a shell:

> `marketing-brain next --vault <this-vault>`

You should see a message that reads `wiki/hot.md` and tells you the next action with rationale.

Then run the scaffolder against your site:

> `marketing-brain new <client-slug> --site {{site_url}} --business-type {{business_type}} --owner "{{owner}}" --niche "{{niche}}"`

The research pipeline is explicit: find competitors → pull keywords → dedup XLSX → mine PAA → synthesize the [[ULTIMATE BEAST Plan]] → render the report.

## Step 3 — Choose An SEO Audit Layer

Use `claude-seo`, Codex SEO skills, Screaming Frog, Sitebulb, GSC exports, or another trusted crawl/audit stack. See [[Claude SEO Source|Claude SEO]] for the optional companion workflow and [[Tool Limitations]] for what each source can and cannot prove.

## Step 4 — Run the First Audit, Fix, Repeat

Run the first audit against `{{site_url}}`.

Save the report. Read it. Make the Critical fixes (highest-priority items). Run the audit again.

The standard pattern is **run, fix, repeat at least 3 times** before moving on. The first pass surfaces obvious issues, the second pass catches what the fixes broke or revealed, the third confirms the site is in a stable enough state for strategy work.

Each audit goes into `.raw/sources/audits/audit-N-YYYY-MM-DD.md` so we have a record. See [[Claude SEO Install and First Audit]] for the full procedure.

## Step 5 — Verify Day 0 Access

Open `[[Day 0 Measurement Access Gate]]`. Walk every Required Access row and every Required Baseline row. Every cell must end up Pass with evidence saved to `.raw/sources/day0/` before the 30-day sprint can start.

While you're here, answer the 15 questions in `[[Open Questions for {{client_name}}]]`. Answers go in `[[Log]]` as a dated entry.

## Step 6 — Review FLOW Context

FLOW is the strategy framework used by Marketing Brain. Review [[FLOW Framework]] and the active [[Business Type Overlay]] before approving the [[ULTIMATE BEAST Plan]].

## Step 7 — Read the BEAST Plan, Read Hot, Pick the Next Action

`marketing-brain synthesize --vault <path>` should have populated `[[ULTIMATE BEAST Plan]]` with a ranked action list and source manifest. Read it with the [[Implementation Roadmap]].

Then go to `[[Hot]]` and look at "Active Threads" — the top item is your next move. The `guide_next_action.py` script reads this same section to suggest your next move when you run `marketing-brain next`.

## Step 8 — Use the Vault as You Work

Three notes are worth checking on every working session:

- `[[Hot]]` — what's most active right now (overwritten in place each session, never appended).
- `[[Log]]` — running record of decisions and answers (newest at top, append-only).
- `[[Open Questions for {{client_name}}]]` — anything still pending from you.

When you finish a meaningful action, update those three notes. The brain is most useful when it stays current.

## What's Different From a Pure Content Plan

This vault is structured around the FLOW (Find / Leverage / Optimize / Win) framework adapted to {{business_type}} via the [[business-types/_index|business-type overlay]]. The active overlay is `[[Business Type Overlay]]` — read it to anchor revenue model, content priority, measurement focus, and anti-pattern guardrails.

The Karpathy Hot/Index/Wiki read order is enforced in `CODEX.md`. Any AI agent that opens this vault should read `wiki/hot.md` first (~500 words), then `wiki/index.md`, then the relevant note. Same rule for humans.

## Next Action

Once Step 4 (first audit) and Step 5 (Day 0 access) are both done, ping {{owner}} via the channel agreed in [[Verifier Cadence]] and we move into the 30-day sprint via [[Implementation Roadmap]].
