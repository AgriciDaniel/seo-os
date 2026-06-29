/**
 * Permission-mode policy.
 *
 * Mirrors Claude Code CLI's safety levels (plan / read-only / auto / full
 * access) but adapted to SEO Office's two-stage execution model. The
 * Orchestrator gate and the Specialist gate are evaluated independently:
 *
 *   plan         → Orchestrator may propose; Specialists never run. The
 *                  assignment lands as `status='proposed'` and waits for
 *                  an explicit user approval.
 *
 *   read_only    → Orchestrator may dispatch; Specialists may only call
 *                  tools tagged `side_effect: 'read'`. Brain writes are
 *                  allowed only for `kind: 'observation'` notes at
 *                  `approval_status: 'auto'`.
 *
 *   auto         → Default. Orchestrator dispatches; Specialists run any
 *                  tool. Writes default to `approval_status: 'pending'`
 *                  whenever `risk_level >= 'medium'` — the user batches
 *                  approvals in the brain UI.
 *
 *   full_access  → No gates. Writes go to `approval_status: 'approved'`
 *                  immediately. Use sparingly; assume side effects can
 *                  reach external systems.
 *
 * The functions here are pure so they're easy to test and easy to reason
 * about from anywhere in the codebase (route handlers, the job-queue
 * runner, the specialist artifact helper).
 */
import "server-only";

import type { PermissionMode } from "./assignment";
import type { RiskLevel, ApprovalStatus } from "@/lib/brain/types";

export type ToolSideEffect = "read" | "write" | "network";

/**
 * Should an Assignment created in this mode go straight to the job
 * queue? Returns false for `plan` mode (manual approval required).
 */
export function canAutoQueue(mode: PermissionMode): boolean {
  return mode !== "plan";
}

/**
 * May a specialist invoke a tool with the given side-effect tag under
 * the given mode? Used by the (eventual) specialist runner before each
 * tool call. Today most specialists call directly into TS code rather
 * than going through a tool dispatcher; once that lands this function
 * becomes the chokepoint.
 */
export function canExecuteTool(
  mode: PermissionMode,
  sideEffect: ToolSideEffect,
): boolean {
  switch (mode) {
    case "plan":
      return false; // plan mode never executes anything
    case "read_only":
      return sideEffect === "read";
    case "auto":
    case "full_access":
      return true;
  }
}

/**
 * What approval status should a newly-written brain note default to
 * given the active mode and the note's declared risk level? Specialists
 * call this from `_lib/artifact.ts` so policy stays in one place.
 *
 *   full_access  → approved (no gate)
 *   read_only    → needs-review for anything write-shaped (the runner
 *                  will already have blocked the write itself if the
 *                  tool was tagged side_effect: 'write')
 *   auto         → low-risk auto-approves; medium/high go to needs-review
 *   plan         → never reached in practice — plan never runs writes —
 *                  but defensively return needs-review.
 */
export function defaultApprovalStatus(
  mode: PermissionMode,
  riskLevel: RiskLevel,
): ApprovalStatus {
  if (mode === "full_access") return "approved";
  if (mode === "plan") return "needs-review";
  if (mode === "read_only") return "needs-review";
  // auto
  return riskLevel === "low" ? "approved" : "needs-review";
}

/** One-line label for the segmented control + state snapshot. */
export function describePermissionMode(mode: PermissionMode): string {
  switch (mode) {
    case "plan":
      return "Plan only — propose, never run";
    case "read_only":
      return "Read-only — fetch + analyse, never write";
    case "auto":
      return "Auto — run, batch approvals on writes";
    case "full_access":
      return "Full access — run + auto-approve writes";
  }
}
