import "server-only";

import { randomUUID } from "node:crypto";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";

export const STRUCTURED_LOG_RELATIVE = "wiki/log.json";

export interface StructuredLogRow {
  id: string;
  timestamp: string;
  type: "llm_call";
  provider: string;
  model: string;
  client_slug: string;
  job_id?: string;
  specialist_id?: string;
  duration_ms: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface PromptCacheSummary {
  rows: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number;
  cacheHitRate: number | null;
}

const writeChains = new Map<string, Promise<void>>();

export async function appendStructuredLogRow(
  clientSlug: string,
  row: Omit<StructuredLogRow, "id" | "timestamp" | "client_slug"> & {
    id?: string;
    timestamp?: string;
    client_slug?: string;
  },
): Promise<StructuredLogRow> {
  const fullRow: StructuredLogRow = {
    id: row.id ?? randomUUID(),
    timestamp: row.timestamp ?? new Date().toISOString(),
    client_slug: row.client_slug ?? clientSlug,
    type: row.type,
    provider: row.provider,
    model: row.model,
    duration_ms: row.duration_ms,
    cost_usd: row.cost_usd,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cache_read_input_tokens: row.cache_read_input_tokens,
    cache_creation_input_tokens: row.cache_creation_input_tokens,
    ...(row.job_id ? { job_id: row.job_id } : {}),
    ...(row.specialist_id ? { specialist_id: row.specialist_id } : {}),
  };

  await withClientLock(clientSlug, async () => {
    const rows = await readStructuredLog(clientSlug);
    rows.push(fullRow);
    await writeRaw(clientSlug, STRUCTURED_LOG_RELATIVE, `${JSON.stringify(rows, null, 2)}\n`);
  });
  return fullRow;
}

export async function readStructuredLog(clientSlug: string): Promise<StructuredLogRow[]> {
  const raw = await readRaw(clientSlug, STRUCTURED_LOG_RELATIVE);
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStructuredLogRow);
  } catch {
    return [];
  }
}

export function summarizePromptCache(rows: StructuredLogRow[]): PromptCacheSummary {
  const summary = rows.reduce(
    (acc, row) => {
      acc.cacheReadInputTokens += row.cache_read_input_tokens;
      acc.cacheCreationInputTokens += row.cache_creation_input_tokens;
      acc.inputTokens += row.input_tokens;
      acc.outputTokens += row.output_tokens;
      acc.durationMs += row.duration_ms;
      acc.costUsd += row.cost_usd;
      return acc;
    },
    {
      rows: rows.length,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      costUsd: 0,
      cacheHitRate: null as number | null,
    },
  );
  const cacheable =
    summary.cacheReadInputTokens + summary.cacheCreationInputTokens;
  summary.cacheHitRate =
    cacheable > 0 ? summary.cacheReadInputTokens / cacheable : null;
  summary.costUsd = Number(summary.costUsd.toFixed(6));
  return summary;
}

function withClientLock<T>(clientSlug: string, fn: () => Promise<T>): Promise<T> {
  const previous = writeChains.get(clientSlug) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  writeChains.set(
    clientSlug,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

function isStructuredLogRow(value: unknown): value is StructuredLogRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<StructuredLogRow>;
  return (
    row.type === "llm_call" &&
    typeof row.id === "string" &&
    typeof row.timestamp === "string" &&
    typeof row.provider === "string" &&
    typeof row.model === "string" &&
    typeof row.client_slug === "string" &&
    typeof row.duration_ms === "number" &&
    typeof row.cost_usd === "number" &&
    typeof row.input_tokens === "number" &&
    typeof row.output_tokens === "number" &&
    typeof row.cache_read_input_tokens === "number" &&
    typeof row.cache_creation_input_tokens === "number"
  );
}
