import "server-only";

import type { Frontmatter } from "@/lib/brain/types";

export const DEFAULT_FRESHNESS_TTL_DAYS = 90;

export const SPECIALIST_FRESHNESS_TTL_DAYS: Record<string, number> = {
  "technical-auditor": 30,
  "technical-deep-auditor": 30,
  "schema-validator": 45,
  "page-analyzer": 45,
  "sitemap-architect": 60,
  "google-suite": 30,
  "google-search-console": 28,
  "google-analytics": 28,
  "hreflang-auditor": 90,
  "drift-monitor": 30,
  "keyword-researcher": 90,
  "competitor-pages": 90,
  "backlink-analyst": 30,
  "geo-specialist": 45,
  "image-auditor": 90,
  "sxo-analyst": 60,
  "brand-strategist": 120,
  "content-strategist": 90,
  "local-seo": 30,
  "maps-intelligence": 30,
  "ecommerce-analyst": 45,
  "programmatic-strategist": 120,
  "flow-framework": 90,
  "topic-clusterer": 90,
  "content-brief-generator": 90,
  "beast-planner": 90,
  "full-site-audit": 45,
  "image-generator": 180,
  "phase-gate": 14,
  "vault-linter": 14,
  "vault-archiver": 180,
  // A semantic review goes stale as soon as the brain changes — keep it short,
  // matching the other verification passes (vault-linter, phase-gate).
  "brain-reviewer": 14,
};

const ARTIFACT_TYPE_TTL_DAYS: Record<string, number> = {
  technical: 30,
  "technical-deep": 30,
  schema: 45,
  page: 45,
  sitemap: 60,
  "google-suite": 30,
  "search-console": 28,
  "google-analytics": 28,
  hreflang: 90,
  drift: 30,
  keywords: 90,
  "competitor-pages": 90,
  backlinks: 30,
  geo: 45,
  images: 90,
  sxo: 60,
  brand: 120,
  content: 90,
  local: 30,
  "maps-intelligence": 30,
  ecommerce: 45,
  "programmatic-program": 120,
  flow: 90,
  "topic-clusters": 90,
  "full-site": 45,
  "image-generator": 180,
  "vault-lint": 14,
  "phase-gate": 14,
  archive: 180,
};

export function freshnessTtlDaysForArtifact(input: {
  type: string;
  frontmatterType: Frontmatter["type"];
}): number {
  if (input.type.startsWith("brief-")) return 90;
  if (input.type.startsWith("beast-plan")) return 90;
  if (input.type.startsWith("flow")) return 90;
  return ARTIFACT_TYPE_TTL_DAYS[input.type] ?? ttlByFrontmatterType(input.frontmatterType);
}

export function addDays(date: string, days: number): string {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return date;
  const next = new Date(parsed + days * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function ttlByFrontmatterType(type: Frontmatter["type"]): number {
  switch (type) {
    case "audit":
      return 45;
    case "deliverable":
    case "page-brief":
    case "keyword-strategy":
      return 90;
    default:
      return DEFAULT_FRESHNESS_TTL_DAYS;
  }
}
