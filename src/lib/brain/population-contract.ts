import { z } from "zod";

export const DataProvenanceZ = z.enum([
  "live_api",
  "cached",
  "manual",
  "model_estimate",
]);
export type DataProvenance = z.infer<typeof DataProvenanceZ>;

export const SpecialistEvidenceZ = z.object({
  claim: z.string().min(1),
  provenance: DataProvenanceZ,
  source_paths: z.array(z.string().min(1)).min(1),
  confidence: z.enum(["low", "medium", "high"]),
  cost_usd: z.number().min(0).default(0),
});
export type SpecialistEvidence = z.infer<typeof SpecialistEvidenceZ>;

export const CANONICAL_BRAIN_TARGETS = [
  "wiki/hot.md",
  "wiki/log.md",
  "wiki/index.md",
  "wiki/overview.md",
  "wiki/sources/Competitor Landscape Cache.md",
  "wiki/sources/Competitor Keyword Research Summary.md",
  "wiki/sources/DataForSEO Keyword Exports.md",
  "wiki/sources/PAA Mining Digest.md",
  "wiki/entities/Primary Competitors.md",
  "wiki/keywords/Keyword Targets and Page Map.md",
  "wiki/keywords/Keyword Cannibalization Ledger.md",
  "wiki/decisions/Keyword to URL Map.md",
  "wiki/deliverables/ULTIMATE BEAST Plan.md",
] as const;

export const CANONICAL_MANAGED_SECTIONS: Record<string, string[]> = {
  "wiki/sources/Competitor Landscape Cache.md": ["competitor-landscape"],
  "wiki/sources/Competitor Keyword Research Summary.md": ["competitor-keywords"],
  "wiki/sources/DataForSEO Keyword Exports.md": ["dataforseo-keywords"],
  "wiki/sources/PAA Mining Digest.md": ["paa-digest"],
  "wiki/entities/Primary Competitors.md": ["primary-competitors"],
  "wiki/keywords/Keyword Targets and Page Map.md": ["keyword-map"],
  "wiki/keywords/Keyword Cannibalization Ledger.md": ["keyword-cannibalization"],
  "wiki/decisions/Keyword to URL Map.md": ["keyword-url-decisions"],
  "wiki/deliverables/ULTIMATE BEAST Plan.md": ["beast-plan"],
};

export function managedSectionStart(sectionId: string): string {
  return `<!-- seo-office:${sectionId}:start -->`;
}

export function managedSectionEnd(sectionId: string): string {
  return `<!-- seo-office:${sectionId}:end -->`;
}
