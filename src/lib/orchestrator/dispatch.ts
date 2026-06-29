/**
 * Dispatch helpers — turn an Orchestrator's intent (structured tool call,
 * fenced JSON block, or legacy text tag) into one of:
 *
 *   - a single `Assignment` (auto-queued or held for approval)
 *   - a `Task` tree with N children dispatched in parallel
 *
 * Extracted from the (now-deleted) `src/app/api/chat/route.ts` so multiple
 * surfaces can share one dispatch path:
 *
 *   1. The agentic stream's defense-in-depth scan of the assembled
 *      assistant text (so a fenced JSON block in the model's reply still
 *      fans out, even if the subprocess's tool_use channel was the
 *      primary signal).
 *   2. A future MCP bridge that exposes `assign_task` / `plan_tree` as
 *      structured MCP tools to the embedded Claude Code agent.
 *   3. One-shot test scripts / future REST endpoints.
 *
 * Three real callers — meets the kernel rule "no abstraction without
 * three real callers". Until the agentic path actually wires (1) and the
 * MCP bridge lands, the third caller is the test surface (parser tests
 * exercise `parseFencedAssignDispatch` / `parseFencedPlanDispatch`).
 */
import "server-only";
import { randomUUID } from "node:crypto";

import {
  CreateAssignmentInputZ,
  createAssignment,
  linkJob,
  mirrorAssignmentToVault,
  updateStatus,
  type Assignment,
  type PermissionMode,
} from "@/lib/orchestrator/assignment";
import { enqueue } from "@/lib/orchestrator/job-queue";
import { createTaskTree, updateTaskStatus } from "@/lib/orchestrator/task";
import {
  runTaskTree,
  settleTaskTreeIfTerminal,
  type RunSummary,
} from "@/lib/orchestrator/task-runner";
import {
  getTemplate,
  instantiateTemplateChildren,
} from "@/lib/orchestrator/task-templates";
import { acquireSweepLock, getClient, releaseSweepLock } from "@/lib/brain/index-db";
import { getLatestAssistantTurn, narrateToChat } from "@/lib/orchestrator/chat-narrator";
import { readManifest } from "@/lib/orchestrator/client-context";
import { isFreshnessExempt, specialistArtifactStatus } from "@/lib/orchestrator/completion";
import {
  estimateChildrenCost,
  formatCostCapError,
  type SweepCostPreflight,
} from "@/lib/specialists/_lib/cost";
import {
  formatMissingIntegrationNames,
  missingRequiredIntegrations,
} from "@/lib/specialists/integration-readiness";

/* -------------------------------------------------------------------------- */
/* precondition gate                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a specialist id → list of required integration ids that aren't
 * currently configured. Empty array = the specialist can run. Used by
 * `dispatchPlanTree` to mark children as `cancelled` (skipped) at dispatch
 * time so a sweep with missing data sources produces a partial brain
 * instead of dispatching jobs that will fail at runtime.
 *
 * Returns the *integration ids* (not names) so the caller can build a
 * deep-link to /setup#<id>.
 */
function missingRequirements(specialistId: string): string[] {
  return missingRequiredIntegrations(specialistId);
}

function formatSkipReason(missing: string[]): string {
  // Use integration NAMES in the user-visible message for readability;
  // keep the underlying ids in the array for deep-linking.
  const names = formatMissingIntegrationNames(missing);
  if (names.length === 1) return `skipped: requires ${names[0]} (not configured)`;
  return `skipped: requires ${names.join(" + ")} (not configured)`;
}

/**
 * Secretary skip reason for an artifact that's already current. The
 * `skipped:` prefix is the orchestrator-wide convention every consumer keys
 * on (readiness, task-runner, the kickoff narration's phase buckets, the
 * Task Feed glyph) to treat a soft no-op distinctly from a crash.
 */
const SKIP_REASON_CURRENT = "skipped: already current (force to re-run)";

/* -------------------------------------------------------------------------- */
/* assign_task                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Create an Assignment from a structured `assign_task` tool call, then
 * either auto-queue the corresponding job (auto/read_only/full_access) or
 * leave it as `proposed` for human approval (plan mode).
 */
export async function dispatchFromToolCall(args: {
  clientSlug: string;
  permissionMode: PermissionMode;
  toolInput: Record<string, unknown>;
}): Promise<Assignment> {
  const validated = CreateAssignmentInputZ.parse({
    client_slug: args.clientSlug,
    specialist_id: args.toolInput.specialist_id,
    parent_message_id: null,
    title: args.toolInput.title,
    brief: args.toolInput.brief,
    payload: (args.toolInput.payload as Record<string, unknown> | undefined) ?? {},
    permission_mode:
      (args.toolInput.permission_mode as PermissionMode | undefined) ??
      args.permissionMode,
    request_id: randomUUID(),
  });

  // Secretary gate — skip a redundant re-run when this specialist already
  // has a current artifact. Plan mode is exempt (it produces a proposal for
  // human review, never executes), and an explicit `force: true` overrides.
  // The explicit "Run [agent]" button POSTs straight to /jobs and never
  // reaches this path, so a deliberate user click is always honoured.
  const force = args.toolInput.force === true;
  if (
    !force &&
    validated.permission_mode !== "plan" &&
    !isFreshnessExempt(validated.specialist_id) &&
    specialistArtifactStatus(args.clientSlug, validated.specialist_id) === "current"
  ) {
    const proposed = createAssignment(validated);
    const skipped = updateStatus(proposed.id, "cancelled", SKIP_REASON_CURRENT) ?? proposed;
    await mirrorAssignmentToVault(skipped);
    void narrateToChat(
      args.clientSlug,
      `\`${validated.specialist_id}\` already has a current artifact, so I skipped it. Tell me to force a re-run if you want a fresh pass.`,
      { id: `skip:${proposed.id}` },
    ).catch(() => undefined);
    return skipped;
  }

  const assignment = createAssignment(validated);

  let final = assignment;
  if (validated.permission_mode !== "plan") {
    final = await queueAssignmentJob(assignment);
  }

  await mirrorAssignmentToVault(final);
  return final;
}

/**
 * Legacy path: subscription CLI providers don't speak tool use, so the
 * Orchestrator's reply may still contain `[PROPOSED ACTION: run-<id>]`.
 * Promote the regex match into a real Assignment so both code paths feed
 * the same downstream UI.
 */
export async function dispatchFromLegacyTag(args: {
  clientSlug: string;
  permissionMode: PermissionMode;
  userMessage: string;
  specialistId: string;
}): Promise<Assignment | null> {
  try {
    const validated = CreateAssignmentInputZ.parse({
      client_slug: args.clientSlug,
      specialist_id: args.specialistId,
      parent_message_id: null,
      title: args.userMessage.slice(0, 120),
      brief: `Auto-dispatch from legacy [PROPOSED ACTION] text channel. User asked: ${args.userMessage}`,
      payload: {},
      permission_mode: args.permissionMode,
      request_id: randomUUID(),
    });
    const assignment = createAssignment(validated);
    let final = assignment;
    if (validated.permission_mode !== "plan") {
      final = await queueAssignmentJob(assignment);
    }
    await mirrorAssignmentToVault(final);
    return final;
  } catch {
    return null;
  }
}

export async function queueAssignmentJob(
  assignment: Assignment,
): Promise<Assignment> {
  const job = await enqueue({
    client_slug: assignment.client_slug,
    specialist: assignment.specialist_id,
    payload: assignment.payload,
  });
  const linked = linkJob(assignment.id, job.id);
  if (linked) return linked;
  return updateStatus(assignment.id, "queued") ?? assignment;
}

/* -------------------------------------------------------------------------- */
/* plan_tree                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Materialise a `plan_tree` tool call into a real Task tree, then kick off
 * the parallel runner. Returns a tiny summary the UI shows in the chat
 * reply so the user sees N specialists were dispatched.
 *
 * Accepts either a `template_id` (canned multi-specialist tree) or an
 * inline `children` array. The schema in `orchestrator-tools.ts` enforces
 * "exactly one of"; this function defends loosely so a model nudge doesn't
 * break the dispatch.
 */
export async function dispatchPlanTree(args: {
  clientSlug: string;
  permissionMode: PermissionMode;
  toolInput: Record<string, unknown>;
  suppressKickoffNarration?: boolean;
}): Promise<{
  rootTaskId: string;
  dispatched: number;
  /** Number of children pre-emptively cancelled because their required
   *  integrations weren't configured. The user-facing message in the
   *  chat reply should mention this so they know why the brain is partial. */
  skipped: number;
  templateId?: string;
  costPreflight: SweepCostPreflight;
}> {
  const input = args.toolInput;
  const requestedMode =
    (input.permission_mode as PermissionMode | undefined) ?? args.permissionMode;
  // Sweep-level force: re-run every child even if its artifact is current.
  const force = input.force === true;

  let rootTitle = (input.root_title as string | undefined)?.trim() || "";
  let rootGoal = (input.root_goal as string | undefined)?.trim() || "";
  type ChildSpec = {
    title: string;
    goal: string;
    specialist_id: string;
    payload?: Record<string, unknown>;
    blocked_on_indices?: number[];
  };
  let children: ChildSpec[] = [];
  let templateId: string | undefined;
  let rootKind: "sweep" | undefined;

  const templateIdRaw = input.template_id as string | undefined;
  if (templateIdRaw) {
    const template = getTemplate(templateIdRaw);
    if (!template) {
      throw new Error(`plan_tree: unknown template_id ${templateIdRaw}`);
    }
    templateId = template.id;
    rootKind = template.kind; // "sweep" for BUILD_BRAIN_SWEEP, undefined otherwise
    if (!rootTitle) rootTitle = template.rootTitle;
    if (!rootGoal) rootGoal = template.rootGoal;
    const manifest = await readManifest(args.clientSlug);
    children = instantiateTemplateChildren({ template, manifest }).map((c) => ({
      title: c.title,
      goal: c.goal,
      specialist_id: c.specialist_id,
      payload: c.payload,
      blocked_on_indices: c.blocked_on_indices,
    }));
  } else if (Array.isArray(input.children)) {
    children = (input.children as Array<Record<string, unknown>>).map((c) => ({
      title: String(c.title ?? "").slice(0, 160),
      goal: String(c.goal ?? "").slice(0, 4000),
      specialist_id: String(c.specialist_id ?? ""),
      payload: (c.payload as Record<string, unknown> | undefined) ?? {},
      blocked_on_indices: Array.isArray(c.blocked_on_indices)
        ? (c.blocked_on_indices as number[]).filter((n) => Number.isInteger(n))
        : undefined,
    }));
    if (!rootTitle) rootTitle = "Custom multi-specialist plan";
    if (!rootGoal) rootGoal = "Orchestrator-planned fan-out.";
  } else {
    throw new Error("plan_tree: missing both template_id and children");
  }

  if (children.length === 0) {
    throw new Error("plan_tree: empty children");
  }

  const manifest = await readManifest(args.clientSlug);
  const costPreflight = estimateChildrenCost({ children, manifest });
  if (rootKind === "sweep" && requestedMode !== "plan" && costPreflight.over_cap) {
    throw new Error(formatCostCapError(costPreflight));
  }

  const requestId = randomUUID();
  const sweepType = templateId ?? rootKind ?? "plan-tree";
  let locked = false;
  if (rootKind === "sweep" && requestedMode !== "plan") {
    const lock = acquireSweepLock(args.clientSlug, sweepType, requestId);
    if (!lock.acquired) {
      throw new Error(
        `sweep_already_running: ${sweepType} for ${args.clientSlug} started at ${new Date(
          lock.lock.created_at,
        ).toISOString()}`,
      );
    }
    locked = true;
  }

  try {
    const tree = createTaskTree({
      client_slug: args.clientSlug,
      rootTitle,
      rootGoal,
      permission_mode: requestedMode,
      request_id: requestId,
      children,
      kind: rootKind ?? null,
      template_id: templateId ?? null,
    });

  // Pre-flight: mark any child whose required integrations aren't
  // configured as `cancelled` BEFORE the runner walks the tree, so the
  // sweep produces a partial-but-useful brain instead of dispatching jobs
  // that fail at runtime. The runner treats `cancelled` as terminal, so
  // dependents become eligible to run (and may themselves cancel if their
  // upstream data is missing — which is fine, we surface that reason too).
  let skipped = 0;
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    const specialistId = child.specialist_id ?? "";
    const missing = missingRequirements(specialistId);
    if (missing.length > 0) {
      updateTaskStatus(child.id, "cancelled", { result_summary: formatSkipReason(missing) });
      skipped++;
      continue;
    }
    // Secretary gate — skip a child whose artifact is already current so a
    // re-run of the sweep refreshes only what's stale/missing. `force`
    // re-runs the lot; a data-limited gap (missing integration, handled
    // above) is never silently treated as current.
    if (
      !force &&
      !isFreshnessExempt(specialistId) &&
      specialistArtifactStatus(args.clientSlug, specialistId) === "current"
    ) {
      updateTaskStatus(child.id, "cancelled", { result_summary: SKIP_REASON_CURRENT });
      skipped++;
    }
  }

    let summary: RunSummary | null = null;
    if (requestedMode !== "plan") {
      summary = await runTaskTree(tree.root.id);
      if (summary.dispatched.length === 0) {
        await settleTaskTreeIfTerminal(tree.root.id);
      }
    }

  // Sweep kickoff narration — write a single orchestrator-authored chat
  // turn describing what was just dispatched + what was skipped + why.
  // Idempotent on `kickoff:<rootTaskId>` so re-runs (dev server restart,
  // double-click) don't double-write. Suppressed when the LLM's planning
  // reply was just persisted (within the last 5 seconds) — that turn IS
  // the kickoff for the chat-typed path.
    if (rootKind === "sweep" && requestedMode !== "plan" && !args.suppressKickoffNarration) {
      void narrateSweepKickoff({
        clientSlug: args.clientSlug,
        rootTaskId: tree.root.id,
        templateId,
        costPreflight,
      }).catch(() => undefined);
    }

    return {
      rootTaskId: tree.root.id,
      dispatched: summary?.dispatched.length ?? 0,
      skipped,
      costPreflight,
      ...(templateId ? { templateId } : {}),
    };
  } catch (err) {
    if (locked) releaseSweepLock(args.clientSlug, sweepType, requestId);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* sweep narration                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Render and append the kickoff chat turn for a freshly-started sweep.
 * Read the actual Task tree state so the message reflects truth (i.e.
 * which children were pre-cancelled by the precondition gate).
 *
 * Suppressed when an assistant turn was written within the last 5s —
 * that's the LLM's planning reply from the chat-typed path, which
 * already IS the kickoff. Without this check we'd double up.
 */
async function narrateSweepKickoff(args: {
  clientSlug: string;
  rootTaskId: string;
  templateId: string | undefined;
  costPreflight: SweepCostPreflight;
}): Promise<void> {
  const SUPPRESS_WINDOW_MS = 5_000;
  const latest = await getLatestAssistantTurn(args.clientSlug);
  if (latest?.ts) {
    const age = Date.now() - new Date(latest.ts).getTime();
    if (age >= 0 && age < SUPPRESS_WINDOW_MS) return;
  }

  // Resolve template metadata for phase grouping. Inline `children`
  // sweeps (no template) just fall through to a generic blurb.
  const template = args.templateId ? getTemplate(args.templateId) : null;
  const phasesByChildIdx = new Map<number, string>();
  if (template) {
    template.children.forEach((c, idx) => {
      if (c.phase) phasesByChildIdx.set(idx, c.phase);
    });
  }

  // Load the actual children with their post-precondition statuses.
  // Lazy import to keep this module's top-level imports tight and avoid a
  // cycle (dispatch.ts → task.ts → … → dispatch.ts is already fine, but
  // narration is a leaf concern).
  const { listChildren } = await import("@/lib/orchestrator/task");
  const children = listChildren(args.clientSlug, args.rootTaskId);

  // Group dispatched and skipped specialists by phase. Skipped == the
  // status set by the precondition gate above (cancelled + reason).
  type Group = { dispatched: string[]; skipped: Array<{ id: string; reason: string }> };
  const phases = new Map<string, Group>();
  const ungrouped: Group = { dispatched: [], skipped: [] };
  function bucket(phase: string | undefined): Group {
    if (!phase) return ungrouped;
    let g = phases.get(phase);
    if (!g) {
      g = { dispatched: [], skipped: [] };
      phases.set(phase, g);
    }
    return g;
  }
  // Children were created in template order; the templateChildren index
  // matches the listChildren order because task-tree creation preserves it.
  children.forEach((c, idx) => {
    const phase = phasesByChildIdx.get(idx);
    const g = bucket(phase);
    const sid = c.specialist_id ?? "(unknown)";
    if (c.status === "cancelled" && c.result_summary?.startsWith("skipped:")) {
      g.skipped.push({ id: sid, reason: c.result_summary.replace(/^skipped:\s*/, "") });
    } else {
      g.dispatched.push(sid);
    }
  });

  const clientRow = getClient(args.clientSlug);
  const clientName = clientRow?.name ?? args.clientSlug;

  const lines: string[] = [];
  const totalDispatched =
    Array.from(phases.values()).reduce((n, g) => n + g.dispatched.length, 0) +
    ungrouped.dispatched.length;
  const totalSkipped =
    Array.from(phases.values()).reduce((n, g) => n + g.skipped.length, 0) +
    ungrouped.skipped.length;

  lines.push(
    `**Spawning agents for ${clientName}.** ${totalDispatched} specialist agent${
      totalDispatched === 1 ? "" : "s"
    } queued across ${phases.size || 1} phase${phases.size === 1 ? "" : "s"}.${
      totalSkipped > 0 ? ` ${totalSkipped} skipped (see below).` : ""
    }`,
  );
  lines.push("");
  lines.push(
    `Estimated sweep cost: $${args.costPreflight.total_usd.toFixed(2)} ` +
      `($${args.costPreflight.anthropic_usd.toFixed(2)} Anthropic, ` +
      `$${args.costPreflight.dataforseo_usd.toFixed(2)} DataForSEO). ` +
      `Month-to-date: $${args.costPreflight.month_to_date_usd.toFixed(2)}${
        args.costPreflight.monthly_cost_cap_usd != null
          ? ` / $${args.costPreflight.monthly_cost_cap_usd.toFixed(2)} cap`
          : ""
      }.`,
  );
  lines.push("");

  const PHASE_ORDER = ["intake", "diagnostic", "discovery", "synthesis", "final"];
  const phaseLabel = (id: string) =>
    id === "final" ? "Final Gate" : id.charAt(0).toUpperCase() + id.slice(1);

  for (const phaseId of PHASE_ORDER) {
    const g = phases.get(phaseId);
    if (!g || (g.dispatched.length === 0 && g.skipped.length === 0)) continue;
    lines.push(`**Phase — ${phaseLabel(phaseId)}**`);
    for (const id of g.dispatched) lines.push(`- \`${id}\``);
    for (const s of g.skipped) lines.push(`- \`${s.id}\` — ${s.reason}`);
    lines.push("");
  }

  // Inline-children sweeps with no phase grouping — render flat.
  if (ungrouped.dispatched.length > 0 || ungrouped.skipped.length > 0) {
    for (const id of ungrouped.dispatched) lines.push(`- \`${id}\``);
    for (const s of ungrouped.skipped) lines.push(`- \`${s.id}\` — ${s.reason}`);
    lines.push("");
  }

  lines.push("I'll post each agent result here as it lands.");

  await narrateToChat(args.clientSlug, lines.join("\n"), {
    id: `kickoff:${args.rootTaskId}`,
  });
}

/* -------------------------------------------------------------------------- */
/* text parsers (CLI providers + defense-in-depth on assembled reply text)     */
/* -------------------------------------------------------------------------- */

export const LEGACY_ACTION_RE = /\[PROPOSED ACTION:\s*run-([a-z0-9-]+)\s*\]/i;

export function parseLegacyProposedAction(
  text: string,
): { specialistId: string; cleanedText: string } | null {
  const match = text.match(LEGACY_ACTION_RE);
  if (!match) return null;
  return {
    specialistId: match[1],
    cleanedText: text.replace(LEGACY_ACTION_RE, "").trim(),
  };
}

/**
 * Recognise the fenced ```assign_task JSON block the Orchestrator emits
 * on CLI providers (no native tool_use). Tolerant of whitespace + the
 * language tag missing — accepts `assign_task`, `assign-task`, or a bare
 * `json` block whose body has a `specialist_id` key.
 */
export const FENCED_ASSIGN_BLOCK_RE = /```(?:assign[_-]?task|json)\s*\n([\s\S]*?)\n```/i;

export function parseFencedAssignDispatch(
  text: string,
): { toolInput: Record<string, unknown>; cleanedText: string } | null {
  const match = text.match(FENCED_ASSIGN_BLOCK_RE);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { specialist_id?: unknown }).specialist_id !== "string"
  ) {
    return null;
  }
  const cleanedText = text.replace(FENCED_ASSIGN_BLOCK_RE, "").trim();
  return {
    toolInput: parsed as Record<string, unknown>,
    cleanedText,
  };
}

/**
 * Recognise the fenced ```plan_tree JSON block emitted by CLI providers
 * that don't support native tool_use.
 */
export const FENCED_PLAN_BLOCK_RE = /```plan[_-]?tree\s*\n([\s\S]*?)\n```/i;

export function parseFencedPlanDispatch(
  text: string,
): { toolInput: Record<string, unknown>; cleanedText: string } | null {
  const match = text.match(FENCED_PLAN_BLOCK_RE);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!("template_id" in obj) && !Array.isArray(obj.children)) return null;
  const cleanedText = text.replace(FENCED_PLAN_BLOCK_RE, "").trim();
  return { toolInput: obj, cleanedText };
}

/* -------------------------------------------------------------------------- */
/* one-shot convenience used by the agentic stream                             */
/* -------------------------------------------------------------------------- */

/**
 * Walk an assistant's assembled text and dispatch the highest-priority
 * signal it carries. Tried in order so a model emitting both a plan-tree
 * block and a legacy tag doesn't double-dispatch:
 *
 *   1. ```plan_tree JSON``` → multi-specialist fan-out
 *   2. ```assign_task JSON``` → single Assignment
 *   3. `[PROPOSED ACTION: run-<id>]` legacy tag → single Assignment
 *
 * Returns `{ kind, cleanedText }` so the caller can substitute the cleaned
 * text into the persisted turn. When no signal is found, returns
 * `{ kind: null, cleanedText: text }`.
 */
export async function attemptDispatchFromText(
  text: string,
  ctx: {
    clientSlug: string;
    permissionMode: PermissionMode;
    userMessage: string;
  },
): Promise<{
  kind: "plan_tree" | "assign_task" | "legacy" | null;
  cleanedText: string;
  assignment?: Assignment | null;
  plan?: {
    rootTaskId: string;
    dispatched: number;
    skipped: number;
    templateId?: string;
    costPreflight: SweepCostPreflight;
  };
}> {
  const plan = parseFencedPlanDispatch(text);
  if (plan) {
    try {
      const summary = await dispatchPlanTree({
        clientSlug: ctx.clientSlug,
        permissionMode: ctx.permissionMode,
        toolInput: plan.toolInput,
        suppressKickoffNarration: true,
      });
      return { kind: "plan_tree", cleanedText: plan.cleanedText, plan: summary };
    } catch {
      return { kind: null, cleanedText: plan.cleanedText };
    }
  }

  const assign = parseFencedAssignDispatch(text);
  if (assign) {
    try {
      const assignment = await dispatchFromToolCall({
        clientSlug: ctx.clientSlug,
        permissionMode: ctx.permissionMode,
        toolInput: assign.toolInput,
      });
      return { kind: "assign_task", cleanedText: assign.cleanedText, assignment };
    } catch {
      return { kind: null, cleanedText: assign.cleanedText };
    }
  }

  const legacy = parseLegacyProposedAction(text);
  if (legacy) {
    const assignment = await dispatchFromLegacyTag({
      clientSlug: ctx.clientSlug,
      permissionMode: ctx.permissionMode,
      userMessage: ctx.userMessage,
      specialistId: legacy.specialistId,
    });
    return { kind: "legacy", cleanedText: legacy.cleanedText, assignment };
  }

  return { kind: null, cleanedText: text };
}
