/**
 * Task runner — walks a Task subtree and dispatches every unblocked leaf
 * in parallel. Re-runs `findUnblocked()` after each terminal transition
 * so newly-unblocked steps fire as their dependencies finish.
 *
 * This is the "multi-agentic" execution layer. The user (or the
 * Orchestrator on their behalf) plans the tree via the Tasks API; this
 * module turns the plan into a fan-out of Specialist Jobs.
 *
 * Concurrency model (single Node process):
 *   - Within one Task tree, sibling leaves run in parallel via
 *     `enqueue({ parallel: true })`.
 *   - log.md writes are serialised by `audit-trail.ts`'s per-client
 *     mutex; specialist artefact paths are per-specialist (date+type
 *     keyed) so they don't collide.
 *   - Parent Task status is *derived* from its children at read time —
 *     this module updates leaf status only, and the UI computes
 *     parent rollups from `loadSubtree()`.
 *
 * Failure model:
 *   - A failed leaf marks itself `failed`, releases dependents (they
 *     can still run; their `blocked_on` check counts "failed" as
 *     terminal). This matches Claude Code's Tasks semantics — a
 *     failed sub-Task doesn't block the rest of the tree by default.
 *   - The caller can flip a Task's `permission_mode` to plan and
 *     re-approve to retry; idempotency on `request_id` keeps state
 *     consistent.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import {
  createAssignment,
  linkJob,
  mirrorAssignmentToVault,
  updateStatus,
  type Assignment,
} from "./assignment";
import { subscribe } from "./events";
import { enqueue, getJob, type JobRecord } from "./job-queue";
import {
  findUnblocked,
  getTask,
  listChildren,
  loadSubtree,
  mirrorTaskTreeToVault,
  resetTaskForRetry,
  updateTaskStatus,
  type Task,
} from "./task";
import { narrateToChat } from "./chat-narrator";
import { hasLiveSweep } from "./sweeps";
import { finalizeBrainSweep } from "./finalize-sweep";
import { renderReadinessChatSummary } from "./readiness-narration";
import { releaseSweepLock } from "@/lib/brain/index-db";
import { reportApiPath } from "@/lib/reports/url";

/**
 * Result of running a Task tree. Returned eagerly — every dispatch is
 * fire-and-forget, so by the time this resolves we've kicked off N jobs
 * and registered listeners for terminal transitions.
 */
export interface RunSummary {
  rootTaskId: string;
  dispatched: Array<{ taskId: string; assignmentId: string; jobId: string }>;
  alreadyTerminal: number;
  unchanged: number;
  retried: number;
}

export interface RunTaskTreeOptions {
  retryFailed?: boolean;
}

const retryRequestIdsByTask = new Map<string, string>();
const sweepFinalizersByRoot = new Map<string, Promise<void>>();

/**
 * Run a Task tree end-to-end. Returns immediately after the initial
 * fan-out; further unblocked leaves dispatch as dependencies finish
 * (the SSE subscribers in this module do that on their own).
 *
 * Idempotent: re-running a tree that's mostly done only dispatches the
 * leaves that are still in `planned` state.
 */
export async function runTaskTree(
  rootTaskId: string,
  options: RunTaskTreeOptions = {},
): Promise<RunSummary> {
  const root = getTask(rootTaskId);
  if (!root) throw new Error(`task not found: ${rootTaskId}`);
  const retryRunId = options.retryFailed ? randomUUID() : null;
  const retryTaskIds = retryRunId ? resetFailedTasksForRetry(rootTaskId) : new Set<string>();
  if (retryRunId) {
    for (const id of retryTaskIds) {
      retryRequestIdsByTask.set(id, `task:${id}:retry:${retryRunId}`);
    }
  }

  // Initial fan-out: every Task that's `planned` with empty `blocked_on`
  // OR is `blocked` but all blockers are already satisfied.
  const subtree = loadSubtree(rootTaskId);
  const summary: RunSummary = {
    rootTaskId,
    dispatched: [],
    alreadyTerminal: 0,
    unchanged: 0,
    retried: retryTaskIds.size,
  };
  // Promote any "blocked" rows whose blockers are already done so the
  // first pass picks them up — the runner can pick up mid-state trees
  // after a process restart.
  for (const t of subtree) {
    if (t.status === "blocked" && areAllDepsSatisfied(t, subtree)) {
      updateTaskStatus(t.id, "planned");
    } else if (
      t.status === "succeeded" ||
      t.status === "failed" ||
      t.status === "cancelled"
    ) {
      summary.alreadyTerminal++;
    }
  }

  // Walk all leaves in `planned` and dispatch each.
  const planned = loadSubtree(rootTaskId).filter(
    (t) => t.status === "planned" && t.specialist_id,
  );
  for (const t of planned) {
    const dispatched = await dispatchLeaf(t, {
      requestId: retryRequestIdsByTask.get(t.id),
    });
    if (dispatched) {
      summary.dispatched.push({
        taskId: t.id,
        assignmentId: dispatched.assignment.id,
        jobId: dispatched.job.id,
      });
    } else {
      summary.unchanged++;
    }
  }

  // Re-mirror the tree so the vault shows the post-dispatch state.
  await mirrorTaskTreeToVault(rootTaskId).catch(() => undefined);

  return summary;
}

export async function settleTaskTreeIfTerminal(rootTaskId: string): Promise<void> {
  rollupTerminalStatus(rootTaskId);
  const root = findRoot(rootTaskId) ?? getTask(rootTaskId);
  if (!root) return;
  if (
    root.status === "succeeded" ||
    root.status === "failed" ||
    root.status === "cancelled"
  ) {
    await mirrorTaskTreeToVault(root.id).catch(() => undefined);
    const rootChildren = listChildren(root.client_slug, root.id);
    if (
      root.kind === "sweep" &&
      rootChildren.length > 0 &&
      rootChildren.every((child) =>
        child.status === "succeeded" ||
        child.status === "failed" ||
        child.status === "cancelled",
      )
    ) {
      await finalizeTerminalSweep(root, rootChildren, root.status);
    }
  }
}

/**
 * Dispatch one leaf Task: create the Assignment, enqueue a parallel
 * Job, link both back to the Task. Listens for job completion and
 * advances the tree.
 */
async function dispatchLeaf(
  task: Task,
  options: { requestId?: string } = {},
): Promise<{ assignment: Assignment; job: JobRecord } | null> {
  if (!task.specialist_id) return null;
  const requestId =
    options.requestId ?? retryRequestIdsByTask.get(task.id) ?? `task:${task.id}`;

  // Pure planning parents reach this branch when the caller hand-rolls
  // a tree without specialist_ids on leaves — skip silently.
  const assignment = createAssignment({
    client_slug: task.client_slug,
    specialist_id: task.specialist_id,
    parent_message_id: task.parent_message_id,
    title: task.title,
    brief: task.goal,
    payload: task.payload,
    permission_mode: task.permission_mode,
    request_id: requestId, // idempotency — re-running re-finds
  });

  // Plan mode: assignment lands `proposed`; no job, user approves later.
  if (task.permission_mode === "plan") {
    updateTaskStatus(task.id, "queued", { assignment_id: assignment.id });
    await mirrorAssignmentToVault(assignment).catch(() => undefined);
    return null;
  }

  const job = await enqueue({
    client_slug: task.client_slug,
    specialist: task.specialist_id,
    payload: task.payload,
    parallel: true,
    request_id: requestId,
  });

  // Link the job back into the assignment row so the job-queue's
  // syncAssignmentStatus() can find it on lifecycle transitions.
  // Without this, assignment.status would stay 'queued' forever.
  const linked = linkJob(assignment.id, job.id) ?? assignment;

  const latestAfterLink = getJob(job.id);
  const linkedStatus = latestAfterLink?.status === "running" ? "running" : "queued";
  if (latestAfterLink?.status === "running") {
    updateStatus(linked.id, "running");
  }

  updateTaskStatus(task.id, linkedStatus, {
    assignment_id: linked.id,
  });

  await mirrorAssignmentToVault({ ...linked, job_id: job.id }).catch(
    () => undefined,
  );

  // Subscribe to the job's terminal event so we can advance the tree
  // and fan out newly-unblocked siblings. One-shot subscriber — unsubs
  // itself on the first `done` event. Keyed by (slug, jobId) so we can
  // never accidentally pick up another client's job lifecycle.
  const unsubscribe = subscribe(task.client_slug, job.id, (ev) => {
    if (ev.kind !== "done") return;
    unsubscribe();
    // Pluck the optional report/data paths off the event payload so the
    // Task row can carry them; the Inbox UI uses them to render an
    // "Open Report ↗" affordance.
    const payload = (ev.data ?? {}) as {
      terminalStatus?: JobRecord["status"];
      resultPath?: string;
      reportPath?: string;
      dataPath?: string;
    };
    void onJobDone(task, job.id, ev.message, payload).catch(() => undefined);
  });

  const latest = getJob(job.id);
  if (latest && isJobTerminal(latest.status)) {
    unsubscribe();
    void onJobDone(task, job.id, doneMessageFromJob(latest), {
      resultPath: latest.result_path ?? undefined,
    }).catch(() => undefined);
  }

  return { assignment, job };
}

function isJobTerminal(status: JobRecord["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function doneMessageFromJob(job: JobRecord): string {
  if (job.status === "succeeded") return job.message || "succeeded";
  if (job.status === "failed") return `failed: ${job.message || "failed"}`;
  return "cancelled";
}

async function onJobDone(
  task: Task,
  jobId: string,
  doneMessage: string,
  payload: {
    terminalStatus?: JobRecord["status"];
    resultPath?: string;
    reportPath?: string;
    dataPath?: string;
  } = {},
): Promise<void> {
  // The job-queue's syncAssignmentStatus already flipped the Assignment
  // to succeeded/failed. Mirror that onto the Task row so the rollup
  // and the runner's findUnblocked() see truth.
  const jobStatus = payload.terminalStatus ?? getJob(jobId)?.status;
  const next =
    jobStatus === "failed"
      ? "failed"
      : jobStatus === "cancelled"
        ? "cancelled"
        : doneMessage.startsWith("failed:")
          ? "failed"
          : doneMessage === "cancelled"
            ? "cancelled"
            : "succeeded";
  retryRequestIdsByTask.delete(task.id);
  updateTaskStatus(task.id, next, {
    result_summary: doneMessage,
    ...(payload.resultPath ? { result_path: payload.resultPath } : {}),
    ...(payload.reportPath ? { result_report_path: payload.reportPath } : {}),
    ...(payload.dataPath ? { result_data_path: payload.dataPath } : {}),
  });

  // Per-specialist narration — drop a line in the orchestrator chat
  // whenever a task that's part of a live sweep terminates. Gated on
  // hasLiveSweep so non-sweep dispatches (single assign_task calls) stay
  // silent. Idempotent on `step:<task.id>` so re-runs or restart-replays
  // don't double-write. Fire-and-forget; never blocks the runner.
  if (hasLiveSweep(task.client_slug)) {
    const specialistId = task.specialist_id ?? "(unknown)";
    const body =
      next === "succeeded"
        ? `✓ \`${specialistId}\` complete.${
            doneMessage && doneMessage !== "succeeded"
              ? ` ${doneMessage.slice(0, 200)}`
              : ""
          }${
            payload.reportPath
              ? `\n\n[Open report →](${reportApiPath(task.client_slug, payload.reportPath)})`
              : ""
          }`
        : next === "failed"
          ? `✗ \`${specialistId}\` failed.${
              doneMessage ? ` ${doneMessage.replace(/^failed:\s*/, "").slice(0, 200)}` : ""
            }`
          : `· \`${specialistId}\` cancelled.${
              doneMessage ? ` ${doneMessage.slice(0, 200)}` : ""
            }`;
    void narrateToChat(task.client_slug, body, { id: `step:${task.id}:${jobId}` }).catch(
      () => undefined,
    );
  }

  // Walk the tree forward: promote anyone now-unblocked, then re-mirror
  // the plan note.
  const root = findRoot(task.id);
  if (!root) return;

  if (next === "failed" || next === "cancelled") {
    cancelDependentsBlockedByFailure(root.id);
  }

  const newly = findUnblocked(task.client_slug).filter((t) =>
    isInTree(t.id, root.id),
  );
  for (const t of newly) {
    // Move "blocked" → "planned" so dispatchLeaf accepts it.
    updateTaskStatus(t.id, "planned");
    await dispatchLeaf(t).catch(() => undefined);
  }

  // Roll the terminal status up the tree. A parent's status mirrors its
  // children once they're all in terminal states; without this, planning
  // parents stay stuck at "planned" forever even after every leaf
  // succeeded, cluttering the Agent View and giving the user no
  // indication their fan-out actually finished.
  rollupTerminalStatus(task.id);

  await mirrorTaskTreeToVault(root.id).catch(() => undefined);

  // Best-effort: emit a synthetic event keyed to the root so an Agent
  // View subscriber can refresh without polling.
  // (kept silent — the per-job stream remains the canonical channel)
  void jobId;
}

/**
 * Walk from a just-terminated task up toward the root, flipping each
 * ancestor whose children are all in terminal states. Ancestor status:
 *   - failed     — any child failed
 *   - cancelled  — every child cancelled (no failures, no successes)
 *   - succeeded  — otherwise
 *
 * Idempotent: stops at the first ancestor whose children are still in
 * non-terminal states, and at the root (no parent_task_id).
 */
function rollupTerminalStatus(fromTaskId: string): void {
  let cur = getTask(fromTaskId);
  while (cur && cur.parent_task_id) {
    const parent = getTask(cur.parent_task_id);
    if (!parent) return;
    const siblings = listChildren(parent.client_slug, parent.id);
    const allTerminal = siblings.every((s) =>
      s.status === "succeeded" ||
      s.status === "failed" ||
      s.status === "cancelled",
    );
    if (!allTerminal) return;
    const anyFailed = siblings.some((s) => s.status === "failed");
    const anySucceeded = siblings.some((s) => s.status === "succeeded");
    const anyNonSkippedCancelled = siblings.some(
      (s) => s.status === "cancelled" && !s.result_summary?.startsWith("skipped:"),
    );
    const next = anyFailed
      ? "failed"
      : anyNonSkippedCancelled
        ? "cancelled"
      : anySucceeded
        ? "succeeded"
        : "cancelled";
    if (parent.status !== next) updateTaskStatus(parent.id, next);
    cur = parent;
  }
  // Also flip the root itself when it has no parent but all its direct
  // children are terminal. The loop above only handles ancestors; the
  // root task whose children all just finished needs an explicit pass.
  const root = findRoot(fromTaskId);
  if (!root || root.parent_task_id) return;
  const rootChildren = listChildren(root.client_slug, root.id);
  if (rootChildren.length === 0) return;
  const allTerminal = rootChildren.every((s) =>
    s.status === "succeeded" ||
    s.status === "failed" ||
    s.status === "cancelled",
  );
  if (!allTerminal) return;
  const anyFailed = rootChildren.some((s) => s.status === "failed");
  const anySucceeded = rootChildren.some((s) => s.status === "succeeded");
  const anyNonSkippedCancelled = rootChildren.some(
    (s) => s.status === "cancelled" && !s.result_summary?.startsWith("skipped:"),
  );
  const next = anyFailed
    ? "failed"
    : anyNonSkippedCancelled
      ? "cancelled"
    : anySucceeded
      ? "succeeded"
      : "cancelled";
  if (root.kind === "sweep") {
    updateTaskStatus(root.id, "running", {
      result_summary: "reviewing: final brain readiness gate",
    });
    void finalizeTerminalSweep(root, rootChildren, next).catch(() => undefined);
  } else if (root.status !== next) {
    updateTaskStatus(root.id, next);
  }
}

async function finalizeTerminalSweep(
  root: Task,
  rootChildren: Task[],
  terminalStatus: Task["status"],
): Promise<void> {
  if (root.kind !== "sweep") return;
  const existing = sweepFinalizersByRoot.get(root.id);
  if (existing) return existing;

  const promise = doFinalizeTerminalSweep(root, rootChildren, terminalStatus).finally(
    () => {
      sweepFinalizersByRoot.delete(root.id);
    },
  );
  sweepFinalizersByRoot.set(root.id, promise);
  return promise;
}

async function doFinalizeTerminalSweep(
  root: Task,
  rootChildren: Task[],
  terminalStatus: Task["status"],
): Promise<void> {
  const succeeded = rootChildren.filter((c) => c.status === "succeeded").length;
  const failed = rootChildren.filter((c) => c.status === "failed").length;
  const skipped = rootChildren.filter(
    (c) =>
      c.status === "cancelled" &&
      typeof c.result_summary === "string" &&
      c.result_summary.startsWith("skipped:"),
  ).length;
  const cancelled = rootChildren.filter(
    (c) => c.status === "cancelled" && !c.result_summary?.startsWith("skipped:"),
  ).length;

  const verdict =
    terminalStatus === "succeeded" && skipped === 0
      ? "**Specialists finished.** Running the Deep Brain review."
      : terminalStatus === "succeeded"
        ? "**Specialists finished — partial.** Running the Deep Brain review."
        : terminalStatus === "failed"
          ? "**Sweep finished with failures.**"
          : "**Sweep cancelled.**";

  const parts: string[] = [
    `${succeeded} succeeded`,
    ...(failed > 0 ? [`${failed} failed`] : []),
    ...(skipped > 0 ? [`${skipped} skipped`] : []),
    ...(cancelled > 0 ? [`${cancelled} cancelled`] : []),
  ];

  const body = [
    `${verdict} ${parts.join(" · ")} of ${rootChildren.length}.`,
    "",
    `Open the [Vault](/office?client=${encodeURIComponent(
      root.client_slug,
    )}#vault) to read the full brain.`,
  ].join("\n");

  await narrateToChat(root.client_slug, body, { id: `final:${root.id}` }).catch(
    () => undefined,
  );
  await finalizeAndReleaseSweep(root);
}

async function finalizeAndReleaseSweep(root: Task): Promise<void> {
  try {
    const readiness = await finalizeBrainSweep(root.client_slug, root.id);
    if (readiness) {
      updateTaskStatus(root.id, readiness.status === "partial_brain" ? "failed" : "succeeded", {
        result_summary: `final review complete: ${readiness.status} ${readiness.score}/100`,
      });
      await mirrorTaskTreeToVault(root.id).catch(() => undefined);
      await narrateToChat(
        root.client_slug,
        renderReadinessChatSummary(readiness),
        { id: `final-ready:${root.id}` },
      ).catch(() => undefined);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateTaskStatus(root.id, "failed", {
      result_summary: `finalization failed: ${message}`,
    });
    await narrateToChat(
      root.client_slug,
      `✗ **Deep Brain readiness is blocked.** ${message}`,
      { id: `final-ready:${root.id}` },
    ).catch(() => undefined);
    await mirrorTaskTreeToVault(root.id).catch(() => undefined);
  } finally {
    releaseSweepLock(
      root.client_slug,
      root.template_id ?? root.kind ?? "sweep",
      root.request_id,
    );
  }
}

function findRoot(taskId: string): Task | null {
  let cur = getTask(taskId);
  if (!cur) return null;
  while (cur.parent_task_id) {
    const parent = getTask(cur.parent_task_id);
    if (!parent) return cur;
    cur = parent;
  }
  return cur;
}

function isInTree(targetId: string, rootId: string): boolean {
  let cur = getTask(targetId);
  while (cur) {
    if (cur.id === rootId) return true;
    if (!cur.parent_task_id) return false;
    cur = getTask(cur.parent_task_id);
  }
  return false;
}

function areAllDepsSatisfied(task: Task, subtree: Task[]): boolean {
  if (task.blocked_on.length === 0) return true;
  const byId = new Map(subtree.map((t) => [t.id, t]));
  return task.blocked_on.every((depId) => {
    const dep = byId.get(depId);
    // Missing dep = treat as satisfied so a broken edge doesn't deadlock.
    if (!dep) return true;
    return isSatisfiedDependency(dep);
  });
}

function isSatisfiedDependency(task: Task): boolean {
  if (task.status === "succeeded") return true;
  if (task.status === "cancelled" && task.result_summary?.startsWith("skipped:")) {
    return true;
  }
  return false;
}

function resetFailedTasksForRetry(rootTaskId: string): Set<string> {
  const subtree = loadSubtree(rootTaskId);
  const retryIds = new Set(
    subtree
      .filter(
        (t) =>
          Boolean(t.specialist_id) &&
          (t.status === "failed" ||
            (t.status === "cancelled" &&
              t.result_summary?.startsWith("blocked:"))),
      )
      .map((t) => t.id),
  );
  if (retryIds.size === 0) return retryIds;

  const root = subtree[0];
  if (
    root &&
    (root.status === "succeeded" ||
      root.status === "failed" ||
      root.status === "cancelled")
  ) {
    resetTaskForRetry(root.id, "planned");
  }

  for (const task of subtree) {
    if (!retryIds.has(task.id)) continue;
    const waitsOnRetriedTask = task.blocked_on.some((id) => retryIds.has(id));
    resetTaskForRetry(task.id, waitsOnRetriedTask ? "blocked" : "planned");
  }
  return retryIds;
}

function cancelDependentsBlockedByFailure(rootTaskId: string): void {
  let changed = true;
  while (changed) {
    changed = false;
    const subtree = loadSubtree(rootTaskId);
    const terminalBlockers = new Set(
      subtree
        .filter(
          (t) =>
            t.status === "failed" ||
            (t.status === "cancelled" &&
              !t.result_summary?.startsWith("skipped:")),
        )
        .map((t) => t.id),
    );
    if (terminalBlockers.size === 0) return;
    for (const task of subtree) {
      if (task.status !== "blocked" && task.status !== "planned") continue;
      const failedDeps = task.blocked_on.filter((id) => terminalBlockers.has(id));
      if (failedDeps.length === 0) continue;
      updateTaskStatus(task.id, "cancelled", {
        result_summary: `blocked: dependency ${failedDeps
          .map((id) => id.slice(0, 8))
          .join(", ")} failed`,
      });
      changed = true;
    }
  }
}

/** Helper for tests / future callers — kept here so the runner shape stays
 *  in one file. Currently unused; export anyway. */
export function newRequestId(): string {
  return `runner-${randomUUID()}`;
}
