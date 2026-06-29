/**
 * Shared post-run vault writes.
 *
 * Every specialist ends with the same shape: write the audit/deliverable,
 * append a single log entry, and refresh `hot.md` so the next session knows
 * what just happened. The first same-day write uses
 * `wiki/<dir>/<date>-<slug>.md`; reruns keep the original note and add a
 * short run suffix before the extension.
 */
import "server-only";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { writeNote, writeRaw } from "@/lib/brain/vault-fs";
import { resolveVaultRelative } from "@/lib/brain/paths";
import { reindexClient, reindexNoteRow } from "@/lib/brain/index-db";
import { rebuildIndex } from "@/lib/brain/index-render";
import { writeHot } from "@/lib/orchestrator/working-memory";
import { appendLogEntry } from "@/lib/orchestrator/audit-trail";
import type {
  ClientManifest,
  Frontmatter,
  RollbackPlan,
  SpecialistExecutionResult,
} from "@/lib/brain/types";
import { SpecialistExecutionResultSchema } from "@/lib/brain/types";
import type { ReportData } from "@/lib/specialists/_lib/report-data";
import { renderHtmlReport } from "@/lib/reports/renderer";
import { vaultMetadataSourceWikilink } from "@/lib/brain/source-note";
import { addDays, freshnessTtlDaysForArtifact } from "@/lib/specialists/_lib/freshness";

export interface WriteArtifactInput {
  /** "audits" | "deliverables" | "keywords" — relative wiki subdir. */
  dir: "audits" | "deliverables" | "keywords";
  /** kebab-case slug for the file (e.g. "technical", "content"). */
  type: string;
  /** Frontmatter `type` (e.g. "audit", "deliverable"). */
  frontmatterType: Frontmatter["type"];
  /** Display title for the note and the H1. */
  title: string;
  /** Markdown body without H1. */
  body: string;
  /** Tags applied to the note. */
  tags?: string[];
  /** "low" | "medium" | "high" — gets recorded on the note's frontmatter. */
  risk?: "low" | "medium" | "high";
  /** "seed" | "low" | "medium" | "high". */
  confidence?: "seed" | "low" | "medium" | "high";
  /** Optional structured payload. When present, this function writes both
   *  a `.data.json` sidecar and a polished HTML report next to the
   *  markdown. The markdown stays the canonical record. */
  data?: ReportData;
  /** URL the audit was performed against (surfaces in the report header). */
  url?: string;
  /** Subtitle for the HTML report header. */
  reportSubtitle?: string;
  /** Structured rollback plan (Phase 3.1). When omitted we default to
   *  `{ kind: "delete-file", path: <relativePath> }` because every
   *  artifact at minimum writes a markdown file that can be deleted.
   *  Specialists whose side-effects span multiple files or external
   *  systems should pass an explicit plan. */
  rollback?: RollbackPlan;
  /** Actual run cost for this artifact when known; defaults to 0 for pure local checks. */
  costUsd?: number;
  /** Data provenance summary for UI/review surfaces. */
  dataSources?: Array<"live_api" | "cached" | "model_estimate" | "manual">;
  /** Override for artifact freshness. Defaults to specialist/artifact-type policy. */
  freshnessTtlDays?: number;
}

export interface ArtifactResult {
  /** Vault-relative path of the markdown note. */
  relativePath: string;
  /** Vault-relative path of the `.data.json` sidecar (when `data` was provided). */
  dataPath?: string;
  /** Vault-relative path of the polished HTML report (when `data` was provided). */
  reportPath?: string;
  /** Native R5 execution envelope for the artifact write. */
  executionResult: SpecialistExecutionResult;
}

/**
 * Write an audit/deliverable, append a single log entry, refresh hot.md,
 * and re-index the SQLite mirror.
 */
export async function writeArtifact(
  clientSlug: string,
  manifest: ClientManifest,
  input: WriteArtifactInput,
  hotUpdate: {
    /** New "Key Recent Facts" bullets to push onto hot.md (most recent first). */
    facts: string[];
    /** Short thread title to add to Active Threads. */
    threadTitle: string;
    /** One-line rationale for the thread. */
    threadRationale: string;
    /** Plain text Status Note. */
    statusNote: string;
  },
): Promise<ArtifactResult> {
  const today = new Date().toISOString().slice(0, 10);
  const paths = allocateArtifactPaths(clientSlug, input.dir, today, input.type);
  const relativePath = paths.note;
  const freshnessTtlDays =
    input.freshnessTtlDays ??
    freshnessTtlDaysForArtifact({
      type: input.type,
      frontmatterType: input.frontmatterType,
    });

  // Phase-3.1 — structured rollback. Defaults to the smallest possible
  // undo: delete the markdown we just wrote. Specialists with broader
  // side-effects (multi-file generates, external API writes) pass an
  // explicit plan via `input.rollback`. The linter flags any specialist
  // that resorts to `kind: "custom"` so we know where to invest.
  const rollback: RollbackPlan = input.rollback ?? {
    kind: "delete-file",
    path: relativePath,
  };

  const frontmatter: Frontmatter = {
    brain_schema: "marketing-brain.v1",
    type: input.frontmatterType,
    title: input.title,
    created: today,
    updated: today,
    tags: input.tags ?? [input.frontmatterType, input.type, "claude-generated"],
    status: "active",
    owner: manifest.manifest_owner,
    confidence: input.confidence ?? "medium",
    approval_status: "needs-review",
    risk_level: input.risk ?? "low",
    // CLAUDE.md rule #3: every brain note ships with a rollback note so
    // the user (or a future agent) can undo the side-effects of this
    // artifact without re-reading the codebase. The text form below
    // remains for backwards compatibility with existing readers; the
    // structured `rollback` field is the new canonical surface.
    rollback,
    rollback_note: formatRollbackText(rollback, input.type, today),
    cost_usd: normalizeCostUsd(input.costUsd),
    expires_on: addDays(today, freshnessTtlDays),
    sources: [vaultMetadataSourceWikilink(manifest)],
    ...(input.dataSources ? { data_sources: input.dataSources } : {}),
  };

  await writeNote(clientSlug, relativePath, {
    frontmatter,
    body: `# ${input.title}\n\n${input.body.trim()}\n`,
  });

  // Optional structured deliverables — when the specialist emits a typed
  // `data` payload we also persist the sidecar JSON and a polished HTML
  // report next to the markdown. Both are wholly optional; older
  // specialists that haven't been upgraded still work unchanged.
  let dataPath: string | undefined;
  let reportPath: string | undefined;
  if (input.data) {
    dataPath = paths.data;
    await writeRaw(clientSlug, dataPath, JSON.stringify(input.data, null, 2));

    reportPath = paths.report;
    const html = renderHtmlReport(input.data, input.body.trim(), {
      title: input.title,
      subtitle: input.reportSubtitle,
      date: today,
      clientName: manifest.vault.replace(/ marketing-brain$/, ""),
      url: input.url,
    });
    await writeRaw(clientSlug, reportPath, html);
  }

  // Phase-1: pass the DIFF (additions) rather than the pre-merged content.
  // writeHot performs the read+merge INSIDE its per-client mutex, so two
  // parallel specialists finishing at the same time compose correctly —
  // each one's facts are visible to the next one's merge.
  await writeHot(clientSlug, {
    lastUpdated: today,
    newFacts: hotUpdate.facts,
    newChange: `${today}: ${input.type}-specialist wrote ${relativePath}.`,
    newThread: {
      title: hotUpdate.threadTitle,
      rationale: hotUpdate.threadRationale,
      target: relativePath,
    },
    statusNote: hotUpdate.statusNote,
  });

  await appendLogEntry(clientSlug, {
    title: `${input.type} specialist completed`,
    body: `Wrote ${relativePath}.`,
  });

  // Phase-1: incremental reindex of just the note we wrote. Sub-ms and
  // keeps the SQLite mirror honest immediately. We still run a full
  // reindex as a safety net so any sibling files (hot.md, log.md) the
  // helpers touched also land in the index.
  const incrementalOk = await reindexNoteRow(clientSlug, relativePath);
  if (!incrementalOk) {
    // Frontmatter Zod rejected or file missing — fall back to a full
    // walk so the index doesn't silently miss this note.
    await reindexClient(clientSlug);
  } else {
    // Cheap full walk to capture hot.md / log.md updates too. If we move
    // those to incremental upserts later (Phase 2), this becomes redundant.
    await reindexClient(clientSlug);
  }

  // Phase-2: regenerate wiki/index.md so the navigation map reflects
  // the new note. Non-fatal — derived view; failure doesn't crash the
  // specialist run.
  await rebuildIndex(clientSlug);

  const wrote = [relativePath, dataPath, reportPath].filter(
    (value): value is string => Boolean(value),
  );

  return {
    relativePath,
    ...(dataPath ? { dataPath } : {}),
    ...(reportPath ? { reportPath } : {}),
    executionResult: SpecialistExecutionResultSchema.parse({
      status: "succeeded",
      artifact_path: relativePath,
      ...(dataPath ? { data_artifact_path: dataPath } : {}),
      source_paths: frontmatter.sources ?? [],
      data_sources: frontmatter.data_sources ?? [],
      confidence:
        frontmatter.confidence === "high" ||
        frontmatter.confidence === "medium" ||
        frontmatter.confidence === "low"
          ? frontmatter.confidence
          : "low",
      cost_usd: frontmatter.cost_usd ?? 0,
      duration_ms: 0,
      side_effects: {
        wrote,
        appended: ["wiki/hot.md", "wiki/log.md"],
      },
    }),
  };
}

function allocateArtifactPaths(
  clientSlug: string,
  dir: WriteArtifactInput["dir"],
  date: string,
  type: string,
): { note: string; data: string; report: string; runId: string | null } {
  const baseStem = `${date}-${type}`;
  const baseNote = `wiki/${dir}/${baseStem}.md`;
  if (!fs.existsSync(resolveVaultRelative(clientSlug, baseNote))) {
    return {
      note: baseNote,
      data: `wiki/${dir}/${baseStem}.data.json`,
      report: `reports/${baseStem}.html`,
      runId: null,
    };
  }

  for (let i = 0; i < 20; i++) {
    const runId = randomUUID().slice(0, 8);
    const stem = `${baseStem}.${runId}`;
    const note = `wiki/${dir}/${stem}.md`;
    if (!fs.existsSync(resolveVaultRelative(clientSlug, note))) {
      return {
        note,
        data: `wiki/${dir}/${stem}.data.json`,
        report: `reports/${stem}.html`,
        runId,
      };
    }
  }
  throw new Error(`unable to allocate unique artifact path for ${baseNote}`);
}

function normalizeCostUsd(value: number | undefined): number {
  if (!Number.isFinite(value ?? 0)) return 0;
  return Math.max(0, Math.round((value ?? 0) * 1_000_000) / 1_000_000);
}

/**
 * Render a structured `RollbackPlan` into the legacy `rollback_note` text
 * field. Keeps backwards-compatible readers (Specialist Inbox, lint
 * report) working until they're migrated to consume the structured form.
 */
function formatRollbackText(
  plan: RollbackPlan,
  specialistType: string,
  today: string,
): string {
  const prefix = `This ${specialistType} artifact was written ${today}. To roll back: `;
  switch (plan.kind) {
    case "no-op":
      return `${prefix}no-op (pure analysis). Reason: ${plan.reason}`;
    case "delete-file":
      return `${prefix}delete \`${plan.path}\` and revert the matching entry near the top of \`wiki/log.md\`. The SQLite reindex updates automatically on the next read.`;
    case "restore-snapshot":
      return `${prefix}restore the snapshot at \`${plan.snapshotPath}\` (overwrites everything this specialist wrote in this run).`;
    case "custom":
      return `${prefix}${plan.instructions}`;
  }
}
