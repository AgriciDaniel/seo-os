import "server-only";
import { z } from "zod";
import {
  registerSpecialist,
  type Specialist,
} from "@/lib/orchestrator/registry";
import { SpecialistExecutionResultSchema } from "@/lib/brain/types";
import { readManifest } from "@/lib/orchestrator/client-context";
import { evaluateBrainReadiness } from "@/lib/brain/readiness";
import { lintVault } from "@/lib/specialists/vault-linter";
import { writeArtifact } from "@/lib/specialists/_lib/artifact";
import { BlockedError } from "@/lib/specialists/_lib/soft-skip";

const PhaseGateInputZ = z.object({
  phase: z
    .enum(["intake", "diagnostic", "discovery", "synthesis", "final"])
    .default("final"),
  label: z.string().min(1).optional(),
});

type PhaseGateInput = z.infer<typeof PhaseGateInputZ>;

const spec: Specialist<PhaseGateInput> = {
  id: "phase-gate",
  name: "Phase Gate",
  description:
    "Read-only readiness checkpoint between Deep Brain phases: lint, canonical debt, evidence, data access, and next action clarity.",
  desk: "orchestrator",
  inputSchema: PhaseGateInputZ,
  async execute(ctx) {
    const input = ctx.input;
    const parsed = PhaseGateInputZ.parse(input);
    const manifest = await readManifest(ctx.clientSlug);
    if (!manifest) throw new Error(`Missing client manifest for ${ctx.clientSlug}`);

    ctx.emit("progress", `Checking ${parsed.phase} phase readiness…`, {
      progress: 0.25,
    });
    const lint = await lintVault(ctx.clientSlug, { stage: "ready" });

    ctx.emit("progress", "Evaluating semantic readiness signals…", {
      progress: 0.55,
    });
    const readiness = await evaluateBrainReadiness(ctx.clientSlug, {
      lintScore: lint.score,
      lintErrors: lint.counts.error,
    });

    const phaseLabel = parsed.label ?? titleCase(parsed.phase);
    const body = renderPhaseGate({
      phaseLabel,
      phase: parsed.phase,
      lint,
      readiness,
    });

    ctx.emit("progress", `Writing ${parsed.phase} phase gate artifact…`, {
      progress: 0.82,
    });
    const artifact = await writeArtifact(
      ctx.clientSlug,
      manifest,
      {
        dir: "audits",
        type: `phase-gate-${parsed.phase}`,
        frontmatterType: "audit",
        title: `${phaseLabel} Phase Gate`,
        body,
        tags: ["phase-gate", parsed.phase, "readiness"],
        risk: readiness.status === "blocked" ? "high" : "medium",
        confidence: readiness.status === "deep_ready" ? "high" : "medium",
        url: manifest.site_under_audit,
        reportSubtitle: `${phaseLabel} readiness checkpoint`,
      },
      {
        facts: [
          `${phaseLabel} phase gate recorded readiness ${readiness.status} at ${readiness.score}/100 with vault lint ${lint.score}/100.`,
        ],
        threadTitle: `${phaseLabel} phase gate`,
        threadRationale:
          "checkpoint phase readiness before the next Deep Brain stage continues",
        statusNote: `${phaseLabel} phase gate completed with status ${readiness.status}.`,
      },
    );

    const readinessStatus = readiness.status as string;
    if (lint.counts.error > 0 || readinessStatus === "blocked") {
      // Throw BlockedError (not plain Error) so the orchestrator
      // routes this through the markBlocked path: status="cancelled"
      // with `blocked:` prefix, distinct yellow ⊠ BLOCKED row in the
      // TaskFeed, and the artifactPath hint lets the click handler
      // open this gate's review file (where the actual error details
      // live) instead of a generic next-action prompt.
      throw new BlockedError(
        `${phaseLabel} phase gate blocked: readiness ${readiness.status} ` +
          `${readiness.score}/100, lint ${lint.score}/100 with ${lint.counts.error} error(s). ` +
          `Review ${artifact.relativePath}.`,
        {
          kind:
            lint.counts.error > 0
              ? "phase-gate-lint-errors"
              : "phase-gate-readiness-blocked",
          tag: "PhaseGateBlocked",
          artifactPath: artifact.relativePath,
        },
      );
    }

    const evidence = [
      {
        claim: `${phaseLabel} phase gate checked vault lint, canonical depth, evidence quality, data access, synthesis, and next-action clarity before later Deep Brain work continued.`,
        provenance: "cached" as const,
        source_paths: [
          artifact.relativePath,
          "wiki/hot.md",
          "wiki/log.md",
          "wiki/index.md",
        ],
        confidence: readiness.status === "blocked" ? ("medium" as const) : ("high" as const),
        cost_usd: 0,
      },
    ];

    const wrote = [
      artifact.relativePath,
      artifact.reportPath,
      artifact.dataPath,
    ].filter((value): value is string => Boolean(value));

    return {
      summary: `${phaseLabel} gate recorded ${readiness.status} readiness (${readiness.score}/100) and lint ${lint.score}/100.`,
      resultPath: artifact.relativePath,
      reportPath: artifact.reportPath,
      dataPath: artifact.dataPath,
      data: {
        phase: parsed.phase,
        readiness_status: readiness.status,
        readiness_score: readiness.score,
        lint_score: lint.score,
        lint_errors: lint.counts.error,
        gaps: readiness.gaps,
        blockers: readiness.blockers,
      },
      evidence,
      degraded: readiness.status !== "deep_ready",
      degradationReason:
        readiness.status === "deep_ready"
          ? undefined
          : `${phaseLabel} gate is advisory until readiness reaches deep_ready.`,
      executionResult: SpecialistExecutionResultSchema.parse({
        status: readiness.status === "deep_ready" ? "succeeded" : "partial",
        artifact_path: artifact.relativePath,
        data_artifact_path: artifact.dataPath,
        source_paths: evidence[0].source_paths,
        data_sources: ["cached"],
        confidence: readiness.status === "deep_ready" ? "high" : "medium",
        cost_usd: 0,
        duration_ms: 0,
        side_effects: {
          wrote,
          appended: [
            "wiki/hot.md",
            "wiki/log.md",
            "wiki/meta/evidence-ledger.jsonl",
          ],
        },
      }),
    };
  },
};

registerSpecialist(spec);

function renderPhaseGate(input: {
  phaseLabel: string;
  phase: PhaseGateInput["phase"];
  lint: Awaited<ReturnType<typeof lintVault>>;
  readiness: Awaited<ReturnType<typeof evaluateBrainReadiness>>;
}): string {
  const { phaseLabel, phase, lint, readiness } = input;
  return [
    "## Executive Summary",
    "",
    `${phaseLabel} is a read-only checkpoint in the Deep Brain build. It does not claim the brain is complete; it records whether the current vault state is healthy enough for the next phase and leaves a source-backed artifact for the final orchestrator review.`,
    "",
    "## Gate Result",
    "",
    `- Phase: ${phase}`,
    `- Readiness: ${readiness.status} (${readiness.score}/100)`,
    `- Vault lint: ${lint.score}/100 (${lint.counts.error} errors, ${lint.counts.warn} warnings)`,
    `- First action: ${readiness.firstAction ?? "Review readiness suggestions"}`,
    "",
    "## Readiness Dimensions",
    "",
    "| Area | Score | Summary |",
    "| --- | ---: | --- |",
    ...readiness.dimensions.map(
      (dimension) =>
        `| ${escapeTable(dimension.label)} | ${dimension.score} | ${escapeTable(dimension.summary)} |`,
    ),
    "",
    "## Gaps",
    "",
    ...(readiness.gaps.length
      ? readiness.gaps.map((gap) => `- ${gap}`)
      : ["- No semantic gaps reported at this checkpoint."]),
    "",
    "## Blockers",
    "",
    ...(readiness.blockers.length
      ? readiness.blockers.map((blocker) => `- ${blocker}`)
      : ["- No hard blockers reported at this checkpoint."]),
    "",
    "## Evidence Paths",
    "",
    ...(readiness.evidencePaths.length
      ? readiness.evidencePaths.map((p) => `- \`${p}\``)
      : ["- No readiness evidence paths were available yet."]),
    "",
    "## Rollback",
    "",
    "This gate writes only an audit artifact, a hot.md fact, a log entry, and an evidence-ledger claim. To roll back, delete this artifact and rerun the affected phase; no source evidence or recommendations are removed.",
  ].join("\n");
}

function titleCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}
