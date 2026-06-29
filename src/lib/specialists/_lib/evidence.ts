import "server-only";

import type { SpecialistEvidence } from "@/lib/brain/population-contract";

/**
 * Build one source-backed evidence claim for a specialist's result. Centralises
 * the shape so every specialist emits ledger entries the same way (claim +
 * provenance + the artifact/source paths that back it). The orchestrator's
 * job-queue calls appendEvidenceBatch on `result.evidence`, and brain readiness
 * requires ≥10 entries (≥4 from live_api/cached families) before "deep_ready" —
 * so a specialist that writes an artifact but emits no evidence silently starves
 * the readiness gate. Keep `source_paths` pointed at real vault artifacts.
 */
export function buildEvidenceEntry(input: {
  claim: string;
  /** "live_api" / "cached" for real fetched data; "model_estimate" for LLM-derived. */
  provenance: SpecialistEvidence["provenance"];
  /** Vault-relative artifact/source paths backing the claim (≥1). */
  sourcePaths: Array<string | null | undefined>;
  confidence?: SpecialistEvidence["confidence"];
  costUsd?: number;
}): SpecialistEvidence {
  const source_paths = input.sourcePaths.filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return {
    claim: input.claim,
    provenance: input.provenance,
    source_paths,
    confidence: input.confidence ?? "medium",
    cost_usd: input.costUsd ?? 0,
  };
}
