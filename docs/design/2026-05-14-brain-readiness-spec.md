---
title: SEO Office — Brain Readiness Spec ("100% on first build")
version: v0.1
date: 2026-05-14
status: living document
owners: [agricidaniel]
brain_schema: marketing-brain.v1
related:
  - docs/design/2026-05-11-seo-office-design.md
  - AGENTS.md
---

# SEO Office — Brain Readiness Spec

## Purpose

Define every guarantee the **client onboarding + first `build-brain` sweep** must satisfy so that, end-to-end, a freshly created client vault reaches **100% readiness** without manual cleanup. Forward this to the office maintenance agent.

This is **not** an architecture doc (see [`2026-05-11-seo-office-design.md`](2026-05-11-seo-office-design.md)). This is a **conformance contract**: a list of failure modes observed (or anticipated) in the 2026-05-13 build of the `claude-seo.md` vault, each paired with the exact guarantee that would prevent recurrence.

## Context: what happened on 2026-05-13

The `build-brain` template ran cleanly. All 12 specialists succeeded. All 8 audits + 4 deliverables landed on disk. The orchestrator's next-action engine reported `"All caught up [idle]"`.

A four-agent parallel audit then found that the vault was only ~70% ready:

- 58 unfilled `{{placeholder}}` tokens across 34 files (including 4 files literally named `{{client_name}}.md` etc.)
- A vault-wide slug typo `claude-code-skill-developm-ent-ai` in 78 files (one-off data integrity issue, not a recurring bug)
- `wiki/index.md` did not link a single 2026-05-13 artifact
- `.manifest.json.sources` was `{}` despite a full sweep
- 12 specialist hot caches remained at `status: queued` after their jobs flipped to `succeeded`
- All audits cited a source `[[claude-seo.md marketing-brain]]` that no note actually exists for
- Keyword volumes were model-estimated, not from DataForSEO — silently
- The "All caught up" verdict came from job-queue state, not vault content health

**Root cause class:** the pipeline does the expensive work (12 specialist executions) correctly but skips the **cheap last-mile finalization** (post-sweep aggregation, status mirroring, source-note creation, content-health linting).

## Definition of "100% ready"

A vault is **100% ready** iff all of the following hold immediately after `build-brain` completes:

1. Zero `{{...}}` substrings anywhere under `wiki/` (filenames or content).
2. Zero `TODO`, `TBD`, `FILL IN`, `Lorem ipsum` substrings.
3. Every `[[wikilink]]` resolves to an existing note.
4. Every emitted note has the 6 required frontmatter fields (`brain_schema`, `owner`, `confidence`, `approval_status`, `rollback_note`, `risk_level`).
5. `wiki/index.md` references every dated artifact produced by the sweep.
6. `.manifest.json.sources` records every artifact path + specialist + cost.
7. Every specialist's `wiki/specialists/<id>/hot.md` matches the assignment's final status (`succeeded` / `failed` / `skipped`), with `completed_at` set.
8. No artifact silently used stub or model-estimated data — anything that did is stamped `confidence: low` + `data_source: model_estimate`.
9. The brain health linter returns `score >= 95/100`.
10. The orchestrator's next-action engine reads `brain_health_score` AND job-queue state before declaring `idle`.

## Requirements

Each requirement: failure mode → required guarantee → owner module → acceptance check. Grouped by tier.

---

### Tier 1 — must ship for "100% on first build"

These close the gaps observed on 2026-05-13. Without them, every new client vault will exhibit the same partial-readiness state.

#### R1. Onboarding inputs collection

- **Failure mode.** Client creation form collects only `name` + `slug`. The template-brain has placeholders for `{{site_brand}}`, `{{site_type}}`, `{{niche}}`, `{{client}}` that are never sourced.
- **Required guarantee.** Before `scaffoldClient()` runs, the input record must contain values for every distinct `{{key}}` present in the template. A pre-scaffold validator must grep the template, build the slot set, and reject the request if any slot lacks a value.
- **Inputs to collect** (minimum):
  | Field | Purpose | Example |
  |---|---|---|
  | `client_name` | filenames, entity title | `claude-seo.md` |
  | `client_slug` | folder name (auto-derived, server-validated) | `claude-seo-md` |
  | `site_brand` | brand entity, `[[{{site_brand}}]]` resolution | `Claude SEO` |
  | `site_url` | manifest, audit fetches | `https://claude-seo.md` |
  | `site_type` | E-E-A-T concept file, business overlay | `open-source developer tool` |
  | `niche` | strategy framework, seasonal playbook | `AI SEO toolkit` |
  | `owner` / `author_byline` | E-E-A-T author signals | `AGRICI DANIEL` |
  | `monetization_model` | overlay selection | `open-source` / `saas` / `affiliate` |
  | `primary_competitors[]` (3–5) | competitors entity, competitor-pages | `Ahrefs, Semrush, SurferSEO` |
  | `target_persona` (1–2 lines) | sxo + content | `SEO practitioners adopting Claude Code` |
  | `locale` + `timezone` | hreflang, date stamping | `en-US, America/Los_Angeles` |
  | `measurement_access[]` (checkboxes) | integration gating | `GSC ✓, GA4 ✓, DataForSEO ✗` |
  | `github_url` (optional) | github-aware sweep (R18) | `https://github.com/AgriciDaniel/claude-seo` |
- **Owner.** `src/app/clients/new/page.tsx` (form) + `src/lib/brain/scaffold.ts` (validator) + `src/lib/brain/types.ts` (`ClientInput` zod schema).
- **Acceptance.** Unit test: scaffold rejects an input missing any slot present in the live template. Integration test: scaffold a client with the full input set, then `grep -r '{{' wiki/` returns zero matches.

Verified 2026-05-18: onboarding/scaffold input validation now has a shared runtime contract in `src/lib/brain/types.ts` as `ClientInputSchema`; `/api/clients` and `scaffoldClient()` both parse through it before any vault path is created. `scaffoldClient()` still greps the live vendored template before rendering via `assertAllTemplateSlotsCovered()`, and that check now rejects template placeholders that have slot keys but blank runtime values. Focused coverage in `src/lib/brain/__tests__/scaffold-smoke.test.ts` proves missing/blank live-template slot inputs throw `ZodError` before creating a vault, and the full scaffold smoke still proves a complete input set renders with zero `{{...}}` tokens under `wiki/` and `_templates/`.

#### R2. Scaffold-time post-conditions (incl. auto-created source note)

- **Failure mode.** Today's `scaffoldClient()` returns without asserting the vault is internally consistent. The `[[<vault-name>]]` source note referenced from `src/lib/specialists/_lib/artifact.ts:98` is never created.
- **Required guarantee.** Before `scaffoldClient()` returns, the vault must satisfy:
  1. Zero `{{...}}` strings under `wiki/` (filenames + content).
  2. The vault metadata source note exists at `wiki/sources/<vault-name>.md` with manifest-derived metadata. (Decision: create the note rather than rerouting `sources:` to `[[overview]]` — preserves provenance.)
  3. `wiki/index.md` lists every initial entity, concept, and flow.
  4. `hot.md` frontmatter `created:` and `updated:` = scaffold day.
  5. `.manifest.json.sources` initialized to `{ "audits": [], "deliverables": [] }` (shape defined, even if empty).
  6. Every emitted note has the 6 required frontmatter fields.
- **Owner.** `src/lib/brain/scaffold.ts` (post-write assertion block).
- **Acceptance.** Unit test asserts each of the 6 post-conditions on a fresh vault. The scaffold function throws (not warns) on any violation.

Verified 2026-05-18: scaffold postconditions are enforced by the production scaffold pipeline and executable smoke coverage. `scaffoldClient()` renders the template, applies the business-type overlay through validated note writes, writes the canonical `.raw/.manifest.json`, creates `wiki/sources/<vault-name>.md`, rebuilds `wiki/overview.md` and `wiki/index.md`, repairs seed placeholder debt, reindexes, then runs `lintVault(stage: "scaffold")` and throws on health-gate failure. The fresh scaffold test now asserts the canonical manifest exists with an empty source ledger record, the legacy root manifest does not exist, the metadata source note exists, filename/content placeholders are gone under `wiki/` and `_templates/`, `hot.md` created/updated dates equal scaffold day, every emitted wiki note has the required marketing-brain.v1 frontmatter fields, the regenerated index is placeholder-free, and scaffold/ready lint gates have zero blocking findings. The spec's older `{ audits: [], deliverables: [] }` manifest-source shape has been superseded by the typed `Record<string, ManifestSource>` ledger in `ClientManifestSchema`, initialized as `{}` and populated by source recording/finalization.

#### R3. Brain schema TypeScript types + zod validation (foundation)

- **Failure mode.** `AGENTS.md` declares `marketing-brain.v1` as the schema. `src/lib/brain/types.ts` is the stated home for shared types but the types are not yet exhaustive. Frontmatter compliance is enforced by code-by-convention. Nothing fails the build when a specialist emits a note missing `rollback_note`.
- **Required guarantee.**
  - Define `BrainNoteSchema` (zod) covering all 6 required frontmatter fields + optional ones.
  - Every read from disk goes through `BrainNoteSchema.parse()`.
  - Every write goes through `BrainNoteSchema.parse()` before serialization.
  - Define `ArtifactSchema`, `SpecialistResultSchema`, `ClientManifestSchema` similarly.
  - Document schema-version migration policy (`marketing-brain.v1 → v2` path) even before v2 exists.
- **Owner.** `src/lib/brain/types.ts` (new), `src/lib/brain/io.ts` (read/write wrappers).
- **Acceptance.** Compile-time: no `any`-typed brain reads/writes remain in `src/`. Runtime: malformed note triggers `ZodError` with field-level message, not silent acceptance.

Verified 2026-05-18: the named R3 schemas now exist in `src/lib/brain/types.ts`: `BrainNoteSchema`, `ArtifactSchema`, `SpecialistResultSchema`, and `ClientManifestSchema`. `readNote()` and `writeNote()` in `src/lib/brain/vault-fs.ts` validate through `BrainNoteSchema.parse()` at the vault I/O boundary, so notes missing required marketing-brain.v1 frontmatter fail with a field-level `ZodError` instead of being silently accepted. The job queue validates every specialist return value through `SpecialistResultSchema.parse()` before orchestrator review and job success persistence. The remaining broad audit is now executable: `src/lib/brain/__tests__/r3-brain-io-audit.test.ts` fails on explicit `any` in production `src/` and fails any new raw brain I/O call site (`readRaw`, `writeRaw`, direct `gray-matter` parsing) unless it is reviewed with an in-test reason. The API brain graph/note routes now read markdown through `readNote()` instead of ad-hoc `gray-matter` parsing, and scaffolded business-type overlays are parsed only to split frontmatter/body before being written through `writeNote()` validation. Focused coverage: `src/lib/brain/__tests__/types.test.ts` validates all named schemas and asserts malformed read/write notes missing `frontmatter.rollback_note` throw `ZodError`; `src/lib/brain/__tests__/r3-brain-io-audit.test.ts` proves the compile-time audit currently has zero explicit `any` escapes and no unreviewed raw brain I/O.

#### R4. Multi-tenant client_slug scoping + sweep concurrency (AGENTS.md hard rule #8)

- **Failure mode.** `AGENTS.md` requires multi-tenant data model from day one. Phase 1 is single-user, but cross-client leakage in the SQLite index or filesystem writes would corrupt every user's data on the day phase 2 ships. Separately: nothing today prevents two `build-brain` sweeps running concurrently on the same client (double-click, parallel browser tabs, or — in phase 2 — two users). Concurrent writes to `wiki/log.md`, `wiki/hot.md`, and `.manifest.json` would interleave; SQLite WAL handles readers-with-one-writer but not two parallel writers on the same row.
- **Required guarantee.**
  - **Scoping.** Every SQLite query includes `WHERE client_slug = ?`. Every specialist execution receives a `clientSlug` and cannot read or write outside `.seo-office/vaults/<slug>/`. A path-clamping helper rejects any resolved path that escapes the client's vault root.
  - **Sweep lock.** Per-client advisory lock: `acquireSweepLock(clientSlug, sweepType)`. Returns a `runId` on success; rejects with `Error: sweep_already_running` if another sweep on the same client + same sweep type is in flight. Lock entries live in SQLite (`sweep_locks` table) with `acquired_at`, `holder_pid`, `expires_at`. Stale locks (older than 2 × max sweep duration) are reclaimable.
  - **File-write atomicity.** Writes to `wiki/log.md`, `wiki/hot.md`, `.manifest.json` go through a per-file mutex (in-process) plus an `O_EXCL` temp-file-then-rename pattern so partial writes never reach disk.
  - **SQLite mode.** Confirm `journal_mode=WAL` is set at DB open. Document it in the init code with a comment referencing this requirement.
- **Owner.** `src/lib/brain/index.ts` (DB layer + sweep locks), `src/lib/specialists/_lib/context.ts` (specialist execution context), `src/lib/brain/io.ts` (atomic file writers).
- **Acceptance.**
  - **Isolation.** End-to-end test creates two clients, runs build-brain on client A, asserts client B's vault is byte-identical to its pre-run snapshot. SQL-level test: every prepared statement file matches `WHERE.*client_slug` or is documented as global.
  - **Concurrency.** Test attempts to dispatch a second build-brain on the same client while the first is mid-sweep; asserts the second call rejects with `sweep_already_running`. Test attempts the same on a *different* client and asserts it succeeds.

Verified 2026-05-18: R4 has executable coverage for database scoping, filesystem path clamps, sweep locks, atomic writes, and cross-client sweep isolation. SQLite opens in WAL mode with an inline R4 comment in `src/lib/brain/index-db.ts`, and `sweep_locks` now records `(client_slug, sweep_type, token, acquired_at, holder_pid, expires_at)` so the same client/template can have only one live sweep while stale locks are reclaimed. `resolveVaultRelative()` rejects absolute and escaping vault paths, and the job queue still passes a clamped `vaultRoot`/`clientSlug` through `SpecialistContext`. `writeNote()` / `writeRaw()` now use O_EXCL temp-file creation plus atomic rename; `log.md` and `hot.md` already hold read-modify-write mutexes, and `.raw/.manifest.json` now does too via `writeManifest()` / `recordSource()` so parallel source recordings do not lose manifest rows. Focused coverage: `src/lib/brain/__tests__/paths.test.ts` proves vault path clamping; `src/lib/brain/__tests__/sweep-lock.test.ts` proves same-client lock rejection, stale-lock reclamation, and holder PID/acquired-at metadata; `src/lib/brain/__tests__/concurrent-writes.test.ts` proves `log.md` and manifest parallel writes survive without temp leaks; `src/lib/brain/__tests__/r4-sql-scope-audit.test.ts` scans production SQL so tenant-table `SELECT`/`UPDATE`/`DELETE` statements must be client-scoped or explicitly reviewed as global/internal; `e2e/sweep-concurrency.spec.ts` proves same-client duplicate sweep rejection, parallel different-client acceptance, and byte-identical untouched client vault state after running build-brain for another client.

#### R5. Specialist execution contract (input + output)

- **Failure mode.** Specialists receive a free-text `brief` and parse it ad-hoc. There is no typed return shape, so the orchestrator can't aggregate cost, confidence, sources, or next-action hints without re-scanning the vault.
- **Required guarantee.** Both input and output are typed and validated.

```ts
// src/lib/specialists/_lib/context.ts
export type SpecialistContext = {
  clientSlug: string;
  manifest: ClientManifest;
  vaultRoot: string;                // clamped — see R4
  priorArtifacts: ArtifactRef[];    // for specialists with dependencies
  integrations: IntegrationHandles; // resolved Anthropic, DataForSEO, etc.
  signal: AbortSignal;              // cancellation
  budget: { maxCostUsd?: number; maxDurationMs?: number };
  permissionMode: 'read_only' | 'auto' | 'full_access';
  runId: string;                    // see R10 (idempotency)
};

export type SpecialistResult = {
  status: 'succeeded' | 'partial' | 'skipped' | 'failed';
  artifact_path?: string;
  data_artifact_path?: string;
  source_paths: string[];
  data_sources: Array<'live_api' | 'cached' | 'model_estimate' | 'manual'>;
  confidence: 'high' | 'medium' | 'low';
  cost_usd?: number;
  duration_ms: number;
  side_effects: { wrote: string[]; appended: string[] };
  next_actions_suggested?: Array<{ specialist_id: string; reason: string }>;
  skip_reason?: string;
  error?: { message: string; recoverable: boolean };
};
```

- **Owner.** `src/lib/specialists/_lib/context.ts` (new), every file in `src/lib/specialists/*.ts` (return-shape conformance).
- **Acceptance.** TypeScript: every specialist's `execute()` signature matches `(ctx: SpecialistContext) => Promise<SpecialistResult>`. Runtime: orchestrator validates the result before persisting.
- **Note.** Directly load-bearing for the orchestrator↔specialist connection rewrite currently in flight.

Verified 2026-05-18: specialist result validation is enforced at runtime in `src/lib/orchestrator/job-queue.ts`; raw specialist outputs, including deterministic e2e mock outputs, pass through `SpecialistResultSchema.parse()` before evidence recording, orchestrator review, and `markSucceeded()`. The runtime `SpecialistContext` is expanded at the queue boundary and is required by TypeScript: every queued specialist receives schema-parsed `input`, `manifest`, clamped `vaultRoot`, `priorArtifacts`, integration readiness handles, cancellation `signal`, `budget`, `permissionMode`, and `runId` in addition to the legacy job/client/event fields. `Specialist.execute` is a ctx-first function (`(ctx: SpecialistContext<I>) => Promise<SpecialistResult>`) across the registry and all registered specialists; payload parsing happens once in the job queue via each specialist's `inputSchema`, then specialists read `ctx.input`. `src/lib/orchestrator/__tests__/specialist-context.test.ts` proves the real job queue passes parsed input plus the expanded context into a registered specialist's ctx-first `execute()` method, and the queue no longer leaves fresh-DB jobs stuck when the optional `tasks` table has not been lazily created yet. The final R5 output envelope exists as `SpecialistExecutionResultSchema` in `src/lib/brain/types.ts`; `SpecialistResultSchema` accepts a native `executionResult`, and `src/lib/orchestrator/specialist-result.ts` persists that native envelope directly while still merging queue-measured duration, evidence-ledger side effects, and degraded-mode partial/low-confidence overrides. `writeArtifact()` returns a validated native execution envelope, every ready production specialist that writes artifacts returns that envelope, and deterministic e2e mock specialists pass through the same artifact envelope. The compatibility normalizer is intentionally retained as a tested extension surface for ad-hoc/local specialists and manual probes; production ready specialists are guarded to use native envelopes. Guardrail coverage in `src/lib/specialists/__tests__/catalog.test.ts` fails if a ready artifact-writing specialist omits `executionResult`; `src/lib/specialists/_lib/__tests__/artifact.test.ts` proves the shared writer emits the envelope; `src/lib/orchestrator/__tests__/specialist-result.test.ts` proves the queue persists specialist-provided native envelopes and only uses adapter normalization as fallback for compatibility/manual probe results plus failed/skipped helpers.

#### R6. Build-brain finalization hook

- **Failure mode.** When the last child job of `build-brain` flips to `succeeded`, nothing aggregates. `index.md` stays unchanged, `.manifest.json.sources` stays `{}`, `wiki/log.md` accumulates 12 separate child entries.
- **Required guarantee.** A new `finalizeBrainSweep(clientSlug, runId)` fires when the root task's children all reach a terminal state. It executes:
  1. `regenerateIndex(clientSlug)` — rewrites `wiki/index.md` artifact lists between `<!-- auto:audits -->` markers; preserves hand-curated lead text.
  2. `populateManifestSources(clientSlug, runId)` — appends every artifact (path, specialist_id, run_id, date, cost_usd) to `.manifest.json.sources`.
  3. `refreshSpecialistHotCaches(clientSlug)` — see R7.
  4. `bumpHotMd(clientSlug)` — update `wiki/hot.md` frontmatter `updated:` to completion time.
  5. `appendSweepLogEntry(clientSlug, summary)` — one entry in `wiki/log.md`, not 12.
  6. `writeSweepSummary(clientSlug, runId)` — aggregate review at `wiki/reviews/<date>-sweep-summary.md`.
  7. `captureFirstDriftBaseline(clientSlug)` if no baseline exists — see R11.
  8. `runLinterAndGate(clientSlug)` — see R8.
- **Owner.** `src/lib/orchestrator/finalize-sweep.ts` (new), hooked from `src/lib/orchestrator/job-queue.ts` after `markSucceeded()` on the parent task.
- **Acceptance.** Integration test: run build-brain, assert each of the 8 post-conditions on disk. Assert `wiki/log.md` gained exactly **one** sweep entry, not twelve.

Verified 2026-05-18: `finalizeBrainSweep()` is wired from the terminal sweep path in `src/lib/orchestrator/task-runner.ts` and now performs the launch-blocking finalization duties in one place. It appends task artifact/report/data rows into the canonical manifest source ledger with stable keys that include sweep task, specialist, and artifact kind; carries evidence-ledger cost into those rows; rebuilds overview/index after reindexing; writes the aggregate review note under `wiki/reviews/`; runs the vault linter/readiness gate and attaches `reviewPath` to the returned readiness report; purges expired `.raw/` cache entries while preserving `.raw/.manifest.json`; bumps `wiki/hot.md` `updated:` to finalization day; and appends exactly one sweep review entry to `wiki/log.md`. The source ledger schema is the typed `Record<string, ManifestSource>` shape from R3 rather than the original draft `{ audits: [], deliverables: [] }` array shape; task/specialist/run identity is encoded in the source key and `retrieved_at` timestamp. Focused coverage in `src/lib/orchestrator/__tests__/finalize-sweep.test.ts` proves partial-brain review generation, skipped-integration `needs_data` finalization, cost propagation into manifest source rows, `.raw/` retention, hot-date bumping, and exactly one parsed sweep log entry. R7 covers the specialist hot-cache transition mirror used before finalization, and R11/R14 coverage proves drift baseline and partial-sweep terminal behavior around the finalizer.

#### R7. Assignment status mirroring on every transition

- **Failure mode.** `mirrorAssignmentToVault()` is called only at assignment creation. The vault hot cache stays at `status: queued` forever, even after the job succeeds.
- **Required guarantee.** Hook `mirrorAssignmentToVault()` into `updateStatus()` so it fires on every transition:
  - `pending → running`: add `started_at`.
  - `running → succeeded`: add `completed_at`, `artifact_path`.
  - `running → failed`: add `failed_at`, `error.message`.
  - `* → skipped`: add `skip_reason`.
- **Owner.** `src/lib/orchestrator/job-queue.ts` (specifically the assignment status repo).
- **Acceptance.** Integration test: dispatch a specialist, observe `wiki/specialists/<id>/hot.md` change at each transition. Assert `status` and timestamp fields match the assignment row in SQLite at all times.

Verified 2026-05-18: assignment status transitions now persist explicit lifecycle fields on the assignment row (`started_at`, `completed_at`, `failed_at`, `skip_reason`) and automatically mirror the current row into `wiki/specialists/<id>/hot.md`. Direct calls to `updateStatus()` update those fields, tenant-scope the SQL mutation by `client_slug`, and queue a vault mirror write. Job-driven status sync in `src/lib/orchestrator/job-queue.ts` applies the same lifecycle field updates and mirrors linked assignments after `markRunning()`, `markSucceeded()`, `markFailed()`, and cancellation. `renderAssignmentBody()` now emits `Started at`, `Completed at`, `Failed at`, and `Skip reason` lines from the SQLite row instead of deriving terminal time from generic `updated_at`. Focused coverage in `src/lib/orchestrator/__tests__/assignment-hot.test.ts` proves the hot mirror updates automatically for running, succeeded, failed, and skipped transitions; asserts the rendered timestamps match the assignment row; and verifies terminal artifact-path rendering for succeeded jobs. `src/lib/brain/__tests__/r4-sql-scope-audit.test.ts` also stays green, proving the new lifecycle updates remain tenant-scoped.

#### R8. Brain health linter + multi-stage quality gate

- **Failure mode.** The "All caught up [idle]" verdict came from job-queue state, not vault content health. The vault was 70% ready and nothing surfaced it. Worse: lint defects introduced in Diagnostic phase propagated through Discovery and Synthesis before anything checked.
- **Required guarantee.** A `vault-linter` runs at **four** points, not just at sweep end:
  1. **Post-scaffold** — `scaffoldClient()` calls it as its final step. Throws if `score < 95` — no partial vaults reach the user.
  2. **Between phases of `build-brain`** — the plan template inserts a linter run after Phase 1 (Diagnostic) and after Phase 2 (Discovery). If a phase's artifacts fail lint, the next phase **does not dispatch**; the sweep ends with `status: blocked_by_lint` and surfaces the defect list. This is the check that would have caught the 2026-05-13 substitution failure at write time instead of after the full sweep.
  3. **Post-sweep** — invoked from `finalizeBrainSweep()` ([R6](#r6-build-brain-finalization-hook)); attaches the final `LintReport` to the sweep result.
  4. **On demand** — exposed as a callable specialist (already in registry — wire it in).
- **Checks.**
  - Zero `{{`, `TODO`, `TBD`, `FILL IN`, `Lorem ipsum` matches in `wiki/`.
  - Zero placeholder filenames.
  - Every `[[wikilink]]` resolves.
  - Every note has 6 required frontmatter fields.
  - No known-bad slug typos (regex list, extensible).
  - Every `sources:` wikilink in audit frontmatter resolves to an existing note.
- **Output.** Structured `LintReport`:
  ```ts
  { score: number; // 0-100
    defects: Array<{ severity: 'critical' | 'high' | 'medium'; path: string; line?: number; rule: string; message: string; suggested_fix?: string; }>;
    summary: string;
    phase?: 'post-scaffold' | 'between-phase-1' | 'between-phase-2' | 'post-sweep' | 'on-demand';
  }
  ```
- **Gating.** The orchestrator's `next-action` engine reads `brain_health_score`. `"idle"` is only emitted when `score >= 95` AND job queue is drained.
- **Owner.** `src/lib/specialists/vault-linter.ts` (already in registered list — wire it in), `src/lib/orchestrator/task-templates.ts` (insert lint nodes into `BUILD_BRAIN_SWEEP`), `src/lib/orchestrator/next-action.ts`, `src/lib/brain/scaffold.ts`.
- **Acceptance.**
  - Test A: synthesize a vault with one `{{niche}}` left over; assert linter score < 95 AND next-action returns a defect-fix recommendation, not `idle`.
  - Test B: inject a `{{placeholder}}` into a Phase 1 artifact mid-sweep; assert Phase 2 does NOT dispatch and the sweep ends in `status: blocked_by_lint`.

Verified 2026-05-18: R8 is now wired at every launch-blocking point. `scaffoldClient()` runs the vault linter before returning and throws on scaffold-stage health failures; `nextActionFor()` reads vault health before queue idleness and returns `run-vault-linter` rather than `idle` when lint blockers exist; `finalizeBrainSweep()` runs the post-sweep lint/readiness gate and attaches the final health state to the sweep result. The `build-brain` template now includes explicit `vault-linter` nodes at `intake`, `diagnostic`, `discovery`, and `final`: diagnostic and discovery lint gates run after their phase artifacts and before the corresponding `phase-gate`, so phase-local placeholder/link/schema/source-reference debt blocks downstream work through the same dependency cancellation path as other hard gate failures. Focused coverage: `src/lib/brain/__tests__/scaffold-smoke.test.ts` proves fresh scaffolds are lint-clean; `src/lib/specialists/__tests__/vault-linter.test.ts` proves placeholder, filename, wikilink, frontmatter, source-link, and banned-pattern rules; `src/lib/orchestrator/__tests__/next-action.test.ts` proves lint blockers are non-idle; `src/lib/orchestrator/__tests__/build-brain-template.test.ts` proves the explicit diagnostic/discovery lint gates and dependencies; `src/lib/specialists/__tests__/phase-gate.test.ts` proves hard lint blockers fail the gate; `SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER=1 pnpm test:e2e e2e/phase-gate.spec.ts` covers downstream cancellation for injected phase placeholder debt.

#### R9. Integration gating + degraded-mode stamping

- **Failure mode.** `keyword-researcher` ran without DataForSEO configured and silently produced model-estimated volumes. The audit body acknowledged this in prose; nothing in the frontmatter or the orchestrator surfaced it.
- **Required guarantee.**
  - Each specialist declares its `requiredIntegrations: string[]` and `optionalIntegrations: string[]`.
  - Before dispatch, the orchestrator resolves integration handles and decides per specialist:
    - **All required present** → run normally.
    - **Required missing** → skip with `status: 'skipped'`, `skip_reason: 'no DataForSEO'`.
    - **Optional missing** → run in degraded mode, stamp `data_sources: ['model_estimate']`, `confidence: 'low'` in artifact frontmatter.
  - The office UI shows, before "build brain" is clicked: `12 specialists · 9 ready · 3 will skip (DataForSEO, Moz)`.
- **Owner.** `src/lib/specialists/_lib/registry.ts` (declarations), `src/lib/orchestrator/dispatch.ts` (gating), `src/app/(office)/...` (UI).
- **Acceptance.** Test: dispatch with DataForSEO unset; assert `keyword-researcher` result is `status: 'skipped'` OR `confidence: 'low'` + `data_sources: ['model_estimate']`. Never silently `succeeded` + `confidence: 'high'`.

Verified 2026-05-18: `src/lib/specialists/catalog.ts` now materializes canonical R9 `requiredIntegrations` and `optionalIntegrations` arrays for every specialist while preserving the existing `uses` / `requires` compatibility fields. `dispatchPlanTree()` now reads `requiredIntegrations` for its pre-dispatch skip gate, falling back to legacy `requires` only defensively. `src/lib/specialists/integration-readiness.ts` computes the build-brain-specific pre-click readiness summary from the manifest-aware template children, and `/office` passes it into `NextActionCard` so the operator sees `build brain · N specialists · M ready · K will skip (...)` before starting work when required integrations are missing. Optional integration misses now have a shared degradation contract: `optionalIntegrationDegradation()` returns low-confidence `model_estimate` artifact metadata plus a result-level degraded reason, and optional-integration specialists (`technical-auditor`, `backlink-analyst`, `image-auditor`, and `full-site-audit`) pass that metadata into `writeArtifact()`. Focused coverage in `src/lib/specialists/__tests__/catalog.test.ts` proves every specialist has the canonical declarations, that required declarations preserve legacy `requires`, optional declarations equal `uses - required`, and `keyword-researcher` remains DataForSEO-required so it cannot silently run as high-confidence live data without that integration. `src/lib/specialists/__tests__/integration-readiness.test.ts` proves the pre-click skip summary, required integration clearing, and optional-integration degraded-mode envelope. `src/lib/specialists/_lib/__tests__/artifact.test.ts` proves degraded-mode metadata is written to artifact frontmatter as `confidence: low` and `data_sources: [model_estimate]`. Browser coverage in `e2e/onboarding-office.spec.ts` asserts the Office pre-click next-action card renders the build-brain specialist/ready summary.

#### R10. Slug normalizer parity (UI ↔ server)

- **Failure mode.** `src/app/clients/new/page.tsx:21` slugifies to 40 chars. `src/lib/brain/types.ts:188` slugifies to 60. Long client names slugify differently depending on which path runs first.
- **Required guarantee.** Single shared `toClientSlug()` function, imported by both UI and server. Identical rules, identical max length. Tested with adversarial inputs (Unicode, slashes, very long names).
- **Owner.** Move canonical implementation to `src/lib/brain/slug.ts`. Delete duplicate.
- **Acceptance.** Property test: 1000 random inputs produce identical UI and server output.

Verified 2026-05-18: the canonical slug normalizer now lives in `src/lib/brain/slug.ts`, is re-exported from `src/lib/brain/types.ts` for existing server imports, and is imported directly by `src/app/clients/new/page.tsx` so onboarding no longer carries a duplicate `slugify()` implementation. The normalizer now trims edge dashes after the 60-character truncation step as well, preventing long generated slugs from ending in a dash and failing `ClientSlug`. Focused coverage: `src/lib/brain/__tests__/slug.test.ts` checks adversarial inputs, proves the exported server path matches the canonical implementation across 1000 deterministic random inputs, and asserts the onboarding page imports the shared normalizer with no local `slugify()` or legacy `slice(0, 40)` path.

#### R21. Fixture vaults for testing

- **Failure mode.** R8 (linter) and R5 (specialist contract) require executable acceptance tests. Without standardized fixture vaults, every test reinvents its own vault scaffolding and the test surface drifts from the production scaffolder.
- **Required guarantee.** Maintain a set of fixture vaults under `tests/fixtures/vaults/`. Each is a complete, version-controlled vault snapshot used by the test suite:
  | Fixture | Purpose |
  |---|---|
  | `clean-scaffolded/` | Output of a fresh `scaffoldClient()` against a known input. Used by R2 post-condition tests. |
  | `clean-post-sweep/` | Output of a successful end-to-end `build-brain` against `clean-scaffolded/`. Used by R6 finalization and R8 linter "score=100" tests. |
  | `partial-placeholders/` | Vault with 5 deliberate `{{}}` leftovers. Used by R8 linter "score<95" and R8 between-phase gate tests. |
  | `dead-wikilinks/` | Vault with 3 unresolved `[[...]]` references. Used by R8 wikilink-resolution test. |
  | `missing-source-note/` | Vault that mirrors the 2026-05-13 `claude-seo.md` failure: dated audits cite `[[<vault-name>]]` but the note is absent. Used to verify R2/R8 jointly catch the regression. |
  | `degraded-keywords/` | Vault where `keyword-researcher` ran without DataForSEO. Used by R9 stamping tests. |
  | `expired-artifacts/` | Vault with one artifact at `expires_on: 2024-01-01`. Used by R13 TTL test. |
  | `partial-sweep-failure/` | Vault where one specialist failed mid-sweep. Used by R14 recovery test. |
- **Build helpers.** A `tests/helpers/makeFixture.ts` exposes `loadFixture(name): VaultDir` and `cloneFixtureToTmp(name): string`. Tests copy the fixture to a tmp dir, mutate, assert, and the original on disk is never touched.
- **Owner.** `tests/fixtures/vaults/*`, `tests/helpers/makeFixture.ts`.
- **Acceptance.** Every R-item acceptance test in this spec references exactly one fixture by name. No test scaffolds its own vault from scratch.

Progress 2026-05-18: the R21 fixture foundation landed. `tests/helpers/makeFixture.ts` exposes `loadFixture(name)` and `cloneFixtureToTmp(name)`, and the eight required named fixture vaults live under `tests/fixtures/vaults/`: `clean-scaffolded`, `clean-post-sweep`, `partial-placeholders`, `dead-wikilinks`, `missing-source-note`, `degraded-keywords`, `expired-artifacts`, and `partial-sweep-failure`. Focused coverage in `src/lib/brain/__tests__/fixture-vaults.test.ts` proves every fixture has the required vault root files, fixture clones do not mutate the source snapshot, clean fixtures pass the real vault linter, defect fixtures surface their expected lint rules, and semantic fixtures expose the degraded keyword, expired artifact, and partial-brain markers.

Progress 2026-05-18: `src/lib/specialists/__tests__/vault-linter.test.ts` now uses the named `clean-scaffolded` fixture through `cloneFixtureToTmp()` instead of hand-building tmp vaults. The clean linter acceptance case clones `clean-scaffolded` directly; the corrupt and pending-placeholder linter acceptance cases clone `clean-scaffolded` and mutate only the copied vault, preserving the fixture snapshot. Verification: focused `vault-linter.test.ts` + `fixture-vaults.test.ts` passed, and the full unit suite stayed green.

Progress 2026-05-18: two more generic-vault acceptance tests now use the named `clean-scaffolded` fixture instead of invoking `scaffoldClient()`. `src/lib/brain/__tests__/structured-log.test.ts` clones `clean-scaffolded` and reindexes it before appending prompt-cache log rows, so Office status coverage no longer depends on bespoke scaffolding. `src/lib/orchestrator/__tests__/next-action.test.ts` now routes its `scaffoldFixture()` helper through `cloneFixtureToTmp("clean-scaffolded")` and `reindexClient()`, while each test still mutates only the copied vault for lint blockers, active-thread state, milestone artifacts, failed tasks, and expired artifacts. Focused verification: `next-action.test.ts`, `structured-log.test.ts`, and `fixture-vaults.test.ts` passed together; a rescan confirmed those migrated files no longer call `scaffoldClient()`.

Progress 2026-05-18: the larger readiness/finalization acceptance tests now use the named `clean-scaffolded` fixture for generic vault setup. `src/lib/brain/__tests__/readiness.test.ts` clones `clean-scaffolded` through a local `fixtureClient()` helper, patches only manifest fields needed by each scenario, and then mutates copied notes/evidence/reports for deep-ready, missing-ledger, shallow-canonical, and dated-report-only cases. `src/lib/orchestrator/__tests__/finalize-sweep.test.ts` uses the same fixture-clone pattern for partial-brain, needs-data, and manifest-cost propagation scenarios, leaving task-tree state as the behavior under test rather than revalidating scaffolding. Focused verification: `readiness.test.ts`, `finalize-sweep.test.ts`, and `fixture-vaults.test.ts` passed together; a rescan confirmed those migrated files no longer call `scaffoldClient()`.

Progress 2026-05-18: the remaining `scaffoldClient()` calls in tests are now executable-reviewed rather than prose-reviewed. `src/lib/brain/__tests__/fixture-vaults.test.ts` includes an R21 audit that scans `src/lib/**/*.test.ts`, ignores comments, and fails if any non-allowlisted test uses `scaffoldClient()`. The allowlist records exact counts and reasons for the remaining intentional calls: production scaffold smoke, canonical backfill over production canonical notes, evidence ledger against a production client row, assignment hot mirroring, build-brain dispatch/sweep read models, cost preflight, job queue context/result-envelope persistence, and direct phase-gate execution. Focused verification: `fixture-vaults.test.ts` passed and now prevents new generic bespoke vault scaffolding unless it is either migrated to a named fixture or explicitly classified.

Verified 2026-05-18: R21 is closed with an executable fixture discipline rather than a prose convention. The eight named fixtures exist under `tests/fixtures/vaults/`, `tests/helpers/makeFixture.ts` provides fixture load/clone helpers, and generic vault setup in readiness, finalization, next-action, structured-log, and linter acceptance tests now clones `clean-scaffolded` before applying scenario-specific mutations. The remaining `scaffoldClient()` uses are intentionally limited to tests whose behavior under test is the production scaffolder or a production client-row lifecycle contract that would be weakened by a static fixture. `src/lib/brain/__tests__/fixture-vaults.test.ts` enforces that boundary by scanning `src/lib/**/*.test.ts` and failing any new non-allowlisted `scaffoldClient()` call, with exact counts and reasons recorded beside the audit. Focused coverage proves fixture roots are complete, clones do not mutate source fixtures, clean fixtures lint clean, defect fixtures surface expected linter rules, semantic fixtures expose degraded/expired/partial states, and the scaffold-use audit remains current.

---

### Tier 2 — ship soon (prevents recurring pain)

#### R11. Idempotency, run-id, and drift baseline

- **Failure mode.** Re-running build-brain on a vault that already has today's artifacts has undefined behavior. The `drift-monitor` specialist is registered but never has a baseline to compare against.
- **Required guarantee.**
  - Every sweep is assigned a `runId`. Specialists write artifacts with a `<date>.<runId>.md` suffix when same-day collision exists.
  - `wiki/index.md` always points to the latest run's artifacts.
  - `wiki/log.md` records every run for provenance.
  - At end of every successful sweep, if no drift baseline exists for the client, auto-capture one.
- **Owner.** `src/lib/orchestrator/finalize-sweep.ts`, `src/lib/specialists/drift-monitor.ts`.
- **Acceptance.** Run build-brain twice in one day; assert both runs' artifacts exist, `index.md` points to run 2, `wiki/log.md` has 2 sweep entries, drift baseline captured on run 1.

Verified 2026-05-17: `writeArtifact()` preserves same-day rerun outputs by keeping the first artifact at `wiki/<dir>/<date>-<type>.md` and allocating `wiki/<dir>/<date>-<type>.<runId>.md` plus matching `.data.json` / report paths when a collision exists. Unit coverage: `src/lib/specialists/_lib/__tests__/artifact.test.ts` asserts both artifacts remain on disk, both are linked from `wiki/index.md`, and `wiki/log.md` records both writes. E2E coverage: `e2e/sweep-rerun.spec.ts` runs `build-brain` twice on one client, asserts the first technical artifact remains readable, the second gets a run suffix, the index links the second artifact, `wiki/log.md` has two sweep reviews, and `.drift/baseline.json` exists from run 1.

#### R12. Cost preflight + per-client monthly cap

- **Failure mode.** User clicks "build brain" with no idea what it will cost. DataForSEO + Anthropic spend can hit double digits per sweep with no warning.
- **Required guarantee.**
  - Each specialist exposes `estimateCost(ctx): { dataforseo_usd, anthropic_usd, duration_ms }`.
  - Orchestrator sums estimates pre-dispatch and surfaces total in UI.
  - Per-client `monthly_cost_cap_usd` in manifest. Block dispatch if (month-to-date spend + estimate) > cap.
  - Every specialist writes actual `cost_usd` to artifact frontmatter (universalize the field that exists in `keyword-researcher` today).
- **Owner.** `src/lib/specialists/_lib/cost.ts` (new), `src/lib/orchestrator/dispatch.ts`.
- **Acceptance.** Test: set cap = $0.10, attempt sweep estimated at $0.50, assert dispatch is blocked with explanatory error.

Verified 2026-05-18: `src/lib/specialists/_lib/cost.ts` provides per-specialist rough estimates and build-brain rollups, `dispatchPlanTree()` reads `monthly_cost_cap_usd` from the client manifest before creating the task tree, and dispatch fails with `cost_cap_exceeded` when projected month spend exceeds the cap. `getCurrentSweep()` and the SweepCard expose the preflight estimate while a sweep is visible, and kickoff narration includes estimated Anthropic/DataForSEO spend plus month-to-date/cap state. `writeArtifact()` now writes `cost_usd` to every produced artifact frontmatter, with implemented LLM/DataForSEO specialists passing known actual spend into the shared writer. Focused coverage: `src/lib/orchestrator/__tests__/cost-preflight.test.ts` sets a `$0.10` cap and proves `build-brain` is blocked before any sweep task is created; `src/lib/specialists/_lib/__tests__/artifact.test.ts` asserts artifact frontmatter records `cost_usd`.

#### R13. Freshness TTL per artifact

- **Failure mode.** Keyword volumes stale in ~90 days. Backlink profiles in ~30. Today nothing tracks staleness; the brain quietly rots.
- **Required guarantee.** Each specialist declares `freshness_ttl_days`. Every artifact gets `expires_on` in frontmatter. The next-action engine surfaces "Keyword audit is 95 days old, rerun?" when `expires_on < today`.
- **Owner.** `src/lib/specialists/_lib/registry.ts` (declarations), `src/lib/specialists/_lib/artifact.ts` (frontmatter writer), `src/lib/orchestrator/next-action.ts`.
- **Acceptance.** Test: write an artifact with `expires_on: 2026-01-01`; assert next-action returns a rerun recommendation, not `idle`.

Verified 2026-05-18: `src/lib/specialists/_lib/freshness.ts` declares freshness TTLs for every ready specialist and shared artifact-type defaults. `writeArtifact()` now writes `expires_on` frontmatter on every artifact, and the SQLite note index stores `expires_on` so `nextActionFor()` can classify expired milestones as `stale` even when every required artifact exists. Focused coverage: `src/lib/specialists/_lib/__tests__/freshness.test.ts` asserts every ready specialist has a positive TTL, `src/lib/specialists/_lib/__tests__/artifact.test.ts` asserts artifacts receive the expected `expires_on`, and `src/lib/orchestrator/__tests__/next-action.test.ts` writes a keyword artifact with `expires_on: 2026-01-01` and proves the next action is `run-keyword-researcher`, not `idle`.

#### R14. Partial-sweep recovery semantics

- **Failure mode.** If specialist 7 of 12 fails mid-sweep, current behavior is undefined. The "half-brain" produced may pass the linter (if the failed specialist's missing artifact doesn't break wikilinks) or may not.
- **Required guarantee.**
  - Sweep continues on per-specialist failure (other independent specialists keep running).
  - Failed specialists land as `status: failed` with an explicit retry affordance in the UI.
  - `finalizeBrainSweep` emits a `partial_brain` status (not `succeeded`) if any child failed.
  - The next-action engine surfaces the failed specialist as the top action.
- **Owner.** `src/lib/orchestrator/task-runner.ts`, `src/lib/orchestrator/finalize-sweep.ts`.
- **Acceptance.** Test: inject failure into specialist 7; assert specialists 8–12 still run (where deps allow), sweep ends in `partial_brain`, UI surfaces the failure.

Verified 2026-05-18: hard child failures now produce a first-class `partial_brain` readiness status instead of throwing finalization away. `finalizeBrainSweep()` writes the partial review note/log with retry-first suggestions; the sweep root is released as terminal failed with `result_summary: final review complete: partial_brain ...` so it is not mistaken for a clean success. `/api/clients/[slug]/sweeps/current` exposes `readiness_status`, `SweepCard` renders "Deep Brain partially built" with an explicit "Retry failed" affordance, and `nextActionFor()` promotes the latest failed sweep specialist above milestone work. Deterministic coverage: `src/lib/orchestrator/__tests__/finalize-sweep.test.ts`, `src/lib/orchestrator/__tests__/next-action.test.ts`, and `SEO_OFFICE_E2E_FAIL_SPECIALIST=page-analyzer pnpm test:e2e e2e/partial-sweep.spec.ts`, which proves `page-analyzer` fails while `sitemap-architect`, `google-suite`, `hreflang-auditor`, and `drift-monitor` still succeed before the diagnostic phase gate cancels.

#### R15. Observability + prompt-cache verification (AGENTS.md hard rule #6)

- **Failure mode.** AGENTS.md mandates prompt caching on every Anthropic SDK call but compliance is unmeasured. No structured log captures cache hit rate, tokens, duration, or cost across specialists.
- **Required guarantee.**
  - A wrapper around the Anthropic SDK records `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`, `output_tokens`, duration per call.
  - Append a structured row to `wiki/log.json` (new — alongside the human-readable `log.md`) per specialist run.
  - Office UI surfaces "cache hit rate: 87%" for the last sweep.
  - A CI lint rejects any new Anthropic SDK call site that doesn't go through the wrapper.
- **Owner.** `src/lib/integrations/anthropic.ts` (wrapper), `src/lib/brain/log.ts` (structured log).
- **Acceptance.** Run a sweep; open `wiki/log.json`; assert each specialist has cache metrics > 0 and they sum to the per-call totals.

Verified 2026-05-18: Anthropic SDK calls remain behind the instrumented `anthropic-api` provider wrapper, which applies prompt caching to the system prompt and final tool definition and records `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, duration, and estimated cost. Specialist execution now carries `(client_slug, job_id, specialist_id)` through async context so provider metrics append to `wiki/log.json`; Office status derives the visible cache-hit rate from the latest sweep's structured prompt-cache rows before falling back to evidence-cache signals. Deterministic e2e mock specialists also write prompt-cache-shaped rows, so `e2e/build-brain.spec.ts` now asserts a 34-child sweep leaves 34 `wiki/log.json` rows with positive cache/read/create/input/output/duration metrics. Guardrail coverage: `src/lib/integrations/providers/__tests__/anthropic-wrapper-compliance.test.ts` rejects direct Anthropic SDK call sites outside the wrapper, and `src/lib/brain/__tests__/structured-log.test.ts` verifies append/read/summarize plus Office cache-rate surfacing.

---

### Tier 3 — deferred backlog (necessary, not blocking)

These are real gaps. Schedule them after Tier 1+2 ships. Each has an issue-grade summary; expand into its own design note when picked up.

#### R16. Locale-aware sweep

If `manifest.locales` declares multiple locales, the sweep should add `hreflang-auditor` + per-locale content audits. Today locale is a black hole.

Verified 2026-05-18: `ClientManifest` now supports a multi-locale `locales[]` field while preserving the existing single `locale` field. `instantiateTemplateChildren()` keeps the default build-brain sweep at 34 children for single-locale clients, but expands multi-locale manifests by passing the declared locale set into `hreflang-auditor` and inserting one locale-scoped `content-strategist` child per declared locale before the discovery readiness gate. Dependency remapping is deterministic: each locale audit waits on the diagnostic gate, the discovery gate waits on every inserted locale audit, and all later synthesis/final dependencies shift forward. `dispatchPlanTree()` materializes the expanded template and cost preflight from the expanded child list, so the UI/task ledger reflects the true specialist count. Focused coverage: `src/lib/orchestrator/__tests__/build-brain-template.test.ts` asserts pure template expansion, dependency ordering, `hreflang-auditor` payloads, locale content payloads, dispatch materialization, and expanded cost estimate count.

#### R17. Vault-root + auxiliary file lifecycle

Document the owner + write policy for `CODEX.md`, `shipping-rules.md`, `_templates/`, `.raw/`, `.chat/`, `.obsidian/`, `.manifest.json`. Each currently exists in the live vault without a documented lifecycle. Required table:

| Path | Role | Owner | Updated when | Substitution at scaffold |
|---|---|---|---|---|
| `CODEX.md` | machine summary for prompt-loading | scaffold + post-sweep | every sweep completion | **YES** |
| `shipping-rules.md` | vault-local rules read by specialists | scaffold (copied from template) | rarely; manual edit | **YES** |
| `README.md` | human-readable vault overview | scaffold | rarely | **YES** |
| `_templates/` | note templates consumed by specialists at write time | scaffold | rarely | **YES — same substitution pass as `wiki/`** |
| `.raw/` | fetch cache (HTML, API responses) | specialists during execution | per fetch; **retention = 30 days, auto-purged** | no |
| `.chat/` | orchestrator session meta | orchestrator | every chat turn | no |
| `.obsidian/` | Obsidian editor metadata | scaffold (defaults) | by user via Obsidian | no |
| `.manifest.json` | canonical client metadata + sources registry | scaffold + every artifact write + `finalizeBrainSweep` | per artifact + per sweep | no (parses as JSON) |

The `_templates/` row is critical: `vault-renderer.ts` must process the `_templates/` directory with the same substitution pass it applies to `wiki/`. Without this, specialists pulling a template at write time inject `{{placeholders}}` into their artifacts — recreating the exact failure this spec exists to prevent.

`.raw/` requires a documented purge job (cron tick at sweep completion or daily). Without it the directory grows unbounded.

**Acceptance.** Lint asserts `_templates/` contains zero `{{` matches post-scaffold. Test asserts `.raw/` entries older than 30 days are removed at the next sweep.

Verified 2026-05-18: the vault template now documents the lifecycle/owner/update/substitution policy in `CODEX.md`, including `_templates/` scaffold substitution and `.raw/` 30-day retention. `renderTemplate()` already walks `_templates/` with the same slot substitution pass as `wiki/`, and `src/lib/brain/__tests__/scaffold-smoke.test.ts` now asserts a fresh scaffold has zero `{{...}}` tokens under both `wiki/` and `_templates/` plus the lifecycle section in rendered `CODEX.md`. `.raw/` retention is implemented in `src/lib/brain/raw-retention.ts` and called from `finalizeBrainSweep()`; it removes old raw cache files while preserving `.raw/.manifest.json` and fresh raw evidence. Focused coverage: `src/lib/orchestrator/__tests__/finalize-sweep.test.ts` creates a 45-day-old `.raw/sources/retention/old-fetch.json`, finalizes a sweep, and asserts the old file is removed while a fresh file and `.raw/.manifest.json` remain.

#### R18. GitHub-aware sweep for open-source clients

If `manifest.github_url` is set, fetch repo metadata (README, releases, star count, recent commits) and feed into `brand-strategist`. Open-source clients like `claude-seo.md` have a GitHub repo as a major SEO surface.

Verified 2026-05-18: `instantiateTemplateChildren()` now makes build-brain GitHub-aware without changing the default child count: when `manifest.github_url` is present, the `brand-strategist` child receives a `github_url` payload and an expanded goal that treats the repository as an owned open-source SEO surface. `src/lib/integrations/github.ts` parses GitHub repo URLs and fetches public repo metadata, README excerpt, releases, star/fork/open-issue counts, topics, pushed timestamp, and recent commits through the GitHub API with graceful degradation. `brand-strategist` writes the fetched metadata to `.raw/sources/github/<owner>-<repo>.json`, records it in `.raw/.manifest.json.sources` at zero cost, and includes it in the LLM payload alongside homepage brand signals. Focused coverage: `src/lib/integrations/__tests__/github.test.ts` mocks GitHub API responses and proves README/releases/stars/commits are collected; `src/lib/orchestrator/__tests__/build-brain-template.test.ts` proves GitHub clients feed repository context into the brand-strategy child while non-GitHub clients keep the normal sweep shape.

#### R19. Approval gates for high-risk deliverables

The `approval_status` and `risk_level` fields exist in frontmatter but aren't wired to a UI workflow. Anything `risk_level: high` should land as `approval_status: needs-review` and surface a review queue.

Verified 2026-05-18: `writeArtifact()` already writes generated artifacts with `approval_status: needs-review`; focused coverage now asserts a high-risk deliverable persists `risk_level: high` plus `approval_status: needs-review`. `src/lib/brain/review-queue.ts` adds a first-class high-risk review queue over the SQLite note index, limited to `approval_status = needs-review` and `risk_level = high`. `/api/brain` returns `summary.highRiskReview` plus `reviewQueue`, `VaultBrowser` renders a top-of-vault "review queue · high risk" section with direct note open actions, and the Office status strip now surfaces the high-risk review count so operators can see review debt without opening the vault. Focused coverage: `src/lib/brain/__tests__/review-queue.test.ts` proves approved high-risk and low-risk reviewable notes do not enter the queue, while `src/lib/specialists/_lib/__tests__/artifact.test.ts` proves high-risk generated artifacts land in needs-review.

#### R20. Office UI surface contract

Cohesive plan for what the office screen shows about brain state: health pill (R8), integrations chip (R9), last sweep timestamp + cost (R12, R15), per-specialist row (status, confidence, data_source, artifact link, review link). Today these signals exist piecemeal.

Verified 2026-05-18: the Office status strip now exposes the core brain-state contract in one place: health score/clean state from the R8 linter, total source cost, prompt-cache hit rate/tokens from R15 structured logs, integration readiness from provider smoke, latest sweep date/readiness/cost, and high-risk review count from R19. `/api/clients/[slug]` returns this same `operationalStatus` snapshot for live refresh. The Specialist Inbox assignment endpoint now enriches task-backed assignments with generated artifact metadata from the result note frontmatter (`confidence`, `approval_status`, `risk_level`, and `data_sources` when recorded), while the row UI renders status, confidence, source, review, risk, artifact link, report link, and a "Review note" affordance for notes that still need review. The sweep read model also instantiates manifest-aware templates for cost/phase display, so R16 multi-locale sweeps do not regress to the static 34-child UI contract. Focused coverage: `src/lib/brain/__tests__/structured-log.test.ts` verifies Office status includes cache, brain health, review count, and empty last-sweep state; `src/lib/orchestrator/__tests__/build-brain-template.test.ts` verifies the sweep read model uses expanded locale children and expanded cost estimates; `e2e/build-brain.spec.ts` asserts the first-build Office UI renders health/cost/cache/integrations/last-sweep/review labels, `/api/clients/[slug]` returns health + last-sweep data, and a specialist row surfaces confidence/source/risk metadata plus report affordances.

---

## Implementation order (with rationale)

Build in this order — each step unblocks the next.

1. **R3 (TypeScript types)** — half day. Substrate for every other guarantee.
2. **R4 (multi-tenant scoping + sweep concurrency)** — 1 day. AGENTS.md hard rule. Sweep-lock work added on top of original scoping.
3. **R5 (specialist I/O contract)** — 1 day. Directly relevant to the connection rewrite in flight. Ship this as part of that PR.
4. **R21 (fixture vaults)** — half day. Build the 8 fixtures before R8 lands so the linter has something to assert against. Bootstraps every subsequent acceptance test.
5. **R10 (slug parity)** — 30 minutes. Mechanical. Do it while context is warm.
6. **R1 (onboarding inputs)** — 1 day. Includes the form UI + validator.
7. **R2 (scaffold post-conditions + source note)** — half day. Once R3 is in, the assertions are one-liners.
8. **R7 (status mirroring)** — half day. Surgical edit to `updateStatus()`.
9. **R8 (linter + multi-stage quality gate)** — 1.5 days. Depends on R3 + R21. The between-phase gate work bumps this from 1 day.
10. **R6 (finalization hook)** — 1.5 days. Biggest behavioral change; depends on R3, R5, R7, R8.
11. **R9 (integration gating)** — 1 day. Depends on R5.
12. **R11–R15 (Tier 2)** — schedule per backlog.
13. **R16–R20 (Tier 3)** — schedule per backlog.

Total Tier 1: ~8–9 engineering days for the listed work, assuming serial execution. Several items can parallelize (R1 form + R3 types + R10 slug + R21 fixtures are independent).

## Acceptance criteria for "100% on first build"

A new client created end-to-end via the UI must produce a vault that:

- [x] Passes R8 linter with `score >= 95/100`.
  - Verified 2026-05-17; updated 2026-05-18 for the R8 lint-gate expansion: `e2e/build-brain.spec.ts` creates a client through the UI, runs a 34-child `build-brain` sweep, calls `/api/clients/[slug]/lint`, and asserts `clean: true`, zero findings, and `score >= 95`.
- [x] Has zero `{{...}}` matches under `wiki/` AND under `_templates/` (`grep -rE '\{\{' wiki/ _templates/`).
  - Verified 2026-05-17: the R8 linter walks the vault outside `.raw/`, including `_templates/`, and reports `unresolved-placeholder-body` / `unresolved-placeholder-filename` as errors. `e2e/build-brain.spec.ts` proves the full first-build vault lint is clean.
- [x] Has zero `developm-ent`-class slug typos (configurable regex list).
  - Verified 2026-05-17: `src/lib/specialists/vault-linter.ts` now includes a configurable banned-pattern regex list with `developm-ent-slug-typo`; `src/lib/specialists/__tests__/vault-linter.test.ts` asserts the typo is reported as `banned-pattern`, and `e2e/build-brain.spec.ts` proves the full first-build vault lint is clean.
- [x] Has `.manifest.json.sources` populated with every artifact path.
  - Verified 2026-05-17; updated 2026-05-18 for the R8 lint-gate expansion: `e2e/deep-brain-parity.spec.ts` extracts every `wiki/` and `reports/` artifact path emitted by the completed 34-child Deep Brain sweep and asserts each path is present in the client manifest source ledger.
- [x] Has `wiki/index.md` referencing every artifact emitted in the sweep.
  - Verified 2026-05-17: `e2e/deep-brain-parity.spec.ts` reads `wiki/index.md` after sweep finalization and asserts each emitted wiki artifact has a matching wikilink entry.
- [x] Has every `wiki/specialists/<id>/hot.md` at terminal status (`succeeded` / `failed` / `skipped`) with `completed_at`.
  - Verified 2026-05-17; updated 2026-05-18 for the R8 lint-gate expansion: assignment hot mirrors render `Terminal status`, `Completed at`, and linked `Artifact path` for terminal jobs. Unit coverage: `src/lib/orchestrator/__tests__/assignment-hot.test.ts`. E2E coverage: `e2e/deep-brain-parity.spec.ts` asserts every specialist hot note from a completed 34-child Deep Brain sweep has terminal status, completed_at, and artifact path.
- [x] Has no `[[wikilink]]` that fails to resolve.
  - Verified 2026-05-17: the R8 linter reports unresolved body wikilinks as `dead-wikilink` warnings and unresolved `sources:` wikilinks as `dead-source-wikilink` warnings; `e2e/build-brain.spec.ts` asserts the full first-build vault lint is clean with zero warnings.
- [x] Has the next-action engine reporting `idle` only when the above all hold.
  - Verified 2026-05-17: `src/lib/orchestrator/next-action.ts` now uses explicit non-idle IDs for data-access blockers, in-flight specialists, and unavailable specialists. `src/lib/orchestrator/__tests__/next-action.test.ts` asserts lint blockers and coming-soon states are not `idle`, and that `idle` is returned only after lint and milestone gates hold.
- [x] Surfaces cost, cache hit rate, and integration status in the office UI.
  - Verified 2026-05-17: `src/lib/office/operational-status.ts` derives source cost from the manifest, cache-hit rate from the evidence ledger, and integration readiness from provider smoke status. `/office` and `/api/clients/[slug]` pass it to `OfficeWorkspace`, which renders cost, cache hits, and integrations in the office footer. `e2e/build-brain.spec.ts` asserts those UI labels are visible during the first-build flow.
- [x] Has a drift baseline captured.
  - Verified 2026-05-17: production `drift-monitor` persists the first snapshot at `.drift/baseline.json`; the deterministic e2e mock now mirrors that side effect for `drift-monitor`, and `e2e/deep-brain-parity.spec.ts` asserts a completed Deep Brain sweep leaves a baseline with URL, capture timestamp, and title.
- [x] Survives a deliberately-injected mid-sweep `{{placeholder}}` by halting at the between-phase lint gate, not by producing a partial brain that passes the post-sweep check.
  - Verified 2026-05-17: `SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER=1 pnpm test:e2e e2e/phase-gate.spec.ts` injects `{{phase_gate_failure}}` after intake source ingestion, runs the real `phase-gate` specialist, and asserts the sweep fails at the intake gate, downstream specialists are cancelled, and the lint endpoint reports the injected placeholder.
- [x] Rejects a second concurrent `build-brain` dispatch on the same client with `sweep_already_running`, but accepts a parallel dispatch on a different client.
  - Verified 2026-05-17: `e2e/sweep-concurrency.spec.ts` races `/api/clients/[slug]/sweeps` POSTs for one client and asserts the duplicate returns the existing sweep with `sweep_already_running`; the same spec starts two different clients concurrently and asserts both sweeps are accepted with distinct root task ids.

## Resolved decisions and follow-up backlog

1. Re-running `build-brain` appends same-day artifacts with `runId` suffixes instead of overwriting or refusing. Verified by R11.
2. The vault metadata source note lives at `wiki/sources/<vault-name>.md`. Verified by R2.
3. `.raw/` is retained for 30 days and purged on finalization, while preserving `.raw/.manifest.json`. Verified by R17.
4. `vault-linter` is synchronous at scaffold, between-phase gates, and finalization. Verified by R8.
5. The five legacy template deliverables remain scaffolded for now; removal or conditional inclusion is a content/product backlog decision, not a launch blocker.
6. Sweep locks store `holder_pid` for phase 1. A future multi-user phase should replace or augment PID with a session/user actor identity.
7. Fixture freshness is enforced by the R21 fixture audit today. A future `pnpm refresh-fixtures` helper can regenerate `clean-*` fixtures while preserving hand-curated defect fixtures.

## References

- [`docs/design/2026-05-11-seo-office-design.md`](2026-05-11-seo-office-design.md) — architecture (parent doc).
- [`AGENTS.md`](../../AGENTS.md) — hard rules and conventions.
- 2026-05-13 four-agent vault audit transcript (in conversation log).
- `src/lib/brain/scaffold.ts:70` — current scaffold entry point.
- `src/lib/orchestrator/task-templates.ts:230` — `BUILD_BRAIN_SWEEP` template definition.
- `src/lib/orchestrator/job-queue.ts:215` — current job completion path (lacks finalization hook).
- `src/lib/specialists/_lib/artifact.ts:98` — sets `sources: [[<vault-name>]]` without ensuring the note exists.
