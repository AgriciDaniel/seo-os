/**
 * Catalog of every specialist SEO Office knows about — both the TS-implemented
 * ones registered with the orchestrator today and the vendored claude-seo
 * skills awaiting a TS port.
 *
 * The runtime registry in `src/lib/orchestrator/registry.ts` is the source of
 * truth for what actually *runs*. This file is for documentation, the setup
 * wizard, and the dashboard "what's available" view.
 */

export type SpecialistStatus = "ready" | "coming-soon";

export interface SpecialistMeta {
  id: string;
  name: string;
  blurb: string;
  status: SpecialistStatus;
  /** integration IDs (from INTEGRATIONS) that this specialist can use */
  uses?: string[];
  /** subset of `uses` that the specialist refuses to run without */
  requires?: string[];
  /** R9 canonical declaration: integrations required before dispatch. */
  requiredIntegrations: string[];
  /** R9 canonical declaration: integrations that can degrade output if absent. */
  optionalIntegrations: string[];
}

type SpecialistDefinition = Omit<
  SpecialistMeta,
  "requiredIntegrations" | "optionalIntegrations"
>;

const SPECIALIST_DEFINITIONS: SpecialistDefinition[] = [
  /* ------------------------------------------------------------------------ */
  /* READY — TS-implemented, currently registered with the orchestrator        */
  /* ------------------------------------------------------------------------ */
  {
    id: "technical-auditor",
    name: "Technical Auditor",
    blurb:
      "Crawlability, indexability, meta, schema, mobile, Core Web Vitals — the full technical pass.",
    status: "ready",
    uses: ["google", "dataforseo"],
  },
  {
    id: "content-strategist",
    name: "Content Strategist",
    blurb:
      "Content quality, E-E-A-T signals, AI-citation readiness, thin-content detection.",
    status: "ready",
  },
  {
    id: "schema-validator",
    name: "Schema Validator",
    blurb:
      "Detect, validate, and generate Schema.org JSON-LD for rich-result eligibility.",
    status: "ready",
  },
  {
    id: "keyword-researcher",
    name: "Keyword Researcher",
    blurb:
      "Volume, difficulty, intent, SERP analysis, keyword clustering. Needs DataForSEO for live data.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "beast-planner",
    name: "Beast Planner",
    blurb:
      "Strategic SEO plan with industry-aware templates, content strategy, and a phased roadmap.",
    status: "ready",
  },
  {
    id: "brand-strategist",
    name: "Brand Strategist",
    blurb:
      "Brand voice, positioning, competitive differentiation, and on-site brand-signal audit.",
    status: "ready",
  },
  {
    id: "phase-gate",
    name: "Phase Gate",
    blurb:
      "Read-only Deep Brain checkpoint between phases: lint, canonical debt, evidence quality, data access, and next-action clarity.",
    status: "ready",
  },

  /* ------------------------------------------------------------------------ */
  /* v0.1.7 — ported to TS and registered with the orchestrator                */
  /* ------------------------------------------------------------------------ */

  // Phase 1 — pure-LLM (no external API)
  {
    id: "sitemap-architect",
    name: "Sitemap Architect",
    blurb:
      "Validate existing XML sitemaps or generate from industry templates with quality gates.",
    status: "ready",
  },
  {
    id: "hreflang-auditor",
    name: "Hreflang Auditor",
    blurb:
      "International SEO: validate and generate hreflang. Catches the common mistakes.",
    status: "ready",
  },
  {
    id: "page-analyzer",
    name: "Page Analyzer",
    blurb:
      "Deep single-page SEO across on-page, content, meta, schema, images, and performance.",
    status: "ready",
  },
  {
    id: "flow-framework",
    name: "FLOW Framework",
    blurb:
      "Find → Leverage → Optimize → Win loop applied to a topic or the site as a whole.",
    status: "ready",
  },
  {
    id: "programmatic-strategist",
    name: "Programmatic Strategist",
    blurb:
      "Template-driven pages at scale with anti-thin-content safeguards and index-bloat prevention.",
    status: "ready",
  },

  // Phase 2 — DataForSEO-backed
  {
    id: "topic-clusterer",
    name: "Topic Clusterer",
    blurb:
      "SERP-overlap clustering, hub-and-spoke content architecture, internal-link matrix.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "content-brief-generator",
    name: "Content Brief Generator",
    blurb:
      "Competitive briefs with per-section word counts, keyword density, and page-type templates.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "competitor-pages",
    name: "Competitor Pages",
    blurb:
      "Generate 'X vs Y', 'alternatives to X', and feature-matrix pages with schema and CRO.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "ecommerce-analyst",
    name: "E-commerce SEO",
    blurb:
      "Product schema, Google Shopping visibility, Amazon marketplace intel, competitor pricing.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "geo-specialist",
    name: "GEO Specialist",
    blurb:
      "Optimize for AI Overviews, ChatGPT, Perplexity, and Bing Copilot. Brand mention signals.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "local-seo",
    name: "Local SEO",
    blurb:
      "Google Business Profile, NAP consistency, citations, review signals, local schema.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "maps-intelligence",
    name: "Maps Intelligence",
    blurb:
      "Geo-grid rank tracking, GBP audit, cross-platform NAP verification, competitor radius mapping.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },
  {
    id: "sxo-analyst",
    name: "SXO Analyst",
    blurb:
      "Read Google SERPs backward to detect page-type mismatches, derive user stories, score personas.",
    status: "ready",
    uses: ["dataforseo"],
    requires: ["dataforseo"],
  },

  // Phase 3 — multi-source / standalone
  {
    id: "backlink-analyst",
    name: "Backlink Analyst",
    blurb:
      "DA, anchor text distribution, toxic-link detection. Falls back DataForSEO → Bing.",
    status: "ready",
    uses: ["dataforseo", "bing"],
  },
  {
    id: "image-auditor",
    name: "Image Auditor",
    blurb:
      "Alt text, formats (WebP/AVIF), responsive srcset, lazy loading, CLS, image SERP rankings.",
    status: "ready",
    uses: ["dataforseo"],
  },
  {
    id: "drift-monitor",
    name: "Drift Monitor",
    blurb:
      "Baseline SEO-critical elements and detect regressions over time. Git-style diff for SEO.",
    status: "ready",
  },
  {
    id: "technical-deep-auditor",
    name: "Technical SEO (deep)",
    blurb:
      "9-category technical audit including JS rendering, IndexNow, and security headers.",
    status: "ready",
  },

  // v0.1.9 — vault health
  {
    id: "vault-linter",
    name: "Vault Linter",
    blurb:
      "Audits the client vault for schema drift, dead wikilinks, unresolved {{tokens}}, manifest location, and duplicate stems.",
    status: "ready",
  },
  // v0.1.10 — vault snapshots before destructive ops
  {
    id: "vault-archiver",
    name: "Vault Archiver",
    blurb:
      "Snapshots the entire vault to .seo-office/archives/ before destructive operations. Use immediately before rescaffolds, mass prunes, or schema migrations.",
    status: "ready",
  },
  // Secretary's semantic double-check
  {
    id: "brain-reviewer",
    name: "Brain Reviewer",
    blurb:
      "Semantic double-check of the built brain: hunts hallucinations, unbacked claims, cross-note contradictions, shallow prose, and unjustified confidence. Flags and downgrades readiness; never blocks. Runs automatically after a build-brain sweep and on demand.",
    status: "ready",
  },

  // Phase 4 — heavy / orchestrator
  {
    id: "image-generator",
    name: "Image Generator",
    blurb:
      "AI-generated OG, hero, schema, and product images via Gemini. Used during deliverable export.",
    status: "ready",
    uses: ["google-ai"],
    requires: ["google-ai"],
  },
  {
    id: "google-suite",
    name: "Google Suite",
    blurb:
      "PageSpeed Insights + CrUX field data. Search Console + GA4 require OAuth and ship later.",
    status: "ready",
    uses: ["google"],
    requires: ["google"],
  },
  {
    id: "google-search-console",
    name: "Search Console",
    blurb:
      "Top queries, top pages, sitemap status, URL inspection. OAuth via gcloud CLI — no API key needed.",
    status: "ready",
    uses: ["google-cloud"],
    requires: ["google-cloud"],
  },
  {
    id: "google-analytics",
    name: "Google Analytics 4",
    blurb:
      "Traffic, landing pages, channel breakdown, real-time. OAuth via gcloud CLI — auto-discovers your property.",
    status: "ready",
    uses: ["google-cloud"],
    requires: ["google-cloud"],
  },
  {
    id: "full-site-audit",
    name: "Full Site Audit",
    blurb:
      "Orchestrates technical, page, schema, content, sitemap, hreflang, and Google sub-audits into one executive report.",
    status: "ready",
    uses: ["google", "dataforseo"],
  },
];

export const SPECIALISTS: SpecialistMeta[] = SPECIALIST_DEFINITIONS.map((meta) => {
  const requiredIntegrations = meta.requires ?? [];
  const optionalIntegrations = (meta.uses ?? []).filter(
    (id) => !requiredIntegrations.includes(id),
  );
  return {
    ...meta,
    requiredIntegrations,
    optionalIntegrations,
  };
});

export const READY_SPECIALISTS = SPECIALISTS.filter((s) => s.status === "ready");
export const UPCOMING_SPECIALISTS = SPECIALISTS.filter(
  (s) => s.status === "coming-soon",
);
