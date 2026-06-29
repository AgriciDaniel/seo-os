export const MARKETING_BRAIN_REQUIRED_ARTIFACTS = [
  "keyword_workbook",
  "competitor_landscape",
  "competitor_keyword_summary",
  "paa_digest",
  "visual_references",
  "primary_competitor_entities",
  "keyword_to_url_map",
  "cannibalization_ledger",
  "implementation_roadmap",
  "ultimate_beast_plan",
  "beast_pdf_or_html",
  "final_orchestrator_review",
] as const;

export type MarketingBrainRequiredArtifact =
  (typeof MARKETING_BRAIN_REQUIRED_ARTIFACTS)[number];

export const SEO_DOMAIN_COVERAGE = [
  { domain: "technical", requiredForDeepBrain: true },
  { domain: "content", requiredForDeepBrain: true },
  { domain: "schema", requiredForDeepBrain: true },
  { domain: "sitemap", requiredForDeepBrain: true },
  { domain: "performance", requiredForDeepBrain: true },
  { domain: "visual", requiredForDeepBrain: true },
  { domain: "google", requiredForDeepBrain: false },
  { domain: "dataforseo", requiredForDeepBrain: false },
  { domain: "backlinks", requiredForDeepBrain: false },
  { domain: "local", requiredForDeepBrain: false },
  { domain: "maps", requiredForDeepBrain: false },
  { domain: "geo", requiredForDeepBrain: true },
  { domain: "images", requiredForDeepBrain: true },
  { domain: "hreflang", requiredForDeepBrain: false },
  { domain: "programmatic", requiredForDeepBrain: false },
  { domain: "ecommerce", requiredForDeepBrain: false },
  { domain: "drift", requiredForDeepBrain: true },
] as const;

export type SeoDomainCoverage = (typeof SEO_DOMAIN_COVERAGE)[number];

export const SOURCE_CRITICAL_AREAS = [
  {
    area: "full-crawl",
    label: "Full crawl / Firecrawl",
    specialistIds: ["technical-deep-auditor", "sitemap-architect"],
    deferredReason:
      "Firecrawl-backed crawling is not bundled yet; the current Deep Brain gate uses technical-deep-auditor plus sitemap-architect as the runnable crawl/index coverage.",
  },
  {
    area: "visual",
    label: "Visual and rendered-page signals",
    specialistIds: ["page-analyzer", "image-auditor"],
  },
  {
    area: "performance",
    label: "Performance and Core Web Vitals",
    specialistIds: ["google-suite", "technical-auditor"],
  },
  {
    area: "dataforseo-synthesis",
    label: "DataForSEO synthesis",
    specialistIds: ["keyword-researcher", "competitor-pages", "topic-clusterer"],
  },
  {
    area: "gsc",
    label: "Google Search Console",
    specialistIds: ["google-search-console"],
  },
  {
    area: "ga4",
    label: "Google Analytics 4",
    specialistIds: ["google-analytics"],
  },
  {
    area: "backlinks",
    label: "Backlink profile",
    specialistIds: ["backlink-analyst"],
  },
  {
    area: "local",
    label: "Local SEO",
    specialistIds: ["local-seo"],
  },
  {
    area: "maps",
    label: "Maps intelligence",
    specialistIds: ["maps-intelligence"],
  },
  {
    area: "hreflang",
    label: "Hreflang",
    specialistIds: ["hreflang-auditor"],
  },
  {
    area: "images",
    label: "Image optimization",
    specialistIds: ["image-auditor"],
  },
  {
    area: "drift",
    label: "SEO drift monitoring",
    specialistIds: ["drift-monitor"],
  },
  {
    area: "programmatic",
    label: "Programmatic SEO",
    specialistIds: ["programmatic-strategist"],
  },
  {
    area: "ecommerce",
    label: "E-commerce SEO",
    specialistIds: ["ecommerce-analyst"],
  },
] as const;

export type SourceCriticalArea = (typeof SOURCE_CRITICAL_AREAS)[number];
