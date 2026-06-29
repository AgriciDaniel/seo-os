import "server-only";

import type { ClientManifest } from "@/lib/brain/types";
import type { TaskTemplate, TemplateChild } from "@/lib/orchestrator/task-templates";

export interface SpecialistCostEstimate {
  specialist_id: string;
  dataforseo_usd: number;
  anthropic_usd: number;
  duration_ms: number;
  total_usd: number;
}

export interface SweepCostPreflight {
  dataforseo_usd: number;
  anthropic_usd: number;
  duration_ms: number;
  total_usd: number;
  month_to_date_usd: number;
  projected_month_total_usd: number;
  monthly_cost_cap_usd: number | null;
  over_cap: boolean;
  estimates: SpecialistCostEstimate[];
}

const ZERO_COST_IDS = new Set([
  "vault-linter",
  "phase-gate",
  "vault-archiver",
  "google-search-console",
  "google-analytics",
]);

const DATAFORSEO_HEAVY_IDS = new Set([
  "keyword-researcher",
  "topic-clusterer",
  "content-brief-generator",
  "competitor-pages",
  "ecommerce-analyst",
  "geo-specialist",
  "local-seo",
  "maps-intelligence",
  "sxo-analyst",
]);

const DATAFORSEO_LIGHT_IDS = new Set([
  "backlink-analyst",
  "image-auditor",
  "technical-auditor",
]);

export function estimateSpecialistCost(input: {
  specialistId: string;
  manifest?: ClientManifest | null;
  child?: TemplateChild;
}): SpecialistCostEstimate {
  const id = input.specialistId;
  const anthropic = ZERO_COST_IDS.has(id) ? 0 : 0.035;
  const dataforseo = DATAFORSEO_HEAVY_IDS.has(id)
    ? 0.035
    : DATAFORSEO_LIGHT_IDS.has(id)
      ? 0.01
      : 0;
  const duration = ZERO_COST_IDS.has(id)
    ? 8_000
    : DATAFORSEO_HEAVY_IDS.has(id)
      ? 90_000
      : 60_000;
  return normalizeEstimate({
    specialist_id: id,
    dataforseo_usd: dataforseo,
    anthropic_usd: anthropic,
    duration_ms: duration,
    total_usd: dataforseo + anthropic,
  });
}

export function estimateTemplateCost(input: {
  template: TaskTemplate;
  manifest?: ClientManifest | null;
  now?: Date;
}): SweepCostPreflight {
  const estimates = input.template.children.map((child) =>
    estimateSpecialistCost({
      specialistId: child.specialist_id,
      manifest: input.manifest,
      child,
    }),
  );
  return rollupCostEstimate({
    estimates,
    manifest: input.manifest,
    now: input.now,
  });
}

export function estimateChildrenCost(input: {
  children: Array<{ specialist_id: string }>;
  manifest?: ClientManifest | null;
  now?: Date;
}): SweepCostPreflight {
  const estimates = input.children.map((child) =>
    estimateSpecialistCost({
      specialistId: child.specialist_id,
      manifest: input.manifest,
    }),
  );
  return rollupCostEstimate({
    estimates,
    manifest: input.manifest,
    now: input.now,
  });
}

export function currentMonthSpendUsd(
  manifest: ClientManifest | null | undefined,
  now = new Date(),
): number {
  if (!manifest) return 0;
  const month = now.toISOString().slice(0, 7);
  return roundUsd(
    Object.values(manifest.sources ?? {}).reduce((sum, source) => {
      if (!source.retrieved_at.startsWith(month)) return sum;
      return sum + source.cost_usd;
    }, 0),
  );
}

export function formatCostCapError(preflight: SweepCostPreflight): string {
  const cap = preflight.monthly_cost_cap_usd ?? 0;
  return [
    "cost_cap_exceeded:",
    `estimated sweep cost $${preflight.total_usd.toFixed(2)}`,
    `plus month-to-date $${preflight.month_to_date_usd.toFixed(2)}`,
    `would exceed monthly cap $${cap.toFixed(2)}`,
  ].join(" ");
}

function rollupCostEstimate(input: {
  estimates: SpecialistCostEstimate[];
  manifest?: ClientManifest | null;
  now?: Date;
}): SweepCostPreflight {
  const dataforseo = roundUsd(
    input.estimates.reduce((sum, estimate) => sum + estimate.dataforseo_usd, 0),
  );
  const anthropic = roundUsd(
    input.estimates.reduce((sum, estimate) => sum + estimate.anthropic_usd, 0),
  );
  const total = roundUsd(dataforseo + anthropic);
  const mtd = currentMonthSpendUsd(input.manifest, input.now);
  const cap = input.manifest?.monthly_cost_cap_usd ?? null;
  const projected = roundUsd(mtd + total);
  return {
    dataforseo_usd: dataforseo,
    anthropic_usd: anthropic,
    duration_ms: input.estimates.reduce(
      (sum, estimate) => sum + estimate.duration_ms,
      0,
    ),
    total_usd: total,
    month_to_date_usd: mtd,
    projected_month_total_usd: projected,
    monthly_cost_cap_usd: cap,
    over_cap: cap != null && projected > cap,
    estimates: input.estimates.map(normalizeEstimate),
  };
}

function normalizeEstimate(estimate: SpecialistCostEstimate): SpecialistCostEstimate {
  return {
    ...estimate,
    dataforseo_usd: roundUsd(estimate.dataforseo_usd),
    anthropic_usd: roundUsd(estimate.anthropic_usd),
    total_usd: roundUsd(estimate.total_usd),
    duration_ms: Math.max(0, Math.round(estimate.duration_ms)),
  };
}

function roundUsd(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1_000_000) / 1_000_000);
}
