import "server-only";

import {
  SpecialistExecutionResultSchema,
  type DataSource,
  type SpecialistExecutionResult,
} from "@/lib/brain/types";
import { EVIDENCE_LEDGER_PATH } from "@/lib/brain/evidence-ledger";
import { readNote } from "@/lib/brain/vault-fs";
import type { SpecialistResult } from "./registry";

export interface NormalizeSpecialistResultInput {
  clientSlug: string;
  result: SpecialistResult;
  durationMs: number;
}

export async function normalizeSpecialistResult(
  input: NormalizeSpecialistResultInput,
): Promise<SpecialistExecutionResult> {
  if (input.result.executionResult) {
    const native = SpecialistExecutionResultSchema.parse(input.result.executionResult);
    const hasEvidence = Boolean(input.result.evidence?.length);
    return SpecialistExecutionResultSchema.parse({
      ...native,
      status:
        input.result.degraded && native.status === "succeeded"
          ? "partial"
          : native.status,
      confidence:
        input.result.degraded && native.confidence !== "low"
          ? "low"
          : native.confidence,
      source_paths: unique([
        ...native.source_paths,
        ...(input.result.evidence?.flatMap((e) => e.source_paths) ?? []),
      ]),
      data_sources: unique([
        ...native.data_sources,
        ...(input.result.evidence?.map((e) => e.provenance) ?? []),
      ]) as DataSource[],
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      side_effects: {
        wrote: native.side_effects.wrote,
        appended: unique([
          ...native.side_effects.appended,
          ...(hasEvidence ? [EVIDENCE_LEDGER_PATH] : []),
        ]),
      },
    });
  }

  // R5 policy: keep this compatibility path for ad-hoc/local specialists and
  // manual probes. Production ready specialists are guarded elsewhere to
  // return native `executionResult` envelopes.
  const artifact = input.result.resultPath
    ? await readNote(input.clientSlug, input.result.resultPath).catch(() => null)
    : null;
  const sourcePaths = unique([
    ...(artifact?.frontmatter.sources ?? []),
    ...(input.result.evidence?.flatMap((e) => e.source_paths) ?? []),
  ]);
  const dataSources = unique([
    ...(artifact?.frontmatter.data_sources ?? []),
    ...(input.result.evidence?.map((e) => e.provenance) ?? []),
  ]) as DataSource[];
  const costUsd =
    artifact?.frontmatter.cost_usd ??
    sumCost(input.result.evidence?.map((e) => e.cost_usd) ?? []);
  const wrote = unique([
    input.result.resultPath,
    input.result.dataPath,
    input.result.reportPath,
  ]);
  const appended = input.result.resultPath
    ? ["wiki/hot.md", "wiki/log.md"]
    : [];
  if (input.result.evidence?.length) appended.push(EVIDENCE_LEDGER_PATH);

  return SpecialistExecutionResultSchema.parse({
    status: resultStatus(input.result, Boolean(artifact)),
    artifact_path: input.result.resultPath,
    data_artifact_path: input.result.dataPath,
    source_paths: sourcePaths,
    data_sources: dataSources,
    confidence: normalizeConfidence(
      artifact?.frontmatter.confidence,
      input.result.degraded,
    ),
    ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    side_effects: {
      wrote,
      appended,
    },
  });
}

export function failedSpecialistExecutionResult(input: {
  message: string;
  durationMs: number;
  recoverable?: boolean;
}): SpecialistExecutionResult {
  return SpecialistExecutionResultSchema.parse({
    status: "failed",
    source_paths: [],
    data_sources: [],
    confidence: "low",
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    side_effects: { wrote: [], appended: [] },
    error: {
      message: input.message,
      recoverable: input.recoverable ?? true,
    },
  });
}

export function skippedSpecialistExecutionResult(input: {
  reason: string;
  durationMs?: number;
}): SpecialistExecutionResult {
  return SpecialistExecutionResultSchema.parse({
    status: "skipped",
    source_paths: [],
    data_sources: [],
    confidence: "low",
    duration_ms: Math.max(0, Math.round(input.durationMs ?? 0)),
    side_effects: { wrote: [], appended: [] },
    skip_reason: input.reason,
  });
}

function resultStatus(
  result: SpecialistResult,
  artifactReadable: boolean,
): SpecialistExecutionResult["status"] {
  if (result.degraded || !artifactReadable) return "partial";
  return "succeeded";
}

function normalizeConfidence(
  confidence: string | undefined,
  degraded: boolean | undefined,
): SpecialistExecutionResult["confidence"] {
  if (confidence === "high" || confidence === "medium" || confidence === "low") {
    return confidence;
  }
  return degraded ? "low" : "medium";
}

function sumCost(costs: number[]): number | undefined {
  if (costs.length === 0) return undefined;
  return Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6));
}

function unique<T extends string | undefined>(values: T[]): Exclude<T, undefined>[] {
  return Array.from(
    new Set(values.filter((value): value is Exclude<T, undefined> => Boolean(value))),
  );
}
