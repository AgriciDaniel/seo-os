---
brain_schema: marketing-brain.v1
owner: "{{owner}}"
confidence: seed
approval_status: needs-review
rollback_note: "Review source evidence before implementation."
risk_level: medium
business_type: {{business_type}}
type: meta
title: "Verifier Cadence"
created: 2026-05-04
updated: 2026-05-04
tags:
  - meta
  - cadence
  - sla
  - communication
status: active
related:
  - "[[Start Here]]"
  - "[[30-Day Sprint]]"
  - "[[Implementation Roadmap]]"
  - "[[Dual Surface Scorecard]]"
  - "[[Open Questions for {{client_name}}]]"
sources:
  - "[[shipping-rules|shipping rules]]"
---

# Verifier Cadence

The communication and SLA contract between {{client_name}} (owner) and {{owner}} (verifier). Filled at scaffold time; reviewed at Day 0 close; updated whenever cadence changes. Every entry should be specific — "weekly Monday async via Skool DM" beats "as needed".

## Roles

- **Owner**: {{client_name}}. Executes site changes, fills baselines, runs audits, drafts content from briefs.
- **Verifier**: {{owner}}. Reviews evidence, gates acceptance per [[shipping-rules|shipping rules]], approves prune/merge/redirect decisions before they ship, signs off on per-page refreshes.
- **Chair (orchestration)**: {{owner}} runs the chair role for any multi-slice work (e.g., the 30-day sprint or any chair-led parallel execution). See [[shipping-rules|orchestration rules]].

## Cadence

| Cadence | Format | Channel | Owner | Notes |
| --- | --- | --- | --- | --- |
| Weekly check-in | Async written status | TBD (Slack / email / DM) | {{client_name}} posts; {{owner}} reviews within 48h | During the 30-day sprint, weekly. After the sprint, bi-weekly. |
| Blocker escalation | Sync (call) or rapid async | TBD | Either party | Triggered by a Decision Flag = `escalate to {{owner}}` on the [[Dual Surface Scorecard]]. SLA: 24h response. |
| Pre-publish review | Written brief review | Vault `[[ULTIMATE BEAST Plan]]` + per-page brief in `wiki/pages/` | {{client_name}} drafts; {{owner}} reviews before any release-impacting change ships | Per [[SERP-First Content Creation Gate]]; gate must pass before publish. |
| Monthly retro | Sync (call) | TBD | {{owner}} hosts | Review [[Dual Surface Scorecard]] deltas, [[Hot]] active threads, cred-rotation reminders. |

## SLA

- Weekly status: 48-hour acknowledgement; 5 business-day turnaround on review and notes.
- Blocker escalation: 24-hour acknowledgement.
- Pre-publish review: 72-hour turnaround unless the [[Implementation Roadmap]] phase deadline requires faster.
- After-hours: not on-call. Skool DMs are async by default.

## Escalation Path

1. Routine question → weekly check-in.
2. Time-sensitive question → escalate to the channel agreed in the table above.
3. Algorithmic incident (e.g., site loses >10% impressions week-over-week with no seasonal explanation) → immediate escalation; hold all release-impacting changes; investigate per [[HCU Diagnostic Checklist]].
4. Cred / security incident (e.g., suspected leaked API key) → immediate. Rotate the cred. File a [[Log]] entry. Do not commit anything until rotated.

## Cred Rotation Reminders

Rotate ad-network, analytics, CMS, and DataForSEO credentials at least quarterly. After any one-off audit pull using temporary credentials (e.g., the initial DataForSEO research pull), rotate the password once {{client_name}} verifies the pull. The vault never stores credentials per [[CODEX|CODEX rule]] — rotation is operational hygiene at the OS / password-manager layer.

## Acceptance

- Owner, verifier, channel, cadence, and SLA all filled with specific values (not "TBD").
- {{client_name}} acknowledges the cadence in [[Log]] with date.
- Cadence reviewed at Day 0 close; updated if reality diverges from this contract.
