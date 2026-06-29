import "server-only";

import type { ClientManifest } from "@/lib/brain/types";
import { getDb } from "@/lib/brain/index-db";
import { readEvidenceLedger } from "@/lib/brain/evidence-ledger";
import {
  readStructuredLog,
  summarizePromptCache,
} from "@/lib/brain/structured-log";
import { countHighRiskReviewQueue } from "@/lib/brain/review-queue";
import { readManifest } from "@/lib/orchestrator/client-context";
import { runProviderSmoke } from "@/lib/setup/provider-smoke";
import { lintVault } from "@/lib/specialists/vault-linter";

export interface OfficeOperationalStatus {
  costUsd: number;
  cacheHitRate: number | null;
  cacheReadInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  evidenceCount: number;
  cachedEvidenceCount: number;
  highRiskReviewCount: number;
  brainHealth: {
    score: number;
    clean: boolean;
  };
  lastSweep: {
    status: string;
    readinessStatus: string | null;
    updatedAt: string;
    costUsd: number;
  } | null;
  integrations: {
    configured: number;
    total: number;
    requiredConfigured: number;
    requiredTotal: number;
    launchReady: boolean;
  };
}

export async function officeOperationalStatus(
  clientSlug: string,
  manifestInput?: ClientManifest | null,
): Promise<OfficeOperationalStatus> {
  const [manifest, evidence, providers, structuredLog, lintReport] = await Promise.all([
    manifestInput === undefined ? readManifest(clientSlug).catch(() => null) : manifestInput,
    readEvidenceLedger(clientSlug).catch(() => []),
    runProviderSmoke({ live: false }).catch(() => null),
    readStructuredLog(clientSlug).catch(() => []),
    lintVault(clientSlug).catch(() => null),
  ]);

  const costUsd = Object.values(manifest?.sources ?? {}).reduce(
    (sum, source) => sum + source.cost_usd,
    0,
  );
  const cachedEvidenceCount = evidence.filter(
    (entry) => entry.provenance === "cached",
  ).length;
  const evidenceWithCacheSignal = evidence.filter(
    (entry) => entry.provenance === "cached" || entry.provenance === "live_api",
  ).length;
  const evidenceCacheHitRate =
    evidenceWithCacheSignal > 0 ? cachedEvidenceCount / evidenceWithCacheSignal : null;
  const latestSweepRows = filterLatestSweepPromptRows(clientSlug, structuredLog);
  const promptCache = summarizePromptCache(latestSweepRows);
  const cacheHitRate = promptCache.cacheHitRate ?? evidenceCacheHitRate;

  const configured = providers
    ? providers.results.filter((result) => result.configured).length
    : 0;
  const requiredConfigured = providers
    ? providers.results.filter((result) => result.required && result.configured).length
    : 0;

  return {
    costUsd,
    cacheHitRate,
    cacheReadInputTokens:
      promptCache.cacheHitRate === null ? null : promptCache.cacheReadInputTokens,
    cacheCreationInputTokens:
      promptCache.cacheHitRate === null ? null : promptCache.cacheCreationInputTokens,
    evidenceCount: evidence.length,
    cachedEvidenceCount,
    highRiskReviewCount: countHighRiskReviewQueue(clientSlug),
    brainHealth: {
      score: lintReport?.score ?? 0,
      clean: lintReport?.clean ?? false,
    },
    lastSweep: latestSweepStatus(clientSlug, latestSweepRows),
    integrations: {
      configured,
      total: providers?.results.length ?? 0,
      requiredConfigured,
      requiredTotal: providers?.requiredIds.length ?? 0,
      launchReady: providers?.launchReady ?? false,
    },
  };
}

function filterLatestSweepPromptRows<T extends { job_id?: string; cost_usd?: number }>(
  clientSlug: string,
  rows: T[],
): T[] {
  if (rows.length === 0) return rows;
  try {
    const db = getDb();
    const root = db
      .prepare(
        `SELECT id
         FROM tasks
         WHERE client_slug = ? AND kind = 'sweep' AND parent_task_id IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug) as { id: string } | undefined;
    if (!root) return rows;
    const jobRows = db
      .prepare(
        `SELECT assignments.job_id
         FROM tasks
         JOIN assignments ON assignments.id = tasks.assignment_id
         WHERE tasks.client_slug = ?
           AND tasks.parent_task_id = ?
           AND assignments.job_id IS NOT NULL`,
      )
      .all(clientSlug, root.id) as Array<{ job_id: string }>;
    const jobIds = new Set(jobRows.map((row) => row.job_id));
    if (jobIds.size === 0) return rows;
    const latestSweepRows = rows.filter((row) => row.job_id && jobIds.has(row.job_id));
    return latestSweepRows.length > 0 ? latestSweepRows : rows;
  } catch {
    return rows;
  }
}

function latestSweepStatus<T extends { cost_usd?: number }>(
  clientSlug: string,
  latestSweepRows: T[],
): OfficeOperationalStatus["lastSweep"] {
  try {
    const row = getDb()
      .prepare(
        `SELECT status, result_summary, updated_at
         FROM tasks
         WHERE client_slug = ? AND kind = 'sweep' AND parent_task_id IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(clientSlug) as
      | { status: string; result_summary: string | null; updated_at: string }
      | undefined;
    if (!row) return null;
    return {
      status: row.status,
      readinessStatus: parseReadinessStatus(row.result_summary),
      updatedAt: row.updated_at,
      costUsd: roundUsd(
        latestSweepRows.reduce((sum, item) => sum + (item.cost_usd ?? 0), 0),
      ),
    };
  } catch {
    return null;
  }
}

function parseReadinessStatus(summary: string | null): string | null {
  if (!summary) return null;
  const match = /\b(deep_ready|partial_brain|needs_data|blocked|draft)\b/.exec(summary);
  return match?.[1] ?? null;
}

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1_000_000) / 1_000_000);
}
