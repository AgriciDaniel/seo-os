# Multi-Client Isolation Audit + Hardening

**Date**: 2026-05-12
**Branch**: `feat/orchestration-v2` (continuation)
**Scope**: Audit every "one client, one brain" boundary and close the gaps.

## TL;DR

Storage isolation was already solid — each client's data lives under
`.seo-office/vaults/<slug>/`, every relevant SQLite table carries a
`client_slug` FK with `ON DELETE CASCADE`, and the index DB is shared but
strictly partitioned at the row level. **The gap was at the API surface:**
several id-keyed routes (e.g. `/api/jobs/[id]/events`) looked up rows by id
alone, so a caller who guessed another client's job id could read its
progress stream or cancel it.

Six concrete fixes shipped. **23/23 isolation assertions pass** in a
self-contained Node smoke test (`scripts/dev/test-isolation.mjs`).

## What "multi-client" means in SEO Office

One user, many client brains. The user creates clients via
`POST /api/clients`, each gets:

1. A row in `clients` (PK = slug).
2. A vault directory at `.seo-office/vaults/<slug>/wiki/…` with:
   - `manifest.json` — owner, site_under_audit, schema version.
   - `hot.md` — single overwritten-in-place working memory file.
   - `log.md` — append-only audit log.
   - `specialists/<id>/hot.md` — per-specialist mailbox.
   - `tasks/<date>-<id>.md` — Task tree plan mirrors.
   - `audits/<date>-<type>.md` — specialist output artefacts.
   - `.chat/<target>.jsonl` — per-conversation chat history.
   - `.chat/attachments/<sha256>.<ext>` — content-addressed attachments.
3. SQLite rows scoped by `client_slug`:
   - `notes` — frontmatter index of every `.md` in `wiki/`.
   - `jobs` — specialist execution records.
   - `assignments` — Orchestrator → Specialist envelopes.
   - `tasks` — Task tree primitive (lazy table).

All four DB tables carry `FOREIGN KEY (client_slug) REFERENCES clients(slug)
ON DELETE CASCADE`. Deleting the client row cascades to every dependent.

## Audit findings (verified against source, then fixed)

### CRITICAL: API routes that took only `[id]`

These routes resolved rows by id alone — a caller who guessed another
client's id could read or mutate them. Fixed by requiring `?slug=<client>`
and verifying `row.client_slug === slug` before any read/write. Missing
slug → 400; mismatch or missing row → 404 (never leak "exists but not
yours").

| Route                                  | Before                       | After                                               |
|----------------------------------------|------------------------------|-----------------------------------------------------|
| `GET /api/jobs/[id]/events`            | `getJob(id)`                 | `?slug=` required; `getJobForClient(id, slug)`      |
| `GET    /api/assignments/[id]`         | `getAssignment(id)`          | `?slug=` required; `getAssignmentForClient(id, …)`  |
| `DELETE /api/assignments/[id]`         | `getAssignment(id)`          | `?slug=` required; cancelJob(jobId, slug)            |
| `POST   /api/assignments/[id]/approve` | `getAssignment(id)`          | `?slug=` required                                    |
| `POST /api/clients/[slug]/tasks/[id]/run` | `getTask` via runner only | now verifies `task.client_slug === slug` upfront    |

### CRITICAL: `cancelJob(id)` had no ownership check

Anyone with a job id could cancel it. Now:

```ts
cancelJob(id: string, client_slug: string): boolean
// UPDATE jobs SET ... WHERE id = ? AND client_slug = ? AND status IN (…)
// returns true iff the (id, slug) pair actually matched a live row
```

A cross-client cancel attempt silently no-ops (no DB change, no SSE
emission). The owner gets a real cancellation.

### MEDIUM (architectural): Event bus keyed by `jobId` alone

Per-job listeners used a `Map<jobId, Set<Listener>>`. Job IDs are UUIDs
so collision risk is effectively zero, but the design didn't enforce
client scoping — a future change could accidentally subscribe across
clients. Fixed by using a composite key `${slug}::${jobId}`:

```ts
subscribe(slug, jobId, fn)
publish(slug, event)
emit(slug, jobId, kind, message, extra)
```

Every callsite (`job-queue.ts`, `recovery.ts`, `task-runner.ts`, the SSE
route at `/api/jobs/[id]/events`) was updated to thread the slug through.

### MEDIUM: Recovery hook had no per-client telemetry

Previous version swept globally and emitted events without slug awareness.
After the event-bus key change, every emission already carries the owning
slug — and the recovery summary now returns a `perClient: Record<slug, n>`
breakdown so callers can see "client A had 2 orphans, client B had 0."
SQL sweep is still a single transaction (cheaper than N round-trips); the
isolation is at the event/notification layer.

### HIGH: No DELETE route for clients

The dashboard offered create + list + read but no way to remove a client
(beyond manual SQL + `rm -rf`). Added:

```http
DELETE /api/clients/[slug]?confirm=1
```

Two-step explicit:
1. `?confirm=1` is required — bare DELETE returns 400. Protects against
   misconfigured fetch/curl.
2. DB rows go first (FK CASCADE prunes notes/jobs/assignments/tasks
   atomically); then the on-disk vault directory is removed with
   `fs.rm({ recursive: true, force: true })`.

If step 2 fails partway, a follow-up `DELETE` returns 404 (no DB row),
which is the right user-facing answer.

### LOW: UI callers had to be updated to pass the slug

`ChatPanel.tsx`, `SpecialistInbox.tsx`, and `JobStream.tsx` had `fetch()`
calls and `new EventSource(...)` URLs that didn't carry `?slug=`. All
three updated. The slug was already in scope (component prop), so the
diff was tiny.

## New module: `src/lib/orchestrator/ownership.ts`

The shared ownership-guard layer. Six exports:

```ts
getJobForClient(id, slug)           → JobRecord | null
getAssignmentForClient(id, slug)    → Assignment | null
getTaskForClient(id, slug)          → Task | null
assertJobOwnedBy(id, slug)          → JobRecord (throws on mismatch)
assertAssignmentOwnedBy(id, slug)   → Assignment
assertTaskOwnedBy(id, slug)         → Task
clientExists(slug)                  → boolean
```

Plus a tagged error class `CrossClientAccessError` so routes can map
internal mismatches to a 404 without leaking which case ("missing"
vs. "owned by another client") triggered it.

## Verification

`scripts/dev/test-isolation.mjs` opens the live SQLite DB and runs 23
assertions covering every ownership-guard surface. Sample output:

```
== Jobs ==
  ✓ getJobForClient(jobId, A) returns row
  ✓ getJobForClient(jobId, B) returns null
  ✓ getJobForClient(unknownId, A) returns null
== Assignments ==
  ✓ getAssignmentForClient(asgId, A) returns row
  ✓ getAssignmentForClient(asgId, B) returns null
== Cross-client cancelJob ==
  ✓ cancelJob(jobId, B) changes 0 rows
  ✓ job still 'running' after cross-client cancel attempt
  ✓ cancelJob(jobId, A) changes 1 row
  ✓ job is 'cancelled' after owner cancel
  ✓ cancelJob(jobId, A) second time changes 0 rows
== FK CASCADE on client delete ==
  ✓ jobs for deleted client = 0 (FK CASCADE)
  ✓ assignments for deleted client = 0 (FK CASCADE)
=== Result: 23 pass, 0 fail ===
```

Run with `node scripts/dev/test-isolation.mjs`. No project boot required —
seeds two rows under one client, exercises the same SQL the helpers run,
asserts the cross-client predicates return null, cleans up. Failure
mode: non-zero exit + named-assertion list.

## What was explicitly NOT changed

- **Storage layout** — already isolated. Vault paths funnel through
  `vaultRoot(clientSlug)` and there's no shared writable file across
  clients.
- **`/api/agents`** — the cross-client Agent View. This is *intended*
  to read across slugs; rows include `client_slug` for grouping. Not a
  leak.
- **`/api/clients/[slug]/jobs/stream`** — already correctly scoped via
  the slug in the path + `getClient()` check.
- **Chat attachments** — `/api/chat/attachments/[sha256]` already
  required `?slug=` and called `getClient(slug)` before reading. Defence
  in depth was already there.

## Out of scope (next time)

- **Multi-process safety** — the SQLite WAL + per-client mutex
  serialise correctly within one Node process; concurrent `pnpm dev`
  on the same vault is undefined behaviour. Single-user local app —
  not a concern today.
- **Sub-vault sharing** — e.g. shared snippet libraries across clients.
  Not in v0.1.8.
- **Cross-client SSE multiplex** on `/agents` — current 3s poll is
  perfectly adequate for the single-tenant deployment model.

## Files changed

**New:**
- `src/lib/orchestrator/ownership.ts` — guards + `CrossClientAccessError`
- `scripts/dev/test-isolation.mjs` — 23-assertion smoke test
- `docs/design/2026-05-12-multi-client-isolation.md` (this file)

**Modified:**
- `src/lib/orchestrator/events.ts` — composite `(slug, jobId)` key
- `src/lib/orchestrator/job-queue.ts` — `cancelJob(id, slug)`, emit signatures
- `src/lib/orchestrator/recovery.ts` — per-client telemetry, slug-aware emit
- `src/lib/orchestrator/task-runner.ts` — `subscribe(slug, jobId, …)`
- `src/app/api/jobs/[id]/events/route.ts` — `?slug=` enforcement
- `src/app/api/assignments/[id]/route.ts` — `?slug=` enforcement (GET + DELETE)
- `src/app/api/assignments/[id]/approve/route.ts` — `?slug=` enforcement
- `src/app/api/clients/[slug]/route.ts` — added DELETE handler
- `src/app/api/clients/[slug]/tasks/[id]/run/route.ts` — task ownership check
- `src/components/JobStream.tsx` — `slug` prop + threading into EventSource URL
- `src/components/ChatPanel.tsx` — slug query param on approve/discard fetches
- `src/components/office/SpecialistInbox.tsx` — same
- `src/app/office/OfficeWorkspace.tsx` — pass slug to JobStream
- `src/app/clients/[slug]/ClientDetailClient.tsx` — same
