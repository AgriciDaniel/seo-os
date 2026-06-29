/**
 * Job recovery on server boot.
 *
 * `pnpm dev` cycles, deploys, and crashes all happen — but jobs that were
 * `status='running'` when the previous process died will sit in SQLite
 * forever unless someone sweeps them. The Specialist Inbox would then
 * show ghost assignments stuck at "running" until manually cleaned.
 *
 * This module runs once per process (called from `getDb()`'s singleton
 * initialiser) and transitions any orphaned `running` jobs older than
 * the recovery threshold into `failed` with a clear message. Any linked
 * Assignment row is updated at the same time so the UI reflects reality.
 *
 * Per-client semantics: the SQL sweep itself doesn't filter by client
 * (one transaction touches all stale rows — cheaper than N round-trips
 * for N clients). Event emission DOES carry the owning slug so per-client
 * subscribers only see their own clients' resolutions; we never broadcast
 * client A's recovery to client B's listeners.
 */
import "server-only";

import { getDb } from "@/lib/brain/index-db";
import { emit, emitClientEvent } from "./events";

/** Anything older than this stays "running" — covers freshly-restarted
 *  long jobs. 10 minutes is generous; tune if real workloads exceed it. */
const RECOVERY_THRESHOLD_MINUTES = 10;

const ORPHAN_MESSAGE = "orphaned by restart";

interface OrphanRow {
  id: string;
  client_slug: string;
  specialist: string;
}

interface AssignmentForJobRow {
  id: string;
}

/**
 * Sweep stuck `running` jobs older than the threshold. Updates both the
 * `jobs` row AND any linked `assignments` row. Emits SSE events keyed
 * by the owning client so reconnected per-slug streams see their own
 * resolutions and nothing else. Safe to call multiple times — only rows
 * in the bad state are touched.
 */
export function runJobRecovery(): { swept: number; perClient: Record<string, number> } {
  // Avoid require-cycle: import the DB but not the assignment module —
  // we update assignments via inline SQL since this runs at module load.
  const db = getDb();

  const orphans = db
    .prepare(
      `SELECT id, client_slug, specialist
       FROM jobs
       WHERE status = 'running'
         AND (
           started_at IS NULL
           OR started_at < datetime('now', '-${RECOVERY_THRESHOLD_MINUTES} minutes')
         )`,
    )
    .all() as OrphanRow[];

  if (orphans.length === 0) return { swept: 0, perClient: {} };

  const updateJob = db.prepare(
    `UPDATE jobs
     SET status = 'failed', finished_at = datetime('now'), message = ?
     WHERE id = ? AND status = 'running'`,
  );

  const findAssignment = db.prepare(
    `SELECT id FROM assignments WHERE job_id = ? AND status IN ('queued','running','blocked')`,
  );

  const updateAssignment = db.prepare(
    `UPDATE assignments
     SET status = 'failed', message = ?, updated_at = datetime('now')
     WHERE id = ?`,
  );

  const updateLinkedTask = (() => {
    try {
      return db.prepare(
        `UPDATE tasks
         SET status = 'failed',
             result_summary = ?,
             updated_at = datetime('now')
         WHERE assignment_id = ?
           AND status IN ('queued','running','planned','blocked')`,
      );
    } catch {
      // Pre-orchestration vaults may not have a tasks table yet.
      return null;
    }
  })();

  // Single transaction = atomic sweep. Either all orphans flip or none do.
  const sweep = db.transaction(() => {
    for (const o of orphans) {
      updateJob.run(ORPHAN_MESSAGE, o.id);
      const linked = findAssignment.get(o.id) as AssignmentForJobRow | undefined;
      if (linked) {
        updateAssignment.run(ORPHAN_MESSAGE, linked.id);
        updateLinkedTask?.run(`failed: ${ORPHAN_MESSAGE}`, linked.id);
      }
    }
  });
  sweep();

  // Best-effort SSE notifications — keyed by owning slug so client-scoped
  // subscribers only see their own jobs resolve. Errors from the event
  // bus are swallowed: recovery succeeded even if no listener heard about it.
  const perClient: Record<string, number> = {};
  for (const o of orphans) {
    perClient[o.client_slug] = (perClient[o.client_slug] ?? 0) + 1;
    try {
      emit(o.client_slug, o.id, "error", ORPHAN_MESSAGE);
      emit(o.client_slug, o.id, "done", `failed: ${ORPHAN_MESSAGE}`);
      emitClientEvent(o.client_slug, "job_failed", o.id, o.specialist);
    } catch {
      /* no listeners — fine */
    }
  }

  return { swept: orphans.length, perClient };
}
