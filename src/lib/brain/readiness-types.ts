export type BrainReadinessStatus =
  | "draft"
  | "needs_data"
  | "partial_brain"
  | "deep_ready"
  | "blocked";

export type BrainReadinessDimensionKey =
  | "structure"
  | "canonical_note_depth"
  | "data_access"
  | "evidence_quality"
  | "source_depth"
  | "source_specificity"
  | "specialist_coverage"
  | "synthesis_quality"
  | "actionability"
  | "integration_completeness"
  | "next_action_clarity"
  | "review";

export interface BrainReadinessDimension {
  key: BrainReadinessDimensionKey;
  label: string;
  score: number;
  summary: string;
}

export type BrainSuggestionCtaType =
  | "open_note"
  | "open_report"
  | "run_specialist"
  | "connect_integration"
  | "start_next_sweep";

export interface BrainSuggestion {
  id: string;
  title: string;
  why_this_matters: string;
  confidence: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  cta: {
    type: BrainSuggestionCtaType;
    label: string;
    path?: string;
    href?: string;
    specialistId?: string;
  };
}

export interface BrainReadinessReport {
  status: BrainReadinessStatus;
  score: number;
  dimensions: BrainReadinessDimension[];
  gaps: string[];
  blockers: string[];
  missingDataSources: string[];
  evidencePaths: string[];
  reviewPath?: string;
  firstAction?: string;
  opportunitiesFound: number;
  suggestions: BrainSuggestion[];
}
