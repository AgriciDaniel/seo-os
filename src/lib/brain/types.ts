/**
 * Brain schema — marketing-brain.v1
 *
 * Single source of truth for every vault-note frontmatter and the .manifest.json.
 * Ported from /home/agricidaniel/Desktop/marketing-brain/assets/template-brain/.
 */
import { z } from "zod";
export { toClientSlug } from "./slug";

/* -------------------------------------------------------------------------- */
/* enums                                                                       */
/* -------------------------------------------------------------------------- */

export const NoteType = z.enum([
  "meta",
  // `overview` is its own first-class type in the vendored marketing-brain
  // template (`wiki/overview.md`). It was missing from this enum, which
  // caused `Frontmatter.safeParse()` to reject the file and the indexer at
  // index-db.ts::indexDir() to silently drop it. Adding it here is the
  // single fix that unblocks `wiki/overview.md` indexing system-wide.
  "overview",
  "audit",
  "decision",
  "deliverable",
  "entity",
  "flow",
  "concept",
  "business-type-overlay",
  "keyword-strategy",
  "page-brief",
  "question",
  "source",
  "stakeholder",
]);
export type NoteType = z.infer<typeof NoteType>;

export const NoteStatus = z.enum([
  "seed",
  "active",
  "accepted",
  "archived",
  "mature",
  "needed",
  "template",
  "pending",
  "pending-day-0",
]);
export type NoteStatus = z.infer<typeof NoteStatus>;

export const Confidence = z.enum(["seed", "low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

export const ApprovalStatus = z.enum(["needs-review", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const RiskLevel = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const DataSource = z.enum(["live_api", "cached", "model_estimate", "manual"]);
export type DataSource = z.infer<typeof DataSource>;

export const ShippingStatus = z.enum([
  "pending-day-0",
  "pending-input",
  "pending-prior-flows",
  "pending-verification",
  "active",
  "blocking",
]);
export type ShippingStatus = z.infer<typeof ShippingStatus>;

/**
 * Structured rollback plan attached to every audit/deliverable note.
 *
 * Pre-Phase-3 every specialist passed a free-text `rollback_note`. Most
 * were boilerplate ("delete the file, revert log.md"), which gave the
 * user no actionable undo path when a specialist's side-effects spanned
 * multiple files or an external API. This typed envelope forces each
 * specialist to declare the SHAPE of its undo, which the linter and the
 * future "undo" UI can act on without parsing English.
 *
 * Kinds:
 *  - `no-op`            — pure analysis; nothing to undo. Reason captured
 *                         so a future reader can confirm.
 *  - `delete-file`      — single vault-relative file to remove.
 *  - `restore-snapshot` — multi-file change; a snapshot was taken first
 *                         (path to it persisted) and restoring undoes the
 *                         entire batch.
 *  - `custom`           — escape hatch. The `instructions` string is the
 *                         user's runbook; the linter flags any
 *                         `audit`/`deliverable` note that resorts to this
 *                         so we know where to invest in a structured kind.
 */
export const RollbackPlan = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("no-op"), reason: z.string().min(1) }),
  z.object({ kind: z.literal("delete-file"), path: z.string().min(1) }),
  z.object({
    kind: z.literal("restore-snapshot"),
    snapshotPath: z.string().min(1),
  }),
  z.object({ kind: z.literal("custom"), instructions: z.string().min(1) }),
]);
export type RollbackPlan = z.infer<typeof RollbackPlan>;

/* -------------------------------------------------------------------------- */
/* frontmatter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * YAML auto-parses bare `2026-05-04` as a JS Date object. We accept either
 * a YYYY-MM-DD string OR a Date and coerce to the canonical string form
 * before validation. Otherwise 75/76 vendored template files silently fail
 * validation and never make it into the SQLite index.
 */
const dateString = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
);

/** Same trick, but accepts full ISO datetimes (for `retrieved_at`). */
const isoString = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString() : v),
  z.string(),
);

/**
 * The frontmatter that every wiki note carries.
 * Optional fields are genuinely optional — many notes only use the required set.
 */
export const Frontmatter = z.object({
  brain_schema: z.literal("marketing-brain.v1"),
  type: NoteType,
  title: z.string().min(1),
  created: dateString,
  updated: dateString,
  tags: z.array(z.string()),
  status: NoteStatus,

  // optional, but very common
  owner: z.string().optional(),
  confidence: Confidence.optional(),
  approval_status: ApprovalStatus.optional(),
  risk_level: RiskLevel.optional(),
  business_type: z.string().optional(),
  related: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),

  // shipping / flow-specific
  shipping_status: ShippingStatus.optional(),
  surface: z.string().optional(),
  funnel_stage: z.string().optional(),
  impact_score: z.number().min(0).max(100).optional(),
  effort_score: z.number().min(0).max(100).optional(),
  // Canonical marketing-brain templates write `acceptance_criteria` as a
  // YAML list (every `wiki/flows/*.md`) but some legacy callers ship a
  // single string. Accept either so neither shape silently drops out of
  // the SQLite index.
  acceptance_criteria: z
    .union([z.string(), z.array(z.string())])
    .optional(),
  rollback_plan: z.string().optional(),
  rollback_note: z.string().optional(),
  verifier: z.string().optional(),
  last_verified: isoString.optional(),

  // source/provenance
  source_hash: z.string().optional(),
  source_manifest_id: z.string().optional(),
  data_sources: z.array(DataSource).optional(),
  retrieved_at: isoString.optional(),
  cost_usd: z.number().nonnegative().optional(),
  expires_on: dateString.optional(),

  // structured rollback (Phase 3.1). Optional for backwards-compatibility
  // with existing notes that only carry the free-text `rollback_note`.
  rollback: RollbackPlan.optional(),
});
export type Frontmatter = z.infer<typeof Frontmatter>;

/**
 * R3 strict brain-note frontmatter contract.
 *
 * `Frontmatter` remains the broad schema for migrations and old notes. This
 * schema is the write/read boundary for SEO Office vault notes: the standard
 * marketing-brain.v1 fields that AGENTS.md calls mandatory must be present
 * before a note is accepted by the vault I/O layer.
 */
export const BrainNoteFrontmatterSchema = Frontmatter.extend({
  owner: z.string().min(1),
  confidence: Confidence,
  approval_status: ApprovalStatus,
  risk_level: RiskLevel,
}).superRefine((frontmatter, ctx) => {
  if (frontmatter.rollback_note || frontmatter.rollback) return;
  ctx.addIssue({
    code: "custom",
    path: ["rollback_note"],
    message: 'required field "rollback_note" or structured "rollback" is missing',
  });
});
export type BrainNoteFrontmatter = z.infer<typeof BrainNoteFrontmatterSchema>;

export const BrainNoteSchema = z.object({
  path: z.string().min(1),
  frontmatter: BrainNoteFrontmatterSchema,
  body: z.string(),
});
export type BrainNote = z.infer<typeof BrainNoteSchema>;

export const ArtifactSchema = z.object({
  artifact_path: z.string().min(1),
  data_artifact_path: z.string().min(1).optional(),
  report_path: z.string().min(1).optional(),
  source_paths: z.array(z.string().min(1)).default([]),
  data_sources: z.array(DataSource).default([]),
  confidence: Confidence.exclude(["seed"]),
  cost_usd: z.number().nonnegative().optional(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const SpecialistExecutionResultSchema = z.object({
  status: z.enum(["succeeded", "partial", "skipped", "failed"]),
  artifact_path: z.string().min(1).optional(),
  data_artifact_path: z.string().min(1).optional(),
  source_paths: z.array(z.string().min(1)),
  data_sources: z.array(DataSource),
  confidence: Confidence.exclude(["seed"]),
  cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative(),
  side_effects: z.object({
    wrote: z.array(z.string().min(1)),
    appended: z.array(z.string().min(1)),
  }),
  next_actions_suggested: z
    .array(
      z.object({
        specialist_id: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .optional(),
  skip_reason: z.string().min(1).optional(),
  error: z
    .object({
      message: z.string().min(1),
      recoverable: z.boolean(),
    })
    .optional(),
});
export type SpecialistExecutionResult = z.infer<
  typeof SpecialistExecutionResultSchema
>;

export const SpecialistResultSchema = z.object({
  summary: z.string().min(1),
  resultPath: z.string().min(1).optional(),
  reportPath: z.string().min(1).optional(),
  dataPath: z.string().min(1).optional(),
  data: z.unknown().optional(),
  evidence: z.array(z.unknown()).optional(),
  degraded: z.boolean().optional(),
  degradationReason: z.string().min(1).optional(),
  executionResult: SpecialistExecutionResultSchema.optional(),
});
export type ValidatedSpecialistResult = z.infer<typeof SpecialistResultSchema>;

/* -------------------------------------------------------------------------- */
/* manifest.json                                                               */
/* -------------------------------------------------------------------------- */

export const ManifestSource = z.object({
  path: z.string(),
  hash: z.string(),
  retrieved_at: z.string(), // ISO8601
  cost_usd: z.number().nonnegative(),
});
export type ManifestSource = z.infer<typeof ManifestSource>;

/**
 * Locale used by every DataForSEO-backed specialist. Optional — defaults to
 * US/English at the resolver level. Stored on the manifest so it survives
 * across specialist invocations and across machines.
 */
export const ClientLocale = z.object({
  code: z.string().optional(),
  location_name: z.string().optional(),
  language_name: z.string().optional(),
  site_url: z.string().url().optional(),
  timezone: z.string().optional(),
});
export type ClientLocale = z.infer<typeof ClientLocale>;

export const ClientManifest = z.object({
  schema_version: z.literal("1.0"),
  vault: z.string(),
  site_under_audit: z.string().url(),
  manifest_owner: z.string(),
  last_updated: dateString,
  sources: z.record(z.string(), ManifestSource).default({}),
  locale: ClientLocale.optional(),
  locales: z.array(ClientLocale).optional(),
  business_type: z.string().optional(),
  monetization_model: z.string().optional(),
  target_persona: z.string().optional(),
  author_byline: z.string().optional(),
  github_url: z.string().url().optional(),
  measurement_access: z.array(z.string()).default([]),
  primary_competitors: z.array(z.string()).default([]),
  monthly_cost_cap_usd: z.number().nonnegative().optional(),
  // niche and site_brand are persisted in the manifest so they survive
  // rescaffolds. Both feed the vault-renderer slot dictionary so that
  // `{{niche}}` and `{{site_brand}}` placeholders in template content
  // never reach the rendered vault as literals. Optional → existing
  // manifests on disk parse fine; the renderer falls back to sensible
  // defaults when these are missing.
  niche: z.string().optional(),
  site_brand: z.string().optional(),
  // Phase-4.1 — records which marketing-brain template version produced
  // this vault. Separate from `brain_schema` (frontmatter schema): the
  // template can ship docs/sections/files that change without altering
  // the frontmatter contract. Optional for backwards-compat with
  // pre-Phase-4 vaults.
  marketing_brain_version: z.string().optional(),
});
export type ClientManifest = z.infer<typeof ClientManifest>;
export const ClientManifestSchema = ClientManifest;

/* -------------------------------------------------------------------------- */
/* primitives                                                                  */
/* -------------------------------------------------------------------------- */

/** kebab-case, 2-60 chars, [a-z0-9-].
 *  Loosened from max-40 to match canonical marketing-brain (which uses
 *  `[a-z0-9][a-z0-9-]{1,60}`). The leading/trailing-dash guard is kept —
 *  `toClientSlug()` strips edge dashes before this validator runs. */
export const ClientSlug = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "expected kebab-case slug");
export type ClientSlug = z.infer<typeof ClientSlug>;

const onboardingString = z.string().trim();

/**
 * Client creation payload accepted by the setup UI, API route, and scaffold
 * entrypoint. Keeping this in the brain type module prevents the UI/API from
 * drifting away from the vault renderer's required slot inputs.
 */
export const ClientInputSchema = z.object({
  clientName: onboardingString.min(1).max(80),
  siteUrl: onboardingString.url(),
  owner: onboardingString.min(1).max(80),
  businessType: onboardingString.min(2).max(80),
  niche: onboardingString.min(2).max(160),
  siteBrand: onboardingString.min(1).max(120),
  authorByline: onboardingString.min(1).max(160),
  monetizationModel: onboardingString.min(2).max(200),
  targetPersona: onboardingString.min(2).max(500),
  primaryCompetitors: z.array(onboardingString.min(1).max(160)).max(12).default([]),
  measurementAccess: z.array(onboardingString.min(1).max(80)).max(12).default([]),
  slug: ClientSlug.optional(),
  githubUrl: onboardingString.url().optional(),
  locale: ClientLocale.optional(),
});
export type ClientInput = z.infer<typeof ClientInputSchema>;

/**
 * Minimal intake — only the site URL is mandatory. Everything else is derived
 * server-side from the hostname (see `expandMinimalClientInput`) so the user
 * can spin up a vault in one field. DataForSEO + the discovery specialists
 * fill in the real values during the first sweep.
 */
export const MinimalClientInputSchema = z.object({
  siteUrl: onboardingString.url(),
  clientName: onboardingString.min(1).max(80).optional(),
  owner: onboardingString.min(1).max(80).optional(),
  businessType: onboardingString.min(2).max(80).optional(),
});
export type MinimalClientInput = z.infer<typeof MinimalClientInputSchema>;

/** A parsed note as it lives in the vault. */
export interface Note {
  /** path relative to the vault root, e.g. "wiki/hot.md" */
  path: string;
  frontmatter: Frontmatter;
  body: string;
}
