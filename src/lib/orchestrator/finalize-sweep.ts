import "server-only";

import fs from "node:fs";
import { createHash } from "node:crypto";

import { rebuildIndex } from "@/lib/brain/index-render";
import { reindexClient } from "@/lib/brain/index-db";
import { rebuildOverview } from "@/lib/brain/overview-render";
import { resolveVaultRelative } from "@/lib/brain/paths";
import { purgeRawCache } from "@/lib/brain/raw-retention";
import { evaluateBrainReadiness } from "@/lib/brain/readiness";
import { repairBrainReadinessDebt } from "@/lib/brain/readiness-repair";
import { readEvidenceLedger } from "@/lib/brain/evidence-ledger";
import type {
  BrainReadinessReport,
  BrainSuggestion,
} from "@/lib/brain/readiness-types";
import type { Frontmatter, ManifestSource } from "@/lib/brain/types";
import { readNote, writeNote } from "@/lib/brain/vault-fs";
import { appendLogEntry } from "@/lib/orchestrator/audit-trail";
import { readManifest, writeManifest } from "@/lib/orchestrator/client-context";
import { listChildren, type Task } from "@/lib/orchestrator/task";
import { lintVault } from "@/lib/specialists/vault-linter";

export async function finalizeBrainSweep(
  clientSlug: string,
  rootTaskId: string,
): Promise<BrainReadinessReport | null> {
  const manifest = await readManifest(clientSlug);
  if (!manifest) return null;

  const children = listChildren(clientSlug, rootTaskId);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const shortRoot = rootTaskId.slice(0, 8);
  const evidenceCosts = await sourceCostLookup(clientSlug);

  for (const child of children) {
    for (const source of sourcesFromTask(clientSlug, child, now, evidenceCosts)) {
      manifest.sources[source.key] = source.value;
    }
  }
  manifest.last_updated = today;
  await writeManifest(clientSlug, manifest);
  await rebuildOverview(clientSlug, manifest).catch(() => undefined);
  await reindexClient(clientSlug).catch(() => undefined);
  await rebuildIndex(clientSlug).catch(() => undefined);
  await repairBrainReadinessDebt(clientSlug).catch(() => undefined);
  await reindexClient(clientSlug).catch(() => undefined);
  await rebuildIndex(clientSlug).catch(() => undefined);
  const rawPurge = await purgeRawCache(clientSlug).catch(() => ({
    removedFiles: [],
    removedDirs: [],
  }));

  const lint = await lintVault(clientSlug);

  // Secretary's semantic double-check — runs BEFORE readiness so its
  // `review` dimension can downgrade a brain with unresolved high-severity
  // findings (hallucinated competitors, unbacked claims, contradictions).
  // Lazy-loaded: importing the reviewer eagerly would pull the heavy LLM
  // provider graph into every consumer of finalize-sweep. Fail-open: a
  // reviewer error (or, in the unit-test env, an unloadable provider graph)
  // must never break finalization — readiness then just stays neutral because
  // no review is on disk.
  await import("@/lib/specialists/brain-reviewer")
    .then((m) => m.runBrainReview(clientSlug))
    .catch(() => undefined);

  const terminal = summarizeChildren(children);
  const reviewPath = `wiki/reviews/${today}-brain-sweep-${shortRoot}.md`;
  const baseReadiness = await evaluateBrainReadiness(clientSlug, {
    children,
    lintScore: lint.score,
    lintErrors: lint.counts.error,
    reviewPath,
  });
  const readiness = applyPartialSweepStatus(baseReadiness, children, terminal);
  const approved = readiness.status === "deep_ready";
  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: "meta",
    title: `Brain sweep review — ${shortRoot}`,
    created: today,
    updated: today,
    tags: [
      "orchestrator-review",
      "brain-sweep",
      `readiness:${readiness.status}`,
      `task:${shortRoot}`,
    ],
    status: approved ? "accepted" : "needed",
    owner: manifest.manifest_owner,
    confidence: approved ? "high" : readiness.status === "blocked" ? "low" : "medium",
    approval_status: approved ? "approved" : "needs-review",
    risk_level:
      readiness.status === "blocked" || readiness.status === "partial_brain"
        ? "high"
        : approved
          ? "low"
          : "medium",
    rollback_note:
      `This review only summarizes sweep ${rootTaskId}. To roll back, delete ${reviewPath}; specialist artifacts remain tracked separately.`,
  };

  await writeNote(clientSlug, reviewPath, {
    frontmatter,
    body: renderSweepReview(rootTaskId, children, lint, terminal, readiness),
  });
  await bumpHotMd(clientSlug, today);
  await appendLogEntry(clientSlug, {
    title: `brain sweep review · ${shortRoot}`,
    body: [
      `Finalized sweep \`${rootTaskId}\`.`,
      `Deep Brain status: ${readiness.status} (${readiness.score}/100).`,
      `Vault health: ${lint.score}/100 (${lint.counts.error} errors, ${lint.counts.warn} warnings).`,
      `Specialists: ${terminal.succeeded} succeeded, ${terminal.failed} failed, ${terminal.skipped} skipped, ${terminal.cancelled} cancelled.`,
      `Raw retention: ${rawPurge.removedFiles.length} old file(s) purged from \`.raw/\`.`,
      `Review note: \`${reviewPath}\`.`,
    ].join("\n"),
  });
  await reindexClient(clientSlug).catch(() => undefined);
  await rebuildIndex(clientSlug).catch(() => undefined);

  if (readiness.status === "blocked") {
    throw new Error(
      `deep brain readiness blocked: ${terminal.succeeded}/${children.length} specialists succeeded (${terminal.failed} failed, ${terminal.skipped} skipped, ${terminal.cancelled} cancelled); readiness ${readiness.score}/100 (${readiness.status}); vault score ${lint.score}/100 with ${lint.counts.error} errors and ${lint.counts.warn} warnings. Review: ${reviewPath}`,
    );
  }

  return { ...readiness, reviewPath };
}

async function bumpHotMd(clientSlug: string, today: string): Promise<void> {
  const hot = await readNote(clientSlug, "wiki/hot.md").catch(() => null);
  if (!hot) return;
  await writeNote(clientSlug, "wiki/hot.md", {
    frontmatter: {
      ...hot.frontmatter,
      updated: today,
    },
    body: hot.body,
  });
}

function summarizeChildren(children: Task[]) {
  return {
    succeeded: children.filter((c) => c.status === "succeeded").length,
    failed: children.filter((c) => c.status === "failed").length,
    skipped: children.filter(
      (c) => c.status === "cancelled" && c.result_summary?.startsWith("skipped:"),
    ).length,
    cancelled: children.filter(
      (c) => c.status === "cancelled" && !c.result_summary?.startsWith("skipped:"),
    ).length,
  };
}

function applyPartialSweepStatus(
  readiness: BrainReadinessReport,
  children: Task[],
  terminal: ReturnType<typeof summarizeChildren>,
): BrainReadinessReport {
  if (terminal.failed === 0 && terminal.cancelled === 0) return readiness;

  const failedChildren = children.filter(
    (child) =>
      child.status === "failed" ||
      (child.status === "cancelled" &&
        !child.result_summary?.startsWith("skipped:")),
  );
  const firstFailed = failedChildren[0];
  const retryTitle = firstFailed
    ? `Retry ${firstFailed.specialist_id ?? firstFailed.title}`
    : "Retry failed specialist";
  const retrySuggestion: BrainSuggestion = {
    id: "retry-failed-specialist",
    title: retryTitle,
    why_this_matters:
      "The sweep produced usable partial brain artifacts, but at least one required specialist did not complete. Retry the failed specialist before treating the brain as complete.",
    confidence: "high",
    effort: "medium",
    impact: "high",
    cta: {
      type: "run_specialist",
      label: "Retry failed specialist",
      specialistId: firstFailed?.specialist_id ?? undefined,
    },
  };
  const failureBlockers = failedChildren.map((child) => {
    const label = child.specialist_id ?? child.title;
    const summary = child.result_summary ? `: ${child.result_summary}` : "";
    return `${label} did not complete${summary}`;
  });

  return {
    ...readiness,
    status: "partial_brain",
    blockers: uniqueStrings([...failureBlockers, ...readiness.blockers]),
    firstAction: retryTitle,
    suggestions: [
      retrySuggestion,
      ...readiness.suggestions.filter((suggestion) => suggestion.id !== retrySuggestion.id),
    ].slice(0, 5),
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function sourcesFromTask(
  clientSlug: string,
  task: Task,
  now: Date,
  evidenceCosts: Map<string, number>,
): Array<{ key: string; value: ManifestSource }> {
  const out: Array<{ key: string; value: ManifestSource }> = [];
  for (const [kind, rel] of [
    ["artifact", task.result_path],
    ["report", task.result_report_path],
    ["data", task.result_data_path],
  ] as const) {
    if (!rel) continue;
    out.push({
      key: `sweep:${task.id.slice(0, 8)}:${task.specialist_id ?? "unknown"}:${kind}`,
      value: {
        path: rel,
        hash: hashVaultRelative(clientSlug, rel),
        retrieved_at: now.toISOString(),
        cost_usd: evidenceCosts.get(rel) ?? 0,
      },
    });
  }
  return out;
}

async function sourceCostLookup(clientSlug: string): Promise<Map<string, number>> {
  const costs = new Map<string, number>();
  const ledger = await readEvidenceLedger(clientSlug).catch(() => []);
  for (const entry of ledger) {
    if (entry.cost_usd <= 0 || entry.source_paths.length === 0) continue;
    const perSourceCost = entry.cost_usd / entry.source_paths.length;
    for (const sourcePath of entry.source_paths) {
      costs.set(sourcePath, (costs.get(sourcePath) ?? 0) + perSourceCost);
    }
  }
  return costs;
}

function hashVaultRelative(clientSlug: string, relativePath: string): string {
  const absolute = resolveVaultRelative(clientSlug, relativePath);
  if (!fs.existsSync(absolute)) return "";
  const data = fs.readFileSync(absolute);
  return createHash("sha256").update(data).digest("hex");
}

function renderSweepReview(
  rootTaskId: string,
  children: Task[],
  lint: Awaited<ReturnType<typeof lintVault>>,
  terminal: ReturnType<typeof summarizeChildren>,
  readiness: BrainReadinessReport,
): string {
  const lines: string[] = [
    `# Brain sweep review — ${rootTaskId.slice(0, 8)}`,
    "",
    "## Human summary",
    "",
    readiness.status === "deep_ready"
      ? `The Deep Brain is ready for review at ${readiness.score}/100. The orchestrator found enough structure, source coverage, specialist output, synthesis, and next-action clarity for a real handoff.`
      : readiness.status === "needs_data"
        ? `The brain is useful but not complete yet. It scored ${readiness.score}/100 and needs live measurement data before it should be treated as a full marketing brain.`
        : readiness.status === "partial_brain"
          ? `The brain is partially built at ${readiness.score}/100. Usable artifacts were written, but failed specialists must be retried before this is treated as a complete marketing brain.`
        : readiness.status === "blocked"
          ? `The brain is blocked at ${readiness.score}/100. Fix the blockers below before using this as a launch-ready marketing brain.`
          : `The brain is still a draft at ${readiness.score}/100. It has usable artifacts, but the synthesis and evidence layer are not deep enough yet.`,
    "",
    `**Status:** ${readiness.status}`,
    `**Score:** ${readiness.score}/100`,
    readiness.firstAction ? `**Start with:** ${readiness.firstAction}` : "",
    "",
    "## Orchestrator handoff",
    "",
    `**Top opportunities:** ${readiness.opportunitiesFound} priority signal${readiness.opportunitiesFound === 1 ? "" : "s"} found by the sweep.`,
    `**Blockers:** ${readiness.blockers.length ? readiness.blockers.join("; ") : "No blocking execution failures."}`,
    `**First action:** ${readiness.firstAction ?? "Review the readiness summary and choose the highest-impact suggestion."}`,
    "**Acceptance:** the operator can click from chat to this review, from this review to evidence, and from evidence to the related report or vault note inside SEO Office.",
    "**Rollback:** no source evidence is deleted by this review; revert by removing this review note and restoring any managed canonical section from the linked artifact history.",
    "",
    "## Readiness dimensions",
    "",
    "| Area | Score | What it means |",
    "| --- | ---: | --- |",
    ...readiness.dimensions.map(
      (dimension) =>
        `| ${dimension.label} | ${dimension.score}/100 | ${dimension.summary.replace(/\|/g, "/")} |`,
    ),
    "",
    "## Gaps and blockers",
    "",
    readiness.blockers.length
      ? readiness.blockers.map((gap) => `- BLOCKER: ${gap}`).join("\n")
      : "- No blocking execution failures.",
    readiness.gaps.length
      ? readiness.gaps.map((gap) => `- ${gap}`).join("\n")
      : "- No structural or semantic gaps found by the readiness evaluator.",
    "",
    "## Recommended next actions",
    "",
    ...readiness.suggestions.map(
      (suggestion, index) =>
        `${index + 1}. **${suggestion.title}** — ${suggestion.why_this_matters} CTA: ${suggestion.cta.path ? `\`${suggestion.cta.path}\`` : suggestion.cta.href ?? suggestion.cta.specialistId ?? suggestion.cta.label}`,
    ),
    "",
    "## Evidence",
    "",
    ...(readiness.evidencePaths.length
      ? readiness.evidencePaths.map((p) => `- \`${p}\``)
      : ["- No evidence paths were captured."]),
    "",
    `**Sweep task:** \`${rootTaskId}\``,
    `**Specialists:** ${terminal.succeeded}/${children.length} succeeded (${terminal.failed} failed, ${terminal.skipped} skipped, ${terminal.cancelled} cancelled)`,
    `**Vault health:** ${lint.score}/100 (${lint.counts.error} errors, ${lint.counts.warn} warnings, ${lint.counts.info} info)`,
    "",
    "## Specialist results",
    "",
  ];
  for (const child of children) {
    const status = child.status.toUpperCase();
    lines.push(
      `- \`${child.specialist_id ?? "unknown"}\` — ${status}${child.result_summary ? ` — ${child.result_summary}` : ""}`,
    );
    if (child.result_path) lines.push(`  Artifact: \`${child.result_path}\``);
    if (child.result_report_path) lines.push(`  Report: \`${child.result_report_path}\``);
    if (child.result_data_path) lines.push(`  Data: \`${child.result_data_path}\``);
  }

  lines.push("", "## Brain health findings", "");
  if (lint.findings.length === 0) {
    lines.push("No linter findings after finalization.");
  } else {
    for (const finding of lint.findings.slice(0, 20)) {
      lines.push(
        `- ${finding.severity.toUpperCase()} ${finding.rule} ${finding.file ? `\`${finding.file}\`` : ""} — ${finding.message}`,
      );
    }
    if (lint.findings.length > 20) {
      lines.push(`- ... ${lint.findings.length - 20} more findings omitted.`);
    }
  }
  return lines.join("\n");
}
