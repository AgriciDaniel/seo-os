/**
 * Brain Review contract — the machine-readable handoff between the Reviewer
 * specialist (which writes it) and the readiness evaluator (which reads it to
 * downgrade a brain that has unresolved semantic findings).
 *
 * This is a LEAF module: it depends only on vault I/O so both the specialist
 * layer and the brain/readiness layer can import it without a cycle. The
 * Reviewer also writes a human-readable markdown report separately; THIS file
 * is the stable, overwrite-in-place source of truth (like `hot.md`) that the
 * readiness dimension keys on — no "find the latest dated note" guesswork.
 */
import "server-only";
import { z } from "zod";
import { readRaw, writeRaw } from "@/lib/brain/vault-fs";

export const BRAIN_REVIEW_PATH = "wiki/meta/brain-review.json";

/** A single semantic problem the Reviewer found in the brain. */
export const BrainReviewFindingZ = z.object({
  severity: z.enum(["high", "medium", "low"]),
  /** What class of problem — drives how the user reads it. */
  category: z.enum([
    "evidence", // a claim with no backing source / contradicted by its source
    "consistency", // two notes disagree (business_type vs competitors, etc)
    "hallucination", // fabricated competitor, impossible metric, invented fact
    "shallow", // passed the lint word-count gate but says nothing concrete
    "confidence", // confidence label not justified by the provenance
    "other",
  ]),
  /** Vault-relative note the finding is about, when localizable. */
  note: z.string().optional(),
  /** One concrete sentence: what is wrong and why it matters. */
  message: z.string().min(1),
});
export type BrainReviewFinding = z.infer<typeof BrainReviewFindingZ>;

export const BrainReviewSummaryZ = z.object({
  generated_at: z.string().min(1),
  job_id: z.string().optional(),
  model: z.string().optional(),
  /** Overall read. `clean` = nothing actionable; `needs_attention` = at
   *  least one high-severity finding the user should resolve before trusting
   *  the brain. */
  verdict: z.enum(["clean", "minor_issues", "needs_attention"]),
  high_severity: z.number().int().min(0),
  medium_severity: z.number().int().min(0),
  low_severity: z.number().int().min(0),
  findings: z.array(BrainReviewFindingZ),
  /** One-paragraph human summary mirrored into the markdown report. */
  summary: z.string().default(""),
  /** Vault-relative path of the human markdown report, when written. */
  report_path: z.string().optional(),
});
export type BrainReviewSummary = z.infer<typeof BrainReviewSummaryZ>;

/** Tally findings into a verdict + severity counts. */
export function summarizeFindings(findings: BrainReviewFinding[]): {
  verdict: BrainReviewSummary["verdict"];
  high_severity: number;
  medium_severity: number;
  low_severity: number;
} {
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;
  const verdict =
    high > 0 ? "needs_attention" : medium + low > 0 ? "minor_issues" : "clean";
  return { verdict, high_severity: high, medium_severity: medium, low_severity: low };
}

export async function writeBrainReview(
  clientSlug: string,
  summary: BrainReviewSummary,
): Promise<void> {
  const parsed = BrainReviewSummaryZ.parse(summary);
  await writeRaw(clientSlug, BRAIN_REVIEW_PATH, `${JSON.stringify(parsed, null, 2)}\n`);
}

/** Latest Brain Review, or null when none exists / the file is unreadable.
 *  Read tolerant: a corrupt file must never crash readiness. */
export async function readBrainReview(
  clientSlug: string,
): Promise<BrainReviewSummary | null> {
  const raw = await readRaw(clientSlug, BRAIN_REVIEW_PATH).catch(() => null);
  if (!raw?.trim()) return null;
  try {
    return BrainReviewSummaryZ.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
