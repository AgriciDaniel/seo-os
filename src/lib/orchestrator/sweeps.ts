/**
 * Sweep service — read-side helpers for the SweepCard.
 *
 * A "sweep" is a root Task with `kind='sweep'` (set by the BUILD_BRAIN_SWEEP
 * template path in `dispatch.ts`). Its child Tasks are the specialists in
 * the sweep template. There is NO separate `sweeps` table — reusing the
 * Task primitive keeps the lifecycle, status machine, and vault-mirror
 * shape consistent across every form of orchestration.
 *
 * This module only exposes read-side helpers because the write-side
 * (start a sweep) is handled by `dispatchPlanTree` in `dispatch.ts` — both
 * the chat-tool path AND the REST endpoint route through it, so behaviour
 * stays consistent regardless of how the sweep was triggered.
 */
import "server-only";

import { getDb } from "@/lib/brain/index-db";
import { readHistory } from "@/lib/agents/chat-store";
import { listChildren, type Task, type TaskStatus } from "@/lib/orchestrator/task";
import { readManifest } from "@/lib/orchestrator/client-context";
import {
  estimateChildrenCost,
  type SweepCostPreflight,
} from "@/lib/specialists/_lib/cost";
import type { BrainReadinessStatus } from "@/lib/brain/readiness-types";

/**
 * Roll-up of a sweep's per-phase progress, computed from the child Tasks.
 * The phase grouping is taken from `BUILD_BRAIN_SWEEP`'s template ordering;
 * `getCurrentSweep` enriches each child with the phase it belongs to.
 */
export type SweepPhase = "intake" | "diagnostic" | "discovery" | "synthesis" | "final";

export interface SweepChildSummary {
  task_id: string;
  specialist_id: string;
  title: string;
  status: TaskStatus;
  phase: SweepPhase | null;
  result_summary: string | null;
  /** True when the child was pre-emptively cancelled due to a missing
   *  required integration. Surfaces in the SweepCard as a distinct
   *  "skipped" visual rather than a generic failure. */
  skipped: boolean;
}

export interface SweepView {
  root_task_id: string;
  client_slug: string;
  template_id: string | null;
  title: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  readiness_status: BrainReadinessStatus | null;
  /** Per-phase counts of child statuses. Used by the SweepCard for the
   *  thin progress bar + phase label. */
  totals: {
    all: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    skipped: number;
    running: number;
    queued: number;
    planned_or_blocked: number;
  };
  /** Which phase is currently "in flight" — the earliest phase that still
   *  has non-terminal children. Falls back to "synthesis" once everything
   *  is terminal so the UI shows the last phase reached. */
  current_phase: SweepPhase | null;
  /** Children ordered as they appear in the template. */
  children: SweepChildSummary[];
  /** Latest human-readable final readiness narration, when the terminal
   *  sweep finalizer has written it to orchestrator chat. This lets mounted
   *  clients show the final handoff without a page reload even if their
   *  incremental chat poll missed the late append. */
  final_summary: string | null;
  /** Pre-dispatch cost estimate and cap status for this sweep template. */
  cost_preflight: SweepCostPreflight | null;
}

/* -------------------------------------------------------------------------- */
/* template-phase lookup                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Phase lookup keyed by `(template_id, specialist_id)` so the same specialist
 * id appearing in two templates can carry different phases. Built lazily on
 * first call; new templates are auto-picked up.
 */
type PhaseMap = Map<string, Array<SweepPhase | null>>;
let _phaseMap: PhaseMap | null = null;

async function getPhaseMap(): Promise<PhaseMap> {
  if (_phaseMap) return _phaseMap;
  const { TASK_TEMPLATES } = await import("@/lib/orchestrator/task-templates");
  const map: PhaseMap = new Map();
  for (const t of Object.values(TASK_TEMPLATES)) {
    if (t.kind !== "sweep") continue;
    map.set(t.id, t.children.map((c) => c.phase ?? null));
  }
  _phaseMap = map;
  return map;
}

/* -------------------------------------------------------------------------- */
/* queries                                                                     */
/* -------------------------------------------------------------------------- */

interface SweepRootRow {
  id: string;
  client_slug: string;
  template_id: string | null;
  title: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  result_summary: string | null;
}

/**
 * The most-recent sweep root for a client, or null if none exists. "Most
 * recent" = highest `created_at`. Running sweeps always win over completed
 * sweeps (their created_at is newer because nothing terminal has been
 * created since); on tie we just take whichever the DB picked.
 */
export async function getCurrentSweep(clientSlug: string): Promise<SweepView | null> {
  const db = getDb();

  let root: SweepRootRow | undefined;
  try {
    // `tasks` is an orchestration-owned table whose schema is lazily
    // bootstrapped by task.ts. Touch the task store before the raw sweep
    // query so a first read after process start cannot be mistaken for
    // "no sweep" just because the table has not been ensured yet.
    listChildren(clientSlug, null);
    root = db
      .prepare(
        `SELECT id, client_slug, template_id, title, status, created_at, updated_at, result_summary
         FROM tasks
         WHERE client_slug = ? AND kind = 'sweep' AND parent_task_id IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(clientSlug) as SweepRootRow | undefined;
  } catch (err) {
    // tasks table may not exist yet OR the `kind` column may not have been
    // backfilled on a very old vault — both safe to treat as "no sweep".
    const message = err instanceof Error ? err.message : String(err);
    if (
      !/no such table: tasks|no such column: kind|no such column: template_id/i.test(
        message,
      )
    ) {
      throw err;
    }
    return null;
  }
  if (!root) return null;

  const children = listChildren(clientSlug, root.id);
  const manifest = await readManifest(clientSlug).catch(() => null);
  const instantiatedTemplate = root.template_id
    ? await instantiateSweepTemplate(root.template_id, manifest)
    : null;
  const phaseMap = instantiatedTemplate ? null : await getPhaseMap();
  const templatePhases = instantiatedTemplate
    ? instantiatedTemplate.children.map((child) => child.phase ?? null)
    : root.template_id
      ? phaseMap?.get(root.template_id) ?? []
      : [];

  const summaries: SweepChildSummary[] = children.map((c: Task, idx) => {
    const phase = templatePhases[idx] ?? null;
    const skipped =
      c.status === "cancelled" &&
      typeof c.result_summary === "string" &&
      c.result_summary.startsWith("skipped:");
    return {
      task_id: c.id,
      specialist_id: c.specialist_id ?? "",
      title: c.title,
      status: c.status,
      phase,
      result_summary: c.result_summary,
      skipped,
    };
  });

  const totals = {
    all: summaries.length,
    succeeded: summaries.filter((c) => c.status === "succeeded").length,
    failed: summaries.filter((c) => c.status === "failed").length,
    cancelled: summaries.filter((c) => c.status === "cancelled" && !c.skipped).length,
    skipped: summaries.filter((c) => c.skipped).length,
    running: summaries.filter((c) => c.status === "running").length,
    queued: summaries.filter((c) => c.status === "queued").length,
    planned_or_blocked: summaries.filter(
      (c) => c.status === "planned" || c.status === "blocked",
    ).length,
  };

  // "Current phase" = earliest phase that still has any non-terminal child.
  // Falls back to the last phase that has children when everything terminal.
  const TERMINAL: TaskStatus[] = ["succeeded", "failed", "cancelled"];
  const PHASES: SweepPhase[] = ["intake", "diagnostic", "discovery", "synthesis", "final"];
  let currentPhase: SweepPhase | null = null;
  for (const p of PHASES) {
    const inPhase = summaries.filter((s) => s.phase === p);
    if (inPhase.length === 0) continue;
    const hasNonTerminal = inPhase.some((s) => !TERMINAL.includes(s.status));
    if (hasNonTerminal) {
      currentPhase = p;
      break;
    }
  }
  if (!currentPhase) {
    // Everything terminal — show the last phase that had children.
    for (let i = PHASES.length - 1; i >= 0; i--) {
      if (summaries.some((s) => s.phase === PHASES[i])) {
        currentPhase = PHASES[i];
        break;
      }
    }
  }
  const terminal = root.status === "succeeded" || root.status === "failed" || root.status === "cancelled";
  const finalSummary = terminal ? await readLatestFinalSummary(clientSlug) : null;
  const readinessStatus = terminal ? parseReadinessStatus(root.result_summary) : null;
  const costPreflight = root.template_id
    ? await estimateSweepCostPreflight(root.template_id, manifest).catch(() => null)
    : null;

  return {
    root_task_id: root.id,
    client_slug: root.client_slug,
    template_id: root.template_id,
    title: root.title,
    status: root.status,
    created_at: root.created_at,
    updated_at: root.updated_at,
    readiness_status: readinessStatus,
    totals,
    current_phase: currentPhase,
    children: summaries,
    final_summary: finalSummary,
    cost_preflight: costPreflight,
  };
}

async function estimateSweepCostPreflight(
  templateId: string,
  manifest: Awaited<ReturnType<typeof readManifest>>,
): Promise<SweepCostPreflight | null> {
  const instantiated = await instantiateSweepTemplate(templateId, manifest);
  if (!instantiated) return null;
  return estimateChildrenCost({ children: instantiated.children, manifest });
}

async function instantiateSweepTemplate(
  templateId: string,
  manifest: Awaited<ReturnType<typeof readManifest>>,
) {
  const { getTemplate, instantiateTemplateChildren } = await import(
    "@/lib/orchestrator/task-templates"
  );
  const template = getTemplate(templateId);
  if (!template) return null;
  return {
    template,
    children: instantiateTemplateChildren({ template, manifest }),
  };
}

async function readLatestFinalSummary(clientSlug: string): Promise<string | null> {
  const turns = await readHistory(clientSlug, "orchestrator").catch(() => []);
  for (let i = turns.length - 1; i >= 0; i--) {
    const content = turns[i]?.content ?? "";
    if (/Your SEO brain is ready for review/i.test(content)) return content;
    if (/Your SEO brain is useful, but it still needs live data/i.test(content)) {
      return content;
    }
    if (/Your SEO brain is partially built/i.test(content)) return content;
    if (/Your SEO brain is blocked/i.test(content)) return content;
    if (/Your SEO brain is a solid draft/i.test(content)) return content;
  }
  return null;
}

function parseReadinessStatus(summary: string | null): BrainReadinessStatus | null {
  const match = summary?.match(
    /final review complete:\s+(draft|needs_data|partial_brain|deep_ready|blocked)\b/i,
  );
  return (match?.[1] as BrainReadinessStatus | undefined) ?? null;
}

/**
 * Cheap "is there a live sweep?" check the SweepCard uses to gate
 * rendering before paying the cost of getCurrentSweep(). A sweep is "live"
 * if its root status isn't terminal yet. Returns false on any DB error so
 * the UI degrades to the NextActionCard rather than crashing.
 */
export function hasLiveSweep(clientSlug: string): boolean {
  try {
    const row = getDb()
      .prepare(
        `SELECT status FROM tasks
         WHERE client_slug = ? AND kind = 'sweep' AND parent_task_id IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug) as { status: TaskStatus } | undefined;
    if (!row) return false;
    return row.status !== "succeeded" && row.status !== "failed" && row.status !== "cancelled";
  } catch {
    return false;
  }
}
