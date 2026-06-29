# Build-the-Brain Sweep — Design Spec

**Date**: 2026-05-13
**Status**: Approved (brainstorming complete, awaiting implementation plan)
**Supersedes / extends**: [2026-05-11-seo-office-design.md](2026-05-11-seo-office-design.md) (Pillar 3 — Orchestrator), [2026-05-12-orchestration-v2.md](2026-05-12-orchestration-v2.md)
**Owner**: Daniel

## Context

Today, when a user creates a new client in SEO Office, the orchestrator surfaces a single "Run Technical Audit" advisory card and waits for a click. Each subsequent specialist is the same: one card, one click. The user owns a related tool — **marketing-brain** — where a single prompt ("build the marketing brain for this business") produces a complete strategic asset autonomously. The user wants SEO Office's orchestrator to match and exceed that UX: **one prompt, fully autonomous, parallel where possible, produces the "ultimate brain"** for the client.

This is not a port. Marketing-brain executes seven numbered steps serially with human approval between each (see `vendored/marketing-brain/scripts/guide_next_action.py`). SEO Office already has the plumbing for parallel multi-agent execution ([task-runner.ts:71-189](../../src/lib/orchestrator/task-runner.ts#L71-L189), [job-queue.ts:78-89](../../src/lib/orchestrator/job-queue.ts#L78-L89), [orchestrator-tools.ts:32-184](../../src/lib/agents/orchestrator-tools.ts#L32-L184)) but lacks the entry-point concept of a **Sweep** — a first-class, user-initiated, end-to-end orchestration that the system treats as a cohesive unit.

## Goal

A user types "build the brain" (or clicks "Build the brain" on new-client setup) and, with **zero further clicks**, the system runs a curated 12-specialist DAG across three phases and produces a complete partial-or-full client brain in the vault. The UI shows live progress in the 3D office. Missing data sources cause graceful skips, not failures. Failures continue the sweep, they don't halt it.

## Non-goals

- Replacing the existing single-specialist `assign_task` flow. Sweeps and single dispatches coexist; the user can still ask for a single specialist when that's what they want.
- Real-time cost gating. We surface estimates; we never block on cost.
- Approval gates per phase. The user explicitly chose fully-autonomous over per-phase checkpoints.
- New "Campaign" or "Engagement" entity above the Sweep. A Sweep is the largest unit in this design.
- Site-change-driven staleness detection. We use simple time-based staleness for v1 (per-specialist `stale_after_days`).

## Decisions captured in brainstorming

| # | Question | Decision |
|---|----------|----------|
| 1 | Approval model | **Fully autonomous** — one prompt or one button, runs end-to-end |
| 2 | Trigger surface | **Chat prompt AND a "Build the brain" button** on new-client setup; both call the same backend |
| 3 | Sweep scope | **Curated 12-specialist DAG in 3 phases** (Diagnostic → Discovery → Synthesis) |
| 4 | Missing integrations | **Graceful skip** — auto-skip specialists with missing data sources, render partial brain |
| 5 | Re-run policy | **New Sweep each time**, smart-skip per-specialist for results that are still fresh |
| 6 | Sweep UX | **Dedicated SweepCard** in the existing NextActionCard slot (top-right of the 3D office canvas) |

Plus baked-in best practices not requiring user input:

- **Transient failures retry once** with exponential backoff (network errors, 429s, 5xx). Permanent failures (auth, schema, code bugs) do not retry.
- **Sweep continues on permanent failure** of any child; failed task's dependents get `blocked-by-failure` status with rationale.
- **Cost preflight is surfaced, not gated** — orchestrator's first chat response includes a non-blocking cost/duration estimate.

## Architecture

### 1. Data model — minimal additions to the existing `tasks` table

```sql
ALTER TABLE tasks ADD COLUMN kind        TEXT;  -- "sweep" for sweep roots; NULL otherwise
ALTER TABLE tasks ADD COLUMN sweep_phase TEXT;  -- "diagnostic" | "discovery" | "synthesis"; NULL on root + non-sweep
ALTER TABLE tasks ADD COLUMN template_id TEXT;  -- e.g. "build-brain"; NULL on non-sweep
```

We do **not** introduce a `sweeps` table. The root Task with `kind='sweep'` IS the Sweep — child Tasks are its specialists. This avoids duplicating the entire Task lifecycle (status machine, vault mirroring, parent/child relationships) and keeps the orchestrator's mental model single-primitive. `template_id` lets us evolve sweep variants without schema changes. `sweep_phase` is a per-child grouping label used only by the UI (SweepCard progress rendering).

Migration runs in-process via better-sqlite3 on first boot (matches existing pattern at [index-db.ts](../../src/lib/brain/index-db.ts)).

### 2. Sweep template — `BUILD_BRAIN_SWEEP`

Lives in a new `src/lib/orchestrator/sweep-templates.ts`, sibling to existing [task-templates.ts](../../src/lib/orchestrator/task-templates.ts). The template defines the DAG; the runtime expands it into Task rows at dispatch time.

```ts
export const BUILD_BRAIN_SWEEP = {
  id: "build-brain",
  name: "Build the brain",
  description: "Diagnostic, discovery, and synthesis in one autonomous sweep.",
  children: [
    // Phase 1 — Diagnostic (parallel, no deps)
    { specialist: "technical-auditor",     phase: "diagnostic" },
    { specialist: "schema-validator",      phase: "diagnostic" },
    { specialist: "page-analyzer",         phase: "diagnostic" },
    { specialist: "sxo-analyst",           phase: "diagnostic" },
    { specialist: "sitemap-architect",     phase: "diagnostic" },
    // Phase 2 — Discovery (blocked on tech-auditor as the diagnostic anchor)
    { specialist: "keyword-researcher",    phase: "discovery", blocked_on_indices: [0] },
    { specialist: "brand-strategist",      phase: "discovery", blocked_on_indices: [0] },
    { specialist: "competitor-pages",      phase: "discovery", blocked_on_indices: [0] },
    { specialist: "content-strategist",    phase: "discovery", blocked_on_indices: [0] },
    // Phase 3 — Synthesis
    { specialist: "topic-clusterer",        phase: "synthesis", blocked_on_indices: [5] },   // → keyword-researcher
    { specialist: "content-brief-generator", phase: "synthesis", blocked_on_indices: [9] },  // → topic-clusterer
    { specialist: "beast-planner",          phase: "synthesis", blocked_on_indices: [5, 8] },// → keyword-researcher + content-strategist
  ],
};
```

Future sweep variants (`refresh-brain`, `audit-only`, `deep-keyword-sweep`) drop into the same file.

### 3. Sweep service — `src/lib/orchestrator/sweeps.ts` (new)

The single source of truth for "start a sweep / read a sweep / decide what to smart-skip."

```ts
// Start a sweep. Idempotent if a sweep is already running for this client.
startSweep(clientSlug, templateId, permissionMode): Promise<{ sweepId, dispatched, skipped }>

// Current running or most-recent sweep for the SweepCard's poll endpoint.
getCurrentSweep(clientSlug): Promise<SweepView | null>

// Per-specialist staleness check against the most recent prior sweep.
resolveSmartSkip(clientSlug, specialistId): Promise<{ skip: boolean; reuseFromTaskId?: string }>
```

Both the chat-prompt path (via `start_sweep` tool) and the button path (via REST endpoint) call `startSweep`. No behavioral drift.

### 4. Specialist catalog — two new fields

```ts
interface SpecialistEntry {
  // ... existing fields
  cost_estimate_usd?: number;   // very rough; e.g. 0.04 for an Anthropic-only specialist, 0.15 for DataForSEO+LLM
  stale_after_days?: number;    // default 7; technical-auditor=3, brand-strategist=30
}
```

These are advisory metadata, surfaced in the cost preflight and the smart-skip logic. Wrong values don't crash anything — they just make the UX less accurate.

## Trigger surfaces

### A. Chat prompt path

1. User types intent in the orchestrator chat ("build the brain", "do everything", "/sweep", "give me the works", etc.).
2. Orchestrator agent ([orchestrator.ts](../../src/lib/agents/orchestrator.ts)) sees the new `start_sweep` tool definition and the intent patterns documented in its system prompt; calls `start_sweep({ template_id: "build-brain", permission_mode: "auto" })`.
3. [dispatch.ts](../../src/lib/orchestrator/dispatch.ts) handles the tool call by routing to `startSweep()` in the new sweep service.
4. The orchestrator's chat response acknowledges what was dispatched, lists any specialists that will skip due to missing integrations, and reports the cost preflight estimate.

### B. Button path

1. New-client setup ([src/app/clients/new/page.tsx](../../src/app/clients/new/page.tsx)) is extended with a final success state that offers a single CTA: **"Build the brain"** (primary action) with a secondary "I'll set it up manually" link below.
2. Click → `POST /api/clients/[slug]/sweeps` → calls `startSweep()`.
3. User is redirected to `/office?client=<slug>` with the sweep already running. They land in the 3D office watching desks light up.

## Resilience

### Failure handling

- **Transient** (network, 429 rate limit, 502/503/504, timeout): retry once with 1s → 4s exponential backoff in the task-runner. Classified by error code; opaque LLM errors are treated as permanent.
- **Permanent** (auth, schema validation, specialist code bug): mark task `failed`, log error to vault note, **continue the sweep**.
- **Dependent tasks of a failed task** get status `blocked-by-failure` with a rationale referencing the parent failure.
- **Sweep roll-up status**: `succeeded` if every child terminal status is `succeeded` or `skipped`; `partial` if any child is `failed` or `blocked-by-failure`; `failed` only if the sweep itself couldn't dispatch (e.g. client doesn't exist).

### Missing integrations

- At dispatch time, for each child specialist, compare `specialist.requires` (an existing field on the catalog) against `getAvailableIntegrations(clientSlug)`.
- If any requirement is missing, the child Task is **inserted with status `skipped`** and a `skip_reason` like `"requires DataForSEO (not configured)"`. No job is dispatched, no API call fires.
- A `wiki/brain/skipped.md` note enumerates all skipped specialists with deep links to `/setup#integrations`.

### Re-runs and smart-skip

- Every sweep is a fresh root Task. The brain accumulates history naturally: `wiki/sweeps/<sweep-id>.md` per sweep.
- Smart-skip happens per-child at dispatch time:
  - Look up the most recent prior sweep's child Task for the same specialist.
  - If `now() - finished_at < stale_after_days * 24h` AND that prior Task is `succeeded`, **insert the new child Task with status `succeeded` and `reused_from_task_id` pointing at the prior**. No job dispatched.
  - The UI marks reused specialists with a distinct visual ("reused from sweep 3d ago") so the user knows nothing fresh happened there.

## UX surface

### SweepCard component

A new client component `src/components/office/SweepCard.tsx`, mounted in [OfficeWorkspace.tsx:380-393](../../src/app/office/OfficeWorkspace.tsx#L380-L393) at the same canvas slot as `NextActionCard`. Precedence rule: **if a sweep is running for the active client → render SweepCard; else → render NextActionCard**.

Data source: a new endpoint `GET /api/clients/[slug]/sweeps/current` returning the most recent sweep + child status rollup. Polled every 3s by the SweepCard (same cadence as `LiveAgentsHud`).

States:

- **Running**: Client name, current phase label ("Phase 2 of 3 · Discovery"), thin progress bar (`7 of 12 specialists complete`), latest active specialist as a subtle ticker, "View live agents" link that scrolls focus to the existing `LiveAgentsHud` panel.
- **Reusing**: A small badge near each phase indicates how many specialists in that phase are being reused vs run fresh ("3 reused · 2 fresh").
- **Succeeded**: Card morphs to "Brain built for {client} · view the result" with a button routing to `/office?client=<slug>&tab=vault`.
- **Partial**: "Brain built with N specialists skipped/failed. View what was produced." Same routing.
- **Failed (sweep itself, not a child)**: "Sweep failed: {reason}. Retry?" with a retry button calling the same `POST /api/clients/[slug]/sweeps`.

### Office canvas behaviors that come for free

- **Desk lights** during the sweep via the existing `useActiveAgents()` hook ([useActiveAgents.ts:31-92](../../src/hooks/useActiveAgents.ts#L31-L92)). All 12 desks light in sequence/parallel as their Jobs fire.
- **FanoutBadge** ([FanoutBadge.tsx:36-159](../../src/components/office/FanoutBadge.tsx#L36-L159)) latches automatically because phase-1 fires 5 jobs within 2s. No new code.
- **LiveAgentsHud** (built earlier this session) shows the per-task live state for the active client.

### Orchestrator system prompt update

[orchestrator.ts](../../src/lib/agents/orchestrator.ts) gets a short paragraph teaching the LLM about the new tool:

- When to call `start_sweep` (intent patterns: "build the brain", "do everything", "run a full sweep", "/sweep", "build everything", etc.).
- What `start_sweep` does (full DAG, autonomous, no further clicks needed).
- What it returns (the sweep id + skipped/dispatched roll-up so the LLM can summarize for the user).
- That it's the default response to "what should I do next?" on a fresh client (replaces the milestone-by-milestone advisory).

### New-client setup CTA

[src/app/clients/new/page.tsx](../../src/app/clients/new/page.tsx) success state changes from "redirecting to office..." to a final card with **Build the brain** (primary) and "I'll set it up manually" (link). Primary CTA calls the API and then navigates to the office.

## Vault output

```
wiki/sweeps/
  <sweep-id>.md                    # root note: frontmatter (brain_schema, status, started_at, finished_at,
                                   # phase_rollup, child_task_ids, template_id), human-readable summary
  <sweep-id>/specialists/
    technical-auditor.md           # mirrors per-specialist hot.md schema
    schema-validator.md
    ...

wiki/brain/
  skipped.md                       # specialists not run + reasons + deep links to /setup#integrations
  cost.md                          # estimated vs actual cost rollup per sweep
```

All notes use `brain_schema: marketing-brain.v1` per project rule 3 in [AGENTS.md](../../AGENTS.md).

## Files to add / modify

**New files:**

| Path | Purpose |
|------|---------|
| `src/lib/orchestrator/sweeps.ts` | `startSweep`, `getCurrentSweep`, `resolveSmartSkip` |
| `src/lib/orchestrator/sweep-templates.ts` | `BUILD_BRAIN_SWEEP` template + future variants |
| `src/app/api/clients/[slug]/sweeps/route.ts` | `POST` (start), `GET` (history) |
| `src/app/api/clients/[slug]/sweeps/current/route.ts` | `GET` current sweep state for the SweepCard poll |
| `src/components/office/SweepCard.tsx` | The in-canvas UI |

**Modified files:**

| Path | Change |
|------|--------|
| `src/lib/agents/orchestrator-tools.ts` | Register `start_sweep` tool |
| `src/lib/agents/orchestrator.ts` | System prompt addition for the new tool + intent patterns |
| `src/lib/orchestrator/dispatch.ts` | Handle the new tool by routing to `startSweep()` |
| `src/lib/orchestrator/task.ts` | Migration adding `kind`, `sweep_phase`, `template_id` columns |
| `src/lib/orchestrator/task-runner.ts` | Transient-error retry; precondition-skip; `blocked-by-failure` propagation |
| `src/lib/specialists/catalog.ts` | Add `cost_estimate_usd` and `stale_after_days` per specialist |
| `src/app/clients/new/page.tsx` | Success state with "Build the brain" CTA |
| `src/app/office/OfficeWorkspace.tsx` | SweepCard / NextActionCard precedence; mount SweepCard |

## Verification

1. `pnpm tsc --noEmit && pnpm build` both pass.
2. **Migration**: launch dev, inspect `tasks` schema, confirm new columns exist with NULL backfill on existing rows.
3. **Tool path**: open orchestrator chat for an existing client, type "build the brain"; verify `start_sweep` tool call is made, root Task with `kind='sweep'` created, phase-1 leaves dispatched in parallel within 2s.
4. **Button path**: create a new client, click "Build the brain" on the success screen, land in the office with the sweep already running and `SweepCard` visible.
5. **SweepCard**: visible in the NextActionCard slot during a sweep, progresses through Diagnostic → Discovery → Synthesis, morphs to "Brain built" on completion.
6. **Smart-skip**: re-issue "build the brain" within 5 minutes; verify diagnostic specialists are inserted as `succeeded` + `reused_from_task_id`, no Jobs dispatched, brain is rebuilt with near-zero API spend.
7. **Graceful skip**: with no DataForSEO key, verify `keyword-researcher`, `topic-clusterer`, `content-brief-generator` land with `status='skipped'` + clear reasons in `wiki/brain/skipped.md`.
8. **Failure resilience**: simulate a child specialist failure (e.g. kill the process or inject an error), verify the sweep continues, dependents marked `blocked-by-failure` with rationale, root rolls up to `partial` not `failed`.
9. **Cost ledger**: confirm orchestrator's first chat message includes an estimate; on completion, `wiki/brain/cost.md` shows estimate vs actual.
10. **No regression**: existing `assign_task` single-specialist flow still works; existing `plan_tree` ad-hoc tree dispatch still works; `LiveAgentsHud` and `FanoutBadge` reflect sweep activity correctly.

## Open questions for the implementation plan

These do not block design approval but should be resolved before coding:

1. **Cost estimate accuracy** — the v1 estimates are rough. Do we have any historical job-cost data we can mine from existing audits to seed better numbers? (If not, ship rough values and refine later.)
2. **`reused_from_task_id` resolution** — when a SweepCard's UI links to a reused specialist's note, does it deep-link to the original sweep's note or copy the result into the new sweep's folder? Recommendation: deep-link to original to avoid duplication, with a clear "originally from sweep X (3d ago)" header.
3. **Concurrency cap** — the task-runner has no concurrency limit today. With 12 simultaneous LLM/API calls a sweep could spike usage. Do we want a soft cap (e.g. max 6 concurrent) for v1? Recommendation: yes, configurable via env var, default 6. Decide in the plan phase.
4. **Sweep cancellation** — should the SweepCard expose a "cancel sweep" button? Cancelling is non-trivial (running specialists need to be killed cleanly). Recommendation: defer to v0.2; v0.1 ships without cancel, the user can let it finish or kill the dev server.
