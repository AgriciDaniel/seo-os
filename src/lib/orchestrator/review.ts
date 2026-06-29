import "server-only";
import { readManifest } from "@/lib/orchestrator/client-context";
import { readNote, writeNote } from "@/lib/brain/vault-fs";
import { reindexClient } from "@/lib/brain/index-db";
import type { Frontmatter } from "@/lib/brain/types";
import { EVIDENCE_LEDGER_PATH } from "@/lib/brain/evidence-ledger";
import type { SpecialistResult } from "./registry";

export interface OrchestratorReviewInput {
  clientSlug: string;
  jobId: string;
  specialistId: string;
  result: SpecialistResult;
}

export interface OrchestratorReviewResult {
  reviewPath: string;
  verdict: "approved" | "needs-follow-up";
  summary: string;
}

export async function recordOrchestratorReview(
  input: OrchestratorReviewInput,
): Promise<OrchestratorReviewResult> {
  const today = new Date().toISOString().slice(0, 10);
  const shortJob = input.jobId.slice(0, 8);
  const reviewPath = `wiki/reviews/${today}-${input.specialistId}-${shortJob}.md`;
  const manifest = await readManifest(input.clientSlug);
  const artifact = input.result.resultPath
    ? await readNote(input.clientSlug, input.result.resultPath).catch(() => null)
    : null;

  const checks = [
    {
      label: "Specialist returned a summary",
      ok: input.result.summary.trim().length > 0,
    },
    {
      label: "Specialist wrote a vault artifact",
      ok: Boolean(input.result.resultPath),
    },
    {
      label: "Artifact is readable and schema-valid",
      ok: Boolean(artifact),
    },
    {
      label: "Artifact requires human review before approval",
      ok: artifact?.frontmatter.approval_status === "needs-review",
    },
    {
      label: "Artifact contains rollback guidance",
      ok: Boolean(artifact?.frontmatter.rollback_note || artifact?.frontmatter.rollback_plan),
    },
    {
      label: "Specialist returned source-backed evidence",
      ok: Boolean(input.result.evidence?.length),
    },
    {
      // A specialist that completed in degraded mode (missing/failed
      // integration, e.g. a DataForSEO 401) must NOT be auto-approved — its
      // output was built from partial/absent data. Routing it to
      // needs-follow-up keeps "0 failed" from hiding degraded results and
      // propagates the caveat into the sweep summary + readiness.
      label: "Specialist completed in normal mode (not degraded)",
      ok: !input.result.degraded,
    },
  ];

  const verdict = checks.every((c) => c.ok) ? "approved" : "needs-follow-up";
  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: `Orchestrator review — ${input.specialistId}`,
    created: today,
    updated: today,
    tags: ["orchestrator-review", input.specialistId, "quality-gate"],
    status: verdict === "approved" ? "accepted" : "needed",
    owner: manifest?.manifest_owner ?? "seo-office",
    confidence: verdict === "approved" ? "medium" : "low",
    approval_status: verdict === "approved" ? "approved" : "needs-review",
    risk_level: verdict === "approved" ? "low" : "medium",
    sources: [
      ...(input.result.resultPath ? [`[[${input.result.resultPath}]]`] : []),
      ...(input.result.reportPath ? [`[[${input.result.reportPath}]]`] : []),
      ...(input.result.evidence?.length ? [EVIDENCE_LEDGER_PATH] : []),
    ],
    rollback_note:
      `This review only records the orchestrator quality gate for job ${input.jobId}. ` +
      `To roll back, delete ${reviewPath}; it does not modify the specialist artifact.`,
  };

  const body = [
    `# Orchestrator review — ${input.specialistId}`,
    "",
    `**Verdict:** ${verdict}`,
    `**Job:** ${input.jobId}`,
    `**Artifact:** ${input.result.resultPath ?? "(none)"}`,
    input.result.reportPath ? `**Report:** ${input.result.reportPath}` : "",
    input.result.dataPath ? `**Data:** ${input.result.dataPath}` : "",
    input.result.degraded
      ? `**Degraded mode:** ${input.result.degradationReason ?? "completed with limited data"}`
      : "",
    "",
    "## Specialist Summary",
    input.result.summary || "(empty)",
    "",
    "## Evidence",
    input.result.evidence?.length
      ? `Evidence ledger: ${EVIDENCE_LEDGER_PATH}`
      : "",
    ...(input.result.evidence?.length
      ? input.result.evidence.map(
          (e) =>
            `- ${e.claim} (${e.provenance}, confidence: ${e.confidence}, cost: $${e.cost_usd.toFixed(4)})\n  Sources: ${e.source_paths.join(", ")}`,
        )
      : ["- No structured evidence returned."]),
    "",
    "## Checks",
    ...checks.map((c) => `- ${c.ok ? "[x]" : "[ ]"} ${c.label}`),
    "",
    "## Orchestrator Decision",
    verdict === "approved"
      ? "The specialist output passed the baseline quality gate. It is still marked for human review where the artifact itself requests it."
      : "The specialist output needs follow-up. Re-run or ask the orchestrator to inspect the missing check before using this artifact operationally.",
  ]
    .filter(Boolean)
    .join("\n");

  await writeNote(input.clientSlug, reviewPath, {
    frontmatter,
    body,
  });
  await reindexClient(input.clientSlug);

  return {
    reviewPath,
    verdict,
    summary: `${input.specialistId} review ${verdict}`,
  };
}
