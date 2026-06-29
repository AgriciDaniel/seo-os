/**
 * Task templates — canned multi-agent fan-outs the Orchestrator can dispatch
 * via the `plan_tree` tool. Each template returns the *children* to attach
 * to a freshly-created root Task; the runner picks them up via the existing
 * `runTaskTree()` flow with `enqueue({ parallel: true })`.
 *
 * Templates use real specialist IDs sourced from
 * `src/lib/specialists/catalog.ts`. They are intentionally hand-picked (not
 * generated) so the user can read the list and know what to expect.
 */
import "server-only";

import type { ClientLocale, ClientManifest } from "@/lib/brain/types";

export interface TemplateChild {
  /** Inbox-visible title for the leaf Task. */
  title: string;
  /** Goal the specialist sees as its brief. */
  goal: string;
  /** Real specialist id (must exist in the registry). */
  specialist_id: string;
  /** Free-form payload passed to the specialist's `execute()`. */
  payload?: Record<string, unknown>;
  /** Indices into the template's own `children` array that must finish
   *  before this child becomes runnable. Resolved into Task IDs at
   *  tree-creation time. Empty = run immediately. */
  blocked_on_indices?: number[];
  /** Optional UX-only grouping label. Used by sweep templates to tell the
   *  SweepCard which phase a leaf belongs to. Ignored by the runtime. */
  phase?: "intake" | "diagnostic" | "discovery" | "synthesis" | "final";
}

export interface TaskTemplate {
  id: string;
  /** Display label. Shown in the orchestrator system prompt so it can name
   *  the template back to the user. */
  name: string;
  /** One-line description, also surfaced in the system prompt. */
  blurb: string;
  /** Root-task defaults. The orchestrator may override `title`/`goal` per
   *  user phrasing. */
  rootTitle: string;
  rootGoal: string;
  children: TemplateChild[];
  /** Optional classification stamped on the root Task. `"sweep"` triggers
   *  the SweepCard UI; absence (the default for older templates) treats it
   *  as a regular multi-specialist plan. */
  kind?: "sweep";
}

export type InstantiatedTemplateChild = TemplateChild & {
  payload?: Record<string, unknown>;
};

/**
 * `full-site-audit` — the user's flagship "do a full site audit" intent.
 *
 * Fans out 10 read-only specialists in parallel. No dependency edges; each
 * runs against the site independently. The vault-mirrored Task plan note
 * gives the user a single-pane view of progress.
 */
export const FULL_SITE_AUDIT: TaskTemplate = {
  id: "full-site-audit",
  name: "Full site audit",
  blurb:
    "Parallel fan-out of 10 specialists covering technical, content, schema, " +
    "keywords, backlinks, local, performance, SXO, single-page, and sitemap.",
  rootTitle: "Full site audit",
  rootGoal:
    "Run a parallel multi-specialist audit covering technical health, " +
    "content quality, structured data, keyword opportunity, backlinks, " +
    "local presence, page performance, search-experience match, single-page " +
    "deep dive, and sitemap. Each specialist writes its own report; the " +
    "Orchestrator synthesises later.",
  children: [
    {
      title: "Technical SEO audit",
      goal: "Crawlability, indexability, meta, schema, mobile, CWV signals.",
      specialist_id: "technical-auditor",
    },
    {
      title: "Content strategy audit",
      goal: "Content quality, E-E-A-T signals, AI-citation readiness, thin-content detection.",
      specialist_id: "content-strategist",
    },
    {
      title: "Schema validation",
      goal: "Detect, validate, and recommend Schema.org JSON-LD additions for rich-result eligibility.",
      specialist_id: "schema-validator",
    },
    {
      title: "Keyword opportunity scan",
      goal: "Volume, difficulty, intent, SERP analysis, and clustering for the site's commercial pages.",
      specialist_id: "keyword-researcher",
    },
    {
      title: "Backlink profile snapshot",
      goal: "Referring domains, anchor-text distribution, toxic-link flags.",
      specialist_id: "backlink-analyst",
    },
    {
      title: "Local SEO presence",
      goal: "GBP signals, NAP consistency, citations, review intel, local schema.",
      specialist_id: "local-seo",
    },
    {
      title: "Page performance + field data",
      goal: "PageSpeed Insights + CrUX field data for the homepage and top commercial pages.",
      specialist_id: "google-suite",
    },
    {
      title: "Search-experience match",
      goal: "Read the SERPs backwards: detect page-type mismatches, score from persona perspectives.",
      specialist_id: "sxo-analyst",
    },
    {
      title: "Homepage deep-page audit",
      goal: "Single-page SEO across on-page, content, meta, schema, images, performance.",
      specialist_id: "page-analyzer",
    },
    {
      title: "Sitemap audit",
      goal: "Validate XML sitemaps against quality gates and recommend fixes or new templates.",
      specialist_id: "sitemap-architect",
    },
  ],
};

/**
 * `keyword-deep-dive` — when the user asks for "keyword research" beyond
 * just opportunity scanning. Five specialists, dependency-aware: the
 * cluster-builder + brief-generator wait on the researcher's first pass.
 */
export const KEYWORD_DEEP_DIVE: TaskTemplate = {
  id: "keyword-deep-dive",
  name: "Keyword deep dive",
  blurb:
    "Sequenced fan-out: keyword research feeds clustering, briefs, and " +
    "competitor-page generation; SXO runs in parallel.",
  rootTitle: "Keyword deep dive",
  rootGoal:
    "Build a keyword universe and translate it into hub/spoke architecture " +
    "with content briefs, competitor pages, and SXO scoring.",
  children: [
    {
      title: "Keyword research",
      goal: "Pull volume, difficulty, intent, SERP signals for the site's commercial and informational targets.",
      specialist_id: "keyword-researcher",
    },
    {
      title: "SERP-overlap clustering",
      goal: "Group keywords into hub/spoke clusters using SERP-overlap, recommend internal-link matrix.",
      specialist_id: "topic-clusterer",
      blocked_on_indices: [0],
    },
    {
      title: "Content brief generation",
      goal: "Generate competitive content briefs with per-section word counts and keyword density for the highest-priority cluster.",
      specialist_id: "content-brief-generator",
      blocked_on_indices: [1],
    },
    {
      title: "Competitor-page templates",
      goal: "Draft 'X vs Y' and 'alternatives to X' pages targeting comparison-intent keywords surfaced in the research pass.",
      specialist_id: "competitor-pages",
      blocked_on_indices: [0],
    },
    {
      title: "Search-experience scoring",
      goal: "Score the site's existing pages against the new keyword set from a persona perspective.",
      specialist_id: "sxo-analyst",
    },
  ],
};

/**
 * `compliance-sweep` — narrow technical-and-standards check. Four
 * specialists, fully parallel.
 */
export const COMPLIANCE_SWEEP: TaskTemplate = {
  id: "compliance-sweep",
  name: "Compliance sweep",
  blurb:
    "Parallel pass over schema validity, hreflang correctness, page-speed " +
    "field data, and deep technical health.",
  rootTitle: "Compliance sweep",
  rootGoal:
    "Standards-and-correctness pass: are the structured-data, " +
    "international-targeting, performance, and deep-technical signals " +
    "in good shape?",
  children: [
    {
      title: "Schema validation",
      goal: "Validate all Schema.org JSON-LD on the site and flag rich-result blockers.",
      specialist_id: "schema-validator",
    },
    {
      title: "Hreflang audit",
      goal: "Catch the common hreflang mistakes (missing reciprocals, wrong region codes, x-default gaps).",
      specialist_id: "hreflang-auditor",
    },
    {
      title: "Performance field data",
      goal: "PageSpeed Insights + CrUX field data for top templates.",
      specialist_id: "google-suite",
    },
    {
      title: "Deep technical audit",
      goal: "9-category audit including JS rendering, IndexNow, and security headers.",
      specialist_id: "technical-deep-auditor",
    },
  ],
};

/**
 * `build-brain` — the default Deep Brain sweep. Mirrors the user's
 * marketing-brain mental model but parallelised and autonomous. The visible
 * UI groups specialists into Intake → Diagnostic → Discovery → Synthesis →
 * Final Gate, while the finalizer adds the deeper gates: source coverage,
 * synthesis quality, orchestrator review, and final user brief.
 *
 * Dependency edges keep the dispatch parallel where it can be:
 *   - Intake/source access validates vault + available first-party data.
 *   - Diagnostics run broad technical/page/schema/sitemap/performance passes.
 *   - Discovery fans out keyword, competitor, backlink, AI-search, image,
 *     brand, and content work.
 *   - Synthesis builds clusters, briefs, and the BEAST plan.
 *   - Diagnostic and Discovery both run an explicit vault-linter node before
 *     their phase gate so phase-local lint debt blocks downstream work.
 *   - Final gate runs vault-linter again so readiness sees post-sweep integrity.
 *
 * If a child specialist requires an integration that isn't configured for
 * the client (e.g. keyword-researcher requires DataForSEO), `dispatchPlanTree`
 * marks that child as `cancelled` with a `skipped: requires …` reason. The
 * brain is rebuilt partial but useful — the user can connect the integration
 * later and re-sweep to fill the gaps.
 */
export const BUILD_BRAIN_SWEEP: TaskTemplate = {
  id: "build-brain",
  name: "Deep Brain build",
  blurb:
    "Default quality-first client setup: intake validation, source ingestion, diagnostics, " +
    "opportunity discovery, synthesis, orchestrator review, and a final user brief.",
  rootTitle: "Deep Brain build",
  rootGoal:
    "Build the deep marketing brain for this client. Validate intake, ingest available sources, " +
    "run the full Diagnostic, Discovery, and Synthesis pipeline, then require the orchestrator " +
    "to review readiness before claiming the brain is complete. Specialists requiring missing " +
    "integrations must skip with a clear reason; the final status should become needs_data or draft, " +
    "not deep_ready, until the missing evidence is connected.",
  kind: "sweep",
  children: [
    /* Phase 1 — Intake and source access */
    {
      title: "Vault intake validation",
      goal: "Read the freshly scaffolded brain, validate schema/frontmatter/interlinks, and flag missing intake fields before expensive specialist work starts.",
      specialist_id: "vault-linter",
      phase: "intake",
    },
    {
      title: "Search Console source ingestion",
      goal: "Read the brain first, then pull Search Console queries, pages, sitemap status, and URL inspection evidence when Google Cloud OAuth is available. Skip cleanly when not connected.",
      specialist_id: "google-search-console",
      phase: "intake",
    },
    {
      title: "GA4 source ingestion",
      goal: "Read the brain first, then pull GA4 landing page and channel evidence when Google Cloud OAuth is available. Skip cleanly when not connected.",
      specialist_id: "google-analytics",
      phase: "intake",
    },
    {
      title: "Intake readiness gate",
      goal: "Checkpoint the intake phase before diagnostics continue. Record current lint, canonical note, evidence, data-access, and next-action readiness without mutating source evidence.",
      specialist_id: "phase-gate",
      phase: "intake",
      payload: { phase: "intake", label: "Intake" },
      // Gate on vault-linter ONLY. google-search-console (1) and
      // google-analytics (2) are optional, slow, and — critically — not read
      // by any diagnostic specialist (they fetch the page themselves). Gating
      // diagnostics behind them serialized the whole sweep behind a ~157s GSC
      // call. GSC/GA4 now run in parallel with the diagnostic wave; their
      // output is still available before discovery/synthesis consume it.
      blocked_on_indices: [0],
    },

    /* Phase 2 — Diagnostics */
    {
      title: "Technical SEO audit",
      goal: "Read the brain first, then audit crawlability, indexability, meta, schema, mobile, and CWV signals. Write evidence-backed findings and do not duplicate prior technical notes.",
      specialist_id: "technical-auditor",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Deep technical audit",
      goal: "Read the brain first, then run the deeper technical pass across JS rendering, security headers, IndexNow, rendering risks, and implementation blockers.",
      specialist_id: "technical-deep-auditor",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Schema validation",
      goal: "Read the brain first, then detect, validate, and flag rich-result blockers in the site's Schema.org JSON-LD with evidence and rollback notes.",
      specialist_id: "schema-validator",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Homepage deep audit",
      goal: "Read the brain first, then perform a homepage audit across on-page, content, meta, schema, images, and performance. Cite artifacts and avoid repeating existing work.",
      specialist_id: "page-analyzer",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Sitemap audit",
      goal: "Read the brain first, then validate XML sitemaps against quality gates and recommend fixes or templates with acceptance criteria.",
      specialist_id: "sitemap-architect",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Google performance field data",
      goal: "Read the brain first, then pull PageSpeed Insights and CrUX field data for the homepage and priority templates when the Google API key is available.",
      specialist_id: "google-suite",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Hreflang audit",
      goal: "Read the brain first, then validate international targeting, reciprocal hreflang, x-default coverage, and locale-specific indexing risks.",
      specialist_id: "hreflang-auditor",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "SEO drift baseline",
      goal: "Read the brain first, then capture an SEO drift baseline for titles, canonicals, indexability, schema, and important template signals.",
      specialist_id: "drift-monitor",
      phase: "diagnostic",
      blocked_on_indices: [3],
    },
    {
      title: "Diagnostic vault lint gate",
      goal: "Run the vault linter after diagnostic artifacts. Block discovery if diagnostic writes introduced placeholders, dead links, schema drift, or unresolved source references.",
      specialist_id: "vault-linter",
      phase: "diagnostic",
      blocked_on_indices: [4, 5, 6, 7, 8, 9, 10, 11],
    },
    {
      title: "Diagnostic readiness gate",
      goal: "Checkpoint diagnostic outputs before discovery continues. Record lint, report, canonical, evidence, and blocker status from the technical/page/schema/sitemap/performance phase.",
      specialist_id: "phase-gate",
      phase: "diagnostic",
      payload: { phase: "diagnostic", label: "Diagnostic" },
      blocked_on_indices: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    },

    /* Phase 3 — Discovery */
    {
      title: "Keyword opportunity scan",
      goal: "Read the brain first, then build or refresh the keyword-to-URL opportunity map. Use live DataForSEO evidence when available; otherwise mark the result advisory.",
      specialist_id: "keyword-researcher",
      phase: "discovery",
      // [3] not [13]: these discovery specialists read only page signals,
      // the manifest, and the vault — never the diagnostic audit artifacts —
      // so they start in the diagnostic wave instead of waiting for it. The
      // discovery-gate (28) still depends on the diagnostic-gate, so synthesis
      // remains correctly ordered after diagnostics complete.
      blocked_on_indices: [3],
    },
    {
      title: "Competitor pages",
      goal: "Read the brain first, then generate comparison and alternatives-page opportunities only where the existing brain does not already cover them.",
      specialist_id: "competitor-pages",
      phase: "discovery",
      blocked_on_indices: [14],
    },
    {
      title: "Backlink profile snapshot",
      goal: "Read the brain first, then assess referring domains, anchor text, authority gaps, and link-risk signals using available DataForSEO or Bing evidence.",
      specialist_id: "backlink-analyst",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "GEO and AI-search visibility",
      goal: "Read the brain first, then evaluate AI Overview, ChatGPT, Perplexity, and Bing Copilot citation readiness from available SERP/entity evidence.",
      specialist_id: "geo-specialist",
      phase: "discovery",
      blocked_on_indices: [14],
    },
    {
      title: "Image SEO audit",
      goal: "Read the brain first, then audit images, alt text, formats, responsive delivery, and image SERP opportunities with source-backed recommendations.",
      specialist_id: "image-auditor",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "Search-experience match",
      goal: "Read the brain first, then evaluate search-experience fit from persona and SERP intent. Surface page-type mismatches as traceable opportunities.",
      specialist_id: "sxo-analyst",
      phase: "discovery",
      blocked_on_indices: [14],
    },
    {
      title: "Brand strategy",
      goal: "Read the brain first, then synthesize brand voice, positioning, competitive differentiation, and on-site brand signals into source-backed decisions.",
      specialist_id: "brand-strategist",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "Content strategy",
      goal: "Read the brain first, then audit content quality, E-E-A-T, AI-citation readiness, and thin-content risk with evidence-backed recommendations.",
      specialist_id: "content-strategist",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "Local SEO intelligence",
      goal: "Read the brain first, then evaluate local SEO signals, citations, review posture, NAP consistency, local schema, and service-area risks with source-backed recommendations.",
      specialist_id: "local-seo",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "Maps intelligence",
      goal: "Read the brain first, then evaluate Maps visibility, local pack competitors, geo-grid opportunity, GBP evidence, and review intelligence where DataForSEO evidence is available.",
      specialist_id: "maps-intelligence",
      phase: "discovery",
      // Decoupled from local-seo (22): maps and local SEO are independent
      // verticals. Both now start in the diagnostic wave and run in parallel.
      blocked_on_indices: [3],
    },
    {
      title: "E-commerce SEO analysis",
      goal: "Read the brain first, then evaluate product/category SEO, shopping visibility, structured data, marketplace-style comparison risks, and commercial template opportunities.",
      specialist_id: "ecommerce-analyst",
      phase: "discovery",
      blocked_on_indices: [14],
    },
    {
      title: "Programmatic SEO strategy",
      goal: "Read the brain first, then evaluate whether scaled page systems are appropriate, where thin-content risk appears, and which quality gates must exist before rollout.",
      specialist_id: "programmatic-strategist",
      phase: "discovery",
      blocked_on_indices: [14, 21],
    },
    {
      title: "FLOW framework pass",
      goal: "Read the brain first, then apply Find, Leverage, Optimize, Win to connect diagnostic evidence, market opportunities, and synthesis priorities.",
      specialist_id: "flow-framework",
      phase: "discovery",
      blocked_on_indices: [3], // see keyword-researcher: no diagnostic-audit dep
    },
    {
      title: "Discovery vault lint gate",
      goal: "Run the vault linter after discovery artifacts. Block synthesis if discovery writes introduced placeholders, dead links, schema drift, or unresolved source references.",
      specialist_id: "vault-linter",
      phase: "discovery",
      blocked_on_indices: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
    },
    {
      title: "Discovery readiness gate",
      goal: "Checkpoint discovery outputs before synthesis continues. Confirm opportunity, competitor, backlink, GEO, image, SXO, brand, and content evidence is visible enough for synthesis.",
      specialist_id: "phase-gate",
      phase: "discovery",
      payload: { phase: "discovery", label: "Discovery" },
      // Includes the diagnostic-gate (13): because the independent discovery
      // specialists now start in the diagnostic wave, this gate must still
      // wait for diagnostics so synthesis (beast-planner reads EVERY artifact)
      // never runs before the diagnostic audits exist.
      blocked_on_indices: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27],
    },

    /* Phase 4 — Synthesis */
    {
      title: "SERP-overlap clustering",
      goal: "Read the brain first, then group discovered keywords into hub/spoke clusters using SERP overlap and recommend an internal-link matrix.",
      specialist_id: "topic-clusterer",
      phase: "synthesis",
      blocked_on_indices: [28],
    },
    {
      title: "Content briefs",
      goal: "Read the brain first, then generate competitive content briefs for the top cluster with acceptance criteria and links back to source evidence.",
      specialist_id: "content-brief-generator",
      phase: "synthesis",
      blocked_on_indices: [29],
    },
    {
      title: "BEAST plan",
      goal: "Read every specialist artifact and the current brain first. Produce a deep BEAST plan with executive summary, top opportunities, risks, 30/60/90 plan, first action, acceptance criteria, rollback notes, and source citations.",
      specialist_id: "beast-planner",
      phase: "synthesis",
      blocked_on_indices: [14, 21, 26, 29, 30],
    },
    {
      title: "Synthesis readiness gate",
      goal: "Checkpoint synthesis outputs before the final vault gate. Confirm clusters, briefs, BEAST plan, evidence, and next action clarity are ready for finalization.",
      specialist_id: "phase-gate",
      phase: "synthesis",
      payload: { phase: "synthesis", label: "Synthesis" },
      blocked_on_indices: [31],
    },

    /* Phase 5 — Final gate */
    {
      title: "Final vault readiness gate",
      goal: "Re-run the vault linter after all specialist writes. Confirm schema, links, unresolved tokens, canonical notes, and source references before the orchestrator finalizes readiness.",
      specialist_id: "vault-linter",
      phase: "final",
      blocked_on_indices: [32],
    },
  ],
};

export const TASK_TEMPLATES: Record<string, TaskTemplate> = {
  [FULL_SITE_AUDIT.id]: FULL_SITE_AUDIT,
  [KEYWORD_DEEP_DIVE.id]: KEYWORD_DEEP_DIVE,
  [COMPLIANCE_SWEEP.id]: COMPLIANCE_SWEEP,
  [BUILD_BRAIN_SWEEP.id]: BUILD_BRAIN_SWEEP,
};

export const TEMPLATE_IDS: string[] = Object.keys(TASK_TEMPLATES);

export function getTemplate(id: string): TaskTemplate | null {
  return TASK_TEMPLATES[id] ?? null;
}

export function instantiateTemplateChildren(input: {
  template: TaskTemplate;
  manifest?: ClientManifest | null;
}): InstantiatedTemplateChild[] {
  const children = input.template.children.map((child) => ({ ...child }));
  if (input.template.id !== BUILD_BRAIN_SWEEP.id) return children;

  const githubUrl = input.manifest?.github_url;
  if (githubUrl) {
    const brandIdx = children.findIndex(
      (child) => child.specialist_id === "brand-strategist",
    );
    if (brandIdx >= 0) {
      children[brandIdx] = {
        ...children[brandIdx],
        goal:
          `${children[brandIdx].goal} Because this client declares a GitHub repository, ` +
          "fetch README, release, star, and commit signals and treat the repo as a major open-source SEO surface.",
        payload: {
          ...(children[brandIdx].payload ?? {}),
          github_url: githubUrl,
        },
      };
    }
  }

  const locales = sweepLocales(input.manifest);
  if (locales.length <= 1) return children;

  const hreflangIdx = children.findIndex(
    (child) => child.specialist_id === "hreflang-auditor" && child.phase === "diagnostic",
  );
  if (hreflangIdx >= 0) {
    children[hreflangIdx] = {
      ...children[hreflangIdx],
      goal: `${children[hreflangIdx].goal} Declared locales: ${locales
        .map(localeLabel)
        .join(", ")}.`,
      payload: {
        ...(children[hreflangIdx].payload ?? {}),
        declared_locales: locales,
      },
    };
  }

  const diagnosticGateIdx = children.findIndex(
    (child) =>
      child.specialist_id === "phase-gate" &&
      child.phase === "diagnostic" &&
      child.payload?.phase === "diagnostic",
  );
  const discoveryGateIdx = children.findIndex(
    (child) =>
      child.specialist_id === "phase-gate" &&
      child.phase === "discovery" &&
      child.payload?.phase === "discovery",
  );
  if (diagnosticGateIdx < 0 || discoveryGateIdx < 0) return children;

  const localeChildren = locales.map((locale): InstantiatedTemplateChild => {
    const label = localeLabel(locale);
    return {
      title: `Locale content audit: ${label}`,
      goal:
        `Read the brain first, then audit content quality, E-E-A-T, AI-citation readiness, ` +
        `and thin-content risk for the ${label} locale. Compare the locale page against ` +
        `the primary market and call out translation, cannibalization, and localization gaps.`,
      specialist_id: "content-strategist",
      phase: "discovery",
      payload: { target_locale: locale },
      blocked_on_indices: [diagnosticGateIdx],
    };
  });

  const expanded = insertTemplateChildren(children, discoveryGateIdx, localeChildren);
  const expandedDiscoveryGateIdx = discoveryGateIdx + localeChildren.length;
  const discoveryGate = expanded[expandedDiscoveryGateIdx];
  if (discoveryGate) {
    expanded[expandedDiscoveryGateIdx] = {
      ...discoveryGate,
      blocked_on_indices: [
        ...(discoveryGate.blocked_on_indices ?? []),
        ...localeChildren.map((_, offset) => discoveryGateIdx + offset),
      ],
    };
  }
  return expanded;
}

export function sweepLocales(
  manifest: ClientManifest | null | undefined,
): ClientLocale[] {
  const declared = manifest?.locales?.filter(hasLocaleSignal) ?? [];
  if (declared.length > 0) return uniqueLocales(declared);
  const primary = manifest?.locale;
  return primary && hasLocaleSignal(primary) ? [primary] : [];
}

function insertTemplateChildren(
  children: InstantiatedTemplateChild[],
  index: number,
  inserted: InstantiatedTemplateChild[],
): InstantiatedTemplateChild[] {
  if (inserted.length === 0) return children;
  const count = inserted.length;
  return [
    ...children.slice(0, index),
    ...inserted,
    ...children.slice(index).map((child) => ({
      ...child,
      blocked_on_indices: shiftDependencies(child.blocked_on_indices, index, count),
    })),
  ];
}

function shiftDependencies(
  deps: number[] | undefined,
  insertedAt: number,
  count: number,
): number[] | undefined {
  if (!deps) return deps;
  return deps.map((dep) => (dep >= insertedAt ? dep + count : dep));
}

function uniqueLocales(locales: ClientLocale[]): ClientLocale[] {
  const seen = new Set<string>();
  const unique: ClientLocale[] = [];
  for (const locale of locales) {
    const key = [
      locale.code,
      locale.location_name,
      locale.language_name,
      locale.site_url,
      locale.timezone,
    ]
      .filter(Boolean)
      .join("|")
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(locale);
  }
  return unique;
}

function hasLocaleSignal(locale: ClientLocale): boolean {
  return Boolean(
    locale.code ||
      locale.location_name ||
      locale.language_name ||
      locale.site_url ||
      locale.timezone,
  );
}

function localeLabel(locale: ClientLocale): string {
  const parts = [
    locale.code,
    [locale.language_name, locale.location_name].filter(Boolean).join(" / "),
  ].filter(Boolean);
  return parts.join(" · ") || "declared locale";
}
