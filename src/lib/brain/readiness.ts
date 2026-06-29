import "server-only";

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

import { listNotes, readRaw } from "@/lib/brain/vault-fs";
import { resolveVaultRelative, vaultRoot } from "@/lib/brain/paths";
import { getDb } from "@/lib/brain/index-db";
import type { Task } from "@/lib/orchestrator/task";
import { INTEGRATIONS } from "@/lib/integrations/catalog";
import { adcAvailableSync, hasScopeSync, SCOPE } from "@/lib/integrations/gcloud";
import { mergedRuntimeEnv } from "@/lib/setup/env-local";
import { readManifest } from "@/lib/orchestrator/client-context";
import { EVIDENCE_LEDGER_PATH, readEvidenceLedger } from "./evidence-ledger";
import { readBrainReview } from "./brain-review";
import type {
  BrainReadinessDimension,
  BrainReadinessReport,
  BrainSuggestion,
} from "./readiness-types";
import {
  CANONICAL_BRAIN_TARGETS,
  CANONICAL_MANAGED_SECTIONS,
  managedSectionEnd,
  managedSectionStart,
} from "./population-contract";

interface EvaluateOptions {
  children?: Task[];
  lintScore?: number;
  lintErrors?: number;
  dataAccessOverride?: "present" | "missing";
  reviewPath?: string;
}

const REQUIRED_CORE = [
  "wiki/hot.md",
  "wiki/log.md",
  "wiki/index.md",
  "wiki/overview.md",
] as const;

const CATEGORY_MINIMUMS = {
  "wiki/sources/": 3,
  "wiki/entities/": 3,
  "wiki/decisions/": 3,
  "wiki/flows/": 6,
  "wiki/keywords/": 3,
  "wiki/deliverables/": 2,
  "wiki/pages/": 4,
  "wiki/audits/": 5,
  "wiki/reviews/": 1,
} as const;

const SYNTHESIS_TERMS = [
  "executive summary",
  "top opportunities",
  "risk",
  "30",
  "60",
  "90",
  "acceptance",
  "rollback",
] as const;

const FINAL_REVIEW_TERMS = [
  "top opportunities",
  "blockers",
  "first action",
  "acceptance",
  "rollback",
] as const;

const CANONICAL_NOTE_MIN_WORDS = 150;
const DEEP_READY_MIN_EVIDENCE_ENTRIES = 10;
const DEEP_READY_MIN_LIVE_OR_CACHED_FAMILIES = 4;

const SEED_DEBT_PATTERNS = [
  /skill fills/i,
  /pending source/i,
  /tbd pending/i,
  /example only/i,
  /replace this/i,
  /\{\{[^}]+\}\}/,
] as const;

export async function evaluateBrainReadiness(
  clientSlug: string,
  options: EvaluateOptions = {},
): Promise<BrainReadinessReport> {
  const notes = await listNotes(clientSlug);
  const noteSet = new Set(notes);
  const gaps: string[] = [];
  const blockers: string[] = [];
  const evidencePaths = new Set<string>();

  for (const core of REQUIRED_CORE) {
    if (noteSet.has(core)) {
      evidencePaths.add(core);
    } else {
      blockers.push(`The core brain file ${core} is missing.`);
    }
  }

  const categoryCounts = countCategories(notes);
  for (const [prefix, min] of Object.entries(CATEGORY_MINIMUMS)) {
    const count = categoryCounts[prefix] ?? 0;
    if (count < min) {
      gaps.push(
        `${humanCategory(prefix)} is thin: ${count}/${min} expected starter notes.`,
      );
    }
  }

  const dataStatus = await resolveDataAccess(clientSlug, options.dataAccessOverride);
  if (!dataStatus.hasAccess) {
    gaps.push(
      "Live measurement data is not connected yet, so the brain is advisory instead of evidence-complete.",
    );
  }

  const specialist = summarizeSpecialists(options.children ?? []);
  if (specialist.failed > 0 || specialist.cancelled > 0) {
    blockers.push(
      `${specialist.failed} specialist jobs failed and ${specialist.cancelled} were cancelled.`,
    );
  }
  if (specialist.skipped > 0) {
    gaps.push(`${specialist.skipped} specialist jobs skipped because required inputs were missing.`);
  }

  const synthesis = await inspectSynthesis(clientSlug, notes, options.reviewPath);
  for (const p of synthesis.evidencePaths) evidencePaths.add(p);
  gaps.push(...synthesis.gaps);

  const canonical = await inspectCanonicalCompleteness(clientSlug, noteSet);
  for (const p of canonical.evidencePaths) evidencePaths.add(p);
  gaps.push(...canonical.gaps);

  const evidence = await inspectEvidenceQuality(clientSlug);
  if (evidence.entryCount > 0) evidencePaths.add(EVIDENCE_LEDGER_PATH);
  for (const p of evidence.evidencePaths) evidencePaths.add(p);
  gaps.push(...evidence.gaps);

  // Semantic review — the Brain Reviewer's findings DOWNGRADE the score and
  // surface as gaps, but never block (only `blockers` block). A brain with
  // hallucinations or contradictions must not reach deep_ready even when its
  // structure is perfect.
  const review = await inspectBrainReview(clientSlug);
  if (review.reportPath) evidencePaths.add(review.reportPath);
  gaps.push(...review.gaps);

  const reports = await listReports(clientSlug);
  for (const report of reports.slice(0, 5)) evidencePaths.add(report);
  if (reports.length < 3) {
    gaps.push(`Reports are thin: ${reports.length}/3 expected rendered reports.`);
  }

  if ((options.lintErrors ?? 0) > 0) {
    blockers.push(`Vault lint still has ${options.lintErrors} error(s).`);
  }

  const rawDimensions: BrainReadinessDimension[] = [
    {
      key: "structure",
      label: "Structure",
      score: scoreRatio(
        REQUIRED_CORE.filter((p) => noteSet.has(p)).length +
          Object.entries(CATEGORY_MINIMUMS).filter(
            ([prefix, min]) => (categoryCounts[prefix] ?? 0) >= min,
          ).length,
        REQUIRED_CORE.length + Object.keys(CATEGORY_MINIMUMS).length,
      ),
      summary: "Core vault files and Rituaria-style category coverage.",
    },
    {
      key: "canonical_note_depth",
      label: "Canonical brain depth",
      score: canonical.score,
      summary:
        canonical.seedDebtCount === 0
          ? "Canonical Marketing Brain notes have managed SEO Office sections."
          : `${canonical.seedDebtCount} canonical note(s) still look like seed/template debt.`,
    },
    {
      key: "data_access",
      label: "Data access",
      score: dataStatus.hasAccess ? 100 : 45,
      summary: dataStatus.hasAccess
        ? `Connected: ${dataStatus.sources.join(", ")}.`
        : "No Search Console, GA4, DataForSEO, Google API, or Bing source is confirmed.",
    },
    {
      key: "evidence_quality",
      label: "Evidence quality",
      score: evidence.score,
      summary:
        evidence.entryCount === 0
          ? "No first-class evidence ledger is present."
          : `${evidence.entryCount} evidence claim(s), ${evidence.liveOrCachedFamilies} live/cached source family/families.`,
    },
    {
      key: "source_depth",
      label: "Source depth",
      score: clamp(Math.round(((categoryCounts["wiki/sources/"] ?? 0) / 6) * 100)),
      summary: "Evidence-backed source notes and manifest entries.",
    },
    {
      key: "source_specificity",
      label: "Source specificity",
      score: evidence.sourceSpecificityScore,
      summary:
        evidence.sourceFamilyCount === 0
          ? "No source families are referenced by evidence claims."
          : `Evidence references ${evidence.sourceFamilyCount} distinct source family/families.`,
    },
    {
      key: "specialist_coverage",
      label: "Specialist coverage",
      score:
        specialist.total === 0
          ? 50
          : scoreRatio(specialist.succeeded, specialist.total) -
            specialist.failed * 15 -
            specialist.skipped * 8,
      summary:
        specialist.total === 0
          ? "No sweep children were supplied to this evaluator."
          : `${specialist.succeeded}/${specialist.total} specialists succeeded.`,
    },
    {
      key: "synthesis_quality",
      label: "Synthesis quality",
      score: synthesis.score,
      summary: synthesis.summary,
    },
    {
      key: "actionability",
      label: "Actionability",
      score: synthesis.actionabilityScore,
      summary: synthesis.hasAction
        ? "The plan and final review include first action, acceptance criteria, and rollback guidance."
        : "The handoff lacks enough action, acceptance, or rollback detail.",
    },
    {
      key: "integration_completeness",
      label: "Integration completeness",
      score: dataStatus.hasAccess
        ? scoreRatio(dataStatus.sources.length, dataStatus.sources.length + dataStatus.missingSources.length)
        : 25,
      summary: dataStatus.missingSources.length
        ? `Missing: ${dataStatus.missingSources.join(", ")}.`
        : "Required measurement integrations are represented.",
    },
    {
      key: "next_action_clarity",
      label: "Next-action clarity",
      score: synthesis.hasAction ? 100 : 55,
      summary: synthesis.hasAction
        ? "The brain names a clear first action and acceptance criteria."
        : "The next step is still vague or buried in task logs.",
    },
    {
      key: "review",
      label: "Semantic review",
      score: review.dimensionScore,
      summary: review.summary,
    },
  ];
  const dimensions = rawDimensions.map((d) => ({ ...d, score: clamp(d.score) }));

  // The eleven weighted dimensions sum to 1.0; "review" carries weight 0 (it
  // is a display row). Its real impact is the subtractive penalty below plus
  // the high-severity gate on deep_ready — so a flagged review downgrades the
  // score without distorting the established dimension weighting.
  const weighted = dimensions.reduce(
    (sum, d) => sum + d.score * dimensionWeight(d.key),
    0,
  );
  const score = clamp(Math.round(weighted) - review.penalty);

  const status =
    blockers.length > 0
      ? "blocked"
      : specialist.skipped > 0
        ? "needs_data"
      : !dataStatus.hasAccess
        ? "needs_data"
        : score >= 92 &&
            review.highSeverity === 0 &&
            synthesis.score >= 85 &&
            synthesis.finalReviewScore >= 85 &&
            canonical.score >= 85 &&
            canonical.seedDebtCount === 0 &&
            canonical.shallowCount === 0 &&
            evidence.entryCount >= DEEP_READY_MIN_EVIDENCE_ENTRIES &&
            evidence.liveOrCachedFamilies >= DEEP_READY_MIN_LIVE_OR_CACHED_FAMILIES
          ? "deep_ready"
          : "draft";

  const suggestions = buildSuggestions({
    status,
    gaps,
    missingDataSources: dataStatus.missingSources,
    synthesis,
    reviewPath: options.reviewPath,
    evidencePaths: Array.from(evidencePaths),
  });

  return {
    status,
    score,
    dimensions,
    gaps: unique(gaps).slice(0, 12),
    blockers: unique(blockers),
    missingDataSources: dataStatus.missingSources,
    evidencePaths: Array.from(evidencePaths).slice(0, 20),
    reviewPath: options.reviewPath,
    firstAction: suggestions[0]?.title,
    opportunitiesFound: Math.max(
      synthesis.opportunities,
      Math.min(8, categoryCounts["wiki/decisions/"] ?? 0),
    ),
    suggestions,
  };
}

function countCategories(notes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const note of notes) {
    for (const prefix of Object.keys(CATEGORY_MINIMUMS)) {
      if (note.startsWith(prefix) && !note.endsWith("/_index.md")) {
        counts[prefix] = (counts[prefix] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** Maps a specialist to the data source its degradation should downgrade. */
const SPECIALIST_DATA_SOURCE: Record<string, string> = {
  "google-search-console": "Search Console",
  "google-analytics": "GA4",
  "google-suite": "Google",
  "competitor-pages": "DataForSEO",
  "keyword-researcher": "DataForSEO",
  "backlink-analyst": "DataForSEO",
  "ecommerce-analyst": "DataForSEO",
  "geo-specialist": "DataForSEO",
  "sxo-analyst": "DataForSEO",
  "maps-intelligence": "DataForSEO",
};

/**
 * Data sources whose MOST RECENT specialist run completed degraded (result
 * envelope status "partial" — e.g. a DataForSEO key present but lacking SERP
 * scope returning 401). Lets data-access reflect runtime VALIDITY, not just key
 * presence. Reads the jobs table directly (leaf-level getDb, no cycle).
 */
function degradedDataSources(clientSlug: string): Set<string> {
  const degraded = new Set<string>();
  let rows: Array<{ specialist: string; result_envelope: string | null }>;
  try {
    rows = getDb()
      .prepare(
        "SELECT specialist, result_envelope FROM jobs WHERE client_slug = ? ORDER BY created_at DESC LIMIT 80",
      )
      .all(clientSlug) as Array<{ specialist: string; result_envelope: string | null }>;
  } catch {
    return degraded;
  }
  const seen = new Set<string>();
  for (const row of rows) {
    const source = SPECIALIST_DATA_SOURCE[row.specialist];
    if (!source || seen.has(row.specialist)) continue;
    seen.add(row.specialist); // first seen = latest run (DESC by created_at)
    if (!row.result_envelope) continue;
    try {
      const env = JSON.parse(row.result_envelope) as { status?: string };
      if (env.status === "partial") degraded.add(source);
    } catch {
      /* malformed envelope — ignore */
    }
  }
  return degraded;
}

function sourceIsDegraded(source: string, degraded: Set<string>): boolean {
  const lower = source.toLowerCase();
  for (const token of degraded) {
    if (lower.includes(token.toLowerCase())) return true;
  }
  return false;
}

async function resolveDataAccess(
  clientSlug: string,
  override?: "present" | "missing",
) {
  if (override === "present") {
    return { hasAccess: true, sources: ["test-data"], missingSources: [] };
  }
  if (process.env.SEO_OFFICE_E2E_DEEP_BRAIN_FIXTURE === "1") {
    const manifest = await readManifest(clientSlug).catch(() => null);
    const declared = new Set(
      (manifest?.measurement_access ?? []).map((id) => id.toLowerCase()),
    );
    const sources = [
      declared.has("search-console") || declared.has("google-search-console")
        ? "Search Console fixture"
        : null,
      declared.has("ga4") || declared.has("google-analytics") ? "GA4 fixture" : null,
      declared.has("dataforseo") ? "DataForSEO fixture" : null,
    ].filter((source): source is string => Boolean(source));
    const missingSources = ["Search Console", "GA4", "DataForSEO"].filter(
      (name) => !sources.some((source) => source.toLowerCase().includes(name.toLowerCase())),
    );
    return {
      hasAccess: sources.length > 0,
      sources,
      missingSources,
    };
  }
  if (override === "missing") {
    return {
      hasAccess: false,
      sources: [],
      missingSources: ["Search Console", "GA4", "DataForSEO"],
    };
  }

  const sources: string[] = [];
  if (adcAvailableSync()) {
    if (hasScopeSync(SCOPE.searchConsole)) sources.push("Search Console");
    if (hasScopeSync(SCOPE.ga4)) sources.push("GA4");
  }
  const env = mergedRuntimeEnv();
  for (const id of ["dataforseo", "google", "bing"]) {
    const integration = INTEGRATIONS.find((i) => i.id === id);
    if (integration?.isConfigured(env)) sources.push(integration.name);
  }
  // Reflect runtime validity, not just key presence: downgrade any source whose
  // latest specialist run degraded (e.g. DataForSEO 401 on SERP scope). Degraded
  // sources are annotated and excluded from the "has access" health check, so
  // the readiness summary stops claiming "connected/100" for a broken key.
  const degraded = degradedDataSources(clientSlug);
  const annotatedSources = sources.map((source) =>
    sourceIsDegraded(source, degraded) ? `${source} (last run degraded)` : source,
  );
  const healthySources = sources.filter((source) => !sourceIsDegraded(source, degraded));
  const missingSources = ["Search Console", "GA4", "DataForSEO"].filter(
    (name) => !sources.some((source) => source.toLowerCase().includes(name.toLowerCase())),
  );
  return { hasAccess: healthySources.length > 0, sources: annotatedSources, missingSources };
}

function summarizeSpecialists(children: Task[]) {
  return {
    total: children.length,
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

async function inspectCanonicalCompleteness(
  clientSlug: string,
  noteSet: Set<string>,
): Promise<{
  score: number;
  gaps: string[];
  seedDebtCount: number;
  shallowCount: number;
  evidencePaths: string[];
}> {
  const gaps: string[] = [];
  const evidencePaths: string[] = [];
  let complete = 0;
  let seedDebtCount = 0;
  let shallowCount = 0;

  for (const target of CANONICAL_BRAIN_TARGETS) {
    if (!noteSet.has(target)) {
      gaps.push(`Canonical brain note missing: ${target}.`);
      continue;
    }

    evidencePaths.push(target);
    const raw = (await readRaw(clientSlug, target).catch(() => null)) ?? "";
    const sections = CANONICAL_MANAGED_SECTIONS[target] ?? [];
    const hasRequiredManagedSections =
      sections.length === 0 ||
      sections.every(
        (section) =>
          raw.includes(managedSectionStart(section)) &&
          raw.includes(managedSectionEnd(section)),
      );
    const hasSeedDebt = SEED_DEBT_PATTERNS.some((pattern) => pattern.test(raw));
    const managedText =
      sections.length > 0
        ? sections.map((section) => extractManagedSection(raw, section)).join("\n")
        : "";
    const managedWordCount =
      sections.length > 0 ? countUsefulWords(managedText) : CANONICAL_NOTE_MIN_WORDS;
    const hasUsefulDepth =
      sections.length === 0 || managedWordCount >= CANONICAL_NOTE_MIN_WORDS;

    if (hasRequiredManagedSections && hasUsefulDepth && !hasSeedDebt) {
      complete++;
    } else {
      if (!hasRequiredManagedSections) {
        gaps.push(
          `Canonical brain note needs generated evidence section(s): ${target}.`,
        );
      }
      if (!hasUsefulDepth) {
        shallowCount++;
        gaps.push(
          `Canonical brain note is too shallow: ${target} has ${managedWordCount}/${CANONICAL_NOTE_MIN_WORDS} useful generated words.`,
        );
      }
    }

    if (hasSeedDebt) {
      seedDebtCount++;
      gaps.push(`Canonical brain note still has seed/template debt: ${target}.`);
    }
  }

  return {
    score: scoreRatio(complete, CANONICAL_BRAIN_TARGETS.length),
    gaps: unique(gaps),
    seedDebtCount,
    shallowCount,
    evidencePaths,
  };
}

async function inspectSynthesis(
  clientSlug: string,
  notes: string[],
  pendingReviewPath?: string,
) {
  const deliverables = notes.filter((p) => p.startsWith("wiki/deliverables/"));
  const beastCandidates = deliverables.filter((p) => /beast/i.test(path.basename(p)));
  const latestDatedBeast = beastCandidates
    .filter((p) => /^\d{4}-\d{2}-\d{2}/.test(path.basename(p)))
    .at(-1);
  const latestBeast =
    latestDatedBeast ?? beastCandidates.at(-1) ?? deliverables[deliverables.length - 1];
  const keywordMap =
    notes.find((p) => /^wiki\/keywords\/.+(map|target|keyword).+\.md$/i.test(p)) ??
    notes.find((p) => /keyword/i.test(p) && p.startsWith("wiki/keywords/"));
  const review = notes
    .filter((p) => p.startsWith("wiki/reviews/") && /brain-sweep/i.test(p))
    .at(-1);

  const gaps: string[] = [];
  const evidencePaths: string[] = [];
  let text = "";
  if (latestBeast) {
    evidencePaths.push(latestBeast);
    const raw = await readRaw(clientSlug, latestBeast).catch(() => null);
    text = stripFrontmatter(raw ?? "");
  } else {
    gaps.push("No BEAST plan deliverable exists yet.");
  }
  if (keywordMap) evidencePaths.push(keywordMap);
  else gaps.push("No keyword-to-URL map is present yet.");
  if (review) {
    evidencePaths.push(review);
  } else if (pendingReviewPath) {
    evidencePaths.push(pendingReviewPath);
  } else {
    gaps.push("No final orchestrator review note exists yet.");
  }

  let reviewText = "";
  if (review) {
    reviewText = stripFrontmatter((await readRaw(clientSlug, review).catch(() => null)) ?? "");
    const reviewLower = reviewText.toLowerCase();
    for (const term of FINAL_REVIEW_TERMS) {
      if (!reviewLower.includes(term)) {
        gaps.push(`The final review is missing ${term}.`);
      }
    }
  }

  const lower = text.toLowerCase();
  const termsFound = SYNTHESIS_TERMS.filter((term) => lower.includes(term)).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 0 && words < 2500) {
    gaps.push(
      `The strategic plan is still light (${words} words); the reference brain uses a much deeper plan.`,
    );
  }
  for (const term of SYNTHESIS_TERMS) {
    if (!lower.includes(term)) {
      gaps.push(`The synthesis is missing a clear ${term.replace(/\b\d+\b/g, "$&-day")} section.`);
    }
  }

  const score = clamp(
    Math.round(
      (latestBeast ? 25 : 0) +
        (keywordMap ? 15 : 0) +
        (review ? 10 : 0) +
        Math.min(25, words / 120) +
        (termsFound / SYNTHESIS_TERMS.length) * 25,
    ),
  );
  const finalReviewTermsFound = FINAL_REVIEW_TERMS.filter((term) =>
    reviewText.toLowerCase().includes(term),
  ).length;
  const finalReviewScore = review
    ? clamp(Math.round((finalReviewTermsFound / FINAL_REVIEW_TERMS.length) * 100))
    : pendingReviewPath
      ? 100
      : 0;
  const actionabilityScore = clamp(
    Math.round((score + finalReviewScore + (/(first action|next action)/i.test(text) ? 100 : 45)) / 3),
  );

  return {
    score,
    finalReviewScore,
    actionabilityScore,
    gaps,
    evidencePaths,
    hasAction:
      /first action|next action|acceptance/i.test(text) &&
      finalReviewScore >= 80,
    opportunities:
      (text.match(/opportunit(y|ies)|priority|quick win|growth lever/gi) ?? []).length,
    summary:
      words > 0
        ? `Latest plan has ${words} words and ${termsFound}/${SYNTHESIS_TERMS.length} required sections.`
        : "No synthesis text was found.",
  };
}

async function inspectEvidenceQuality(clientSlug: string): Promise<{
  score: number;
  sourceSpecificityScore: number;
  entryCount: number;
  sourceFamilyCount: number;
  liveOrCachedFamilies: number;
  gaps: string[];
  evidencePaths: string[];
}> {
  const gaps: string[] = [];
  const evidencePaths: string[] = [];
  let entries: Awaited<ReturnType<typeof readEvidenceLedger>> = [];
  try {
    entries = await readEvidenceLedger(clientSlug);
  } catch (err) {
    gaps.push(
      `Evidence ledger could not be read: ${err instanceof Error ? err.message : String(err)}.`,
    );
    return {
      score: 0,
      sourceSpecificityScore: 0,
      entryCount: 0,
      sourceFamilyCount: 0,
      liveOrCachedFamilies: 0,
      gaps,
      evidencePaths,
    };
  }

  if (entries.length === 0) {
    gaps.push(
      `Evidence ledger is missing or empty; Deep Ready requires at least ${DEEP_READY_MIN_EVIDENCE_ENTRIES} provenance-backed claims.`,
    );
    return {
      score: 0,
      sourceSpecificityScore: 0,
      entryCount: 0,
      sourceFamilyCount: 0,
      liveOrCachedFamilies: 0,
      gaps,
      evidencePaths,
    };
  }

  const allFamilies = new Set<string>();
  const liveOrCachedFamilySet = new Set<string>();
  let highConfidence = 0;
  for (const entry of entries) {
    if (entry.confidence === "high") highConfidence++;
    for (const p of entry.source_paths) {
      evidencePaths.push(p);
      const family = evidenceSourceFamily(p);
      allFamilies.add(family);
      if (entry.provenance === "live_api" || entry.provenance === "cached") {
        liveOrCachedFamilySet.add(family);
      }
    }
  }

  if (entries.length < DEEP_READY_MIN_EVIDENCE_ENTRIES) {
    gaps.push(
      `Evidence ledger is thin: ${entries.length}/${DEEP_READY_MIN_EVIDENCE_ENTRIES} provenance-backed claims.`,
    );
  }
  if (liveOrCachedFamilySet.size < DEEP_READY_MIN_LIVE_OR_CACHED_FAMILIES) {
    gaps.push(
      `Evidence ledger needs broader live/cached coverage: ${liveOrCachedFamilySet.size}/${DEEP_READY_MIN_LIVE_OR_CACHED_FAMILIES} source families.`,
    );
  }

  return {
    score: clamp(
      Math.round(
        Math.min(35, (entries.length / DEEP_READY_MIN_EVIDENCE_ENTRIES) * 35) +
          Math.min(
            35,
            (liveOrCachedFamilySet.size / DEEP_READY_MIN_LIVE_OR_CACHED_FAMILIES) * 35,
          ) +
          Math.min(20, (allFamilies.size / 6) * 20) +
          Math.min(10, (highConfidence / entries.length) * 10),
      ),
    ),
    sourceSpecificityScore: clamp(
      Math.round(
        Math.min(70, (allFamilies.size / 6) * 70) +
          Math.min(30, (entries.length / DEEP_READY_MIN_EVIDENCE_ENTRIES) * 30),
      ),
    ),
    entryCount: entries.length,
    sourceFamilyCount: allFamilies.size,
    liveOrCachedFamilies: liveOrCachedFamilySet.size,
    gaps,
    evidencePaths: unique(evidencePaths).slice(0, 12),
  };
}

async function listReports(clientSlug: string): Promise<string[]> {
  const reportsDir = path.join(vaultRoot(clientSlug), "reports");
  if (!fs.existsSync(reportsDir)) return [];
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(abs);
      else if (entry.name.endsWith(".html")) {
        out.push(path.posix.join("reports", path.relative(reportsDir, abs).split(path.sep).join("/")));
      }
    }
  }
  await walk(reportsDir);
  return out.sort();
}

function buildSuggestions(input: {
  status: BrainReadinessReport["status"];
  gaps: string[];
  missingDataSources: string[];
  synthesis: Awaited<ReturnType<typeof inspectSynthesis>>;
  reviewPath?: string;
  evidencePaths: string[];
}): BrainSuggestion[] {
  const suggestions: BrainSuggestion[] = [];
  if (input.missingDataSources.length > 0) {
    suggestions.push({
      id: "connect-measurement-data",
      title: "Connect measurement data",
      why_this_matters:
        "The brain can reason from crawl and page signals, but rankings, Search Console, GA4, and DataForSEO evidence are needed before it should call itself complete.",
      confidence: "high",
      effort: "medium",
      impact: "high",
      cta: {
        type: "connect_integration",
        label: "Open integrations",
        href: "/setup#integrations",
      },
    });
  }

  if (input.synthesis.score < 75) {
    suggestions.push({
      id: "deepen-beast-plan",
      title: "Deepen the BEAST plan",
      why_this_matters:
        "The current plan needs a clearer executive summary, priority opportunities, 30/60/90 roadmap, acceptance criteria, and rollback notes before handoff.",
      confidence: "medium",
      effort: "medium",
      impact: "high",
      cta: {
        type: "run_specialist",
        label: "Run BEAST planner",
        specialistId: "beast-planner",
      },
    });
  }

  if (input.gaps.some((gap) => /keyword-to-url|keyword/i.test(gap))) {
    suggestions.push({
      id: "build-keyword-map",
      title: "Build the keyword-to-URL map",
      why_this_matters:
        "Ranking work needs one canonical URL per target query so content briefs, internal links, and implementation tasks do not collide.",
      confidence: "high",
      effort: "medium",
      impact: "high",
      cta: {
        type: "run_specialist",
        label: "Run keyword researcher",
        specialistId: "keyword-researcher",
      },
    });
  }

  const reviewEvidence =
    input.reviewPath ??
    input.evidencePaths.find(
      (p) => p.startsWith("wiki/reviews/") && /brain-sweep/i.test(p),
    );
  const firstEvidence = reviewEvidence ?? input.evidencePaths.find((p) => p.startsWith("wiki/"));
  suggestions.push({
    id: input.status === "deep_ready" ? "review-brain" : "review-readiness-gaps",
    title: input.status === "deep_ready" ? "Review the completed brain" : "Review readiness gaps",
    why_this_matters:
      input.status === "deep_ready"
        ? "The orchestrator found enough structure, evidence, and synthesis for a real handoff."
        : "This shows exactly what is already useful and what still blocks a full marketing brain.",
    confidence: "high",
    effort: "low",
    impact: input.status === "deep_ready" ? "medium" : "high",
    cta: {
      type: "open_note",
      label: "Open review",
      path: firstEvidence ?? "wiki/index.md",
    },
  });

  return suggestions.slice(0, 4);
}

function humanCategory(prefix: string): string {
  return prefix.replace(/^wiki\//, "").replace(/\/$/, "").replace(/-/g, " ");
}

function stripFrontmatter(raw: string): string {
  if (!raw.trim()) return "";
  try {
    return matter(raw).content;
  } catch {
    return raw;
  }
}

function extractManagedSection(raw: string, sectionId: string): string {
  const start = managedSectionStart(sectionId);
  const end = managedSectionEnd(sectionId);
  const startIdx = raw.indexOf(start);
  const endIdx = raw.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return "";
  return raw.slice(startIdx + start.length, endIdx);
}

function countUsefulWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[`*_#>|[\](){},.:;!?/\\-]/g, " ")
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word))
    .length;
}

function evidenceSourceFamily(relativePath: string): string {
  const clean = relativePath.replace(/\\/g, "/").replace(/^wiki\//, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? clean;
}

function scoreRatio(done: number, total: number): number {
  if (total <= 0) return 0;
  return clamp(Math.round((done / total) * 100));
}

/* -------------------------------------------------------------------------- */
/* semantic review (Brain Reviewer)                                            */
/* -------------------------------------------------------------------------- */

// Display: how far the "Semantic review" dimension score drops per finding.
const REVIEW_DIM_PENALTY_HIGH = 25;
const REVIEW_DIM_PENALTY_MEDIUM = 8;
// Overall-score deduction. Conservative + capped so a flagged review
// downgrades the brain (and blocks deep_ready) without tanking the score on
// its own — the user still sees what else is solid.
const REVIEW_SCORE_PENALTY_HIGH = 8;
const REVIEW_SCORE_PENALTY_MEDIUM = 2;
const REVIEW_SCORE_PENALTY_CAP = 20;
const MAX_REVIEW_GAPS = 6;

interface ReviewInspection {
  highSeverity: number;
  mediumSeverity: number;
  /** 0..100 score for the displayed dimension row. */
  dimensionScore: number;
  /** Points subtracted from the overall readiness score. */
  penalty: number;
  summary: string;
  gaps: string[];
  reportPath?: string;
}

/**
 * Read the latest Brain Review and translate it into a readiness downgrade.
 * No review on disk = neutral (we don't penalize a brain we simply haven't
 * reviewed yet). High-severity findings drop the dimension score, deduct from
 * the overall score, and surface as gaps; they never become blockers.
 */
async function inspectBrainReview(clientSlug: string): Promise<ReviewInspection> {
  const review = await readBrainReview(clientSlug).catch(() => null);
  if (!review) {
    return {
      highSeverity: 0,
      mediumSeverity: 0,
      dimensionScore: 100,
      penalty: 0,
      summary: "No semantic review on file yet.",
      gaps: [],
    };
  }

  const dimensionScore = clamp(
    100 -
      review.high_severity * REVIEW_DIM_PENALTY_HIGH -
      review.medium_severity * REVIEW_DIM_PENALTY_MEDIUM,
  );
  const penalty = Math.min(
    REVIEW_SCORE_PENALTY_CAP,
    review.high_severity * REVIEW_SCORE_PENALTY_HIGH +
      review.medium_severity * REVIEW_SCORE_PENALTY_MEDIUM,
  );

  const gaps: string[] = [];
  const highFindings = review.findings.filter((f) => f.severity === "high");
  for (const finding of highFindings.slice(0, MAX_REVIEW_GAPS)) {
    const where = finding.note ? ` (${finding.note})` : "";
    gaps.push(`Brain Review flagged${where}: ${finding.message}`);
  }
  if (highFindings.length > MAX_REVIEW_GAPS) {
    gaps.push(
      `Brain Review flagged ${highFindings.length - MAX_REVIEW_GAPS} more high-severity issue(s) — see the review report.`,
    );
  }

  const summary =
    review.high_severity > 0
      ? `${review.high_severity} high-severity finding(s) from the Brain Reviewer — resolve before trusting the brain.`
      : review.medium_severity > 0
        ? `${review.medium_severity} medium-severity finding(s); no high-severity issues.`
        : "Semantic review passed with no actionable findings.";

  return {
    highSeverity: review.high_severity,
    mediumSeverity: review.medium_severity,
    dimensionScore,
    penalty,
    summary,
    gaps,
    ...(review.report_path ? { reportPath: review.report_path } : {}),
  };
}

function dimensionWeight(key: BrainReadinessDimension["key"]): number {
  switch (key) {
    case "structure":
      return 0.08;
    case "canonical_note_depth":
      return 0.13;
    case "data_access":
      return 0.07;
    case "evidence_quality":
      return 0.16;
    case "source_depth":
      return 0.08;
    case "source_specificity":
      return 0.08;
    case "specialist_coverage":
      return 0.1;
    case "synthesis_quality":
      return 0.14;
    case "actionability":
      return 0.06;
    case "integration_completeness":
      return 0.04;
    case "next_action_clarity":
      return 0.06;
    case "review":
      // Display-only row. Impact comes from the subtractive penalty +
      // deep_ready high-severity gate, NOT from the weighted sum (the other
      // eleven dimensions already sum to 1.0).
      return 0;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function assertVaultPathForReadiness(clientSlug: string, relativePath: string): boolean {
  return fs.existsSync(resolveVaultRelative(clientSlug, relativePath));
}
