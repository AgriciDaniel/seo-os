/**
 * Orchestration v2 — the typed Assignment envelope.
 *
 * An Assignment is the canonical record of an Orchestrator → Specialist
 * dispatch. It replaces the v0.1.7-era `[PROPOSED ACTION: run-<id>]` text
 * shim with a schema-validated SQLite row plus a marketing-brain.v1
 * compliant vault mirror.
 *
 * Lifecycle:
 *   1. Orchestrator (in Pillar 3) invokes the `assign_task` LLM tool. The
 *      route handler validates the tool arguments here and calls
 *      `createAssignment()`. Mode "plan" lands as `proposed`; everything
 *      else as `queued`.
 *   2. The job queue (Pillar 3) sets `linkJob()` when it picks the row up,
 *      transitions through `running`, and ultimately `succeeded` / `failed`.
 *   3. The Specialist Inbox UI (Pillar 6) reads via `listForSpecialist()`.
 *
 * Persistence:
 *   - SQLite table `assignments` (see `src/lib/brain/index-db.ts` migrate()).
 *     Source of truth for the UI inbox query.
 *   - Vault mirror: `wiki/specialists/<id>/hot.md` overwritten in place +
 *     `wiki/log.md` append-only via the existing audit-trail helpers. This
 *     keeps the vault self-describing for users browsing markdown directly,
 *     and the SQLite reindex picks the hot file up like any other note.
 */
import "server-only";

import fsp from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb, reindexClient } from "@/lib/brain/index-db";
import { appendLogEntry } from "@/lib/orchestrator/audit-trail";
import { ensureManifestMigrated, manifestPath } from "@/lib/brain/paths";
import { specialistHotRelative } from "@/lib/brain/paths";
import { writeNote } from "@/lib/brain/vault-fs";
import { ClientManifest, type Frontmatter } from "@/lib/brain/types";
import { SPECIALISTS } from "@/lib/specialists/catalog";

/* -------------------------------------------------------------------------- */
/* schemas                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Permission modes mirror Claude Code CLI's safety levels but split the
 * Orchestrator gate from the Specialist gate so each can fail-closed
 * independently. See `src/lib/orchestrator/permissions.ts` (Pillar 4) for
 * the runtime checks; this enum is just the persisted field.
 */
export const PermissionModeZ = z.enum(["plan", "read_only", "auto", "full_access"]);
export type PermissionMode = z.infer<typeof PermissionModeZ>;

/**
 * Assignment status machine:
 *   proposed → queued → running → (succeeded | failed | cancelled)
 *                      ↓
 *                    blocked  (needs human approval mid-run)
 */
export const AssignmentStatusZ = z.enum([
  "proposed",
  "queued",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);
export type AssignmentStatus = z.infer<typeof AssignmentStatusZ>;

const TERMINAL_STATUSES = new Set<AssignmentStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

/**
 * The catalog is the documentary source of truth for specialist IDs today.
 * Pillar 3 will collapse the runtime registry + catalog into one module; for
 * now we accept any catalog id at validation time. `refine()` over a literal
 * enum lets us add specialists without re-typing the schema.
 */
const CATALOG_IDS: ReadonlySet<string> = new Set(SPECIALISTS.map((s) => s.id));

export const SpecialistIdZ = z
  .string()
  .min(1)
  .refine((id) => CATALOG_IDS.has(id), {
    message: "unknown specialist_id (not in catalog)",
  });

/**
 * Input shape for `createAssignment()`. `request_id` is the idempotency key
 * — call sites pass a stable UUID per logical request so retries collapse
 * into the same row.
 */
export const CreateAssignmentInputZ = z.object({
  client_slug: z.string().min(1),
  specialist_id: SpecialistIdZ,
  parent_message_id: z.string().nullable().default(null),
  title: z.string().min(1).max(120),
  brief: z.string().min(1).max(4000),
  payload: z.record(z.string(), z.unknown()).default({}),
  permission_mode: PermissionModeZ,
  request_id: z.string().min(1),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInputZ>;

/**
 * The public domain object. `payload` is parsed from JSON on read.
 */
export interface Assignment {
  id: string;
  client_slug: string;
  specialist_id: string;
  parent_message_id: string | null;
  title: string;
  brief: string;
  payload: Record<string, unknown>;
  permission_mode: PermissionMode;
  status: AssignmentStatus;
  request_id: string;
  job_id: string | null;
  message: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Raw row shape from SQLite. */
interface AssignmentRow {
  id: string;
  client_slug: string;
  specialist_id: string;
  parent_message_id: string | null;
  title: string;
  brief: string;
  payload_json: string;
  permission_mode: PermissionMode;
  status: AssignmentStatus;
  request_id: string;
  job_id: string | null;
  message: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  skip_reason: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAssignment(row: AssignmentRow): Assignment {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    client_slug: row.client_slug,
    specialist_id: row.specialist_id,
    parent_message_id: row.parent_message_id,
    title: row.title,
    brief: row.brief,
    payload,
    permission_mode: row.permission_mode,
    status: row.status,
    request_id: row.request_id,
    job_id: row.job_id,
    message: row.message,
    started_at: row.started_at,
    completed_at: row.completed_at,
    failed_at: row.failed_at,
    skip_reason: row.skip_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* DB ops                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Insert a new Assignment, or return the existing row if the
 * (client_slug, request_id) pair was used before. This is how idempotency
 * works — the caller passes a stable request_id and never enqueues twice.
 *
 * Status defaults: "plan" mode lands as `proposed` (awaiting human approval);
 * every other mode lands as `queued` and a separate caller (the job queue
 * in Pillar 3) will pick it up.
 */
export function createAssignment(input: CreateAssignmentInput): Assignment {
  const parsed = CreateAssignmentInputZ.parse(input);
  const status: AssignmentStatus =
    parsed.permission_mode === "plan" ? "proposed" : "queued";
  const id = randomUUID();
  const payloadJson = JSON.stringify(parsed.payload);

  const db = getDb();
  // The UNIQUE (client_slug, request_id) index gives us idempotency:
  // ON CONFLICT DO NOTHING returns no row, then we SELECT the existing one.
  db.prepare(
    `INSERT INTO assignments (
       id, client_slug, specialist_id, parent_message_id, title, brief,
       payload_json, permission_mode, status, request_id
     )
     VALUES (
       @id, @client_slug, @specialist_id, @parent_message_id, @title, @brief,
       @payload_json, @permission_mode, @status, @request_id
     )
     ON CONFLICT(client_slug, request_id) DO NOTHING`,
  ).run({
    id,
    client_slug: parsed.client_slug,
    specialist_id: parsed.specialist_id,
    parent_message_id: parsed.parent_message_id,
    title: parsed.title,
    brief: parsed.brief,
    payload_json: payloadJson,
    permission_mode: parsed.permission_mode,
    status,
    request_id: parsed.request_id,
  });

  const row = db
    .prepare(
      `SELECT * FROM assignments
       WHERE client_slug = ? AND request_id = ?`,
    )
    .get(parsed.client_slug, parsed.request_id) as AssignmentRow | undefined;

  if (!row) {
    // Should be impossible — the INSERT/SELECT pair is one transaction in
    // SQLite's WAL mode. Loud throw beats silent null.
    throw new Error(
      `assignments: insert-or-select returned no row for ${parsed.request_id}`,
    );
  }
  return rowToAssignment(row);
}

/** Get a single assignment by id. */
export function getAssignment(id: string): Assignment | null {
  const row = getDb()
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(id) as AssignmentRow | undefined;
  return row ? rowToAssignment(row) : null;
}

export function getAssignmentByJobId(jobId: string): Assignment | null {
  const row = getDb()
    .prepare("SELECT * FROM assignments WHERE job_id = ?")
    .get(jobId) as AssignmentRow | undefined;
  return row ? rowToAssignment(row) : null;
}

/** Inbox query — newest first, optionally filtered by status. */
export function listForSpecialist(
  clientSlug: string,
  specialistId: string,
  options: { statuses?: AssignmentStatus[]; limit?: number } = {},
): Assignment[] {
  const limit = options.limit ?? 50;
  const statuses = options.statuses;

  let rows: AssignmentRow[];
  if (statuses && statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(",");
    rows = getDb()
      .prepare(
        `SELECT * FROM assignments
         WHERE client_slug = ? AND specialist_id = ?
           AND status IN (${placeholders})
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(clientSlug, specialistId, ...statuses, limit) as AssignmentRow[];
  } else {
    rows = getDb()
      .prepare(
        `SELECT * FROM assignments
         WHERE client_slug = ? AND specialist_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(clientSlug, specialistId, limit) as AssignmentRow[];
  }
  return rows.map(rowToAssignment);
}

/**
 * Count of assignments waiting on the user (proposed) or blocked mid-run.
 * Drives the "unread badge" on the 3D specialist desk (Pillar 6).
 */
export function pendingCountsByClient(clientSlug: string): Record<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT specialist_id, COUNT(*) AS n
       FROM assignments
       WHERE client_slug = ? AND status IN ('proposed','blocked')
       GROUP BY specialist_id`,
    )
    .all(clientSlug) as Array<{ specialist_id: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.specialist_id] = r.n;
  return out;
}

/** Status transition. Updates lifecycle fields and mirrors the latest state. */
export function updateStatus(
  id: string,
  status: AssignmentStatus,
  message?: string | null,
): Assignment | null {
  const db = getDb();
  const current = getAssignment(id);
  if (!current) return null;
  const skipReason = skipReasonFromStatus(status, message ?? null);
  db.prepare(
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
     WHERE id = ? AND client_slug = ?`,
  ).run(
    status,
    message ?? null,
    status,
    status,
    status,
    status,
    skipReason,
    skipReason,
    id,
    current.client_slug,
  );
  const assignment = getAssignment(id);
  if (assignment) queueMirrorAssignmentToVault(assignment);
  return assignment;
}

/** Link an Assignment to the job that will execute (or has executed) it. */
export function linkJob(assignmentId: string, jobId: string): Assignment | null {
  getDb()
    .prepare(
      `UPDATE assignments
       SET job_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(jobId, assignmentId);
  return getAssignment(assignmentId);
}

export function queueMirrorAssignmentToVault(assignment: Assignment): void {
  void mirrorAssignmentToVault(assignment, { appendLog: false }).catch(() => undefined);
}

/* -------------------------------------------------------------------------- */
/* vault mirror                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Write the marketing-brain.v1 mirror for an Assignment:
 *   1. Overwrite `wiki/specialists/<id>/hot.md` with the latest state
 *      (CLAUDE.md rule #4 — hot.md is always overwritten in place).
 *   2. Append a one-line entry to `wiki/log.md` (rule #4 — log is
 *      append-only, newest at the top).
 *
 * Idempotent on retry: hot.md is the latest assignment, so re-writing is fine;
 * the log entry includes a UUID so future-us can de-dupe if we ever want to.
 */
export async function mirrorAssignmentToVault(
  assignment: Assignment,
  options: { appendLog?: boolean } = {},
): Promise<void> {
  const appendLog = options.appendLog ?? true;
  const today = new Date().toISOString().slice(0, 10);
  const owner = await readOwnerFromManifest(assignment.client_slug);

  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: "decision",
    title: `Assignment: ${assignment.title}`,
    created: today,
    updated: today,
    tags: [
      "assignment",
      `specialist:${assignment.specialist_id}`,
      `permission:${assignment.permission_mode}`,
      `status:${assignment.status}`,
    ],
    status: TERMINAL_STATUSES.has(assignment.status) ? "accepted" : "active",
    owner,
    confidence: "medium",
    approval_status:
      assignment.permission_mode === "plan" && assignment.status === "proposed"
        ? "needs-review"
        : "approved",
    risk_level: "low",
    // CLAUDE.md rule #3 enforcement — every brain note carries a rollback note.
    rollback_note:
      "Cancel via the Specialist Inbox or DELETE /api/assignments/<id>. " +
      "Job-driven side-effects (vault writes, API calls) are tracked under " +
      "the linked job_id; rolling back means cancelling the job and " +
      "reverting any markdown writes by hand from git history.",
  };

  const body = renderAssignmentBody(assignment);

  await writeNote(
    assignment.client_slug,
    specialistHotRelative(assignment.specialist_id),
    { frontmatter, body },
  );
  await reindexClient(assignment.client_slug).catch(() => undefined);

  if (!appendLog) return;

  await appendLogEntry(assignment.client_slug, {
    title: `assign ${assignment.specialist_id} · ${assignment.title}`,
    body: [
      `**Assignment**: \`${assignment.id}\``,
      `**Specialist**: \`${assignment.specialist_id}\``,
      `**Permission mode**: \`${assignment.permission_mode}\``,
      `**Status**: \`${assignment.status}\``,
      assignment.job_id ? `**Job**: \`${assignment.job_id}\`` : null,
      "",
      assignment.brief,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  });
}

function renderAssignmentBody(a: Assignment): string {
  const lines: string[] = [];
  const terminalStatus = assignmentTerminalStatus(a);
  const artifactPath = a.job_id ? artifactPathForJob(a.job_id) : null;

  lines.push(`# ${a.title}`, "");
  lines.push(`**Specialist**: \`${a.specialist_id}\``);
  lines.push(`**Status**: \`${a.status}\``);
  if (terminalStatus) lines.push(`**Terminal status**: \`${terminalStatus}\``);
  lines.push(`**Permission mode**: \`${a.permission_mode}\``);
  lines.push(`**Assignment ID**: \`${a.id}\``);
  lines.push(`**Request ID**: \`${a.request_id}\``);
  if (a.job_id) lines.push(`**Job ID**: \`${a.job_id}\``);
  if (artifactPath) lines.push(`**Artifact path**: \`${artifactPath}\``);
  if (a.message) lines.push(`**Last message**: ${a.message}`);
  if (a.started_at) lines.push(`**Started at**: \`${a.started_at}\``);
  if (a.completed_at) lines.push(`**Completed at**: \`${a.completed_at}\``);
  if (a.failed_at) lines.push(`**Failed at**: \`${a.failed_at}\``);
  if (a.skip_reason) lines.push(`**Skip reason**: ${a.skip_reason}`);
  lines.push(`**Created**: \`${a.created_at}\``);
  lines.push(`**Updated**: \`${a.updated_at}\``);
  lines.push("", "## Brief", "", a.brief.trim());
  lines.push("", "## Payload", "", "```json", JSON.stringify(a.payload, null, 2), "```");
  lines.push(
    "",
    "## Notes",
    "",
    "- This file is **overwritten in place** every time a newer Assignment is dispatched to this specialist.",
    "- For the full history of assignments at the client level, see [`log.md`](../../log.md).",
  );
  return lines.join("\n");
}

function skipReasonFromStatus(
  status: AssignmentStatus,
  message: string | null,
): string | null {
  if (status !== "cancelled" || !message?.startsWith("skipped:")) return null;
  return message.replace(/^skipped:\s*/i, "").trim() || message;
}

function assignmentTerminalStatus(a: Assignment): "succeeded" | "failed" | "skipped" | "cancelled" | null {
  if (a.status === "succeeded" || a.status === "failed") return a.status;
  if (a.status === "cancelled") {
    return a.message?.startsWith("skipped:") ? "skipped" : "cancelled";
  }
  return null;
}

function artifactPathForJob(jobId: string): string | null {
  const row = getDb()
    .prepare("SELECT result_path FROM jobs WHERE id = ?")
    .get(jobId) as { result_path: string | null } | undefined;
  return row?.result_path ?? null;
}

async function readOwnerFromManifest(clientSlug: string): Promise<string> {
  try {
    // Migrate legacy <vault>/.manifest.json → <vault>/.raw/.manifest.json
    // before the first read. Idempotent.
    ensureManifestMigrated(clientSlug);
    const raw = await fsp.readFile(manifestPath(clientSlug), "utf8");
    const parsed = ClientManifest.parse(JSON.parse(raw));
    return parsed.manifest_owner;
  } catch {
    // Vault may not be initialised yet (new clients); fall back to a
    // recognisable sentinel rather than failing the assignment write.
    return "orchestrator";
  }
}
