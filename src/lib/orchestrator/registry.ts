/**
 * Specialist registry.
 *
 * A specialist is anything callable from the orchestrator: a TS-only LLM
 * skill, a Python script wrapper, or a hybrid. All wear the same interface
 * so the UI / job queue don't need to know the difference.
 */
import "server-only";
import { z } from "zod";
import type {
  ClientManifest,
  SpecialistExecutionResult,
} from "@/lib/brain/types";
import type { SpecialistEvidence } from "@/lib/brain/population-contract";

export interface ArtifactRef {
  path: string;
  specialistId?: string;
  title?: string;
  type?: string;
}

export interface IntegrationHandles {
  configured: string[];
  missing: string[];
}

export type SpecialistPermissionMode = "read_only" | "auto" | "full_access";

/**
 * Per-job execution context handed to every specialist. Provides:
 *  - the job ID (for correlating SSE events)
 *  - the client slug (so the specialist can read/write the vault)
 *  - an `emit()` to stream progress
 *  - an AbortSignal so cancellation can stop subprocesses / LLM calls
 */
export interface SpecialistContext<I = unknown> {
  jobId: string;
  clientSlug: string;
  input: I;
  manifest: ClientManifest;
  vaultRoot: string;
  priorArtifacts: ArtifactRef[];
  integrations: IntegrationHandles;
  signal: AbortSignal;
  budget: { maxCostUsd?: number; maxDurationMs?: number };
  permissionMode: SpecialistPermissionMode;
  runId: string;
  isCancelled: () => boolean;
  emit: (
    kind: "log" | "progress" | "result" | "error",
    message: string,
    extra?: { progress?: number; data?: unknown },
  ) => void;
}

export interface SpecialistResult {
  /** One-line outcome summary — surfaces in the job list. */
  summary: string;
  /** Path of the produced markdown artefact, relative to the vault root. */
  resultPath?: string;
  /** Path of the polished HTML report (Phase 2). When present, the inbox
   *  surfaces an "Open Report" affordance. Vault-relative. */
  reportPath?: string;
  /** Path of the structured `.data.json` sidecar (Phase 2). Vault-relative. */
  dataPath?: string;
  /** Any structured data the UI might want to show. */
  data?: unknown;
  /** Source-backed claims produced by this specialist. Used by the
   *  readiness/finalization layer to distinguish live/cached/manual/model
   *  evidence from generic prose. */
  evidence?: SpecialistEvidence[];
  /** True when the specialist completed in an advisory mode because live
   *  data or a deeper crawler was unavailable. */
  degraded?: boolean;
  degradationReason?: string;
  /** Native R5 execution envelope. When present, the queue persists it
   *  directly instead of deriving the envelope from compatibility fields. */
  executionResult?: SpecialistExecutionResult;
}

export interface Specialist<I = unknown> {
  /** Stable kebab-case id, e.g. "technical-auditor". */
  id: string;
  /** Display name shown in the UI, e.g. "Technical SEO Auditor". */
  name: string;
  /** One-sentence elevator pitch. */
  description: string;
  /** Where the specialist's "desk" lives in the 3D office. */
  desk: string;
  /** Zod schema for the run-time payload. */
  inputSchema: z.ZodType<I>;
  /** The actual work. Throw on failure; emit progress freely. */
  execute: (ctx: SpecialistContext<I>) => Promise<SpecialistResult>;
}

const registry = new Map<string, Specialist<unknown>>();

export function registerSpecialist<I>(spec: Specialist<I>): void {
  registry.set(spec.id, spec as Specialist<unknown>);
}

export function getSpecialist(id: string): Specialist<unknown> | undefined {
  return registry.get(id);
}

export function listSpecialists(): Specialist<unknown>[] {
  return [...registry.values()].sort((a, b) => a.id.localeCompare(b.id));
}
