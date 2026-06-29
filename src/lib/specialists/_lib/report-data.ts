/**
 * Structured report payloads emitted by upgraded specialists.
 *
 * Every entry in this discriminated union maps to:
 *   1. A `.data.json` sidecar persisted next to the markdown audit.
 *   2. A polished HTML report rendered by `src/lib/reports/renderer.ts`.
 *   3. Inline SVG chart blocks inside the markdown body itself
 *      (rendered by `src/components/vault/ChartBlock.tsx`).
 *
 * The `kind` and `v` fields are mandatory on every payload — they keep
 * the renderer forward-compatible when we add more chart types or v2
 * schemas later.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* shared primitives                                                           */
/* -------------------------------------------------------------------------- */

export const SeverityZ = z.enum(["high", "medium", "low", "info"]);
export type Severity = z.infer<typeof SeverityZ>;

export const SignalZ = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  severity: SeverityZ,
  /** Optional one-sentence explanation. */
  detail: z.string().optional(),
});
export type Signal = z.infer<typeof SignalZ>;

/* -------------------------------------------------------------------------- */
/* technical-auditor                                                           */
/* -------------------------------------------------------------------------- */

export const TechnicalAuditDataZ = z.object({
  kind: z.literal("technical-audit"),
  v: z.literal(1),
  url: z.string().url().optional(),
  /** Per-category 0–100 health score for the radar chart. */
  scores: z
    .object({
      crawl: z.number().min(0).max(100),
      index: z.number().min(0).max(100),
      mobile: z.number().min(0).max(100),
      cwv: z.number().min(0).max(100),
      schema: z.number().min(0).max(100),
    })
    .partial(),
  /** Severity distribution for the bar chart. */
  severity_counts: z.object({
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0).default(0),
  }),
  signals: z.array(SignalZ).max(60),
});
export type TechnicalAuditData = z.infer<typeof TechnicalAuditDataZ>;

/* -------------------------------------------------------------------------- */
/* content-strategist                                                          */
/* -------------------------------------------------------------------------- */

export const ContentAuditDataZ = z.object({
  kind: z.literal("content-audit"),
  v: z.literal(1),
  url: z.string().url().optional(),
  /** 0–100 per axis for the E-E-A-T radar. */
  eeat: z.object({
    experience: z.number().min(0).max(100),
    expertise: z.number().min(0).max(100),
    authoritativeness: z.number().min(0).max(100),
    trust: z.number().min(0).max(100),
  }),
  /** Intent-mix donut data. Sum doesn't need to equal 100 — the renderer
   *  normalises. */
  intent_mix: z.array(
    z.object({
      label: z.string().min(1),
      value: z.number().min(0),
    }),
  ),
  severity_counts: z.object({
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
  }),
  signals: z.array(SignalZ).max(60),
});
export type ContentAuditData = z.infer<typeof ContentAuditDataZ>;

/* -------------------------------------------------------------------------- */
/* keyword-researcher                                                          */
/* -------------------------------------------------------------------------- */

export const KeywordResearchDataZ = z.object({
  kind: z.literal("keyword-research"),
  v: z.literal(1),
  /** Top keywords by monthly search volume, sorted desc. */
  top_keywords: z
    .array(
      z.object({
        keyword: z.string().min(1),
        volume: z.number().int().min(0),
        difficulty: z.number().min(0).max(100).optional(),
        intent: z
          .enum([
            "informational",
            "commercial",
            "transactional",
            "navigational",
          ])
          .optional(),
      }),
    )
    .max(50),
  intent_mix: z.array(
    z.object({
      label: z.string().min(1),
      value: z.number().min(0),
    }),
  ),
});
export type KeywordResearchData = z.infer<typeof KeywordResearchDataZ>;

/* -------------------------------------------------------------------------- */
/* schema-validator                                                            */
/* -------------------------------------------------------------------------- */

export const SchemaValidationDataZ = z.object({
  kind: z.literal("schema-validation"),
  v: z.literal(1),
  /** One bar per detected entity type. */
  entities: z.array(
    z.object({
      type: z.string().min(1),
      valid: z.number().int().min(0),
      invalid: z.number().int().min(0),
      missing: z.number().int().min(0).default(0),
    }),
  ),
  signals: z.array(SignalZ).max(60),
});
export type SchemaValidationData = z.infer<typeof SchemaValidationDataZ>;

/* -------------------------------------------------------------------------- */
/* backlink-analyst                                                            */
/* -------------------------------------------------------------------------- */

export const BacklinkDataZ = z.object({
  kind: z.literal("backlinks"),
  v: z.literal(1),
  /** Histogram bins for domain rating distribution. */
  dr_distribution: z.array(
    z.object({
      bin: z.string().min(1),
      count: z.number().int().min(0),
    }),
  ),
  top_domains: z
    .array(
      z.object({
        domain: z.string().min(1),
        dr: z.number().min(0).max(100).optional(),
        links: z.number().int().min(0),
      }),
    )
    .max(25),
});
export type BacklinkData = z.infer<typeof BacklinkDataZ>;

/* -------------------------------------------------------------------------- */
/* local-seo (local-presence)                                                  */
/* -------------------------------------------------------------------------- */

export const LocalPresenceDataZ = z.object({
  kind: z.literal("local-presence"),
  v: z.literal(1),
  /** 0–100 GBP completeness score for the gauge. */
  gbp_completeness: z.number().min(0).max(100),
  /** Per-citation NAP status, used for the consistency bars. */
  nap_signals: z
    .array(
      z.object({
        name: z.string().min(1),
        status: z.enum(["match", "mismatch", "missing"]),
      }),
    )
    .max(40),
  signals: z.array(SignalZ).max(60),
});
export type LocalPresenceData = z.infer<typeof LocalPresenceDataZ>;

/* -------------------------------------------------------------------------- */
/* google-suite (page-speed)                                                   */
/* -------------------------------------------------------------------------- */

const CwvBlockZ = z.object({
  lcp_ms: z.number().min(0),
  inp_ms: z.number().min(0),
  cls: z.number().min(0),
});

export const PageSpeedDataZ = z.object({
  kind: z.literal("page-speed"),
  v: z.literal(1),
  url: z.string().url().optional(),
  cwv: z.object({
    mobile: CwvBlockZ,
    desktop: CwvBlockZ,
  }),
  lighthouse_score: z.number().min(0).max(100).optional(),
  signals: z.array(SignalZ).max(60),
});
export type PageSpeedData = z.infer<typeof PageSpeedDataZ>;

/* -------------------------------------------------------------------------- */
/* sxo-analyst (sxo-scoring)                                                   */
/* -------------------------------------------------------------------------- */

export const SxoScoringDataZ = z.object({
  kind: z.literal("sxo-scoring"),
  v: z.literal(1),
  personas: z
    .array(
      z.object({
        name: z.string().min(1),
        score: z.number().min(0).max(100),
        gaps: z.array(z.string()).max(20).default([]),
      }),
    )
    .max(8),
  signals: z.array(SignalZ).max(60),
});
export type SxoScoringData = z.infer<typeof SxoScoringDataZ>;

/* -------------------------------------------------------------------------- */
/* page-analyzer (page-analysis)                                               */
/* -------------------------------------------------------------------------- */

export const PageAnalysisDataZ = z.object({
  kind: z.literal("page-analysis"),
  v: z.literal(1),
  url: z.string().url().optional(),
  severity_counts: z.object({
    high: z.number().int().min(0),
    medium: z.number().int().min(0),
    low: z.number().int().min(0),
    info: z.number().int().min(0).default(0),
  }),
  signals: z.array(SignalZ).max(80),
});
export type PageAnalysisData = z.infer<typeof PageAnalysisDataZ>;

/* -------------------------------------------------------------------------- */
/* sitemap-architect (sitemap-validation)                                      */
/* -------------------------------------------------------------------------- */

export const SitemapValidationDataZ = z.object({
  kind: z.literal("sitemap-validation"),
  v: z.literal(1),
  templates: z
    .array(
      z.object({
        name: z.string().min(1),
        count: z.number().int().min(0),
      }),
    )
    .max(20),
  gate_results: z
    .array(
      z.object({
        name: z.string().min(1),
        pass: z.boolean(),
        note: z.string().optional(),
      }),
    )
    .max(20),
  signals: z.array(SignalZ).max(60),
});
export type SitemapValidationData = z.infer<typeof SitemapValidationDataZ>;

/* -------------------------------------------------------------------------- */
/* google-search-console                                                       */
/* -------------------------------------------------------------------------- */

export const SearchConsoleReportDataZ = z.object({
  kind: z.literal("search-console-report"),
  v: z.literal(1),
  site_url: z.string().optional(),
  top_queries: z
    .array(
      z.object({
        query: z.string().min(1),
        clicks: z.number().int().min(0),
        impressions: z.number().int().min(0),
        ctr: z.number().min(0).max(1),
        position: z.number().min(0),
      }),
    )
    .max(25),
  top_pages: z
    .array(
      z.object({
        url: z.string().min(1),
        clicks: z.number().int().min(0),
        impressions: z.number().int().min(0),
      }),
    )
    .max(25),
  /** Per-day timeseries for the clicks sparkline. */
  trend: z
    .array(
      z.object({
        date: z.string().min(1),
        clicks: z.number().int().min(0),
      }),
    )
    .max(90),
  signals: z.array(SignalZ).max(40).default([]),
});
export type SearchConsoleReportData = z.infer<typeof SearchConsoleReportDataZ>;

/* -------------------------------------------------------------------------- */
/* google-analytics (ga4-report)                                               */
/* -------------------------------------------------------------------------- */

export const Ga4ReportDataZ = z.object({
  kind: z.literal("ga4-report"),
  v: z.literal(1),
  property_id: z.string().optional(),
  totals: z.object({
    users: z.number().int().min(0),
    sessions: z.number().int().min(0),
    engaged_sessions: z.number().int().min(0),
    conversions: z.number().int().min(0),
  }),
  channels: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.number().min(0),
      }),
    )
    .max(15),
  landing_pages: z
    .array(
      z.object({
        path: z.string().min(1),
        sessions: z.number().int().min(0),
      }),
    )
    .max(25),
  realtime_users: z.number().int().min(0).optional(),
  signals: z.array(SignalZ).max(40).default([]),
});
export type Ga4ReportData = z.infer<typeof Ga4ReportDataZ>;

/* -------------------------------------------------------------------------- */
/* union + helpers                                                             */
/* -------------------------------------------------------------------------- */

export const ReportDataZ = z.discriminatedUnion("kind", [
  TechnicalAuditDataZ,
  ContentAuditDataZ,
  KeywordResearchDataZ,
  SchemaValidationDataZ,
  BacklinkDataZ,
  LocalPresenceDataZ,
  PageSpeedDataZ,
  SxoScoringDataZ,
  PageAnalysisDataZ,
  SitemapValidationDataZ,
  SearchConsoleReportDataZ,
  Ga4ReportDataZ,
]);
export type ReportData = z.infer<typeof ReportDataZ>;

/** Parse-or-null. Specialists call this on the model's emitted JSON; on
 *  failure they fall back to writing the markdown without the sidecar +
 *  report so the user still sees prose. */
export function safeParseReportData(value: unknown): ReportData | null {
  const result = ReportDataZ.safeParse(value);
  return result.success ? result.data : null;
}
