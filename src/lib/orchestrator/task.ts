/**
 * Tasks primitive — multi-step, multi-session, dependency-aware.
 *
 * Mirrors the Claude Code v2.1.139 "Tasks" upgrade: a Task is a goal
 * decomposed into ordered steps with explicit `blocked_on` edges. The
 * orchestrator plans the tree; the runner walks it. Tasks survive
 * process restarts (SQLite-backed) and inherit by-default through
 * sub-agent spawns (via `parent_task_id`).
 *
 * Relation to the rest of the layer:
 *
 *   Task           — the user's goal + plan tree. NEW.
 *   ├── Task       — a child step.
 *   │   └── Assignment — when ready to execute, a Task creates one.
 *   │       └── Job   — the actual SQLite row tracking the run.
 *   └── ...
 *
 * One Task → at most one Assignment → at most one Job. Parent Tasks
 * are pure planning nodes and never hold an Assignment themselves.
 *
 * Status machine:
 *
 *   planned  → blocked (still has unfinished `blocked_on` edges)
 *            → queued  (dispatched, Assignment created)
 *            → running (Assignment → Job picked up)
 *            → succeeded | failed | cancelled
 *
 * A parent Task's status is *derived* from its children at read time
 * (so we don't have to keep parents in sync on every child write).
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb, reindexClient } from "@/lib/brain/index-db";
import { appendLogEntry } from "@/lib/orchestrator/audit-trail";
import { wikiPath } from "@/lib/brain/paths";
import { writeNote } from "@/lib/brain/vault-fs";
import type { Frontmatter } from "@/lib/brain/types";
import {
  PermissionModeZ,
  SpecialistIdZ,
  type PermissionMode,
} from "./assignment";

/* -------------------------------------------------------------------------- */
/* schema                                                                      */
/* -------------------------------------------------------------------------- */

export const TaskStatusZ = z.enum([
  "planned",
  "blocked",
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusZ>;

/**
 * Input shape for `createTask()`. Mirrors Claude Code's Task primitive:
 * goal-bearing, optionally parented, with explicit dependency edges.
 */
export const CreateTaskInputZ = z.object({
  client_slug: z.string().min(1),
  parent_task_id: z.string().nullable().default(null),
  parent_message_id: z.string().nullable().default(null),
  title: z.string().min(1).max(160),
  goal: z.string().min(1).max(4000),
  /** Optional specialist this leaf-Task will eventually dispatch. Required
   *  when the Task is meant to run a specialist; null for pure planning
   *  parent nodes that exist only to group children. */
  specialist_id: SpecialistIdZ.nullable().default(null),
  payload: z.record(z.string(), z.unknown()).default({}),
  /** IDs of sibling Tasks that must reach a terminal status before this
   *  Task is eligible for dispatch. Empty = no blockers, run immediately. */
  blocked_on: z.array(z.string()).default([]),
  permission_mode: PermissionModeZ,
  request_id: z.string().min(1),
  /** Optional classification — currently only `"sweep"` is used (root Tasks
   *  of an auto-orchestration sweep like "build the brain"). NULL on every
   *  other Task. Lets the UI detect a sweep root for the SweepCard. */
  kind: z.string().nullable().default(null),
  /** Optional template id this Task was instantiated from (e.g. `"build-brain"`).
   *  Mirrors the `task-templates.ts` registry id. NULL when the tree was
   *  built inline from `children` instead of a canned template. */
  template_id: z.string().nullable().default(null),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInputZ>;

export interface Task {
  id: string;
  client_slug: string;
  parent_task_id: string | null;
  parent_message_id: string | null;
  title: string;
  goal: string;
  specialist_id: string | null;
  payload: Record<string, unknown>;
  blocked_on: string[];
  permission_mode: PermissionMode;
  status: TaskStatus;
  request_id: string;
  assignment_id: string | null;
  result_summary: string | null;
  result_path: string | null;
  /** Wiki-relative path of the polished HTML report (Phase 2). Null when
   *  the specialist hasn't emitted a report yet. */
  result_report_path: string | null;
  /** Wiki-relative path of the structured `.data.json` sidecar (Phase 2). */
  result_data_path: string | null;
  /** Classification — `"sweep"` for sweep roots, NULL otherwise. */
  kind: string | null;
  /** Template id this Task was instantiated from, NULL when inline. */
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  client_slug: string;
  parent_task_id: string | null;
  parent_message_id: string | null;
  title: string;
  goal: string;
  specialist_id: string | null;
  payload_json: string;
  blocked_on_json: string;
  permission_mode: PermissionMode;
  status: TaskStatus;
  request_id: string;
  assignment_id: string | null;
  result_summary: string | null;
  result_path: string | null;
  result_report_path: string | null;
  result_data_path: string | null;
  kind: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTask(row: TaskRow): Task {
  let payload: Record<string, unknown> = {};
  let blockedOn: string[] = [];
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  try {
    blockedOn = JSON.parse(row.blocked_on_json) as string[];
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    client_slug: row.client_slug,
    parent_task_id: row.parent_task_id,
    parent_message_id: row.parent_message_id,
    title: row.title,
    goal: row.goal,
    specialist_id: row.specialist_id,
    payload,
    blocked_on: blockedOn,
    permission_mode: row.permission_mode,
    status: row.status,
    request_id: row.request_id,
    assignment_id: row.assignment_id,
    result_summary: row.result_summary,
    result_path: row.result_path,
    result_report_path: row.result_report_path,
    result_data_path: row.result_data_path,
    kind: row.kind,
    template_id: row.template_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* DB schema bootstrap                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Called lazily on first DB access. Idempotent. Keeps the Tasks schema
 * close to its callers rather than in `index-db.ts` so the orchestration
 * layer is self-contained.
 */
function ensureTasksTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                 TEXT PRIMARY KEY,
      client_slug        TEXT NOT NULL,
      parent_task_id     TEXT,
      parent_message_id  TEXT,
      title              TEXT NOT NULL,
      goal               TEXT NOT NULL,
      specialist_id      TEXT,
      payload_json       TEXT NOT NULL DEFAULT '{}',
      blocked_on_json    TEXT NOT NULL DEFAULT '[]',
      permission_mode    TEXT NOT NULL CHECK (permission_mode IN ('plan','read_only','auto','full_access')),
      status             TEXT NOT NULL CHECK (status IN ('planned','blocked','queued','running','succeeded','failed','cancelled')),
      request_id         TEXT NOT NULL,
      assignment_id      TEXT,
      result_summary     TEXT,
      result_path        TEXT,
      result_report_path TEXT,
      result_data_path   TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_slug) REFERENCES clients(slug) ON DELETE CASCADE,
      FOREIGN KEY (parent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_request_id
      ON tasks(client_slug, request_id);

    CREATE INDEX IF NOT EXISTS idx_tasks_parent
      ON tasks(client_slug, parent_task_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_tasks_status
      ON tasks(client_slug, status);
  `);

  // Idempotent column adds for existing user vaults that pre-date the
  // Phase-2 report+data sidecar columns. SQLite has no `ADD COLUMN IF NOT
  // EXISTS`, so we feature-detect via PRAGMA table_info.
  const cols = db
    .prepare(`PRAGMA table_info(tasks)`)
    .all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("result_report_path")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN result_report_path TEXT`);
  }
  if (!have.has("result_data_path")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN result_data_path TEXT`);
  }
  if (!have.has("kind")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN kind TEXT`);
  }
  if (!have.has("template_id")) {
    db.exec(`ALTER TABLE tasks ADD COLUMN template_id TEXT`);
  }
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Insert a Task. Idempotent on `(client_slug, request_id)` — repeat calls
 * (e.g. an Orchestrator retry mid-plan) collapse onto the existing row.
 * Initial status is derived: empty `blocked_on` → `planned` (ready to
 * dispatch); non-empty → `blocked`.
 */
export function createTask(input: CreateTaskInput): Task {
  ensureTasksTable();
  const parsed = CreateTaskInputZ.parse(input);
  const status: TaskStatus = parsed.blocked_on.length === 0 ? "planned" : "blocked";
  const id = randomUUID();
  const db = getDb();
  db.prepare(
    `INSERT INTO tasks (
       id, client_slug, parent_task_id, parent_message_id, title, goal,
       specialist_id, payload_json, blocked_on_json, permission_mode,
       status, request_id, kind, template_id
     )
     VALUES (
       @id, @client_slug, @parent_task_id, @parent_message_id, @title, @goal,
       @specialist_id, @payload_json, @blocked_on_json, @permission_mode,
       @status, @request_id, @kind, @template_id
     )
     ON CONFLICT(client_slug, request_id) DO NOTHING`,
  ).run({
    id,
    client_slug: parsed.client_slug,
    parent_task_id: parsed.parent_task_id,
    parent_message_id: parsed.parent_message_id,
    title: parsed.title,
    goal: parsed.goal,
    specialist_id: parsed.specialist_id,
    payload_json: JSON.stringify(parsed.payload),
    blocked_on_json: JSON.stringify(parsed.blocked_on),
    permission_mode: parsed.permission_mode,
    status,
    request_id: parsed.request_id,
    kind: parsed.kind,
    template_id: parsed.template_id,
  });
  const row = db
    .prepare(`SELECT * FROM tasks WHERE client_slug = ? AND request_id = ?`)
    .get(parsed.client_slug, parsed.request_id) as TaskRow | undefined;
  if (!row) {
    throw new Error(`tasks: insert-or-select returned no row for ${parsed.request_id}`);
  }
  return rowToTask(row);
}

/**
 * Create a parent Task plus N child Tasks in a single transaction. Used by
 * the orchestrator's `plan_tree` dispatch path: the model picks a template
 * (or supplies inline children) and the chat route turns the spec into a
 * runnable tree.
 *
 * `children[i].blocked_on_indices` is resolved to the child IDs at insert
 * time so callers don't need to know the IDs in advance.
 */
export interface CreateTaskTreeChildInput {
  title: string;
  goal: string;
  specialist_id: string | null;
  payload?: Record<string, unknown>;
  /** Index references back into `children[]`. */
  blocked_on_indices?: number[];
}

export interface CreateTaskTreeInput {
  client_slug: string;
  parent_message_id?: string | null;
  rootTitle: string;
  rootGoal: string;
  permission_mode: PermissionMode;
  /** Shared request_id stem; each child gets `<stem>:child-<i>` so the
   *  `(client_slug, request_id)` uniqueness constraint still holds and
   *  re-runs are idempotent. */
  request_id: string;
  children: CreateTaskTreeChildInput[];
  /** Optional classification stamped on the root Task only (NULL for
   *  children). Use `"sweep"` for auto-orchestration runs like
   *  "build the brain" so the SweepCard can find the live root. */
  kind?: string | null;
  /** Optional template id stamped on the root Task only (NULL for
   *  children). Mirrors `task-templates.ts` ids. */
  template_id?: string | null;
}

export interface CreateTaskTreeResult {
  root: Task;
  children: Task[];
}

export function createTaskTree(input: CreateTaskTreeInput): CreateTaskTreeResult {
  ensureTasksTable();

  const root = createTask({
    client_slug: input.client_slug,
    parent_task_id: null,
    parent_message_id: input.parent_message_id ?? null,
    title: input.rootTitle,
    goal: input.rootGoal,
    specialist_id: null,
    payload: {},
    blocked_on: [],
    permission_mode: input.permission_mode,
    request_id: input.request_id,
    kind: input.kind ?? null,
    template_id: input.template_id ?? null,
  });

  // First pass: insert each child with empty `blocked_on` so we can capture
  // their IDs, then patch the dependency edges in a second pass. Keeps the
  // logic simple and lets `createTask`'s ON CONFLICT keep us idempotent.
  const childIds: string[] = [];
  for (let i = 0; i < input.children.length; i++) {
    const c = input.children[i];
    const child = createTask({
      client_slug: input.client_slug,
      parent_task_id: root.id,
      parent_message_id: input.parent_message_id ?? null,
      title: c.title,
      goal: c.goal,
      specialist_id: c.specialist_id,
      payload: c.payload ?? {},
      blocked_on: [],
      permission_mode: input.permission_mode,
      request_id: `${input.request_id}:child-${i}`,
      // Children never carry kind/template_id — those are root-only
      // markers. Pass explicit nulls so the inferred Zod input type's
      // required-but-nullable contract is satisfied.
      kind: null,
      template_id: null,
    });
    childIds.push(child.id);
  }

  // Second pass: resolve `blocked_on_indices` into IDs and patch the rows.
  // Status transitions to `blocked` when `blocked_on` becomes non-empty.
  const db = getDb();
  const patchStmt = db.prepare(
    `UPDATE tasks
     SET blocked_on_json = ?,
         status          = CASE WHEN ? = '[]' THEN 'planned' ELSE 'blocked' END,
         updated_at      = datetime('now')
     WHERE id = ?`,
  );
  for (let i = 0; i < input.children.length; i++) {
    const c = input.children[i];
    const deps = (c.blocked_on_indices ?? [])
      .filter((idx) => idx >= 0 && idx < childIds.length)
      .map((idx) => childIds[idx]);
    if (deps.length === 0) continue;
    const json = JSON.stringify(deps);
    patchStmt.run(json, json, childIds[i]);
  }

  // Re-read so callers get the post-patch state (status = blocked where
  // applicable, blocked_on populated).
  const refreshed = childIds
    .map((id) => getTask(id))
    .filter((t): t is Task => t !== null);

  return { root, children: refreshed };
}

export function getTask(id: string): Task | null {
  ensureTasksTable();
  const row = getDb()
    .prepare(`SELECT * FROM tasks WHERE id = ?`)
    .get(id) as TaskRow | undefined;
  return row ? rowToTask(row) : null;
}

/** Direct children of a Task (or top-level Tasks for a client when null). */
export function listChildren(clientSlug: string, parentTaskId: string | null): Task[] {
  ensureTasksTable();
  const rows = (
    parentTaskId === null
      ? getDb()
          .prepare(
            `SELECT * FROM tasks
             WHERE client_slug = ? AND parent_task_id IS NULL
             ORDER BY created_at ASC, rowid ASC`,
          )
          .all(clientSlug)
      : getDb()
          .prepare(
            `SELECT * FROM tasks
             WHERE client_slug = ? AND parent_task_id = ?
             ORDER BY created_at ASC, rowid ASC`,
          )
          .all(clientSlug, parentTaskId)
  ) as TaskRow[];
  return rows.map(rowToTask);
}

/** Whole subtree under a Task, breadth-first. Includes the root. */
export function loadSubtree(rootTaskId: string): Task[] {
  ensureTasksTable();
  const root = getTask(rootTaskId);
  if (!root) return [];
  const out: Task[] = [root];
  const frontier: string[] = [rootTaskId];
  while (frontier.length > 0) {
    const next = frontier.shift()!;
    const kids = listChildren(root.client_slug, next);
    out.push(...kids);
    for (const k of kids) frontier.push(k.id);
  }
  return out;
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  patch: {
    result_summary?: string;
    result_path?: string;
    result_report_path?: string;
    result_data_path?: string;
    assignment_id?: string;
  } = {},
): Task | null {
  ensureTasksTable();
  getDb()
    .prepare(
      `UPDATE tasks
       SET status                = ?,
           result_summary        = COALESCE(?, result_summary),
           result_path           = COALESCE(?, result_path),
           result_report_path    = COALESCE(?, result_report_path),
           result_data_path      = COALESCE(?, result_data_path),
           assignment_id         = COALESCE(?, assignment_id),
           updated_at            = datetime('now')
       WHERE id = ?`,
    )
    .run(
      status,
      patch.result_summary ?? null,
      patch.result_path ?? null,
      patch.result_report_path ?? null,
      patch.result_data_path ?? null,
      patch.assignment_id ?? null,
      id,
    );
  return getTask(id);
}

export function resetTaskForRetry(
  id: string,
  status: Extract<TaskStatus, "planned" | "blocked"> = "planned",
): Task | null {
  ensureTasksTable();
  getDb()
    .prepare(
      `UPDATE tasks
       SET status                = ?,
           result_summary        = NULL,
           result_path           = NULL,
           result_report_path    = NULL,
           result_data_path      = NULL,
           assignment_id         = NULL,
           updated_at            = datetime('now')
       WHERE id = ?`,
    )
    .run(status, id);
  return getTask(id);
}

/**
 * Find every Task whose `blocked_on` set is fully satisfied — i.e. every
 * dependency succeeded, was skipped, or disappeared — and whose own
 * status is still `blocked`. The runner calls this after each terminal
 * transition to discover newly-runnable steps.
 */
export function findUnblocked(clientSlug: string): Task[] {
  ensureTasksTable();
  const blocked = getDb()
    .prepare(
      `SELECT * FROM tasks WHERE client_slug = ? AND status = 'blocked'`,
    )
    .all(clientSlug) as TaskRow[];

  if (blocked.length === 0) return [];

  // Pull all task statuses once so we don't N+1.
  const statusRows = getDb()
    .prepare(`SELECT id, status FROM tasks WHERE client_slug = ?`)
    .all(clientSlug) as Array<{ id: string; status: TaskStatus }>;
  const statusById = new Map(statusRows.map((r) => [r.id, r.status]));

  const statusRowsWithResult = getDb()
    .prepare(`SELECT id, result_summary FROM tasks WHERE client_slug = ?`)
    .all(clientSlug) as Array<{ id: string; result_summary: string | null }>;
  const resultById = new Map(
    statusRowsWithResult.map((r) => [r.id, r.result_summary]),
  );
  const unblocked: Task[] = [];
  for (const row of blocked) {
    let deps: string[] = [];
    try {
      deps = JSON.parse(row.blocked_on_json) as string[];
    } catch {
      deps = [];
    }
    const allSatisfied = deps.every((d) => {
      const s = statusById.get(d);
      // Missing deps treated as satisfied so a broken edge doesn't deadlock
      // the runner forever. The user can still see the gap in the inbox.
      return !s || isSatisfiedDependency(s, resultById.get(d) ?? null);
    });
    if (allSatisfied) unblocked.push(rowToTask(row));
  }
  return unblocked;
}

function isSatisfiedDependency(status: TaskStatus, resultSummary: string | null): boolean {
  if (status === "succeeded") return true;
  if (status === "cancelled" && resultSummary?.startsWith("skipped:")) return true;
  return false;
}

/* -------------------------------------------------------------------------- */
/* vault mirror                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Write a Task plan to the vault as a marketing-brain.v1 note. Lives at
 * `wiki/tasks/<YYYY-MM-DD>-<short-id>.md`. The note carries the whole
 * subtree as a readable plan so a user browsing the markdown vault can
 * see what the orchestrator was up to without booting the app.
 */
export async function mirrorTaskTreeToVault(rootTaskId: string): Promise<string | null> {
  const subtree = loadSubtree(rootTaskId);
  if (subtree.length === 0) return null;
  const root = subtree[0];
  const today = new Date().toISOString().slice(0, 10);
  const shortId = root.id.slice(0, 8);
  const relative = `wiki/tasks/${today}-${shortId}.md`;
  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: "decision",
    title: `Task plan: ${root.title}`,
    created: today,
    updated: today,
    tags: ["task", "plan", `permission:${root.permission_mode}`, `status:${root.status}`],
    status: root.status === "succeeded" || root.status === "failed" || root.status === "cancelled"
      ? "accepted"
      : "active",
    owner: "orchestrator",
    confidence: "medium",
    approval_status: root.permission_mode === "plan" && root.status === "planned" ? "needs-review" : "approved",
    risk_level: "low",
    rollback_note:
      "Cancel via DELETE /api/tasks/<id>; cancels all descendant Tasks + linked Assignments. " +
      "Vault artefacts produced by completed children remain on disk; revert manually from git " +
      "if needed.",
  };
  const body = renderTaskTreeMarkdown(subtree);
  await writeNote(root.client_slug, relative, { frontmatter, body });
  await reindexClient(root.client_slug).catch(() => undefined);

  await appendLogEntry(root.client_slug, {
    title: `task plan · ${root.title}`,
    body: [
      `**Root task**: \`${root.id}\``,
      `**Permission**: \`${root.permission_mode}\``,
      `**Steps**: ${subtree.length - 1} children`,
      "",
      root.goal,
    ].join("\n"),
  });

  // Return the wiki-relative path so callers can store it alongside the
  // assignment.result_path or surface a "Open task plan" link.
  return relative;
}

function renderTaskTreeMarkdown(subtree: Task[]): string {
  const root = subtree[0];
  const byParent = new Map<string | null, Task[]>();
  for (const t of subtree) {
    const k = t.parent_task_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(t);
  }
  function walk(parentId: string | null, depth: number): string {
    const kids = byParent.get(parentId) ?? [];
    if (kids.length === 0) return "";
    return kids
      .map((k) => {
        const indent = "  ".repeat(depth);
        const blockers = k.blocked_on.length
          ? ` _(blocked on: ${k.blocked_on.map((b) => `\`${b.slice(0, 8)}\``).join(", ")})_`
          : "";
        const specialist = k.specialist_id ? ` → \`${k.specialist_id}\`` : "";
        const result = k.result_summary ? ` — ${k.result_summary}` : "";
        return [
          `${indent}- **${k.title}** \`[${k.status}]\`${specialist}${blockers}`,
          k.goal.trim() ? `${indent}  ${k.goal.trim()}` : null,
          result ? `${indent}  ${result}` : null,
          walk(k.id, depth + 1),
        ]
          .filter((x): x is string => x !== null && x !== "")
          .join("\n");
      })
      .join("\n");
  }
  return [
    `# ${root.title}`,
    "",
    `**Task ID**: \`${root.id}\``,
    `**Permission**: \`${root.permission_mode}\``,
    `**Status**: \`${root.status}\``,
    `**Created**: \`${root.created_at}\``,
    "",
    "## Goal",
    "",
    root.goal.trim(),
    "",
    "## Plan",
    "",
    walk(root.id, 0) || "_(no steps yet)_",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* small helpers                                                               */
/* -------------------------------------------------------------------------- */

/** True when the path returned from `wikiPath()` is something we'd render
 *  in the brain index. Defensive: the index reindexer skips dotdirs, so
 *  task plans under `wiki/tasks/` are picked up automatically. */
export function taskWikiDir(clientSlug: string): string {
  return wikiPath(clientSlug, "tasks");
}
