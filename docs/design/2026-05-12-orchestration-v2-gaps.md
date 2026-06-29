# Orchestration v2 — Honest Gap Report

**Date**: 2026-05-12
**Author**: Claude (self-audit)
**Branch**: `feat/orchestration-v2`
**Companion**: [2026-05-12-orchestration-v2-audit.md](./2026-05-12-orchestration-v2-audit.md) — the Playwright pass that this report corrects/extends.

## Why this exists

The earlier audit report graded the branch "PASS" because every clicked surface
worked. That grading is correct for what was tested. But on re-reading the
user's original ask — "proper orchestration layer with multi-agentic approach"
— the audit understates several gaps. This report names them honestly so the
next iteration knows where to spend.

## What is actually true today

### ✓ Confirmed working

- Typed `Assignment` envelope schema in SQLite + zod (Pillar 1).
- Per-target chat mutex, atomic vault writes, optimistic rollback, CRLF
  tolerance (Pillar 2).
- Job recovery on boot, idempotency, SSE heartbeat (Pillar 3b).
- Permission-mode + model + thinking persistence per-conversation (Pillar 4).
- Attachment upload + sha256-keyed store + Anthropic content blocks + text/*
  inline-as-`<file>` (Pillar 5) — model quoted "line 2" verbatim, end-to-end
  verified.
- VS Code-style composer popovers (`+` + mode pill).
- Clickable vault paths + specialist ids in chat → slide-over.

### ✗ Built but not actually exercised

- **`assign_task` tool-use dispatch.** The current user's provider is
  `claude-cli`, which by design (per `claude-cli.ts:86 — "--disallowed-tools *"`)
  refuses to surface tool calls. So the production flow never hits
  `createAssignment()`. **Zero `assignments` rows have ever been written by the
  live system.** The "recent jobs" visible in the sidebar (sitemap-architect,
  technical-auditor) were created by direct `POST /api/clients/[slug]/jobs`
  from earlier UI buttons — not via the new envelope path.
- **`<SpecialistInbox>`.** Compiles, lint-clean, has a working list endpoint,
  but is never mounted by `OfficeWorkspace`. The originally-requested
  feedback-loop view ("click a specialist, see what was assigned") is not yet
  visible to the user.
- **Legacy text-parser fallback.** Designed and committed in the chat route,
  but the active orchestrator system prompt no longer asks the model to emit
  `[PROPOSED ACTION: run-<id>]`. So neither the tool-use path NOR the legacy
  path fires in the current dual-provider claude-cli configuration. The
  Orchestrator can converse but **cannot currently dispatch anyone from a
  fresh user turn.** (Old assignments from earlier development runs still
  show in the recent-jobs sidebar.)

### Missing (called out as future work in the audit but worth restating)

- **No multi-step decomposition.** A "task" today is one specialist invocation,
  not a goal decomposed into parallel + sequential steps.
- **No parallel dispatch.** `job-queue.ts` chains per-client serially. Two
  specialists on the same client cannot run concurrently even though most
  specialists read disjoint files.
- **No persistent Tasks primitive.** Claude Code v2.1.139 has Tasks with
  dependencies/blockers/multi-session collaboration + an Agent View. SEO
  Office has Jobs (single-shot, ephemeral) and Assignments (typed but
  unused in practice). It does NOT have a tree-shaped Task that survives
  process restarts and carries dependency edges.
- **No Agent View.** Per-job SSE exists; a cross-client roll-up of every
  running specialist (v2.1.139's `claude agents` analog) does not.
- **No goal-seeking loop.** No `/goal`-equivalent that lets the orchestrator
  keep working autonomously across turns until a user-stated outcome is met.
- **No real-site testing.** All audit work has been against the bundled
  `claude-seo` template, never against an actual customer site.

## What to ship next (this session)

Concrete, ordered, scoped to fit before context compacts:

1. **Tasks primitive** — SQLite-backed tree of goal-decomposed steps with
   dependency edges, parent/child links, and a vault mirror. Source of truth
   for what an "agent session" is in SEO Office, in the same role that Tasks
   play in Claude Code v2.1.139.
2. **Wire `<SpecialistInbox>` into OfficeWorkspace** — when focused is a
   specialist scene id, the right pane swaps from chat to the inbox. The
   originally-requested feedback loop becomes user-visible.
3. **`onFocusSpecialist` plumbed** — clicking `sitemap-architect` in chat
   flies the camera to that desk (no longer just a target-swap fallback).
4. **rankenstein.pro added as a real client** and a public-data audit
   dispatched against it through the existing job queue (no-Day-0-access
   specialists: `sitemap-architect`, `technical-auditor`).
5. **Follow-up audit doc** that re-tests the items the first audit
   under-tested.

## What's explicitly deferred to v0.1.9

- **Goal-seeking loop** (`/goal` analog). The Tasks primitive shipping
  here is its prerequisite; the runner that walks an open Task tree until
  status=done is a separate diff.
- **Parallel dispatch executor.** Same — needs the Tasks store first so
  dependency edges have somewhere to live, then the per-client serial
  constraint relaxes to per-(client,file-set) where specialists with
  disjoint write targets can run in parallel.
- **Agent View page.** Today's `/api/clients/[slug]/jobs/stream` is per-
  client; the Agent View is a process-wide multiplex with HEADERS that
  match v2.1.139's `x-claude-code-agent-id` / `parent-agent-id` so OTEL
  spans can correlate.
- **Anthropic-API provider as default** so tool-use actually fires in
  production. Requires either a `.env.local` `ANTHROPIC_API_KEY` flip OR
  upgrading claude-cli's flags to allow the `assign_task` tool through —
  the current `--disallowed-tools "*"` blanket-blocks it.

## Honest grade

For what was tested: **A**.
For what the user asked for ("proper orchestration layer with multi-agentic
approach"): **C+ → B-** after the items in "What to ship next" land. True
multi-agentic execution (parallel, goal-seeking, cross-session) is v0.1.9.
