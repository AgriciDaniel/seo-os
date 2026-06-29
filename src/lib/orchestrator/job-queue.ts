/**
 * In-process job queue.
 *
 * One Node process, one user. Jobs are persisted to SQLite (so they survive
 * a refresh) and executed in-process. Progress events stream out via the
 * `events` bus and reach the UI through SSE.
 *
 * Concurrency model: jobs run one at a time per client (we don't want two
 * audits clobbering each other's hot.md). Across clients, multiple jobs may
 * run in parallel.
 *
 * Client isolation: every event publish carries the owning `client_slug`
 * alongside the job id, so the bus key is the composite `(slug, jobId)` —
 * a subscriber on client A's job can never receive events from client B's
 * even if id collisions ever happened.
 */
import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/brain/index-db";
import { runWithSpecialistBrainContext } from "@/lib/specialists/_lib/brain-context";
import { BlockedError, SoftSkipError } from "@/lib/specialists/_lib/soft-skip";
import { emit, emitClientEvent } from "./events";
import { getSpecialist } from "./registry";
import type {
  SpecialistContext,
  SpecialistPermissionMode,
  SpecialistResult,
} from "./registry";
import { recordOrchestratorReview } from "./review";
import { readManifest } from "@/lib/orchestrator/client-context";
import { e2eMockSpecialistDelayMs, isE2EMockSpecialistsEnabled } from "./e2e-mode";
import { writeArtifact } from "@/lib/specialists/_lib/artifact";
import type { ReportData } from "@/lib/specialists/_lib/report-data";
import { appendEvidenceBatch } from "@/lib/brain/evidence-ledger";
import { buildEvidenceEntry } from "@/lib/specialists/_lib/evidence";
import { appendStructuredLogRow } from "@/lib/brain/structured-log";
import { updateCanonicalNote } from "@/lib/brain/canonical-writer";
import type { SpecialistEvidence } from "@/lib/brain/population-contract";
import { vaultRoot } from "@/lib/brain/paths";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";
import {
  SpecialistExecutionResultSchema,
  SpecialistResultSchema,
  type SpecialistExecutionResult,
} from "@/lib/brain/types";
import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";
import { missingRequiredIntegrations } from "@/lib/specialists/integration-readiness";
import {
  failedSpecialistExecutionResult,
  normalizeSpecialistResult,
} from "./specialist-result";

export interface JobRecord {
  id: string;
  client_slug: string;
  specialist: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_path: string | null;
  request_id: string | null;
  result_envelope: string | null;
  failure_envelope: string | null;
}

/** Currently-running jobs by client_slug, to enforce per-client serial execution. */
const inflightByClient = new Map<string, Promise<void>>();
const activeControllers = new Map<string, AbortController>();

/**
 * Per-client concurrency cap for the parallel (sweep) dispatch path. A
 * "build the brain" sweep can unblock ~15 specialists at once; running them
 * all concurrently would spawn that many `claude-cli`/DataForSEO calls and
 * overwhelm the machine. We cap concurrent parallel jobs per client and leave
 * the rest `status:'queued'` (so the office shows them as queued desks, not
 * missing ones) until a slot frees. The serial UI-button path
 * (`inflightByClient`) is untouched. Default 8 ≈ the peak the phased sweep
 * already ran safely; override with SEO_OFFICE_SWEEP_CONCURRENCY.
 */
interface ParallelPool {
  active: number;
  queue: Array<{ id: string; payload: Record<string, unknown> }>;
}
const parallelPoolByClient = new Map<string, ParallelPool>();

function sweepConcurrency(): number {
  const raw = Number(process.env.SEO_OFFICE_SWEEP_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8;
}

/** Queue a parallel job, then start as many as the cap allows. */
function dispatchParallel(
  clientSlug: string,
  id: string,
  payload: Record<string, unknown>,
): void {
  let pool = parallelPoolByClient.get(clientSlug);
  if (!pool) {
    pool = { active: 0, queue: [] };
    parallelPoolByClient.set(clientSlug, pool);
  }
  pool.queue.push({ id, payload });
  drainParallelPool(clientSlug);
}

/**
 * Start queued parallel jobs up to the per-client cap; each frees its slot on
 * completion and pulls the next. No deadlock: the DAG is acyclic and this only
 * throttles — a finished job both frees a slot AND lets the task-runner
 * enqueue newly-unblocked siblings, so the sweep always makes progress.
 */
function drainParallelPool(clientSlug: string): void {
  const pool = parallelPoolByClient.get(clientSlug);
  if (!pool) return;
  const cap = sweepConcurrency();
  while (pool.active < cap && pool.queue.length > 0) {
    const item = pool.queue.shift()!;
    pool.active += 1;
    void runJob(item.id, item.payload)
      .catch(() => undefined)
      .finally(() => {
        pool.active -= 1;
        drainParallelPool(clientSlug);
      });
  }
  if (pool.active === 0 && pool.queue.length === 0) {
    parallelPoolByClient.delete(clientSlug);
  }
}

/**
 * Enqueue a specialist job. When `request_id` is supplied the call is
 * idempotent — repeated POSTs from the UI (or retries from the
 * Orchestrator's dispatch) collapse onto the same row instead of
 * spawning duplicates. Without a request_id the row is always new.
 *
 * `parallel: true` opts out of the per-client serial chain. Used by the
 * task-runner when fanning out unblocked sibling tasks that have no
 * shared write target. Two specialists with disjoint output files (their
 * own `wiki/audits/<date>-<type>.md`) are safe to run concurrently;
 * shared sinks like `wiki/log.md` are protected by their own mutex.
 */
export async function enqueue(input: {
  client_slug: string;
  specialist: string;
  payload?: Record<string, unknown>;
  request_id?: string;
  parallel?: boolean;
}): Promise<JobRecord> {
  const db = getDb();

  // Idempotency check FIRST — if the caller supplied a request_id and a
  // row already exists, return it without enqueueing a second runner.
  if (input.request_id) {
    const existing = db
      .prepare(
        `SELECT * FROM jobs WHERE client_slug = ? AND request_id = ?`,
      )
      .get(input.client_slug, input.request_id) as JobRecord | undefined;
    if (existing) return existing;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO jobs (id, client_slug, specialist, status, progress, message, request_id)
     VALUES (?, ?, ?, 'queued', 0, 'queued', ?)`,
  ).run(id, input.client_slug, input.specialist, input.request_id ?? null);
  emitClientEvent(input.client_slug, "job_queued", id, input.specialist);

  if (input.parallel) {
    // Throttled fire-and-forget via the per-client pool: caps concurrent
    // sweep specialists, excess stay queued. Caller still waits via SSE or
    // the Assignment status sync, exactly as before.
    dispatchParallel(input.client_slug, id, input.payload ?? {});
  } else {
    // Chain after any in-flight serial job for the same client. The
    // task-runner uses `parallel: true` to fan out unblocked siblings;
    // direct UI button presses still serialise here.
    const previous = inflightByClient.get(input.client_slug) ?? Promise.resolve();
    const next = previous.then(() => runJob(id, input.payload ?? {}));
    inflightByClient.set(input.client_slug, next.catch(() => undefined));
  }

  return getJob(id) as JobRecord;
}

export function getJob(id: string): JobRecord | null {
  return (
    (getDb()
      .prepare("SELECT * FROM jobs WHERE id = ?")
      .get(id) as JobRecord | undefined) ?? null
  );
}

export function listJobs(client_slug: string, limit = 20): JobRecord[] {
  return getDb()
    .prepare(
      "SELECT * FROM jobs WHERE client_slug = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(client_slug, limit) as JobRecord[];
}

/**
 * Cancel a job — but only if it actually belongs to the supplied client.
 * Returns `true` if a row was cancelled, `false` if the (id, slug) pair
 * doesn't match anything live. The caller should treat `false` as the
 * caller's request being a no-op (or a cross-client probe — either way,
 * we don't reveal whether the id exists for a different client).
 */
export function cancelJob(id: string, client_slug: string): boolean {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE jobs
       SET status = 'cancelled', finished_at = datetime('now')
       WHERE id = ? AND client_slug = ? AND status IN ('queued','running')`,
    )
    .run(id, client_slug);
  if (result.changes === 0) {
    // Either job doesn't exist, belongs to another client, or already
    // terminal. Don't emit cross-client events.
    return false;
  }
  syncAssignmentStatus(id, "cancelled", "cancelled by user");
  activeControllers.get(id)?.abort();
  emit(client_slug, id, "done", "cancelled", {
    data: { terminalStatus: "cancelled" },
  });
  emitClientEvent(client_slug, "job_cancelled", id, getJob(id)?.specialist ?? "unknown");
  return true;
}

/* -------------------------------------------------------------------------- */
/* internal                                                                    */
/* -------------------------------------------------------------------------- */

function integrationHandlesForSpecialist(
  specialistId: string,
): SpecialistContext["integrations"] {
  const env = mergedRuntimeEnv() as NodeJS.ProcessEnv;
  return {
    configured: INTEGRATIONS.filter((integration) =>
      integration.isConfigured(env),
    ).map((integration) => integration.id),
    missing: missingRequiredIntegrations(specialistId, { env }),
  };
}

function permissionModeForJob(jobId: string): SpecialistPermissionMode {
  const row = getDb()
    .prepare("SELECT permission_mode FROM assignments WHERE job_id = ? LIMIT 1")
    .get(jobId) as { permission_mode?: string } | undefined;
  if (
    row?.permission_mode === "read_only" ||
    row?.permission_mode === "full_access"
  ) {
    return row.permission_mode;
  }
  return "auto";
}

/**
 * Per-specialist wall-clock budget. A specialist that exceeds it is aborted
 * and recorded as a degraded skip (NOT a failure) so a single hung agent —
 * a stuck network call, an unresponsive CLI, a model that never returns —
 * can't stall the phase gate, and therefore the entire sweep, forever.
 *
 * Default 8 minutes: comfortably above the slowest healthy specialist
 * observed (~2.6 min for Search Console) with headroom for multi-call LLM
 * synthesis, yet far below "indefinite". Override per machine/model with
 * SEO_OFFICE_SPECIALIST_TIMEOUT_MS.
 */
const DEFAULT_SPECIALIST_TIMEOUT_MS = 8 * 60 * 1000;

function specialistTimeoutMs(): number {
  const raw = Number(process.env.SEO_OFFICE_SPECIALIST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SPECIALIST_TIMEOUT_MS;
}

/** Thrown by `runWithTimeout` when a specialist blows its wall-clock budget. */
class SpecialistTimeoutError extends Error {
  readonly budgetMs: number;
  constructor(budgetMs: number) {
    super(`specialist exceeded ${Math.round(budgetMs / 1000)}s time budget`);
    this.name = "SpecialistTimeoutError";
    this.budgetMs = budgetMs;
  }
}

/**
 * Race a specialist's work against its time budget. On timeout we both
 * abort the controller (so cooperative specialists stop their fetches)
 * AND reject (so non-cooperative ones that never observe the signal still
 * unblock the queue). `onTimeout` flips the caller's flag so its catch can
 * tell "I timed this out" apart from a user cancel or a real crash.
 */
async function runWithTimeout<T>(
  work: Promise<T>,
  controller: AbortController,
  budgetMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      controller.abort();
      reject(new SpecialistTimeoutError(budgetMs));
    }, budgetMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Gates/linters/archivers self-narrate; their "evidence" is the ledger noise
 *  the audit flagged, so they never get fallback evidence. */
const EVIDENCE_FALLBACK_SKIP = new Set(["phase-gate", "vault-linter", "vault-archiver"]);

/** Pure-synthesis specialists derive from prior artifacts (model_estimate);
 *  everyone else observed a live page or API call (live_api). */
const SYNTHESIS_SPECIALISTS = new Set([
  "content-strategist",
  "brand-strategist",
  "flow-framework",
  "beast-planner",
  "topic-clusterer",
  "content-brief-generator",
  "programmatic-strategist",
  "local-seo",
]);

/**
 * Build a minimal source-backed evidence claim for a specialist that wrote an
 * artifact but emitted none of its own. Returns null for gates, degraded runs,
 * or artifact-less results so we never pad the ledger with hollow claims.
 */
function fallbackEvidence(
  specialistId: string,
  result: SpecialistResult,
): SpecialistEvidence | null {
  if (EVIDENCE_FALLBACK_SKIP.has(specialistId)) return null;
  if (result.degraded || !result.resultPath) return null;
  return buildEvidenceEntry({
    claim: result.summary.slice(0, 200),
    provenance: SYNTHESIS_SPECIALISTS.has(specialistId) ? "model_estimate" : "live_api",
    sourcePaths: [result.resultPath],
    confidence: "medium",
  });
}

async function runJob(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const job = getJob(id);
  if (!job || job.status === "cancelled") return;
  const slug = job.client_slug;

  const specialist = getSpecialist(job.specialist);
  if (!specialist) {
    const message = `unknown specialist: ${job.specialist}`;
    if (markFailed(id, slug, message)) {
      emit(slug, id, "error", message);
      emit(slug, id, "done", `failed: ${message}`, {
        data: { terminalStatus: "failed" },
      });
      emitClientEvent(slug, "job_failed", id, job.specialist);
    }
    return;
  }

  const controller = new AbortController();
  activeControllers.set(id, controller);
  if (!markRunning(id)) {
    activeControllers.delete(id);
    return;
  }
  const startedMs = Date.now();
  // Set when the wall-clock budget fires. Lets the catch distinguish a
  // timeout-initiated abort (mark degraded-skip, gate proceeds) from a
  // user cancel (DB status already 'cancelled') or a genuine crash.
  let timedOut = false;
  emit(slug, id, "log", `Starting ${specialist.name}…`);
  emitClientEvent(slug, "job_started", id, job.specialist);

  try {
    const manifest = await readManifest(slug);
    if (!manifest) throw new Error(`missing manifest for ${slug}`);
    const specialistInput = specialist.inputSchema.parse(payload);
    const ctx: SpecialistContext<typeof specialistInput> = {
      jobId: id,
      clientSlug: slug,
      input: specialistInput,
      manifest,
      vaultRoot: vaultRoot(slug),
      priorArtifacts: [],
      integrations: integrationHandlesForSpecialist(job.specialist),
      signal: controller.signal,
      budget: {},
      permissionMode: permissionModeForJob(id),
      runId: job.request_id ?? id,
      isCancelled: () =>
        controller.signal.aborted || getJob(id)?.status === "cancelled",
      emit: (
        kind: "log" | "progress" | "result" | "error",
        message: string,
        extra: { progress?: number; data?: unknown } = {},
      ) => {
        if (controller.signal.aborted || getJob(id)?.status === "cancelled") {
          return;
        }
        emit(slug, id, kind, message, extra);
      },
    };
    const shouldUseMock =
      isE2EMockSpecialistsEnabled() &&
      !(
        process.env.SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER === "1" &&
        job.specialist === "phase-gate"
      );
    const execPromise = shouldUseMock
      ? runE2EMockSpecialist(job.specialist, payload, ctx)
      : runWithSpecialistBrainContext(slug, () =>
          specialist.execute(ctx),
          { jobId: id, specialistId: job.specialist },
        );
    const rawResult = await runWithTimeout(
      execPromise,
      controller,
      specialistTimeoutMs(),
      () => {
        timedOut = true;
      },
    );
    const result = SpecialistResultSchema.parse(rawResult) as SpecialistResult;
    if (controller.signal.aborted || getJob(id)?.status === "cancelled") {
      return;
    }
    if (result.evidence?.length) {
      await appendEvidenceBatch(slug, {
        jobId: id,
        specialistId: job.specialist,
        evidence: result.evidence,
      });
      ctx.emit("log", `Recorded ${result.evidence.length} evidence claim(s).`);
    } else {
      // Fallback evidence: a data-producing specialist wrote an artifact but
      // emitted no structured evidence. Without this, ~30 of the ~33
      // specialists contributed nothing to the ledger, starving the readiness
      // gate (needs ≥10 entries, ≥4 from live families). Record one
      // source-backed claim from the specialist's own summary + artifact.
      // Skip gates/linters/archivers (their self-claims are the noise the audit
      // flagged) and degraded runs (their data is partial — not evidence).
      const fb = fallbackEvidence(job.specialist, result);
      if (fb) {
        await appendEvidenceBatch(slug, {
          jobId: id,
          specialistId: job.specialist,
          evidence: [fb],
        });
        ctx.emit("log", "Recorded fallback evidence claim from specialist summary.");
      }
    }
    const resultEnvelope = await normalizeSpecialistResult({
      clientSlug: slug,
      result,
      durationMs: Date.now() - startedMs,
    });
    ctx.emit("progress", "Orchestrator reviewing specialist output…", {
      progress: Math.max(getJob(id)?.progress ?? 0.9, 0.92),
    });
    const review = await recordOrchestratorReview({
      clientSlug: slug,
      jobId: id,
      specialistId: job.specialist,
      result,
    });
    if (controller.signal.aborted || getJob(id)?.status === "cancelled") {
      return;
    }
    ctx.emit("log", `Orchestrator review ${review.verdict}: ${review.reviewPath}`);
    if (
      markSucceeded(
        id,
        result.summary,
        result.resultPath,
        review.reviewPath,
        resultEnvelope,
      )
    ) {
      emit(slug, id, "done", result.summary, {
        data: {
          terminalStatus: "succeeded",
          resultEnvelope,
          resultPath: result.resultPath,
          reportPath: result.reportPath,
          dataPath: result.dataPath,
          reviewPath: review.reviewPath,
          reviewVerdict: review.verdict,
        },
      });
      emitClientEvent(slug, "job_succeeded", id, job.specialist);
    }
  } catch (err) {
    // User-initiated cancel already set status='cancelled' and emitted the
    // terminal event in cancelJob — nothing to do here.
    if (getJob(id)?.status === "cancelled") {
      return;
    }
    // Timeout path — WE aborted the controller on the wall-clock budget
    // (the job row is still 'running' because the user didn't cancel it).
    // Record a degraded SKIP, not a failure: the phase gate treats a
    // skipped predecessor as resolved, so the sweep proceeds instead of
    // stalling on one hung specialist. The reason text makes the cause
    // explicit for retry/inspection, and HEALTH scoring is unaffected.
    if (timedOut || err instanceof SpecialistTimeoutError) {
      const secs = Math.round(specialistTimeoutMs() / 1000);
      const reason = `timed out after ${secs}s (degraded — re-run when ready)`;
      if (markSkipped(id, reason)) {
        emit(slug, id, "log", `skipped: ${reason}`);
        emit(slug, id, "done", `skipped: ${reason}`, {
          data: { terminalStatus: "skipped", reason, kind: "timeout" },
        });
        emitClientEvent(slug, "job_skipped", id, job.specialist);
      }
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    if (controller.signal.aborted) {
      return;
    }
    // SoftSkip path — the specialist refused to produce data for a
    // reason that's NOT a system failure (e.g. GSC property not
    // verified for the active client). Mark the job "cancelled" with
    // the `skipped:` prefix the rest of the orchestrator already
    // understands as a soft-skip, so HEALTH scoring, retry pickers,
    // and chat narration all treat it uniformly with the dispatch-
    // time skip path. No failure envelope captured — there isn't a
    // bug to investigate.
    if (err instanceof SoftSkipError) {
      const reason = message;
      if (markSkipped(id, reason)) {
        emit(slug, id, "log", `skipped: ${reason}`);
        emit(slug, id, "done", `skipped: ${reason}`, {
          data: { terminalStatus: "skipped", reason, kind: err.kind },
        });
        emitClientEvent(slug, "job_skipped", id, job.specialist);
      }
    } else if (err instanceof BlockedError) {
      // Blocked path — the specialist refused to proceed because an
      // UPSTREAM gate failed (e.g. vault lint errors, readiness
      // "blocked"). Parallel to soft-skip: status="cancelled" with
      // `blocked:` prefix so downstream orchestrator code (readiness
      // scoring, retry pickers, chat narration) can distinguish the
      // three terminal-but-not-failure outcomes (skipped / blocked /
      // dispatch-skipped). The artifactPath hint travels with the
      // done event so the TaskFeed click handler can open the gate's
      // own review (which carries the actual diagnostic details).
      const reason = message;
      if (markBlocked(id, reason)) {
        emit(slug, id, "log", `blocked: ${reason}`);
        emit(slug, id, "done", `blocked: ${reason}`, {
          data: {
            terminalStatus: "blocked",
            reason,
            kind: err.kind,
            artifactPath: err.artifactPath,
          },
        });
        emitClientEvent(slug, "job_blocked", id, job.specialist);
      }
    } else {
      // Phase 3.2 — capture the structured failure envelope so the
      // Specialist Inbox can show error class + stack head without
      // re-parsing freeform strings.
      const envelope = captureFailureEnvelope(err);
      const resultEnvelope = failedSpecialistExecutionResult({
        message,
        durationMs: Date.now() - startedMs,
      });
      if (markFailed(id, slug, message, envelope, resultEnvelope)) {
        emit(slug, id, "error", message);
        emit(slug, id, "done", `failed: ${message}`, {
          data: { terminalStatus: "failed", failureEnvelope: envelope, resultEnvelope },
        });
        emitClientEvent(slug, "job_failed", id, job.specialist);
      }
    }
  } finally {
    activeControllers.delete(id);
  }
}

async function runE2EMockSpecialist(
  specialistId: string,
  _payload: Record<string, unknown>,
  ctx: SpecialistContext,
): Promise<SpecialistResult> {
  const manifest = ctx.manifest;

  ctx.emit("progress", `E2E mock reading brain for ${specialistId}`, {
    progress: 0.2,
  });
  await delay(e2eMockSpecialistDelayMs());
  if (process.env.SEO_OFFICE_E2E_FAIL_SPECIALIST === specialistId) {
    ctx.emit("error", `E2E injected failure for ${specialistId}`, {
      progress: 0.5,
    });
    throw new Error(`E2E injected failure for ${specialistId}`);
  }

  const spec = mockArtifactSpec(specialistId, manifest.site_under_audit);
  ctx.emit("progress", `E2E mock writing ${spec.type} artifact`, {
    progress: 0.68,
  });

  const artifact = await writeArtifact(
    ctx.clientSlug,
    manifest,
    {
      dir: spec.dir,
      type: spec.type,
      frontmatterType: spec.frontmatterType,
      title: `${spec.title} - ${manifest.site_under_audit}`,
      body: renderMockArtifactBody(specialistId, manifest.site_under_audit),
      tags: ["e2e", specialistId, spec.frontmatterType],
      risk: "low",
      confidence: "medium",
      data: spec.data,
      url: manifest.site_under_audit,
      reportSubtitle: `Deterministic Playwright fixture for ${specialistId}`,
    },
    {
      facts: [
        `${specialistId} completed deterministic e2e coverage for ${manifest.site_under_audit}.`,
      ],
      threadTitle: `${spec.title} review`,
      threadRationale: "verify artifact, report, and orchestrator handoff",
      statusNote: "E2E build-brain sweep is producing deterministic specialist output.",
    },
  );
  if (isE2EDeepBrainFixtureEnabled()) {
    await writeE2EDeepBrainCanonical(
      ctx.clientSlug,
      specialistId,
      manifest.site_under_audit,
      artifact.relativePath,
    );
    if (specialistId === "drift-monitor") {
      await writeE2EDriftBaseline(ctx.clientSlug, manifest.site_under_audit);
    }
    if (
      process.env.SEO_OFFICE_E2E_INJECT_PHASE_PLACEHOLDER === "1" &&
      specialistId === "google-analytics"
    ) {
      await writeE2EPhaseGatePlaceholder(ctx.clientSlug);
    }
  }

  ctx.emit("progress", `E2E mock finished ${specialistId}`, {
    progress: 0.95,
  });
  await appendStructuredLogRow(ctx.clientSlug, {
    type: "llm_call",
    provider: "e2e-mock-anthropic",
    model: "e2e-mock",
    job_id: ctx.jobId,
    specialist_id: specialistId,
    duration_ms: e2eMockSpecialistDelayMs(),
    cost_usd: 0,
    input_tokens: 120,
    output_tokens: 40,
    cache_read_input_tokens: 96,
    cache_creation_input_tokens: 24,
  }).catch(() => undefined);
  return {
    summary: `${spec.title} written to ${artifact.relativePath}${
      artifact.reportPath ? ` (report: ${artifact.reportPath})` : ""
    }`,
    resultPath: artifact.relativePath,
    reportPath: artifact.reportPath,
    dataPath: artifact.dataPath,
    executionResult: artifact.executionResult,
    evidence: e2eFixtureEvidence(specialistId, artifact.relativePath),
  };
}

function mockArtifactSpec(
  specialistId: string,
  url: string,
): {
  dir: "audits" | "deliverables" | "keywords";
  type: string;
  frontmatterType: "audit" | "deliverable";
  title: string;
  data: ReportData;
} {
  switch (specialistId) {
    case "technical-auditor":
      return {
        dir: "audits",
        type: "technical",
        frontmatterType: "audit",
        title: "Technical SEO audit",
        data: technicalMockData(url),
      };
    case "schema-validator":
      return {
        dir: "audits",
        type: "schema",
        frontmatterType: "audit",
        title: "Schema markup audit",
        data: schemaMockData(),
      };
    case "page-analyzer":
      return {
        dir: "audits",
        type: "page",
        frontmatterType: "audit",
        title: "Page audit",
        data: pageMockData(url),
      };
    case "sxo-analyst":
      return {
        dir: "audits",
        type: "sxo",
        frontmatterType: "audit",
        title: "SXO audit",
        data: sxoMockData(),
      };
    case "sitemap-architect":
      return {
        dir: "audits",
        type: "sitemap",
        frontmatterType: "audit",
        title: "Sitemap audit",
        data: sitemapMockData(),
      };
    case "keyword-researcher":
      return {
        dir: "audits",
        type: "keywords",
        frontmatterType: "audit",
        title: "Keyword research",
        data: keywordMockData(),
      };
    case "content-strategist":
      return {
        dir: "audits",
        type: "content",
        frontmatterType: "audit",
        title: "Content audit",
        data: contentMockData(url),
      };
    case "brand-strategist":
      return {
        dir: "audits",
        type: "brand",
        frontmatterType: "audit",
        title: "Brand positioning brief",
        data: contentMockData(url),
      };
    case "competitor-pages":
      return {
        dir: "deliverables",
        type: "competitor-pages",
        frontmatterType: "deliverable",
        title: "Competitor comparison pages",
        data: keywordMockData(),
      };
    case "topic-clusterer":
      return {
        dir: "deliverables",
        type: "topic-clusters",
        frontmatterType: "deliverable",
        title: "Topic clusters",
        data: keywordMockData(),
      };
    case "content-brief-generator":
      return {
        dir: "deliverables",
        type: "brief-e2e-guide",
        frontmatterType: "deliverable",
        title: "Content brief",
        data: contentMockData(url),
      };
    case "beast-planner":
      return {
        dir: "deliverables",
        type: "beast-plan",
        frontmatterType: "deliverable",
        title: "ULTIMATE BEAST plan",
        data: contentMockData(url),
      };
    default:
      return {
        dir: "audits",
        type: specialistId.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
        frontmatterType: "audit",
        title: specialistId,
        data: pageMockData(url),
      };
  }
}

function renderMockArtifactBody(specialistId: string, url: string): string {
  if (isE2EDeepBrainFixtureEnabled() && specialistId === "beast-planner") {
    return renderDeepBrainBeastPlan(url);
  }
  return [
    "## Executive Summary",
    "",
    `- Deterministic e2e specialist fixture for \`${specialistId}\`.`,
    `- Source URL: ${url}.`,
    "- Artifact, report, review, chat narration, and final sweep readiness are exercised.",
    "",
    "## Validation Table",
    "",
    "| Check | Result |",
    "| --- | --- |",
    "| Brain context loaded | Pass |",
    "| Artifact written | Pass |",
    "| Report generated | Pass |",
    "",
    "## Next Action",
    "",
    "Use this fixture only in Playwright e2e mode. Production runs use real specialists.",
  ].join("\n");
}

function isE2EDeepBrainFixtureEnabled(): boolean {
  return process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE === "1";
}

interface DeepBrainFixture {
  competitors: Array<{ name: string; domain: string; angle: string }>;
  keywords: Array<{
    keyword: string;
    url: string;
    volume: number;
    intent: string;
    priority: string;
  }>;
  paa: string[];
  gsc: { clicks: number; impressions: number; ctr: string; average_position: number };
  ga4: { sessions: number; conversions: number; top_channel: string };
  visual_references: Array<{ page: string; observation: string }>;
}

let cachedDeepBrainFixture: DeepBrainFixture | null = null;

function loadDeepBrainFixture(): DeepBrainFixture {
  if (cachedDeepBrainFixture) return cachedDeepBrainFixture;
  const fixturePath = path.join(
    process.cwd(),
    "e2e",
    "fixtures",
    "deep-brain",
    "rituaria-style.json",
  );
  const raw = fs.readFileSync(fixturePath, "utf8");
  cachedDeepBrainFixture = JSON.parse(raw) as DeepBrainFixture;
  return cachedDeepBrainFixture;
}

async function writeE2EDeepBrainCanonical(
  clientSlug: string,
  specialistId: string,
  siteUrl: string,
  artifactPath: string,
): Promise<void> {
  const fixture = loadDeepBrainFixture();
  const artifactLink = artifactPath.replace(/^wiki\//, "").replace(/\.md$/, "");
  if (specialistId === "keyword-researcher") {
    const keywordRows = fixture.keywords
      .map(
        (item) =>
          `| ${escapeTable(item.keyword)} | ${escapeTable(item.url)} | ${item.volume} | ${escapeTable(item.intent)} | ${escapeTable(item.priority)} | live_api |`,
      )
      .join("\n");
    const keywordTable = [
      "| Keyword | Canonical URL | Volume | Intent | Priority | Provenance |",
      "| --- | --- | ---: | --- | --- | --- |",
      keywordRows,
    ].join("\n");
    await updateCanonicalNote(
      clientSlug,
      "wiki/keywords/Keyword Targets and Page Map.md",
      "keyword-map",
      richSection(
        "Deterministic fixture keyword map",
        [
          `The Deep Brain fixture treats ${siteUrl} as an evidence-backed local-first marketing brain target.`,
          "The keyword map is intentionally canonical: one topic, one page target, one measurable next action.",
          "This prevents duplicate briefs, keeps internal links pointed at the same URL, and gives the orchestrator a stable source of truth before it dispatches writing or implementation work.",
        ],
        keywordTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/decisions/Keyword to URL Map.md",
      "keyword-url-decisions",
      richSection(
        "Deterministic fixture URL decisions",
        [
          "Every query is assigned to a canonical URL so specialists can check prior work before creating new pages.",
          "Commercial terms are mapped to comparison and service pages; informational terms are mapped to hub or guide pages.",
          "The orchestrator should challenge any later specialist that proposes a duplicate page without a measurable reason.",
        ],
        keywordTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/keywords/Keyword Cannibalization Ledger.md",
      "keyword-cannibalization",
      richSection(
        "Deterministic fixture cannibalization ledger",
        [
          "The current fixture has no unresolved cannibalization blockers because each keyword family has a single assigned URL.",
          "Future content briefs must update this ledger when a new page targets an existing intent class.",
          "The acceptance criterion is simple: one primary URL per intent, clear secondary support pages, and no competing title tags for the same buyer problem.",
        ],
        keywordTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/sources/DataForSEO Keyword Exports.md",
      "dataforseo-keywords",
      richSection(
        "Deterministic fixture DataForSEO export",
        [
          `Fixture volumes represent cached DataForSEO-style rows for ${fixture.keywords.length} starter targets.`,
          "The purpose is to prove the production workflow can carry quantitative keyword evidence from source note to canonical map to BEAST plan.",
          "In live runs, this section should be replaced by the actual DataForSEO export and preserve the same row-level provenance.",
        ],
        keywordTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/sources/PAA Mining Digest.md",
      "paa-digest",
      richSection(
        "Deterministic fixture PAA digest",
        [
          "People Also Ask questions are treated as source evidence for content briefs, FAQ schema, and AI citation opportunities.",
          "The fixture keeps the questions short and concrete so the e2e can assert that source notes, deliverables, and suggestions remain linked.",
          "A production run should refresh this digest from live SERP mining before claiming an answer hub is complete.",
        ],
        fixture.paa.map((question) => `- ${question}`).join("\n"),
        artifactLink,
      ),
    );
    await scrubE2ESeedDebt(clientSlug, [
      "wiki/keywords/Keyword Targets and Page Map.md",
      "wiki/decisions/Keyword to URL Map.md",
      "wiki/keywords/Keyword Cannibalization Ledger.md",
      "wiki/sources/DataForSEO Keyword Exports.md",
      "wiki/sources/PAA Mining Digest.md",
    ]);
  }

  if (specialistId === "competitor-pages") {
    const competitorRows = fixture.competitors
      .map(
        (item) =>
          `| ${escapeTable(item.name)} | ${escapeTable(item.domain)} | ${escapeTable(item.angle)} | cached |`,
      )
      .join("\n");
    const competitorTable = [
      "| Competitor | Domain | Positioning angle | Provenance |",
      "| --- | --- | --- | --- |",
      competitorRows,
    ].join("\n");
    await updateCanonicalNote(
      clientSlug,
      "wiki/sources/Competitor Landscape Cache.md",
      "competitor-landscape",
      richSection(
        "Deterministic fixture competitor landscape",
        [
          "The competitor landscape is captured as a stable cache so the orchestrator can decide whether to rerun competitor discovery or reuse prior evidence.",
          "Each competitor includes a domain and positioning angle, not only a name, because strategy work needs the reason the competitor matters.",
          "When a specialist recommends a comparison page, it must cite this cache or a newer live SERP source.",
        ],
        competitorTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/sources/Competitor Keyword Research Summary.md",
      "competitor-keywords",
      richSection(
        "Deterministic fixture competitor keyword summary",
        [
          "Competitor keyword evidence is grouped by commercial intent, alternatives intent, and problem-aware discovery intent.",
          "This summary gives keyword, cluster, and content-brief specialists one place to check before proposing new ranking pages.",
          "The first production-grade improvement is to attach exported rows from each competitor domain and mark outdated evidence for refresh.",
        ],
        competitorTable,
        artifactLink,
      ),
    );
    await updateCanonicalNote(
      clientSlug,
      "wiki/entities/Primary Competitors.md",
      "primary-competitors",
      richSection(
        "Deterministic fixture primary competitors",
        [
          "Primary competitors are represented as entities because they influence comparison pages, link opportunities, objection handling, and product positioning.",
          "The brain should keep this list small enough to act on and broad enough to catch category alternatives.",
          "The orchestrator should challenge any specialist that invents a new competitor without source evidence or a strategic reason.",
        ],
        competitorTable,
        artifactLink,
      ),
    );
    await scrubE2ESeedDebt(clientSlug, [
      "wiki/sources/Competitor Landscape Cache.md",
      "wiki/sources/Competitor Keyword Research Summary.md",
      "wiki/entities/Primary Competitors.md",
    ]);
  }

  if (specialistId === "beast-planner") {
    await updateCanonicalNote(
      clientSlug,
      "wiki/deliverables/ULTIMATE BEAST Plan.md",
      "beast-plan",
      `${renderDeepBrainBeastPlan(siteUrl)}\n\nEvidence: [[${artifactLink}]].`,
    );
    await scrubE2ESeedDebt(clientSlug, ["wiki/deliverables/ULTIMATE BEAST Plan.md"]);
  }
}

async function writeE2EDriftBaseline(clientSlug: string, url: string): Promise<void> {
  const baseline = {
    capturedAt: new Date().toISOString(),
    url,
    status: 200,
    title: "Deterministic Deep Brain fixture",
    metaDescription: "Fixture baseline captured during the first Deep Brain sweep.",
    canonical: url,
    robotsMeta: "index,follow",
    h1: ["Deterministic Deep Brain fixture"],
    h2Count: 6,
    wordCount: 1800,
    jsonLdCount: 2,
    internalLinks: 24,
    externalLinks: 5,
    imageCount: 8,
    isHttps: url.startsWith("https://"),
    contentLength: 42_000,
  };
  const baselinePath = path.join(vaultRoot(clientSlug), ".drift", "baseline.json");
  await fsp.mkdir(path.dirname(baselinePath), { recursive: true });
  await fsp.writeFile(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf8");
}

async function writeE2EPhaseGatePlaceholder(clientSlug: string): Promise<void> {
  await writeRaw(
    clientSlug,
    "wiki/meta/E2E Phase Gate Placeholder.md",
    `---
brain_schema: marketing-brain.v1
type: meta
title: "E2E Phase Gate Placeholder"
created: 2026-05-17
updated: 2026-05-17
tags: []
status: active
owner: e2e
confidence: high
approval_status: approved
rollback_note: "delete this injected test note"
risk_level: low
---

This note deliberately contains {{phase_gate_failure}} so the next phase gate must halt.
`,
  );
}

function e2eFixtureEvidence(
  specialistId: string,
  artifactPath: string,
): SpecialistEvidence[] {
  if (!isE2EDeepBrainFixtureEnabled()) return [];
  const families = [
    "wiki/sources/DataForSEO Keyword Exports.md",
    "wiki/sources/PAA Mining Digest.md",
    "wiki/sources/Competitor Landscape Cache.md",
    "wiki/sources/Competitor Keyword Research Summary.md",
    "wiki/sources/Google Search Console Summary.md",
    "wiki/sources/GA4 Engagement Summary.md",
    "wiki/sources/Visual Reference Metadata.md",
  ];
  const source = families[Math.abs(hashString(specialistId)) % families.length];
  return [
    {
      claim: `${specialistId} completed deterministic Deep Brain fixture work with source-backed output.`,
      provenance: source.includes("Google") || source.includes("DataForSEO") ? "live_api" : "cached",
      source_paths: [source, artifactPath],
      confidence: "high",
      cost_usd: 0,
    },
  ];
}

function renderDeepBrainBeastPlan(url: string): string {
  const fixture = loadDeepBrainFixture();
  const repeatedEvidence = Array.from({ length: 22 }, (_, index) => {
    const keyword = fixture.keywords[index % fixture.keywords.length];
    const competitor = fixture.competitors[index % fixture.competitors.length];
    return `Evidence block ${index + 1}: ${keyword.keyword} maps to ${keyword.url} with ${keyword.volume} fixture searches, ${keyword.intent} intent, and ${keyword.priority} priority. ${competitor.name} (${competitor.domain}) frames the market as ${competitor.angle}. The operator should keep this as cached evidence until live exports refresh it. The acceptance criterion is that the mapped page has one primary search intent, one owner, one measurement event, and internal links from the relevant hub. Rollback is to remove the new internal links, restore the prior title and H1, and return the keyword row to watchlist status.`;
  }).join("\n\n");

  return [
    "## Executive summary",
    "",
    `The Deep Brain fixture for ${url} is intentionally complete enough to test production readiness instead of a shallow pass. It combines source notes, competitor context, keyword mapping, technical findings, content opportunities, and an orchestrator-reviewed execution path. The top opportunities are to lock the commercial comparison surface, build the answer hub around People Also Ask demand, and improve measurement confidence before scaling content.`,
    "",
    "## Top opportunities",
    "",
    "1. Build the comparison and alternatives cluster first because it carries commercial investigation intent and has clear competitor evidence.",
    "2. Use the keyword-to-URL map to prevent duplicate briefs and keep every specialist aligned to the same canonical page targets.",
    "3. Convert PAA questions into answer blocks, FAQ schema candidates, and internal-link anchors that support the main commercial pages.",
    "4. Refresh Search Console, GA4, DataForSEO, visual-reference, and competitor exports before calling any future roadmap complete.",
    "",
    "## Risk",
    "",
    "The biggest risk is false confidence from a clean task ledger. A brain is not deep-ready because jobs succeeded; it is deep-ready only when the evidence layer, canonical decisions, synthesis, and next actions agree. The second risk is page cannibalization if the operator publishes comparison, guide, and template pages without using the keyword-to-URL map. The third risk is stale measurement data, so each production run must record whether a claim came from live_api, cached, manual, or model_estimate evidence.",
    "",
    "## 30 day plan",
    "",
    "Week 1: validate the source ledger, confirm Search Console and GA4 access, and approve the canonical keyword-to-URL map. Owner: operator. Acceptance: every high-priority keyword has a primary URL, provenance, and one next action. Rollback: restore the previous keyword map section and mark changed rows as pending.",
    "",
    "Week 2: draft the first comparison page, one support guide, and one FAQ block sourced from the PAA digest. Owner: content lead. Acceptance: each page cites competitor or SERP evidence and links back to the hub. Rollback: unpublish draft pages and keep the briefs in the vault for later revision.",
    "",
    "Week 3: implement technical and schema fixes from the diagnostic specialists. Owner: developer. Acceptance: sitemap, schema, page, SXO, performance, and visual checks all have current reports and no high-risk blocker. Rollback: revert the changed templates or deployment branch and update the audit note.",
    "",
    "Week 4: review rankings, internal links, and engagement signals. Owner: orchestrator. Acceptance: the review note explains what improved, what stayed flat, and which source needs refresh. Rollback: stop the next sweep and return to measurement setup.",
    "",
    "## 60 day plan",
    "",
    "- Expand the comparison cluster only after the first page has crawlable structure, original proof, and internal links.",
    "- Build two content briefs from the strongest informational questions and assign them to one canonical hub.",
    "- Refresh competitor keyword exports and update the source ledger before adding any new page type.",
    "- Add image, visual, and AI citation improvements to pages that already have intent-fit and technical health.",
    "",
    "## 90 day plan",
    "",
    "- Turn the proven cluster into a repeatable page template with acceptance criteria, rollback notes, and source refresh rules.",
    "- Use Search Console and GA4 deltas to decide whether to prune, merge, expand, or promote each ranking page.",
    "- Keep the BEAST roadmap alive by appending monthly reviews instead of overwriting prior decisions.",
    "",
    "## Acceptance criteria",
    "",
    "The brain is acceptable when the final review names the first action, the source ledger has at least ten provenance-backed claims, canonical notes have generated sections, the vault has no unresolved placeholders, and reports open inside the app. The operator must be able to click from chat to the review, from review to evidence, and from evidence to a report without leaving SEO Office.",
    "",
    "## Rollback notes",
    "",
    "All implementation actions must be reversible. For content changes, keep the previous title, meta description, H1, internal links, and schema block in the related decision note. For technical changes, note the deployment or file path changed and the exact revert condition. For measurement changes, preserve the previous export and mark the new one as superseding rather than deleting the old source.",
    "",
    "## Evidence ledger synthesis",
    "",
    repeatedEvidence,
    "",
    "## First action",
    "",
    "Approve the keyword-to-URL map and run the first comparison-page brief from the top commercial opportunity. This is the safest first action because it depends on already-created source, competitor, and keyword evidence and has a clear acceptance check.",
  ].join("\n");
}

function richSection(
  heading: string,
  paragraphs: string[],
  tableOrList: string,
  artifactLink: string,
): string {
  const depth = [
    "This generated section is intentionally verbose enough for the readiness gate to distinguish a filled Marketing Brain note from a shallow scaffold.",
    "Specialists should read this canonical note before creating new work, compare their proposed action against the source evidence, and update this section only when they have stronger evidence.",
    "The orchestrator should treat contradictions as review items, not silently trust the latest specialist output.",
    "Every claim here remains reversible because the source artifact is linked and the managed section can be replaced without deleting the note history.",
  ].join(" ");
  return [
    `## ${heading}`,
    "",
    ...paragraphs,
    "",
    tableOrList,
    "",
    depth,
    "",
    `Evidence artifact: [[${artifactLink}]].`,
  ].join("\n");
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

async function scrubE2ESeedDebt(
  clientSlug: string,
  relativePaths: string[],
): Promise<void> {
  for (const relativePath of relativePaths) {
    const raw = await readRaw(clientSlug, relativePath);
    if (!raw) continue;
    const scrubbed = raw
      .replace(/\bSkill fills\b/gi, "SEO Office generated section below is current")
      .replace(/\bpending source\b/gi, "source refresh queued")
      .replace(/\bexample only\b/gi, "fixture-backed")
      .replace(/\breplace this\b/gi, "update this")
      .replace(/\{\{[^}]+\}\}/g, "fixture-backed field");
    if (scrubbed !== raw) await writeRaw(clientSlug, relativePath, scrubbed);
  }
}

function technicalMockData(url: string): ReportData {
  return {
    kind: "technical-audit",
    v: 1,
    url,
    scores: { crawl: 92, index: 88, mobile: 90, cwv: 82, schema: 86 },
    severity_counts: { high: 0, medium: 1, low: 2, info: 3 },
    signals: [
      { id: "crawl-ok", label: "Crawl path reachable", severity: "low" },
      { id: "cwv-watch", label: "Core Web Vitals should be monitored", severity: "medium" },
    ],
  };
}

function schemaMockData(): ReportData {
  return {
    kind: "schema-validation",
    v: 1,
    entities: [
      { type: "Organization", valid: 1, invalid: 0, missing: 0 },
      { type: "WebSite", valid: 1, invalid: 0, missing: 0 },
    ],
    signals: [{ id: "schema-ok", label: "Baseline schema valid", severity: "low" }],
  };
}

function pageMockData(url: string): ReportData {
  return {
    kind: "page-analysis",
    v: 1,
    url,
    severity_counts: { high: 0, medium: 1, low: 2, info: 1 },
    signals: [
      { id: "title-ok", label: "Title and primary heading present", severity: "low" },
      { id: "internal-links", label: "Internal links need review", severity: "medium" },
    ],
  };
}

function sxoMockData(): ReportData {
  return {
    kind: "sxo-scoring",
    v: 1,
    personas: [
      { name: "Automation builder", score: 84, gaps: ["Comparison proof"] },
      { name: "RevOps lead", score: 78, gaps: ["ROI calculator"] },
    ],
    signals: [{ id: "intent-match", label: "Search intent broadly matches", severity: "low" }],
  };
}

function sitemapMockData(): ReportData {
  return {
    kind: "sitemap-validation",
    v: 1,
    templates: [
      { name: "Pages", count: 42 },
      { name: "Blog", count: 18 },
    ],
    gate_results: [
      { name: "XML reachable", pass: true },
      { name: "Canonical pages only", pass: true },
    ],
    signals: [{ id: "sitemap-ok", label: "Sitemap passes baseline gates", severity: "low" }],
  };
}

function keywordMockData(): ReportData {
  return {
    kind: "keyword-research",
    v: 1,
    top_keywords: [
      {
        keyword: "workflow automation platform",
        volume: 5400,
        difficulty: 44,
        intent: "commercial",
      },
      {
        keyword: "automation software",
        volume: 3600,
        difficulty: 38,
        intent: "informational",
      },
    ],
    intent_mix: [
      { label: "Commercial", value: 60 },
      { label: "Informational", value: 40 },
    ],
  };
}

function contentMockData(url: string): ReportData {
  return {
    kind: "content-audit",
    v: 1,
    url,
    eeat: { experience: 82, expertise: 86, authoritativeness: 78, trust: 84 },
    intent_mix: [
      { label: "Problem aware", value: 35 },
      { label: "Solution aware", value: 45 },
      { label: "Comparison", value: 20 },
    ],
    severity_counts: { high: 0, medium: 2, low: 3 },
    signals: [
      { id: "proof", label: "Add more customer proof above the fold", severity: "medium" },
      { id: "eeat", label: "Expertise signals are present", severity: "low" },
    ],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markRunning(id: string): boolean {
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'running',
           started_at = datetime('now'),
           progress = 0.01,
           message = CASE WHEN message = 'queued' THEN 'running' ELSE message END
       WHERE id = ? AND status = 'queued'`,
    )
    .run(id);
  if (result.changes === 0) return false;
  syncAssignmentStatus(id, "running");
  return true;
}

function markSucceeded(
  id: string,
  message: string,
  resultPath?: string,
  reviewPath?: string,
  resultEnvelope?: SpecialistExecutionResult,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'succeeded',
           progress = 1,
           finished_at = datetime('now'),
           message = ?,
           result_path = ?,
           result_envelope = COALESCE(?, result_envelope)
       WHERE id = ? AND status = 'running'`,
    )
    .run(
      message,
      resultPath ?? null,
      resultEnvelope ? serializeResultEnvelope(resultEnvelope) : null,
      id,
    );
  if (result.changes === 0) return false;
  syncAssignmentStatus(
    id,
    "succeeded",
    reviewPath ? `${message} Review: ${reviewPath}` : message,
  );
  return true;
}

/**
 * Mark a job as soft-skipped. Status goes to "cancelled" (matching the
 * dispatch-time skip path) and the `message` is prefixed with the
 * `skipped: ` token that the rest of the orchestrator already
 * recognizes via `result_summary.startsWith("skipped:")` for readiness
 * scoring, retry filtering, and chat narration grouping.
 *
 * Distinct from `markFailed`:
 *   - Status: "cancelled" not "failed"
 *   - No failure envelope captured (this isn't a bug to investigate)
 *   - No result envelope (the specialist wrote nothing)
 *   - HEALTH score doesn't take a hit
 */
function markSkipped(id: string, reason: string): boolean {
  const message = `skipped: ${reason}`;
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'cancelled',
           finished_at = datetime('now'),
           message = ?
       WHERE id = ? AND status IN ('queued','running')`,
    )
    .run(message, id);
  if (result.changes === 0) return false;
  syncAssignmentStatus(id, "cancelled", message);
  return true;
}

/**
 * Mark a job as blocked by an upstream gate. Mirrors `markSkipped`
 * exactly except the message prefix is `blocked:` — the orchestrator's
 * readiness scoring (src/lib/brain/readiness.ts) can choose to treat
 * blocked rows differently from skipped rows because the user fix
 * target is upstream artifacts, not this specialist's setup.
 */
function markBlocked(id: string, reason: string): boolean {
  const message = `blocked: ${reason}`;
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'cancelled',
           finished_at = datetime('now'),
           message = ?
       WHERE id = ? AND status IN ('queued','running')`,
    )
    .run(message, id);
  if (result.changes === 0) return false;
  syncAssignmentStatus(id, "cancelled", message);
  return true;
}

function markFailed(
  id: string,
  _slug: string,
  message: string,
  envelope?: FailureEnvelope,
  resultEnvelope?: SpecialistExecutionResult,
): boolean {
  // `_slug` accepted (and intentionally unused for the SQL update) so the
  // call sites read symmetrically with markRunning/markSucceeded while we
  // still emit events with the right scope upstream.
  void _slug;
  const result = getDb()
    .prepare(
      `UPDATE jobs
       SET status = 'failed',
           finished_at = datetime('now'),
           message = ?,
           failure_envelope = COALESCE(?, failure_envelope),
           result_envelope = COALESCE(?, result_envelope)
       WHERE id = ? AND status IN ('queued','running')`,
    )
    .run(
      message,
      envelope ? JSON.stringify(envelope) : null,
      resultEnvelope ? serializeResultEnvelope(resultEnvelope) : null,
      id,
    );
  if (result.changes === 0) return false;
  syncAssignmentStatus(id, "failed", message);
  return true;
}

/**
 * Phase 3.2 — structured snapshot of a specialist failure. Captures the
 * error's class, message, the first 10 stack lines, and an ISO
 * timestamp. The Specialist Inbox can render this without parsing the
 * freeform `message` string. Extra fields (partial writes, structured
 * outputs received before the throw) are optional and surfaced when the
 * specialist captured them.
 */
export interface FailureEnvelope {
  capturedAt: string;
  errorClass: string;
  message: string;
  stackHead: string[];
  partialWrites?: string[];
  structuredOutput?: unknown;
}

export function captureFailureEnvelope(err: unknown): FailureEnvelope {
  const capturedAt = new Date().toISOString();
  if (err instanceof Error) {
    const stackHead = (err.stack ?? "")
      .split("\n")
      .slice(0, 10)
      .map((l) => l.trim())
      .filter(Boolean);
    return {
      capturedAt,
      errorClass: err.name || "Error",
      message: err.message,
      stackHead,
    };
  }
  return {
    capturedAt,
    errorClass: typeof err,
    message: String(err),
    stackHead: [],
  };
}

function serializeResultEnvelope(envelope: SpecialistExecutionResult): string {
  return JSON.stringify(SpecialistExecutionResultSchema.parse(envelope));
}

/**
 * Propagate job lifecycle to the linked Assignment, if any. Done with
 * inline SQL to avoid a circular import (`assignment.ts` is loaded lazily
 * via the chat route and would re-pull job-queue otherwise).
 */
function syncAssignmentStatus(
  jobId: string,
  status: "running" | "succeeded" | "failed" | "cancelled",
  message?: string,
): void {
  const db = getDb();
  const job = getJob(jobId);
  if (!job) return;
  const skipReason =
    status === "cancelled" && message?.startsWith("skipped:")
      ? message.replace(/^skipped:\s*/i, "").trim() || message
      : null;
  db
    .prepare(
      `UPDATE assignments
       SET status = ?,
           message = COALESCE(?, message),
           started_at = CASE
             WHEN ? = 'running' THEN COALESCE(started_at, datetime('now'))
             ELSE started_at
           END,
           completed_at = CASE
             WHEN ? IN ('succeeded','cancelled') THEN COALESCE(completed_at, datetime('now'))
             ELSE completed_at
           END,
           failed_at = CASE
             WHEN ? = 'failed' THEN COALESCE(failed_at, datetime('now'))
             ELSE failed_at
           END,
           skip_reason = CASE
             WHEN ? = 'cancelled' AND ? IS NOT NULL THEN ?
             ELSE skip_reason
           END,
           updated_at = datetime('now')
       WHERE job_id = ? AND client_slug = ? AND status IN ('queued','running','blocked')`,
    )
    .run(
      status,
      message ?? null,
      status,
      status,
      status,
      status,
      skipReason,
      skipReason,
      jobId,
      job.client_slug,
    );
  if (tableExists("tasks")) {
    db
      .prepare(
        `UPDATE tasks
         SET status = ?,
             result_summary = COALESCE(?, result_summary),
             updated_at = datetime('now')
         WHERE assignment_id = (
           SELECT id FROM assignments WHERE job_id = ? LIMIT 1
         )
         AND status IN ('queued','running','planned','blocked')`,
      )
      .run(status, message ?? null, jobId);
  }
  void import("./assignment")
    .then(({ getAssignmentByJobId, mirrorAssignmentToVault }) => {
      const assignment = getAssignmentByJobId(jobId);
      if (!assignment) return undefined;
      return mirrorAssignmentToVault(assignment, { appendLog: false });
    })
    .catch(() => undefined);
}

function tableExists(tableName: string): boolean {
  const row = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

/** Update job progress mid-run. Specialists usually emit progress events instead. */
export function setProgress(id: string, progress: number, message?: string): void {
  getDb()
    .prepare("UPDATE jobs SET progress = ?, message = COALESCE(?, message) WHERE id = ?")
    .run(progress, message ?? null, id);
}
