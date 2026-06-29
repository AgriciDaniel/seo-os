# SEO Office v0.1.8 — Orchestration v2

**Date**: 2026-05-12
**Branch**: `feat/orchestration-v2`
**Source plan**: `/home/agricidaniel/.claude/plans/now-also-let-s-say-snappy-bunny.md`
**Source design**: [`2026-05-11-seo-office-design.md`](./2026-05-11-seo-office-design.md)

## Context

The v0.1.7 office is visually rich but the orchestration layer underneath
is paper-thin. The audit that opened this work found:

- The Orchestrator decided which specialist to dispatch by emitting
  `[PROPOSED ACTION: run-<id>]` as **plain text** inside its LLM reply,
  then a regex on the server pulled it out. No typed contract.
  No payload. The model could propose any string and the UI would try
  to enqueue it.
- Clicking a specialist desk in the 3D office focused the camera but
  showed an **empty** chat — the specialist had no record of being
  assigned anything. The "feedback loop" the user asked for did not
  exist.
- Eight HIGH-severity chat reliability gaps: no Anthropic try/catch,
  no timeout, non-atomic JSONL appends, optimistic updates that
  never rolled back, target-switch races, no idempotency on the job
  queue, ghost jobs after `pnpm dev` restarts, missing `rollback_note`
  on brain frontmatter (violates CLAUDE.md rule #3).
- No permission model. Every dispatch implicitly ran at full access.
- The chat composer was text-only — no images, no PDFs.

Orchestration v2 rebuilds the dispatch backbone so all of these
collapse into one coherent feature.

## What shipped

Six commits land on `feat/orchestration-v2` in this strict dependency order:

| Commit | Title | Effect |
|---|---|---|
| `b08f7a1` | Pillar 1 — typed Assignment envelope | Foundation. SQLite `assignments` table + Zod schemas + vault mirror writing marketing-brain.v1 frontmatter (including the previously-missing `rollback_note`). |
| `d0d89f2` | Pillar 3a — tool-use dispatch + typed provider errors | Orchestrator now calls the `assign_task` Anthropic tool. Result is validated, an Assignment row created, a Job enqueued. Typed `LLMProviderError` maps SDK failures to 429 / 503 / 504. |
| `863e5e2` | Pillar 3b — job idempotency, recovery, SSE heartbeat | `jobs.request_id` + UNIQUE index dedupe retries. Boot-time recovery sweeps orphan `running` jobs from the previous process. 25s heartbeat keeps SSE connections alive past proxy idle timeouts. |
| `9b1faad` | Pillar 2 — chat reliability hardening | Per-target async mutex on JSONL appends, CRLF tolerance, stable `id`s on every turn, optimistic rollback on failed sends, AbortController on history fetches, 32 KB message cap, atomic write-temp-then-rename for vault notes. |
| `4b51d67` | Pillar 4 — permission modes (Plan / Read / Auto / Full) | Pure `permissions.ts` policy functions. Per-conversation `.chat/<target>.meta.json`. `/api/chat/meta` GET/PUT + `/api/assignments/[id]/approve` + DELETE. Segmented control in the ChatPanel header. Plan-mode assignments wait for approval. |
| `7abbd96` | Pillar 5 — chat attachments (images, PDFs, text) | Content-addressed storage at `.chat/attachments/<sha256>.<ext>`. POST `/api/chat/attachments` (25 MB cap, MIME allowlist) + GET preview endpoint. `LLMContentBlock` union type. anthropic-api passes images + PDFs as native content blocks; CLI providers flatten to descriptions. Drag-drop, paste, paperclip in the composer. |
| `3b9646f` | Pillar 6 — Specialist Inbox UI | `<SpecialistInbox>` tabbed view (Inbox / Conversation) + shared `<StatusPill>`. GET `/api/clients/[slug]/specialists/[id]/assignments`. Approve / Cancel quick actions. Auto-refresh every 5s. |

The 5-pillar plan plus the unplanned Pillar 1 foundation == ~30
files changed, ~3500 LOC added, every commit independently passes
`pnpm typecheck` and `pnpm lint`.

## Architecture shift

The dominant change is that **dispatch is now a typed transaction**, not
text inside a model response. The mental model:

```
                ┌─────────────────────────┐
       (chat)   │ POST /api/chat          │
   user ──────► │   { permissionMode,     │
                │     attachments }       │
                └────────────┬────────────┘
                             ▼
              Anthropic SDK with tools = [ assign_task ]
                + prompt cache breakpoint on last tool
                             │
                             ▼  toolCall.input
                ┌─────────────────────────┐
                │ createAssignment()      │  ── Zod-validated, idempotent
                │  ↳ permissions.canAuto- │     on request_id
                │     Queue?  YES → enqueue Job, linkJob, mirrorToVault
                │              NO  → status='proposed', wait for approve
                └─────────────────────────┘
                             │
                             ▼
                  job-queue.runJob() emits SSE
                  syncAssignmentStatus mirrors lifecycle
                             │
                             ▼
                ┌─────────────────────────┐
                │ <SpecialistInbox/>      │
                │   polls list endpoint   │
                │   renders StatusPill    │
                └─────────────────────────┘
```

This means **every feature that follows — permission modes,
attachments, inbox UI, vault audit trail — is just a different angle
on the same Assignment object**. Add a field, the whole system inherits.

## What's intentionally unfinished

- **OfficeWorkspace.tsx wiring** — the `<SpecialistInbox>` component is
  ready to drop into the right pane when `focused` is a specialist id,
  but the actual swap is left as a one-liner because the same file is
  under active theme-system edits and conflicting in this commit would
  cost more than it bought. The component's doc-comment shows the
  exact snippet.
- **CLI providers don't speak tool use** — claude-cli, codex-cli,
  gemini-cli ignore the `tools` array and continue serving plain text.
  The legacy `[PROPOSED ACTION: run-<id>]` regex parser is preserved
  as a fallback so subscription users keep dispatching, just without
  the schema guarantees of native tool-use.
- **Specialist-side permission gates** — `permissions.canExecuteTool`
  is implemented but not yet wired into the (TS-implemented)
  specialists. They currently consult only the artifact helper, which
  uses `defaultApprovalStatus()`. Per-tool gating lands when the
  upcoming MCP-style specialist runner does.
- **Streaming token output** — chat responses are still one-shot. The
  AssignmentCard appears after the model finishes. Streaming is a
  separate v0.1.9 task that touches the same route handler.
- **Stress test** — the audit's 50-concurrent-POST script is documented
  in the plan but not committed; the mutex + atomic-write fixes
  underneath are tested visually. CI integration can land alongside
  any real CI setup.

## Verification (manual)

Run against `pnpm dev`:

1. **Plan mode dispatch**: switch the ChatPanel header to **Plan**.
   Tell the Orchestrator "Audit example.com for technical SEO." →
   the response includes an AssignmentCard with status `proposed` and
   an `Approve & run` button. Clicking Approve transitions
   `proposed → queued → running → succeeded` and the SpecialistInbox
   shows the same lifecycle.
2. **Auto mode + attachments**: switch to **Auto**, attach a SERP
   screenshot (drag-drop) and a PDF brief (📎 attach). Send. → The
   Orchestrator's reply references both. The user turn in the chat
   history shows the inline image tile + PDF card. The vault gets a
   `wiki/specialists/<id>/hot.md` with full marketing-brain.v1
   frontmatter including `rollback_note`.
3. **Resilience**: while a job is `running`, kill `pnpm dev`. Restart.
   → on boot the recovery hook transitions the job to `failed:
   "orphaned by restart"` and the same status propagates to the
   linked Assignment row.
4. **Idempotency**: hit the dispatch flow twice quickly with the same
   `request_id`. → one row in `assignments`, one in `jobs`.
5. **Cache**: with `ANTHROPIC_API_KEY` set, send 5 chat messages and
   check the response `meta.cacheReadInputTokens` — should be > 0 on
   messages 2-5 (system prompt + tool definitions cached together).

## Out of scope (deferred)

Same list as the plan. Most notably: multi-user collaboration, vault
diff viewer, migrating old on-disk chat turns into the new schema
(handled by back-fill on read instead).
