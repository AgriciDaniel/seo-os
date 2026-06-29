import "server-only";

import type { SeoSignals } from "./fetch-signals";

/**
 * The six business types the marketing-brain overlays understand
 * (`vendored/marketing-brain/references/business-types/<type>.md`). These exact
 * slugs must match the overlay filenames so `applyBusinessTypeOverlay` resolves.
 */
export type BusinessType =
  | "saas"
  | "ecommerce"
  | "affiliate-content"
  | "publisher-news"
  | "lead-gen-b2b"
  | "local-seo-services";

export interface BusinessTypeGuess {
  type: BusinessType | null;
  confidence: "low" | "medium" | "high";
  signals: string[];
}

/** A scored signal: a regex over the page haystack or a JSON-LD @type match. */
interface Rule {
  type: BusinessType;
  weight: number;
  test: RegExp;
  label: string;
}

// Deterministic heuristics over the homepage signals. Intentionally simple and
// unit-testable: any reasonable classification beats the "unknown" default that
// poisons downstream SERP queries. The competitor specialist still guards
// against a null result, so a wrong-but-plausible guess is the worst case here.
const RULES: Rule[] = [
  // ecommerce
  { type: "ecommerce", weight: 3, test: /"@type"\s*:\s*"?(Product|Offer|AggregateOffer)/i, label: "Product schema" },
  { type: "ecommerce", weight: 2, test: /\b(add to cart|add to bag|checkout|free shipping|shopping cart)\b/i, label: "cart/checkout copy" },
  { type: "ecommerce", weight: 1, test: /\/(product|products|shop|store|cart|collections?)\b/i, label: "/shop|/product links" },
  // saas
  { type: "saas", weight: 3, test: /"@type"\s*:\s*"?SoftwareApplication/i, label: "SoftwareApplication schema" },
  { type: "saas", weight: 2, test: /\b(free trial|start free|sign up free|pricing plans?|per month|\/mo\b|dashboard|integrations?)\b/i, label: "trial/pricing/SaaS copy" },
  { type: "saas", weight: 1, test: /\/(pricing|signup|sign-up|login|log-in|app|dashboard|demo)\b/i, label: "/pricing|/signup links" },
  // local-seo-services
  { type: "local-seo-services", weight: 3, test: /"@type"\s*:\s*"?(LocalBusiness|Dentist|Restaurant|Plumber|Electrician|HomeAndConstructionBusiness|ProfessionalService|MedicalBusiness)/i, label: "LocalBusiness schema" },
  { type: "local-seo-services", weight: 2, test: /\b(book (an )?appointment|opening hours|call us|directions|service area|serving|walk-ins?|near me)\b/i, label: "local-services copy" },
  // publisher-news
  { type: "publisher-news", weight: 3, test: /"@type"\s*:\s*"?(NewsArticle|Article|BlogPosting|LiveBlogPosting)/i, label: "Article schema" },
  { type: "publisher-news", weight: 2, test: /\b(subscribe to our newsletter|latest stories|breaking news|read more articles|editorial team)\b/i, label: "publisher copy" },
  { type: "publisher-news", weight: 1, test: /\/(blog|article|articles|news|posts?|stories)\b/i, label: "/blog|/news links" },
  // affiliate-content
  { type: "affiliate-content", weight: 2, test: /\b(best .{0,30}\b(for|of) |top \d+ |buying guide|honest review|we may earn|as an amazon associate|affiliate (link|disclosure))\b/i, label: "affiliate/review copy" },
  // lead-gen-b2b
  { type: "lead-gen-b2b", weight: 2, test: /\b(request a demo|get a quote|contact sales|book a call|schedule a (call|consultation|demo)|talk to sales|enterprise solutions?)\b/i, label: "lead-gen/B2B copy" },
];

/**
 * Infer the business type from a page's extracted signals. Returns `type: null`
 * when no rule fires confidently — the caller should keep "unknown" and let the
 * downstream guard degrade rather than act on a fabricated type.
 */
export function inferBusinessType(signals: SeoSignals): BusinessTypeGuess {
  const haystack = [
    signals.title ?? "",
    signals.metaDescription ?? "",
    signals.h1.join(" "),
    signals.h2.join(" "),
    signals.h3.join(" "),
    signals.visibleText,
    signals.jsonLd.map((j) => `"@type":"${j.type ?? ""}"`).join(" "),
    signals.internalLinkSamples.join(" "),
  ].join("\n");

  const scores = new Map<BusinessType, number>();
  const matched = new Map<BusinessType, string[]>();
  for (const rule of RULES) {
    if (!rule.test.test(haystack)) continue;
    scores.set(rule.type, (scores.get(rule.type) ?? 0) + rule.weight);
    matched.set(rule.type, [...(matched.get(rule.type) ?? []), rule.label]);
  }

  let best: BusinessType | null = null;
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }

  // Need a meaningful signal (a schema hit or two corroborating copy/link hits)
  // before we overwrite "unknown".
  if (!best || bestScore < 2) {
    return { type: null, confidence: "low", signals: [] };
  }
  return {
    type: best,
    confidence: bestScore >= 4 ? "high" : "medium",
    signals: matched.get(best) ?? [],
  };
}
