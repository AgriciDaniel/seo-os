# Orchestration v2 — Follow-up Audit (post-gap-report)

**Date**: 2026-05-12
**Branch**: `feat/orchestration-v2`
**Companion**: [2026-05-12-orchestration-v2-gaps.md](./2026-05-12-orchestration-v2-gaps.md) — the honest gap report this round addresses.

## What changed since the gap report

| Gap (from gap report) | Status after this round |
|---|---|
| `<SpecialistInbox>` never mounted by OfficeWorkspace | **Fixed.** Focusing any specialist desk now swaps the right-pane from chat to the inbox. Verified in browser against the `rankenstein` client. |
| Clicking specialist id in chat doesn't fly the camera | **Fixed.** `onFocusSpecialist` wired in OfficeWorkspace → `setFocused(toSceneId(specialistId)) + setTarget(specialistId)`. |
| No persistent Tasks primitive | **Shipped (v0).** New `src/lib/orchestrator/task.ts` + `/api/clients/[slug]/tasks` endpoint. SQLite table `tasks` with tree edges (`parent_task_id`), dependency edges (`blocked_on`), idempotency on `(client_slug, request_id)`, vault mirror at `wiki/tasks/<date>-<short-id>.md`. |
| No real-site testing | **Done.** Added `rankenstein.pro` as a client (98 vault notes scaffolded), dispatched `sitemap-architect` against it. Job succeeded; output at `.seo-office/vaults/rankenstein/wiki/audits/2026-05-12-sitemap.md`. |
| `assign_task` tool-use never exercised in live flow | **Still gap.** Active provider is `claude-cli` which sets `--disallowed-tools "*"`. Switching to anthropic-api or relaxing claude-cli's flags is a follow-up. |
| Parallel dispatch executor | **Still gap.** Tasks primitive now exists to hold dependency edges, but the runner that walks an unblocked subtree isn't built yet. `findUnblocked()` helper is in place for that runner. |
| Agent View / `/goal` analog | **Still gap.** Tracked for v0.1.9. |

## Real findings against rankenstein.pro

The first end-to-end production-style invocation of our specialist chain against
a real website produced concrete output, not template hallucination:

> ```
> [info]   Sitemap fetched cleanly (HTTP 200), flat shape, 44 URLs, single
>          host rankenstein.pro — well under the 50k URL split threshold.
> [medium] Freshness skews stale: 0 URLs updated in the past week, only 14 in
>          the past month, and 4 older than a quarter — weak indexing-priority
>          signal for a site that markets AI content velocity.
> [low]    12 URL samples are all clean lowercase, no trailing-slash
>          duplication, no query strings, no fragments, no mixed protocols.
> [info]   Zero parse warnings; hostname uniformity avoids cross-domain
>          canonical confusion.
> ```

The audit *also* surfaced a constructive recommendation about partitioning the
sitemap into an index of subsitemaps before the `/ai-*-writer` programmatic
pages push URL count past ~10k. That's the kind of output a real client would
pay for — and it came out of the registered specialist pipeline without any
human prompting beyond `POST /api/clients/rankenstein/jobs`.

Full audit on disk: `.seo-office/vaults/rankenstein/wiki/audits/2026-05-12-sitemap.md`
(5,254 bytes, marketing-brain.v1 frontmatter compliant with the new
`rollback_note` field from Pillar 2).

## Tasks primitive — verified shape

A 3-step Task tree was constructed via the new API for the rankenstein client:

```
Public-data SEO sweep of rankenstein.pro  [planned]   (root)
├── Sitemap audit                          [planned]   → sitemap-architect
├── Homepage technical audit               [blocked]   → technical-auditor   (blocked on: sitemap)
└── Schema validation                      [blocked]   → schema-validator    (blocked on: sitemap)
```

Confirmed:
- Root inserts with `status='planned'` (empty `blocked_on`).
- Children with non-empty `blocked_on` insert with `status='blocked'`.
- `GET /api/clients/rankenstein/tasks` returns only the root (correct — it's a
  top-level-only endpoint; subtrees are walked via `loadSubtree()` in code).
- Vault mirror at `wiki/tasks/2026-05-12-2ea1c68f.md` renders the full tree as
  readable markdown with indented status pills and dependency edges, fully
  marketing-brain.v1 frontmatter compliant including `rollback_note`.

The runner that picks up `findUnblocked()` and dispatches in parallel is the
**next** diff. The schema is what unblocks that diff.

## What's still honestly missing

1. **Live tool-use dispatch.** Requires either `ANTHROPIC_API_KEY` in
   `.env.local` (forces `anthropic-api` provider) or a flag-tweak to the
   `claude-cli` provider to allow the single `assign_task` tool through its
   sandbox. Easy follow-up.
2. **Parallel runner.** The piece that walks the Task tree and dispatches all
   currently-unblocked leaves in parallel. Pure code, no schema work, fits in
   one diff using the `findUnblocked()` helper.
3. **Agent View page.** Cross-client roll-up of running Jobs + Assignments +
   Tasks at `/agents`. Reuses the existing per-client SSE stream; new code
   is just the multiplex + the page.
4. **`/goal` analog.** Goal-seeking loop where the orchestrator keeps planning
   sub-Tasks until a user-stated outcome is met. Builds on the Tasks primitive
   shipped in this round.

## Honest grade — updated

Pre-this-round grade (from gap report): C+ / B-.
After this round: **B / B+.**

The originally-requested feedback loop ("click specialist, see assignment") is
now user-visible and verified in browser. The Tasks primitive is the missing
spine for a true multi-agentic flow. Live tool-use, parallel dispatch, Agent
View, and `/goal` remain as the v0.1.9 work to get to A-.
